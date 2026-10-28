// CNetDuel: the duel connection (port 5760), FUN_00691050..FUN_00694460. Everything a duel needs from the server
// arrives here: the preparation handshake (0x6001/0x600b), rock-paper-scissors (0x6100..0x6105), the engine command
// queue (0x6202 DUEL_SETCOMMAND), the move permissions (0x6611/0x6612), clocks (0x6461) and card lists (0x6610).
// The client answers with moves (0x6350), pass (0x6351), phase buttons (0x002e) and dialog replies (0x6423...).
// Protocol reference: YOLaucher research/lockstep/NOTES.md (proposal.py builds the server side).
//
// TODO(0b): include/yo2/System/CNetDuel.h only knows a handful of fields, so this is a layout-true stand-in built
// on src/Net's CMessageIOBase. Offsets are pinned with YO2_AT (checked on 32-bit builds).
#pragma once
#include <cstdint>

#include "../Net/MessageIO.h"

struct DuelClock {        // 0x10: one side's turn clock (0x6461); time() based
    int32_t secs;         // 0x0 seconds left
    int32_t stamp;        // 0x4 time() of the last update
    uint8_t paused;       // 0x8
    uint8_t _9[3];
    int32_t secs2;        // 0xc a second counter (-1 = none), counted down with secs
};
static_assert(sizeof(DuelClock) == 0x10, "DuelClock size");

struct DuelSide {         // 0x94 per player at CNetDuel+0x548 (0 = this client, 1 = the opponent)
    int32_t id;           // 0x00 0x600c
    char name[17];        // 0x04 0x600c / 0x6006; "KONAMI_PLAYER_01" until then
    uint8_t b15;          // 0x15 0x6006
    uint8_t _16[6];
    int32_t deckMain;     // 0x1c 0x6005 / 0x6006 (dummy deck size of the opponent); -1 = unknown
    int32_t deckExtra;    // 0x20
    uint8_t janken;       // 0x24 the opponent's hand in 0x6101 (side 1)
    uint8_t _25[3];
    int32_t lp;           // 0x28 starting LP (0x600c), 8000 by default
    char parts[3][17];    // 0x2c avatar parts per world (0 Domino, 1 Academia, 2 unused), 16 B each on the wire
    uint8_t _5f;
    uint32_t score[4];    // 0x60 0x6613
    char country[5];      // 0x70 4 chars
    uint8_t _75[3];
    DuelClock clock;      // 0x78
    uint32_t _88;
    uint32_t v8c, v90;    // 0x8c 0x600c tail
};
static_assert(sizeof(DuelSide) == 0x94, "DuelSide size");

struct ComidBlock {           // 0x12a per player at CNetDuel+0x66a4: what the player may do now
    uint16_t field[16];       // 0x00 menu mask per zone (0-4 monsters, 5-9 S/T, 10 field, 0xc-0xf piles; 11 unused)
    uint16_t hand[80];        // 0x20 menu mask per hand index (0x6612)
    uint8_t tail[10];         // 0xc0 0x6611 tail; player 0's bytes 3/4/5 enable the phase buttons
    uint8_t reason[16];       // 0xca per zone: dialog shown when clicking a card without actions (0xff = none)
    uint8_t list[80];         // 0xda 0x6612 lists
};
static_assert(sizeof(ComidBlock) == 0x12a, "ComidBlock size");

struct PairList {         // 0x88: up to 16 (a, b) pairs, a count and a size
    uint32_t pair[16][2];
    int32_t count;
    int32_t size;
};
static_assert(sizeof(PairList) == 0x88, "PairList size");

struct DuelCommand {      // 0x28: one 0x6202 entry
    uint32_t type;        // only the low byte counts (executor FUN_00721020)
    uint32_t b;
    uint32_t p[8];
};
static_assert(sizeof(DuelCommand) == 0x28, "DuelCommand size");

struct DuelDeckMsg {      // argument of sendDeck (0x6600/0x6601/0x6603)
    uint32_t mainCount;   // 0x00
    uint32_t x;           // 0x04
    uint32_t extraCount;  // 0x08
    uint16_t main[95];    // 0x0c
    uint16_t extra[40];   // 0xca
};

