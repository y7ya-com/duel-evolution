// src/Lobby/yo2DuelMenu.cpp: CDuelMenuTask driven frame by frame with stand-in windows (the four CWindowModel*
// classes aren't written yet): which window opens, where, and how each answer ends the menu.
#include <string>
#include <vector>

#include "Game/yo2TgtAvaListDlg.h"
#include "Lobby/yo2DuelMenu.h"
#include "Net/NetLobby.h"
#include "System/yo2StringDB.h"
#include "System/yo2ZSort.h"
#include "lobby_test.h"
#include "window_stubs.h"

static void watch(CTask* t);
struct FakeWin : CWindowTaskModel {
    std::string kind;
    int32_t answer = 0;
    void layout() override {}
    int32_t maxZ() const override { return 0; }
    void onControlEvent(CWindowTaskControll*) override {}
    void onControlCommand(CWindowTaskControll*) override {}
    void mediatorSlot2(CWindowTaskControll*) override {}
    void mediatorSlot3(CWindowTaskControll*) override {}
};
static std::vector<FakeWin*> g_wins;
static FakeWin* make(CTask* parent, const char* kind) {
    auto* w = new FakeWin;
    w->kind = kind;
    w->create(parent, 10000);
    g_wins.push_back(w);
    watch(w);
    return w;
}
CWindowTaskModel* windowModelDuelNew(CTask* p) { return make(p, "duel"); }
CWindowTaskModel* windowModelDuelFindNew(CTask* p) { return make(p, "find"); }
CWindowTaskModel* windowModelDuelWaitNew(CTask* p) { return make(p, "wait"); }
CWindowTaskModel* windowModelJoinGunslingNew(CTask* p) { return make(p, "gunsling"); }
static int32_t answer(CWindowTaskModel* w) { return static_cast<FakeWin*>(w)->answer; }
int32_t windowModelDuelChoice(CWindowTaskModel* w) { return answer(w); }
int32_t windowModelDuelFindResult(CWindowTaskModel* w) { return answer(w); }
int32_t windowModelDuelWaitResult(CWindowTaskModel* w) { return answer(w); }
int32_t windowModelJoinGunslingResult(CWindowTaskModel* w) { return answer(w); }
static bool g_rightPushed;
bool windowMouseRightPushed() { return g_rightPushed; }

static CNetLobby g_lobby;
CNetLobby* appNetLobby() { return &g_lobby; }

struct FakeText : CStringDB {
    vc6::string get(uint32_t) const override { return "?"; }
};

static CElement* g_root;
static CTask* g_tasks;     // the menu's parent
static CElement* g_layer;  // and its UI layer, apart as in the game
static void frame() {   // the frame's update, the draw that empties the queues, then the deferred deletes
    g_root->call(&g_tmMain);
    for (CZSort& q : g_zsortSet->layer) q.clear();
    CTask::flushDeleted();
}
// A task's liveness through a CTaskPtr (cleared when the task is destroyed), kept per task for the whole test.
static std::vector<CTaskPtr<CTask>*> g_watch;
static std::vector<CTask*> g_watched;
static void watch(CTask* t) {
    auto* p = new CTaskPtr<CTask>;
    p->setUser(g_root);
    p->set(t);
    g_watch.push_back(p);
    g_watched.push_back(t);
}
static bool alive(CTask* t) {
    for (size_t i = 0; i < g_watched.size(); i++)
        if (g_watched[i] == t && g_watch[i]->task()) return true;
    return false;
}

int main() {
    CZSortSet layers;
    g_zsortSet = &layers;
    FakeText text;
    g_stringDB = &text;
    CWindowTaskFactory::create();
    g_root = CElement::createRoot();
    g_tasks = CTask::newChild(g_root, 1);
    g_layer = CElement::newChild(g_root, 2);

    // the normal lobby: CWindowModelDuel at (266, 276) under the menu's base element; "normal duel" -> the wait window
    g_lobby.rank = 3;
    CDuelMenuTask* m = CDuelMenuTask::spawn(g_tasks, g_layer);
    watch(m);
    CHECK(m && m->taskName() == "CDuelMenuTask" && m->layer == nullptr && g_gameCtrl.now() == CTRL_DUEL_MENU);
    CHECK(m->baseElm->instName() == "CDuelMenuTask::m_pBaseElm" && g_wins.size() == 1);
    FakeWin* total = g_wins[0];
    CHECK(total->kind == "duel" && total->parent() == m->baseElm.get() && total->instName() == "CDuelMenuTask::m_TotalDuel");
    CHECK(total->x_ == 266 && total->y_ == 276 && total->pos_.x == 266 && total->pos_.y == 276);
    frame();
    CHECK(m->state == CDuelMenuTask::TOTAL && alive(total));
    total->answer = CDuelMenuTask::CHOICE_NORMAL;
    frame();
    CHECK(m->state == CDuelMenuTask::NORMAL && !alive(total) && g_wins.size() == 2);
    FakeWin* wait = g_wins[1];
    CHECK(wait->kind == "wait" && wait->instName() == "CDuelMenuTask::m_NormDuel" && wait->x_ == 266 && wait->y_ == 204);
    frame();
    CHECK(alive(wait));
    wait->answer = CDuelMenuTask::BUTTON_OK;
    frame();
    CHECK(!alive(wait) && m->state == CDuelMenuTask::DONE && alive(m));
    frame();   // DONE: onMain false -> the task goes, and onDestroy hands the screen back
    CHECK(!alive(m) && g_gameCtrl.now() == CTRL_NONE);

    // "auto duel" -> the find window; the right button cancels it
    m = CDuelMenuTask::spawn(g_tasks, g_layer);
    watch(m);
    FakeWin* t2 = g_wins.back();
    t2->answer = CDuelMenuTask::CHOICE_AUTO;
    frame();
    FakeWin* find = g_wins.back();
    CHECK(find->kind == "find" && find->instName() == "CDuelMenuTask::m_AutoDuel" && find->y_ == 276);
    CHECK(m->state == CDuelMenuTask::AUTO);
    g_rightPushed = true;
    frame();
    g_rightPushed = false;
    CHECK(!alive(find) && m->state == CDuelMenuTask::DONE);
    frame();
    CHECK(!alive(m));

    // cancel on the first window ends it at once
    m = CDuelMenuTask::spawn(g_tasks, g_layer);
    watch(m);
    g_wins.back()->answer = CDuelMenuTask::BUTTON_CANCEL;
    frame();
    CHECK(m->state == CDuelMenuTask::DONE);
    frame();
    CHECK(!alive(m));

    // the event lobbies (rank 7, 9, 10, 15, 16, 17, 20): the gunsling entry
    for (int rank : {7, 9, 10, 15, 16, 17, 20}) {
        g_lobby.rank = (uint8_t)rank;
        size_t before = g_wins.size();
        m = CDuelMenuTask::spawn(g_tasks, g_layer);
    watch(m);
        CHECK(g_wins.size() == before + 1 && g_wins.back()->kind == "gunsling" && m->state == CDuelMenuTask::GUNSLING);
        frame();
        CHECK(m->state == CDuelMenuTask::GUNSLING);
        g_wins.back()->answer = CDuelMenuTask::BUTTON_OK;
        frame();
        frame();
        CHECK(!alive(m));
    }
    std::printf("ok: duelmenu (duel -> wait / find, cancel, right button, gunsling in the event lobbies)\n");
}
