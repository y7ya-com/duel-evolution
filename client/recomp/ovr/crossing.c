// One world (the server's block holds Domino's and the Academy's areas): the pier's ship sails to Duel Academy. Walking
// to the far west end of the ship's upper deck on Domino Pier (map 2, d03) lands on the Slifer Red dorm's grounds
// (map 7, a04), on the path below the sea cliff west of the dorm, and walking to the shore where that lawn meets the sea
// lands back on the quay beside the gangway.
// The boxes stay off every NPC's way: the gangway is the only way onto the deck, to Yami Marik (spot 214, by the cabin
// door) and down the deck's stairs to the lower deck's NPC (spot 49), and Jaden (spot 203) and spot 25 stand at the
// cliff's edge. Boxes there (the gangway's foot, the cliff's edge: 2fb09d2) sent everyone walking to them away.
// A map's exit i is a hitmap colour (CChibiAvatarElm::moveStep, 0xff0000ff 0xff00ffff 0xff6400ff 0xff0064ff) and leads
// to map g_fieldMaps[m].entries[i].from (DAT_00d2d4d0, 0x1a4 a map, entries at +0x104, 0x10 each: from, x, y, dir);
// arriving from map f puts the avatar at the entry whose from is f. No new art: the wall probe (FUN_00a51e70, thiscall:
// field, step, who, &colour; ret 0xc) reports exit 3's colour inside a box of each map, and exit 3 of both maps (one of
// their several arrival spots back from a duel room, from 8) is pointed at the other one. The client finds the area
// in the server's block list and enters that block (0x4202), as for any exit.
#include "rt.h"
#include "rc_funcs.h"

void o_00a51e70(CPU *restrict c);

enum { MAPS = 0xd2d4d0, MAP_SIZE = 0x1a4, ENTRIES = 0x104, EXIT = 3, EXIT_COLOUR = 0xff0064ff, PIER = 2, BEACH = 7 };

// per map: the box (avatar position, map pixels) that sails to the other map, and where in this map an arrival from
// the other one stands
static const struct { int map, x0, y0, x1, y1, to, ax, ay, adir; } kCross[] = {
    {PIER, 0, 120, 120, 185, BEACH, 700, 1110, 3},      // the upper deck's west tip; arrive beside the gangway's foot
    {BEACH, 0, 1055, 100, 1170, PIER, 330, 1100, 3},    // the shore south of the cliff; arrive on the path below it
};

static void patch_table(void) {
    for (unsigned i = 0; i < sizeof kCross / sizeof *kCross; i++) {
        uint32_t e = MAPS + kCross[i].map * MAP_SIZE + ENTRIES + EXIT * 0x10;
        WR32m(e, kCross[i].to), WR32m(e + 4, kCross[i].ax), WR32m(e + 8, kCross[i].ay), WR32m(e + 12, kCross[i].adir);
    }
}

void f_00a51e70(CPU *restrict c) {
    static int patched;
    if (!patched) patch_table(), patched = 1;
    uint32_t who = RD32m(c->esp + 8), colour = RD32m(c->esp + 12);
    o_00a51e70(c);
    uint32_t world = RD32m(0x12bb6b0), map = world ? RD32m(world + 0x98) : (uint32_t)-1;   // CGame +0x98: the map
    if (!who || !colour) return;
    float x = rc_rdf32(rc_mem + who + 0x70), y = rc_rdf32(rc_mem + who + 0x74);   // CElement::pos_
    for (unsigned i = 0; i < sizeof kCross / sizeof *kCross; i++)
        if (kCross[i].map == (int)map && x >= kCross[i].x0 && x < kCross[i].x1 && y >= kCross[i].y0 && y < kCross[i].y1) {
            WR32m(colour, EXIT_COLOUR);
            return;
        }
}
