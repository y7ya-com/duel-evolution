// The Net tasks: CEasyTasks that drive a connection through its states every frame (src\Net\yo2Net*Task.cpp).
#pragma once
#include "NetAccount.h"
#include "NetGate.h"
#include "NetLobby.h"
#include "NetUi.h"
#include "System/yo2EasyTask.h"
#include "System/yo2TaskPtr.h"
#include "System/vc6.h"

// Error strings the tasks show in their "OK" box (string ids in the game's text table).
enum : int32_t {
    TXT_NET_CONNECT_FAILED = 0x1195,   // the connect thread didn't start
    TXT_NET_GATE_TIMEOUT = 0x119c,     // no connection within 600 s, or it failed
    TXT_NET_VERSION_REFUSED = 0x119d,  // 0x2002 refused Ver.080912.00
    TXT_ACC_CONNECT_FAILED = 0x1194,   // the account server didn't connect
    TXT_ACC_UNKNOWN_ERROR = 0x1198,    // shown as "<text>(<code>)"
    TXT_DELETE_PROMPT = 0xc26,         // password, to delete a character
    TXT_DELETE_BAD_PASSWORD = 0xc27,
    TXT_DELETE_CONFIRM = 0xc1c,
    TXT_DELETE_DONE = 0xc1e,
    TXT_CREATE_PROMPT = 0xc28,         // the new character's name
    TXT_DISCONNECTED = 0x11a6,         // appDisconnect() reason 1 (and any other)
    TXT_DISCONNECTED_2 = 0x11a5,       // reason 2
    TXT_ACCOUNT_DOWN = 0x119b,         // reason 3, or the account connection timed out
    TXT_LOBBY_DOWN = 0x11bf,           // the lobby connection timed out
    TXT_DUEL_DOWN = 0x11c0,            // the duel connection timed out
};
enum : uint32_t { SE_CLICK = 0x10000001 };
enum : int32_t { DIALOG_OK = 4000, DIALOG_NO = 0xfa1, INPUT_OK = 0xfa2, INPUT_CANCEL = 0xfa3 };

// CNetGateTask (0xa0): connect to the gate, send the version, wait for the server list, say goodbye.
class CNetGateTask : public CEasyTask {
public:
    static void spawn(CTask* parent, CTask* uiParent);   // FUN_006a89d0
    CNetGateTask();
    ~CNetGateTask() override;                             // FUN_006a8e50
    bool onInit() override;                               // FUN_006a8ee0
    bool onMain() override;                               // FUN_006a8f70
    void onDestroy() override;                            // FUN_006a8f20

    enum State { START, CONNECT, WAIT_CONNECT, SEND_VERSION, WAIT_LIST, BYE, ERROR_OPEN, ERROR_WAIT, ERROR_DONE, IDLE };

    int32_t startTime = 0;      // 0x70 time() the connect started
    CNetGate* gate = nullptr;   // 0x74
    int32_t state = START;      // 0x78
    uint8_t done = 0;           // 0x7c 1 after a fatal error was acknowledged
    uint8_t _7d[3] = {};
    CTaskPtr<CTask> elm;        // 0x80 CTaskPtr<CSpriteElm> "CNetGateTask::m_elm": the layer for the dialog
    int32_t errorText = 0;      // 0x8c
    CTaskPtr<CTask> dialog;     // 0x90 CTaskPtr<CWindowModelDialogOk>
    uint8_t _9c[4] = {};

private:
    struct Layout;
};
struct CNetGateTask::Layout {
    YO2_AT(CNetGateTask, startTime, 0x70);
    YO2_AT(CNetGateTask, state, 0x78);
    YO2_AT(CNetGateTask, elm, 0x80);
    YO2_AT(CNetGateTask, errorText, 0x8c);
    YO2_AT(CNetGateTask, dialog, 0x90);
};
YO2_SIZEOF(CNetGateTask, 0xa0);

// CNetAccountTask (0xf8): the account connection's driver. login() connects, authenticates and fetches the character
// list; the other requests (create / delete a character, trunk, PBIN, list, bye) reconnect first when needed.
// busy: 0 idle (requests accepted), 1 working, 2 done, 3 failed, for one frame each before going back to 0.
class CNetAccountTask : public CEasyTask {
public:
    static CNetAccountTask* spawn(CTask* parent, CTask* uiParent);   // FUN_006a1810
    CNetAccountTask();
    ~CNetAccountTask() override;                                      // FUN_006a1b70
    bool onInit() override;                                           // FUN_006a1c60
    bool onMain() override;                                           // FUN_006a1d80
    void onDestroy() override;                                        // FUN_006a1d30

