// Battle command handlers (0x0070a490..0x0070b6b0). A handler runs once per frame while g_eng.running is set,
// stepping g_eng.step, and clears running when its views are over.
#include "EngineInternal.h"

#include <cstring>
#include <initializer_list>

static EngSlot& slotAt(uint32_t j, int s) { return g_eng.pl[j & 1].slot[s]; }
static bool live(uint32_t j, int s) { return engSlotLive(j, s) && !(slotAt(j, s).flags & 4); }

// @yo2 0x0070a490 0x15 BATTLE_INIT
void engCmdBattleInit() {
    g_eng.battleState = 1;
    engPhaseCleanup();
    duelView(10, cmdPlayer(), 0, 0);
    duelView(0x25, 0, 0, 0);
    g_eng.running = 0;
}

// @yo2 0x0070a5e0 record a battle: attacker (aj, as) against (tj, ts); ts > 4 = a direct attack
void engBattleSetup(uint32_t aj, int as, uint32_t tj, int ts) {
    EngBattleSide* b = engBattle();
    EngSlot& a = slotAt(aj, as);
    g_eng.vcc3c8 = ts > 4;
    g_eng.vcc3c4 = tj;
    g_eng.vcc3ec = 0;
    g_eng.vcc3c0 = aj;
    g_eng.vcc3dc = as;
    g_eng.vcc3e0 = ts;
    g_eng.vcc3e4 = 0;
    g_eng.vcc3e8 = cardUid(a.card);
    memset(b, 0, 2 * sizeof *b);
    EngBattleSide& me = b[aj & 1];
    me.j = aj;
    me.slot = as;
    me.uid = cardUid(a.card);
    me.moves = g_eng.uid[me.uid].moves & 3;
    EngBattleSide& op = b[(1 - aj) & 1];
    op.j = tj;
    op.slot = ts;
    if (!g_eng.vcc3c8) {
        EngSlot& t = slotAt(tj, ts);
        op.uid = cardUid(t.card);
        op.moves = g_eng.uid[op.uid].moves & 3;
        engNodeFreeKeyLo(slotAt(aj, 11).head, 0x1846, 1);
        if (!t.faceUp && t.def) {   // attacking a face-down monster
            if (engSlotSources(aj, as, 0x1846)) engNodeAddSlot(aj, 11, 4, 0x1846, 0);
            switch (engCardAt(aj, as)) {
            case 0x178d: case 0x1f25:
                engNodeAddSlot(aj, 11, 4, 0x1846, 0);
                break;
            case 0x152d:
                if (aj != tj) engNodeAddSlot(aj, 11, 4, 0x1846, 0);
                break;
            case 0x1433:
                if (live(aj, as) && engCard71a270(cardId(t.card)) == 1) engNodeAddSlot(tj, ts, 4, 0x1433, 0);
                break;
            }
        }
        if (t.faceUp && engHasAttr(tj, ts, 1)) engNodeAddSlot(tj, ts, 4, 0x1e92, 0);
    }
    for (int k = 0; k < 5; k++)
        if (k != as && engCardAt(aj, k) == 0x1a79) slotAt(aj, k).value = 0;
    engSetPlayerFlag(aj, 0x12, 1);
    engSetFlag(1, 1);
    engSetSlotFlag(aj, as, 0x19, 1);
}

// @yo2 0x0070a500 0x19 attack: P0 = attacker slot, P1 = target slot << 8 | defending player, P2 != 0 = ...
void engCmdAttack() {
    uint32_t j = cmdPlayer(), tj = g_eng.cur.p1 & 0xff, ts = g_eng.cur.p1 >> 8 & 0xff;
    if (g_eng.step == 0) {
        engBattleSetup(j, g_eng.cur.p0, tj, ts);
        if (g_eng.cur.p2) engBattleTargets(engAt(0x012cc4d0));
        duelView(0xc, j | (g_eng.cur.p0 & 0xff) << 8, tj, ts);
        g_eng.step++;
    }
    if (!duelViewBusy(0xc)) g_eng.running = 0;
}

// @yo2 0x0070a980 0x1a direct attack: P0 = attacker slot
void engCmdDirectAttack() {
    uint32_t j = cmdPlayer();
    if (g_eng.step == 0) {
        engBattleSetup(j, g_eng.cur.p0, 1 - j, 5);
        duelView(0xc, j | (g_eng.cur.p0 & 0xff) << 8, 1 - j, 5);
        g_eng.step++;
    }
    if (!duelViewBusy(0xc)) g_eng.running = 0;
}

