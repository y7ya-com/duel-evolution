// The 0x6202 executor and the engine's per-frame step (0x00720140..0x00722300): every frame CDuelScene runs
// engFrame(), which first lets the running engine command finish (engRun) and then takes ONE entry of CNetDuel's 0x6202
// queue (engExecute). Types other than 0 drive the duel scene directly (views, dialogs, lists, card identities).
#include "EngineInternal.h"

#include <cstring>

uint32_t g_duelAttention;   // DAT_012a833c: a move request is waiting (the scene blinks / focuses)

static EngSlot& slotAt(uint32_t j, int s) { return g_eng.pl[j & 1].slot[s]; }
static void engSetCardWord(uint32_t j, uint32_t zone, uint32_t idx, uint32_t prop, uint32_t serial, uint32_t owner);

// @yo2 0x00744a50 the identity of a uid: P = card_prop index (network id)
void engSetUidCard(uint32_t uid, uint32_t prop) {
    g_eng.uid[uid].propIndex = (uint16_t)prop;
    g_eng.uid[uid].card = (uint16_t)cardPropId((int)prop);
}

// @yo2 0x00720140 step 0 of the duel program
int engStepStart() { return 1; }

// @yo2 0x00720e50 step 2: wait until the duel dialog (view 0x32) is gone
int engStepWaitDialog() { return !engDialogOpen(); }

// @yo2 0x0071f8a0 the duel dialog (view 0x32) is open
int engDialogOpen() { return duelViewBusy(0x32); }

// @yo2 0x00720f10 step 1: run the 0x6202 queue; finished when a 0x4d (end of duel) went through
int engStepCommands() { return engExecuteFrame(engDialogOpen()); }

// @yo2 0x00720fd0
int engExecuteFrame(int dialogOpen) {
    g_eng.vd2b4c = 0;
    engExecute(dialogOpen);
    if (g_eng.vd2b4c) return 1;
    if (ndIsWatch() && ndQueueLast() < 0) g_netDuel->watchKeepAlive();
    return 0;
}

// @yo2 0x00720f30 one frame of the duel engine: the step table at 0x00cba500 (start, commands, wait for the dialog);
// returns 1 once the program is over, with the result in cca68 / cca6c
int engFrame() {
    static int (*const steps[])() = {engStepStart, engStepCommands, engStepWaitDialog, nullptr};
    if (g_eng.vcc300 < 3 && steps[g_eng.vcc300]) {
        if (!engRun() && steps[g_eng.vcc300]()) {
            g_eng.subPhase = 0;
            g_eng.vcc300++;
        }
        return 0;
    }
    g_eng.vcca68 = g_eng.result;
    uint32_t who = g_eng.result == 2 ? ~g_eng.viewer : g_eng.viewer;
    g_eng.vcca6c = g_eng.pl[who & 1].endReason;
    return 1;
}

