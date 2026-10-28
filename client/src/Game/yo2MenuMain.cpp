// yo2Menu.cpp, the main menu's parts: CWindowTaskFrameMain, CWindowTaskFrameMove, CWindowTaskButtonMain.
#include "Game/yo2Menu.h"
#include "Game/yo2TgtAvaListDlg.h"

namespace {
struct TaskLockBits : CTask {
    static uint32_t& of(CTask* t) { return t->*(&TaskLockBits::lockFlags_); }
};

// One 24 x 24 cell of the frame texture: at (u, v) of the 3 x 3 grid.
void frameCell(CWindowTaskControll* owner, CTaskPtr<CSpriteElm>& cell, const vc6::string& path, int32_t u, int32_t v) {
    windowSpriteCreate(cell, owner, 10000, path);
    CElement* e = windowElement(cell);
    e->setDrawMode(CElement::BLEND);
    e->inheritTransform_ = true;
    e->rect_[0] = u;
    e->rect_[1] = v;
    e->rect_[2] = 24;
    e->rect_[3] = 24;
}
}   // namespace

void windowShow(CElement* e) {
    TaskLockBits::of(e) &= ~2u;
    e->setDisp(true, true);
}

// --- CWindowTaskFrameMain -----------------------------------------------------------------------------------------

// @yo2 0x00a61800 CWindowTaskFrameMain::CWindowTaskFrameMain
CWindowTaskFrameMain::CWindowTaskFrameMain() { setTaskName("メインメニューのフレーム(コントロール)"); }

// @yo2 0x00a61740 CWindowTaskFrameMain::create
CWindowTaskFrameMain* CWindowTaskFrameMain::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* f = new CWindowTaskFrameMain;
    f->mediator_ = mediator;
    return dynamic_cast<CWindowTaskFrameMain*>(f->CTask::create(parent, 10000));
}

// @yo2 0x00a61ab0 CWindowTaskFrameMain::~CWindowTaskFrameMain
// @yo2 0x00a61a80 CWindowTaskFrameMain deleting destructor
CWindowTaskFrameMain::~CWindowTaskFrameMain() = default;

// @yo2 0x00a61bc0 CWindowTaskFrameMain::onInit: the nine cells, 90% opaque, 282 x 218
bool CWindowTaskFrameMain::onInit() {
    x_ = y_ = 0;
    z_ = 1;
    w_ = 282;
    h_ = 218;
    inheritTransform_ = true;
    for (CTaskPtr<CSpriteElm>& c : cells_)
        c.setUser(this);
    vc6::string path = windowDataDir();
    path += "main_win_01_c01.png";
    for (int i = 0; i < 9; i++)
        frameCell(this, cells_[i], path, i % 3 * 24, i / 3 * 24);
    setAlpha(0.7f);
    setAlpha(0.9f);
    loadImages();
    layout();
    return true;
}

// @yo2 0x00a638e0 CWindowTaskFrameMain::layout: 24 x 24 corners, the edges and the middle stretched to w_ x h_
void CWindowTaskFrameMain::layout() {
    float sx = (w_ - 48) / 24, sy = (h_ - 48) / 24;
    auto at = [&](int i, float x, float y, float scaleX, float scaleY) {
        CElement* e = windowElement(cells_[i]);
        e->pos_ = {x, y, 0};
        e->scale_ = {scaleX, scaleY, 1};
    };
    at(0, 0, 0, 1, 1);
    at(1, 24, 0, sx, 1);
    at(2, w_ - 24, 0, 1, 1);
    at(3, 0, 24, 1, sy);
    at(4, 24, 24, sx, sy);
    at(5, w_ - 24, 24, 1, sy);
    at(6, 0, h_ - 24, 1, 1);
    at(7, 24, h_ - 24, sx, 1);
    at(8, w_ - 24, h_ - 24, 1, 1);
}

// @yo2 0x00a63c00 CWindowTaskFrameMain::handleMessage: WM_LBUTTONDOWN brings the window to the front
bool CWindowTaskFrameMain::handleMessage(WindowMsg m) {
    if (m.msg != 0x201)
        return false;
    mediator_->onControlCommand(this);
    return true;
}