// @yo2 0x0070aa20 0x17 BATTLE_RUN: P0 / P1 = damage to each player, P2 = destroyed flags (view 0xd shows them; LP
// change with 0x24/0x25). Records the per-battle nodes first.
void engCmdBattleRun() {
    uint32_t aj = g_eng.vcc3c0, tj = g_eng.vcc3c4, tp = g_eng.turnPlayer;
    EngBattleSide* b = engBattle();
    if (g_eng.step == 0) {
        g_eng.vcc3ec = 1;
        if (!g_eng.vcc3c8) {
            if (aj != tj) {
                EngBattleSide& d = b[(1 - tp) & 1];
                if (!engSlotHasKey(d.j, d.slot, 0x1e13)) engNodeAddSlot(d.j, d.slot, 2, 0x1e13, 0);
            }
        } else {
            uint32_t n = engSlotKeyValue(aj, 11, 0x1eef);
            engNodeFreeKeyLo(slotAt(aj, 11).head, 0x1eef, 1);
            engNodeAddSlot(aj, 11, 1, 0x1eef, (uint16_t)(n + 1));
            EngBattleSide& a = b[aj & 1];
            if (!engSlotHasKeyValue(a.j, a.slot, 0xece, 0)) engNodeAddSlot(a.j, a.slot, 1, 0xece, 0);
        }
        int sides = !g_eng.vcc3c8 && aj != tj ? 1 : 0;
        for (int k = 0; k <= sides; k++) {
            uint32_t p = 1 - (k ^ aj);
            for (int s = 5; s < 10; s++)
                if (slotAt(p, s).faceUp && engCardAt(p, s) == 0x1e4d) engNodeAddSlot(p, s, 4, 0x1e4d, 0);
        }
        if (g_eng.vcc3c8 && engAtk(aj, g_eng.vcc3dc) == 0)
            for (int s = 5; s < 10; s++)
                if (slotAt(aj, s).faceUp && engCardAt(aj, s) == 0xeb1) engNodeAddSlot(aj, s, 4, 0xeb1, 0);
        slotAt(tp, 11).flags |= 0x80000;
        duelView(0xd, g_eng.cur.p0, g_eng.cur.p1, g_eng.cur.p2);
        g_eng.step++;
    }
    if (!duelViewBusy(0xd)) g_eng.running = 0;
}

// @yo2 0x0070ad70 0x1b the attack happened: P0 = attacker slot, P1 = 0 cancels the "attacked" mark, P2 = record links
void engCmdAttacked() {
    uint32_t j = cmdPlayer(), s = g_eng.cur.p0;
    if (!g_eng.cur.p1) {
        slotAt(j, s).flags &= 0xffbfffff;
        g_eng.running = 0;
        return;
    }
    engMarkAttacked(j, s);
    if (!g_eng.cur.p2) {
        g_eng.running = 0;
        return;
    }
    uint32_t tj = g_eng.vcc3c4, ts = g_eng.vcc3e0, aj = g_eng.vcc3c0;
    bool sameTarget = !g_eng.vcc3c8 && cardUid(slotAt(tj, ts).card) == engBattle()[(1 - aj) & 1].uid;
    if (live(j, s)) {
        int c = engCardAt(j, s);
        switch (c) {
        case 0x1505: case 0x1644: case 0x1958: case 0x1a4e: case 0x1a79: case 0x1ab3: case 0x1c1f: case 0x1e50: case 0x1e92:
            if (engSlotKeyValue(j, s, 0x1505) == 0xffffffff) {
                uint16_t v = !g_eng.vcc3c8;
                if (v && c == 0x1e92 && engSlotHasKey(tj, ts, 0x1e92)) v = 2;
                engNodeAddSlot(j, s, 1, 0x1505, v);
            }
            if (sameTarget) engNodeAddSlot(tj, ts, 8, (uint16_t)((g_eng.cur.p0 & 0xff) << 8 | (j & 0xff)), 0);
            break;
        }
    }
    if (j == aj && engSlotHasKey(j, 11, 0x15ff)) {
        if (engSlotKeyValue(1 - j, 11, 0x15ff) == 0xffffffff) engNodeAddSlot(1 - j, 11, 1, 0x15ff, !g_eng.vcc3c8);
        if (sameTarget) engNodeAddSlot(tj, ts, 1, 0x15ff, 0);
    }
    engPhaseCleanup();
    g_eng.running = 0;
}

// @yo2 0x0070b150 0x16 nothing
void engCmd16() { g_eng.running = 0; }

