// Duel disks and outfits in either world (owner, 2026-11-04): every duel disk can be worn in both worlds, and so can
// the Academy outfits (ac_*, numbers 0x7f and up, series 3, the school uniforms included); the Domino outfits (dc_*,
// the QUALIFIER's Robe too, male 0x78 / female 0x75, although its PBIN row says series 1) stay in Domino. The server
// keeps the same rule (server/src/game/cosmetics-catalog.ts avatarRowWorlds). Every other slot keeps the exe's:
// series 1 (both worlds) or the world's own (2 Domino, 3 Academy).
// - avatarValidate (0x00a58cc0, stdcall (CAvatarData *, int world, bool checkSeries), ret 0xc;
//   src/Game/yo2GameManager.cpp): bytes 1-9 must name PBIN rows of their own slot and, with checkSeries, of an
//   allowed series; any failure resets the whole avatar to the world's default. The chibi renderer runs it on every
//   player it draws (in g_lobbyWorld: an Academy outfit in Domino was drawn as the default avatar), as do player
//   select and the appearance editor. With checkSeries the original runs without it (the sex, slot and colour checks,
//   ACCESSORY2 0 -> none, the reset), then the series test runs here, and a failure resets through the original.
// - CPbinDictionary::collect (0x00ad5ab0, thiscall (owned, from, to, kind, slot, series, out), ret 0x1c;
//   src/Game/yo2PlayerBin.cpp), whose only caller is the appearance editor's part list (0x008ae060: series 2 in
//   Domino, 3 in the Academy), lists the parts by the same rule.
// - CShopAvatarWindow vf10 (0x00afac40, thiscall, 4 arguments, ret 0x10), the avatar shop's list: it keeps the parts of
//   the player's kind whose series is 1 or the world's (g_gameMng+0x448), from getInfo's copy of the dictionary row.
//   For that call each clothes and disk row's series reads 1 when the rule lets it be worn in that world, else 0.
// Rank uniforms and graduated students (owner, 2026-11; server/src/game/ranking.ts). The server, which knows every
// rating and LV, enforces who may wear what (cosmetics.ts lawfulLook on every 0x4170 and appearance edit), so:
// - avatarValidate no longer checks the clothes' world when drawing: a graduated student (LV 20, ranking.ts
//   GRADUATION_LEVEL) may wear a Domino outfit in the Academy, and every other client must draw it rather than reset
//   it. Disks were already free; every other slot keeps the exe's series rule (the server's too).
// - the editor's lists come from the server's PBIN bits (0x3114). The server clears the uniforms of a school never
//   reached (unlocks follow the best school ever reached, kept for good) and sets two bits with no item (avatar_pbin
//   kind 0): PBIN_RANKED (1022) = the uniform bits are rank-authored, so the editor's LV gate
//   (CWindowDialogAvatarSwitch::refresh 0x008ae060: Ra Yellow at LV 10, Obelisk Blue at 20) is lifted for that
//   refresh; PBIN_GRADUATED (1023) = a graduated student: collect lists every owned outfit in either world. A bin
//   without PBIN_RANKED (an older server, the starter bits of a new character) keeps the LV gate.
// - the avatar shop's list keeps the world rule (the shop sells no outfits).
// RC_WORLDPARTS=0 keeps the original rule.
#include <stdlib.h>
#include "rt.h"

void o_00a58cc0(CPU *restrict c);
void o_00ad5ab0(CPU *restrict c);
void o_00afac40(CPU *restrict c);
void o_008ae060(CPU *restrict c);

#define GAME_MNG 0x012bb6b0u   // CGameMng*; its world (0 Domino, 1 Academy) at +0x448
#define APP 0x012711acu        // CApp*; its CNetAccount at +0xc68 (nodp.c, starterdeck.c)
enum { CLOTHES = 6, DUEL_DISK = 8 };
enum { PBIN_RANKED = 1022, PBIN_GRADUATED = 1023 };
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

// may a part of `slot` (its row's number and series) be worn in the world whose series is `world` (2 or 3)
static int worn(int32_t slot, uint32_t number, int32_t series, int32_t world) {
    if (slot == DUEL_DISK) return 1;
    if (slot == CLOTHES) return world == 2 || number >= 0x7f || series == 3;
    return series == 1 || series == world;
}

// may a part be DRAWN (avatarValidate): any outfit in either world, the server having checked it (a graduated
// student's Domino outfit in the Academy); never stricter than what the server lets anyone wear (worldparts_test 6)
static int drawn(int32_t slot, uint32_t number, int32_t series, int32_t world) {
    return slot == CLOTHES || worn(slot, number, series, world);
}