struct DuelCardList {     // 0x6610 SELDUELLIST_DATA as stored (0x6014 bytes): the fusion table or CWindowDeckList's
    uint32_t b;           // 0x00 u8 on the wire
    uint32_t mode;        // 0x04 0xfe = RUN_FUSION materials (CFusionEffectTask), else the deck-list window mode
    uint32_t x;
    uint32_t count;       // 0x0c
    uint32_t y;
    uint32_t card[0x1000];   // 0x14 card word: id (14 bits) | owner field << 14 (9 bits) | serial << 23
    uint16_t info[0x1000];   // 0x4014 per card: low 5 bits its zone (FUN_00720320)
};
static_assert(sizeof(DuelCardList) == 0x6014, "DuelCardList size");

enum : int {   // CMessageIOBase::req bytes of the duel (1 = sent, 2 = answered); FUN_00693190 consumes them
    ND_REQ_BOOKED = 0x1c, ND_REQ_PREPARE = 0x1d, ND_REQ_JANKEN = 0x1e, ND_REQ_HAND = 0x1f, ND_REQ_SELECTFIRST = 0x20,
    ND_REQ_DUELSTART = 0x21, ND_REQ_OTHERDECK = 0x22,
};

enum : uint8_t {   // +0x676
    ND_SVR_FLAG = 0x01,     // 0x649b second byte
    ND_CUT = 0x02,          // 0x649b code 1
    ND_FORCED_HAND = 0x04,  // 0x6105: the janken scene imposes the hand in bits 3-4
    ND_SPECTATOR = 0x20,    // 0x6700 sent: watching someone else's duel
};
enum : uint16_t { ND_REPLAY = 0x04 };   // +0x678: duel log playback (set by the DuelLog code, Net's)
enum : int { ND_QUEUE = 512 };

struct CNetDuel : CMessageIOBase {
    DuelClock global;          // 0x534 side 3 of 0x6461
    uint8_t clockWho;          // 0x544 the side of the last 0x6461
    uint8_t _545[3];
    DuelSide side[2];          // 0x548
    uint32_t flags;            // 0x670 bit0 booked (0x6007 > 0), bit1 inside the 0x6202 parser
    uint8_t input;             // 0x674 bit0 = the player may move now (0x6202 type 0x1a)
    uint8_t svrCode;           // 0x675 0x649b code
    uint8_t state;             // 0x676 ND_* bits
    uint8_t watch;             // 0x677 spectator: 1 = 0x6701 seen, 2 = 0x6702 sent
    uint16_t logFlags;         // 0x678 ND_REPLAY...
    uint8_t jankenX;           // 0x67a 0x6101 first byte (unused by the client)
    uint8_t first;             // 0x67b 0x6103: who goes first (0 = this client)
    uint8_t b67c;              // 0x67c 0x6006 tail
    uint8_t _67d[3];
    uint32_t scoreX;           // 0x680 0x6613
    int32_t bgm;               // 0x684 the duel's own BGM pick (CDuelScene: field-spell kind 0)
    uint8_t b688;              // 0x688
    uint8_t gotMsg;            // 0x689 set by every received message
    uint8_t _68a[0x66a0 - 0x68a];
    uint8_t jseen[3];          // 0x66a0 0x6701
    uint8_t _66a3;
    ComidBlock comid[2];       // 0x66a4
    DuelCommand queue[ND_QUEUE];   // 0x68f8
    int32_t last;              // 0xb8f8 index of the last queued command; -1 = empty
    PairList listA;            // 0xb8fc 0x6202 type 0x60/0x61: dialog text pairs (value, class)
    PairList listB;            // 0xb984 dialog list B
    PairList listC;            // 0xba0c fusion / material list
    uint8_t _ba94[2];
    uint16_t logScene;         // 0xba96 duel log: the scene being replayed (FUN_007917b0)
    uint8_t _ba98[0xbaa1 - 0xba98];
    uint8_t logPlayer;         // 0xbaa1 duel log: whose view is replayed
    uint8_t _baa2[0xbcda - 0xbaa2];
    uint8_t logSide[2][5];     // 0xbcda
    uint8_t* logCmds;          // 0xbce4 duel log commands, 0x2c each: u8 player, then a DuelCommand
    int32_t logCount;          // 0xbce8
    int32_t logBce;            // 0xbcec
    int32_t logPos;            // 0xbcf0
    uint8_t _bcf4[0xbd08 - 0xbcf4];
    uint16_t matStart[0xa1];   // 0xbd08 duel log: first fusion material of entry i (index into mat)
    uint16_t matCount[0xa1];   // 0xbe4a ... and how many
    uint32_t mat[0x400];       // 0xbf8c material card words
    uint16_t search[0x200][2]; // 0xcf8c 0x6017 SERCHINFO pairs
    int32_t searchCount;       // 0xd78c
    uint32_t searchTotal;      // 0xd790