// @yo2 0x0070b170 0x1c end of the attack: P0 != 0 drops the per-attack nodes, P1 = phase to jump to (0 = none)
void engCmdAttackEnd() {
    uint32_t tp = g_eng.turnPlayer;
    if (!g_eng.vcc2f0 || tp == g_eng.viewer) {
        if (g_eng.cur.p0) {
            engNodeFreeKeyLo(slotAt(tp, 11).head, 0x11ed, 1);
            engNodeFreeKeyType(slotAt(tp, 11).head, 0x1ca1, 1, 1);
        }
        g_eng.battleState = 0xc;
        g_eng.vcc318 = 0;
        if (g_eng.cur.p1) engSetPhase(g_eng.cur.p1);
    }
    g_eng.flags &= ~3u;
    slotAt(g_eng.vcc3c0, g_eng.vcc3dc).flags &= 0xfdffffff;
    engPhaseCleanup();
    duelView(0x25, 0, 0, 0);
    g_eng.running = 0;
}

// @yo2 0x0070b2e0 0x1d battle sub-state 6 (damage step?); P0 bit 0 clear -> cc318 = 1
void engCmdBattle6() {
    g_eng.battleState = 6;
    g_eng.running = 0;
    g_eng.vcc318 = ~g_eng.cur.p0 & 1;
    g_eng.flags |= 1;
}

// @yo2 0x0070b320 0x1e leave sub-state 6
void engCmdBattle6End() {
    if (g_eng.flags & 1) {
        engNodeFreeKeyType(slotAt(0, 11).head, 0x19b8, 1, 1);
        engNodeFreeKeyType(slotAt(1, 11).head, 0x19b8, 1, 1);
    }
    g_eng.flags &= ~1u;
    slotAt(g_eng.vcc3c0, g_eng.vcc3dc).flags &= 0xfdffffff;
    engPhaseCleanup();
    g_eng.running = 0;
}

// @yo2 0x0070b3f0 0x6b end of the battle phase's battles
void engCmdBattleOver() {
    g_eng.battleState = 0xc;
    duelView(0x4b, 0, 0, 0);
    duelView(0x25, 0, 0, 0);
    g_eng.running = 0;
}

// @yo2 0x0070b440 0x1f battle sub-state 9
void engCmdBattle9() {
    g_eng.battleState = 9;
    g_eng.vcc318 = 0;
    g_eng.running = 0;
}

// @yo2 0x0070b470 0x20 the attack is replayed / continues: P0 = attacker slot
void engCmdAttackAgain() {
    uint32_t j = cmdPlayer(), s = g_eng.cur.p0;
    if (!g_eng.vcc2f0 || g_eng.turnPlayer == g_eng.viewer) {
        g_eng.battleState = 0xb;
        g_eng.vcc318 = 0;
    }
    engMarkAttacked(j, s);
    slotAt(j, s).flags &= 0xfdffffff;
    g_eng.flags &= ~2u;
    if (!g_eng.vcc3c8) {
        uint32_t aj = g_eng.vcc3c0, as = g_eng.vcc3dc;
        if (engSlotHasKey(aj, 11, 0x15ff)) engNodeAddSlot(g_eng.vcc3c4, g_eng.vcc3e0, 1, 0x15ff, 0);
        if (engCardAt(aj, as) == 0x1a79 && slotAt(aj, as).value)
            engNodeAddSlot(g_eng.vcc3c4, g_eng.vcc3e0, 8, (uint16_t)((as & 0xff) << 8 | (aj & 0xff)), 0);
    }
    duelView(0x25, 0, 0, 0);
    g_eng.running = 0;
}

// @yo2 0x0070b630 0x21 slot flag 2 (P0 = slot); P2 != 0 also marks the card word (bit 22)
void engCmdSlotFlag2() {
    uint32_t j = cmdPlayer(), s = g_eng.cur.p0;
    slotAt(j, s).flags |= 4;
    if (g_eng.cur.p2) slotAt(j, s).card |= 0x400000;
    g_eng.running = 0;
}

static uint32_t packAt(uint32_t j, uint32_t zone, uint32_t index) {
    uint32_t face = engFaceUpAt(j, zone, index) & 1;
    int def = (int16_t)engDefAt(j, zone, index);
    return face << 14 | (uint32_t)(def << 15) | index << 6 | zone << 1 | j;
}

