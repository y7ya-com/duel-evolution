// yo2WorldManager.cpp: CWorldMng.
#include "Game/yo2WorldManager.h"

#include <cstdlib>

#include "Game/yo2FieldMap.h"
#include "Game/yo2WorldMngExtern.h"
#include "Net/NetLobby.h"
#include "System/yo2SceneManager.h"

CWorldMng* CWorldMng::s_instance;

namespace {
CElement* sceneFader() { return CSceneMng::instance()->fader(); }
// The scene manager's switch to `id` behind a 10-frame fade-out.
void fadeTo(int32_t id) {
    screenFaderFadeOut(sceneFader(), 10, 0xee4c);
    CSceneMng::instance()->change(id, CSceneMng::FADE_WAIT, true);
}
bool sceneIs(int32_t id) { return CSceneMng::instance()->sceneId() == id; }
CSceneTask* scene() { return CSceneMng::instance()->scene(); }
}   // namespace

// @yo2 0x00adbef0 CWorldMng::create (a singleton)
CWorldMng* CWorldMng::create(CTask* parent, uint32_t priority) {
    YO2_ASSERT(!s_instance, "singleton CWorldMng");
    auto* w = new CWorldMng;
    return dynamic_cast<CWorldMng*>(w->CTask::create(parent, priority));
}

// @yo2 0x00adc0e0 CWorldMng::CWorldMng
CWorldMng::CWorldMng() {
    clearRecs();
    setTaskName("CWorldMng");
    setInstName("ワールドマネージャ");
    s_instance = this;
    guns_.setUser(this);
    tour_.setUser(this);
}

// @yo2 0x00ae2130 vector<CWorldMng::Rec>::erase(first, last), called as erase(begin, end) on the empty vector
void CWorldMng::clearRecs() { recs_.clear(); }

// @yo2 0x00adc440 CWorldMng::~CWorldMng
// @yo2 0x00adc390 CWorldMng deleting destructor
// @yo2 0x00adc400 vector<CWorldMng::Rec>::_Tidy (the records' buffer goes with recs_)
CWorldMng::~CWorldMng() { s_instance = nullptr; }

// @yo2 0x00adc0c0 CWorldMng::restart
void CWorldMng::restart() { state_ = ENTER_MYROOM; }

// @yo2 0x00adc560 CWorldMng::onInit: the lobby task and the lobby connection task
bool CWorldMng::onInit() {
    lobby_.setUser(this);
    lobby_.set(netLobbyTaskSpawn(this));
    YO2_ASSERT(lobby_.task(), "error CNetLobbyTask::Create()");
    lobby_->setInstName("ロビータスク");
    connect_.setUser(this);
    connect_.set(connectLobbySpawn(this, 10000));
    YO2_ASSERT(connect_.task(), "error CConnectLobby::Create()");
    connect_->setInstName("ロビー接続タスク");
    state_ = NONE;
    return true;
}

// @yo2 0x00adcbd0 CWorldMng::onMain: one step of the current state
bool CWorldMng::onMain() {
    switch (state_) {
    case ENTER_MYROOM: enterMyRoom(); break;
    case WAIT_MYROOM: waitMyRoom(); break;
    case IN_MYROOM: inMyRoom(); break;
    case MYROOM_RESET: myRoomReset(); break;
    case WAIT_GATE: waitConnect(); break;
    case WAIT_LOBBY: waitConnect2(); break;
    case AREA_RESET: areaReset(); break;
    case ENTER_AREA: enterArea(); break;
    case IN_AREA: inArea(); break;
    case GO_GUNS: goGuns(); break;
    case GO_TRIAL_GUNS: goTrialGuns(); break;
    case GO_EVOLUTION: goEvolution(); break;
    case GO_ANNIVERSARY: goAnniversary(); break;
    case GO_ULTIMATE: goUltimate(); break;
    case START_GUNS: startGuns(); break;
    case START_TRIAL_GUNS: startTrialGuns(); break;
    case START_EVOLUTION: startEvolution(); break;
    case START_ANNIVERSARY: startAnniversary(); break;
    case START_ULTIMATE: startUltimate(); break;
    case IN_GUNS: inGuns(); break;
    case GO_TOURNAMENT: goTournament(); break;
    case START_TOURNAMENT: startTournament(); break;
    case IN_TOURNAMENT: inTournament(); break;
    case ERROR_BOX: errorBox(); break;
    default: break;
    }
    return true;
}

