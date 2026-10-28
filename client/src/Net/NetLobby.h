// CNetLobby: the lobby connection (My Room 5732, and every room port). Starts with its own login (0x3001/0x3003,
// same digest as the account server, with the account's user and password), then PSELECT (0x4100), the block list
// (0x4200/0x4201), entering a block (0x4202/0x4203) and the block's player lists LIST1..LIST5 (0x4210..0x4224).
// After that: positions (0x5300), joins/leaves (0x3112), duels, chat, mail, friends, teams, trades, shop, tournaments.
//
// This round covers the request builders (NetLobby.cpp) and the entry-flow parsers (NetLobby_Parse.cpp); the rest
// of the ~170 incoming messages are listed in onRecv.
#pragma once
#include <deque>
#include <list>
#include <memory>
#include <string>
#include <vector>

#include "NetAccount.h"
#include "NetGate.h"

struct COnlinePlayer : CPlayerInfo {   // CLobbyPlayer, 0x1ac (FUN_006c33d0)
    uint8_t b1a8 = 0, b1a9 = 0;   // 0x1a8 (cleared by FUN_006c33d0)
    uint8_t _1aa[2];
};
YO2_SIZEOF(COnlinePlayer, 0x1ac);

struct LobbyBlock {         // one BLOCKLIST (0x4201) entry, 0xc bytes
    uint16_t id;            // 0x0
    uint8_t _2[2];
    uint32_t area;          // 0x4
    uint8_t kind;           // 0x8
    uint8_t index;          // 0x9
    uint8_t _a[2];
};
static_assert(sizeof(LobbyBlock) == 0xc, "LobbyBlock size");

struct ShopPick {           // one line of the shop cart (0x1c bytes in the exe)
    uint32_t itemId;        // 0x00
    uint8_t _04[0x10];
    uint8_t count;          // 0x14
    uint8_t _15[7];
};
static_assert(sizeof(ShopPick) == 0x1c, "ShopPick size");

struct CDuelRoom {          // 0x18 (FUN_006c3500)
    uint32_t _vtbl;
    int32_t id;             // 0x04
    int32_t p1, p2;         // 0x08 owner / challenger (both 0 in 0x3113 = deleted)
    bool locked;            // 0x10 password
    uint8_t dstyle;         // 0x11 duel style (default 3)
    uint8_t wmode;          // 0x12
    uint8_t mstat;          // 0x13 1 = auto duel (YOLaucher lobby)
    uint8_t mine;           // 0x14
    uint8_t x[3];           // 0x15 default 1
};
static_assert(sizeof(CDuelRoom) == 0x18, "CDuelRoom size");

struct MatchEntry {         // 0x14, matching server (0x3604)
    uint32_t _00;
    int32_t pid;            // 0x04
    uint8_t found;          // 0x08
    uint8_t _09;
    uint16_t _0a;
    uint8_t b[5];           // 0x0c
    uint8_t _11[3];
};
static_assert(sizeof(MatchEntry) == 0x14, "MatchEntry size");

struct ChatLine { int32_t channel; int32_t pid; uint8_t kind; std::u16string text; };   // 0x4402 entry of the list at +0x3554

struct MoveRecord { int32_t pid; uint32_t xy; uint32_t dir; };   // recorded 0x5300 (x | y << 16, dir | b << 8)

// ---- Shop group (NetLobby_Shop.cpp)
struct ShopItem {           // one 0x5209 SHOPLISTNOTICE line, 0x14 bytes (FUN_006ae680)
    uint32_t itemId;        // 0x00
    uint8_t type;           // 0x04 0 card, 1 pack, 2 avatar part (YOLaucher tienda.py)
    uint8_t _05[3];
    uint32_t param;         // 0x08 card id / pack id / PBIN bit
    uint32_t cost;          // 0x0c MP
    uint8_t b[4];           // 0x10
};
static_assert(sizeof(ShopItem) == 0x14, "ShopItem size");

struct ShopPurchase {       // one 0x5212 PURCHASE_SHOP_ITEM line, 0x14 bytes (FUN_006c1f30)
    uint32_t itemId;        // 0x00
    uint8_t type;           // 0x04
    uint8_t _05[3];
    int32_t card;           // 0x08 card id (types 0/1) or PBIN bit
    uint32_t _0c;           // 0x0c never written by the exe (stack garbage there)
    uint8_t isNew;          // 0x10
    uint8_t b[3];           // 0x11
};
static_assert(sizeof(ShopPurchase) == 0x14, "ShopPurchase size");

struct Mark5310 { int32_t pid; uint32_t ab; };   // recorded 0x5310 (a | b << 8)

struct CChampsData {        // tournament ("CHAMPIONSHIP") state, CNetLobby+0x35fc (YOLaucher research/torneos)
    uint32_t _vtbl;         // 0x00
    int32_t serial;         // 0x04 (+0x3600)
    char name[104];         // 0x08 100 B + NUL
    int32_t day;            // 0x70 (+0x366c) 1-16 preliminary day, 0x11 final
    uint32_t u74, u78;      // 0x74
    int32_t maxPlayers;     // 0x7c (+0x3678)
    int32_t entries;        // 0x80 (+0x367c) entrants; also the entry-table fill index
    int32_t rounds;         // 0x84 (+0x3680)
    char champion[17];      // 0x88 (+0x3684)
    uint8_t _99[3];
    int32_t u9c;            // 0x9c (+0x3698)
    char runnerUp[17];      // 0xa0 (+0x369c)
    uint8_t lotteryState;   // 0xb1 (+0x36ad) 1 drawing, 2 done
    uint8_t _b2[2];
    int32_t phase;          // 0xb4 (+0x36b0)
    uint8_t phaseState;     // 0xb8 (+0x36b4)
    uint8_t _b9[3];
    int32_t roundPhase;     // 0xbc (+0x36b8)
    uint8_t roundState;     // 0xc0 (+0x36bc)
    uint8_t lotResult;      // 0xc1 (+0x36bd) 1 in, 2 out
    uint8_t _c2[2];
    int32_t round;          // 0xc4 (+0x36c0)
    uint8_t subtitle;       // 0xc8 (+0x36c4)
    uint8_t _c9[3];
    int32_t timer;          // 0xcc (+0x36c8) seconds left
    int32_t alive;          // 0xd0 (+0x36cc)
    int32_t audience;       // 0xd4 (+0x36d0)
    int32_t state;          // 0xd8 (+0x36d4) 0-9
    int32_t udc;            // 0xdc (+0x36d8)
};
static_assert(sizeof(CChampsData) == 0xe0, "CChampsData size");

