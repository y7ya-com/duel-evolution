// src/Game/yo2MenuMain.cpp: the main menu's frame, the move frame and the menu button.
#include <windows.h>

#include <cmath>
#include <set>
#include <string>
#include <vector>

#include "Game/yo2Menu.h"
#include "Game/yo2TgtAvaListDlg.h"
#include "System/yo2StringDB.h"
#include "System/yo2ZSort.h"
#include "game_test.h"

#include "window_stubs.h"

struct Win : CWindowTaskModel {
    int commands = 0;
    void layout() override {}
    int32_t maxZ() const override { return static_cast<int32_t>(z_); }
    void onControlEvent(CWindowTaskControll*) override {}
    void onControlCommand(CWindowTaskControll*) override { commands++; }
};

// --- stand-ins for yo2MenuExtern.h --------------------------------------------------------------------------------
struct Opened : CWindowTaskModel {   // any window an entry opens
    void layout() override {}
    int32_t maxZ() const override { return static_cast<int32_t>(z_); }
    void onControlEvent(CWindowTaskControll*) override {}
    void onControlCommand(CWindowTaskControll*) override {}
};
struct OpenedYesNo : CWindowModelDialogYesNo {};
static std::vector<std::string> g_opened;
template <class T>
static T* open(CTask* owner, const char* what) {
    g_opened.push_back(what);
    auto* w = new T;
    w->CTask::create(owner, 10);
    return w;
}
CWindowTaskModel* profileCreate(CTask* o) { return open<Opened>(o, "profile"); }
CWindowTaskModel* setCommentCreate(CTask* o) { return open<Opened>(o, "comment"); }
CTask* changeTitleCreate(CTask* o) { return open<Opened>(o, "title"); }
static bool g_titleDone;
bool changeTitleFinished(CTask*) { return g_titleDone; }
CTask* duelLogCreate(CTask* o) { return open<Opened>(o, "duellog"); }
CTask* blacklistCreate(CTask* o) { return open<Opened>(o, "blacklist"); }
CTask* friendlistCreate(CTask* o) { return open<Opened>(o, "friends"); }
CTask* teamlistCreate(CTask* o) { return open<Opened>(o, "teams"); }
CWindowModelDialogYesNo* duelpassUsbCreate(CTask* o) { return open<OpenedYesNo>(o, "usb"); }
CWindowModelDialogYesNo* duelpassCodeCreate(CTask* o) { return open<OpenedYesNo>(o, "code"); }
CWindowModelDialogYesNo* duelpass150Create(CTask* o) { return open<OpenedYesNo>(o, "150"); }
static std::vector<std::pair<int, bool>> g_icons;
void menuBarIconEnable(int32_t icon, bool on) { g_icons.push_back({icon, on}); }
static CWindowTaskModel* g_duelSetting;
static int g_duelSettingOpens;
CWindowTaskModel* gameDuelSettingWindow() { return g_duelSetting; }
void duelSettingOpen(CWindowTaskModel*) { g_duelSettingOpens++; }
CTask* mailListCreate(CTask* o) { return open<Opened>(o, "mail"); }
static std::set<int> g_configOff;
bool configMenuItemOff(int32_t item) { return g_configOff.count(item) != 0; }
void duelpassReadUsbKey() {}
static int32_t g_gateKind, g_pass150;
int32_t gateKind() { return g_gateKind; }
int32_t& accountDuelpass150() { return g_pass150; }
static std::vector<uint32_t> g_sounds;
void appPlaySound(uint32_t id, int32_t) { g_sounds.push_back(id); }

struct FakeText : CStringDB {
    vc6::string get(uint32_t id) const override { return yo2Format("T%u", id); }
};

static bool approx(float a, float b) { return std::fabs(a - b) < 1e-4f; }
static CElement* el(const CTaskPtrBase& p) { return windowElement(p); }
static bool rectIs(const CElement* e, int u, int v, int w, int h) {
    return e->rect_[0] == u && e->rect_[1] == v && e->rect_[2] == w && e->rect_[3] == h;
}

