// Node, counter and value command handlers (0x0070df30..0x0070e7a0).
#include "EngineInternal.h"

static EngSlot& slotAt(uint32_t j, int s) { return g_eng.pl[j & 1].slot[s]; }

static void finishSimple() {
    engCollapse1f08();
    duelView(0x25, 0, 0, 0);
    g_eng.running = 0;
}

// @yo2 0x0070df30 0x36 add a node: P0 = slot | type << 8, P1 = key (bit 15: on the slot's card instead), P2 = value
void engCmdAddNode() {
    uint32_t j = cmdPlayer(), s = g_eng.cur.p0 & 0xff, type = g_eng.cur.p0 >> 8, key = g_eng.cur.p1 & 0x7fff;
    if (!(g_eng.cur.p1 & 0x8000)) engNodeAddSlot(j, s, (int)type, (uint16_t)key, g_eng.cur.p2);
    else engNodeAddUid((int)(j + s * 2), (int)type, (uint16_t)key, g_eng.cur.p2);
    engCollapse1f08();
    duelView(0x25, 0, 0, 0);
    if (key == 0x1c8a || key == 0x1d1f) slotAt(j, s).flags |= 0x4000;
    g_eng.running = 0;
}

// @yo2 0x0070e020 0x38 rewrite node P0 >> 8 of slot P0 & 0xff: P1 = type, P2 = value
void engCmdSetNode() {
    engNodeSet(cmdPlayer(), g_eng.cur.p0 & 0xff, g_eng.cur.p0 >> 8, g_eng.cur.p1, g_eng.cur.p2);
    finishSimple();
}

// @yo2 0x0070e0b0 0x37 remove nodes: P0 = slot | type << 8, P1 = key (bit 15: the card's list), P2 = once | by-type << 8
void engCmdRemoveNode() {
    uint32_t j = cmdPlayer(), s = g_eng.cur.p0 & 0xff, type = g_eng.cur.p0 >> 8, key = g_eng.cur.p1 & 0x7fff;
    int once = g_eng.cur.p2 & 0xff;
    if (g_eng.cur.p1 & 0x8000) {
        engNodeFreeKeyLo(g_eng.uid[j + s * 2].head, (uint16_t)key, once);
    } else if (g_eng.cur.p2 >> 8) {
        engNodeFreeKeyType(slotAt(j, s).head, (uint16_t)key, type, once);
    } else if (type > 5) {
        engNodeFreeKeyHi(slotAt(j, s).head, (uint16_t)key, once);
    } else {
        engNodeFreeKeyLo(slotAt(j, s).head, (uint16_t)key, once);
    }
    finishSimple();
}

// @yo2 0x0070e240 0x39 re-stamp a slot's card and clear its flag 1
void engCmdRestamp() {
    uint32_t j = cmdPlayer(), s = g_eng.cur.p0 & 0xff;
    if (cardId(slotAt(j, s).card)) {
        slotAt(j, s).turn = (uint16_t)++g_eng.stamp;
        engSetSlotFlag(j, s, 1, 0);
        engCollapse1f08();
        duelView(0x25, 0, 0, 0);
    }
    g_eng.running = 0;
}

// @yo2 0x0070e300 0x3a set (P0 >> 8 == 0) or add to a slot's value (counters, turns, a declared value): P1 | P2 << 16
void engCmdSetValue() {
    EngSlot& sl = slotAt(cmdPlayer(), g_eng.cur.p0 & 0xff);
    uint32_t v = g_eng.cur.p1 | (uint32_t)g_eng.cur.p2 << 16;
    if (!(g_eng.cur.p0 >> 8)) sl.value = v;
    else sl.value += v;
    finishSimple();
}

