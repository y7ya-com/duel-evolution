// Engine helpers of the 0x0071e000..0x00723000 block (the interface between the engine and the duel scene).
#include "EngineInternal.h"

// @yo2 0x00720240 the i-th card of the 0x6610 deck list
uint32_t* engListCard(int i) { return &g_eng.deckList.card[i]; }

// @yo2 0x007208b0 cards in a pile (0 for the hand and the field)
uint32_t engPileCount(uint32_t j, int zone) {
    EngPlayer& p = g_eng.pl[j & 1];
    switch (zone) {
    case Z_EXTRA: return p.extraCount;
    case Z_DECK: return p.deckCount;
    case Z_GRAVE: return p.graveCount;
    case Z_BANISH: return p.banishCount;
    }
    return 0;
}

// @yo2 0x00720160 how many cards the deck-list window lets the player pick, from its mode
uint32_t engListPickCount() {
    const DuelCardList& l = g_eng.deckList;
    uint32_t m = l.mode, n = 1;
    if (m < 6) return 0;
    if (m == 0x26 || m == 0x47 || m == 0x48) return l.count;
    if (m >= 7 && m <= 0x25) n = m - 6;
    else if (m > 0x27 && m < 0x47) n = m - 0x27;
    return n < l.count ? n : l.count;
}

// @yo2 0x007201d0
int engListBusy() { return duelViewBusy(0x33); }

// @yo2 0x007201f0 the player picked entry i
void engListSelect(uint32_t i) {
    g_eng.deckList.x = i;
    ndSendNumber(i);
}

// @yo2 0x00720220
uint32_t* engListSelected() { return &g_eng.deckList.card[g_eng.deckList.x]; }
// @yo2 0x00720260
uint32_t engListSelectedZone() { return g_eng.deckList.info[g_eng.deckList.x] & 0x1f; }
// @yo2 0x00720280
uint32_t engListCount() { return g_eng.deckList.count; }

// @yo2 0x007202a0 the id the list shows for entry i (face-down banished cards of the opponent stay hidden)
uint32_t engListShownId(int i) {
    const DuelCardList& l = g_eng.deckList;
    uint32_t owner = l.card[i] >> 14 & 1;
    if (l.mode == 4) {
        if (owner != (g_eng.viewer ^ 1)) return l.card[i] & 0x3fff;
        if (!engFaceUpAt(owner, Z_BANISH, i)) return 0;
    }
    if (l.mode == 0x4a) return 0;
    return l.card[i] & 0x3fff;
}

// @yo2 0x00720320
uint32_t engListZone(int i) { return g_eng.deckList.info[i] & 0x1f; }

// @yo2 0x00720340 the deck-list window's flags for entry i: where it is (2 hand, 0x10 extra, 4 deck, 8 graveyard,
// 0x20 banished, 1 field), 0x80 can't be summoned from there, 0x100/0x200 position, 0x2000 node 0x1d6f, 0x40 bit 22,
// 0x400/0x800 banished face-down kinds, 0x1000 targeted by a chain link, 0x8000 the opponent's; y's bits clear flags
uint32_t engListFlags(uint32_t i) {
    const DuelCardList& l = g_eng.deckList;
    uint32_t w = l.card[i], owner = w >> 14 & 1, uid = cardUid(w), zone = l.info[i] & 0x7f, f;
    switch (zone) {
    case 0xb: f = 2; break;
    case 0xc: f = 0x10; break;
    case 0xd: f = 4; break;
    case 0xe: f = 8; break;
    case 0xf: f = 0x20; break;
    case 0x10: f = 0; break;
    default: f = 1;
    }
    if (zone == 0xe || zone == 0xf) {
        if (cardIsMonster((int)cardId(w)) && !(l.y & 0x80)) {
            int ok = zone == 0xe ? engMaySummonFromGrave(g_eng.viewer, owner, (int)engGraveIndex(owner, uid))
                                 : engMaySummonFromBanish(g_eng.viewer, owner, (int)engBanishIndex(owner, uid));
            if (!ok) f |= 0x80;
        }
        uint32_t pos = w >> 16 & 3;
        if (pos == 1) f |= 0x200;
        else if (pos == 2) f |= 0x100;
        if (engUidHasKey((int)uid, 0x1d6f)) f |= 0x2000;
        if (w & 0x400000) f |= 0x40;
    }
    if (zone == 0xf) {
        uint32_t at = engFindUid(uid);
        if ((at >> 8 & 0xff) == 0xf) {
            uint8_t v = g_eng.pl[at & 1].banishView[at >> 16][0];
            if (v == 0x40) f |= 0x400;
            else if (v == 0x80) f |= 0x800;
            else if (v == 0xc0) f = 0x800 | (f & 0x3f);
        }
    }
    for (int n = g_eng.chainCount; n >= 1; n--) {
        const EngChain* c = &g_eng.chain[n];
        for (int t = 0; t < (c->w6 & 0x7f); t++)
            if (engChainTargetUid(c, t) == uid && (engChainTarget(c, t) >> 8 & 0xff) == zone) f |= 0x1000;
    }
    if (l.mode == 0x4a) f &= 0x1f;
    if (owner == (g_eng.viewer ^ 1)) f |= 0x8000;
    for (uint32_t b = 1; b < 0x8000; b <<= 1)
        if (b & l.y) f &= ~b;
    return f;
}

