// The engine's view of CNetDuel (0x00790530..0x00791860): every engine / scene function reaches the duel connection
// through these small accessors on *(DAT_012711ac + 0xc70).
#include "CardDB.h"
#include "Engine.h"

static CNetDuel& nd() { return *g_netDuel; }

#if defined(_WIN32) && defined(__i386__)
#define g_matchResult YO2_EXE_U32(0x00cd82d0)
#define g_duelSerial (*reinterpret_cast<uint8_t*>(0x012a9088))
#else
uint32_t g_matchResult;    // DAT_00cd82d0
uint8_t g_duelSerial;      // DAT_012a9088
#endif

// @yo2 0x007904f0 modes 1, 4, 8, 0xb: a match (several games)
int ndIsMatch() { return g_duelMode == 1 || g_duelMode == 4 || g_duelMode == 8 || g_duelMode == 0xb; }
// @yo2 0x00790530 modes 7, 8: watching another duel
int ndIsWatch() { return g_duelMode == 7 || g_duelMode == 8; }
// @yo2 0x00790560 modes 10, 11: replaying a duel log
int ndIsReplay() { return g_duelMode == 10 || g_duelMode == 0xb; }
// @yo2 0x007905b0
uint32_t ndMatchResult() { return g_matchResult; }
// @yo2 0x00790790 starting LP of a side (0x600c)
int32_t ndStartLp(int side) { return nd().side[side].lp; }
// @yo2 0x007907c0
const char* ndName(int side) { return nd().side[side].name; }
// @yo2 0x007907f0
int32_t ndDeckMain(int side) { return nd().side[side].deckMain; }
// @yo2 0x00790820
int32_t ndDeckExtra(int side) { return nd().side[side].deckExtra; }
// @yo2 0x00790850 index of the last queued 0x6202, -1 = empty
int32_t ndQueueLast() { return nd().last; }
// @yo2 0x00790880 is CNetDuel::popCommand (NetDuel.cpp)
// @yo2 0x00790900 type (low byte) of queued command n
uint8_t ndCmdType(int n) { return (uint8_t)nd().queue[n].type; }
// @yo2 0x00790930
uint32_t ndCmdB(int n) { return nd().queue[n].b; }
// @yo2 0x00790960
uint32_t ndCmdP(int n, int k) { return nd().queue[n].p[k]; }
// @yo2 0x007909a0 the 0x6202 parser runs (bit 1 of +0x670)
void ndSetBusy(int on) { nd().flags = (nd().flags & ~2u) | (on & 1) << 1; }
// @yo2 0x007909e0
int ndBusy() { return nd().flags >> 1 & 1; }
// @yo2 0x00790a10 is CNetDuel::watchKeepAlive (NetDuel.cpp), the same code a second time

static void pairAdd(PairList& l, uint32_t a, uint32_t b) {
    if (l.count >= 16) return;   // fix: the original appends past the 16 pairs
    l.pair[l.count][0] = a;
    l.pair[l.count][1] = b;
    l.count++;
}
// @yo2 0x00790a30
void ndListAAdd(uint32_t a, uint32_t b) { pairAdd(nd().listA, a, b); }
// @yo2 0x00790a80
void ndListAReset(uint32_t size) { nd().listA.count = 0, nd().listA.size = (int32_t)size; }
// @yo2 0x00790ac0
int32_t ndListACount() { return nd().listA.count; }
// @yo2 0x00790af0
int32_t ndListASize() { return nd().listA.size; }
// @yo2 0x00790b20
uint32_t ndListAFirst(int i) { return nd().listA.pair[i][0]; }
// @yo2 0x00790b50
uint32_t ndListASecond(int i) { return nd().listA.pair[i][1]; }
// @yo2 0x00790b80
void ndListBAdd(uint32_t a, uint32_t b) { pairAdd(nd().listB, a, b); }
// @yo2 0x00790bd0
void ndListBReset(uint32_t size) { nd().listB.count = 0, nd().listB.size = (int32_t)size; }
// @yo2 0x00790c10
int32_t ndListBCount() { return nd().listB.count; }
// @yo2 0x00790c40
int32_t ndListBSize() { return nd().listB.size; }
// @yo2 0x00790c70
uint32_t ndListBFirst(int i) { return nd().listB.pair[i][0]; }
// @yo2 0x00790ca0
uint32_t ndListBSecond(int i) { return nd().listB.pair[i][1]; }
// @yo2 0x00790cd0
void ndListCAdd(uint32_t a, uint32_t b) { pairAdd(nd().listC, a, b); }
// @yo2 0x00790d20
void ndListCReset(uint32_t size) { nd().listC.count = 0, nd().listC.size = (int32_t)size; }
// @yo2 0x00790d60
int32_t ndListCCount() { return nd().listC.count; }
// @yo2 0x00790d90
int32_t ndListCSize() { return nd().listC.size; }
// @yo2 0x00790dc0
uint32_t ndListCFirst(int i) { return nd().listC.pair[i][0]; }
// @yo2 0x00790df0
uint32_t ndListCSecond(int i) { return nd().listC.pair[i][1]; }
// @yo2 0x00790e20
uint8_t* nd68c() { return reinterpret_cast<uint8_t*>(&nd()) + 0x68c; }

