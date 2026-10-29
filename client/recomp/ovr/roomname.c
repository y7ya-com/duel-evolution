// The room kind 1 lobby (text 0xbea, "Beginner's Lobby", FUN_00a54f90's room names: the door's room list and the
// lobby) reads just "Lobby", in the text file's language. The room letter follows it directly (the original showed
// "Beginner's LobbyA"), so the Latin words end in a space (DAT_00c7f1d0, the yaneSDK file letter of yo2text_?.bin).
// CStringDB::GetString (0x61fc40, thiscall: this, out VC6 string, index; ret 8) builds a fresh string from the table,
// so the shorter word is written over its characters (_Ptr +4, _Len +8, _Res +0xc).
#include "rt.h"
#include "rc_funcs.h"

void o_0061fc40(CPU *restrict c);

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
