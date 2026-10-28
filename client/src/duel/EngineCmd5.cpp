// Duel flow command handlers (0x007120e0..0x00712e80): draw, deck shuffles, start / end of the duel, turns, phases.
#include "EngineInternal.h"

static EngSlot& slotAt(uint32_t j, int s) { return g_eng.pl[j & 1].slot[s]; }

static bool logReplayScene() {
    int s = ndLogScene();
    return s == 0xc9 || s == 0xca || s == 0xd2 || s == 0xd3 || s == 0xd4;
}

// @yo2 0x007120e0 0x55 draw P1 cards from the top of the deck (P0 != 0xffff: draw message P0 first, view 0x3f)
void engCmdDraw() {
    uint32_t j = cmdPlayer();
    EngPlayer& p = g_eng.pl[j];
    switch (g_eng.step) {
    case 0:
        if (!g_eng.cur.p1) {
            g_eng.running = 0;
            return;
        }
        if (!p.deckCount) {
            g_eng.running = 0;
            p.deckOut = 1;
            return;
        }
        g_eng.step = 1;
        if (g_eng.cur.p0 != 0xffff) duelView(0x3f, j, g_eng.cur.p1, g_eng.cur.p0);
        return;
    case 1: {
        if (duelViewBusy(0x3f)) return;
        if (!p.deckCount) {
            p.deckOut = 1;
            g_eng.running = 0;
            return;
        }
        engWordCopy(&g_eng.tmpCard, &p.deck[0]);
        uint32_t fromFace = engFaceUpAt(j, Z_DECK, 0) & 1;
        uint32_t n = p.handCount & 0xff;
        uint32_t toFace = engFaceUpAt(j, Z_HAND, n) & 1;
        engRemoveAt(j, Z_DECK, 0);
        engInsertAt(j, Z_HAND, n, &g_eng.tmpCard);
        duelView(0x19, cardUid(g_eng.tmpCard), fromFace << 14 | j | 0x1a, toFace << 14 | j | n << 6 | 0x16);
        if (g_eng.turnPlayer) engBgmTurn(j);
        g_eng.step++;
        return;
    }
    case 2:
        if (--g_eng.cur.p1) {
            g_eng.step = 1;
            return;
        }
        if (g_eng.flags & 4) engSetPlayerFlag(j, 2, 1);
        g_eng.running = 0;
        return;
    }
}

// @yo2 0x00712440 0x56 nothing
void engCmd56() { g_eng.running = 0; }

// @yo2 0x00712460 0x54 shuffle j's deck with seed P1 << 16 | P0 (view 0x14 then 0x15)
void engCmdShuffleDeck() {
    uint32_t j = cmdPlayer();
    if (g_eng.step == 0) {
        if (!logReplayScene()) engSetPlayerFlag(j, 3, 0);
        engNodeFreeKeyLo(slotAt(j, 11).head, 0x1d08, 1);
        if (g_eng.pl[j].deckCount < 2) {
            g_eng.running = 0;
            return;
        }
        duelView(0x14, j, 0, 0);
        g_eng.step++;
    } else if (g_eng.step == 1 && !duelViewBusy(0x14)) {
        g_eng.seed = (uint32_t)g_eng.cur.p1 << 16 | g_eng.cur.p0;
        engShuffleDeck(j);
        duelView(0x15, j, Z_DECK, 0);
        g_eng.running = 0;
    }
}

// @yo2 0x007125e0 0x59 reverse both decks (flag 2 = P0: the top card is shown)
void engCmdReverseDecks() {
    if (g_eng.step) return;
    engSetFlag(2, g_eng.cur.p0);
    engDeckReverse(0);
    engDeckReverse(1);
    duelView(0x15, 0, Z_DECK, 0);
    duelView(0x15, 1, Z_DECK, 0);
    g_eng.running = 0;
}