// @yo2 0x00791140
void ndSetInput(int on) { nd().input = (uint8_t)((nd().input & ~1) | (on & 1)); }
// @yo2 0x00791180 the player may move now (0x6202 type 0x1a)
int ndInput() { return nd().input & 1; }

// @yo2 0x007911b0 move mask of field zone (j, z); remember = 1 also records the "why not" dialog of an empty mask
// in g_eng.vcc378. Watching / replaying: 0; outside a move request: bit 0 only.
uint16_t ndFieldMask(int j, int z, int remember) {
    uint16_t m = nd().comid[j].field[z];
    if (remember) g_eng.vcc378 = 0xffffffff;
    if (ndIsReplay() || ndIsWatch()) return 0;
    if (!ndInput()) return m & 1;
    if (!m && remember) {
        uint32_t r = nd().comid[j].reason[z];
        g_eng.vcc378 = r == 0xff ? 0xffffffff : r;
    }
    return nd().comid[j].field[z];
}

// @yo2 0x007912c0 the same without remembering: watching / replaying 0, outside a request bit 0 (as a byte)
uint32_t ndFieldMask2(int j, int z) {
    uint16_t m = nd().comid[j].field[z];
    if (ndIsReplay() || ndIsWatch()) return 0;
    if (ndInput()) return m;
    return m & 1;
}

// @yo2 0x00791350 move mask of hand card i of player j
uint16_t ndHandMask(int j, int i, int remember) {
    if (remember) g_eng.vcc378 = 0xffffffff;
    if (ndIsReplay() || ndIsWatch() || !ndInput()) return 0;
    uint16_t m = nd().comid[j].hand[i];
    if (!m && remember) {
        uint32_t r = nd().comid[j].list[i];
        g_eng.vcc378 = r == 0xff ? 0xffffffff : r;
    }
    return m;
}

// @yo2 0x00791420 tail byte n of player j's 0x6611 (player 0: 3/4/5 enable the phase buttons)
uint8_t ndTail(int j, int n) { return nd().comid[j].tail[n]; }
// @yo2 0x00791460
uint8_t ndTail0(int n) { return ndTail(0, n); }
// @yo2 0x00791480 reason byte of field zone (j, z) while a request is open
uint8_t ndFieldReason(int j, int z) { return ndInput() ? nd().comid[j].reason[z] : 0; }
// @yo2 0x007914d0 list byte i of player j while a request is open
uint8_t ndHandReason(int j, int i) { return ndInput() ? nd().comid[j].list[i] : 0; }

// @yo2 0x00791520 one-shot "focus the duel window" request (dialog object +0x435)
uint8_t ndTakeFocus() {
    uint8_t v = g_duelUi[0x435];
    if (v) g_duelUi[0x435] = 0;
    return v;
}
// @yo2 0x00791550 ask for focus when auto-focus (+0x434) is on
void ndRequestFocus() {
    if (g_duelUi[0x434]) g_duelUi[0x435] = 1;
}

// @yo2 0x00791580
void ndSend6495(uint8_t v) { nd().send6495(v); }
// @yo2 0x007915b0
void ndSendEmpty(int32_t id) { nd().sendEmpty(id); }
// @yo2 0x007915e0
void ndSendPhase(uint32_t phase) { nd().sendPhase(phase); }
// @yo2 0x00791610
void ndSendMove(uint32_t j, uint32_t zone, uint32_t index, uint32_t cmd) { nd().sendMove(j, zone, index, cmd); }
// @yo2 0x00791650
void ndSendPass() { nd().sendPass(); }
// @yo2 0x00791670
void ndSendChoice(uint32_t v) { nd().sendChoice(v); }
// @yo2 0x007916a0
void ndSendNumber(uint32_t v) { nd().sendNumber(v); }
// @yo2 0x007916d0
void ndSendCardValue(uint32_t card, uint32_t v) { nd().sendCardValue(card, v); }
// @yo2 0x00791700
void ndSetSvrCode(uint8_t v) { nd().svrCode = v; }
// @yo2 0x00791730
void ndSetSvrFlag(uint8_t v) { nd().state = (uint8_t)((nd().state & ~ND_SVR_FLAG) | (v & 1)); }
// @yo2 0x00791770
void ndSetCut(uint8_t v) { nd().state = (uint8_t)((nd().state & ~ND_CUT) | (v & 1) << 1); }
// @yo2 0x007917b0 duel log: the scene being replayed, -1 when not replaying
int ndLogScene() { return (nd().logFlags & ND_REPLAY) ? nd().logScene : -1; }
// @yo2 0x007917f0 duel log: fusion material i of entry n
uint32_t ndLogMaterial(int n, int i) { return nd().mat[nd().matStart[n] + i]; }
// @yo2 0x00791830
uint16_t ndLogMaterialCount(int n) { return nd().matCount[n]; }
// @yo2 0x00791860 a card_prop index to its internal id
int ndPropId(int index) { return cardPropId(index); }
// @yo2 0x00791880
void ndNop() {}
// @yo2 0x007918a0
int ndTrue() { return 1; }

// @yo2 0x00790700
uint32_t ndSerial() { return g_duelSerial; }
// @yo2 0x00790720
void ndSerialNext() { g_duelSerial++; }