    bool login(const std::string& user, const std::string& password);   // FUN_006a61c0
    bool deleteCharacter(int32_t slot);   // FUN_006a66e0
    bool createCharacter(int32_t slot);   // FUN_006a68f0
    bool requestPbin(int32_t slot);       // FUN_006a6ca0
    bool requestTrunk();                  // FUN_006a6c10
    bool requestPlayerList();             // FUN_006a6b80
    bool bye();                           // FUN_006a6b00
    bool hangUp();                        // FUN_006a6b40
    static int32_t errorText(int32_t code);   // FUN_006a6eb0

    enum State {
        START, IDLE, CONNECT, WAIT_CONNECT, HELLO, WAIT_CHALLENGE, AUTH, WAIT_AUTH, PLAYERLIST, WAIT_PLAYERLIST,
        BYE, HANGUP, DEL_PROMPT, DEL_WAIT_PROMPT, DEL_CONFIRM, DEL_WAIT_CONFIRM, DEL_GO, DEL_SEND, DEL_WAIT,
        DEL_DONE_OPEN, DEL_DONE_WAIT, NEW_PROMPT, NEW_WAIT_PROMPT, NEW_SEND, NEW_WAIT, TRUNK, TRUNK_WAIT, PBIN,
        PBIN_WAIT, ERROR_OPEN, ERROR_WAIT, FAILED, DONE, NONE,
    };
    enum Busy { BUSY_IDLE, BUSY_WORKING, BUSY_DONE, BUSY_FAILED };

    int32_t connectStart = 0;    // 0x70
    int32_t lastActive = 0;      // 0x74 an idle connection is dropped after 120 s
    CNetAccount* acc = nullptr;  // 0x78
    CNetGate* gate = nullptr;    // 0x7c
    CTaskPtr<CTask> elm;         // 0x80 CTaskPtr<CSpriteElm>
    int32_t slot = 0;            // 0x8c
    int32_t state = START;       // 0x90
    int32_t next = NONE;         // 0x94 where a request goes once (re)connected; NONE = done after the list
    int32_t busy = BUSY_IDLE;    // 0x98
    uint8_t _9c[8] = {};
    int32_t lastResult = 0;      // 0xa4 the server's last error code
    uint32_t _a8 = 0;            // 0xa8
    CTaskPtr<CTask> delInput;    // 0xac CTaskPtr<CWindowModelInput1>: password before a delete
    CTaskPtr<CTask> delConfirm;  // 0xb8 the yes/no box
    CTaskPtr<CTask> okBox;       // 0xc4 CTaskPtr<CWindowModelDialogOk>, unused here
    CTaskPtr<CTask> doneBox;     // 0xd0 "deleted"
    CTaskPtr<CTask> nameInput;   // 0xdc the new character's name
    CTaskPtr<CTask> errorBox;    // 0xe8
    int32_t errorTextId = 0;     // 0xf4

private:
    bool request(int32_t target, bool needSlot, int32_t s);
    void fail(int32_t text);
    struct Layout;
};
struct CNetAccountTask::Layout {
    YO2_AT(CNetAccountTask, acc, 0x78);
    YO2_AT(CNetAccountTask, elm, 0x80);
    YO2_AT(CNetAccountTask, slot, 0x8c);
    YO2_AT(CNetAccountTask, state, 0x90);
    YO2_AT(CNetAccountTask, busy, 0x98);
    YO2_AT(CNetAccountTask, lastResult, 0xa4);
    YO2_AT(CNetAccountTask, delInput, 0xac);
    YO2_AT(CNetAccountTask, doneBox, 0xd0);
    YO2_AT(CNetAccountTask, errorBox, 0xe8);
    YO2_AT(CNetAccountTask, errorTextId, 0xf4);
};
YO2_SIZEOF(CNetAccountTask, 0xf8);

// CNetAccountTaskReqDuellpass150 (0x78): asks the account server once for the unopened DUELPASS packs (0x3110).
class CNetAccountTaskReqDuellpass150 : public CEasyTask {
public:
    static void spawn(CTask* parent);       // FUN_006a7030
    ~CNetAccountTaskReqDuellpass150() override;   // FUN_006a7100
    bool onInit() override;                 // FUN_006a7120
    bool onMain() override;                 // FUN_006a7150

    enum State { START, SEND, WAIT, DONE };
    CNetAccount* acc = nullptr;   // 0x70
    int32_t state = START;        // 0x74

private:
    struct Layout;
};
struct CNetAccountTaskReqDuellpass150::Layout {
    YO2_AT(CNetAccountTaskReqDuellpass150, acc, 0x70);
    YO2_AT(CNetAccountTaskReqDuellpass150, state, 0x74);
};
YO2_SIZEOF(CNetAccountTaskReqDuellpass150, 0x78);

