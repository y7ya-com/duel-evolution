// The duel field's card move (0x761970, thiscall, 3 stack args: from-word ptr, to-word ptr and one more; ret 0xc).
// For a location of kind 0xb (a per-side list of 16-byte card handles: begin +0x1c, end +0x20, the sides 0x380 apart)
// it erases the card at index (word >> 6) & 0xff, shifting the rest down until it reaches the list's end exactly. An
// index at or past the list's size (the server and the client disagree about that list) walks off the end into
// zeroed memory and traps at 0x762ce1 (live a6ac1ff, 2026-10-30 21:55Z). The 2008 client did the same.
// Here such a move is skipped (logged once), as the function's own early return skips one: that card stays drawn where
// it was until the duel's next state. Every other move runs the original.
#include "rt.h"

void o_00761970(CPU *restrict c);

void f_00761970(CPU *restrict c) {
    uint32_t field = c->ecx, from = ARG(1);
    uint32_t w = from ? (uint32_t)(rc_mem[from] | rc_mem[from + 1] << 8) : 0;
    if (from && ((w >> 1) & 0x1f) == 0xb) {
        uint32_t side = (w & 1) * 0x380, begin = RD32m(field + side + 0x1c), end = RD32m(field + side + 0x20);
        uint32_t idx = (w >> 6) & 0xff;
        if (end < begin || begin + idx * 16 >= end) {
            static int warned;
            if (!warned++) rc_log("duel move: index %u past the list (%u cards, side %u, word %04x): skipped", idx,
                                  end >= begin ? (end - begin) / 16 : 0, w & 1, w);
            RET(3, 0);
        }
    }
    o_00761970(c);
}