// @yo2 0x00a63c50 CWindowTaskFrameMain::hitTest: strictly inside the frame
bool CWindowTaskFrameMain::hitTest(float x, float y) {
    Vec3 p = worldTranslation();
    return x > p.x && x < p.x + w_ && y > p.y && y < p.y + h_;
}

// @yo2 0x00a67220 CWindowTaskFrameMain::setSize
void CWindowTaskFrameMain::setSize(float w, float h) {
    w_ = w;
    h_ = h;
    layout();
}

// --- CWindowTaskFrameMove -----------------------------------------------------------------------------------------

// (inlined into create 0x00a69150)
CWindowTaskFrameMove::CWindowTaskFrameMove() { setTaskName("CWindowTaskFrameMain"); }

// @yo2 0x00a69150 CWindowTaskFrameMove::create
CWindowTaskFrameMove* CWindowTaskFrameMove::create(CTask* parent, IWindowTaskMediator* mediator, int32_t kind) {
    auto* f = new CWindowTaskFrameMove;
    f->mediator_ = mediator;
    f->kind_ = kind;
    return dynamic_cast<CWindowTaskFrameMove*>(f->CTask::create(parent, 10000));
}

// @yo2 0x00a69360 CWindowTaskFrameMove::~CWindowTaskFrameMove
// @yo2 0x00a69330 CWindowTaskFrameMove deleting destructor
CWindowTaskFrameMove::~CWindowTaskFrameMove() = default;

// @yo2 0x00a69470 CWindowTaskFrameMove::loadImages: the move window's texture (KIND_LOG: the duel log's), BLEND_POINT
void CWindowTaskFrameMove::loadImages() {
    vc6::string path = windowDataDir();
    path += kind_ == KIND_LOG ? "log_win_02_c01.png" : "move_win_01_c01.png";
    for (CTaskPtr<CSpriteElm>& c : cells_)
        windowSpriteTexture(c, path);
    for (int i = 0; i < 9; i++) {
        CElement* e = windowElement(cells_[i]);
        e->setDrawMode(CElement::BLEND_POINT);
        e->rect_[0] = i % 3 * 24;
        e->rect_[1] = i / 3 * 24;
        e->rect_[2] = 24;
        e->rect_[3] = 24;
    }
}

// --- CWindowTaskButtonMain ----------------------------------------------------------------------------------------

// (inlined into create 0x00a63cf0)
CWindowTaskButtonMain::CWindowTaskButtonMain() { setTaskName("メインメニューのボタン(コントロール)"); }

// @yo2 0x00a63cf0 CWindowTaskButtonMain::create
CWindowTaskButtonMain* CWindowTaskButtonMain::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* b = new CWindowTaskButtonMain;
    b->mediator_ = mediator;
    return dynamic_cast<CWindowTaskButtonMain*>(b->CTask::create(parent, 10000));
}

// @yo2 0x00a63f00 CWindowTaskButtonMain::~CWindowTaskButtonMain
// @yo2 0x00a63ed0 CWindowTaskButtonMain deleting destructor
CWindowTaskButtonMain::~CWindowTaskButtonMain() = default;

// @yo2 0x00a64030 CWindowTaskButtonMain::loadImages: main_btn_01_c01.png, 8 x 8 pieces; one 24-pixel column per look,
// except that the top-left, top and left pieces have no checked looks of their own (they repeat the pressed one)
void CWindowTaskButtonMain::loadImages() {
    vc6::string path = windowDataDir();
    path += "main_btn_01_c01.png";
    for (CTaskPtr<CSpriteElm>& s : sprites_)
        windowSpriteTexture(s, path);
    for (int g = 0; g < 9; g++) {
        Piece& p = pieces_[g];
        p.w = p.h = 8;
        bool plain = g == 0 || g == 1 || g == 3;
        for (int k = 0; k < 5; k++) {
            p.uv[k][0] = g % 3 * 8 + (plain && k > 2 ? 2 : k) * 24;
            p.uv[k][1] = g / 3 * 8;
        }
    }
}

// --- CMainMenu ----------------------------------------------------------------------------------------------------