// @yo2 0x0070e3e0 0x3c counters: P0 = slot, P1 = signed delta, P2 = counter kind (0 = the card's own, above 0xe
// counters held in nodes of the counting card); duel logs of some scenes number the kinds differently
void engCmdCounter() {
    uint32_t j = cmdPlayer(), s = g_eng.cur.p0;
    int delta = (int16_t)g_eng.cur.p1;
    uint32_t kind = g_eng.cur.p2;
    int c = engCardAt(j, s);
    int scene = ndLogScene();
    if (scene == 0xc9 || scene == 0xca || scene == 0xd2 || scene == 0xd3 || scene == 0xd4 || scene == 0xd5 || scene == 0xd6) {
        if (kind >= 5 && kind <= 10) kind += 10;
    }
    if (ndLogScene() == 0xd7 && kind >= 0xd && kind <= 0x12) kind += 2;
    if (g_eng.step == 0) {
        if (c) {
            EngSlot& sl = slotAt(j, s);
            if (kind == 0) {
                int max = engSpellCounterMax(c), old = (int)sl.value, n = old + delta;
                if (max <= n) n = max;
                if (n < 1) n = 0;
                sl.value = (uint32_t)n;
                if (j == g_eng.viewer) {
                    if (delta < 0) engStatAdd(0x34, old - n);
                    else engStatAdd(0x33, n - old);
                }
            } else if (kind < 0xf) {
                int n = (int)sl.value + delta;
                sl.value = n < 1 ? 0 : (uint32_t)n;
            } else {
                int key = engCounterCard((int)kind);
                int n = engSlotSumKey(j, s, key) + delta;
                engNodeFreeKeyLo(sl.head, (uint16_t)key, 1);
                if (n > 0) engNodeAddSlot(j, s, 3, (uint16_t)key, (uint16_t)n);
            }
            duelView(0x26, (s & 0xff) << 8 | (j & 0xff), (uint32_t)delta, kind);
        }
        g_eng.step++;
    } else if (g_eng.step == 1 && !duelViewBusy(0x26)) {
        finishSimple();
    }
}

// bring a graveyard / banished card to the top of its pile first (view 0x17); false when nothing to do
static bool toTop(uint32_t j, uint32_t zone, uint32_t uid) {
    if (zone == Z_GRAVE) {
        if (engGraveIndex(j, uid) == g_eng.pl[j].graveCount - 1) return false;
        engGraveToTop(j, uid);
    } else if (zone == Z_BANISH) {
        if (engBanishIndex(j, uid) == g_eng.pl[j].banishCount - 1) return false;
        engBanishToTop(j, uid);
    } else {
        return false;
    }
    duelView(0x17, j, zone, uid);
    return true;
}

// @yo2 0x0070e7a0 0x28 RUN_LIST: P0 = zone, P1 = uid to show on top (0 = none)
void engCmdRunList() {
    uint32_t j = cmdPlayer(), zone = g_eng.cur.p0, uid = g_eng.cur.p1;
    uint32_t index = uid ? engFindUid(uid) >> 16 : 0;
    switch (g_eng.step) {
    case 0:
        toTop(j, zone, uid);
        g_eng.step++;
        return;
    case 1:
        if (duelViewBusy(0x17)) return;
        duelView(8, j, zone, index);
        g_eng.step++;
        return;
    case 2:
        if (!duelViewBusy(8)) g_eng.running = 0;
        return;
    }
}

// @yo2 0x0070e920 0x29 CARD_LOCKON (a target): P0 = zone (field: the slot), P1 = uid, P2 = 0..5 / > 5 also records the
// target in the lock-on list (0x012c8618, 128 entries) / 0xffff no view. P0 = 0xffff only appends P1 to that list.
void engCmdLockOn() {
    uint32_t j = cmdPlayer(), zone = g_eng.cur.p0, uid = g_eng.cur.p1, kind = g_eng.cur.p2;
    uint16_t* list = engAt<uint16_t>(0x012c8618);
    if (zone == 0xffff) {
        g_eng.running = 0;
        list[g_eng.vc8614] = g_eng.cur.p1;
        g_eng.vc8614 = (g_eng.vc8614 + 1) & 0x7f;
        return;
    }
    switch (g_eng.step) {
    case 0:
        toTop(j, zone, uid);
        g_eng.step++;
        return;
    case 1:
        if (duelViewBusy(0x17)) return;
        if (kind > 5) {
            list[g_eng.vc8614] = (uint16_t)(g_eng.uid[uid & 0x1ff].moves << 14 | ((uid & 0x1ff) << 4 | (zone & 0xf)) << 1 | (j & 1));
            g_eng.vc8614 = (g_eng.vc8614 + 1) & 0x7f;
        }
        if (kind != 0xffff) {
            uint32_t index = zone == Z_HAND ? engHandIndex(j, uid) & 0xff : 0;
            duelView(0x18, j, (zone & 0xff) | index << 8, zone == Z_DECK);
        }
        g_eng.step++;
        return;
    case 2:
        if (!duelViewBusy(0x18)) g_eng.running = 0;
        return;
    }
}