// @yo2 0x00712650 0x57 put a deck / extra-deck card back: P0 = its zone (0xc or 0xd), P1 = uid, P2 = 0 top / else bottom
void engCmdRestack() {
    uint32_t j = cmdPlayer(), zone = g_eng.cur.p0;
    uint32_t at = engFindUid(g_eng.cur.p1);
    if ((at >> 8 & 0xff) == zone) {
        uint32_t w = *engWordAt(at & 0xff, at >> 8 & 0xff, at >> 16);
        if (zone == Z_EXTRA) {
            engExtraRemove(j, &w);
            engExtraPush(j, &w);
        } else {
            engDeckRemove(j, &w);
            engDeckRemove(j, &w);
            if (!g_eng.cur.p2) engDeckPushTop(j, &w);
            else engDeckPushBottom(j, &w);
        }
        duelView(0x15, j, Z_DECK, 0);
    }
    g_eng.running = 0;
}

// @yo2 0x00712770 0x58 view 0x16 (DECK_FLIPTOP) with P0
void engCmdFlipTop() {
    if (g_eng.step == 0) {
        duelView(0x16, cmdPlayer(), g_eng.cur.p0, 0);
        g_eng.step++;
    } else if (g_eng.step == 1 && !duelViewBusy(0x16)) {
        g_eng.running = 0;
    }
}

// @yo2 0x007127f0 0x01 DUEL_START
void engCmdDuelStart() {
    if (g_eng.step == 0) {
        duelView(1, 0, 0, 0);
        g_eng.step++;
        return;
    }
    if (!duelViewBusy(1)) g_eng.running = 0;
}

// @yo2 0x00712840 0x05 DUEL_END: P0 = result (1 P0 wins, 2 P1 wins, 0 draw), P1 / P2 = each player's reason; reasons
// 3..10 (Exodia, deck out...) play their view first (0x3b, plus 0x3c on Exodia's pieces)
void engCmdDuelEnd() {
    uint32_t r0 = g_eng.cur.p1, r1 = g_eng.cur.p2, res = g_eng.cur.p0, me = cmdPlayer();
    uint32_t reasons[2] = {r0, r1};
    uint32_t reason = reasons[res == 2];
    switch (g_eng.step) {
    case 0: {
        uint32_t k = 3;
        while (reason != k) {
            if (++k > 10) {
                g_eng.step = 1;
                return;
            }
        }
        uint32_t who = reasons[me] == k ? me : 1 - me;
        if (k == 4) {   // Exodia: light up the five pieces
            static const int pieces[5] = {0x1468, 0x1497, 0x1498, 0x1499, 0x149a};
            for (int n = 0; n < 5; n++)
                for (int s = 5; s < 10; s++)
                    if (engCardAt(who, s) == pieces[n]) {
                        duelView(0x3c, who, s, 1u << 8 | n);
                        break;
                    }
        }
        duelView(0x3b, who, k, 0);
        g_eng.step++;
        return;
    }
    case 1:
        if (duelViewBusy(0x3b)) return;
        g_eng.pl[0].endReason = r0;
        g_eng.pl[1].endReason = r1;
        g_eng.result = res;
        g_eng.vcca6c = reason;
        duelView(2, res, reason, 0);
        g_eng.step++;
        return;
    case 2:
        if (!duelViewBusy(2)) g_eng.running = 0;
        return;
    }
}

// @yo2 0x00712a10 0x04 TURN_CHANGE: B's player is the one ending the turn
void engCmdTurnChange() {
    uint32_t ender = cmdPlayer();
    g_eng.turnPlayer ^= 1;
    g_eng.turn++;
    g_eng.vcc304 = 0;
    g_eng.subPhase = 0;
    g_eng.phase = 7;
    for (uint32_t j = 0; j < 2; j++)
        for (int s = 0; s < 11; s++) {
            EngSlot& sl = slotAt(j, s);
            if (!sl.faceUp) continue;
            int c = engCardAt(j, s);
            if (c == 0x1740) {
                if (j == 1 - ender && s < 5 && !g_eng.pl[(-(int)ender - 1) & 1].handCount) engNodeAddSlot(j, s, 1, 0x1740, 0);
            } else if (c == 0x1dd9 && j == ender && s > 4) {
                sl.value = 0;
            }
        }
    engStatSet(0x3d, g_eng.pl[g_eng.viewer & 1].lp < g_eng.pl[~g_eng.viewer & 1].lp);
    duelView(6, 1 - ender, 0, 0);
    g_eng.running = 0;
}

