// Placing and summoning command handlers (0x00713ef0..0x00716ba0).
#include "EngineInternal.h"

#include <cstring>

static EngSlot& slotAt(uint32_t j, int s) { return g_eng.pl[j & 1].slot[s]; }

// @yo2 0x00713ef0 0x4f hand -> monster zone (view 0x44, then 0x1d CARD_SET if face-down): P0 view only, P1 = slot << 1 |
// face << 14 | def << 15, P2 = uid << 1 | uses the normal summon
void engCmdHandToMonster() {
    uint32_t j = cmdPlayer(), slot = g_eng.cur.p1 >> 1 & 0x1f, face = g_eng.cur.p1 >> 14 & 1, def = g_eng.cur.p1 >> 15;
    uint32_t uid = g_eng.cur.p2 >> 1, normal = g_eng.cur.p2 & 1;
    uint32_t idx = engHandIndex(j, uid);
    switch (g_eng.step) {
    case 0:
        duelView(0x44, j, g_eng.cur.p0, face);
        g_eng.step++;
        return;
    case 1: {
        if (duelViewBusy(0x44)) return;
        engWordCopy(&g_eng.tmpCard, &g_eng.pl[j].hand[idx]);
        uint32_t shown = engHandCardShown(j, idx) & 0xff;
        uint32_t from = ((shown << 8 | (idx & 0xff)) & 0x1ff) << 6;
        engRemoveAt(j, Z_HAND, idx & 0xff);
        engPlaceCard(j, slot, &g_eng.tmpCard, (uint16_t)def, face);
        if (face) engSetSlotFlag(j, slot, 3, 1);
        if (from & 0x4000) engSetSlotFlag(j, slot, 10, 1);
        duelView(0x19, (face ? 1u : 4u) << 16 | uid, (from | j | 0x16) & 0xffff, (((face | def << 1) << 13 | slot) << 1 | j) & 0xffff);
        g_eng.step++;
        return;
    }
    case 2:
        if (engSlotHasKey(j, 11, 0x15c7)) engNodeAddSlot(j, slot, 1, 0x15c7, (uint16_t)engSlotCountKey(j, 11, 0x15c7));
        if (normal) engPlayerMark(j);
        if (g_eng.phase == 2) slotAt(g_eng.turnPlayer, 11).flags |= 0x100000;
        if (!face) duelView(0x1d, j, slot, def);
        g_eng.step++;
        [[fallthrough]];
    case 3:
        if (!duelViewBusy(0x1d)) g_eng.running = 0;
        return;
    }
}

// @yo2 0x00714230 0x50 hand -> spell/trap zone: face-down = set (CARD_SET), face-up = activate (view 0x43): P0 = card,
// P1 = slot << 1 | face << 14, P2 = uid
void engCmdHandToSpell() {
    uint32_t j = cmdPlayer(), card = g_eng.cur.p0, slot = g_eng.cur.p1 >> 1 & 0x1f, face = g_eng.cur.p1 >> 14 & 1, uid = g_eng.cur.p2;
    uint32_t idx = engHandIndex(j, uid);
    switch (g_eng.step) {
    case 0:
        duelView(0x44, j, card, face);
        g_eng.step++;
        return;
    case 1: {
        if (duelViewBusy(0x44)) return;
        engWordCopy(&g_eng.tmpCard, &g_eng.pl[j].hand[idx]);
        uint32_t from = ((face << 8 | (idx & 0xff)) << 6 | j | 0x16) & 0xffff;
        engRemoveAt(j, Z_HAND, idx & 0xff);
        engPutCard(j, slot, &g_eng.tmpCard, face);
        if (face) engSetSlotFlag(j, slot, 1, 1);
        duelView(0x19, (face ? 3u : 4u) << 16 | uid, from, ((face << 13 | slot) << 1 | j) & 0xffff);
        g_eng.step++;
        return;
    }
    case 2:
        if (!face) {
            if (g_eng.phase == 2) slotAt(g_eng.turnPlayer, 11).flags |= 0x100000;
            if (cardRace(card) == 0x16)
                for (uint32_t p = 0; p < 2; p++)
                    for (int k = 5; k < 10; k++)
                        if (engSlotIsLive(p, k, 0x1390)) engNodeAddSlot(j, slot, 8, (uint16_t)(k << 8 | p), 0);
            duelView(0x1d, j, slot, 0);
            if (j == g_eng.viewer) engStatAdd(0x1f, 1);
            g_eng.step++;
            return;
        }
        if (cardRace(card) == 0x16) engSetPlayerFlag(j, 0x19, 1);
        if (cardRace(card) == 0x17) engSetPlayerFlag(j, 0x1a, 1);
        engSetSlotFlag(j, slot, 0x1c, 1);
        if (card == 0xfee) engPlayerMark(j);
        if (cardRace(card) == 0x17) engNodeAddSlot(j, 11, 1, 0x198a, 1);
        duelView(0x43, j, uid | 0x8000, 2);
        g_eng.step++;
        return;
    case 3:
        if (!duelViewBusy(0x1d) && !duelViewBusy(0x43)) g_eng.running = 0;
        return;
    }
}