// @yo2 0x007206e0 set entry i's pick order (high byte of its info word) and tell the server
void engListSetOrder(int i, int v) {
    if (i >= 0x1000) return;
    g_eng.deckList.info[i] = (uint16_t)((g_eng.deckList.info[i] & 0x1f) + (v << 8));
    ndSendCardValue((uint32_t)i, (uint32_t)v);
}

// @yo2 0x00720730
uint32_t engListOrder(int i) { return g_eng.deckList.info[i] >> 8; }

// @yo2 0x00720760 un-pick order v: that entry goes to 0, later ones move up
void engListUnpick(int v) {
    for (uint32_t i = 0; i < g_eng.deckList.count; i++) {
        int o = (int)engListOrder((int)i);
        if (o == v) engListSetOrder((int)i, 0);
        else if (v < o) engListSetOrder((int)i, o - 1);
    }
}

// @yo2 0x007207b0 select the entry picked in order v (-1 = none)
void engListSelectOrder(uint32_t v) {
    DuelCardList& l = g_eng.deckList;
    for (l.x = 0; l.x < l.count; l.x++)
        if (v == (uint32_t)(l.info[l.x] >> 8)) return;
    l.x = 0xffffffff;
}

// @yo2 0x00720800 the card picked in order v (one past the list when none)
uint32_t* engListOrderCard(uint32_t v) {
    const DuelCardList& l = g_eng.deckList;
    uint32_t i = 0;
    while (i < l.count && v != (uint32_t)(l.info[i] >> 8)) i++;
    return &g_eng.deckList.card[i];
}

// @yo2 0x00720990 once the log has nothing pending, queue command 0x0b for the viewer (start of the duel proper)
void engStartWhenReady() {
    if (g_eng.vcc2d8 == 0xffff && !engLogPending()) {
        g_eng.vcc2d8 = g_eng.turn;
        engQueue((uint16_t)((g_eng.viewer ? 0x8000 : 0) | 0xb), 0, 0, 0);
    }
}

// @yo2 0x00720a00 player j surrendered: queue duel end (0x23, reason 0xd) once
void engSurrender(int j) {
    if (g_eng.vca4c4) return;
    g_eng.result = (uint32_t)(j == (int)g_eng.viewer) + 1;
    g_eng.vca4c4 = 1;
    engQueue((uint16_t)((j ? 0x8000 : 0) | 0x23), 0xd, 0, 0);
}

// @yo2 0x00720a70 all five Exodia pieces in hand
int engExodiaInHand(uint32_t j) {
    for (int c = 0xfb7; c <= 0xfbb; c++)
        if (!engHandCountCard(j, c)) return 0;
    return 1;
}

// @yo2 0x00720b00 Destiny Board and its four letters on the field
int engDestinyBoardDone(uint32_t j) {
    if (!engCountLive(j, 0x1468, -1)) return 0;
    for (int c = 0x1497; c <= 0x149a; c++)
        if (engFindSpellText(j, c) < 0) return 0;
    return 1;
}

// @yo2 0x00720cc0 why player j has won (0 = not yet): 2 opponent decked out, 3 Exodia, 4 Destiny Board, 6 (0x151e),
// 7 (0x169c), 8 v2c, 1 opponent at 0 LP, 0xb ahead on LP after the turn limit
int engWinReason(uint32_t j) {
    const EngPlayer& me = g_eng.pl[j & 1];
    const EngPlayer& op = g_eng.pl[1 - (j & 1)];
    if (op.deckOut) return 2;
    if (me.deckOut) return 0;
    if (engExodiaInHand(j)) return 3;
    if (engDestinyBoardDone(j)) return 4;
    if (engSlotHasNode(g_eng.turnPlayer, 0xb, 0x151e, 5)) {
        g_eng.vca4c4 = 1;
        return engCountMonsters(j) < 1 ? 0 : 6;
    }
    if (engSlotHasNode(j, 0xb, 0x169c, 1)) return 7;
    if (me.v2c) return 8;
    if (op.lp == 0) return 1;
    if (g_eng.vcc2d8 + 4 <= g_eng.turn && op.lp < me.lp) return 0xb;
    return 0;
}