namespace {
// The entries' captions (string ids), top to bottom.
const int32_t kEntryText[CMainMenu::ENTRIES] = {0x13fc, 0x13f8, 0x140c, 0x1406, 0x198c, 0x13fa, 0x1407,
                                                0x13ff, 0xfd2,  0x1401, 0x1400, 0x14c1, 0x1772, 0x1773};
void hide(CElement* e) {
    e->setDisp(false, true);
    TaskLockBits::of(e) |= 2u;
}
}   // namespace

// @yo2 0x00a650f0 CMainMenu::CMainMenu
CMainMenu::CMainMenu() { setTaskName("メインメニュー"); }

// @yo2 0x00a65010 CMainMenu::create (the empty 0x00a65580 runs first)
// @yo2 0x00a65580 (empty)
CMainMenu* CMainMenu::create(CTask* owner) {
    auto* m = new CMainMenu;
    m->owner_ = owner;
    return dynamic_cast<CMainMenu*>(m->CTask::create(owner, 10000));
}

// @yo2 0x00a654a0 CMainMenu::~CMainMenu
// @yo2 0x00a653f0 CMainMenu deleting destructor
CMainMenu::~CMainMenu() = default;

// @yo2 0x00a65340 CMainMenu::maxZ
int32_t CMainMenu::maxZ() const { return static_cast<int32_t>(z_ + 2.0f); }

// @yo2 0x00a655a0 CMainMenu::onInit: the title, the frame, the fourteen entries (all hidden), the × button; the
// window is topmost, on the bottom edge, and fades in from a 20, 728 strip
bool CMainMenu::onInit() {
    title_.setUser(this);
    frame_.setUser(this);
    close_.setUser(this);
    profile_.setUser(this);
    comment_.setUser(this);
    changeTitle_.setUser(this);
    duelpass_.setUser(this);
    selected_ = -1;
    w_ = 282;
    h_ = 402;
    pos_ = {0, 518, z_};

    title_.set(CWindowTaskShadowText::create(this, this));
    title_->setText(windowText(0x1404).c_str());
    windowShow(title_->shadow_.get());
    title_->text_->setColor(1, 1, 1, 1);
    title_->shadow_->setColor(0, 0, 0, 1);
    frame_.set(CWindowTaskFrameMain::create(this, this));

    for (int i = 0; i < ENTRIES; i++) {
        shown_[i] = false;
        CWindowTaskButtonMain* b = entries_[i] = CWindowTaskButtonMain::create(this, this);
        b->x_ = b->pos_.x = 12;
        b->y_ = b->pos_.y = static_cast<float>(27 + 26 * i);
        b->minW_ = 258;
        b->unk5b4_ = 24;
        b->layout();
        b->z_ = b->pos_.z = 3;
        windowShow(b->caption_->shadow_.get());
        b->caption_->text_->setColor(1, 1, 1, 1);
        b->caption_->shadow_->setColor(0, 0, 0, 1);
    }
    for (int i = 0; i < ENTRIES; i++)
        entries_[i]->setTextId(kEntryText[i]);
    setEntriesEnabled(true);
    entries_[TEAMS]->enabled_ = true;   // whatever the config says

    close_.set(CWindowTaskIconHide::create(this, this));
    x_ = 0;
    pos_.x = 0;
    fadeX_ = 20;
    fadeY_ = 728;
    y_ = pos_.y = 736 - h_;
    fadeW_ = static_cast<int32_t>(w_);
    fadeH_ = 16;
    fadeFrames_ = 5;
    setTopmost(true);
    active_ = true;
    duelSettingOpen_ = false;
    modal_ = true;
    arrange();
    return true;
}

// @yo2 0x00a668b0 CMainMenu::setEntriesEnabled
void CMainMenu::setEntriesEnabled(bool on) {
    for (CWindowTaskButtonMain* b : entries_)
        b->enabled_ = on;
    static const int32_t kOff[8][2] = {{ENTRY_0, -1},     {PROFILE, -1},  {COMMENT, TITLE},  {DUEL_SETTING, -1},
                                       {MAIL, -1},        {DUELPASS, -1}, {BLACKLIST, -1},   {FRIENDS, TEAMS}};
    for (int k = 0; k < 8; k++) {
        if (!configMenuItemOff(k))
            continue;
        for (int32_t i : kOff[k])
            if (i >= 0)
                entries_[i]->enabled_ = false;
    }
}