// @yo2 0x00714620 0x45 summon finished: clears flag 3 "being summoned", records how it was summoned and counts it.
// P0 = slot, P1 bits: 1 keep bit 15, 2 special, 4 set, 8 flip, 0x10 hints go to the other side; P2 != 0 flag 5
void engCmdSummoned() {
    uint32_t j = cmdPlayer(), s = g_eng.cur.p0, f = g_eng.cur.p1, p2 = g_eng.cur.p2;
    EngSlot& sl = slotAt(j, s);
    uint32_t c = cardId(sl.card), hintTo = (f & 0x10) ? 1 - j : j;
    if ((f & 1) && engNoNormalSummon(c)) sl.card |= 0x8000;
    bool counted = false;
    if (f & 4) {
        sl.flags |= 0x40040;
        counted = true;
    } else if (f & 2) {
        sl.flags |= 0x20000;
        counted = sl.faceUp != 0;
    } else {
        if (f & 8) sl.flags |= 0x4000;
        if (p2) sl.flags |= 0x20;
        if (sl.faceUp) {
            sl.flags |= 0x10000;
            slotAt(j, 11).flags |= 0x200000;
            counted = true;
        }
    }
    if (counted) {
        if (c != 0xf60) {
            uint32_t& n = g_eng.pl[j].v20;
            if (!(g_eng.flags & 8)) n++;
            else n |= 0x10000;
        }
        if (engIsCloudian(c)) engNodeAddSlot(j, 11, 2, 0x1c67, engSlotHasKeyValue(j, 11, 0x1c67, c) ? 1 : (uint16_t)c);
    }
    if (hintTo == g_eng.viewer) {
        if (!(f & 4)) {
            if (!(f & 2)) {
                if (f & 8) engStatAdd(0x19, 1);
                if (p2) engStatAdd(0x1b, 1);
                engStatAdd(sl.faceUp ? 0x16 : 0x1e, 1);
                engStatAdd(0x17, 1);
            } else {
                engStatAdd(0x18, 1);
            }
        } else {
            engStatAdd(0x1c, 1);
            if (!sl.faceUp) engStatAdd(0x1e, 1);
            if (engIsTokenKind(c)) engStatAdd(0x1a, 1);
        }
        if ((sl.faceUp || (f & 4)) && (!engNoNormalSummon(c) || (f & 1))) engStatCard(c);
    }
    engSetSlotFlag(j, s, 3, 0);
    engCollapse1f08();
    duelView(0x25, 0, 0, 0);
    g_eng.running = 0;
}

// @yo2 0x00714970 0x4a tribute marker (view 0x29): P0 = slot
void engCmdTributeMark() {
    uint32_t j = cmdPlayer(), s = g_eng.cur.p0;
    duelView(0x29, j, s, cardUid(slotAt(j, s).card));
    g_eng.running = 0;
}

// @yo2 0x00714a00 0x4b fusion material marker (view 0x2c): P0 = zone, P1 = material index, P2 = uid
void engCmdMaterialMark() {
    uint32_t* w = engWordOfUid(g_eng.cur.p2);
    g_eng.deckList.card[g_eng.cur.p1] = w ? *w : 0;   // the original reads through a null pointer for an unknown uid
    duelView(0x2c, cmdPlayer(), g_eng.cur.p0, (uint32_t)g_eng.cur.p1 << 16 | g_eng.cur.p2);
    g_eng.running = 0;
}