// @yo2 0x00712c00 phase change to `ph` (0 draw, 1 standby, 2 main 1, 3 battle, 4 main 2, 5 end)
void engCmdPhase(uint32_t ph) {
    uint32_t prev = g_eng.phase, j = cmdPlayer();
    if (g_eng.step == 0) {
        duelView(5, j, ph, 0);
        g_eng.phase = ph;
        engPhaseNodes((int)ph, (int)prev);
        engPhaseCleanup();
        engPhaseBegin(j, (int)ph);
        g_eng.step++;
        return;
    }
    if (!duelViewBusy(5)) {
        duelView(0x25, 0, 0, 0);
        g_eng.running = 0;
    }
}

// @yo2 0x00712be0 0x0c draw phase
void engCmdPhaseDraw() { engCmdPhase(0); }
// @yo2 0x00712cc0 0x0d standby phase
void engCmdPhaseStandby() { engCmdPhase(1); }
// @yo2 0x00712ce0 0x0e main phase 1
void engCmdPhaseMain1() { engCmdPhase(2); }
// @yo2 0x00712d00 0x0f battle phase
void engCmdPhaseBattle() { engCmdPhase(3); }
// @yo2 0x00712d20 0x10 main phase 2
void engCmdPhaseMain2() { engCmdPhase(4); }
// @yo2 0x00712d40 0x11 end phase
void engCmdPhaseEnd() { engCmdPhase(5); }

static void clearHighFlags() {
    for (EngPlayer& p : g_eng.pl)
        for (EngSlot& s : p.slot) s.flags &= 0xffff;
    g_eng.flags &= 0xffff;
}

// @yo2 0x00712d60 0x02 clear the turn markers once the turn banner (view 6) is over
void engCmdClearMarkers() {
    if (duelViewBusy(6)) return;
    if (!logReplayScene()) clearHighFlags();
    g_eng.flags &= 0xffff;
    g_eng.pl[0].v20 = 0;
    g_eng.pl[1].v20 = 0;
    engStatSet(5, 0);
    g_eng.running = 0;
}

// @yo2 0x00712e80 0x03 end of turn (view 0x48, the NPC's end phrase): graveyard and banished cards get bit 21,
// timed nodes count down
void engCmdEndTurn() {
    duelView(0x48, cmdPlayer(), 0, 0);
    if (logReplayScene()) clearHighFlags();
    for (EngPlayer& p : g_eng.pl) {
        for (uint32_t i = 0; i < p.graveCount; i++) p.grave[i] |= 0x200000;
        for (uint32_t i = 0; i < p.banishCount; i++) p.banish[i] |= 0x200000;
    }
    engNodeTurnTick();
    g_eng.running = 0;
}

static void viewThenDone(int view, uint32_t a, uint32_t b, uint32_t c) {
    if (g_eng.step == 0) {
        duelView(view, a, b, c);
        g_eng.step++;
    }
    if (!duelViewBusy(view)) g_eng.running = 0;
}

// @yo2 0x00713000 0x0a view 3 with P0
void engCmdView3() { viewThenDone(3, g_eng.cur.p0, 0, 0); }

// @yo2 0x00713050 0x69 wait until FUN_0071f8a0 is done
void engCmdWait69() {
    if (g_eng.step == 0) g_eng.step = 1;
    if (!engDialogOpen()) g_eng.running = 0;
}

// @yo2 0x00713090 0x09 global engine flag P0 = (P1 != 0)
void engCmdSetFlag() {
    engSetFlag(g_eng.cur.p0 & 0x1f, g_eng.cur.p1 != 0);
    duelView(0x25, 0, 0, 0);
    g_eng.running = 0;
}

// @yo2 0x00713110 0x22 player flag P0 = (P1 != 0)
void engCmdSetPlayerFlag() {
    engSetPlayerFlag(cmdPlayer(), g_eng.cur.p0 & 0x1f, g_eng.cur.p1 != 0);
    duelView(0x25, 0, 0, 0);
    g_eng.running = 0;
}

// @yo2 0x007131d0 0x2a slot flag: P0 = slot, P1 = bit, P2 = on
void engCmdSetSlotFlag() {
    engSetSlotFlag(cmdPlayer(), g_eng.cur.p0, g_eng.cur.p1, g_eng.cur.p2);
    duelView(0x25, 0, 0, 0);
    g_eng.running = 0;
}