static int bit_at(uint32_t bits, uint32_t bit) { return ((uint8_t *)G(bits))[bit >> 3] >> (bit & 7) & 1; }

static uint32_t thiscall(CPU *c, uint32_t self, uint32_t fn, int n, const uint32_t *a) {
    CPU t = *c;
    t.ecx = self;
    return rc_call(&t, fn, n, a);
}

static void validate(CPU *c, uint32_t data, uint32_t world, uint32_t check) {   // the original, on a scratch CPU
    CPU t = *c;
    PUSHm(&t, check), PUSHm(&t, world), PUSHm(&t, data), PUSHm(&t, RC_RETURN_MAGIC);
    o_00a58cc0(&t);
}

void f_00a58cc0(CPU *restrict c) {
    uint32_t data = ARG(0), world = ARG(1);
    if (!(ARG(2) & 0xff) || !on()) {
        o_00a58cc0(c);
        return;
    }
    validate(c, data, world, 0);
    uint8_t *b = G(data + 4);
    uint32_t base = b[0] == 1 ? 0x100 : 0, dict = thiscall(c, RD32m(GAME_MNG), 0x00406fe6, 0, NULL);   // pbinDictionary
    CPU t = *c;
    t.esp -= 0x20;   // the PbinInfo, below the caller's stack
    uint32_t info = t.esp;
    int ok = 1;
    for (int i = 1; ok && i <= 9; i++) {
        uint32_t a[2] = {b[i] + base, info};
        memset(G(info), 0, PI_SIZE);
        thiscall(&t, dict, 0x004110b3, 2, a);   // getInfo(pbin, &info)
        ok = drawn(i, RD32m(info + PI_NUMBER), (int32_t)RD32m(info + PI_SERIES), (world != 0) + 2);
    }
    if (!ok) {
        b[13] = 8;   // a colour out of range: the original resets the avatar to the world's default
        validate(c, data, world, 0);
    }
    RET(3, 0);
}

void f_00ad5ab0(CPU *restrict c) {
    if (!on()) {
        o_00ad5ab0(c);
        return;
    }
    uint32_t dict = c->ecx, owned = ARG(0), from = ARG(1), to = ARG(2), out = ARG(6);
    int32_t kind = (int32_t)ARG(3), slot = (int32_t)ARG(4), world = (int32_t)ARG(5);
    uint32_t graduatedBit = PBIN_GRADUATED;
    int graduated = slot == CLOTHES && (thiscall(c, owned, 0x00406f8c, 1, &graduatedBit) & 0xff);   // a graduated student
    for (uint32_t i = from; i <= to && i < 0x400; i++) {
        uint32_t row = dict + DICT_ROWS + PI_SIZE * i;
        if (!(thiscall(c, owned, 0x00406f8c, 1, &i) & 0xff)) continue;   // CPlayerBinData::flag(pbin)
        if ((int32_t)RD32m(row + PI_KIND) != kind || (int32_t)RD32m(row + PI_SLOT) != slot) continue;
        if (!graduated && !worn(slot, RD32m(row + PI_NUMBER), (int32_t)RD32m(row + PI_SERIES), world)) continue;
        uint32_t a[3] = {RD32m(out + 8), 1, row};
        thiscall(c, out, 0x00403733, 3, a);   // out->insert(end, 1, row)
    }
    RET(7, RD32m(out + 4) != RD32m(out + 8));
}

void f_00afac40(CPU *restrict c) {
    uint32_t mng = RD32m(GAME_MNG), world = mng ? RD32m(mng + 0x448) : 2;
    if (!on() || world > 1) {   // (another world value: the exe's own odd series, left alone)
        o_00afac40(c);
        return;
    }
    uint32_t dict = thiscall(c, mng, 0x00406fe6, 0, NULL);   // pbinDictionary
    if (!dict) {
        o_00afac40(c);
        return;
    }
    static uint32_t was[0x400];
    for (uint32_t i = 0; i < 0x400; i++) {
        uint32_t row = dict + DICT_ROWS + PI_SIZE * i, slot = RD32m(row + PI_SLOT);
        was[i] = RD32m(row + PI_SERIES);
        if (slot == CLOTHES || slot == DUEL_DISK)
            WR32m(row + PI_SERIES, worn((int32_t)slot, RD32m(row + PI_NUMBER), (int32_t)was[i], (int32_t)world + 2));
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