static bool logReplayScene() {
    int s = ndLogScene();
    return s == 0xc9 || s == 0xca || s == 0xd2 || s == 0xd3 || s == 0xd4;
}

// @yo2 0x0070ebd0 0x31 to another zone with the destruction animation (CARD_BREAK): P0 = zone | index << 8 (field:
// zone = slot), P1 = destination zone | flags << 8 (0x100 reveal, 0xf00 "destroyed" bits, high nibble = by effect),
// P2 = uid (for hand / extra / deck). Piles belong to the card's owner; the deck takes it on top.
void engCmdDestroy() {
    uint32_t j = cmdPlayer(), z = g_eng.cur.p0 & 0xff, idx = g_eng.cur.p0 >> 8;
    uint32_t dz = g_eng.cur.p1 & 0xff, f8 = g_eng.cur.p1 >> 8 & 0xff, hi = f8 >> 4, destroyed = g_eng.cur.p1 & 0xf00;
    uint32_t uid = g_eng.cur.p2;
    bool toBanish = dz == Z_BANISH, toDeck = dz == Z_DECK || dz == Z_EXTRA;
    if (z == Z_HAND) idx = engHandIndex(j, uid);
    else if (z == Z_EXTRA) idx = engExtraIndex(j, uid);
    else if (z == Z_DECK) idx = engDeckIndex(j, uid);
    uint32_t ib = idx & 0xff;
    switch (g_eng.step) {
    case 0:
        g_eng.step++;
        [[fallthrough]];
    case 1: {
        uint32_t u = cardUid(*engWordAt(j, z, idx));
        if (u) duelView(0x1e, j, ib << 8 | z, toDeck ? 0 : u);
        else g_eng.running = 0;
        g_eng.step++;
        return;
    }
    case 2: {
        if (duelViewBusy(0x1e)) return;
        uint32_t* w = engWordAt(j, z, idx);
        if (toDeck) {
            *w &= 0xff837fff;
            engWordCopy(&g_eng.tmpCard, w);
            if (!logReplayScene()) engSetPlayerFlag(cardOwner(*w), 3, 1);
        } else if (dz < 0xb) {
            engWordCopy(&g_eng.tmpCard, w);
        } else {
            uint32_t v = *w, b = ((f8 & 1) | 2) << 19;
            *w = b | (v & 0xffd3ffff);
            if (hi) *w = b | (v & 0xffd37fff);
            if (toBanish) *w &= 0xffbfffff;
            if (dz == Z_GRAVE && !engIsTokenKind(cardId(*w))) {
                if (z < 5 && !hi && cardIsMonster(cardId(*w))) {
                    if (j == cardOwner(*w)) slotAt(j, 11).flags |= 0x1000000;
                    if (cardLevel(cardId(*w)) > 7) engNodeAddSlot(j, 11, 1, 0x165a, 0);
                    engAddValueTo(0, 0x14bf, 1u << (cardOwner(*w) << 3));
                    engAddValueTo(1, 0x14bf, 1u << (cardOwner(*w) << 3));
                    if (engSlotRaw(j, z)->faceUp && engCardAttrIs(cardId(*w), 4)) engFlagCopies(j, 0x1762);
                    if (engIsBES(cardId(*w)))
                        for (int s = 5; s < 10; s++)
                            if (engSlotIsLive(j, s, 0x1972)) engNodeAddSlot(j, s, 1, 0x1972, 0);
                }
                engAddValueTo(0, 0x1361, 1u << (cardOwner(*w) << 3));
                engAddValueTo(1, 0x1361, 1u << (cardOwner(*w) << 3));
                if (cardIsMonster(cardId(*w))) engFlagCopies(1 - cardOwner(*w), 0x1574);
                if (cardId(*w) == 0x1c4c) *w = (uint32_t)((z == 10 || z < 10) && !hi) << 15 | (*w & 0xffff7fff);
            }
            if (toBanish && !engIsTokenKind(cardId(*w))) {
                engAddValueTo(0, 0x16da, 1);
                engAddValueTo(1, 0x16da, 1);
            }
            engWordCopy(&g_eng.tmpCard, w);
        }
        uint32_t o = 1 - j;
        if (g_eng.turnPlayer == o && destroyed && engSlotRaw(j, z)->def && !engSlotHasKey(o, 11, 0x1ef4))
            engNodeAddSlot(o, 11, 1, 0x1ef4, 0);
        if (j == (g_eng.viewer ^ 1) && destroyed) {
            engStatAdd(0x11, 1);
            if (z < 5) engStatAdd(0x12, 1);
            if (toBanish && !engIsTokenKind(engCardIdAt(j, z, idx))) {
                engStatAdd(0x2b, 1);
                if (cardIsMonster(cardId(g_eng.tmpCard))) engStatAdd(0x2c, 1);
            }
        }
        uint32_t from = (((engFaceUpAt(j, z, idx) & 1) | (uint32_t)(int8_t)engDefAt(j, z, idx) << 1) << 13 | ib << 5 |
                         (z & 0x1f)) << 1 | j;
        uint32_t to;
        if (dz < 0xb) {
            engRemoveAt(j, z & 0x1f, ib);
            engInsertAt(j, dz & 0x1f, 1, &g_eng.tmpCard);
            to = j | (dz & 0x1f) << 1 | 0x4000;
            slotAt(j, dz & 0x1f).flags |= 0x2000;
            if ((dz & 0x1f) >= 5 && (dz & 0x1f) < 10 && engIsCrystalBeast(cardId(g_eng.tmpCard))) engMarkSpellsWith(0x1cdf);
        } else {
            uint32_t end = dz != Z_DECK, owner = cardOwner(g_eng.tmpCard);
            engRemoveAt(j, z & 0x1f, idx);
            engInsertAt(owner, dz & 0x1f, toBanish ? 0 : end, &g_eng.tmpCard);
            to = (engFaceUpAt(owner, dz & 0x1f, end) & 1) << 14 | (end << 5 | (dz & 0x1f)) << 1 | owner;
        }
        duelView(0x19, cardUid(g_eng.tmpCard) | 0x50000, from & 0xffff, to & 0xffff);
        g_eng.step++;
        return;
    }
    case 3:
        if (destroyed && idx + z <= 10) duelView(0x4a, j, cardId(g_eng.tmpCard), 0);
        g_eng.step++;
        return;
    case 4:
        if (!duelViewBusy(0x4a)) {
            engCollapse1f08();
            g_eng.running = 0;
        }
        return;
    }
}

