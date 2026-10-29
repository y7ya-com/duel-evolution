// The room kind 1 lobby (text 0xbea, "Beginner's Lobby", FUN_00a54f90's room names: the door's room list and the
// lobby) reads just "Lobby", in the text file's language. The room letter follows it directly (the original showed
// "Beginner's LobbyA"), so the Latin words end in a space (DAT_00c7f1d0, the yaneSDK file letter of yo2text_?.bin).
// CStringDB::GetString (0x61fc40, thiscall: this, out VC6 string, index; ret 8) builds a fresh string from the table,
// so the shorter word is written over its characters (_Ptr +4, _Len +8, _Res +0xc).
#include "rt.h"
#include "rc_funcs.h"

void o_0061fc40(CPU *restrict c);
void o_00a54f90(CPU *restrict c);

static const char *lobby_word(char lang) {
    switch (lang) {
    case 's': return "Sala ";
    case 'j': return "\x83\x8d\x83\x72\x81\x5b";   // cp932
    case 'k': return "\xb7\xce\xba\xf1";   // cp949
    default: return "Lobby ";   // e f g i
    }
}

void f_0061fc40(CPU *restrict c) {
    uint32_t out = RD32m(c->esp + 4), index = RD32m(c->esp + 8);
    o_0061fc40(c);
    if (index != 0xbea) return;
    const char *w = lobby_word((char)rc_mem[0xc7f1d0]);
    uint32_t p = RD32m(out + 4), n = (uint32_t)strlen(w);
    if (!p || n > RD32m(out + 0xc)) return;
    memcpy(rc_mem + p, w, n + 1);
    WR32m(out + 8, n);
}

// Whether the gate list (CNetGate, DAT_012711ac->+0xc64, vector at +0x534 as rt/gate.c reads it) has a lobby of this
// kind with another room number. Only then does a room's letter tell rooms apart; -1: no list to tell.
static int other_room(uint32_t kind, uint32_t no) {
    uint32_t net = RD32m(0x12711ac), gate = net ? RD32m(net + 0xc64) : 0;
    if (!gate || rc_mem[gate + 0x548]) return -1;
    for (uint32_t it = RD32m(gate + 0x534 + 8), end = RD32m(gate + 0x534 + 0xc); it != end; it += 8) {
        uint32_t e = RD32m(it + 4);
        if (e && RD32m(e + 8) == 3 && rc_mem[e + 0x33] == kind && rc_mem[e + 0x34] != no) return 1;
    }
    return 0;
}

// FUN_00a54f90 (cdecl: out wstring, kind, room no.; returns out) names a room: the kind's text, then the room letter
// (A for room 0, ...). A kind with one room is just its name: "Lobby", not "Lobby A". The owner: "just call it lobby".
void f_00a54f90(CPU *restrict c) {
    uint32_t out = RD32m(c->esp + 4), kind = RD32m(c->esp + 8), no = RD32m(c->esp + 12);
    o_00a54f90(c);
    if (kind == 12 || other_room(kind, no) != 0) return;   // 12: My Room, no letter
    uint32_t p = RD32m(out + 4), n = RD32m(out + 8);
    if (!p || !n) return;
    n--;   // the letter
    while (n && rc_rd16(rc_mem + p + 2 * (n - 1)) == ' ') n--;
    rc_wr16(rc_mem + p + 2 * n, 0);
    WR32m(out + 8, n);
}
