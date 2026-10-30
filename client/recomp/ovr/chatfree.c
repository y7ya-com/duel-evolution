// The chat without the 2008 client's word censoring or send cooldowns (owner: "just remove censoring", "is there a
// chat timeout??? fix and remove this"); the TS server does neither (it filters names only, server/src/auth/names.ts,
// and caps a connection's queue at 256 waiting messages, server/src/world.ts: a flood ceiling no typist reaches).
// - Censoring: the chat window's init (CChatWindow vf04, 0x00a75760) reads data/etc/taboo_?.txt (? the language: e,
//   g, k) a line at a time into the word set its filter checks, for lines sent and shown alike. The reader opened on
//   that file reports its end at once, so the set stays empty and nothing is censored, while the load itself still
//   succeeds (a failed one ends the game).
// - Cooldowns: the same init sets each channel's minimum gap between sends, in seconds, at +0x464 (All 30, 1: 5,
//   2: 30, 3: 3, 4: 3, 5: 1); the send (CChatWindow's mediator slot 0, 0x00a77c70) refuses a line sooner than that
//   after the last one (time() - last < gap). They are zeroed after the init: every line goes.
#include <string.h>
#include "rt.h"

void o_0052a490(CPU *restrict c);
void o_0052b540(CPU *restrict c);
void o_00a75760(CPU *restrict c);

static uint32_t taboo;   // the reader opened on taboo_?.txt

// the path argument: a VC6 std::string (0x0052a490 is yaneSDK CFile::Read(const std::string &)): _Ptr at +4
static int is_taboo(uint32_t p) {
    uint32_t q = p ? RD32m(p + 4) : 0;
    return q && strstr((const char *)G(q), "taboo_") != NULL;
}

// the reader's open (thiscall: this = the reader, the path)
void f_0052a490(CPU *restrict c) {
    uint32_t self = c->ecx, path = ARG(0);
    if (self == taboo)   // the same reader on another file (the taboo file was opened but never read)
        taboo = 0;
    if (is_taboo(path))
        taboo = self;
    o_0052a490(c);
}

// the reader's next line (thiscall: this = the reader, the line out) -> 1 at the end, 3 when nothing is open
void f_0052b540(CPU *restrict c) {
    if (c->ecx && c->ecx == taboo) {
        taboo = 0;
        RET(1, 1);
    }
    o_0052b540(c);
}

// CChatWindow's init (thiscall): then no channel has a gap between sends
void f_00a75760(CPU *restrict c) {
    uint32_t self = c->ecx;
    o_00a75760(c);
    for (int ch = 0; ch < 6; ch++)
        WR32m(self + 0x464 + 4 * ch, 0);
}
