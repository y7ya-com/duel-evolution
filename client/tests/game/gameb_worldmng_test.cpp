// src/Game/yo2WorldManager.cpp: CWorldMng's state machine against stand-in lobby / connection / scene tasks and a
// real CSceneMng with fake scenes.
#include <windows.h>

#include <cstdlib>
#include <memory>
#include <string>
#include <vector>

#include "Game/yo2FieldMap.h"
#include "Game/yo2WorldManager.h"
#include "Game/yo2WorldMngExtern.h"
#include "Net/NetLobby.h"
#include "System/yo2SceneManager.h"
#include "System/yo2StringDB.h"
#include "System/yo2ZSort.h"
#include "game_test.h"

#include "window_stubs.h"

// --- the scene manager's link stand-ins ---------------------------------------------------------------------------
static CElement* g_layer;
CElement* appSceneLayer() { return g_layer; }
CElement* screenFaderNew(CTask* parent, uint32_t priority) { return CElement::newChild(parent, priority); }
bool screenFaderFinished(CElement*) { return true; }
bool screenFaderIdle(CElement*) { return true; }
static std::vector<std::pair<int, int>> g_fades;
static int g_faderHides;
void screenFaderFadeOut(CElement*, int32_t frames, int32_t arg) { g_fades.push_back({frames, arg}); }
void screenFaderHide(CElement*) { g_faderHides++; }

// Fake scenes: a byte array of exits each (My Room's +0xd9.., the area map's +0x2d0.., the tournament's +0x27c..).
struct FakeScene : CSceneTask {
    uint8_t exits[8] = {};
    bool move = false;
    int32_t rgn = 0, rank = 0, area = 0;
    int clears = 0, resets = 0;
};
static FakeScene* g_scene;
static CSceneTask* newScene(CTask* parent, CElement*) {
    g_scene = new FakeScene;
    return dynamic_cast<CSceneTask*>(g_scene->create(parent, 10000));
}
bool myRoomTakeMove(CSceneTask* s, int32_t* rgn, int32_t* rank, int32_t* area) {
    auto* f = static_cast<FakeScene*>(s);
    if (!f->move) return false;
    *rgn = f->rgn, *rank = f->rank, *area = f->area;
    return true;
}
void myRoomClearRequests(CSceneTask* s) { static_cast<FakeScene*>(s)->clears++; }
const uint8_t* myRoomExits(CSceneTask* s) { return static_cast<FakeScene*>(s)->exits; }
const uint8_t* areaMapExits(CSceneTask* s) { return static_cast<FakeScene*>(s)->exits; }
void areaMapReset(CSceneTask* s) { static_cast<FakeScene*>(s)->resets++; }
const uint8_t* tournamentExits(CSceneTask* s) { return static_cast<FakeScene*>(s)->exits; }

// --- Net ---------------------------------------------------------------------------------------------------------
static CNetLobby* g_lobby;
CNetLobby* appNetLobby() { return g_lobby; }
struct FakeLobbyTask : CEasyTask {
    bool myRoomOk = true;
    int32_t busy = 0, result = 0;
    int myRoomCalls = 0;
};
struct Sent { uint32_t pid; int a, b, c; };
static std::vector<Sent> g_moves, g_5310;
CTask* netLobbyTaskSpawn(CTask* parent) { return (new FakeLobbyTask)->create(parent, 10000); }
bool netLobbyTaskConnectMyRoom(CTask* t) {
    auto* f = static_cast<FakeLobbyTask*>(t);
    f->myRoomCalls++;
    return f->myRoomOk;
}
int32_t netLobbyTaskBusy(CTask* t) { return static_cast<FakeLobbyTask*>(t)->busy; }
int32_t netLobbyTaskResult(CTask* t) { return static_cast<FakeLobbyTask*>(t)->result; }
CNetLobby* netLobbyTaskLobby(CTask*) { return g_lobby; }
void netLobbyTaskSendMove(CTask*, uint32_t pid, uint16_t x, uint16_t y, uint8_t dir, uint8_t) {
    g_moves.push_back({pid, x, y, dir});
}
void netLobbyTaskSend5310(CTask*, uint32_t pid, uint8_t a, uint8_t b) { g_5310.push_back({pid, a, b, 0}); }
struct FakeConnect : CEasyTask {
    int32_t result = 0;
    int resets = 0, gates = 0;
    int32_t rgn = -1, rank = -1, area = -1;
};
CTask* connectLobbySpawn(CTask* parent, uint32_t priority) { return (new FakeConnect)->create(parent, priority); }
void connectLobbyReset(CTask* t) { static_cast<FakeConnect*>(t)->resets++; }
bool connectLobbyGate(CTask* t) { return ++static_cast<FakeConnect*>(t)->gates; }
bool connectLobbyLobby(CTask* t, int32_t rgn, int32_t rank, int32_t area) {
    auto* c = static_cast<FakeConnect*>(t);
    c->rgn = rgn, c->rank = rank, c->area = area;
    return true;
}
int32_t connectLobbyResult(CTask* t) { return static_cast<FakeConnect*>(t)->result; }
int32_t randomLobbyArea(uint8_t lang, uint8_t rank) { return lang * 100 + rank; }