// @yo2 0x00721020 take one 0x6202 entry off CNetDuel's queue and execute it. While a dialog is open only type 0x11
// passes. Type 0 queues an engine command; the others act on the scene at once.
int engExecute(int dialogOpen) {
    if (ndBusy()) return 1;   // the original spins here while the network parser fills the queue (another thread)
    ndSetBusy(1);
    if (ndQueueLast() < 0) {
        ndSetBusy(0);
        return 1;
    }
    uint32_t type = ndCmdType(0);
    if (type != 0x11 && dialogOpen) {
        ndSetBusy(0);
        return 1;
    }
    auto P = [](int k) { return ndCmdP(0, k); };
    switch (type) {
    case 0x00:   // engine command
        engQueue((uint16_t)ndCmdB(0), (uint16_t)P(0), (uint16_t)P(1), (uint16_t)P(2));
        break;
    case 0x1a:   // move request: class P0, P1 != 0 keeps list B, P2 turns classes 8/9 into 10/11
        if (!ndIsWatch() && !ndIsReplay()) {
            ndSetInput(1);
            g_eng.inputClass = P(0);
            if (P(2)) {
                if (g_eng.inputClass == 8) g_eng.inputClass = 10;
                else if (g_eng.inputClass == 9) g_eng.inputClass = 0xb;
            }
            g_duelAttention = 1;
            if (g_eng.inputClass != 2) ndRequestFocus();
            if (!P(1)) {
                if (g_eng.inputClass > 5 && ndListBCount()) duelView(0x32, 0xff, 0, 0);
            } else {
                ndListBReset(0);
            }
        }
        break;
    case 0x1b: {   // DUEL_VIEW B with P0..P2, extra parameters P3..P6
        uint32_t view = ndCmdB(0), a = P(0), b = P(1), c = P(2);
        g_eng.vd2b50 = P(3);
        g_eng.vd2b48 = P(4);
        g_eng.vd2b44 = P(5);
        g_eng.vd2b34 = P(6);
        if (view == 0x33) {
            if (!ndListCCount()) {
                g_eng.vd2b50 = g_eng.vd2b48 = g_eng.vd2b44 = g_eng.vd2b34 = 0;
                duelView(0x33, a, b, 0xffffffff);
            } else {
                duelView(0x33, a, b, 1);
            }
        } else if (view == 0x32) {
            ndListBReset(0);
            ndListCReset(0);
            if (a == 0xfe) {   // fusion material list: list A -> list C
                for (int i = 0; i < ndListACount(); i++) ndListCAdd(ndListAFirst(i), ndListASecond(i));
            } else if (a != 0xff || ndListACount() < 1) {
                duelView(0x32, a, b, c);
            } else {
                for (int i = 0; i < ndListACount(); i++) ndListBAdd(ndListAFirst(i), ndListASecond(i));
                duelView(0x32, 0xff, b, c);
            }
        } else {
            duelView((int)view, a, b, c);
        }
        break;
    }
    case 0x1c:   // DUEL_VIEW 0x1c with a location word built from P2..P6
        duelView(0x1c,
                 ((((((P(6) & 0xff) << 1 | (P(5) & 1)) << 8 | (P(4) & 0xff)) & 0x3ff) << 5 | (P(3) & 0x1f)) << 1) | (P(2) & 1),
                 P(0), P(1));
        break;
    case 0x1d:   // identity of a uid
        engSetUidCard(P(0), P(1));
        break;
    case 0x1e:   // u16 variable P0 = P1 (vars[1]: cards left to discard)
        if (P(0) < 8) g_eng.vars[P(0)] = (uint16_t)P(1);   // fix: the original indexes with any P0
        break;
    case 0x1f:
        g_eng.pairA = P(0);
        g_eng.pairB = P(1);
        break;
    case 0x40: case 0x46: case 0x4b: case 0x4c:
        engSetCardWord(P(0), P(1), P(2), P(3), P(4), P(5));
        break;
    case 0x47:
        eng_754340();
        break;
    case 0x48:   // both decks shuffled: forget their order
        engShuffleDeck(0);
        engShuffleDeck(1);
        break;
    case 0x49:   // reset the battle sub-state
        g_eng.vcc31c = 0;
        g_eng.battleState = 1;
        g_eng.vcc318 = 0;
        g_eng.subPhase = 0x15;
        break;
    case 0x4a:   // ping: answered with an empty 0x004a
        ndSendEmpty(0x4a);
        break;
    case 0x4d: {   // end of the duel: P0 = result, P1 = finish mode (3: a match that ended early counts the rest)
        uint32_t res = P(0), mode = P(1);
        sceneMatchSetEndMode(mode);
        sceneMatchRecordGame(res);
        g_eng.vd2b4c = 1;
        if (mode == 3 && ndSerial() < 3)
            for (int n = 3 - ndSerial(); n; n--) {
                ndSerialNext();
                sceneMatchRecordGame(res);
            }
        break;
    }
    case 0x4e:   // watching / replaying: the server's info code
        if (ndIsWatch() || ndIsReplay()) {
            uint8_t code = (uint8_t)P(0);
            ndSetSvrCode(code);
            ndSetSvrFlag((uint8_t)P(1));
            if (code == 1) ndSetCut(1);
        }
        break;
    case 0x4f:   // replaying: the fusion materials of log entry P0
        if (ndIsReplay()) {
            uint32_t n = P(0);
            for (int i = 0; i < ndLogMaterialCount(n); i++) {
                g_fusionList.count = ndLogMaterialCount(n);
                g_fusionList.card[i] = (g_fusionList.card[i] & ~0x3fffu) | (ndLogMaterial(n, i) & 0x3fff);
            }
        }
        break;
    case 0x60:   // list A: empty, size P0
        ndListAReset(P(0));
        break;
    case 0x61: {   // list A: append pairs (P0, P1), (P2, P3)...
        int k = 0;
        for (int i = ndListACount(); i < ndListASize(); i++) {
            ndListAAdd(P(k), P(k + 1));
            k += 2;
            if (k > 7) break;
        }
        break;
    }
    case 0x62:   // empty the chain table
        g_eng.chainCount = 0;
        memset(&g_eng.chain[1], 0, 0x1c0);
        break;
    case 0x63: {   // chain table entry P0: player P1, zone P2, card P3, index P4, P5
        uint32_t n = P(0), j = P(1), zone = P(2), card = P(3), idx = P(4), x = P(5);
        g_eng.chainCount = (int32_t)n;
        EngChain& c = g_eng.chain[n];   // the original has no bound
        c.bits = (uint16_t)((((j ^ c.bits) & 1) ^ c.bits) & 0xffc1) | (uint16_t)((zone & 0x1f) << 1);
        if (idx < 10) engChainAddSlot(&c, card, idx);
        else engChainAddTarget3(&c, card, idx, x);
        c.w6 = (uint16_t)((c.w6 & ~0x7fu) | ((c.w6 + 1) & 0x7f));
        if (engCardAt(j, zone) == 0x1a74)
            engQueue((uint16_t)((j ? 0x8000 : 0) | 0x36), (uint16_t)(0x200 | (zone & 0xff)), 0xfa5, g_eng.uid[x].propIndex);
        break;
    }
    }
    g_netDuel->popCommand();
    ndSetBusy(0);
    return 1;
}