// @yo2 0x0070b6b0 0x3f move by uid to a pile (hand, deck, graveyard, banished, extra). P0 = source (j | zone << 1 |
// uid << 6), P1 = destination (j | zone << 1 | index << 6; deck: 0 top, else bottom), P2 = flags (bit 0 face, bits
// 4-5 hand reveal, bits 6-7 banished face-down). The uid must be at the source; otherwise nothing happens.
void engCmdMove() {
    uint32_t sj = g_eng.cur.p0 & 1, sz = g_eng.cur.p0 >> 1 & 0x1f, uid = g_eng.cur.p0 >> 6 & 0xff;
    uint32_t dj = g_eng.cur.p1 & 1, dz = g_eng.cur.p1 >> 1 & 0x1f, di = g_eng.cur.p1 >> 6 & 0xff;
    uint32_t f = g_eng.cur.p2;
    uint32_t at = engFindUid(uid), si = at >> 16;
    switch (g_eng.step) {
    case 0:
        // a pile card is brought to the top of its pile first (GRAVE_TOP)
        if (sz == Z_GRAVE && engGraveIndex(sj, uid) != g_eng.pl[sj].graveCount - 1) {
            engGraveToTop(sj, uid);
            duelView(0x17, sj, Z_GRAVE, uid);
        } else if (sz == Z_BANISH && engBanishIndex(sj, uid) != g_eng.pl[sj].banishCount - 1) {
            engBanishToTop(sj, uid);
            duelView(0x17, sj, Z_BANISH, uid);
        }
        g_eng.step++;
        return;
    case 1: {
        if (duelViewBusy(0x17)) return;
        if ((at & 0xff) != sj || (at >> 8 & 0xff) != sz) {
            g_eng.running = 0;
            return;
        }
        uint32_t* w = engWordAt(sj, sz, si);
        uint32_t v = *w, f19 = (f & 1) << 19;
        *w = f19 | (v & 0xffc3ffff);
        if (sz == Z_HAND) *w = (f & 0x30) << 12 | f19 | (v & 0xffc0ffff);
        if (dz > 10 && dz < 0xe) *w &= 0xffbc7fff;
        if (dz == Z_GRAVE && sz != Z_BANISH) {
            engAddValueTo(0, 0x1361, 1u << (cardOwner(*w) << 3));
            engAddValueTo(1, 0x1361, 1u << (cardOwner(*w) << 3));
            if (cardIsMonster(cardId(*w))) engFlagCopies(1 - cardOwner(*w), 0x1574);
        }
        if (sz == Z_GRAVE ? dz != Z_BANISH : sz == Z_BANISH) {
            EngUid& u = g_eng.uid[cardUid(*w)];
            u.moves = (uint16_t)((u.moves & ~3) | ((u.moves + 1) & 3));
        }
        if (cardId(*w) == 0x1c4c) *w &= ~0x8000u;
        engWordCopy(&g_eng.tmpCard, w);
        if (dz == Z_HAND) {
            di = g_eng.pl[dj].handCount;
        } else if (dz == Z_DECK) {
            int scene = ndLogScene();
            if (scene != 0xc9 && scene != 0xca && scene != 0xd2 && scene != 0xd3 && scene != 0xd4) engSetPlayerFlag(dj, 3, 1);
        }
        if (sj == (g_eng.viewer ^ 1) && (f & 1)) {   // the opponent's card becomes known: hint sounds
            if (dz == Z_BANISH) {
                engStatAdd(0x2b, 1);
                if (cardIsMonster(cardId(g_eng.tmpCard)) && (f & 0xc0) != 0xc0) engStatAdd(0x2c, 1);
            }
            if (sz == Z_HAND) engStatAdd(0x2d, 1);
        }
        uint32_t from = packAt(sj, sz, si);
        engRemoveAt(sj, sz, si);
        engInsertAt(dj, dz, dz == Z_BANISH ? (f & 0xc0) : di, &g_eng.tmpCard);
        uint32_t to = packAt(dj, dz, di);
        duelView(0x19, cardUid(g_eng.tmpCard), from, to);
        g_eng.step++;
        return;
    }
    case 2:
        if (!duelViewBusy(-1)) g_eng.running = 0;
        return;
    }
}

static void graveHints(uint32_t* w, uint32_t p2, bool fromMonsterZone, uint32_t j, uint32_t dj) {
    if (fromMonsterZone && !(p2 & 8) && cardIsMonster(cardId(*w))) {
        if (j == dj) slotAt(j, 11).flags |= 0x1000000;
        if (cardLevel(cardId(*w)) > 7) engNodeAddSlot(j, 11, 1, 0x165a, 0);
        engAddValueTo(0, 0x14bf, 1u << (cardOwner(*w) << 3));
        engAddValueTo(1, 0x14bf, 1u << (cardOwner(*w) << 3));
    }
    engAddValueTo(0, 0x1361, 1u << (cardOwner(*w) << 3));
    engAddValueTo(1, 0x1361, 1u << (cardOwner(*w) << 3));
    if (cardIsMonster(cardId(*w))) engFlagCopies(1 - cardOwner(*w), 0x1574);
}