// --- Game, Gunsling, Tournament -------------------------------------------------------------------------------------
uint32_t gameMyPid() { return 4242; }
static int32_t g_map;
int32_t& gameCurrentMap() { return g_map; }
struct FakeMng : CEasyTask {
    int32_t kind = -1, state = 0;
    bool failed = false;
};
static FakeMng* g_guns;
static FakeMng* g_tour;
CTask* gunsMngSpawn(CTask* parent, uint32_t priority) { return (g_guns = new FakeMng)->create(parent, priority); }
void gunsMngStart(CTask* t, int32_t kind) { static_cast<FakeMng*>(t)->kind = kind; }
CTask* gunsMngInstance() { return g_guns; }
int32_t gunsMngState(CTask* t) { return static_cast<FakeMng*>(t)->state; }
bool gunsMngFailed(CTask* t) { return static_cast<FakeMng*>(t)->failed; }
CTask* tourMngSpawn(CTask* parent, uint32_t priority) { return (g_tour = new FakeMng)->create(parent, priority); }
void tourMngStart(CTask* t, int32_t kind) { static_cast<FakeMng*>(t)->kind = kind; }
CTask* tourMngInstance() { return g_tour; }
int32_t tourMngState(CTask* t) { return static_cast<FakeMng*>(t)->state; }
bool tourMngFailed(CTask* t) { return static_cast<FakeMng*>(t)->failed; }

struct FakeText : CStringDB {
    vc6::string get(uint32_t id) const override { return yo2Format("T%u", id); }
};

