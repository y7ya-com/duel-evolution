// The duel field's card move (0x761970, thiscall, 3 stack args: one more, the from-word ptr, the to-word ptr; ret 0xc).
// For a location of kind 0xb (a per-side list of 16-byte card handles: begin +0x1c, end +0x20, the sides 0x380 apart)
// it erases the card at index (word >> 6) & 0xff, shifting the rest down until it reaches the list's end exactly. An
// index at or past the list's size walks off the end into
// zeroed memory and traps at 0x762ce1 (live a6ac1ff, 2026-10-30 21:55Z). The 2008 client did the same.
// The index comes from the client's own engine (view command 0x19; the engine's hand count at 0x012c888c + side * 899 * 4,
// phase2-duel), so this is the engine's hand and the view's list disagreeing. Here such a move is skipped, as the
// function's own early return skips one, and the first one logs both counts and the to-word (for the server-side cause);
// that card stays drawn where it was until the duel's next state. Every other move runs the original.
#include "rt.h"

void o_00761970(CPU *restrict c), o_00692580(CPU *restrict c);

// The last 20 duel entries the client took (YG_MSG_DUEL_SETCOMMAND 0x6202: 0x692580, fastcall, ecx = the duel object, which
// stores entry n = ++[ecx+0xb8f8] at ecx + 0x68f8 + n * 0x28: type, B, P0..P7, already decoded), for the skip's report:
// type 0 an engine command (cmd B & 0xfff, player B >> 15 & 1), 0x1c a view refresh (P3 zone, P4 index), 0x40 T_SETCARD
// (P0 side, P1 zone, P2 index).
enum { RING = 20, WORDS = 7 };
static uint32_t ring[RING][WORDS], ring_n;

void f_00692580(CPU *restrict c) {
    uint32_t obj = c->ecx;
    o_00692580(c);
    uint32_t e = obj + 0x68f8 + RD32m(obj + 0xb8f8) * 0x28, *r = ring[ring_n++ % RING];
    for (int i = 0; i < WORDS; i++) r[i] = RD32m(e + 4 * i);
}

void f_00761970(CPU *restrict c) {
    uint32_t field = c->ecx, from = ARG(1);
    uint32_t w = from ? (uint32_t)(rc_mem[from] | rc_mem[from + 1] << 8) : 0;
    if (from && ((w >> 1) & 0x1f) == 0xb) {
        uint32_t side = (w & 1) * 0x380, begin = RD32m(field + side + 0x1c), end = RD32m(field + side + 0x20);
        uint32_t idx = (w >> 6) & 0xff;
        if (end < begin || begin + idx * 16 >= end) {
            static int warned;
            uint32_t to = ARG(2), tw = to ? (uint32_t)(rc_mem[to] | rc_mem[to + 1] << 8) : 0;
            if (!warned) for (uint32_t i = ring_n > RING ? ring_n - RING : 0; i < ring_n; i++) {
                const uint32_t *r = ring[i % RING];
                rc_log("duel entry %u: type %#x B %#x P0..P4 %#x %#x %#x %#x %#x", i, r[0], r[1], r[2], r[3], r[4], r[5], r[6]);
            }
            if (!warned++) rc_log("rc_report: duel move: index %u past the view's list (%u cards; engine hand count %u), side %u, "
                                  "from %04x to %04x: skipped", idx, end >= begin ? (end - begin) / 16 : 0,
                                  RD32m(0x012c888c + (w & 1) * 899 * 4), w & 1, w, tw);
            RET(3, 0);
        }
    }
    o_00761970(c);
}