// @yo2 0x00a666f0 CMainMenu::showEntry
void CMainMenu::showEntry(int32_t i) {
    shown_[i] = true;
    arrange();
}

// @yo2 0x00a66720 CMainMenu::hideEntry
void CMainMenu::hideEntry(int32_t i) {
    shown_[i] = false;
    arrange();
}

// @yo2 0x00a66880 CMainMenu::hideEntries
void CMainMenu::hideEntries() {
    for (int i = 0; i < ENTRIES; i++)
        hideEntry(i);
}

// @yo2 0x00a66750 CMainMenu::arrange: 26 pixels per shown entry from y 27; height 38 + 26 per entry, bottom at 736
void CMainMenu::arrange() {
    int shown = 0;
    for (int i = 0; i < ENTRIES; i++) {
        CWindowTaskButtonMain* b = entries_[i];
        if (shown_[i]) {
            b->y_ = b->pos_.y = static_cast<float>(27 + 26 * shown++);
            b->x_ = b->pos_.x = 12;
            windowShow(b);
        } else {
            hide(b);
        }
    }
    int32_t h = shown * 26 + 38;
    h_ = static_cast<float>(h);
    layout();
    x_ = pos_.x = 0;
    y_ = pos_.y = static_cast<float>(736 - h);
}

// @yo2 0x00a66a30 CMainMenu::layout: as wide as the widest entry + 24; the title at 8, 0; the frame fills the
// window; the × in the top right corner
void CMainMenu::layout() {
    pos_.z = z_;
    title_->setText(windowText(0x1404).c_str());
    int32_t widest = 0;
    for (CWindowTaskButtonMain* b : entries_)
        widest = static_cast<int32_t>(b->w_ > static_cast<float>(widest) ? b->w_ : static_cast<float>(widest));
    w_ = static_cast<float>(widest + 24);
    CWindowTaskShadowText* t = title_.get();
    int32_t areaW = static_cast<int32_t>(w_ - 18);
    t->text_->setArea(areaW, 24);
    t->shadow_->setArea(areaW, 24);
    t->x_ = 8;
    t->y_ = 0;
    t->text_->setPos(8, 0);
    t->shadow_->setPos(static_cast<float>(t->shadowDx_) + 8, static_cast<float>(t->shadowDy_));
    t->text_->setAlign(CWindowTaskText::CENTRE);
    t->shadow_->setAlign(CWindowTaskText::CENTRE);
    t->z_ = t->pos_.z = 2;
    frame_->pos_ = {0, 0, 0};
    frame_->setSize(w_, h_);
    CWindowTaskIconHide* c = close_.get();
    c->x_ = w_ - 19;
    c->y_ = 0;
    c->layout();
    c->z_ = 2;
    c->layout();
}

// @yo2 0x00a66450 CMainMenu::onMain
bool CMainMenu::onMain() {
    pollWindows();
    return true;
}

// @yo2 0x00a66470 CMainMenu::pollWindows: a window closed (gone or hidden) gives the menu bar's icon 0 back
void CMainMenu::pollWindows() {
    if (profile_.task() && (!profile_.get() || !profile_->isVisible(false))) {
        profile_->destroy(__FILE__, __LINE__);
        menuBarIconEnable(0, true);
    }
    if (changeTitle_.task() && changeTitleFinished(changeTitle_.get()))
        menuBarIconEnable(0, true);
    if (comment_.task() && (!comment_.get() || !comment_->isVisible(false))) {
        comment_->destroy(__FILE__, __LINE__);
        menuBarIconEnable(0, true);
    }
    CWindowTaskModel* duel = gameDuelSettingWindow();
    if (duelSettingOpen_ && (!duel || !duel->isVisible(false))) {
        menuBarIconEnable(0, true);
        duelSettingOpen_ = false;
    }
    if (duel && duel->isVisible(false))
        duelSettingOpen_ = true;
    if (duelpass_.task()) {
        if (duelpass_.get() && duelpass_->isVisible(false))
            return;
        duelpass_->destroy(__FILE__, __LINE__);
        menuBarIconEnable(0, true);
    }
}