    void construct();                          // FUN_00691050
    void destruct();                           // FUN_00691170
    int32_t connect(int gate, const char* host, uint16_t port, uint32_t notify);   // FUN_00691190
    int32_t onRecv();                          // FUN_00691310

    // client -> server
    void sendKey(const uint8_t* obj);          // FUN_00691760 0x6004: 16 bytes at obj+0x10
    void sendBookedCheck(uint32_t id);         // FUN_006917b0 0x6001
    void sendPrepare();                        // FUN_00691880 0x600b
    void sendGotoJanken();                     // FUN_00691ad0 0x6100
    void sendJankenHand(uint8_t hand);         // FUN_00691b80 0x6101
    void sendGotoSelectFirst();                // FUN_00691c20 0x6102
    void sendSelectFirst(uint8_t who);         // FUN_00691cd0 0x6103
    void sendGotoDuelStart();                  // FUN_00691d60 0x6104 (no callers in the exe)
    void sendPhase(uint32_t phase);            // FUN_00691df0 0x002e
    void sendMove(uint32_t player, uint32_t zone, uint32_t index, uint32_t cmd);   // FUN_00691e40 0x6350
    void sendPass();                           // FUN_00691ed0 0x6351
    void sendDebugCard(uint32_t a, uint32_t b, uint32_t c, uint32_t d, uint32_t e);   // FUN_00691f40 0x61ff
    void sendDebug(uint32_t a, uint32_t b, uint32_t c, uint32_t d);                    // FUN_00691fd0 0x61f0
    void sendDuelReady(uint8_t setPosition);   // FUN_00692060 0x61fe: the server starts the duel on this
    void sendNumber(uint32_t n);               // FUN_006920b0 0x6426
    void sendCardValue(uint32_t card, uint32_t v);   // FUN_00692120 0x6432
    void sendChoice(uint32_t v);               // FUN_00692190 0x6423
    void sendWatch();                          // FUN_006926d0 0x6700
    void watchKeepAlive();                     // FUN_00692720 0x6702 (at most every 10 s)
    void sendWatch6703();                      // FUN_006927b0 0x6703
    void send6495(uint8_t v);                  // FUN_006927f0 0x6495
    void sendDeck(const DuelDeckMsg* d);       // FUN_00692840 0x6600 + 0x6601 + 0x6603
    void sendEmpty(int32_t id);                // FUN_00692b40
    void sendSearchAck(uint8_t v);             // FUN_00694460 0x6013

    // server -> client
    void onBookedCheck();                      // FUN_00691800 0x6007
    void onPreparation();                      // FUN_006918d0 0x600c
    void onOtherDeck();                        // FUN_00691a50 0x6005
    void onGotoJanken();                       // FUN_00691b40 0x6100
    void onJankenResult();                     // FUN_00691bd0 0x6101
    void onGotoSelectFirst();                  // FUN_00691c90 0x6102
    void onSelectFirst();                      // FUN_00691d20 0x6103
    void onGotoDuelStart();                    // FUN_00691db0 0x6104
    void onSvrInfo();                          // FUN_00692200 0x649b
    void onForcedJanken();                     // FUN_00692290 0x6105
    void onScore();                            // FUN_00692350 0x6613
    void onOtherDeckWatch();                   // FUN_00692470 0x6006
    void onSetCommand();                       // FUN_00692580 0x6202
    void onWatchSeen();                        // FUN_00692660 0x6701
    void onCardList();                         // FUN_006929b0 0x6610
    void onTimeUp();                           // FUN_00692bf0 0x6461
    void onComidField();                       // FUN_00692f40 0x6611
    void onComidHand();                        // FUN_00693030 0x6612
    void onSearchInit();                       // FUN_00694340 0x6016
    void onSearch();                           // FUN_00694390 0x6017