// @yo2 0x00714a90 0x4c start of a material (view 0x2e): P0 = zone (0x10: only mark a pile card), P1 = index, P2 = uid
void engCmdMaterialStart() {
    uint32_t j = cmdPlayer(), zone = g_eng.cur.p0, idx = g_eng.cur.p1, uid = g_eng.cur.p2;
    switch (g_eng.step) {
    case 0: {
        uint32_t* w = engWordOfUid(uid);
        g_eng.deckList.card[idx] = w ? *w : (((uid >> 1) & 0xff) << 9 | (uid & 1)) << 14 | (g_eng.uid[uid].card & 0x3fff);
        if (zone == 0x10) {
            uint32_t at = engFindUid(uid) >> 8 & 0xff;
            if (at == Z_GRAVE || at == Z_BANISH) *w = (*w & 0xfffdffff) | 0x10000;
            g_eng.running = 0;
            return;
        }
        g_eng.step++;
        if (zone == Z_GRAVE && engGraveIndex(j, uid) != g_eng.pl[j].graveCount - 1) {
            engGraveToTop(j, uid);
            duelView(0x17, j, Z_GRAVE, uid);
            return;
        }
        [[fallthrough]];
    }
    case 1:
        if (!duelViewBusy(0x17)) {
            duelView(0x2e, j, zone, idx << 16 | uid);
            g_eng.step++;
        }
        return;
    case 2:
        if (!duelViewBusy(0x2e)) g_eng.running = 0;
        return;
    }
}

// @yo2 0x00714c90 0x4d RUN_FUSION (views 0x41 + 0x36): P1 = uid of the fusion monster, P2 = material count | flag << 8;
// without the flag each material is remembered on the monster (type 3 node 0x12e5)
void engCmdFusion() {
    uint32_t j = cmdPlayer(), uid = g_eng.cur.p1, n = g_eng.cur.p2 & 0xff, flag = g_eng.cur.p2 >> 8;
    switch (g_eng.step) {
    case 0:
        duelView(0x41, j, uid, flag);
        g_eng.step++;
        return;
    case 1:
        if (duelViewBusy(0x41)) return;
        if (!flag)
            for (uint32_t i = 0; i < n; i++) engNodeAddUid((int)uid, 3, 0x12e5, (uint16_t)cardUid(*engListCard(i)));
        duelView(0x36, j, uid, flag << 16 | n);
        g_eng.step++;
        return;
    default:
        if (duelViewBusy(0x36)) return;
        if (j == g_eng.viewer && !flag) engStatAdd(0x28, 1);
        g_eng.running = 0;
        return;
    }
}

// @yo2 0x00714e00 0x60 view 0x40: the NPC's "summons" phrase (P0 = internal id or 0x8000 | uid), then view 9
void engCmdSummonPhrase() {
    if (g_eng.step == 0) {
        duelView(0x40, cmdPlayer(), g_eng.cur.p0, (g_eng.cur.p1 & 0xff) << 8 | (g_eng.cur.p2 & 0xff));
        g_eng.step++;
    }
    if (!duelViewBusy(0x40)) {
        duelView(9, 0, 0, 0);
        g_eng.running = 0;
    }
}

// @yo2 0x00714ea0 0x49 MONST_SHUFFLE: shuffle the monsters of the slots in mask P2 with seed P1 << 16 | P0 (records
// and the links pointing at them move together)
void engCmdShuffleMonsters() {
    uint32_t j = cmdPlayer(), mask = g_eng.cur.p2;
    if (g_eng.step == 1) {
        if (!duelViewBusy(0x28)) g_eng.running = 0;
        return;
    }
    if (g_eng.step != 0) return;
    int to[5], from[5], n = 0;
    for (int s = 0; s < 5; s++)
        if (mask >> s & 1) to[n] = from[n] = s, n++;
    if (n < 2) {
        g_eng.running = 0;
        return;
    }
    g_eng.seed = (uint32_t)g_eng.cur.p1 << 16 | g_eng.cur.p0;
    for (int i = n - 1, k = n; i > 0; i--, k--) {
        int r = engRandN(k);
        int t = to[i];
        to[i] = to[r];
        to[r] = t;
    }
    EngSlot saved[5];
    for (int i = 0; i < n; i++) engNodeRetarget((uint32_t)from[i] << 8 | j, (uint16_t)(from[i] << 8 | (j + 2)));
    for (int i = 0; i < n; i++) saved[from[i]] = slotAt(j, from[i]);
    for (int i = 0; i < n; i++) slotAt(j, to[i]) = saved[from[i]];
    for (int i = 0; i < n; i++) engNodeRetarget((uint32_t)from[i] << 8 | (j + 2), (uint16_t)(to[i] << 8 | j));
    for (int i = 0; i < n; i++) slotAt(j, to[i]).flags &= ~0x400u;
    duelView(0x28, j, mask, 0);
    g_eng.step++;
}