// A random area (0-7) among the gate list's lobbies for (lang, rank), -1 if none is listed (CConnectLobby).
int32_t randomLobbyArea(uint8_t lang, uint8_t rank);   // FUN_0069df00

// CNetLobbyTask (0xd8): the lobby connection's driver. connect() logs in and enters a block; each other request
// sends one lobby message and waits for its answer; the duel requests connect the duel server (CNetDuel).
// busy as in CNetAccountTask: 0 idle, 1 working, 2 done, 3 failed (one frame each, then back to 0).
class CNetLobbyTask : public CEasyTask {
public:
    static CNetLobbyTask* spawn(CTask* parent);   // FUN_006d14e0
    CNetLobbyTask();                    // FUN_006d15a0
    ~CNetLobbyTask() override;          // FUN_006d1740
    bool onInit() override;             // FUN_006d17c0
    bool onMain() override;             // FUN_006d1840

    enum State {
        START, IDLE, CONNECT, WAIT_CONNECT, HELLO, WAIT_HELLO, AUTH, WAIT_AUTH, PSELECT, BLOCKLIST, WAIT_BLOCKLIST,
        ENTERBLOCK, WAIT_ENTERBLOCK, REGAVATAR, WAIT_REGAVATAR, REGAVATAR2, WAIT_REGAVATAR2,
        MATCHREPLY = 0x11, RESETAUTOWAIT = 0x13, WATCH = 0x15, FRIEND = 0x17, FRIENDREPLY = 0x19,
        MATCHFRIENDS = 0x1b, PIDBYNAME = 0x1d, NOTHING = 0x1f, MAILCOUNT = 0x21, RCVMAIL = 0x23, ADDBLACK = 0x25,
        DELBLACK = 0x27, TRADE = 0x29, TRADEREPLY = 0x2b, TRADEREADY = 0x2f, TRADESTART = 0x31, TRADEADD = 0x33,
        TRADEDEL = 0x35, TRADESTATUS = 0x37, TRADECONFIRM = 0x39, TRADEEXIT = 0x3b, TRADEARRIVE = 0x3d,
        TRADECLEAR = 0x3f, LISTS = 0x41, ROOMLIST = 0x47, NPCINFO = 0x49,
        DUEL_AFTER_ABORT = 0x4b, DUEL = 0x4c, DUEL_CONNECT, DUEL_WAIT_CONNECT, DUEL_WAIT_BOOKED, DUEL_DECK,
        DUEL_WAIT_DECK, WATCH_DUEL = 0x52, WATCH_CONNECT, WATCH_WAIT_CONNECT, WATCH_WAIT,
        FAILED = 0x58, DONE = 0x59,
    };
    enum Busy { BUSY_IDLE, BUSY_WORKING, BUSY_DONE, BUSY_FAILED };
    enum { RESULT_DUEL_REFUSED = -630, RESULT_CONNECT_FAILED = -151, TRADE_REFUSED = -493 };

    bool connect(uint8_t rgn, uint8_t rank, uint8_t area);   // FUN_006d3ca0
    bool connectMyRoom();                                    // FUN_006d3a50
    bool enterBlock(uint8_t block, uint8_t change);          // FUN_006d3d50
    bool regAvatar();                                        // FUN_006d3d10
    bool reqLists();                                         // FUN_006d3de0
    bool reqLists2();                                        // FUN_006d3e20 (the same)
    bool matchOfferReply(bool yes);                          // FUN_006d3ea0
    bool resetAutoWait();                                    // FUN_006d3ef0
    bool reqWatch(uint32_t room);                            // FUN_006d3f30
    bool reqFriend(uint32_t pid);                            // FUN_006d3f80
    bool friendOfferReply(uint32_t pid, int32_t answer);     // FUN_006d3fd0
    bool searchFriends();                                    // 0x006d4020
    bool getPidByName(const std::string& name);              // 0x006d4060
    bool getMailCount();                                     // 0x006d4190
    bool rcvMail();                                          // 0x006d41d0
    bool reqAddBlack(uint32_t pid);                          // FUN_006d4210
    bool reqDelBlack(uint32_t pid);                          // FUN_006d4260
    bool tradeReady();                                       // 0x006d42b0
    bool tradeStart();                                       // 0x006d42f0
    bool reqTrade(uint32_t pid);                             // FUN_006d4330
    bool tradeOfferReply(bool yes);                          // FUN_006d4380
    bool tradeAddCard(int16_t card);                         // 0x006d43d0
    bool tradeDeleteCard(int16_t card);                      // 0x006d4420
    bool setTradeStatus(uint8_t status);                     // 0x006d4470
    bool tradeLastConfirm(uint8_t a, const int32_t* mine, const int32_t* theirs);   // 0x006d44c0
    bool tradeUserExit();                                    // 0x006d4530
    bool arriveTradeCard();                                  // 0x006d4570
    bool tradeClear();                                       // 0x006d45b0
    bool duelAfterAbort();                                   // FUN_006d45f0
    bool duel();                                             // FUN_006d4630
    bool watchDuel();                                        // FUN_006d4670
    bool sendMove(uint32_t pid, uint16_t x, uint16_t y, uint8_t dir, uint8_t b);   // FUN_006d46b0
    bool send5310(uint32_t pid, uint8_t a, uint8_t b);       // FUN_006d46f0
    bool takeAnswer(int k);                                  // FUN_006d3990
    const char* duelIp() const;                              // FUN_006d3950
    uint16_t duelPort() const;                               // FUN_006d3970