// @yo2 0x00ae1ba0 CWorldMng::onDestroy: on the area map, say the block is left; hang up; the error box goes
void CWorldMng::onDestroy() {
    if (state_ == IN_AREA)
        leaveBlock();
    appNetLobby()->disconnect();
    if (errDlg_.task())
        errDlg_->destroy(__FILE__, __LINE__);
}

void CWorldMng::leaveBlock() {
    netLobbyTaskSend5310(lobby_.get(), gameMyPid(), appNetLobby()->block, 1);
}

// @yo2 0x00adcd60 CWorldMng::enterMyRoom (a failed request sets quit_, but the state still moves on)
void CWorldMng::enterMyRoom() {
    if (!netLobbyTaskConnectMyRoom(lobby_.get())) {
        quit_ = true;
        state_ = QUIT;
    }
    state_ = WAIT_MYROOM;
}

// @yo2 0x00adcda0 CWorldMng::waitMyRoom: connected -> the My Room scene (map 8)
void CWorldMng::waitMyRoom() {
    CTask* lobby = lobby_.get();
    int32_t busy = netLobbyTaskBusy(lobby);
    if (busy == 2) {
        gameCurrentMap() = 8;
        fadeTo(SCENE_MY_ROOM);
        state_ = IN_MYROOM;
    } else if (busy == 3) {
        YO2_ASSERT(false, "connect error [%d] MyRoomLobby", netLobbyTaskResult(lobby_.get()));
    }
}

// @yo2 0x00add200 CWorldMng::inMyRoom: a lobby picked in My Room, or one of its "go to" requests, or quit
void CWorldMng::inMyRoom() {
    if (!sceneIs(SCENE_MY_ROOM))
        return;
    CSceneTask* room = scene();
    int32_t rgn, rank, area;
    if (myRoomTakeMove(room, &rgn, &rank, &area)) {
        switch (rank) {   // what the lobby's rank leads to once joined
        case 7: case 0xf: next_ = START_GUNS; break;
        case 8: next_ = START_TOURNAMENT; break;
        case 9: case 0x10: next_ = START_TRIAL_GUNS; break;
        case 10: next_ = START_ANNIVERSARY; break;
        case 0x11: next_ = START_EVOLUTION; break;
        case 0x14: next_ = START_ULTIMATE; break;
        default: next_ = ENTER_AREA; break;
        }
        connectLobbyReset(connect_.get());
        connectLobbyLobby(connect_.get(), rgn, rank, area);
        retState_ = MYROOM_RESET;
        state_ = WAIT_LOBBY;
    }
    const uint8_t* go = myRoomExits(room);
    static const int32_t kGo[6] = {GO_GUNS, GO_TRIAL_GUNS, GO_EVOLUTION, GO_ULTIMATE, GO_ANNIVERSARY, GO_TOURNAMENT};
    for (int i = 0; i < 6; i++) {
        if (!go[i])
            continue;
        connectLobbyReset(connect_.get());
        connectLobbyGate(connect_.get());
        state_ = WAIT_GATE;
        retState_ = MYROOM_RESET;
        next_ = kGo[i];
        break;
    }
    if (go[6]) {
        quit_ = true;
        state_ = QUIT;
    }
}

// @yo2 0x00add4b0 CWorldMng::waitConnect: CConnectLobby done -> next_, failed -> retState_
void CWorldMng::waitConnect() {
    int32_t r = connectLobbyResult(connect_.get());
    if (r == 2)
        state_ = next_;
    else if (r > 2 && r < 5)
        state_ = retState_;
}

// @yo2 0x00add6d0 CWorldMng::waitConnect2 (the same code)
void CWorldMng::waitConnect2() {
    int32_t r = connectLobbyResult(connect_.get());
    if (r == 2)
        state_ = next_;
    else if (r > 2 && r < 5)
        state_ = retState_;
}

// @yo2 0x00add710 CWorldMng::myRoomReset
void CWorldMng::myRoomReset() {
    myRoomClearRequests(scene());
    state_ = IN_MYROOM;
}

// @yo2 0x00add760 CWorldMng::areaReset
void CWorldMng::areaReset() {
    areaMapReset(scene());
    state_ = IN_AREA;
}

