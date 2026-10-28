// yo2WorldManager.cpp: CWorldMng, the one task (g_worldMng) that moves the player between the world's places once
// logged in: My Room, the area map (a lobby of some rank), the Gunsling-style event lobbies (CGunsMng) and the
// tournament (CTourMng). It owns the lobby connection task, switches scenes behind a fade-out, and when a place's
// manager reports an error shows the "error" OK box; after it, or when the player quits, it sets quit_.
//
// A move to a lobby goes in two steps: CConnectLobby leaves the current server (connectGate) or joins a lobby of
// the wanted rank (connectLobby); once it reports done the state becomes next_, on failure retState_.
#pragma once
#include <cstdint>

#include "System/window/yo2WindowDialogs.h"
#include "System/yo2EasyTask.h"
#include "System/yo2TaskPtr.h"

class CWorldMng : public CEasyTask {
public:
    enum State : int32_t {
        NONE = 0,
        ENTER_MYROOM = 1,     // ask the lobby task for a My Room lobby
        WAIT_MYROOM = 2,      // ... then fade to the My Room scene
        IN_MYROOM = 3,        // watch My Room's requests
        MYROOM_RESET = 4,     // clear My Room's requests (a move from there failed)
        WAIT_GATE = 5,        // CConnectLobby is leaving the server
        WAIT_LOBBY = 6,       // CConnectLobby is joining a lobby
        AREA_RESET = 7,       // reset the area map's requests (a move from there failed)
        ENTER_AREA = 8,       // place the avatar on the map, fade to the area map scene
        IN_AREA = 9,          // watch the area map's requests
        GO_GUNS = 10,         // join a lobby of rank 0xf (then START_GUNS) ...
        GO_TRIAL_GUNS = 11,   // ... rank 0x10 (START_TRIAL_GUNS)
        GO_EVOLUTION = 12,    // ... rank 0x11 (START_EVOLUTION)
        GO_ANNIVERSARY = 13,  // ... rank 10 (START_ANNIVERSARY)
        GO_ULTIMATE = 14,     // ... rank 0x14 (START_ULTIMATE)
        START_GUNS = 15,      // a CGunsMng of kind 0xd "ガンスマネージャ"
        START_TRIAL_GUNS = 16,  // kind 0xf
        START_EVOLUTION = 17,   // kind 0x11
        START_ANNIVERSARY = 18, // kind 7
        START_ULTIMATE = 19,    // kind 0x15
        IN_GUNS = 20,         // until the manager finishes (back to ENTER_MYROOM) or fails (ERROR)
        GO_TOURNAMENT = 21,   // join a lobby of rank 8 (then START_TOURNAMENT)
        START_TOURNAMENT = 22,  // a CTourMng of kind 0xb
        IN_TOURNAMENT = 23,
        QUIT = 24,            // nothing more to do (quit_ is set)
        ERROR_BOX = 25,       // the error box is up; QUIT once it is answered
    };

    static CWorldMng* create(CTask* parent, uint32_t priority);
    static CWorldMng* instance() { return s_instance; }
    CWorldMng();
    ~CWorldMng() override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;

    void restart();   // back to ENTER_MYROOM

    // One function per state (the exe's onMain is a switch over these).
    void enterMyRoom();
    void waitMyRoom();
    void inMyRoom();
    void myRoomReset();
    void waitConnect();     // WAIT_GATE
    void waitConnect2();    // WAIT_LOBBY (the same code twice in the exe)
    void areaReset();
    void enterArea();
    void inArea();
    void goGuns();
    void goTrialGuns();
    void goEvolution();
    void goAnniversary();
    void goUltimate();
    void goTournament();
    void startGuns();
    void startTrialGuns();
    void startEvolution();
    void startAnniversary();
    void startUltimate();
    void inGuns();
    void startTournament();
    void inTournament();
    void errorBox();
    void clearRecs();

    // 0x44-byte records kept at 0xcc; nothing in this file adds any.
    struct Rec {
        uint32_t words[0x11];
    };

    int32_t state_ = NONE;         // 0x70 State
    int32_t next_ = 0;             // 0x74 state after a CConnectLobby success
    int32_t retState_ = 0;         // 0x78 ... after a failure
    CTaskPtr<CTask> lobby_;        // 0x7c CNetLobbyTask "ロビータスク"
    CTaskPtr<CTask> connect_;      // 0x88 CConnectLobby "ロビー接続タスク"
    bool quit_ = false;            // 0x94
    CTaskPtr<CTask> guns_;         // 0x98 CGunsMng
    uint8_t unkA4_ = 0;            // 0xa4
    int32_t unkA8_ = -1;           // 0xa8
    int32_t unkAC_ = -1;           // 0xac
    int32_t unkB0_ = -1;           // 0xb0
    CTaskPtr<CTask> tour_;         // 0xb4 CTourMng "トーナメント管理"
    CTaskPtr<CWindowModelDialogOk> errDlg_;   // 0xc0 "エラーダイアログ"
    vc6::vector<Rec> recs_;        // 0xcc
    uint32_t unkDC_ = 0;           // 0xdc

private:
    void connectRandom(uint8_t rank, int32_t next);
    void spawnGuns(int32_t kind, const char* name);
    void openErrorBox();
    void leaveBlock();   // the 0x5310 notice that the player left the current block
    static CWorldMng* s_instance;   // DAT_012bc8d0
};
YO2_AT(CWorldMng, state_, 0x70);
YO2_AT(CWorldMng, next_, 0x74);
YO2_AT(CWorldMng, retState_, 0x78);
YO2_AT(CWorldMng, lobby_, 0x7c);
YO2_AT(CWorldMng, connect_, 0x88);
YO2_AT(CWorldMng, quit_, 0x94);
YO2_AT(CWorldMng, guns_, 0x98);
YO2_AT(CWorldMng, unkA8_, 0xa8);
YO2_AT(CWorldMng, tour_, 0xb4);
YO2_AT(CWorldMng, errDlg_, 0xc0);
YO2_AT(CWorldMng, recs_, 0xcc);
YO2_SIZEOF(CWorldMng, 0xe0);