// @yo2 0x007151b0 0x61 view 0x45 with P0 / P1
void engCmdView45() {
    if (g_eng.step == 0) {
        duelView(0x45, cmdPlayer(), g_eng.cur.p0, g_eng.cur.p1);
        g_eng.step++;
    }
    if (!duelViewBusy(0x45)) g_eng.running = 0;
}

// @yo2 0x00715230 0x2c the NORMAL summon effect (view 0x34, summon.txt): P1 = slot, P2 = summon type (2 = special:
// flags 3 and 21) | uses the normal summon << 8
void engCmdSummonEffect() {
    uint32_t j = cmdPlayer(), s = g_eng.cur.p1, type = g_eng.cur.p2 & 0xff, normal = g_eng.cur.p2 >> 8;
    switch (g_eng.step) {
    case 0:
        if (type == 2) {
            slotAt(j, s).flags |= 0x200008;
            if (normal) engPlayerMark(j);
            if (g_eng.phase == 2) slotAt(g_eng.turnPlayer, 11).flags |= 0x100000;
        }
        g_eng.step++;
        [[fallthrough]];
    case 1:
        if (duelViewBusy(-1)) return;
        duelView(0x34, ((uint32_t)(slotAt(j, s).def & 1) << 14 | 0x2000 | (s & 0x1f)) << 1 | j, cardUid(slotAt(j, s).card), type);
        g_eng.step++;
        return;
    case 2:
        if (!duelViewBusy(0x34)) g_eng.running = 0;
        return;
    }
}

static bool logReplayScene() {
    int s = ndLogScene();
    return s == 0xc9 || s == 0xca || s == 0xd2 || s == 0xd3 || s == 0xd4;
}

// @yo2 0x007153f0 0x2d summon by uid (views 0x19 + 0x35 RUN_SUMMON, reborn.wav): P0 = destination j | slot << 1 |
// flags << 6 | face-up << 14 | defense << 15, P1 = uid, P2 = the slot's value
void engCmdSummon() {
    uint32_t p0 = g_eng.cur.p0, uid = g_eng.cur.p1, value = g_eng.cur.p2;
    uint32_t dj = p0 & 1, slot = p0 >> 1 & 0x1f, face = p0 >> 14 & 1, def = p0 >> 15;
    uint32_t card = g_eng.uid[uid].card;
    uint32_t dest = ((face | def * 2) << 13 | slot) << 1;
    switch (g_eng.step) {
    case 0: {
        if (duelViewBusy(-1)) return;
        uint32_t at = engFindUid(uid), sj = at & 1, sz = at >> 8 & 0xff, si = at >> 16 & 0xff;
        g_eng.vc80b4 = (int32_t)sz;
        uint32_t* w = engWordAt(at & 0xff, sz, at >> 16);
        *w &= 0xff8bffff;
        engWordCopy(&g_eng.tmpCard, w);
        if (dj == g_eng.viewer && sz == Z_GRAVE) engStatAdd(0x1d, 1);
        uint32_t src = ((sz & 0x1f) | si << 5) << 1;
        int def0 = (int16_t)engDefAt(sj, sz & 0x1f, si);
        uint32_t face0 = engFaceUpAt(sj, sz & 0x1f, si) & 1;
        int stolen = 0;
        if ((src & 0x3e) < 0x15) {
            EngUid& u = g_eng.uid[uid];
            u.moves = (uint16_t)((u.moves & ~3) | ((u.moves - 1) & 3));
            stolen = engSlotHasKey(sj, sz & 0x1f, 0x1c40);
        }
        engRemoveAt(sj, sz & 0x1f, si);
        engInsertAt(dj, slot, (def & 0xff) << 8 | face, &g_eng.tmpCard);
        engSetSlotFlag(dj, slot, 3, 1);
        if ((src & 0x3e) < 0x15 && stolen) engNodeAddSlot(dj, slot, 3, 0x1c40, 0);
        duelView(0x19, cardUid(g_eng.tmpCard) | 0x20000, (face0 << 14 | (uint32_t)(def0 << 15) | src | sj) & 0xffff,
                 (dest | dj) & 0xffff);
        if (!logReplayScene()) slotAt(dj, slot).value = value;
        engSetSlotFlag(dj, slot, 10, 1);
        g_eng.step++;
        return;
    }
    case 1:
        if (p0 & 0x3fc0) {
            switch (card) {
            case 0x18b4: case 0x18fb: case 0x1a4e:
                if (logReplayScene()) slotAt(dj, slot).value = value;
                break;
            case 0x1472: case 0x1636: case 0x172f: case 0x1809: case 0x1aca:
                engNodeAddSlot(dj, slot, 5, 0x1472, (uint16_t)value);
                slotAt(dj, slot).flags |= 0x1000;
                break;
            }
        }
        if (g_eng.phase == 2) slotAt(g_eng.turnPlayer, 11).flags |= 0x100000;
        if (++g_eng.vcc32c > 99) slotAt(dj, 11).flags |= 0x400000;
        if (g_eng.vc80b4 == Z_HAND && engSlotHasKey(dj, 11, 0x15c7))
            engNodeAddSlot(dj, slot, 1, 0x15c7, (uint16_t)engSlotCountKey(dj, 11, 0x15c7));
        engCollapse1f08();
        duelView(0x25, 0, 0, 0);
        duelView(0x35, dest | dj, cardUid(slotAt(dj, slot).card), 0);
        g_eng.step++;
        return;
    case 2:
        if (!duelViewBusy(0x35)) g_eng.running = 0;
        return;
    }
}