static void drop400000Unless17e4(uint32_t j, int s, uint32_t* w) {
    if (engSlotHasKey(j, s, 0x17e4) && !engCountAttr(j, 5, s) && !engCountAttr0(1 - j, 5)) *w &= ~0x400000u;
}

// @yo2 0x0070f650 0x32 a field card explodes (destroyed in place, view 0x1f) and goes to `P1` (zone; the owner's pile;
// deck = top): P0 = slot, P2 bit 0 = by the opponent / reveal
void engCmdExplode() {
    uint32_t j = cmdPlayer(), s = g_eng.cur.p0, dz = g_eng.cur.p1, by = g_eng.cur.p2 & 1;
    uint32_t* w = engSlotWord(j, s);
    uint32_t card = cardId(*w);
    switch (g_eng.step) {
    case 0:
        duelView(0x1f, j, s, cardUid(*w));
        g_eng.vc80b4 = 0;
        g_eng.step++;
        return;
    case 1:
        if (!duelViewBusy(0x1f)) g_eng.step++;
        return;
    case 2: {
        EngSlot& sl = slotAt(j, s);
        if (dz == Z_GRAVE) {
            if (!engIsTokenKind(card)) {
                if (s < 5 && cardIsMonster(card)) {
                    if (j == cardOwner(*w)) slotAt(j, 11).flags |= 0x1000000;
                    if (cardLevel(card) > 7) engNodeAddSlot(j, 11, 1, 0x165a, 0);
                    engAddValueTo(0, 0x14bf, 1u << (cardOwner(*w) << 3));
                    engAddValueTo(1, 0x14bf, 1u << (cardOwner(*w) << 3));
                    if (sl.faceUp && engCardAttrIs(card, 4)) engFlagCopies(j, 0x1762);
                    uint32_t uid = cardUid(*w);
                    if ((*w & 0x400000) && engUidHasKey(uid, 0x1add) &&
                        (card == 0x1b2a || card == 0x1bc7 || engIsGeminiKind(card))) {
                        uint32_t at = engFieldUid(engUidKeyValue(uid, 0x1add));
                        if ((int)at >= 0) {
                            uint32_t aj = at & 0xff, as = at >> 8 & 0xff;
                            if (engSlotIsLive(aj, as, 0x1add) && engSlotHasKey(aj, as, 0x1add))
                                engNodeAddSlot(aj, as, ((g_eng.turnPlayer == aj) + 1) << 4 | 2, 0x17d2, 0);
                        }
                    }
                    drop400000Unless17e4(j, s, w);
                    if (engIsBES(card))
                        for (int k = 5; k < 10; k++)
                            if (engSlotIsLive(j, k, 0x1972)) engNodeAddSlot(j, k, 1, 0x1972, 0);
                    if (sl.flags & 0x4000000) engNodeFreeKeyLo(slotAt(j, 11).head, 0x197d, 0);
                }
                engAddValueTo(0, 0x1361, 1u << (cardOwner(*w) << 3));
                engAddValueTo(1, 0x1361, 1u << (cardOwner(*w) << 3));
                if (cardIsMonster(card)) engFlagCopies(1 - cardOwner(*w), 0x1574);
                if (card == 0x1c4c) *w |= 0x8000;
            }
        } else if (dz == Z_DECK && (*w & 0x400000)) {
            engNodeAddSlot(cardOwner(*w), 11, 4, 0x14b5, (uint16_t)cardUid(*w));
        }
        drop400000Unless17e4(j, s, w);
        if (dz == Z_BANISH && !engIsTokenKind(card)) {
            engAddValueTo(0, 0x16da, 1);
            engAddValueTo(1, 0x16da, 1);
        }
        if (cardIsMonster(card) && engLevel(j, s) < 3 && engSlotNoEffect(j, s)) engNodeAddSlot(j, 11, 1, 0x17b2, 0);
        if (engIsElementalHero(card)) engNodeAddSlot(j, 11, 2, 0x19b8, 0);
        uint32_t o = 1 - j;
        if (g_eng.turnPlayer == o && by && sl.def && !engSlotHasKey(o, 11, 0x1ef4)) engNodeAddSlot(o, 11, 1, 0x1ef4, 0);
        if (dz > 10) {
            *w = by << 19 | (*w & 0xffd7ffff) | 0x140000;
            if (dz < 0xe) *w &= 0xffbc7fff;
            else if (dz == Z_BANISH) *w &= 0xffbfffff;
        }
        if (!logReplayScene() && dz == Z_DECK) engSetPlayerFlag(cardOwner(*w), 3, 1);
        engWordCopy(&g_eng.tmpCard, w);
        if (j == (g_eng.viewer ^ 1) && by) {
            engStatAdd(0x13, 1);
            if (g_eng.turnPlayer == j) engStatAdd(0x14, 1);
            if (dz == Z_BANISH) {
                if (!engIsTokenKind(card)) {
                    engStatAdd(0x2b, 1);
                    if (cardIsMonster(cardId(g_eng.tmpCard))) engStatAdd(0x2c, 1);
                }
            } else if (dz == Z_DECK && !engIsTokenKind(card)) {
                engStatAdd(0x31, 1);
                engStatAdd(0x2f, 1);
            }
        }
        if (j == g_eng.vcc3c0 && s == g_eng.vcc3dc) g_eng.vcc424 = 0;
        else if (j == g_eng.vcc3c4 && s == g_eng.vcc3e0) g_eng.vcc46c = 0;
        uint32_t from = ((((sl.faceUp & 1) | (uint32_t)sl.def << 1) << 13 | (s & 0x1f)) << 1 | j) & 0xffff;
        uint32_t to;
        if (dz < 0xb) {
            engRemoveAt(j, s & 0x1f, 0);
            engInsertAt(j, dz & 0x1f, 1, &g_eng.tmpCard);
            to = j | (dz & 0x1f) << 1 | 0x4000;
            slotAt(j, dz & 0x1f).flags |= 0x2000;
            if ((dz & 0x1f) >= 5 && (dz & 0x1f) < 10 && engIsCrystalBeast(cardId(g_eng.tmpCard))) engMarkSpellsWith(0x1cdf);
        } else {
            uint32_t end = dz != Z_DECK, owner = cardOwner(g_eng.tmpCard);
            engRemoveAt(j, s & 0x1f, 0);
            engInsertAt(owner, dz & 0x1f, end, &g_eng.tmpCard);
            to = (engFaceUpAt(owner, dz & 0x1f, end) & 1) << 14 | (end << 5 | (dz & 0x1f)) << 1 | owner;
        }
        duelView(0x19, cardUid(g_eng.tmpCard) | 0x70000, from, to & 0xffff);
        g_eng.step++;
        return;
    }
    case 3:
        duelView(0x4a, j, cardUid(g_eng.tmpCard), 0);
        g_eng.step++;
        return;
    case 4:
        if (!duelViewBusy(0x4a)) {
            engCollapse1f08();
            g_eng.running = 0;
        }
        return;
    }
}