// @yo2 0x0070bdc0 0x40 move by position: P0 = source (j | zone << 1 | index << 6; a field slot as zone + index),
// P1 = destination (j | zone << 1 | index << 6; for a pile index != 0 means "at the end"), P2 = flags (bit 0
// reveal, bit 3, bit 4, bit 5 -> card word bits 16..19; bits 6-7: banished face-down / with its view record)
void engCmdMoveAt() {
    uint32_t j = g_eng.cur.p0 & 1, z = g_eng.cur.p0 >> 1 & 0x1f, i = g_eng.cur.p0 >> 6 & 0xff;
    uint32_t dj = g_eng.cur.p1 & 1, dz = g_eng.cur.p1 >> 1 & 0x1f, di = g_eng.cur.p1 >> 6 & 0xff;
    uint32_t p2 = g_eng.cur.p2;
    if ((uint16_t)(i + z) < 0xb) {
        z = i + z;
        i = 0;
    }
    if (g_eng.step == 1) {
        engCollapse1f08();
        g_eng.running = 0;
        return;
    }
    if (g_eng.step != 0) return;
    uint32_t* w = engWordAt(j, z, i);
    uint32_t v = *w, bits = ((p2 & 1) << 3 | (p2 >> 5 & 1) << 1 | (p2 & 0x10) >> 4) << 16;
    *w = bits | (v & 0xffc0ffff);
    if (dz == Z_GRAVE) {
        if (!engIsTokenKind(cardId(v))) {
            graveHints(w, p2, z < 5, j, dj);
            if (cardId(*w) == 0x1c4c) *w = (~p2 & 8) << 12 | (*w & 0xffff7fff);
        }
    } else if (dz > 10) {
        if (dz < 0xe) *w &= 0xffbc7fff;
        else if (dz == Z_BANISH) *w = bits | (v & 0xff80ffff);
    }
    engWordCopy(&g_eng.tmpCard, w);
    if (j == (g_eng.viewer ^ 1) && (p2 & 1)) {
        if (dz == Z_BANISH) {
            if (!engIsTokenKind(cardId(*w))) {
                engStatAdd(0x2b, 1);
                if (cardIsMonster(cardId(g_eng.tmpCard))) engStatAdd(0x2c, 1);
            }
        } else if (dz == Z_HAND) {
            engStatAdd(0x30, 1);
        } else if (dz == Z_DECK) {
            engStatAdd(0x31, 1);
        }
        if (z < 5 && (dz == Z_HAND || dz == Z_DECK)) engStatAdd(0x2f, 1);
    }
    EngPlayer& dp = g_eng.pl[dj];
    switch (dz) {
    case Z_HAND:
        engSetPlayerFlag(dj, 2, 1);
        di = dp.handCount;
        break;
    case Z_EXTRA:
        if (di) di = dp.extraCount;
        break;
    case Z_DECK: {
        if (di) di = dp.deckCount;
        int scene = ndLogScene();
        if (scene != 0xc9 && scene != 0xca && scene != 0xd2 && scene != 0xd3 && scene != 0xd4) engSetPlayerFlag(dj, 3, 1);
        break;
    }
    case Z_GRAVE:
        if (di) di = dp.graveCount;
        break;
    case Z_BANISH:
        if (di) di = dp.banishCount;
        break;
    }
    di &= 0xff;
    uint32_t from = packAt(j, z, i);
    engRemoveAt(j, z, i);
    uint32_t ins = dz == Z_BANISH ? 0 : di;
    if (p2 & 0xc0) {   // banished with a view record: 0x40 | (def | zone << 1 | face << ...) << 8
        uint32_t zz = (p2 & 0x80) ? 0xff : z;
        uint8_t b = (uint8_t)((((from >> 15 & 1) | zz << 2) << 1 | (from >> 14 & 1)) << 1 | j);
        ins = (uint32_t)b << 8 | 0x40;
    }
    engInsertAt(dj, dz, ins, &g_eng.tmpCard);
    duelView(0x19, cardUid(g_eng.tmpCard), from, packAt(dj, dz, di));
    g_eng.step++;
}