// @yo2 0x00715b60 0x48 create a token (views 0x1c + 0x35): P0 = destination j | slot << 1 | face << 14 | def << 15,
// P1 = internal id, P2 = value. The token takes the next serial of the command's player.
void engCmdToken() {
    uint32_t p0 = g_eng.cur.p0, dj = p0 & 1, slot = p0 >> 1 & 0x1f, face = p0 >> 14 & 1, def = p0 >> 15;
    uint32_t card = g_eng.cur.p1;
    uint32_t packed = ((def * 2 | face) << 13 | slot) << 1 | dj;
    switch (g_eng.step) {
    case 0: {
        uint32_t w = cmdPlayer() << 14 | (card & 0x3fff);
        uint32_t serial = engNextSerial(cmdPlayer()) & 0xff;
        g_eng.uid[((w & 0x4000) >> 14) + serial * 2].card = (uint16_t)card;
        w = serial << 23 | (w & 0x807fffff);
        g_eng.uid[cardUid(w)].propIndex = (uint16_t)cardPropIndex((int)card);
        engPlaceCard(dj, slot, &w, (uint16_t)def, face);
        EngSlot& sl = slotAt(dj, slot);
        sl.flags |= 0x200040;
        sl.value = g_eng.cur.p2;
        duelView(0x1c, packed, card, cardUid(sl.card));
        g_eng.step++;
        return;
    }
    case 1:
        duelView(0x35, packed, cardUid(slotAt(dj, slot).card), 0);
        g_eng.step++;
        return;
    case 2:
        if (!duelViewBusy(0x35)) g_eng.running = 0;
        return;
    }
}

// @yo2 0x00715e20 0x47 replace a slot's counter node (view 0x27): P0 = slot, P1 = value, P2 = key
void engCmdCounterNode() {
    uint32_t j = cmdPlayer(), s = g_eng.cur.p0, value = g_eng.cur.p1, key = g_eng.cur.p2;
    if (g_eng.step == 0) {
        if (cardId(slotAt(j, s).card)) {
            uint8_t old = (uint8_t)engSlotKeyValue(j, s, key);
            engNodeFreeKeyLo(slotAt(j, s).head, (uint16_t)key, 1);
            engNodeAddSlot(j, s, 3, (uint16_t)key, (uint16_t)value);
            if (!logReplayScene()) value = (uint32_t)old << 8 | (value & 0xff);
            duelView(0x27, j, s, value);
        }
        g_eng.step++;
    } else if (g_eng.step == 1 && !duelViewBusy(0x27)) {
        g_eng.running = 0;
    }
}