// @yo2 0x00713240 0x14 FIELD_CHANGE: P0 = internal id of the field spell (0 = none)
void engCmdFieldChange() {
    g_eng.fieldSpell = g_eng.cur.p0;
    if (g_eng.step == 0) {
        g_eng.step = 1;
        duelView(7, g_eng.fieldSpell, 0, 0);
        return;
    }
    if (!duelViewBusy(7)) {
        engCollapse1f08();
        duelView(0x25, 0, 0, 0);
        g_eng.running = 0;
    }
}

// @yo2 0x007132c0 0x62 view 0x42: the NPC's "chains" phrase
void engCmdChainPhrase() {
    if (g_eng.step == 0) {
        duelView(0x42, cmdPlayer(), g_eng.cur.p0, 0);
        g_eng.step++;
        return;
    }
    if (!duelViewBusy(0x42)) g_eng.running = 0;
}

// @yo2 0x00713330 0x12 CHAIN_SET (view 0x2f): P0 = zone, P1 = index in the hand, P2 = chain link number. A hand card
// that was revealed (node 0xfe0) is hidden again (view 0x13).
// @yo2 0x00713425 (a tail of the same function that Ghidra split off)
void engCmdChainSet() {
    uint32_t j = cmdPlayer(), zone = g_eng.cur.p0, idx = g_eng.cur.p1, link = g_eng.cur.p2;
    switch (g_eng.step) {
    case 0:
        duelView(0x2f, j, zone, link);
        engStatMax(0x2a, link);
        g_eng.step++;
        return;
    case 1:
        if (duelViewBusy(0x2f)) return;
        g_eng.step++;
        if (zone == Z_HAND && engSlotHasKeyValue(j, 11, 0xfe0, idx)) {
            engNodeFreeKeyValue(slotAt(j, 11).head, 0xfe0, idx, 1);
            if (!engHandOpen(j)) {
                duelView(0x13, j, 0, idx);
                engSetPlayerFlag(j, 2, 1);
                return;
            }
        }
        [[fallthrough]];
    case 2:
        if (!duelViewBusy(0x13)) g_eng.running = 0;
        return;
    }
}

// @yo2 0x007134a0 0x13 CHAIN_RUN (view 0x30): P0 = zone, P2 = chain link
void engCmdChainRun() {
    if (g_eng.step == 0) {
        g_eng.flags |= 8;
        duelView(0x30, cmdPlayer(), g_eng.cur.p0, g_eng.cur.p2);
        g_eng.step++;
    }
    if (!duelViewBusy(0x30)) g_eng.running = 0;
}

// @yo2 0x00713530 0x6a the chain is over: fold each player's chain counters and refresh shown decks
void engCmdChainEnd() {
    g_eng.flags &= ~8u;
    for (EngPlayer& p : g_eng.pl) p.v20 = (p.v20 >> 16) + (p.v20 & 0xffff);
    if (g_eng.pl[0].slot[11].flags & 8) duelView(0x15, 0, Z_DECK, 0);
    if (g_eng.pl[1].slot[11].flags & 8) duelView(0x15, 1, Z_DECK, 0);
    g_eng.running = 0;
}

static void viewStep(int view, uint32_t a, uint32_t b, uint32_t c) {
    if (g_eng.step == 0) {
        duelView(view, a, b, c);
        g_eng.step++;
        return;
    }
    if (!duelViewBusy(view)) g_eng.running = 0;
}

// @yo2 0x007135d0 0x5c coin toss (view 0x38): P0 = j | zone << 1 | n << 6 | called << 14, P1, P2 = results
void engCmdCoin() { viewStep(0x38, g_eng.cur.p0, g_eng.cur.p1, g_eng.cur.p2); }
// @yo2 0x00713650 0x5d die (view 0x39): P0 = zone, P1 = 1..6
void engCmdDie() { viewStep(0x39, cmdPlayer(), g_eng.cur.p0, g_eng.cur.p1); }

// @yo2 0x007136d0 0x5e view 0x3a (P0 != 0: hint 0x43 afterwards)
void engCmdView3a() {
    if (g_eng.step == 0) {
        duelView(0x3a, cmdPlayer(), g_eng.cur.p0, 0);
        g_eng.step++;
        return;
    }
    if (!duelViewBusy(0x3a)) {
        if (g_eng.cur.p0) engStatSet(0x43, 1);
        g_eng.running = 0;
    }
}