// @yo2 0x00add7b0 CWorldMng::enterArea: the joined block's map; tell the lobby where the avatar stands (the map's
// entry from the duel room, +-30 pixels at random), fade to the area map
void CWorldMng::enterArea() {
    int32_t& map = gameCurrentMap();
    map = appNetLobby()->block2;
    int r1 = std::rand(), r2 = std::rand();
    Vec3 pos = fieldMapInitPos(map, 8) + Vec3{static_cast<float>(r2 % 60 - 30), static_cast<float>(r1 % 60 - 30), 0};
    int32_t dir = fieldMapInitDir(map, 8);
    netLobbyTaskSendMove(lobby_.get(), gameMyPid(), static_cast<uint16_t>(static_cast<int32_t>(pos.x)),
                         static_cast<uint16_t>(static_cast<int32_t>(pos.y)), static_cast<uint8_t>(dir), 0);
    fadeTo(SCENE_AREA_MAP);
    state_ = IN_AREA;
}

// @yo2 0x00add920 CWorldMng::inArea: back to My Room, quit, or "go to" one of the event lobbies
void CWorldMng::inArea() {
    if (!sceneIs(SCENE_AREA_MAP))
        return;
    const uint8_t* ex = areaMapExits(scene());
    if (ex[0]) {
        leaveBlock();
        netLobbyTaskLobby(lobby_.get())->disconnect();
        state_ = ENTER_MYROOM;
    }
    if (ex[7]) {
        leaveBlock();
        quit_ = true;
        state_ = QUIT;
    }
    static const int32_t kGo[6] = {GO_GUNS, GO_TRIAL_GUNS, GO_EVOLUTION, GO_ULTIMATE, GO_ANNIVERSARY, GO_TOURNAMENT};
    for (int i = 0; i < 6; i++) {
        if (!ex[1 + i])
            continue;
        leaveBlock();
        netLobbyTaskLobby(lobby_.get())->disconnect();
        connectLobbyReset(connect_.get());
        connectLobbyGate(connect_.get());
        state_ = WAIT_GATE;
        retState_ = AREA_RESET;
        next_ = kGo[i];
        return;
    }
}

void CWorldMng::connectRandom(uint8_t rank, int32_t next) {
    int32_t area = randomLobbyArea(6, rank);
    connectLobbyLobby(connect_.get(), 6, rank, area);
    state_ = WAIT_LOBBY;
    next_ = next;
}

// @yo2 0x00add4f0 CWorldMng::goGuns: a random lobby of rank 0xf
void CWorldMng::goGuns() { connectRandom(0xf, START_GUNS); }
// @yo2 0x00add540 CWorldMng::goTrialGuns: rank 0x10
void CWorldMng::goTrialGuns() { connectRandom(0x10, START_TRIAL_GUNS); }
// @yo2 0x00add590 CWorldMng::goEvolution: rank 0x11
void CWorldMng::goEvolution() { connectRandom(0x11, START_EVOLUTION); }
// @yo2 0x00add630 CWorldMng::goAnniversary: rank 10
void CWorldMng::goAnniversary() { connectRandom(10, START_ANNIVERSARY); }
// @yo2 0x00add5e0 CWorldMng::goUltimate: rank 0x14
void CWorldMng::goUltimate() { connectRandom(0x14, START_ULTIMATE); }
// @yo2 0x00add680 CWorldMng::goTournament: rank 8
void CWorldMng::goTournament() { connectRandom(8, START_TOURNAMENT); }

// A new CGunsMng (the old one destroyed) running event `kind`.
void CWorldMng::spawnGuns(int32_t kind, const char* name) {
    if (guns_.task())
        guns_->destroy(__FILE__, __LINE__);
    guns_.set(gunsMngSpawn(this, 10000));
    YO2_ASSERT(guns_.task(), "error CGunsMng::Create()");
    guns_->setTaskName(name);
    gunsMngStart(guns_.get(), kind);
    state_ = IN_GUNS;
}

