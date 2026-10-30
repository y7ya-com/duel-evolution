// MSVC6 <xstring>'s copy-on-write string, and the CRT memmove it moves with (crash signature #13: a memmove of -7 bytes
// from std::string::replace, after ~7.5 min of NPC duels).
// Layout: +4 _Ptr, +8 _Len, +0xc _Res; the byte before _Ptr[0] counts the other owners (0 = sole owner, 0xff = frozen).
// Every mutating member first un-shares (_Split: _Tidy(true), then assign(_Ptr) - a C-string assign, so strlen). A
// shared string holding a NUL comes out cut at the NUL. replace(pos, n, str, pos2, n2) (0x671860) takes its lengths
// before that, so its tail move, _Len - pos - n, goes negative. On Windows that is the same wild memmove.
// So here the un-share keeps _Len bytes, and the original then finds the string unshared and runs as it always did.
// The memmove guard catches any other member that does the same: a count of 2 GB or more is logged and skipped.
#include <string.h>
#include "rt.h"
#include "rc_funcs.h"

void o_00671860(CPU *restrict c), o_00b09270(CPU *restrict c);

void f_00671860(CPU *restrict c) {   // string& string::replace(pos, n, const string&, pos2, n2), thiscall, ret 0x14
    uint32_t s = c->ecx, p = RD32m(s + 4);
    uint8_t refs = p ? rc_mem[p - 1] : 0;
    if (refs && refs != 0xff) {   // _Split, keeping the length
        uint32_t len = RD32m(s + 8), one = 1, grow[2] = {len, 1};
        rc_call(c, 0x423a40, 1, &one);   // _Tidy(true): drops this owner, the old buffer stays with the others
        c->ecx = s;
        if (rc_call(c, 0x423ae0, 2, grow) & 0xff) {   // _Grow(len, true)
            uint32_t q = RD32m(s + 4);
            memcpy(G(q), G(p), len);
            WR32m(s + 8, len);
            rc_mem[q + len] = 0;
        }
        c->ecx = s;
    }
    o_00671860(c);
}

void f_00b09270(CPU *restrict c) {   // void *memmove(dst, src, n) (also memcpy), cdecl
    uint32_t n = RD32m(c->esp + 12);
    if (n >= 0x80000000u) {
        rc_log("memmove(%08x, %08x, %d) from %08x: negative count, skipped", RD32m(c->esp + 4), RD32m(c->esp + 8),
               (int32_t)n, RD32m(c->esp));
        c->eax = RD32m(c->esp + 4);
        c->ret_to = RD32m(c->esp);
        c->esp += 4;
        return;
    }
    o_00b09270(c);
}
