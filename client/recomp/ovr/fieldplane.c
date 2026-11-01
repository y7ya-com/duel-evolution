// Crash #19 (live 0f6c48b): a duel's field plane by index, unchecked. The plane loader (CPlaneLoaderElm at 0x12a6b78) keeps
// its planes in a new[] array of 12-byte entries at +0x1c (new[]'s count just before it, at [array - 4]; 0x7d9268) and
// their names at +0x24 (8 bytes each). The duel field's plane set (0x763470, thiscall, 2 stack args, idx -1 = the field's
// own at +8) and the loader (0x7d8840, thiscall, 1 stack arg: SecretLoad of resource 9000 + idx) index both with no bound,
// and 0x7d8e70 (thiscall, 1 stack arg) the same, so a Field Spell with no 2008 plane read past the array and __RTDynamicCast took garbage for an object (an
// out-of-bounds trap). Here an index past the array becomes plane 0 (the plain field), and the first one is reported.
#include "rt.h"

void o_00763470(CPU *restrict c), o_007d8840(CPU *restrict c), o_007d8e70(CPU *restrict c);

static uint32_t planes(void) {
    uint32_t m = RD32m(0x12a6b78), a = m ? RD32m(m + 0x1c) : 0;
    return a ? RD32m(a - 4) : 0;
}

// a plane index past the array: plane 0 written over it (the arg's stack slot), the first one reported
static void bound(uint32_t slot, uint32_t idx, const char *what) {
    uint32_t n = planes();
    if (!n || idx < n) return;
    static int warned;
    // each side's Field Spell slot (the engine's field table: 0x012c88b4 + side * 0xe0c, slot 10 of 0x14 bytes; the card
    // word: internal id w & 0x3fff, 0 empty), phase2-duel: which card asked for this plane
    if (!warned++) rc_log("rc_report: field plane: %s index %d past the plane list (%u planes): plane 0 instead; field spells %#x %#x",
                          what, (int)idx, n, RD32m(0x012c88b4 + 10 * 0x14), RD32m(0x012c88b4 + 0xe0c + 10 * 0x14));
    WR32m(slot, 0);
}

void f_00763470(CPU *restrict c) {
    // idx -1 is the field's own plane (+8), which the original reads after: a bad one is fixed there
    if (ARG(1) == 0xffffffffu) {
        uint32_t own = RD32m(c->ecx + 8);
        bound(c->ecx + 8, own, "field's own");
    } else bound(c->esp + 8, ARG(1), "set");
    o_00763470(c);
}

void f_007d8840(CPU *restrict c) {
    bound(c->esp + 4, ARG(0), "load");
    o_007d8840(c);
}

void f_007d8e70(CPU *restrict c) {
    bound(c->esp + 4, ARG(0), "get");
    o_007d8e70(c);
}