struct TourSlot { int32_t pid; uint8_t side, result, wins, _7; };   // side 1/2 (bit 0x80), result 1/2 (0x40), wins
struct TourPage {           // one 0x48-byte page of the tournament bracket (CNetLobby+0x36dc, 0x49 of them)
    uint32_t _vtbl;
    uint8_t count, b5;      // 0x04
    uint8_t _06[2];
    TourSlot slot[8];       // 0x08
};
static_assert(sizeof(TourPage) == 0x48, "TourPage size");

struct CChampsEntryList {   // one tournament entrant (CNetLobby+0x4b64, 0x200 of them)
    uint32_t _vtbl;         // 0x00
    int32_t pid;            // 0x04
    char name[17];          // 0x08
    uint8_t wins;           // 0x19
    uint8_t status;         // 0x1a 1 = has a duel
    char country[5];        // 0x1b
    CAvatarData avatar[2];  // 0x20
};
YO2_SIZEOF(CChampsEntryList, 0x48);

enum : int {   // CMessageIOBase::req bytes of the lobby (1 = sent, 2 = answered)
    LB_REQ_HELLO = 0x1c, LB_REQ_AUTH = 0x1d, LB_REQ_PSELECT = 0x1e, LB_REQ_BLOCKLIST = 0x1f, LB_REQ_ENTERBLOCK = 0x20,
    LB_REQ_LIST1 = 0x21, LB_REQ_LIST2 = 0x22, LB_REQ_LIST3 = 0x23, LB_REQ_LIST4 = 0x24, LB_REQ_PLAYERINFO = 0x25,
    LB_REQ_AVATARINFO = 0x26, LB_REQ_REGAVATAR = 0x27, LB_REQ_COMMENT = 0x28, LB_REQ_ROOMLIST = 0x29,
    LB_REQ_CREATEROOM = 0x2a, LB_REQ_DELETEROOM = 0x2b, LB_REQ_CANCELMATCH = 0x2f, LB_REQ_WATCH = 0x32,
    LB_REQ_CHATROOMLIST = 0x33, LB_REQ_CREATECHATROOM = 0x34, LB_REQ_EXITCHATROOM = 0x37, LB_REQ_RECOVERYPACK = 0x39,
    LB_REQ_SELECTPACK = 0x3a, LB_REQ_RESETAUTOWAIT = 0x3c, LB_REQ_FRIEND = 0x3d, LB_REQ_PIDBYNAME = 0x41,
    LB_REQ_RCVMAIL = 0x43, LB_REQ_MAILCOUNT = 0x44, LB_REQ_ADDBLACK = 0x46, LB_REQ_DELBLACK = 0x47,
    LB_REQ_MILEAGEITEM = 0x4a, LB_REQ_MILEAGERESULT = 0x4c, LB_REQ_TRADEREADY = 0x4e, LB_REQ_TRADESTART = 0x4f,
    LB_REQ_TRADE = 0x50, LB_REQ_TRADEOFFERREPLY = 0x52, LB_REQ_CANCELTRADE = 0x54, LB_REQ_TRADECARD = 0x56,
    LB_REQ_TRADECARD2 = 0x57, LB_REQ_TRADESTATUS = 0x5a, LB_REQ_TRADECONFIRM = 0x5c, LB_REQ_TRADEEXIT = 0x5e,
    LB_REQ_TRADECLEAR = 0x61, LB_REQ_PURCHASEPACK = 0x64, LB_REQ_PRESENTPACK = 0x66, LB_REQ_DPAUTH = 0x67,
    LB_REQ_GUNSLING = 0x68, LB_REQ_TOURINFO = 0x69, LB_REQ_TOURENTRY = 0x70, LB_REQ_TOURLIST = 0x72,
    LB_REQ_TOURENDRESULT = 0x75, LB_REQ_TOURTIMER = 0x76, LB_REQ_TOURPCOUNTER = 0x77, LB_REQ_TOURSTATUS = 0x78,
    LB_REQ_CHAMPSCARD = 0x79, LB_REQ_USBDPAUTH = 0x7a, LB_REQ_SDGET = 0x7b, LB_REQ_TPPRESENTINFO = 0x7c,
    LB_REQ_TPCARDGET = 0x7d, LB_REQ_STARTUPPRESENT = 0x7e, LB_REQ_ITEMGET = 0x7f, LB_REQ_NPCINFOLIST = 0x80,
    LB_REQ_SHOPRESULT = 0x83, LB_REQ_TEAMCREATE = 0x84, LB_REQ_TEAMDISBAND = 0x85, LB_REQ_TEAMLIST = 0x88,
    LB_REQ_LIST5 = 0x89, LB_REQ_TITLE = 0x8a,
    LB_REQ_MATCH = 0x2c, LB_REQ_OFFER = 0x2d, LB_REQ_OFFERTIMEOUT = 0x2e, LB_REQ_DUELSERVER = 0x30,
    LB_REQ_DUELABORT = 0x31, LB_REQ_AUTODUEL = 0x3b, LB_REQ_MATCHING = 0x40,
};

enum { DPAUTH_TOO_MANY = -2000, RESULT_PENDING = -150 };   // more than 10 DUELPASS / USB code attempts

// Social types (NetLobby_Social.cpp)
struct CFriendApply {        // a pending friend request (0x4512), 0x1c bytes (FUN_006c3860)
    uint32_t _vtbl;          // 0x00
    int32_t pid;             // 0x04
    char name[17];           // 0x08
    uint8_t level;           // 0x19
    uint8_t _1a[2];
};
static_assert(sizeof(CFriendApply) == 0x1c, "CFriendApply size");

// @yo2 0x006afcd0 TeamMember::~TeamMember (the name string): the implicit destructor
struct TeamMember {          // 0x18 bytes in the exe: u32 pid, std::string name, u8 authority
    int32_t pid;
    std::string name;
    uint8_t authority;
};

// @yo2 0x006af660 TeamApplication::~TeamApplication (the two strings, last first): the implicit destructor
struct TeamApplication {     // 0x28 bytes in the exe (0x4567): u32 applicant, u32 team leader, 2 x std::string
    int32_t applicant;
    int32_t leader;
    std::string applicantName;
    std::string leaderName;
};

