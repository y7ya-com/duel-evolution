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

// - My Room: the lobby's CHATNOTICE (0x006bb780) drops every line while the player's rank byte (+0x9ed) reads 12, My
//   Room's. The room is part of the one server-wide chat now (server/src/game/chat.ts): the stock decoder runs with
//   the rank cleared, and the real rank goes back before it returns.
void o_006bb780(CPU *restrict c);
void f_006bb780(CPU *restrict c) {
    uint32_t self = c->ecx;
    uint8_t *rank = (uint8_t *)G(self + 0x9ed), saved = *rank;
    if (saved == 12) *rank = 0;
    o_006bb780(c);
    *rank = saved;
}

// - Proximity Chat: the server has no proximity channel (a line sent there goes to Global), so its tab (the stock
//   window's tab 1: All Chat | Proximity Chat | TRADE | Team) is hidden by its index through setTabVisible
//   (0x005f4800), once each time the game shows it. CChatWindow's tabs_: a VC6 vector of Tab (0x1c: visible u8 first)
//   with _First at +0x3e4 and _Last at +0x3e8 (src/System/window/yo2WindowChat.h).
void o_00a770a0(CPU *restrict c);
static void hide_proximity(CPU *c, uint32_t self) {
    uint32_t first = RD32m(self + 0x3e4), last = RD32m(self + 0x3e8);
    if (!first || last < first || last - first < 2 * 0x1c) return;
    if (*(uint8_t *)G(first + 0x1c)) {
        CPU call = *c; uint32_t args[2] = {1, 0}; call.ecx = self;
        rc_call(&call, 0x005f4800, 2, args);   // setTabVisible(1, false)
    }
}
// CChatWindow vf05, the per-frame chat pump (thiscall)
void f_00a770a0(CPU *restrict c) {
    hide_proximity(c, c->ecx);
    o_00a770a0(c);
}