// @yo2 0x00720ba0 has the duel ended: records both players' reasons and the result (1 viewer won, 2 lost, 3 both)
int engCheckDuelEnd() {
    uint32_t v = g_eng.viewer;
    if (g_eng.vcc2f0 && g_eng.turnPlayer == (v ^ 1)) return 0;
    int a = engWinReason(v), b = engWinReason(v ^ 1);
    if (!a && !b && !g_eng.vca4c4) return 0;
    g_eng.pl[v & 1].endReason = (uint32_t)a;
    g_eng.pl[~v & 1].endReason = (uint32_t)b;
    g_eng.result = a && !b ? 1 : !a && b ? 2 : 3;
    g_eng.vca4c4 = 1;
    return 1;
}

// @yo2 0x00720e70
void engNop() {}

// @yo2 0x00720e90
void engPhaseStepsDone() {
    g_eng.vcc300 = 2;
    g_eng.subPhase = 0;
}

// @yo2 0x00722420
int engPhaseStep0() { return 1; }
// @yo2 0x00722650
int engPhaseStep2() { return 0; }

// @yo2 0x00722440 the draw-phase step (subPhase is its state): queue the draw (0x0e) unless skipped
int engPhaseStepDraw() {
    uint32_t tp = g_eng.turnPlayer, f = g_eng.pl[tp & 1].slot[11].flags;
    int skip = engSlotHasKey(tp, 0xb, 0x13b1);
    switch (g_eng.subPhase) {
    case 0:
        g_eng.vcc31c = 0;
        if (f >> 23 & 1) return 1;
        if (!skip) {
            engQueue((uint16_t)((tp ? 0x8000 : 0) | 0xe), 0, 0, 0);
            g_eng.subPhase++;
            g_eng.vcc350 = 0;
        } else g_eng.subPhase = 10;
        return 0;
    case 1:
        if (g_eng.vcc2e8) engAskMessage((int)tp, 5);
        g_eng.subPhase++;
        [[fallthrough]];
    case 2: case 0x15:
        g_eng.subPhase++;
        return 0;
    case 3:
        if (!g_eng.vcc350) {
            g_eng.subPhase = 0x14;
            return 0;
        }
        g_eng.vcc354 = 1;
        g_eng.subPhase--;
        return 0;
    case 10:
        engAskMessage((int)tp, 0x135);
        g_eng.subPhase++;
        return 0;
    case 0x14:
        g_eng.subPhase = g_eng.vcc33c == 5 ? 0x1e : 2;
        return 0;
    case 0x1e:
        return 1;
    }
    return 0;
}

// @yo2 0x00720ec0 run the current phase's step function (table at 0x00cba4f0, indexed by cc304); 1 = no step left.
// The table runs on into the duel-program table at 0x00cba500, so steps 4..6 are those (as the exe reads them).
int engPhaseStep() {
    static int (*const steps[])() = {engPhaseStep0, engPhaseStepDraw, engPhaseStep2, nullptr,
                                     engStepStart, engStepCommands, engStepWaitDialog, nullptr};
    uint32_t k = g_eng.vcc304;
    if (k >= 8 || !steps[k]) return 1;
    if (steps[k]()) {
        g_eng.subPhase = 0;
        g_eng.vcc304++;
    }
    return 0;
}

// @yo2 0x00722300 the attack's targets for the log: attacker uid and moves, then per defending monster zone its uid,
// moves and FUN_006e7b70 (attackable)
void engBattleTargets(uint32_t* out) {
    uint32_t aj = g_eng.vcc3c0, tj = g_eng.vcc3c4;
    int as = (int)g_eng.vcc3dc;
    uint32_t uid = cardUid(g_eng.pl[aj & 1].slot[as].card);
    out[0] = uid;
    out[1] = g_eng.uid[uid].moves & 3;
    for (int s = 0; s < 5; s++) {
        uint32_t u = cardUid(g_eng.pl[tj & 1].slot[s].card);
        out[2 + s] = u;
        out[7 + s] = g_eng.uid[u].moves & 3;
        out[12 + s] = (uint32_t)engAttackTarget(aj, as, tj, s, 0);
    }
}

// @yo2 0x00722670
uint16_t engCc3aa() { return *engAt<uint16_t>(0x012cc3aa); }