struct LobbyMail {           // the mail record handed to the mailbox (built by 0x4612, sent by 0x4600)
    int32_t from;            // 0x00
    std::string fromName;    // 0x04
    int32_t to;              // 0x14
    std::string toName;      // 0x18
    int32_t sent;            // 0x28 time_t on the wire; SENDMAIL stamps time() here
    int32_t received;        // 0x2c time() when it arrived
    std::string subject;     // 0x30 32 B on the wire
    std::string body;        // 0x40 512 B
    std::string extra;       // 0x50 64 B
    uint8_t valid;           // 0x60
    uint8_t read;            // 0x61
    uint8_t b62;             // 0x62
    ~LobbyMail();            // FUN_006bf0d0
    std::string subjectText() const;   // FUN_006cd840 (a copy)
    std::string bodyText() const;      // FUN_006cd9c0
    std::string extraText() const;     // FUN_006cdb40
};

struct CNetLobby : CMessageIOBase {
    int32_t packGot;            // 0x534 Shop: DUELPASS code gave cards (0x8102)
    int32_t packOpened;         // 0x538 Shop: a bought pack was opened (0x4903)
    int32_t usbPackGot;         // 0x53c Shop: USB DUELPASS gave cards (0x8204)
    int32_t packOpenCount;      // 0x540 Shop: 0x4903 second field
    int32_t dpAuthTries;        // 0x544
    uint16_t tpVictoryCard;     // 0x548 Shop: 0x8302
    uint8_t deckNpcBin[0x201];  // 0x54a Shop: 0x4182 SAVE_DECK, 0x200 B
    uint8_t deckPbin[0x81];     // 0x74b Shop: 0x4182 SAVE_DECK, 0x80 B
    uint8_t challenge[17];      // 0x7cc
    uint8_t _7dd;               // 0x7dd
    uint8_t authOk;             // 0x7de
    uint8_t _7df;
    // 0x7e0 the result table: every ...RESULT parser writes results[k], the lobby task takes it (takeResult);
    // RESULT_PENDING until it arrives. The named fields are its slots.
    union {
        int32_t results[0x6f];
        struct {
            int32_t result0;            // 0x7e0
            int32_t authResult;         // 0x7e4
            int32_t pselectResult;      // 0x7e8
            uint8_t _7ec[4];
            int32_t enterBlockResult;   // 0x7f0
            int32_t listCount[4];       // 0x7f4 LIST1..LIST4 START values
            int32_t playerInfoResult;   // 0x804 0x4160
            int32_t avatarInfoResult;   // 0x808 0x5340
            int32_t regAvatarResult;    // 0x80c 0x4171
            int32_t commentResult;      // 0x810 0x4173
            int32_t roomListCount;      // 0x814 0x4282 (< 0 = error)
            int32_t createRoomResult;   // 0x818 0x428a
            int32_t deleteRoomResult;   // 0x81c 0x4292
            int32_t reqMatchResult;     // 0x820 0x4301
            uint8_t _824[8];
            int32_t cancelMatchResult;  // 0x82c 0x4309
            uint8_t _830[4];
            int32_t duelAbortResult;    // 0x834 0x4310
            int32_t watchResult;        // 0x838 0x4321
            uint8_t _83c[0x858 - 0x83c];
            int32_t selectPackResult;   // 0x858 0x4803
            uint8_t _85c[4];
            int32_t resetAutoWaitResult;// 0x860 0x42a2
            int32_t reqFriendResult;    // 0x864 0x4511
            uint8_t _868[8];
            int32_t friendSearchResult; // 0x870 0x4521
            int32_t pidByNameResult;    // 0x874 0x4501
            int32_t sendMailResult;     // 0x878 0x4601
            int32_t mailListResult;     // 0x87c 0x4611
            int32_t mailCount;          // 0x880 0x4621
            uint8_t _884[4];
            int32_t addBlackResult;     // 0x888 0x4531
            int32_t delBlackResult;     // 0x88c 0x4541
            uint8_t _890[0x8a4 - 0x890];
            int32_t mileageResult;      // 0x8a4 Shop: 0x5203
            uint8_t _8a8[8];
            int32_t reqTradeResult;     // 0x8b0 0x7103
            uint8_t _8b4[4];
            int32_t tradeOfferReplyResult;    // 0x8b8 0x7105
            uint8_t _8bc[0x8c8 - 0x8bc];
            int32_t addCardResult;      // 0x8c8 0x7113
            int32_t deleteCardResult;   // 0x8cc 0x7114
            uint8_t _8d0[0x900 - 0x8d0];
            int32_t packOpenResult;     // 0x900 Shop: 0x4903
            uint8_t _904[4];
            int32_t presentPackResult;  // 0x908 Shop: 0x4905
            int32_t dpAuthResult;       // 0x90c
            uint8_t _910[0x958 - 0x910];
            int32_t usbDpAuthResult;    // 0x958
            int32_t sdGetResult;        // 0x95c Shop: 0x5401
            uint8_t _960[4];
            int32_t tpCardGetResult;    // 0x964 Shop: 0x8304
            int32_t startupPresentResult;   // 0x968 Shop: 0x8402
            uint8_t _96c[4];
            int32_t npcInfoCount;       // 0x970 Shop: 0x4231
            uint8_t _974[4];
            int32_t shopResult;         // 0x978 Shop: 0x5211
            int32_t purchaseResult;     // 0x97c Shop: 0x5212
            int32_t teamCreateEnd;      // 0x980 0x4566
            int32_t teamDisbandResult;  // 0x984 0x4553
            uint8_t _988[8];
            int32_t teamListEnd;        // 0x990 0x4565
            int32_t list5Count;         // 0x994
            int32_t titleResult;        // 0x998 0x4175
        };
    };
    uint8_t _99c[0x9b8 - 0x99c];   // 0x9a0 portable: the player vector lives here in the exe; see players
    int32_t playersChanged;     // 0x9b8
    uint8_t _9bc[0x9d0 - 0x9bc];   // 0x9bc portable: the duel room list (CDuelRoomList); see rooms
    uint8_t roomsChanged;       // 0x9d0 set by 0x3113
    uint8_t _9d1[0x9ec - 0x9d1];   // 0x9d8 portable: the block vector (CBlockList); see blocks
    uint8_t rgn, rank, area;    // 0x9ec gate entry wanted: b1 / b2 / b3 (YOLaucher puerta.py)
    uint8_t block;              // 0x9ef ENTERBLOCKRESULT
    uint8_t block2, block3;     // 0x9f0
    uint8_t blockChange;        // 0x9f2 ENTERBLOCK's second byte (CNetLobbyTask::enterBlock)
    uint8_t _9f3;
    COnlinePlayer rival;        // 0x9f4 who offered / was matched (0x4302, 0x43a0, REQMATCH)
    COnlinePlayer info;         // 0xba0 0x4160 REQPLAYERINFO result
    int32_t avatarPid;          // 0xd4c 0x5340 REQAVATARINFO result
    char avatarName[17];        // 0xd50
    uint8_t _d61[7];
    float avatarX, avatarY;     // 0xd68
    uint8_t _d70[4];
    uint8_t avatarDir;          // 0xd74 (0-7)
    uint8_t _d75[3];
    char duelIp[16];            // 0xd78 0x4306 / 0x4321: duel server
    uint16_t duelPort;          // 0xd88
    uint8_t watchState;         // 0xd8a 1 = offered, 2 = auto duel, 3 = watching
    uint8_t ownRoom;            // 0xd8b 1 = one of the listed rooms is mine
    CDuelRoom* myRoom;          // 0xd8c
    uint8_t _d90[8];
    int32_t eventId;            // 0xd98 0x5000
    int32_t eventKind;          // 0xd9c
    uint8_t eventNew;           // 0xda0
    uint8_t autoDuelMode;       // 0xda1 0x43a0's last byte
    uint8_t _da2[2];
    int32_t mileageSel;         // 0xda4
    uint32_t mileageItem[100];  // 0xda8
    uint16_t mileageA[100];     // 0xf38
    uint16_t mileageB[100];     // 0x1000
    uint16_t mileageC[100];     // 0x10c8
    uint8_t _1190[0x11e0 - 0x1190];   // portable: 0x1190 shop items, 0x11a0 cart, 0x11b0 purchases, 0x11c0 team
                                      // members, 0x11d0 team name; see the vectors
    uint8_t inTeam;             // 0x11e0
    uint8_t myTeamAuthority;    // 0x11e1
    uint8_t _11e2[6];
    uint8_t joinApplied;        // 0x11e8
    uint8_t _11e9[0x11fc - 0x11e9];   // 0x11ec portable: join applications (vector); see Social
    int32_t teamCreateResult;   // 0x11fc 0x4551
    uint8_t _1200[0x10];        // 0x1200 portable: the card pack list; see cardPacks
    int32_t packCard[0x50];     // 0x1210 0x4803 cards drawn (-1 = none)
    uint8_t packNew[0x50];      // 0x1350 0x4803 per-card flag
    uint8_t _13a0[0x10];        // 0x13a0 portable: friend offers (vector); see Social
    MatchEntry matching[100];   // 0x13b0 matching-server players (0x3603 / 0x3604)
    uint32_t matchingCount;     // 0x1b80 entries asked for
    uint32_t matchingFound;     // 0x1b84 entries answered
    int32_t pidByName;          // 0x1b88 0x4501
    int32_t friendAccepted;     // 0x1b8c 0x4515
    int32_t friendPid;          // 0x1b90
    uint8_t _1b94[0x10];        // 0x1b94 portable: friend name (std::string); see friendName
    uint8_t newMail;            // 0x1ba4 the "new mail" icon
    uint8_t _1ba5[3];
    int32_t roomListTotal;      // 0x1ba8
    int32_t maintSeconds;       // 0x1bac 0x4700 seconds left
    int32_t maintTime;          // 0x1bb0 time() it arrived
    uint32_t _vtbl1bb4;         // 0x1bb4 CTradeData
    int32_t tradePartner;       // 0x1bb8 0x7104
    char tradePartnerName[17];  // 0x1bbc
    uint8_t _1bcd;
    uint16_t ownMoveCard;       // 0x1bce 0x7115
    uint8_t ownMoveOp;          // 0x1bd0
    uint8_t ownStatus;          // 0x1bd1 0x7117
    uint16_t otherMoveCard;     // 0x1bd2 0x7116
    uint8_t otherMoveOp;        // 0x1bd4
    uint8_t otherStatus;        // 0x1bd5 0x7134
    uint8_t confirmResult;      // 0x1bd6 0x7120
    uint8_t tradeEndOk;         // 0x1bd7 0x7121
    uint8_t offered;            // 0x1bd8 an offer is pending
    uint8_t _1bd9;
    uint8_t offerCancelled;     // 0x1bda
    uint8_t _1bdb;
    uint8_t tradeTrunkChunk;    // 0x1bdc
    uint8_t tradeTrunk[TRUNK_BYTES + 1];   // 0x1bdd the partner-visible trunk, 0x7126 chunks
    uint8_t tradeLimitChunk;    // 0x2896
    uint8_t tradeLimit[TRUNK_BYTES + 1];   // 0x2897 cards that can't be traded, 0x7130 chunks
    uint8_t _3550[0x35ec - 0x3550];   // 0x3550 portable: the chat log list (+0x3558 count), 9 channel prefixes; see chat
    uint16_t dpCard;            // 0x35ec Shop: 0x8102 card
    uint8_t dpExtra;            // 0x35ee
    uint8_t _35ef;
    int32_t dpGain;             // 0x35f0 Shop: DP gained (0x8102 / 0x4903 / 0x8204)
    uint16_t dpPack;            // 0x35f4 Shop: 0x8102 structure deck / pack id
    uint8_t _35f6[6];
    CChampsData champs;         // 0x35fc Shop: tournament
    TourPage tourPage[0x49];    // 0x36dc Shop: bracket
    CChampsEntryList tourEntry[0x200];   // 0x4b64 Shop: entrants
    uint8_t tourDuelStart;      // 0xdb64 Shop: 0x5120
    uint8_t recordMoves;        // 0xdb65
    uint8_t _db66[0xdb94 - 0xdb66];   // 0xdb6c portable: the recorded-moves deque; see moves
    int32_t moveCount;          // 0xdb94
    uint8_t _db98[0xdbc4 - 0xdb98];   // 0xdb9c portable: the recorded-0x5310 deque; see marks
    int32_t markCount;          // 0xdbc4 Shop
    uint8_t usbB;               // 0xdbc8 Shop: 0x8204 first byte
    uint8_t _dbc9;
    uint16_t usbCard[3];        // 0xdbca Shop: FUN_006af0b0
    uint8_t usbNew[3];          // 0xdbd0
    uint8_t usbGain;            // 0xdbd3
    int32_t npcPresentType;     // 0xdbd4 Shop: 0x4237