// @yo2 0x00addbd0 CWorldMng::startGuns
void CWorldMng::startGuns() { spawnGuns(0xd, "ガンスマネージャ"); }
// @yo2 0x00ade250 CWorldMng::startTrialGuns
void CWorldMng::startTrialGuns() { spawnGuns(0xf, "トライアル(ガンス)マネージャ"); }
// @yo2 0x00ade8d0 CWorldMng::startEvolution
void CWorldMng::startEvolution() { spawnGuns(0x11, "トライアル(エボリューション・マッチ)マネージャ"); }
// @yo2 0x00adf5d0 CWorldMng::startAnniversary
void CWorldMng::startAnniversary() { spawnGuns(7, "アニバーサリー(ガンス)マネージャ"); }
// @yo2 0x00adef50 CWorldMng::startUltimate
void CWorldMng::startUltimate() { spawnGuns(0x15, "Ultimate Match マネージャ"); }

// The "error" OK box (text 1000), topmost and centred on the scene layer.
void CWorldMng::openErrorBox() {
    screenFaderHide(sceneFader());
    errDlg_.setUser(this);
    errDlg_.set(CWindowModelDialogOk::create(appSceneLayer(), 0, 0, 0xfa2, 0));
    YO2_ASSERT(errDlg_.task(), "error CWorldMng::m_pErrDlg::Create()");
    CWindowModelDialogOk* d = errDlg_.get();
    d->setInstName("エラーダイアログ");
    d->setTopmost(true);
    d->centre();
    d->setText(windowText(1000).c_str());
    d->bringToFront();
    state_ = ERROR_BOX;
}

// @yo2 0x00adfc50 CWorldMng::inGuns: the manager failed (error box) or finished (back to My Room); or the area map
// asks to go back to My Room, to quit or to the tournament
void CWorldMng::inGuns() {
    if (gunsMngFailed(gunsMngInstance()))
        openErrorBox();
    if (gunsMngState(gunsMngInstance()) == 6) {
        gunsMngInstance()->destroy(__FILE__, __LINE__);
        restart();
    }
    if (!sceneIs(SCENE_AREA_MAP))
        return;
    const uint8_t* ex = areaMapExits(scene());
    if (ex[0]) {
        leaveBlock();
        netLobbyTaskLobby(lobby_.get())->disconnect();
        if (guns_.task())
            guns_->destroy(__FILE__, __LINE__);
        state_ = ENTER_MYROOM;
    }
    if (ex[7]) {
        leaveBlock();
        if (guns_.task())
            guns_->destroy(__FILE__, __LINE__);
        quit_ = true;
        state_ = QUIT;
    }
    if (ex[6]) {
        leaveBlock();
        netLobbyTaskLobby(lobby_.get())->disconnect();
        if (guns_.task())
            guns_->destroy(__FILE__, __LINE__);
        state_ = START_TOURNAMENT;
    }
}

// @yo2 0x00ae0a40 CWorldMng::startTournament: a new CTourMng (kind 0xb)
void CWorldMng::startTournament() {
    if (tour_.task())
        tour_->destroy(__FILE__, __LINE__);
    tour_.set(tourMngSpawn(this, 10000));
    YO2_ASSERT(tour_.task(), "error CTourMng::Create()");
    tour_->setTaskName("トーナメント管理");
    tourMngStart(tour_.get(), 0xb);
    state_ = IN_TOURNAMENT;
}

// @yo2 0x00ae10c0 CWorldMng::inTournament: as inGuns, for the tournament scene's back / quit
void CWorldMng::inTournament() {
    if (tourMngFailed(tourMngInstance()))
        openErrorBox();
    if (tourMngState(tourMngInstance()) == 6) {
        tourMngInstance()->destroy(__FILE__, __LINE__);
        restart();
    }
    if (!sceneIs(SCENE_TOURNAMENT))
        return;
    const uint8_t* ex = tournamentExits(scene());
    if (ex[1]) {
        leaveBlock();
        netLobbyTaskLobby(lobby_.get())->disconnect();
        if (tour_.task())
            tour_->destroy(__FILE__, __LINE__);
        state_ = ENTER_MYROOM;
    }
    if (ex[0]) {
        leaveBlock();
        if (tour_.task())
            tour_->destroy(__FILE__, __LINE__);
        quit_ = true;
        state_ = QUIT;
    }
}

// @yo2 0x00ae1b50 CWorldMng::errorBox: once the box is answered, quit
void CWorldMng::errorBox() {
    screenFaderHide(sceneFader());
    if (errDlg_->result() != -1) {
        quit_ = true;
        state_ = QUIT;
    }
}