    CNetGate* gate = nullptr;        // 0x70
    CNetAccount* acc = nullptr;      // 0x74
    CNetDuel* duelConn = nullptr;    // 0x78
    CNetLobby* lobby = nullptr;      // 0x7c
    int32_t connectStart = 0;        // 0x80
    int32_t state = START;           // 0x84
    int32_t busy = BUSY_IDLE;        // 0x88
    int32_t result = 0;              // 0x8c the last request's result (results[k])
    int32_t _90 = 0;                 // 0x90
    int32_t tradeResult = 0;         // 0x94 reqTrade's answer
    uint8_t matchYes = 0;            // 0x98
    uint8_t _99[3] = {};
    uint32_t watchRoom = 0;          // 0x9c
    uint32_t friendPid = 0;          // 0xa0
    uint32_t offerPid = 0;           // 0xa4
    int32_t offerAnswer = 0;         // 0xa8
    vc6::string searchName;          // 0xac getPidByName
    uint32_t addBlackPid = 0;        // 0xbc
    uint32_t delBlackPid = 0;        // 0xc0
    uint32_t tradePid = 0;           // 0xc4
    uint8_t tradeYes = 0;            // 0xc8
    uint8_t _c9 = 0;
    int16_t addCard = 0;             // 0xca
    int16_t delCard = 0;             // 0xcc
    uint8_t tradeStatus = 0;         // 0xce
    uint8_t confirmA = 0;            // 0xcf
    const int32_t* confirmMine = nullptr;     // 0xd0
    const int32_t* confirmTheirs = nullptr;   // 0xd4

private:
    bool start(int32_t target);
    void finishOn(int f, int k, bool nonNegativeOk = false);
    void checkDuelServer();
    struct Layout;
};
struct CNetLobbyTask::Layout {
    YO2_AT(CNetLobbyTask, gate, 0x70);
    YO2_AT(CNetLobbyTask, lobby, 0x7c);
    YO2_AT(CNetLobbyTask, state, 0x84);
    YO2_AT(CNetLobbyTask, busy, 0x88);
    YO2_AT(CNetLobbyTask, result, 0x8c);
    YO2_AT(CNetLobbyTask, tradeResult, 0x94);
    YO2_AT(CNetLobbyTask, matchYes, 0x98);
    YO2_AT(CNetLobbyTask, searchName, 0xac);
    YO2_AT(CNetLobbyTask, addBlackPid, 0xbc);
    YO2_AT(CNetLobbyTask, tradeYes, 0xc8);
    YO2_AT(CNetLobbyTask, addCard, 0xca);
    YO2_AT(CNetLobbyTask, tradeStatus, 0xce);
    YO2_AT(CNetLobbyTask, confirmMine, 0xd0);
};
YO2_SIZEOF(CNetLobbyTask, 0xd8);

// CCheckHeartBeatTask (0x90): keeps the lobby, duel and account connections alive (0x0005 a minute) and hangs up
// the first one that hasn't heard from its server in two minutes.
class CCheckHeartBeatTask : public CEasyTask {
public:
    static CCheckHeartBeatTask* spawn(CTask* parent);   // FUN_0069cb20
    ~CCheckHeartBeatTask() override;                    // FUN_0069cc10
    bool onInit() override;                             // FUN_0069cc30
    bool onMain() override;                             // FUN_0069cca0
    void reset();                                       // FUN_0069cdd0