    std::vector<COnlinePlayer> players;   // past the exe's layout
    std::vector<LobbyBlock> blocks;
    std::vector<ShopPick> cart;
    std::deque<MoveRecord> moves;
    // Rooms
    std::vector<std::unique_ptr<CDuelRoom>> rooms;   // smart_ptr vector in the exe, so myRoom stays valid
    std::vector<uint16_t> cardPacks;                  // 0x4800 pack ids (the exe keeps Pack/'s info record per id)
    std::list<ChatLine> chat;
    std::u16string chatPrefix[9];
    // Social
    std::vector<TeamMember> teamMembers;        // 0x11c0 in the exe
    std::string teamName;                       // 0x11d0
    std::vector<TeamApplication> joinApplications;   // 0x11ec
    std::vector<CFriendApply> friendOffers;     // 0x13a0 (a vector of smart_ptr<CFriendApply> in the exe)
    std::string friendName;                     // 0x1b94
    // Shop
    std::vector<ShopItem> shopItems;      // exe +0x1190
    std::vector<ShopPurchase> purchased;  // exe +0x11b0
    std::deque<Mark5310> marks;           // exe +0xdb9c

    COnlinePlayer* findPlayer(int32_t pid);
    bool takeResult(int32_t* out, int k);           // FUN_006adfb0
    void resetResults();                            // the results part of FUN_006ab5e0
    void clearDuelAbort();                          // FUN_006adf90
    COnlinePlayer& newPlayer();                       // FUN_006c33d0