// @yo2 0x00713760 0x5f view 0x3c (Exodia piece) with P1, P0
void engCmdView3c() { viewStep(0x3c, cmdPlayer(), g_eng.cur.p1, g_eng.cur.p0); }

// @yo2 0x007137e0 0x0b RUN_EXTRA (view 0x3d); P0 == 0 remembers the turn
void engCmdRunExtra() {
    if (g_eng.step == 0) {
        if (!g_eng.cur.p0) g_eng.vcc2d8 = g_eng.turn;
        duelView(0x3d, g_eng.cur.p0, 0, 0);
        g_eng.step++;
        return;
    }
    if (!duelViewBusy(0x3d)) g_eng.running = 0;
}

// @yo2 0x00713860 0x2b nothing
void engCmd2b() { g_eng.running = 0; }
// @yo2 0x00713880 0x63 nothing
void engCmd63() { g_eng.running = 0; }
// @yo2 0x007138a0 0x64 nothing
void engCmd64() { g_eng.running = 0; }

// @yo2 0x007138c0 0x65
void engCmd65() {
    if (g_eng.vcc33c == g_eng.cur.p1) engCmd64();
    g_eng.running = 0;
}

// @yo2 0x00713900 0x66 message dialog: P1 = text id (0xa9..0xcb: a composed message; 0x8c: with a card name, P2)
void engCmdMessage() {
    uint32_t text = g_eng.cur.p1;
    if (g_eng.step == 0) {
        g_eng.step = 1;
        char buf[256];
        if (text < 0xa9 || text > 0xcb) {
            if (text == 0x8c) textFormatS(buf, 0x8c, textCardName(g_eng.cur.p2));
            else engAskMessage(g_eng.viewer, text);
        } else {
            textCopy(buf, text);
            textAppend(buf, "\n");   // the exe's string at 0x00c7f384
            textAppend(buf, 0xcc);
        }
    }
    if (!engDialogOpen()) g_eng.running = 0;
}

// @yo2 0x007139e0 0x67 view 0x3e with P0 and P1 | P2 << 16
void engCmdView3e() {
    if (g_eng.step == 0) {
        duelView(0x3e, cmdPlayer(), g_eng.cur.p0, g_eng.cur.p1 | (uint32_t)g_eng.cur.p2 << 16);
        g_eng.step++;
    }
    if (!duelViewBusy(0x3e)) g_eng.running = 0;
}

// @yo2 0x00713a70 0x5a nothing (and the command never finishes)
void engCmd5a() {}

// @yo2 0x00713a90 0x5b DECK_RESET
void engCmdDeckReset() {
    if (g_eng.step == 0) {
        engSwapDeckGrave(0);
        engSwapDeckGrave(1);
        g_eng.step++;
    } else if (g_eng.step == 1) {
        for (uint32_t j = 0; j < 2; j++) {
            duelView(0x15, j, Z_DECK, 0);
            duelView(0x15, j, Z_GRAVE, 0);
        }
        g_eng.running = 0;
    }
}

// @yo2 0x00713b10 0x4e HAND_SHUFFLE with seed P1 << 16 | P0 (view 0x11)
void engCmdShuffleHand() {
    uint32_t j = cmdPlayer();
    switch (g_eng.step) {
    case 0:
        if (!duelViewBusy(-1)) {
            engNodeAddSlot(j, 11, 1, 0xfa1, 0);
            g_eng.step++;
        }
        return;
    case 1:
        g_eng.seed = (uint32_t)g_eng.cur.p1 << 16 | g_eng.cur.p0;
        if (engHandShuffle(j)) duelView(0x11, j, 0, 0);
        slotAt(j, 11).flags &= ~4u;
        g_eng.step++;
        return;
    case 2:
        if (!duelViewBusy(0x11)) {
            engNodeFreeKeyLo(slotAt(j, 11).head, 0xfa1, 1);
            g_eng.running = 0;
        }
        return;
    }
}

// @yo2 0x00713c70 0x53 random pick animation in the hand: 33 frames walking over the hand
void engCmdHandPick() {
    uint32_t j = cmdPlayer(), n = g_eng.pl[j].handCount;
    if (n > 1 && g_eng.step < 0x21) {
        uint32_t k = (uint32_t)g_eng.step >> 1;
        g_eng.step++;
        duelView(8, j, Z_HAND, k % n);
        return;
    }
    g_eng.running = 0;
}