static void frameMain(Win* w) {
    CWindowTaskFrameMain* f = CWindowTaskFrameMain::create(w, w);
    CHECK(f && f->taskName() == "メインメニューのフレーム(コントロール)" && f->mediator_ == w);
    CHECK(f->w_ == 282 && f->h_ == 218 && f->z_ == 1 && f->inheritTransform_);
    CHECK(approx(f->color_[3], 0.9f));
    for (int i = 0; i < 9; i++) {
        CSpriteElm* s = f->cells_[i].get();
        CHECK(s->texture == "data/common/window/main_win_01_c01.png" && s->drawMode_ == CElement::BLEND);
        CHECK(rectIs(s, i % 3 * 24, i / 3 * 24, 24, 24) && s->inheritTransform_);
    }
    f->w_ = 120, f->h_ = 96;
    f->layout();
    CHECK(el(f->cells_[2])->pos_.x == 96 && el(f->cells_[6])->pos_.y == 72 && el(f->cells_[8])->pos_.x == 96);
    CHECK(approx(el(f->cells_[1])->scale_.x, 3) && approx(el(f->cells_[4])->scale_.y, 2));
    CHECK(approx(el(f->cells_[4])->scale_.x, 3) && el(f->cells_[0])->scale_.x == 1);
    f->pos_ = {10, 20, 0};
    f->updateMatrix();
    CHECK(f->hitTest(11, 21) && !f->hitTest(10, 50) && !f->hitTest(130, 50) && f->hitTest(129, 115));
    WindowMsg m{};
    m.msg = 0x200;
    CHECK(!f->handleMessage(m) && w->commands == 0);
    m.msg = 0x201;
    CHECK(f->handleMessage(m) && w->commands == 1);
}

static void frameMove(Win* w) {
    CWindowTaskFrameMove* f = CWindowTaskFrameMove::create(w, w, 3);
    CHECK(f && f->taskName() == "CWindowTaskFrameMain" && f->kind_ == 3);
    CHECK(f->cells_[4].get()->texture == "data/common/window/move_win_01_c01.png");
    CHECK(f->cells_[4].get()->drawMode_ == CElement::BLEND_POINT && rectIs(f->cells_[4].get(), 24, 24, 24, 24));
    CWindowTaskFrameMove* log = CWindowTaskFrameMove::create(w, w, CWindowTaskFrameMove::KIND_LOG);
    CHECK(log->cells_[8].get()->texture == "data/common/window/log_win_02_c01.png");
}

static void buttonMain(Win* w) {
    CWindowTaskButtonMain* b = CWindowTaskButtonMain::create(w, w);
    CHECK(b && b->taskName() == "メインメニューのボタン(コントロール)" && b->mediator_ == w);
    CHECK(b->sprites_[0].get()->texture == "data/common/window/main_btn_01_c01.png");
    const CWindowTaskSwitch::Piece& tl = b->pieces_[0];
    CHECK(tl.w == 8 && tl.uv[1][0] == 24 && tl.uv[2][0] == 48 && tl.uv[3][0] == 48 && tl.uv[4][0] == 48);
    const CWindowTaskSwitch::Piece& tr = b->pieces_[2];
    CHECK(tr.uv[0][0] == 16 && tr.uv[3][0] == 88 && tr.uv[4][0] == 112 && tr.uv[4][1] == 0);
    CHECK(b->pieces_[3].uv[4][0] == 48 && b->pieces_[3].uv[4][1] == 8);
    CHECK(b->pieces_[4].uv[4][0] == 104 && b->pieces_[8].uv[3][0] == 88 && b->pieces_[8].uv[3][1] == 16);
}

static bool hidden(CElement* e) { return !e->disp_; }