int main() {
    CZSortSet layers;
    g_zsortSet = &layers;
    FakeText text;
    g_stringDB = &text;
    CWindowTaskFactory::create();
    auto lobby = std::make_unique<CNetLobby>();
    g_lobby = lobby.get();
    g_lobby->block = 3;
    g_lobby->block2 = 2;
    CElement* root = CElement::createRoot();
    g_layer = CElement::newChild(root, 1);
    for (int id : {SCENE_MY_ROOM, SCENE_AREA_MAP, SCENE_TOURNAMENT})
        CSceneMng::registerScene(id, newScene);
    CSceneMng* scenes = CSceneMng::newChild(root, 5);

    CWorldMng* w = CWorldMng::create(root, 10);
    CHECK(w && CWorldMng::instance() == w && w->taskName() == "CWorldMng" && w->instName() == "ワールドマネージャ");
    CHECK(w->state_ == CWorldMng::NONE && w->lobby_ && w->connect_ && w->unkA8_ == -1);
    CHECK(w->lobby_->instName() == "ロビータスク" && w->connect_->instName() == "ロビー接続タスク");
    auto* lt = static_cast<FakeLobbyTask*>(w->lobby_.get());
    auto* ct = static_cast<FakeConnect*>(w->connect_.get());

    // My Room: request, wait, switch the scene (map 8)
    w->restart();
    w->onMain();
    CHECK(lt->myRoomCalls == 1 && w->state_ == CWorldMng::WAIT_MYROOM && !w->quit_);
    w->onMain();
    CHECK(w->state_ == CWorldMng::WAIT_MYROOM);
    lt->busy = 2;
    w->onMain();
    CHECK(w->state_ == CWorldMng::IN_MYROOM && g_map == 8 && g_fades.back() == std::make_pair(10, 0xee4c));
    CHECK(scenes->nextSceneId() == SCENE_MY_ROOM);
    scenes->onMain();
    CHECK(scenes->sceneId() == SCENE_MY_ROOM && g_scene);

    // a lobby picked in My Room: rank 0x10 leads to the trial Gunsling manager
    g_scene->move = true, g_scene->rgn = 1, g_scene->rank = 0x10, g_scene->area = 5;
    w->onMain();
    CHECK(w->state_ == CWorldMng::WAIT_LOBBY && w->next_ == CWorldMng::START_TRIAL_GUNS);
    CHECK(w->retState_ == CWorldMng::MYROOM_RESET && ct->resets == 1 && ct->rgn == 1 && ct->rank == 0x10 && ct->area == 5);
    g_scene->move = false;
    ct->result = 4;   // failed: My Room's requests are cleared
    w->onMain();
    CHECK(w->state_ == CWorldMng::MYROOM_RESET);
    w->onMain();
    CHECK(g_scene->clears == 1 && w->state_ == CWorldMng::IN_MYROOM);
    // the "go to" request for the tournament: leave the server first, then join a rank 8 lobby
    g_scene->exits[5] = 1;
    w->onMain();
    CHECK(w->state_ == CWorldMng::WAIT_GATE && ct->gates == 1 && w->next_ == CWorldMng::GO_TOURNAMENT);
    g_scene->exits[5] = 0;
    ct->result = 2;
    w->onMain();
    CHECK(w->state_ == CWorldMng::GO_TOURNAMENT);
    w->onMain();
    CHECK(ct->rgn == 6 && ct->rank == 8 && ct->area == 608 && w->state_ == CWorldMng::WAIT_LOBBY);
    w->onMain();
    CHECK(w->state_ == CWorldMng::START_TOURNAMENT);
    w->onMain();
    CHECK(w->tour_ && g_tour->kind == 0xb && w->tour_->taskName() == "トーナメント管理");
    CHECK(w->state_ == CWorldMng::IN_TOURNAMENT);
    // the tournament finishes: destroyed, back to My Room
    g_tour->state = 6;
    w->onMain();
    CHECK(w->state_ == CWorldMng::ENTER_MYROOM);
    CTask::flushDeleted();
    CHECK(!w->tour_);

    // the area map: the joined block's map, the avatar's start sent to the lobby
    w->state_ = CWorldMng::ENTER_AREA;
    std::srand(1);
    int r1 = std::rand(), r2 = std::rand();
    Vec3 p = fieldMapInitPos(2, 8);
    int32_t dir = fieldMapInitDir(2, 8);
    std::srand(1);
    w->onMain();
    CHECK(g_map == 2 && w->state_ == CWorldMng::IN_AREA && g_moves.size() == 1 && g_moves[0].pid == 4242);
    CHECK(g_moves[0].a == static_cast<int32_t>(p.x + float(r2 % 60 - 30)));
    CHECK(g_moves[0].b == static_cast<int32_t>(p.y + float(r1 % 60 - 30)) && g_moves[0].c == dir);
    scenes->onMain();
    CHECK(scenes->sceneId() == SCENE_AREA_MAP);
    g_scene->exits[0] = 1;   // back to My Room: the block is left (0x5310 with the block number)
    w->onMain();
    CHECK(w->state_ == CWorldMng::ENTER_MYROOM && g_5310.back().pid == 4242 && g_5310.back().a == 3 && g_5310.back().b == 1);
    g_scene->exits[0] = 0;

    // a Gunsling manager that fails: the error box, then quit once it is answered
    w->state_ = CWorldMng::START_GUNS;
    w->onMain();
    CHECK(w->guns_ && g_guns->kind == 0xd && w->guns_->taskName() == "ガンスマネージャ" && w->state_ == CWorldMng::IN_GUNS);
    g_guns->failed = true;
    w->onMain();
    CHECK(w->state_ == CWorldMng::ERROR_BOX && w->errDlg_ && w->errDlg_->instName() == "エラーダイアログ");
    CHECK(w->errDlg_->topmost_ && g_faderHides == 1);
    w->onMain();
    CHECK(w->state_ == CWorldMng::ERROR_BOX && g_faderHides == 2 && !w->quit_);
    w->errDlg_->dialog_.result_ = CDialogCallback::YES;
    w->onMain();
    CHECK(w->state_ == CWorldMng::QUIT && w->quit_);

    // the other managers' kinds and names
    struct { int state, kind; const char* name; } managers[] = {
        {CWorldMng::START_TRIAL_GUNS, 0xf, "トライアル(ガンス)マネージャ"},
        {CWorldMng::START_EVOLUTION, 0x11, "トライアル(エボリューション・マッチ)マネージャ"},
        {CWorldMng::START_ANNIVERSARY, 7, "アニバーサリー(ガンス)マネージャ"},
        {CWorldMng::START_ULTIMATE, 0x15, "Ultimate Match マネージャ"},
    };
    for (auto& m : managers) {
        w->state_ = m.state;
        w->onMain();
        CHECK(g_guns->kind == m.kind && w->guns_->taskName() == m.name && w->state_ == CWorldMng::IN_GUNS);
    }
    // a failed My Room request still moves on (and sets quit_)
    w->quit_ = false;
    lt->myRoomOk = false;
    w->restart();
    w->onMain();
    CHECK(w->quit_ && w->state_ == CWorldMng::WAIT_MYROOM);

    w->state_ = CWorldMng::IN_AREA;
    w->destroy(__FILE__, __LINE__);   // on the area map: the block is left
    CHECK(g_5310.size() == 2 && CWorldMng::instance() == w);
    CTask::flushDeleted();
    CHECK(CWorldMng::instance() == nullptr);
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    g_stringDB = nullptr;
    std::puts("gameb_worldmng: ok");
}
