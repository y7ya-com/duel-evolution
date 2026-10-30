// The CRT memmove/memcpy (0xb09270, and its twin 0xb12890): libc's memmove, same result for every valid call.
// Crash #13: the recompiled copies dispatch through jump tables, and a table slot the recompiler missed reads 0 (an
// overlapping copy down of 20-31 bytes: "indirect jump to unknown 00000000"; cfg.py fixes the tables at the next
// regen). Here no table is involved. A count of 2 GB or more (no valid call has one) copies nothing, logged once.
#include <string.h>
#include "rt.h"
#include "rc_funcs.h"

static void copy(CPU *restrict c) {   // void *memmove(dst, src, n), cdecl
    uint32_t ret = RD32m(c->esp), dst = RD32m(c->esp + 4), src = RD32m(c->esp + 8), n = RD32m(c->esp + 12);
    static int warned;
    if (n >= 0x80000000u) {
        if (!warned++) rc_log("memmove(%08x, %08x, %d) from %08x: count over 2 GB, nothing copied", dst, src, (int32_t)n, ret);
    } else {
        memmove(G(dst), G(src), n);
    }
    c->eax = dst;
    c->ret_to = ret;
    c->esp += 4;
}

void f_00b09270(CPU *restrict c) { copy(c); }
void f_00b12890(CPU *restrict c) { copy(c); }