// @yo2 0x00715fa0 0x07 light the Exodia pieces on the field (view 0x3c; the exe's table at 0x00beb800)
void engCmdExodiaPieces() {
    static const uint32_t pieces[5] = {0x1468, 0x1497, 0x1498, 0x1499, 0x149a};
    uint32_t j = cmdPlayer();
    if (g_eng.step) {
        if (!duelViewBusy(0x3c)) g_eng.running = 0;
        return;
    }
    for (int n = 0; n < 5; n++)
        for (int k = 5; k < 10; k++)
            if (cardId(slotAt(j, k).card) == pieces[n]) {
                duelView(0x3c, j, k, 1u << 8 | n);
                break;
            }
    g_eng.step++;
}

static void playerView(int view) {
    if (g_eng.step == 0) {
        duelView(view, cmdPlayer(), 0, 0);
        g_eng.step++;
        return;
    }
    if (!duelViewBusy(view)) g_eng.running = 0;
}

// @yo2 0x00716090 0x08 view 0x3a
void engCmd08() { playerView(0x3a); }
// @yo2 0x00716100 0x06 EXODIA (view 0x3b)
void engCmdExodia() { playerView(0x3b); }

// @yo2 0x00716170 0x68 chain table entry: P2 != 0 appends (player, zone P0, uid P1) unless it repeats the last entry;
// P2 == 0 empties the table
void engCmdChainEntry() {
    if (g_eng.step) return;
    uint32_t j = cmdPlayer(), zone = g_eng.cur.p0, uid = g_eng.cur.p1;
    if (!g_eng.cur.p2) {
        g_eng.vc8868 = 0;
        memset(&g_eng.chain[1], 0, 0x1c0);
        g_eng.running = 0;
        return;
    }
    uint32_t n = g_eng.vc8868;
    if (n) {
        const EngChain& c = g_eng.chain[n];
        if ((c.bits & 1) == j && (c.bits >> 1 & 0x1f) == zone && (c.w4 >> 6 & 0x1ff) == uid) {
            g_eng.running = 0;
            return;
        }
    }
    n = ++g_eng.vc8868;
    EngChain& c = g_eng.chain[n];   // the original has no bound past 16
    c.bits = (uint16_t)(((c.bits & 0xffc0) ^ j) | (zone & 0x1f) << 1);
    c.w0 = g_eng.uid[uid].card;
    c.w4 = (uint16_t)((uid & 0x1ff) << 6 | (c.w4 & 0x803f));
    g_eng.running = 0;
}

// @yo2 0x007162d0 0x18 a bare `ret`: the command never finishes (the server never sends it)
void engCmd18() {}

// @yo2 0x007162f0 0x23 the player's LP drop to 0 and the duel ends with reason P0 for the opponent (views 0x31 + 0xe)
void engCmdLoseLp() {
    uint32_t j = cmdPlayer(), reason = g_eng.cur.p0;
    if (g_eng.step == 0) {
        if (reason != 0xd) duelView(0x31, j, reason, 0);
        duelView(0xe, j, 0, 0);
        g_eng.step++;
    } else if (g_eng.step == 1) {
        if (reason != 0xd && duelViewBusy(0x31)) return;
        g_eng.running = 0;
        g_eng.vcca6c = reason;
        g_eng.pl[j].lp = 0;
        g_eng.pl[(1 - j) & 1].endReason = reason;
        g_eng.vcc330 = 1;
        g_eng.result = (j == g_eng.viewer) + 1;
    }
}

static void lpStats() {
    engStatMax(8, g_eng.pl[g_eng.viewer & 1].lp);
    engStatMax(9, g_eng.pl[~g_eng.viewer & 1].lp - g_eng.pl[g_eng.viewer & 1].lp);
    duelView(9, 0, 0, 0);
}