    // connection + login
    int32_t connect(const CNetGate* gate);          // FUN_006abe10
    void sendHello();                               // FUN_006cb940
    void sendAuth(const CNetAccount& acc);          // FUN_006cb990
    void reqPSelect(uint8_t lang, uint8_t slot, const uint32_t* deck, int n);   // FUN_006cbb20
    void reqBlockList();                            // FUN_006cbc10
    void reqEnterBlock(uint8_t block, uint8_t change);   // FUN_006cbc60
    void reqList1(int32_t pid);                     // FUN_006cbce0
    void reqList2(int32_t pid);                     // FUN_006cbd50
    void reqList3(int32_t pid);                     // FUN_006cbdc0
    void reqList4(int32_t pid);                     // FUN_006cbe30
    void reqList5(int32_t pid);                     // FUN_006cbea0
    void reqNpcInfoList();                          // FUN_006cbf10
    void reqPlayerInfo(uint32_t pid);               // FUN_006cbf80
    void reqAvatarInfo(uint32_t pid);               // FUN_006cbff0
    void regAvatarInfo(uint32_t a, const uint8_t parts[16], uint32_t b);   // FUN_006cc060
    void regComment(uint8_t line, const char text[32]);   // FUN_006cc0f0
    void updateTitle(int32_t title);                // FUN_006cc170
    // rooms, matches, chat
    void reqDuelRoomList(int32_t v);                // FUN_006cc1e0
    void reqCreateRoom(uint8_t a, uint8_t b, uint8_t c, bool locked, const char* password, uint8_t d, uint8_t e,
                       uint8_t f, uint32_t g);      // FUN_006cc250
    void reqDeleteRoom();                           // FUN_006cc3d0
    void matchOfferReply(bool yes);                 // FUN_006cc8e0
    void autoMatchReply(bool yes);                  // FUN_006cc960
    void cancelReqMatch();                          // FUN_006cc9e0
    void sendChat(uint8_t kind, uint32_t a, uint32_t b, uint32_t c, const char* text, int len);   // FUN_006cca30
    void reqWatch(uint32_t room);                   // FUN_006ccb70
    void reqChatRoomList();                         // FUN_006ccbf0
    void reqCreateChatRoom(const char name[32], bool locked, const char* password);   // FUN_006ccc40
    void reqExitChatRoom();                         // FUN_006ccd70
    void selectCardPack(uint16_t pack);             // FUN_006ccdc0
    void resetAutoWait();                           // FUN_006cce40
    // friends, black list, teams, mail
    void reqFriend(uint32_t pid);                   // FUN_006cce90
    void friendOfferReply(uint32_t pid, int32_t answer);   // FUN_006ccf00
    void getPidByName(const char* name);            // FUN_006cd0c0
    void teamCreate(const char* name);              // FUN_006cd1f0
    void teamDisband();                             // FUN_006cd2b0
    void teamJoin(uint32_t team);                   // FUN_006cd320
    void teamJoinReply(uint32_t a, uint32_t b, bool yes);   // FUN_006cd390
    void teamBanish(uint32_t pid);                  // FUN_006cd420
    void teamLeave();                               // FUN_006cd490
    void teamList();                                // FUN_006cd4e0
    void getMailCount();                            // FUN_006cdcc0
    void rcvMail();                                 // FUN_006cdd10
    void reqAddBlack(uint32_t pid);                 // FUN_006cdd60
    void reqDelBlack(uint32_t pid);                 // FUN_006cddd0
    // trades (0x7000 + u16 sub-id)
    void tradeReady();                              // FUN_006cde40
    void tradeStart();                              // FUN_006cdec0
    void reqTrade(uint32_t pid);                    // FUN_006cdf40
    void tradeOfferReply(bool yes);                 // FUN_006cdfd0
    void cancelReqTrade();                          // FUN_006ce060
    void tradeAddCard(int16_t card);                // FUN_006ce0e0
    void tradeDeleteCard(int16_t card);             // FUN_006ce170
    void setTradeStatus(uint8_t status);            // FUN_006ce200
    void tradeLastConfirm(uint8_t a, const int32_t mine[10], const int32_t theirs[10]);   // FUN_006ce290
    void tradeUserExit();                           // FUN_006ce360
    void arriveTradeCard();                         // FUN_006ce3e0
    void tradeClear();                              // FUN_006ce450
    // packs, DUELPASS, shop, tournaments, misc
    void purchasePackOpen();                        // FUN_006ce4d0
    void recoveryPackList();                        // FUN_006ce520
    void presentPackOpen();                         // FUN_006ce570
    void reqDpAuth(const char code[16]);            // FUN_006ce5c0
    void reqGunslingCard();                         // FUN_006ce660
    void reqMileageItem();                          // FUN_006ce6b0
    void reqMileageResult();                        // FUN_006ce700
    void reqShopResult();                           // FUN_006ce830
    void tourInfo();                                // FUN_006ce960
    void tourReqEntry();                            // FUN_006ce9b0
    void tourList();                                // FUN_006cea00
    void tourEndResult();                           // FUN_006cea50
    void tourTimer();                               // FUN_006ceaa0
    void tourPCounter();                            // FUN_006ceaf0
    void tourStatus();                              // FUN_006ceb40
    void reqChampsCardGet();                        // FUN_006ceb90
    void reqUsbDpAuth(const uint8_t key[16]);       // FUN_006cebe0
    void sendMove(uint32_t pid, uint16_t x, uint16_t y, uint8_t dir, uint8_t b);   // FUN_006cec70
    void send5310(uint32_t pid, uint8_t a, uint8_t b);    // FUN_006ced40
    void sdGetRequest(uint16_t a, uint16_t b);      // FUN_006cedd0
    void reqTpPresentInfo();                        // FUN_006cee50
    void reqTpCardGet(uint8_t a, const uint16_t cards[3]);   // FUN_006ceea0
    void reqStartupPresent(const uint16_t* cards, int n);    // FUN_006cef30