// @yo2 0x0070c660 0x41 move by uid onto a field slot: P0 = source (j | zone << 1 | uid << 6), P1 = destination
// (j | slot << 1, plus index << 6 added to the slot), P2 = face-up | defense << 8
void engCmdMoveToField() {
    uint32_t sj = g_eng.cur.p0 & 1, sz = g_eng.cur.p0 >> 1 & 0x1f, uid = g_eng.cur.p0 >> 6 & 0xff;
    uint32_t dj = g_eng.cur.p1 & 1, ds = g_eng.cur.p1 >> 1 & 0x1f, p2 = g_eng.cur.p2;
    uint32_t at = engFindUid(uid);
    switch (g_eng.step) {
    case 0:
        if (sz == Z_GRAVE && engGraveIndex(sj, uid) != g_eng.pl[sj].graveCount - 1) {
            engGraveToTop(sj, uid);
            duelView(0x17, sj, Z_GRAVE, uid);
        } else if (sz == Z_BANISH && engBanishIndex(sj, uid) != g_eng.pl[sj].banishCount - 1) {
            engBanishToTop(sj, uid);
            duelView(0x17, sj, Z_BANISH, uid);
        }
        g_eng.step++;
        return;
    case 1: {
        if (duelViewBusy(0x17)) return;
        uint32_t si = at >> 16;
        uint32_t* w = engWordAt(sj, sz, si);
        *w &= 0xff83ffff;
        engWordCopy(&g_eng.tmpCard, w);
        uint32_t from = packAt(sj, sz, si & 0xff);
        uint32_t slot = (ds + (g_eng.cur.p1 >> 6)) & 0x1f;
        uint32_t to = slot << 1 | dj | ((p2 & 1) | (p2 >> 8) * 2) << 14;
        engRemoveAt(sj, sz, si);
        engInsertAt(dj, slot, p2, &g_eng.tmpCard);
        slotAt(dj, slot).flags &= 0xffdfffff;
        duelView(0x19, cardUid(g_eng.tmpCard), from, to & 0xffff);
        if (slot >= 5 && slot < 10 && engIsCrystalBeast(cardId(g_eng.tmpCard))) engMarkSpellsWith(0x1cdf);
        if (dj == g_eng.viewer && !(p2 & 0xff) && ds > 4 && ds < 0xb) engStatAdd(0x1f, 1);
        g_eng.step++;
        return;
    }
    case 2:
        if (sz == Z_BANISH)   // effects that remember a banished card follow it back to the field
            for (uint32_t i = slotAt(dj, 11).head; i;) {
                const EngNode e = g_eng.node[i];
                i = e.next;
                if ((e.kind & 0xf) >= 6 || e.value != uid) continue;
                switch (e.key) {
                case 0x147f: slotAt(dj, ds).flags |= 0x40; break;
                case 0x14f5: slotAt(dj, ds).flags |= 0x20; break;
                case 0x17d2: case 0x17d5: case 0x1814: case 0x1822: case 0x185e: case 0x18af: case 0x1a1f: case 0x1a20:
                case 0x1a21: case 0x1ad7: case 0x1ad8: case 0x1bed: case 0x1eaf:
                    engNodeAddSlot(dj, ds, e.kind, e.key, 0);
                    break;
                }
            }
        engCollapse1f08();
        g_eng.running = 0;
        return;
    }
}

// @yo2 0x0070ccf0 every spell slot with a `card` source gets flag 7
void engMarkSpellsWith(int card) {
    for (uint32_t j = 0; j < 2; j++)
        for (int s = 5; s < 10; s++)
            if (engSlotIsLive(j, s, card)) slotAt(j, s).flags |= 0x80;
}

static uint32_t packSlot(uint32_t j, uint32_t s) {
    EngSlot& sl = slotAt(j, s);
    return ((sl.faceUp & 1) | (sl.def << 1 & 3)) << 14 | (s & 0x1f) << 1 | (j & 1);
}