    void clearComid();                         // FUN_00692300 (also ends the move permission)
    void reset();                              // FUN_00692b90
    int32_t sideSecs(uint32_t who);            // FUN_00692cc0
    int32_t sideSecs2(int who) const;          // FUN_00692dc0
    int32_t globalSecs(int p);                 // FUN_00692e30
    bool answered(int n);                      // FUN_00693190: req byte 0x1c+n went 2 -> 0
    void popCommand();                         // FUN_00790880: drop queue[0]
};
YO2_AT(CNetDuel, global, 0x534);
YO2_AT(CNetDuel, clockWho, 0x544);
YO2_AT(CNetDuel, side, 0x548);
YO2_AT(CNetDuel, flags, 0x670);
YO2_AT(CNetDuel, input, 0x674);
YO2_AT(CNetDuel, logFlags, 0x678);
YO2_AT(CNetDuel, first, 0x67b);
YO2_AT(CNetDuel, scoreX, 0x680);
YO2_AT(CNetDuel, gotMsg, 0x689);
YO2_AT(CNetDuel, jseen, 0x66a0);
YO2_AT(CNetDuel, comid, 0x66a4);
YO2_AT(CNetDuel, queue, 0x68f8);
YO2_AT(CNetDuel, last, 0xb8f8);
YO2_AT(CNetDuel, listA, 0xb8fc);
YO2_AT(CNetDuel, listC, 0xba0c);
YO2_AT(CNetDuel, logScene, 0xba96);
YO2_AT(CNetDuel, matStart, 0xbd08);
YO2_AT(CNetDuel, matCount, 0xbe4a);
YO2_AT(CNetDuel, mat, 0xbf8c);
YO2_AT(CNetDuel, logPlayer, 0xbaa1);
YO2_AT(CNetDuel, logSide, 0xbcda);
YO2_AT(CNetDuel, logCmds, 0xbce4);
YO2_AT(CNetDuel, logPos, 0xbcf0);
YO2_AT(CNetDuel, search, 0xcf8c);
YO2_AT(CNetDuel, searchTotal, 0xd790);
static_assert(sizeof(void*) != 4 || sizeof(CNetDuel) == 0xd794, "CNetDuel size");

void ndHexPairs(const char* s, uint16_t* out);   // FUN_00694140

// Globals the duel code shares (DAT_ addresses of the exe). In the game (the i686 build) they ARE the exe's; elsewhere
// they are ordinary globals. TODO(System): move to the app object when it exists.
#if defined(_WIN32) && defined(__i386__)
#define YO2_EXE_U32(a) (*reinterpret_cast<uint32_t*>(a))
#define g_duelMode (*reinterpret_cast<int32_t*>(0x012a9084))
#define g_turnPlayer YO2_EXE_U32(0x012cc2d0)
#define g_sceneId (*reinterpret_cast<uint8_t*>(YO2_EXE_U32(YO2_EXE_U32(0x012711ac) + 0xc6c) + 0x9ed))
#define g_duelUi (*reinterpret_cast<uint8_t**>(0x012bb6b0))
#define g_fusionList (*reinterpret_cast<DuelCardList*>(0x012be180))
#define g_netDuel (*reinterpret_cast<CNetDuel**>(YO2_EXE_U32(0x012711ac) + 0xc70))
#else
extern int32_t g_duelMode;          // DAT_012a9084: 0/1 = no clocks (local / practice)
extern uint32_t g_turnPlayer;       // DAT_012cc2d0: whose turn it is
extern uint8_t g_sceneId;           // *(*(DAT_012711ac+0xc6c)+0x9ed): the running scene (0x14 = ?)
extern uint8_t* g_duelUi;           // DAT_012bb6b0: duel UI object; +0x434 auto-focus, +0x435 focus request, +0x438 1 -> 2 on 0x6351
extern DuelCardList g_fusionList;   // DAT_012be180 (0x6610 mode 0xfe)
extern CNetDuel* g_netDuel;         // *(DAT_012711ac+0xc70)
#endif
extern DuelCardList& g_deckList;    // DAT_012ccb20 (0x6610 other modes) = g_eng.deckList