    enum State { WATCHING = 1, DOWN = 2 };
    enum Which { NONE, LOBBY, DUEL, ACCOUNT };
    int32_t state = 0;              // 0x70
    int32_t which = NONE;           // 0x74 the connection that timed out
    int32_t frames = 0;             // 0x78
    int32_t period = 0;             // 0x7c 60
    CNetLobby* lobby = nullptr;     // 0x80
    CNetDuel* duel = nullptr;       // 0x84
    CNetAccount* acc = nullptr;     // 0x88
    uint8_t _8c[4] = {};

private:
    struct Layout;
};
struct CCheckHeartBeatTask::Layout {
    YO2_AT(CCheckHeartBeatTask, which, 0x74);
    YO2_AT(CCheckHeartBeatTask, period, 0x7c);
    YO2_AT(CCheckHeartBeatTask, acc, 0x88);
};
YO2_SIZEOF(CCheckHeartBeatTask, 0x90);

// CCheckDisconnectTask (0xa0): the "disconnected" box, for the app's disconnect flag or a dead connection; after
// OK it fades out to the title.
class CCheckDisconnectTask : public CEasyTask {
public:
    static CCheckDisconnectTask* spawn(CTask* parent, CTask* uiParent);   // FUN_0069bd80
    CCheckDisconnectTask();
    ~CCheckDisconnectTask() override;   // FUN_0069c0f0
    bool onInit() override;             // FUN_0069c1b0
    bool onMain() override;             // FUN_0069c460

    enum State { WATCH, OPEN, WAIT, CLOSE, RESET };
    CTaskPtr<CTask> elm;                  // 0x70 CTaskPtr<CElement> "切断エラーダイアログの親エレメント"
    int32_t state = WATCH;                // 0x7c
    uint8_t _80[0x10] = {};               // 0x80 the box's text (a VC6 wstring); portable: textId below
    int32_t delay = 4;                    // 0x90 4, or 10 when the duel side went (nothing here reads it)
    CTask* dialog = nullptr;              // 0x94 CWindowModelDialogOk "切断エラーダイアログ"
    CCheckHeartBeatTask* heartBeat = nullptr;   // 0x98
    uint8_t _9c[4] = {};
    int32_t textId = 0;                   // portable, past the exe's 0xa0: the string id the text came from

private:
    struct Layout;
};
struct CCheckDisconnectTask::Layout {
    YO2_AT(CCheckDisconnectTask, elm, 0x70);
    YO2_AT(CCheckDisconnectTask, state, 0x7c);
    YO2_AT(CCheckDisconnectTask, delay, 0x90);
    YO2_AT(CCheckDisconnectTask, dialog, 0x94);
    YO2_AT(CCheckDisconnectTask, heartBeat, 0x98);
};

// CConnectLobby (0x98): connects to the gate and checks the version (connectGate), or to a lobby through its own
// CNetLobbyTask and enters block 0 (connectLobby). result: 2 done, 3 the gate didn't connect, 4 refused / failed.
class CConnectLobby : public CEasyTask {
public:
    static void spawn(CTask* parent, uint32_t priority);    // FUN_0069dd80
    CConnectLobby();                                        // FUN_0069e0c0
    ~CConnectLobby() override;                              // FUN_0069e270
    bool onInit() override;                                 // FUN_0069e310
    bool onMain() override;                                 // FUN_0069e760
    void reset();                                           // FUN_0069de40
    bool connectGate();                                     // FUN_0069de80
    bool connectLobby(int32_t rgn, int32_t rank, int32_t area);   // FUN_0069deb0

    enum Result { RES_NONE, RES_1, RES_DONE, RES_GATE_FAILED, RES_FAILED };
    enum Mode { IDLE, GATE_CONNECT, GATE_WAIT, GATE_VERSION, GATE_LIST, LOBBY_CONNECT, LOBBY_WAIT, LOBBY_BLOCK };
    int32_t result = RES_NONE;       // 0x70
    int32_t mode = IDLE;             // 0x74
    int32_t connectCode = 0;         // 0x78 the gate connect / select result, or its WSA error
    int32_t resultCode = 0;          // 0x7c the gate's 0x2002 code, or the lobby task's result
    int32_t rgn = -1;                // 0x80
    int32_t rank = -1;               // 0x84
    int32_t area = -1;               // 0x88
    CTaskPtr<CNetLobbyTask> lobbyTask;   // 0x8c "CConnectLobby::m_pNetLobbyTask"

private:
    struct Layout;
};
struct CConnectLobby::Layout {
    YO2_AT(CConnectLobby, mode, 0x74);
    YO2_AT(CConnectLobby, resultCode, 0x7c);
    YO2_AT(CConnectLobby, area, 0x88);
    YO2_AT(CConnectLobby, lobbyTask, 0x8c);
};
YO2_SIZEOF(CConnectLobby, 0x98);
