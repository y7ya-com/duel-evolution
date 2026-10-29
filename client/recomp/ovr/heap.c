// The CRT's malloc and free (MSVC6 _heap_alloc 0xb0ce0d, free 0xb097fa). With __active_heap (0x12d4a04) = 1, the
// system heap, both are wrappers around HeapAlloc / HeapFree on _crtheap, which the runtime answers with rc_halloc /
// rc_hfree (rt/mem.c). The wrappers themselves (an SEH frame, the heap-type tests, the import call) were 5-14% of the
// main thread in every scene: operator new and delete run through them hundreds of thousands of times a scene switch.
// Here the same rc_halloc / rc_hfree calls with the same sizes, so every block, its address and its header are the
// original's. Any other heap type (the small-block heaps, 2 and 3) runs the original.
// RC_NOSPEED=1 runs the originals; RC_HEAP=compare allocates through both (freeing the original's block first: the size
// class free lists hand it straight back) and logs any address or header that differs.
#include <stdlib.h>
#include <string.h>
#include "rt.h"
#include "rc_funcs.h"
#include "win.h"

void o_00b0ce0d(CPU *restrict c), o_00b097fa(CPU *restrict c);
#define ACTIVE_HEAP 0x12d4a04u

static int mode(void) {   // 0 this, 1 the originals, 2 compared
    static int m = -1;
    if (m < 0) m = rc_nospeed ? 1 : getenv("RC_HEAP") && !strcmp(getenv("RC_HEAP"), "compare") ? 2 : 0;
    return m;
}

void f_00b0ce0d(CPU *restrict c) {   // void *_heap_alloc(size_t), cdecl
    int m = mode();
    if (m == 1 || RD32m(ACTIVE_HEAP) != 1) { o_00b0ce0d(c); return; }
    uint32_t ret = RD32m(c->esp), size = RD32m(c->esp + 4);
    uint32_t n = ((size ? size : 1) + 0xf) & ~0xfu;   // as the original rounds (wrapping, like its 32-bit add)
    if (m == 2 && n + 8 <= 16u << 11) {   // compare (small blocks: the large ones come from fresh pages)
        o_00b0ce0d(c);
        uint32_t a = c->eax, ha = a ? RD32m(a - 8) : 0, ka = a ? RD32m(a - 4) : 0;
        rc_hfree(a);
        uint32_t b = rc_halloc(n, 0);
        static unsigned calls, diffs;
        calls++;
        if ((a != b || ha != RD32m(b - 8) || ka != RD32m(b - 4)) && diffs++ < 20)
            rc_log("heap compare: malloc(%u) call %u: %08x (%u, %u) vs %08x (%u, %u)", size, calls, a, ha, ka, b,
                   RD32m(b - 8), RD32m(b - 4));
        if (!(calls & (calls - 1)) && calls >= 1024) rc_log("heap compare: %u mallocs, %u differ", calls, diffs);
        c->eax = b;
        return;   // the original's return already done
    }
    c->eax = rc_halloc(n, 0);   // HeapAlloc(_crtheap, 0, n)
    c->ret_to = ret;
    c->esp += 4;
}

void f_00b097fa(CPU *restrict c) {   // void free(void *), cdecl
    if (mode() == 1 || RD32m(ACTIVE_HEAP) != 1) { o_00b097fa(c); return; }
    uint32_t ret = RD32m(c->esp), p = RD32m(c->esp + 4);
    if (p) rc_hfree(p), c->eax = 1;   // HeapFree(_crtheap, 0, p) returns TRUE
    c->ret_to = ret;
    c->esp += 4;
}