// @yo2 0x00716440 LP change (views 0xf LIFE_DAMAGE and 0x49): gain = 1 for 0x24, 0 for 0x25. P0 = amount, P1 = type
// (0 battle, 1 effect, 2 cost), P2 = the card that caused it (internal id). Also feeds the duel statistics.
void engCmdLp(int gain) {
    uint32_t j = cmdPlayer(), type = g_eng.cur.p1, card = g_eng.cur.p2;
    int d = gain ? (int)g_eng.cur.p0 : -(int)g_eng.cur.p0;
    int32_t& lp = g_eng.pl[j].lp;
    uint32_t opp = g_eng.viewer ^ 1;
    switch (g_eng.step) {
    case 0:
        duelView(0xf, j, (uint32_t)d, (type & 0xff) << 8 | 1);
        if (lp > 0 && lp <= -d) {   // lethal
            g_eng.vcc334 = card;
            switch (card) {
            case 0x16ec: case 0x1725: case 0x1729: case 0x1985: case 0x1986: case 0x1b2e: case 0x1b2f: case 0x1cce:
            case 0x1ccf: case 0x1f38: case 0x1f39:
                if (g_eng.vcc3c8 && g_eng.turnPlayer != j) g_eng.pl[(1 - j) & 1].v2c = card;
            }
        }
        if (j == opp && d < 0) {   // damage dealt to the opponent
            int a = -d;
            if (type == 1) {
                engStatMax(0xd, a);
                engStatAdd(1, a);
                engStatAdd(5, a);
                engStatMax(4, engStatGet(5));
                if (g_eng.vcc3c8) {
                    engStatAdd(3, a);
                    if (engIsToonKind(card)) engStatAdd(6, a);
                }
                if (g_eng.turnPlayer == opp) {
                    engStatMax(0xe, a);
                    engStatAdd(2, a);
                }
                if (lp > 0 && lp <= a) engStatSet(0xf, -d);
            } else if (type == 0) {
                engStatMax(0xc, a);
                engStatAdd(0, a);
                engStatAdd(5, a);
                engStatMax(4, engStatGet(5));
                if (lp > 0 && lp <= a) engStatSet(0xf, -d);
            }
            engStatSet(0x3c, lp == -d);
        }
        if (j == g_eng.viewer) {
            if (d < 0) engStatSet(0x3b, 1);
            if (d > 0) engStatAdd(7, d);
        }
        g_eng.step++;
        return;
    case 1:
        if (duelViewBusy(0xf)) return;
        duelView(0x49, j, (uint32_t)d, type);
        g_eng.vc80b4 = 0;
        g_eng.step++;
        return;
    case 2:
        if (!duelViewBusy(0x49) && ++g_eng.vc80b4 > 10) g_eng.step++;
        return;
    case 3:
        duelView(0xf, j, (uint32_t)d, (type & 0xff) << 8);
        g_eng.step++;
        return;
    case 4:
        if (duelViewBusy(0xf)) return;
        if (d < 0) lp = lp + d < 0 ? 0 : lp + d;
        else if (lp) lp += d;
        if (type == 2 && j == g_eng.turnPlayer) engNodeAddSlot(j, 11, 0x21, 0x14c0, (uint16_t)-d);
        lpStats();
        g_eng.running = 0;
        return;
    }
}

// @yo2 0x00716420 0x24 gain P0 LP
void engCmdLpGain() { engCmdLp(1); }
// @yo2 0x00716a00 0x25 lose P0 LP
void engCmdLpLose() { engCmdLp(0); }

// @yo2 0x00716a20 0x26 LIFE_SET: P0 = LP (view 0xe)
void engCmdLpSet() {
    uint32_t j = cmdPlayer();
    if (g_eng.step == 0) {
        duelView(0xe, j, g_eng.cur.p0, 0);
        g_eng.step++;
    } else if (g_eng.step == 1 && !duelViewBusy(0xe)) {
        int32_t old = g_eng.pl[j].lp;
        g_eng.pl[j].lp = g_eng.cur.p0;
        if (j == g_eng.viewer && (int)g_eng.cur.p0 < old) engStatSet(0x3b, 1);
        lpStats();
        g_eng.running = 0;
    }
}

// @yo2 0x00716ba0 0x27 LIFE_RESET (view 0x10): clears the player's pending LP record (0x012cc480, 2 x 0x14)
void engCmdLpReset() {
    for (int i = 0; i < 2; i++) {
        uint32_t* rec = engAt(0x012cc480 + i * 0x14);
        if (rec[3] == cmdPlayer()) {
            rec[0] = 0;
            break;
        }
    }
    duelView(0x10, 0, 0, 0);
    g_eng.running = 0;
}