    // parsers (NetLobby_Parse.cpp)
    int32_t onRecv(CNetAccount& acc);               // FUN_006ac020 (partial)
    void onChallenge();                             // FUN_006b7e50
    void onAuthResult();                            // FUN_006b7ea0
    void onPSelectResult(CNetAccount& acc);         // FUN_006b7ef0
    void onBlockList();                             // FUN_006b8580
    void onEnterBlockResult();                      // FUN_006b8840
    void onList1Start();                            // FUN_006b88d0
    void onList2Start();                            // FUN_006b89a0
    void onList3Start();                            // FUN_006b89f0
    void onList4Start();                            // FUN_006b8a40
    void onList5Start();                            // FUN_006b8a90
    void onList1();                                 // FUN_006b8ae0
    void onList2();                                 // FUN_006b8d10
    void onList3();                                 // FUN_006b8fc0
    void onList4();                                 // FUN_006b9100
    void onList5();                                 // FUN_006b9250
    void onJoinLeave();                             // FUN_006b9480 (0x3112)
    void onMove();                                  // FUN_006c2130 (0x5300)
    void onRegAvatarResult();                       // FUN_006ba340 (0x4171)
    void onCommentResult();                         // FUN_006ba380 (0x4173)
    void onTitleResult();                           // FUN_006ba3c0 (0x4175)