// @yo2 0x0070cd80 0x3d move a field card to another slot with its whole record: P0 = j | slot << 8, P1 = j | slot << 8,
// P2 = face-up on arrival
void engCmdSlotMove() {
    uint32_t j = g_eng.cur.p0 & 0xff, s = g_eng.cur.p0 >> 8, dj = g_eng.cur.p1 & 0xff, ds = g_eng.cur.p1 >> 8 & 0xff;
    uint32_t face = g_eng.cur.p2;
    if (g_eng.step == 0) {
        if (s < 0xb && ds < 0xb) {
            g_eng.step = 1;
            return;
        }
        g_eng.running = 0;
        return;
    }
    if (g_eng.step != 1) {
        engCollapse1f08();
        g_eng.running = 0;
        return;
    }
    engWordCopy(&g_eng.tmpCard, engWordAt(j, s, 0));
    EngSlot& src = slotAt(j, s);
    uint32_t from = (((src.faceUp & 1) | (uint32_t)src.def << 1) << 13 | (s & 0x1f)) << 1;
    uint32_t to = ((ds & 0x1f) << 1 | (dj & 1)) ^ (from & 0x8000);
    if (ds > 4) to &= 0x7fff;
    to |= (face & 1) << 14;
    EngSlot& dst = slotAt(dj, ds);
    dst = src;
    dst.card = g_eng.tmpCard;
    src = EngSlot{};
    g_eng.vca4a0 &= ~(1u << ((j * 16 + s) & 0x1f));
    dst.flags &= 0xfdffffff;
    dst.faceUp = (uint16_t)face;
    if (j != dj) dst.flags = (dst.flags & 0xffdfffff) | 0x400;
    engNodeRetarget(g_eng.cur.p0, (uint16_t)g_eng.cur.p1);
    if (ds > 4) {
        engNodeClearSlot(&dst);
        dst.def = 0;
        dst.value = 0;
        engSetSlotFlag(dj, ds, 0x14, ~to >> 14 & 1);
        if ((face & 1) && ds >= 5 && ds < 10 && engIsCrystalBeast(cardId(g_eng.tmpCard))) engMarkSpellsWith(0x1cdf);
    }
    duelView(0x19, cardUid(g_eng.tmpCard), (from | (g_eng.cur.p0 & 1)) & 0xffff, to & 0xffff);
    g_eng.step++;
}

// @yo2 0x0070d0f0 0x3e swap two field cards (records and links); the ids are hidden during the view
void engCmdSlotSwap() {
    uint32_t j = g_eng.cur.p0 & 0xff, s = g_eng.cur.p0 >> 8, dj = g_eng.cur.p1 & 0xff, ds = g_eng.cur.p1 >> 8 & 0xff;
    EngSlot& a = slotAt(j, s);
    EngSlot& b = slotAt(dj, ds);
    switch (g_eng.step) {
    case 0: {
        if (!cardId(a.card) || !cardId(b.card)) {
            g_eng.running = 0;
            return;
        }
        EngSlot t = b;
        b = a;
        a = t;
        for (EngSlot* x : {&a, &b}) {
            x->flags &= 0xffdfffff & 0xfdffffff;
            x->flags |= 0x400;
        }
        uint16_t ka = (uint16_t)(s << 8 | j), kb = (uint16_t)(ds << 8 | dj), tmp = (uint16_t)(ds << 8 | ((dj + 2) & 0xff));
        engNodeRetarget(ka, tmp);
        engNodeRetarget(kb, ka);
        engNodeRetarget(tmp, kb);
        g_eng.cur.p2 = (uint16_t)(a.card & 0x3fff);
        g_eng.tmpCard = (g_eng.tmpCard & ~0x3fffu) | (b.card & 0x3fff);
        a.card &= 0xffffc000;
        b.card &= 0xffffc000;
        g_eng.step++;
        return;
    }
    case 1:
        if (s < 5 && ds < 5) engStatAdd(0x32, 1);
        duelView(0x1a, 0, packSlot(j, s), packSlot(dj, ds));
        g_eng.step++;
        return;
    case 2:
        a.card = (a.card & 0xffffc000) | (g_eng.cur.p2 & 0x3fff);
        b.card = (b.card & 0xffffc000) | (g_eng.tmpCard & 0x3fff);
        engCollapse1f08();
        [[fallthrough]];
    default:
        g_eng.running = 0;
    }
}

// monsters flipped face-up under an active 0x17b1 spell get a type 7 node tied to that spell
static void flipUnder17b1(uint32_t j, int s) {
    if (!engCountTextAll(0x17b1)) return;
    for (uint32_t p = 0; p < 2; p++)
        for (int k = 5; k < 10; k++) {
            EngSlot& o = slotAt(p, k);
            if (engCardAt(p, k) == 0x17b1 && o.faceUp && !(o.flags >> 2 & 2) && !(o.flags & 2))
                engNodeAddSlot(j, s, 7, (uint16_t)(k << 8 | p), 0);
        }
}