// @yo2 0x00a67270 CMainMenu::onControlEvent: × closes the menu; an entry sets selected_ and opens its window
void CMainMenu::onControlEvent(CWindowTaskControll* sender) {
    if (sender == close_.task()) {
        appPlaySound(0x10000002, 0);
        g_gameCtrl.leave(CTRL_MAIN_MENU);
        hide(this);
    }
    if (!active_)
        return;
    int32_t entry = -1;
    for (int i = 0; i < ENTRIES; i++)
        if (sender == entries_[i])
            entry = i;
    if (entry < 0)
        return;
    appPlaySound(0x10000001, 0);
    // the window an entry opens, the GameCtrl mode it takes over (0: none needed)
    auto enter = [](int32_t ctrl) {
        if (!g_gameCtrl.canEnter(ctrl))
            return false;
        g_gameCtrl.enter(ctrl);
        return true;
    };
    auto closeMenu = [this] {
        menuBarIconEnable(0, false);
        hide(this);
    };
    switch (entry) {
    case ENTRY_0:
        selected_ = ENTRY_0;
        return;
    case PROFILE:
        if (!enter(CTRL_MY_PROFILE))
            return;
        selected_ = PROFILE;
        if (!profile_.task()) {
            profile_.set(profileCreate(owner_));
            profile_->centre();
        }
        profile_->bringToFront();
        windowShow(profile_.get());
        break;
    case COMMENT:
        if (!enter(CTRL_COMMENT_SETTING))
            return;
        selected_ = COMMENT;
        if (!comment_.task()) {
            comment_.set(setCommentCreate(owner_));
            comment_->centre();
        }
        break;
    case TITLE:
        if (!enter(CTRL_TITLE_SETTING))
            return;
        selected_ = TITLE;
        if (!changeTitle_.task()) {
            changeTitle_.set(changeTitleCreate(owner_));
            YO2_ASSERT(changeTitle_.task(), "error m_settitle::Create");
            changeTitle_->setInstName("称号切り替えオブジェクト");
        }
        break;
    case DUEL_SETTING:
        if (!enter(CTRL_DUEL_SETTING))
            return;
        selected_ = DUEL_SETTING;
        duelSettingOpen(gameDuelSettingWindow());
        closeMenu();
        return;
    case MAIL: {
        selected_ = MAIL;
        if (!enter(CTRL_D_MAIL))
            return;
        CTask* t = mailListCreate(owner_);
        YO2_ASSERT(t, "メールリストタスク");
        t->setInstName("メールリストタスク");
        closeMenu();
        return;
    }
    case ENTRY_6:
    case ENTRY_12:
    case ENTRY_13:
        selected_ = entry;
        return;
    case DUEL_LOG: {
        selected_ = DUEL_LOG;
        if (!enter(CTRL_DUELLOG))
            return;
        CTask* t = duelLogCreate(owner_);
        YO2_ASSERT(t, "デュエルログリストタスク");
        t->setInstName("デュエルログリストタスク");
        closeMenu();
        return;
    }
    case BLACKLIST: {
        selected_ = BLACKLIST;
        CTask* t = blacklistCreate(owner_);
        YO2_ASSERT(t, "CWindowModelBlacklist失敗");
        t->setInstName("CWindowModelBlacklist");
        closeMenu();
        return;
    }
    case FRIENDS: {
        selected_ = FRIENDS;
        CTask* t = friendlistCreate(owner_);
        YO2_ASSERT(t, "CWindowModelFriendlist::Create()失敗");
        t->setInstName("フレンドリスト");
        closeMenu();
        return;
    }
    case TEAMS: {
        selected_ = TEAMS;
        CTask* t = teamlistCreate(owner_);
        YO2_ASSERT(t, "CWindowModelTeamlist::Create()失敗");
        t->setInstName("チームリスト");
        closeMenu();
        return;
    }
    case DUELPASS:
        if (!enter(CTRL_USE_DUELPASS))
            return;
        selected_ = DUELPASS;
        if (!duelpass_.task()) {
            duelpassReadUsbKey();
            if (gateKind() == 2) {
                duelpass_.set(duelpassUsbCreate(owner_));
            } else if (accountDuelpass150() < 1) {
                duelpass_.set(duelpassCodeCreate(owner_));
            } else {
                accountDuelpass150() = 0;
                duelpass_.set(duelpass150Create(owner_));
            }
            duelpass_->centre();
        }
        break;
    }
    closeMenu();
}