// the four 0x6202 "set card" types: write a card word (identity, owner, serial) into a slot or a pile and record the
// uid's identity
static void engSetCardWord(uint32_t j, uint32_t zone, uint32_t idx, uint32_t prop, uint32_t serial, uint32_t owner) {
    uint32_t id = (uint32_t)cardPropId((int)prop) & 0x3fff, so = ((serial & 0xff) << 9 | (owner & 1)) << 14;
    EngPlayer& p = g_eng.pl[j & 1];
    int scene = ndLogScene();
    bool replayPile = scene != -1 && scene < 0xd7;
    auto field = [&](bool replay) {
        uint32_t& w = slotAt(j, zone + idx).card;
        if (replay) w = (((w ^ id) & 0x3fff) ^ w) & 0x807fffff;
        else w = (w & 0x807fc000) | id;
        w |= (serial & 0xff) << 23;
        uint32_t& o = slotAt(j, idx).card;   // the owner bit goes to slot `idx`, not zone + idx (as in the exe)
        o = (owner & 1) << 14 | (o & 0xffffbfff);
        engSetUidCard(cardUid(slotAt(j, zone + idx).card), prop);
    };
    switch (zone) {
    case Z_HAND: case Z_DECK: {
        uint32_t& w = zone == Z_HAND ? p.hand[idx] : p.deck[idx];
        w = so | id | (w & 0x807f8000);
        engSetUidCard(cardUid(w), prop);
        break;
    }
    case Z_EXTRA:
        p.extra[idx] = so | id | (p.extra[idx] & 0x807f8000);
        engSetUidCard((owner & 1) + (serial & 0xff) * 2, prop);
        break;
    case Z_GRAVE: case Z_BANISH:
        if (replayPile) {
            field(true);
        } else {
            uint32_t& w = zone == Z_GRAVE ? p.grave[idx] : p.banish[idx];
            w = so | ((((id ^ w) & 0x3fff) ^ w) & 0x807fbfff);
            engSetUidCard((owner & 1) + (serial & 0xff) * 2, prop);
        }
        break;
    case 0x11:
        p.hand[idx] = (serial & 0xff) << 23 | (p.hand[idx] & 0x807fffff);
        break;
    default:
        field(false);
        break;
    }
}

// @yo2 0x00721eb0 duel statistics hooks: empty in this build (the 0x00721ed0/ef0/f10/f30/f50/f70 bodies are a bare
// `ret`, 0x00721eb0 returns 0)
int engStatGet(int) { return 0; }
// @yo2 0x00721ed0
void engStatSet(int, int) {}
// @yo2 0x00721ef0
void engStatMax(int, int) {}
// @yo2 0x00721f10
void engStatAdd(int, int) {}
// @yo2 0x00721f30
void engStatCard(int) {}
// @yo2 0x00721f50
void engStatNop1() {}
// @yo2 0x00721f70
void engStatNop2() {}

// @yo2 0x00721f90 how many of the 22 field slots the predicate (j, s, 0) accepts
int engCountSlotsIf(int (*pred)(uint32_t, int, int)) {
    int n = 0;
    for (uint32_t j = 0; j < 2; j++)
        for (int s = 0; s < 0xb; s++)
            if (pred(j, s, 0)) n++;
    return n;
}

// @yo2 0x00721fd0 a move request is open: show the move dialog (view 4) once
int engRequestDialog() {
    if (duelViewBusy(4)) return 1;
    if (g_eng.inputClass) {
        if (!g_eng.vcc34c) {
            g_eng.vcc34c = 1;
            duelView(4, 0, 0, 0);
        }
        return 1;
    }
    g_eng.vcc34c = 0;
    return 0;
}

// @yo2 0x00722050 a 6-byte duel log record
void engLogRecord6(int id, uint16_t a, uint16_t b, uint16_t c) {
    uint16_t v[3] = {a, b, c};
    engLogRecord(id, -1, v, 6);
}

static int logWrite(const void*, int) { return 1; }   // FUN_00423110: the log sink is a shared "return 1" stub in this build