    // Each message group has its own file and handles its own ids in onRecv's default case (true = handled).
    // ---- rooms, matches, duel room list, chat, player data, card packs, matching server (NetLobby_Rooms.cpp)
    bool onRecvRooms(CNetAccount& acc, int32_t id);
    void onUpdateComment();                         // FUN_006b9820 (0x4180)
    void onUpdateAvatar();                          // FUN_006b9930 (0x4181)
    void onAvatarInfo();                            // FUN_006b9a10 (0x5340)
    void onPlayerInfo();                            // FUN_006b9b50 (0x4160)
    void onRoomListStart();                         // FUN_006ba410 (0x4282)
    void onRoomList(const CNetAccount& acc);        // FUN_006ba4f0 (0x4284)
    void onRoomUpdate(const CNetAccount& acc);      // FUN_006ba7b0 (0x3113)
    void onCreateRoomResult();                      // FUN_006baa20 (0x428a)
    void onDeleteRoomResult();                      // FUN_006baa60 (0x4292)
    void onAutoDuelStart();                         // FUN_006baab0 (0x43a0)
    void onReqMatchResult();                        // FUN_006bae50 (0x4301)
    void onMatchOffer();                            // FUN_006bae90 (0x4302)
    void onOfferTimeout();                          // FUN_006bb200 (0x4308)
    void onMatchCancelled();                        // FUN_006bb220 (0x4305)
    void onCancelMatchResult();                     // FUN_006bb470 (0x4309)
    void onDuelAbort();                             // FUN_006bb4b0 (0x4310)
    void onDuelServerNotice();                      // FUN_006bb730 (0x4306)
    void onChatNotice();                            // FUN_006bb780 (0x4402)
    void onWatchResult();                           // FUN_006bbda0 (0x4321)
    void onCardPackList();                          // FUN_006bbe20 (0x4800)
    void onSelectPackResult(CNetAccount& acc);      // FUN_006bc0f0 (0x4803)
    void onResetAutoWaitResult();                   // FUN_006bc230 (0x42a2)
    void onPlayerDataUpdate(CNetAccount& acc);      // FUN_006bc270 (0x4140)
    void onMatchingPlayers();                       // FUN_006bcdd0 (0x3604)
    CDuelRoom& newRoom();                           // FUN_006c3500
    void clearMatching();                           // FUN_006af060
    void reqMatch(int32_t room, const char* password);        // FUN_006cc420 (0x4300)
    void reqMatchingFriends();                      // FUN_006ccfa0 (0x3603 with the friend list)
    void searchFriends() {}                         // FUN_006ccf80: empty in the shipped exe
    // ---- friends, black list, teams, mail, maintenance/event notices, trades (NetLobby_Social.cpp)
    bool onRecvSocial(CNetAccount& acc, int32_t id);
    void onReqFriendResult();                       // FUN_006bc860 (0x4511)
    void onFriendOffer();                           // FUN_006bc8a0 (0x4512)
    void onFriendNotice();                          // FUN_006bc9c0 (0x4515)
    void onFriendSearchResult();                    // FUN_006bcd40 (0x4521)
    void onPidByNameResult();                       // FUN_006bcf10 (0x4501)
    void onTeamCreateResult();                      // FUN_006bcfa0 (0x4551)
    void onTeamCreateResultEnd();                   // FUN_006bd020 (0x4566)
    void onTeamCreateNotice();                      // FUN_006bd070 (0x4563)
    void onTeamDisbandNotice();                     // FUN_006bd090 (0x4560)
    void onTeamDisbandResult();                     // FUN_006bd220 (0x4553)
    void onTeamJoinApply();                         // FUN_006bd300 (0x4567)
    void onTeamJoinNotice();                        // FUN_006bd610 (0x4561)
    void onTeamBanishNotice();                      // FUN_006bd9f0 (0x4562)
    void onTeamLeaveNotice();                       // FUN_006bddd0 (0x4570)
    void onTeamList(CNetAccount& acc);              // FUN_006be190 (0x4559)
    void onTeamListBegin(CNetAccount& acc);         // FUN_006be3e0 (0x4564)
    void onTeamListEnd();                           // FUN_006be6e0 (0x4565)
    void onTeamUpdate(CNetAccount& acc);            // FUN_006be750 (0x4571)
    void onSendMailResult();                        // FUN_006be9c0 (0x4601)
    void onShortMailNotice();                       // FUN_006bea00 (0x4603)
    void onMailCount();                             // FUN_006bea20 (0x4621)
    void onMailListStart();                         // FUN_006bea70 (0x4611)
    void onMailListData();                          // FUN_006beac0 (0x4612)
    void onAddBlackResult();                        // FUN_006bf210 (0x4531)
    void onDelBlackResult();                        // FUN_006bf250 (0x4541)
    void onMaintenance();                           // FUN_006bf290 (0x4700)
    void onEventInfo();                             // FUN_006bf310 (0x5000)
    void onReqTradeResult();                        // FUN_006bf4d0 (0x7103)
    void onTradeOffer();                            // FUN_006bf510 (0x7104)
    void onTradeOfferReply();                       // FUN_006bf5f0 (0x7105)
    void onCancelReqTradeNotice();                  // FUN_006bf650 (0x7109)
    void onMoveOwnCard();                           // FUN_006bf6c0 (0x7115)
    void onMoveOtherCard();                         // FUN_006bf750 (0x7116)
    void onSetTradeStatus();                        // FUN_006bf7e0 (0x7117)
    void onTradeAllReady();                         // FUN_006bf830 (0x7118)
    void onTradeLastConfirmResult();                // FUN_006bf850 (0x7120)
    void onTradeEnd();                              // FUN_006bf8a0 (0x7121)
    void onTradeUserExit();                         // FUN_006bf910 (0x7112)
    void onAddCardResult();                         // FUN_006bf980 (0x7113)
    void onDeleteCardResult();                      // FUN_006bf9c0 (0x7114)
    void onTradeTrunk();                            // FUN_006bfa00 (0x7126)
    void onTradeTrunkEnd(CNetAccount& acc);         // FUN_006bfa80 (0x7127)
    void onArriveTradeCard();                       // FUN_006bfb00 (0x7122)
    void onTradeLimit();                            // FUN_006bfb20 (0x7130)
    void onTradeLimitEnd(CNetAccount& acc);         // FUN_006bfba0 (0x7131)
    void onChangeTradeStatus();                     // FUN_006bfc10 (0x7134)
    void onTradeStartResult();                      // FUN_006bfc60 (0x7133)
    void onKeepAliveReply();                        // FUN_006bfc80 (0x0004)
    void sendMail(LobbyMail& m);                    // FUN_006cd670 (0x4600 YG_MSG_SENDMAIL)
    // ---- pack opening, DUELPASS, tournaments, mileage, shop, SD/TP/presents, NPC info, limits, deck (NetLobby_Shop.cpp)
    bool onRecvShop(CNetAccount& acc, int32_t id);
    void clearPackCards();                          // FUN_006aef90
    void setPackCard(int i, int32_t card, uint8_t isNew);   // FUN_006aefc0
    void mileageInsert(int n, uint32_t item, uint16_t a, uint16_t b, uint16_t c);   // FUN_006ae5a0
    void addShopItem(const ShopItem& it);           // FUN_006ae680
    void setUsbResult(const uint16_t cards[3], const uint8_t isNew[3]);   // FUN_006af0b0
    void itemGet(CNetAccount& acc, int16_t type, uint32_t id);   // FUN_006cf000 0x5204 ITEMGET
    void onPurchasePackOpen(CNetAccount& acc);      // FUN_006bfcc0 0x4903
    void onPresentPackOpen(CNetAccount& acc);       // FUN_006c0070 0x4905
    void onDpAuthResult(CNetAccount& acc);          // FUN_006c01b0 0x8102
    void onTourInfo();                              // FUN_006c0930 0x5100
    void onTourLottery();                           // FUN_006c0ab0 0x5103
    void onTourLotResult();                         // FUN_006c0b30 0x5104
    void onTourPhase();                             // FUN_006c0b80 0x5105
    void onTourRound();                             // FUN_006c0c00 0x5106
    void onTourEntryStart();                        // FUN_006c0c90 0x5108
    void onTourEntryData();                         // FUN_006c0d30 0x5109
    void onTourList();                              // FUN_006c0eb0 0x5111
    void onTourEndResult();                         // FUN_006c10c0 0x5112
    void onTourTimer();                             // FUN_006c1250 0x5113
    void onTourPCounter();                          // FUN_006c12a0 0x5114
    void onTourStatus();                            // FUN_006c1370 0x5115
    void onTourSimpleEntryStart();                  // FUN_006c1460 0x5116
    void onTourSimpleEntry();                       // FUN_006c14d0 0x5117
    void onTourSimpleList();                        // FUN_006c15a0 0x5119
    void onTourChkDuelStart();                      // FUN_006c16d0 0x5120
    void onUsbDpAuthResult(CNetAccount& acc);       // FUN_006c1710 0x8204
    void onMileageList();                           // FUN_006c1b70 0x5201
    void onMileageResultEnd();                      // FUN_006c1c30 0x5203
    void onShopList();                              // FUN_006c1c70 0x5209
    void onShopListStart();                         // FUN_006c1da0 0x5213
    void onShopListEnd();                           // FUN_006c1e40 0x5214
    void onShopResultEnd();                         // FUN_006c1e80 0x5211
    void onPurchaseShopItem(CNetAccount& acc);      // FUN_006c1f30 0x5212
    void on5310();                                  // FUN_006c2450 0x5310
    void onSdGetResult(CNetAccount& acc);           // FUN_006c26d0 0x5401
    void onTpPresentInfo();                         // FUN_006c2800 0x8302
    void onTpCardGetResult(CNetAccount& acc);       // FUN_006c2880 0x8304
    void onStartupPresent(CNetAccount& acc);        // FUN_006c29c0 0x8402
    void onItemGetResult(CNetAccount& acc);         // FUN_006c2b30 0x5205
    void onNpcInfoListStart();                      // FUN_006c2d30 0x4231
    void onNpcInfoList();                           // FUN_006c2df0 0x4232
    void onNpcPresentType();                        // FUN_006c3190 0x4237
    void onLimitationList();                        // FUN_006c31e0 0x5600
    void onUnreleaseList();                         // FUN_006c32a0 0x5601
    void onSaveDeck();                              // FUN_006c3340 0x4182
};
YO2_AT(CNetLobby, dpAuthTries, 0x544);
YO2_AT(CNetLobby, challenge, 0x7cc);
YO2_AT(CNetLobby, authOk, 0x7de);
YO2_AT(CNetLobby, results, 0x7e0);
YO2_AT(CNetLobby, authResult, 0x7e4);
YO2_AT(CNetLobby, enterBlockResult, 0x7f0);
YO2_AT(CNetLobby, listCount, 0x7f4);
YO2_AT(CNetLobby, playerInfoResult, 0x804);
YO2_AT(CNetLobby, regAvatarResult, 0x80c);
YO2_AT(CNetLobby, roomListCount, 0x814);
YO2_AT(CNetLobby, cancelMatchResult, 0x82c);
YO2_AT(CNetLobby, watchResult, 0x838);
YO2_AT(CNetLobby, selectPackResult, 0x858);
YO2_AT(CNetLobby, resetAutoWaitResult, 0x860);
YO2_AT(CNetLobby, roomsChanged, 0x9d0);
YO2_AT(CNetLobby, rival, 0x9f4);
YO2_AT(CNetLobby, info, 0xba0);
YO2_AT(CNetLobby, avatarPid, 0xd4c);
YO2_AT(CNetLobby, avatarX, 0xd68);
YO2_AT(CNetLobby, avatarDir, 0xd74);
YO2_AT(CNetLobby, duelIp, 0xd78);
YO2_AT(CNetLobby, duelPort, 0xd88);
YO2_AT(CNetLobby, myRoom, 0xd8c);
YO2_AT(CNetLobby, autoDuelMode, 0xda1);
YO2_AT(CNetLobby, packCard, 0x1210);
YO2_AT(CNetLobby, packNew, 0x1350);
YO2_AT(CNetLobby, matching, 0x13b0);
YO2_AT(CNetLobby, matchingCount, 0x1b80);
YO2_AT(CNetLobby, roomListTotal, 0x1ba8);
YO2_AT(CNetLobby, dpAuthResult, 0x90c);
YO2_AT(CNetLobby, usbDpAuthResult, 0x958);
YO2_AT(CNetLobby, list5Count, 0x994);
YO2_AT(CNetLobby, playersChanged, 0x9b8);
YO2_AT(CNetLobby, rgn, 0x9ec);
YO2_AT(CNetLobby, blockChange, 0x9f2);
YO2_AT(CNetLobby, block3, 0x9f1);
YO2_AT(CNetLobby, watchState, 0xd8a);
YO2_AT(CNetLobby, mileageItem, 0xda8);
YO2_AT(CNetLobby, mileageA, 0xf38);
YO2_AT(CNetLobby, mileageB, 0x1000);
YO2_AT(CNetLobby, mileageC, 0x10c8);
YO2_AT(CNetLobby, recordMoves, 0xdb65);
YO2_AT(CNetLobby, moveCount, 0xdb94);
YO2_AT(CNetLobby, reqFriendResult, 0x864);
YO2_AT(CNetLobby, friendSearchResult, 0x870);
YO2_AT(CNetLobby, mailCount, 0x880);
YO2_AT(CNetLobby, delBlackResult, 0x88c);
YO2_AT(CNetLobby, reqTradeResult, 0x8b0);
YO2_AT(CNetLobby, tradeOfferReplyResult, 0x8b8);
YO2_AT(CNetLobby, deleteCardResult, 0x8cc);
YO2_AT(CNetLobby, teamCreateEnd, 0x980);
YO2_AT(CNetLobby, teamListEnd, 0x990);
YO2_AT(CNetLobby, eventId, 0xd98);
YO2_AT(CNetLobby, eventNew, 0xda0);
YO2_AT(CNetLobby, inTeam, 0x11e0);
YO2_AT(CNetLobby, joinApplied, 0x11e8);
YO2_AT(CNetLobby, teamCreateResult, 0x11fc);
YO2_AT(CNetLobby, pidByName, 0x1b88);
YO2_AT(CNetLobby, friendPid, 0x1b90);
YO2_AT(CNetLobby, newMail, 0x1ba4);
YO2_AT(CNetLobby, maintSeconds, 0x1bac);
YO2_AT(CNetLobby, tradePartner, 0x1bb8);
YO2_AT(CNetLobby, ownMoveCard, 0x1bce);
YO2_AT(CNetLobby, otherStatus, 0x1bd5);
YO2_AT(CNetLobby, offerCancelled, 0x1bda);
YO2_AT(CNetLobby, tradeTrunk, 0x1bdd);
YO2_AT(CNetLobby, tradeLimitChunk, 0x2896);
YO2_AT(CNetLobby, tradeLimit, 0x2897);
YO2_AT(CNetLobby, packGot, 0x534);
YO2_AT(CNetLobby, packOpenCount, 0x540);
YO2_AT(CNetLobby, tpVictoryCard, 0x548);
YO2_AT(CNetLobby, deckNpcBin, 0x54a);
YO2_AT(CNetLobby, deckPbin, 0x74b);
YO2_AT(CNetLobby, mileageResult, 0x8a4);
YO2_AT(CNetLobby, packOpenResult, 0x900);
YO2_AT(CNetLobby, presentPackResult, 0x908);
YO2_AT(CNetLobby, sdGetResult, 0x95c);
YO2_AT(CNetLobby, tpCardGetResult, 0x964);
YO2_AT(CNetLobby, startupPresentResult, 0x968);
YO2_AT(CNetLobby, npcInfoCount, 0x970);
YO2_AT(CNetLobby, shopResult, 0x978);
YO2_AT(CNetLobby, purchaseResult, 0x97c);
YO2_AT(CNetLobby, packCard, 0x1210);
YO2_AT(CNetLobby, packNew, 0x1350);
YO2_AT(CNetLobby, dpCard, 0x35ec);
YO2_AT(CNetLobby, dpGain, 0x35f0);
YO2_AT(CNetLobby, dpPack, 0x35f4);
YO2_AT(CNetLobby, champs, 0x35fc);
YO2_AT(CNetLobby, tourPage, 0x36dc);
YO2_AT(CNetLobby, tourEntry, 0x4b64);
YO2_AT(CNetLobby, tourDuelStart, 0xdb64);
YO2_AT(CNetLobby, markCount, 0xdbc4);
YO2_AT(CNetLobby, usbCard, 0xdbca);
YO2_AT(CNetLobby, usbGain, 0xdbd3);
YO2_AT(CNetLobby, npcPresentType, 0xdbd4);

// Which of a player's two avatar slots LIST2 fills: the receiver's world, *(DAT_012bb6b0) + 0x448 in the exe.
// TODO: owned by whoever reimplements that global (System/Game); 0 = Duel City, 1 = Academy.
extern int g_lobbyWorld;