// @yo2 0x007102b0 0x46 tribute for a summon (view 0x2b): P0 = slot, P1 = destination zone (0xe), P2 = uid
void engCmdTribute() {
    uint32_t j = cmdPlayer(), s = g_eng.cur.p0, dz = g_eng.cur.p1, uid = g_eng.cur.p2;
    uint32_t idx = engFindUid(uid) >> 16;
    switch (g_eng.step) {
    case 0: case 2:
        if (!duelViewBusy(0x2b)) g_eng.step++;
        return;
    case 1:
        duelView(0x2b, j, s, uid);
        g_eng.vc80b4 = 0;
        g_eng.step++;
        return;
    case 3: {
        uint32_t* w = engWordAt(j, s, idx);
        uint32_t v = *w;
        *w = v & 0xffc3ffff;
        if (dz == Z_BANISH) *w = v & 0xff83ffff;
        if (logReplayScene() || dz != Z_DECK) {
            if (dz == Z_GRAVE) {
                if (!engIsTokenKind(cardId(*w))) {
                    if (s < 5 && cardIsMonster(cardId(*w))) {
                        if (j == cardOwner(*w)) slotAt(j, 11).flags |= 0x1000000;
                        if (cardLevel(cardId(*w)) > 7) engNodeAddSlot(j, 11, 1, 0x165a, 0);
                        engAddValueTo(0, 0x14bf, 1u << (cardOwner(*w) << 3));
                        engAddValueTo(1, 0x14bf, 1u << (cardOwner(*w) << 3));
                    }
                    engAddValueTo(0, 0x1361, 1u << (cardOwner(*w) << 3));
                    engAddValueTo(1, 0x1361, 1u << (cardOwner(*w) << 3));
                    if (cardIsMonster(cardId(*w))) engFlagCopies(1 - cardOwner(*w), 0x1574);
                    if (cardId(*w) == 0x1c4c) *w = (uint32_t)(s < 0xb) << 15 | (*w & 0xffff7fff);
                }
            } else if (dz == Z_BANISH && !engIsTokenKind(cardId(*w))) {
                engAddValueTo(0, 0x16da, 1);
                engAddValueTo(1, 0x16da, 1);
            }
        } else {
            engSetPlayerFlag(cardOwner(v), 3, 1);
        }
        if (j == g_eng.viewer) engStatAdd(0x20, 1);
        engWordCopy(&g_eng.tmpCard, w);
        uint32_t from = ((engFaceUpAt(j, s & 0x1f, idx & 0xff) & 1) << 14 |
                         (uint32_t)((int16_t)engDefAt(j, s & 0x1f, idx & 0xff) << 15) | (idx & 0xff) << 6 | (s & 0x1f) << 1 | j) & 0xffff;
        uint32_t owner = cardOwner(g_eng.tmpCard), end = dz != Z_DECK;
        engRemoveAt(j, s & 0x1f, idx & 0xff);
        engInsertAt(owner, dz & 0x1f, dz == Z_BANISH ? 0 : end, &g_eng.tmpCard);
        uint32_t to = ((engFaceUpAt(owner, dz & 0x1f, end) & 1) << 14 |
                       (uint32_t)((int16_t)engDefAt(owner, dz & 0x1f, end) << 15) | (end << 5 | (dz & 0x1f)) << 1 | owner) & 0xffff;
        duelView(0x19, cardUid(g_eng.tmpCard) | 0x80000, from, to);
        g_eng.step++;
        return;
    }
    default:
        engCollapse1f08();
        g_eng.running = 0;
        return;
    }
}