// @yo2 0x00713d00 0x51 HAND_SHOW: P0 = uid
void engCmdHandShow() {
    uint32_t j = cmdPlayer();
    int i = (int)engHandIndex(j, g_eng.cur.p0);
    switch (g_eng.step) {
    case 0:
        g_eng.step = 1;
        return;
    case 1:
        if (i >= 0) {
            duelView(0x12, j, (uint32_t)i, 0);
            slotAt(j, 11).flags |= 4;
        }
        g_eng.step++;
        return;
    case 2:
        if (!duelViewBusy(0x12)) g_eng.running = 0;
        return;
    }
}

// @yo2 0x00713dc0 0x52 show / hide the hand (view 0x13): P0 = show, P1 = uid (0: the whole hand, player flag 1)
void engCmdHandOpen() {
    uint32_t j = cmdPlayer(), show = g_eng.cur.p0, uid = g_eng.cur.p1;
    if (g_eng.step == 0) {
        if (!uid) {
            engSetPlayerFlag(j, 1, show);
            if (show) slotAt(j, 11).flags |= 4;
        } else {
            engNodeFreeKeyValue(slotAt(j, 11).head, 0x1db9, uid, 1);
            if (!show) slotAt(j, 11).flags |= 4;
        }
        duelView(0x13, j, show, uid);
        g_eng.step++;
    } else if (g_eng.step == 1 && !duelViewBusy(0x13)) {
        g_eng.running = 0;
    }
}

// @yo2 0x00720070 enter phase p (0 draw .. 5 end): what the phase-step and battle-state counters start at
void engSetPhase(uint32_t p) {
    g_eng.phase = p;
    switch (p) {
    case 0: g_eng.vcc304 = 1; g_eng.subPhase = 1; break;
    case 1: g_eng.vcc304 = 2; g_eng.subPhase = 1; break;
    case 2: case 4: g_eng.vcc304 = 3; g_eng.subPhase = 1; break;
    case 3: g_eng.vcc304 = 3; g_eng.subPhase = 0x16; g_eng.battleState = 1; break;
    case 5: g_eng.vcc304 = 4; g_eng.subPhase = 1; break;
    }
}

#if defined(_WIN32) && defined(__i386__)
#define g_duelBgmTurns (*reinterpret_cast<int32_t*>(0x012a59f4))
#define g_duelKind (*reinterpret_cast<int32_t*>(0x012a90c0))
#define s_bgmWanted (*reinterpret_cast<int32_t*>(0x00ccc040))
#define s_bgmPlaying (*reinterpret_cast<int32_t*>(0x00ccc044))
#else
int32_t g_duelBgmTurns;            // DAT_012a59f4 draw phases seen (BGM switches after the fifth)
int32_t g_duelKind;                // DAT_012a90c0 0 normal, 1 / 2 the two special BGM kinds
static int32_t s_bgmWanted = 0xc, s_bgmPlaying = 0xc;   // DAT_00ccc040 / DAT_00ccc044
#endif
bool soundEnabled();               // FUN_00a58630 TODO(System)
void duelPlayBgm(int bgm, int loop, int fade);   // FUN_0073d4b0 TODO(System)

// @yo2 0x00743010 at each draw phase: from the fifth on, switch to the duel kind's BGM (or back to 0xc)
void engBgmTurn(int j) {
    if (g_eng.phase != 0) return;
    if (g_eng.turn && g_duelBgmTurns < 5) g_duelBgmTurns = 5;
    if (soundEnabled() && j == 1 && g_duelBgmTurns > 4) {
        if (g_duelKind == 0) s_bgmWanted = 0xc;
        else if (g_duelKind == 1) s_bgmWanted = 0x20;
        else if (g_duelKind == 2) s_bgmWanted = 0x1f;
        if (s_bgmPlaying != s_bgmWanted) {
            s_bgmPlaying = s_bgmWanted;
            duelPlayBgm(s_bgmWanted, 1, 0);
        } else duelPlayBgm(0xc, 1, 0);
        g_duelBgmTurns++;
        return;
    }
    if (j == 1) g_duelBgmTurns++;
}