// @yo2 0x0070d550 0x34 change position: P0 = slot; always toggles ATK/DEF, P1 != 0 also flips the face, P2 != 0
// plays the flip animation (view 0x46)
void engCmdChangePosition() {
    uint32_t j = cmdPlayer(), s = g_eng.cur.p0, flip = g_eng.cur.p1, anim = g_eng.cur.p2;
    EngSlot& sl = slotAt(j, s);
    uint32_t card = cardId(sl.card);
    int both = anim && flip;
    if (!card) {
        g_eng.running = 0;
        return;
    }
    switch (g_eng.step) {
    case 0:
        if (!anim || flip) {
            if (both) duelView(0x46, j, card, 1);
        } else {
            duelView(0x46, j, 1 - sl.def, 0);
        }
        g_eng.step++;
        return;
    case 1: {
        if (duelViewBusy(0x46)) return;
        if (both) engSetSlotFlag(j, s, 3, 1);
        uint32_t packed = ((((1 - sl.def) * 2 & 3) | ((sl.faceUp ^ flip) & 1)) << 13 | (s & 0x1f)) << 1 | j;
        duelView(0x1b, packed, !anim && flip, both);
        g_eng.step++;
        return;
    }
    case 2:
        if (duelViewBusy(0x1b)) return;
        {
            uint16_t oldDef = sl.def;
            sl.faceUp ^= (uint16_t)flip;
            sl.def = oldDef == 0;
            if (flip) {
                if (!sl.faceUp) {
                    engSlotLeave(j, s);
                    if (j == g_eng.viewer) engStatAdd(0x1e, 1);
                } else {
                    sl.turn = (uint16_t)++g_eng.stamp;
                    if (s < 5) flipUnder17b1(j, s);
                }
            }
            if (sl.def) {
                if (engCardAt(j, s) == 0x1743)
                    for (uint32_t p = 0; p < 2; p++)
                        for (int k = 0; k < 5; k++) engNodeFreeKeyHi(slotAt(p, k).head, (uint16_t)(s << 8 | j), 1);
                sl.flags &= 0xfdffffff;
            }
            if (g_eng.phase == 2) slotAt(g_eng.turnPlayer, 11).flags |= 0x100000;
            if (flip) {
                if (sl.faceUp) sl.flags |= 0x88000;
                sl.flags |= 0x400;
            }
        }
        engCollapse1f08();
        duelView(0x25, 0, 0, 0);
        g_eng.running = 0;
        return;
    }
}

// @yo2 0x0070da00 0x35 flip without changing position (activating a set card, flipping an attacked monster):
// P0 = slot, P1 = 1 (0 clears flag 1), P2 bits: 0 view 0x47 / remember the card, 1 view 0x47 + flag 3, 2 view 0x47 +
// flag 1 + "activates" (view 0x43), 3 = don't flip
void engCmdFlip() {
    uint32_t j = cmdPlayer(), s = g_eng.cur.p0, p1 = g_eng.cur.p1, f = g_eng.cur.p2;
    EngSlot& sl = slotAt(j, s);
    uint32_t word = sl.card, card = cardId(word);
    if (!card) {
        g_eng.running = 0;
        return;
    }
    switch (g_eng.step) {
    case 0:
        if (f & 1) duelView(0x47, j, card, 0);
        if (f & 4) duelView(0x47, j, card, 1);
        if (f & 2) duelView(0x47, j, card, 2);
        g_eng.step++;
        return;
    case 1:
        if (duelViewBusy(0x47)) return;
        if (f & 4) engSetSlotFlag(j, s, 1, 1);
        if (f & 2) engSetSlotFlag(j, s, 3, 1);
        if (!p1) engSetSlotFlag(j, s, 1, 0);
        if (!(f & 8)) {
            uint32_t packed = ((sl.def & 1) << 14 | (s & 0x1f)) << 1 | ((sl.faceUp + 1u) * 3 & 1) << 14 | j;
            duelView(0x1b, packed, !(f & 2), f & 2);
        } else {
            uint32_t packed = (((sl.def << 1 & 3) | (p1 & 1)) << 13 | (s & 0x1f)) << 1 | j;
            duelView(0x1b, packed, 1, 0);
        }
        g_eng.step++;
        return;
    case 2:
        if (duelViewBusy(0x1b)) return;
        if (!(f & 8)) {
            uint16_t was = sl.faceUp;
            sl.faceUp = was == 0;
            if (was) {
                engSlotLeave(j, s);
                if (j == g_eng.viewer && s < 5) engStatAdd(0x1e, 1);
            } else {
                sl.turn = (uint16_t)++g_eng.stamp;
                if (f & 1) g_eng.vcc3e4 = engCardAt(j, s);
                if (s < 5) flipUnder17b1(j, s);
            }
            if (s < 5 && sl.faceUp) sl.flags |= 0x88000;
        }
        if (f & 4) {
            if (cardIsSpell(card)) engSetPlayerFlag(j, 0x19, 1);
            if (cardIsTrap(card)) engSetPlayerFlag(j, 0x1a, 1);
            duelView(0x43, j, cardUid(word) | 0x8000, 1);
        }
        sl.flags |= 0x400;
        g_eng.step++;
        return;
    case 3:
        if (duelViewBusy(0x43)) return;
        engCollapse1f08();
        duelView(0x25, 0, 0, 0);
        g_eng.running = 0;
        return;
    }
}