// @yo2 0x00710930 0x33 banish (view 0x20): P0 = zone | index << 8 (piles: found by uid), P1 = flags (bit 0 reveal,
// bits 4-5 kept on the card, bits 6-7 face-down / view record), P2 = uid. Some slot effects are remembered on the
// player (slot 11) so they come back with the card (0x41).
void engCmdBanish() {
    uint32_t j = cmdPlayer(), z = g_eng.cur.p0 & 0xff, uid = g_eng.cur.p2, f = g_eng.cur.p1;
    uint32_t idx = z < 0xb ? g_eng.cur.p0 >> 8 : engFindUid(uid) >> 16, ib = idx & 0xff, reveal = f & 1;
    switch (g_eng.step) {
    case 0:
        if (z == Z_GRAVE && engGraveIndex(j, uid) != g_eng.pl[j].graveCount - 1) {
            engGraveToTop(j, uid);
            duelView(0x17, j, Z_GRAVE, uid);
        }
        g_eng.step++;
        return;
    case 1: {
        if (duelViewBusy(0x17)) return;
        uint32_t u = cardUid(*engWordAt(j, z, idx));
        if (u) duelView(0x20, j, ib << 8 | z, u);
        else g_eng.running = 0;
        g_eng.step++;
        return;
    }
    case 2: {
        if (duelViewBusy(0x20)) return;
        uint32_t* w = engWordAt(j, z, idx);
        uint32_t v = *w, keep = (v & 0x30000) >> 16;
        if (keep < (uint32_t)((f & 0x30) != 0)) keep = 1;
        *w = keep << 16 | reveal << 19 | (v & 0xff80ffff);
        engAddValueTo(0, 0x16da, 1);
        engAddValueTo(1, 0x16da, 1);
        engWordCopy(&g_eng.tmpCard, w);
        if (z < 0xb && (f & 0xc0)) {
            EngSlot& sl = slotAt(j, z);
            uint16_t cu = (uint16_t)cardUid(sl.card);
            for (uint32_t i = sl.head; i;) {
                const EngNode e = g_eng.node[i];
                i = e.next;
                if ((e.kind & 0xf) >= 6) continue;
                switch (e.key) {
                case 0x17d2: case 0x17d5: case 0x1814: case 0x1822: case 0x185e: case 0x18af: case 0x1a1f: case 0x1a20:
                case 0x1a21: case 0x1ad7: case 0x1ad8: case 0x1add: case 0x1ade: case 0x1bed: case 0x1eaf:
                    engNodeAddSlot(j, 11, e.kind, e.key, cu);
                    break;
                }
            }
            if (sl.flags & 0x20) engNodeAddSlot(j, 11, 5, 0x14f5, cu);
            if (sl.flags & 0x40) engNodeAddSlot(j, 11, 5, 0x147f, cu);
        }
        if (j == (g_eng.viewer ^ 1) && reveal) {
            engStatAdd(0x2b, 1);
            if (cardIsMonster(cardId(g_eng.tmpCard))) engStatAdd(0x2c, 1);
        }
        uint32_t def = (uint32_t)(int8_t)engDefAt(j, z, idx), face = engFaceUpAt(j, z, idx) & 1;
        uint32_t from = (((face | def << 1) << 13 | ib << 5 | (z & 0x1f)) << 1 | j) & 0xffff;
        uint32_t owner = cardOwner(g_eng.tmpCard), cnt = g_eng.pl[owner].banishCount & 0xff;
        engRemoveAt(j, z & 0x1f, idx);
        uint32_t ins = 0;
        if (f & 0xc0) {
            ins = f & 0xc0;
            if (z < 0xb) {
                uint32_t zz = (f & 0x80) ? 0xff : z, hb = from >> 8 & 0xff;
                ins = (uint32_t)(uint8_t)((((hb >> 7) | zz << 2) << 1 | (hb >> 6 & 1)) << 1 | j) << 8 | 0x40;
            }
        }
        engInsertAt(owner, Z_BANISH, ins, &g_eng.tmpCard);
        uint32_t to = ((engFaceUpAt(owner, Z_BANISH, cnt) & 1) << 14 | (uint32_t)((int16_t)engDefAt(owner, Z_BANISH, cnt) << 15) |
                       cnt << 6 | owner | 0x1e) & 0xffff;
        duelView(0x19, cardUid(g_eng.tmpCard), from, to);
        g_eng.step++;
        return;
    }
    case 3:
        if (reveal && idx + z < 0xb) duelView(0x4a, j, cardUid(g_eng.tmpCard), 0);
        g_eng.step++;
        return;
    case 4:
        if (!duelViewBusy(0x4a)) {
            engCollapse1f08();
            g_eng.running = 0;
        }
        return;
    }
}