// @yo2 0x007220a0 append a duel log record: id, optional sub id, data (FUN_00423110 writes it)
void engLogRecord(int id, int sub, const void* data, int len) {
    uint16_t buf[128];
    int n = 1;
    buf[0] = (uint16_t)id;
    if (sub != -1) buf[n++] = (uint16_t)sub;
    if (len > 0) {
        if (len > (int)sizeof buf - n * 2) len = (int)sizeof buf - n * 2;   // fix: the original copies unbounded
        memcpy(buf + n, data, (size_t)len);
        n += (len + 1) >> 1;
    }
    engLogCount(id, 1);
    logWrite(buf, n * 2);
}

// @yo2 0x00722140 the duel log's pending-command counter (bits 15..18 of cc820) for the record kinds that need an answer
void engLogCount(int id, int add) {
    switch (id) {
    case 2: case 3: case 7: case 8: case 0xc: case 0xd: case 0xe: case 0xf: case 0x10: case 0x11: case 0x15: case 0x17:
    case 0x18: case 0x19: case 0x1a: case 0x1b: case 0x1c: case 0x1d: case 0x1e: case 0x1f: {
        int32_t cur = (int32_t)((g_eng.vcc820 & 0xffff8000) << 13) >> 13;
        uint32_t next = (uint32_t)(cur + (add ? 0x8000 : -1));
        g_eng.vcc820 ^= (next ^ g_eng.vcc820) & 0x78000;
    }
    }
}

// @yo2 0x00722210
void engSetCc2f4() { g_eng.vcc2f4 = 1; }
// @yo2 0x00722230
uint32_t engCc2f4() { return g_eng.vcc2f4; }

// @yo2 0x00722250 duel log commands are pending (or the opponent's turn while recording)
int engLogPending() {
    int opp = g_eng.vcc2f0 && g_eng.turnPlayer == (g_eng.viewer ^ 1);
    return 0 < (int)((g_eng.vcc820 << 13) >> 28) + opp;
}

// @yo2 0x007222a0 send a move (0x6350) and close the request
void engSendMove(uint32_t j, uint32_t zone, uint32_t index, uint32_t cmd) {
    ndSendMove(j, zone, index, cmd);
    g_eng.inputClass = 0;
}

// @yo2 0x007222e0 pass (0x6351) and close the request
void engSendPass() {
    ndSendPass();
    g_eng.inputClass = 0;
}

// @yo2 0x0071ff30 clear the engine (players, card lists, command queue, battle and chain state)
void engReset() {
    static const struct { uint32_t at, n; } blocks[] = {
        {0x012c8880, 0x3b38}, {0x012ccb20, 0x6014}, {0x012c78a0, 0x81c}, {0x012c7880, 0x18},
        {0x012c80c0, 0x7ac},  {0x012cc3c0, 0x154},  {0x012cca80, 0x90},  {0x012cc520, 0x314},
    };
    engZero(&g_fusionList, sizeof g_fusionList);   // DAT_012be180, outside the block (cleared third in the exe)
    for (const auto& b : blocks) engZero(engAt<uint8_t>(b.at), b.n);
    if (g_eng.ctl[0] == 2 || g_eng.ctl[1] == 2) g_eng.vcc2f0 = 1;
    g_eng.vcca68 = g_eng.vcca6c = 0;
}

// @yo2 0x0071fe10 start a duel from the setup the server sent: LP, both decks (order forgotten), seed, first player
int engDuelInit() {
    engReset();
    g_eng.pl[0].lp = ndStartLp(0);
    g_eng.pl[1].lp = ndStartLp(1);
    engLoadDeck(0, engAt<uint32_t>(0x012cc854));
    engLoadDeck(1, engAt<uint32_t>(0x012cc95c));
    g_eng.seed = g_eng.vcc840;
    engShuffleDeck(g_eng.vcc850);
    engShuffleDeck(1 - g_eng.vcc850);
    duelView(0xe, 0, (uint32_t)g_eng.pl[0].lp, 0);
    duelView(0xe, 1, (uint32_t)g_eng.pl[1].lp, 0);
    duelView(0x15, 0, Z_DECK, 0);
    duelView(0x15, 1, Z_DECK, 0);
    duelView(0x15, 0, Z_EXTRA, 0);
    duelView(0x15, 1, Z_EXTRA, 0);
    g_eng.turnPlayer = g_eng.vcc850;
    g_eng.vcc2d8 = 0xffff;
    return 1;
}

// @yo2 0x00720020
void engDuelInitPlay() {
    engDuelInit();
    g_eng.vcc2d8 = 0;
    g_eng.vcc2ec = 1;
}

// @yo2 0x00720050
int engDuelInit1() {
    engDuelInit();
    return 1;
}
