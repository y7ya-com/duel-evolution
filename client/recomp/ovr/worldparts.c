// One look, any part in either world (owner, 2026-11-05): there is no Domino vs Academy split. A character has ONE
// look, drawn the same everywhere, and may wear anything it owns in either world. The server enforces ownership and
// the one rank rule, the dorm uniforms of a school not yet reached (server/src/game/ranking.ts, cosmetics.ts
// lawfulLook on every 0x4170 and appearance edit), so the client never resets or hides a part over its world: every
// series (world) test the exe makes on avatar parts is dropped.
// - avatarValidate (0x00a58cc0, stdcall (CAvatarData *, int world, bool checkSeries), ret 0xc;
//   src/Game/yo2GameManager.cpp; run by the chibi renderer on every player it draws, player select and the editor):
//   always the original with checkSeries false, i.e. no series test on any slot; the exe's own sex, slot and colour
//   checks (and ACCESSORY2 0 -> none) stay, and a failure of those still resets the avatar to the world's default.
// - CPbinDictionary::collect (0x00ad5ab0, thiscall (owned, from, to, kind, slot, series, out), ret 0x1c;
//   src/Game/yo2PlayerBin.cpp; its only caller is the appearance editor's part list): every owned part of the kind
//   and slot, whatever its series (the editor asks for 2 in Domino, 3 in the Academy).
// - CShopAvatarWindow vf10 (0x00afac40, thiscall, 4 arguments, ret 0x10), the avatar shop's list (series 1 or the
//   world's, from getInfo's copy of the dictionary row): every row's series reads 1 for the call, put back after, so
//   every row is wearable in both worlds.
// - CWindowDialogAvatarSwitch::refresh (0x008ae060): the editor's LV gate on the dorm uniforms (Ra Yellow at LV 10,
//   Obelisk Blue at 20) is lifted when the server's 0x3114 bits carry PBIN_RANKED (1022, no item): the server then
//   cleared the uniforms of a school never reached itself, so its rank bits decide. A bin without it (an older
//   server, a new character's starter bits) keeps the LV gate. PBIN_GRADUATED (1023, no item) may still be sent; it
//   changes nothing.
// RC_WORLDPARTS=0 keeps the original rule.
#include <stdlib.h>
#include "rt.h"

void o_00a58cc0(CPU *restrict c);
void o_00ad5ab0(CPU *restrict c);
void o_00afac40(CPU *restrict c);
void o_008ae060(CPU *restrict c);

#define GAME_MNG 0x012bb6b0u   // CGameMng*; its world (0 Domino, 1 Academy) at +0x448
#define APP 0x012711acu        // CApp*; its CNetAccount at +0xc68 (nodp.c, starterdeck.c)
enum { PBIN_RANKED = 1022, PBIN_GRADUATED = 1023 };   // server-set bits with no item; GRADUATED is unused
// CNetAccount: CMyUser me at +0x121c (players[4] at +0x30, 0x1a8 bytes each; activeSlot at +0x6d0); CPlayerInfo level
// at +0xa4. CWindowDialogAvatarSwitch: bin_ (CPlayerBinData, its bits at +4) at +0x748.
enum { ACC_ME = 0x121c, ME_PLAYERS = 0x30, PLAYER_SIZE = 0x1a8, ME_SLOT = 0x6d0, PLAYER_LEVEL = 0xa4, DLG_BIN = 0x748, BIN_BITS = 4 };
// PbinInfo (0x1c bytes): +4 number, +0xc kind, +0x10 slot, +0x18 series; CPbinDictionary's rows at +0x70
enum { PI_NUMBER = 4, PI_KIND = 0xc, PI_SLOT = 0x10, PI_SERIES = 0x18, PI_SIZE = 0x1c, DICT_ROWS = 0x70 };

static int on(void) {
    static int v = -1;
    if (v < 0) v = !(getenv("RC_WORLDPARTS") && !atoi(getenv("RC_WORLDPARTS")));
    return v;
}

static int bit_at(uint32_t bits, uint32_t bit) { return ((uint8_t *)G(bits))[bit >> 3] >> (bit & 7) & 1; }

static uint32_t thiscall(CPU *c, uint32_t self, uint32_t fn, int n, const uint32_t *a) {
    CPU t = *c;
    t.ecx = self;
    return rc_call(&t, fn, n, a);
}

void f_00a58cc0(CPU *restrict c) {
    if (on()) WR32m(c->esp + 12, 0);   // checkSeries false (a stdcall callee owns its arguments): no series test
    o_00a58cc0(c);
}

void f_00ad5ab0(CPU *restrict c) {
    if (!on()) {
        o_00ad5ab0(c);
        return;
    }
    uint32_t dict = c->ecx, owned = ARG(0), from = ARG(1), to = ARG(2), out = ARG(6);
    int32_t kind = (int32_t)ARG(3), slot = (int32_t)ARG(4);   // ARG(5), the series, is ignored
    for (uint32_t i = from; i <= to && i < 0x400; i++) {
        uint32_t row = dict + DICT_ROWS + PI_SIZE * i;
        if ((int32_t)RD32m(row + PI_KIND) != kind || (int32_t)RD32m(row + PI_SLOT) != slot) continue;
        if (!(thiscall(c, owned, 0x00406f8c, 1, &i) & 0xff)) continue;   // CPlayerBinData::flag(pbin)
        uint32_t a[3] = {RD32m(out + 8), 1, row};
        thiscall(c, out, 0x00403733, 3, a);   // out->insert(end, 1, row)
    }
    RET(7, RD32m(out + 4) != RD32m(out + 8));
}

void f_00afac40(CPU *restrict c) {
    uint32_t mng = RD32m(GAME_MNG), dict = on() && mng ? thiscall(c, mng, 0x00406fe6, 0, NULL) : 0;   // pbinDictionary
    if (!dict) {
        o_00afac40(c);
        return;
    }
    static uint32_t was[0x400];
    for (uint32_t i = 0; i < 0x400; i++) {
        uint32_t series = dict + DICT_ROWS + PI_SIZE * i + PI_SERIES;
        was[i] = RD32m(series);
        WR32m(series, 1);   // series 1: both worlds
    }
    o_00afac40(c);
    for (uint32_t i = 0; i < 0x400; i++) WR32m(dict + DICT_ROWS + PI_SIZE * i + PI_SERIES, was[i]);
}

// CWindowDialogAvatarSwitch::refresh (0x008ae060, thiscall, no arguments): with PBIN_RANKED in the dialog's bits, the
// active character's LV reads 255 for the call, so the exe's LV gate on Ra Yellow / Obelisk Blue removes nothing and
// the list is what collect found among the bits (the server cleared the uniforms of a school not reached). LV is
// read nowhere else in it, and it is put back before anything else runs.
void f_008ae060(CPU *restrict c) {
    uint32_t app = RD32m(APP), acc = app ? RD32m(app + 0xc68) : 0;
    uint8_t slot = acc ? *(uint8_t *)G(acc + ACC_ME + ME_SLOT) : 0xff;
    if (!on() || !c->ecx || !acc || slot >= 4 || !bit_at(c->ecx + DLG_BIN + BIN_BITS, PBIN_RANKED)) {
        o_008ae060(c);
        return;
    }
    uint8_t *level = G(acc + ACC_ME + ME_PLAYERS + PLAYER_SIZE * slot + PLAYER_LEVEL), was = *level;
    *level = 0xff;
    o_008ae060(c);
    *level = was;
}