static void mainMenu(CTask* root) {
    g_configOff = {2, 7};   // comment + title, friends + teams switched off
    CMainMenu* m = CMainMenu::create(root);
    CHECK(m && m->taskName() == "メインメニュー" && m->owner_ == root && m->parent() == root);
    CHECK(m->selected_ == -1 && m->active_ && m->topmost_ && m->modal_ && m->fadeX_ == 20 && m->fadeY_ == 728);
    CHECK(m->fadeH_ == 16 && m->fadeFrames_ == 5 && m->maxZ() == static_cast<int32_t>(m->z_ + 2));
    for (int i = 0; i < CMainMenu::ENTRIES; i++) {
        CWindowTaskButtonMain* b = m->entries_[i];
        CHECK(!m->shown_[i] && hidden(b) && b->minW_ == 258 && b->z_ == 3);
    }
    CHECK(!m->entries_[CMainMenu::COMMENT]->enabled_ && !m->entries_[CMainMenu::TITLE]->enabled_);
    CHECK(!m->entries_[CMainMenu::FRIENDS]->enabled_ && m->entries_[CMainMenu::TEAMS]->enabled_);
    CHECK(m->entries_[CMainMenu::PROFILE]->enabled_);
    // nothing shown: 38 high on the bottom edge; the frame follows the window, the × at the right
    CHECK(m->h_ == 38 && m->y_ == 698 && m->pos_.y == 698 && m->frame_->h_ == 38);
    float widest = 0;
    for (CWindowTaskButtonMain* b : m->entries_) widest = b->w_ > widest ? b->w_ : widest;
    CHECK(m->w_ == static_cast<float>(static_cast<int32_t>(widest) + 24) && m->frame_->w_ == m->w_);
    CHECK(m->close_->x_ == m->w_ - 19 && m->close_->z_ == 2 && m->title_->x_ == 8);
    m->showEntry(CMainMenu::PROFILE);
    m->showEntry(CMainMenu::DUEL_LOG);
    m->showEntry(CMainMenu::DUELPASS);
    CHECK(m->h_ == 116 && m->y_ == 620 && !hidden(m->entries_[CMainMenu::DUEL_LOG]));
    CHECK(m->entries_[CMainMenu::PROFILE]->y_ == 27 && m->entries_[CMainMenu::DUEL_LOG]->y_ == 53);
    CHECK(m->entries_[CMainMenu::DUELPASS]->y_ == 79 && hidden(m->entries_[CMainMenu::MAIL]));

    // the profile: takes MY_PROFILE, opens and centres the window, hides the menu and the menu bar's icon 0
    g_gameCtrl.reset();
    m->onControlEvent(m->entries_[CMainMenu::PROFILE]);
    CHECK(g_gameCtrl.now() == CTRL_MY_PROFILE && m->selected_ == CMainMenu::PROFILE && g_opened.back() == "profile");
    CHECK(m->profile_ && hidden(m) && g_icons.back() == std::make_pair(0, false) && g_sounds.back() == 0x10000001);
    m->onMain();   // still open
    CHECK(m->profile_ && g_icons.size() == 1);
    m->profile_->setDisp(false, true);
    m->onMain();   // closed: destroyed, icon back
    CHECK(g_icons.back() == std::make_pair(0, true));
    CTask::flushDeleted();
    CHECK(!m->profile_);

    // an entry whose mode can't take over does nothing
    g_gameCtrl.reset();
    g_gameCtrl.enter(CTRL_ERROR);
    size_t opened = g_opened.size();
    m->onControlEvent(m->entries_[CMainMenu::DUEL_LOG]);
    CHECK(g_opened.size() == opened && m->selected_ == CMainMenu::DUEL_LOG);
    g_gameCtrl.reset();
    m->onControlEvent(m->entries_[CMainMenu::DUEL_LOG]);
    CHECK(g_opened.back() == "duellog" && g_gameCtrl.now() == CTRL_DUELLOG);

    // the duel pass: the 150 window once the account has some, the count reset
    g_gameCtrl.reset();
    g_pass150 = 3;
    m->onControlEvent(m->entries_[CMainMenu::DUELPASS]);
    CHECK(g_opened.back() == "150" && g_pass150 == 0 && m->duelpass_);
    m->duelpass_->setDisp(false, true);
    m->onMain();
    CTask::flushDeleted();
    CHECK(!m->duelpass_);
    g_gameCtrl.reset();
    g_gateKind = 2;
    m->onControlEvent(m->entries_[CMainMenu::DUELPASS]);
    CHECK(g_opened.back() == "usb");

    // the duel settings window: open while it is visible, then the icon comes back
    g_gameCtrl.reset();
    auto* duelWin = new Opened;
    duelWin->create(root, 10);
    Opened& duel = *duelWin;
    g_duelSetting = &duel;
    m->onControlEvent(m->entries_[CMainMenu::DUEL_SETTING]);
    CHECK(g_duelSettingOpens == 1 && m->selected_ == CMainMenu::DUEL_SETTING);
    m->onMain();
    CHECK(m->duelSettingOpen_);
    duel.setDisp(false, true);
    size_t icons = g_icons.size();
    m->onMain();
    CHECK(!m->duelSettingOpen_ && g_icons.size() == icons + 1 && g_icons.back().second);
    g_duelSetting = nullptr;

    // ×: cancel sound, the main menu mode is left
    g_gameCtrl.reset();
    g_gameCtrl.enter(CTRL_MAIN_MENU);
    windowShow(m);
    m->onControlEvent(m->close_.get());
    CHECK(g_sounds.back() == 0x10000002 && g_gameCtrl.now() == CTRL_NONE && hidden(m));
    m->hideEntries();
    CHECK(!m->shown_[CMainMenu::PROFILE] && m->h_ == 38);
    g_configOff.clear();
}

int main() {
    CZSortSet layers;
    g_zsortSet = &layers;
    FakeText text;
    g_stringDB = &text;
    CWindowTaskFactory::create();
    CTask* root = CTask::createRoot();
    auto* w = new Win;
    w->create(root, 10);
    frameMain(w);
    frameMove(w);
    buttonMain(w);
    mainMenu(root);
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    g_stringDB = nullptr;
    std::puts("gameb_menu: ok");
}
