// CNpcListMenu (the exe's src\Lobby\yo2playerListDlg.cpp).
#include "Lobby/yo2NpcListMenu.h"

#include <cstdio>
#include <cstring>

#include "Game/yo2EventManager.h"
#include "Game/yo2TgtAvaListDlg.h"
#include "Lobby/yo2LobbyExtern.h"
#include "Net/NetLobby.h"
#include "Net/NetLobby_Social.h"
#include "Net/NetUi.h"
#include "System/window/yo2UGDialogBase.h"
#include "System/yo2StringDB.h"

namespace {
constexpr float kAlpha = 0.9f;      // 0x00bee924
constexpr float kOpenBottom = 607;  // 0x00beeae4: windows open with their bottom here
constexpr float kAvatarZ = 31730;   // 0x46f7e400

// A task's TM_MAIN lock (CTask::lockFlags_ bit 1), set and cleared on tasks that aren't this one.
struct Lock : CTask {
    static void set(CTask* t) { t->*(&Lock::lockFlags_) |= 2; }
    static void clear(CTask* t) { t->*(&Lock::lockFlags_) &= ~2u; }
};
// 0x005d5700 / 0x005d56d0 (inlined into every window file): hide and freeze, or the reverse
void hide(CElement* e) {
    e->setDisp(false, true);
    Lock::set(e);
}
void show(CElement* e) {
    Lock::clear(e);
    e->setDisp(true, true);
}

// The player's character, as the conversations name it.
vc6::string myName() {
    CNetAccount* acc = appNetAccount();
    std::string s = playerNameString(acc->me.players[acc->me.activeSlot]);
    return vc6::string(std::string_view(s));
}

// A help as the menu makes them: under the window, moving with it.
CWindowTaskControll* makeHelp(CTaskPtr<CWindowTaskControll>& to, CNpcListMenu* w, const char* name) {
    to.setUser(w);
    to.set(windowHelpCreate(w, w));
    windowNameTask(to.task(), name);
    to->inheritTransform_ = true;
    return to.get();
}
void helpAtZero(CWindowTaskControll* h) {
    windowHelpSetZ(h, 0);
    h->pos_.z = 0;
}
}  // namespace

// @yo2 0x0089b790 CNpcListMenu::create (priority 10000; the constructor is inlined into it)
CNpcListMenu* CNpcListMenu::create(CTask* parent) {
    return dynamic_cast<CNpcListMenu*>((new CNpcListMenu)->CTask::create(parent, 10000));
}

// (the exe names it like the player menu it was copied from)
CNpcListMenu::CNpcListMenu() {
    setTaskName("CPlayerListMenu");
    yesNo_.setUser(this);
}

// @yo2 0x0089bc30 CNpcListMenu deleting destructor
// @yo2 0x0089bc60 CNpcListMenu::~CNpcListMenu
// @yo2 0x008a0ba0 the vector's element destructor range (ints: nothing)
CNpcListMenu::~CNpcListMenu() = default;

// @yo2 0x0089bee0 CNpcListMenu::onInit: 336 x 100 at the mouse (z 10), its texts and buttons, hidden behind open()
bool CNpcListMenu::onInit() {
    inheritTransform_ = true;
    h_ = 100;
    w_ = 336;
    int32_t mx = 0, my = 0;
    windowMouseGetXY(&mx, &my);
    pos_.z = 10;
    pos_.x = static_cast<float>(mx);
    pos_.y = static_cast<float>(my);
    frame_.setUser(this);
    frame_.set(CWindowTaskFrameThin::create(this, this, 2));
    frame_->setAlpha(kAlpha);

    CWindowTaskControll* h = makeHelp(nameText_, this, "CPlayerListMenuのレベル＆名前表示");
    windowHelpText(h)->setAlign(CWindowTaskText::CENTRE);
    windowHelpText(h)->setField430(0);
    windowHelpText(h)->setColor(1, 0, 0, 1);
    helpAtZero(h);
    h->setAlpha(kAlpha);

    h = makeHelp(winLabel_, this, "CPlayerListMenuの『勝率：』テキスト");
    h->setTextId(0x2331);
    windowHelpText(h)->setAlign(CWindowTaskText::LEFT);
    helpAtZero(h);
    h->setAlpha(kAlpha);
    windowHelpSetBackColor(h, 0.8f, 0.8f, 0.8f, kAlpha);

    h = makeHelp(winText_, this, "CPlayerListMenuの勝率テキスト");
    windowHelpText(h)->setAlign(CWindowTaskText::RIGHT);
    helpAtZero(h);
    h->setAlpha(kAlpha);
    windowHelpSetBackColor(h, 0.8f, 0.8f, 0.8f, kAlpha);

    h = makeHelp(deckLabel_, this, "CNpcListMenuの『デッキ名:』テキスト");
    h->setAlpha(kAlpha);
    windowHelpSetBackColor(h, 1, 1, 1, kAlpha);
    h->setTextId(0x17dd);
    windowHelpText(h)->setAlign(CWindowTaskText::LEFT);
    helpAtZero(h);

    h = makeHelp(deckText_, this, "CNpcListMenuのデッキ名テキスト");
    windowHelpSetBackColor(h, 1, 1, 1, kAlpha);
    windowHelpText(h)->setAlign(CWindowTaskText::RIGHT);
    helpAtZero(h);

    h = makeHelp(condText_, this, "CPlayerListMenuのデュエル条件テキスト");
    helpAtZero(h);
    h->setAlpha(kAlpha);

    h = makeHelp(rivalText_, this, "CPlayerListMenuの対戦相手テキスト");
    windowHelpText(h)->setAlign(CWindowTaskText::LEFT);
    helpAtZero(h);
    h->setAlpha(kAlpha);

    back_.setUser(this);
    back_.set(CWindowTaskBackPlane::create(this, this));
    windowNameTask(back_.task(), "CPlayerListMenuの背景");
    back_->inheritTransform_ = true;
    back_->z_ = 0;
    back_->pos_.z = 0;
    back_->setAlpha(kAlpha);

    struct Button {
        CTaskPtr<CWindowTaskTextSwitch>* to;
        const char* name;
        int32_t textId;
    };
    const Button buttons[] = {{&duelButton_, "デュエル申し込みボタン", 0x13d0},
                              {&tradeButton_, "トレード申し込みボタン", 0x13d2},
                              {&chatButton_, "チャットメッセージボタン", 0x13d3}};
    for (const Button& b : buttons) {
        b.to->setUser(this);
        b.to->set(CWindowTaskTextSwitch::create(this, this));
        windowNameTask(b.to->task(), b.name);
        CWindowTaskTextSwitch* s = b.to->get();
        s->inheritTransform_ = true;
        s->minW_ = 288;
        s->unk5b4_ = 24;
        s->layout();
        s->z_ = 2;
        s->pos_.z = 2;
        s->setTextId(b.textId);
    }

    unk490_[1] = unk490_[2] = unk490_[3] = 0;
    unk4fc_ = 0;
    unk500_ = 0;
    unk501_ = 0;
    unk502_ = 1;
    unk504_[0] = 0;
    unk528_ = 0;
    modal_ = true;
    lobbyMouseFlush();
    setTopmost(true);
    layout();
    asked_ = false;
    left_ = false;
    present_ = 0;
    state_ = ASK;
    return true;
}

// @yo2 0x0089f6c0 CNpcListMenu::layout: the frame around the window
// @yo2 0x0089a3d0 CWindowTaskFrameThin::setSize (inline, copied into this file)
void CNpcListMenu::layout() {
    pos_ = {x_, y_, z_};
    CWindowTaskFrameThin* f = frame_.get();
    f->x_ = f->y_ = 0;
    f->pos_.x = f->pos_.y = 0;
    f->w_ = w_;
    f->h_ = h_;
    f->layout();
    f->z_ = 0;
    f->pos_.z = 0;
}

// @yo2 0x0089ca70 CNpcListMenu::onMain: the state machine, while shown
// @yo2 0x0089d570 CNpcListMenu::stepDuel (empty)
// @yo2 0x0089d680 CNpcListMenu::stepIdle (empty)
bool CNpcListMenu::onMain() {
    int32_t mx = 0, my = 0;
    windowMouseGetXY(&mx, &my);
    (void)frame_->worldTranslation();   // read and dropped, as the exe does
    if (!isVisible(false)) return true;
    switch (state_) {
    case ASK: stepAsk(); break;
    case ASKING: stepAsking(); break;
    case DUEL: break;   // 0x0089d570 (empty): the lobby takes it from here
    case AFTER_DUEL: stepAfterDuel(); break;
    case IDLE: break;   // 0x0089d680 (empty)
    case GREET: stepGreet(); break;
    case GREETING: stepTalkDone(); break;   // 0x0089d910 (its own copy of the wait)
    case PRESENT: stepPresent(); break;
    case WON: stepWon(); break;
    case WON_TALKING: stepTalkDone(); break;
    case LOST: stepLost(); break;
    case LOST_TALKING: stepTalkDone(); break;
    case ITEM: stepItem(); break;
    case ITEM_TALKING: stepTalkDone(); break;
    }
    return true;
}

// @yo2 0x0089cce0 CNpcListMenu::stepAsk: once the NPC's balloon is gone, "duel?" (a yes / no box), unless the
// account's flag 0x100 skips straight to the greeting
// @yo2 0x0089d4d0 CCallback3<...>::~CCallback3 (inlined copy: the callback passed to setCallback is a temporary)
void CNpcListMenu::stepAsk() {
    CTask* w = lobbyWaistUp(1);
    if (!w || waistUpBalloonOpen(w)) return;
    if (appNetAccount()->authFlags & 0x100) {
        state_ = GREET;
        return;
    }
    answer_ = -1;
    yesNo_.set(CWindowModelDialogYesNo::create(this, 420, 280, 4000, 4001, 1));
    YO2_ASSERT(yesNo_.task(), "CWindowModelDialogYesNo タスク生成失敗！？");
    yesNo_.get()->setInstName("m_pYesNoDlg -> CWindowModelDialogYesNo");
    yesNo_->setCallback(CCallbackM3<CNpcListMenu, int, CWindowTaskModel*, CALLBACK_MESSAGE_TYPE, intptr_t>(
        this, &CNpcListMenu::onYesNo));
    yesNo_->setText(windowText(0x1486).c_str());
    yesNo_->centre();
    yesNo_->setTopmost(true);
    g_gameCtrl.enter(0x14);
    state_ = ASKING;
}

// @yo2 0x0089e1a0 CNpcListMenu::onYesNo (the yes / no box's callback): the click sound, the answer, the box hidden
int CNpcListMenu::onYesNo(CWindowTaskModel* window, CALLBACK_MESSAGE_TYPE, intptr_t value) {
    if (value == 4000) {
        appPlaySound(0x10000001, 0);
        answer_ = 1;
    } else if (value == 4001) {
        appPlaySound(0x10000000, 0);
        answer_ = 0;
    }
    window->setDisp(false, true);
    Lock::set(window);
    return 1;
}

// @yo2 0x0089d4f0 CNpcListMenu::stepAsking: answered -> the box goes; yes = the duel (the lobby reads asked_ and the
// duel NPC), no = the greeting
void CNpcListMenu::stepAsking() {
    if (answer_ == -1) return;
    yesNo_.get()->destroy(__FILE__, 0x98f);
    if (answer_ == 1) {
        asked_ = true;
        state_ = DUEL;
        lobbySetDuelNpc(npc_);
        return;
    }
    state_ = GREET;
}

// @yo2 0x0089d590 CNpcListMenu::stepAfterDuel: once the line after the duel is read, a present (lobby +0xdbd4: 1
// won / 2 an item) or done
void CNpcListMenu::stepAfterDuel() {
    CTask* w = lobbyWaistUp(1);
    if (!w || waistUpBalloonOpen(w)) return;
    CNetLobby* lobby = appNetLobby();
    uint8_t kind = static_cast<uint8_t>(lobby->npcPresentType);
    lobby->npcPresentType = 0;
    if (kind == 1) {
        state_ = lobbyDuelResult() == 1 ? WON : LOST;
    } else if (kind == 2) {
        state_ = ITEM;
    } else {
        left_ = true;
        releaseNpc();
        state_ = IDLE;
    }
}

// @yo2 0x0089d6a0 CNpcListMenu::stepGreet: the NPC's line 10 (or "…?" when it has none)
void CNpcListMenu::stepGreet() {
    CFukiDictionary* fuki = lobbyFukiDictionary();
    CTask* w = lobbyWaistUp(1);
    if (!w) return;
    waistUpSetSpeaker(w, name_, 0, 0x5a);
    waistUpSetListener(lobbyWaistUp(1), myName());
    int32_t text = fuki->text(npc_, 10);
    fuki->unused(npc_, 10);
    if (text < 1)
        waistUpSayText(lobbyWaistUp(1), "\x81\x63?", 0);   // "…?" in Shift-JIS, as the game shows it
    else
        waistUpSay(lobbyWaistUp(1), npc_, 10);
    state_ = GREETING;
}

// @yo2 0x0089d910 CNpcListMenu::stepTalkDone (GREETING): the balloon closed -> the menu closes, the NPC goes back
// @yo2 0x0089dbf0 CNpcListMenu::stepWonDone
// @yo2 0x0089de80 CNpcListMenu::stepLostDone
// @yo2 0x0089e110 CNpcListMenu::stepItemDone: ... and the present is asked for (ITEMGET 3)
void CNpcListMenu::stepTalkDone() {
    CTask* w = lobbyWaistUp(1);
    if (!w || waistUpBalloonOpen(w)) return;
    if (state_ == GREETING) {
        close(false);
        releaseNpc();
        return;
    }
    state_ = IDLE;
    left_ = true;
    releaseNpc();
    appNetLobby()->itemGet(*appNetAccount(), 3, 0);
}

// @yo2 0x0089d980 CNpcListMenu::stepPresent: the ITEMGET answer (request byte 0x7f) -> closed
void CNpcListMenu::stepPresent() {
    CNetLobby* lobby = appNetLobby();
    if (lobby->flag(0x7f) != 2) return;
    lobby->flag(0x7f) = 0;
    int32_t r = 0;
    lobby->takeResult(&r, 99);
    close(false);
    yo2Trace("CNpcListMenu: プレゼント\n");
}

// @yo2 0x0089d9f0 CNpcListMenu::stepWon: line 0x45
// @yo2 0x0089dc80 CNpcListMenu::stepLost: line 0x4a
// @yo2 0x0089df10 CNpcListMenu::stepItem: line 0x4f
void CNpcListMenu::sayLine(int32_t line, int32_t next) {
    lobbyFukiDictionary();
    CTask* w = lobbyWaistUp(1);
    if (!w) return;
    waistUpSetSpeaker(w, name_, 0, 0x5a);
    waistUpSetListener(lobbyWaistUp(1), myName());
    waistUpSay(lobbyWaistUp(1), npc_, line);
    state_ = next;
}
void CNpcListMenu::stepWon() { sayLine(0x45, WON_TALKING); }
void CNpcListMenu::stepLost() { sayLine(0x4a, LOST_TALKING); }
void CNpcListMenu::stepItem() { sayLine(0x4f, ITEM_TALKING); }

// @yo2 0x0089cc50 CNpcListMenu::releaseNpc: the two GameCtrl modes back, the area map's NPC let go
void CNpcListMenu::releaseNpc() {
    g_gameCtrl.leave(0x13);
    g_gameCtrl.leave(0x14);
    lobbyAreaMapNpcRelease(npc_);
}

// @yo2 0x008a0030 CNpcListMenu::close (keepAvatars false: the duel conversation's avatars go too)
void CNpcListMenu::close(bool keepAvatars) {
    if (!keepAvatars) duelAvaClose(1);
    g_gameCtrl.leave(0x13);
    setDisp(false, true);
    lockFlags_ |= 2;
}

// @yo2 0x0089e250 CNpcListMenu::conditionText: the duel condition line of the NPCs 0x33..0x5f, three per line
int32_t CNpcListMenu::conditionText(int32_t npc) {
    static const int32_t kText[] = {0x22c6, 0x22c5, 0x22c7, 0x22c8, 0x22c9, 0x22ca, 0x22cd, 0x22ce,
                                    0x22cf, 0x22d0, 0x22d1, 0x22d2, 0x22d4, 0x22d3, 0x22d5};
    if (npc < 0x33 || npc > 0x5f) return -1;
    return kText[(npc - 0x33) / 3];
}

// @yo2 0x0089e3b0 CNpcListMenu::presentFor: the three NPCs that give a present
int32_t CNpcListMenu::presentFor(int32_t npc) {
    switch (npc) {
    case 0x36: case 0x37: case 0x38: return 0x63e2;
    case 0x42: case 0x43: case 0x44: return 0x655e;
    case 0x4b: case 0x4c: case 0x4d: return 0x6aae;
    default: return 0;
    }
}

// @yo2 0x008a02f0 CNpcListMenu::npcName: the duel module's name text, or the table's name
vc6::string CNpcListMenu::npcName(int32_t npc, vc6::string fallback) {
    int32_t text = duelAvaNpcNameText(npc);
    if (text == -1) return fallback;
    return g_stringDB->get(text);
}

// @yo2 0x008a00a0 CNpcListMenu::setNpc: false if the table doesn't have it
bool CNpcListMenu::setNpc(int32_t npc) {
    npc_ = npc;
    size_t n = 0;
    const LobbyNpcRow* rows = lobbyNpcRows(&n);
    if (!rows) return false;
    const LobbyNpcRow* row = nullptr;
    for (size_t i = 0; i < n; i++)
        if (rows[i].id == npc) {
            row = &rows[i];
            break;
        }
    if (!row) return false;
    name_ = npcName(npc_, vc6::string(row->name));
    std::memcpy(avatar_.bytes_, row->parts, sizeof avatar_.bytes_);
    int32_t a = 0, b = 0, c = 0, d = 0;
    npcRecord(npc_, &a, &b, &c, &d);
    uint32_t pbin = appNetAccount()->bin.item(npc_);
    info_.rec[2] = b;
    info_.rec[0] = a;
    info_.rank = static_cast<uint8_t>(pbin >> 24);
    info_.rec[1] = c;
    info_.npc = npc_;
    return true;
}

// @yo2 0x0089e430 CNpcListMenu::showInfo: name, record, deck, conditions top to bottom; the window as tall as that
// @yo2 0x0089a430 CWindowTaskBackPlane::setPosition (inline, copied into this file)
// @yo2 0x0089a400 CWindowTaskBackPlane::setSize (inline, copied into this file)
void CNpcListMenu::showInfo() {
    char buf[0x400];
    asked_ = false;
    unk58c_ = 0;
    std::snprintf(buf, sizeof buf, "%8s", name_.c_str());
    CWindowTaskControll* h = nameText_.get();
    h->setText(windowWiden(buf).c_str());
    windowHelpSetPosition(h, 8, 8);
    windowHelpSetSize(h, w_ - 16, 36);
    h = winLabel_.get();
    windowHelpSetPosition(h, 8, 44);
    windowHelpSetSize(h, w_ - 16, 16);
    vc6::string fmt = g_stringDB->get(0x13d7);
    std::snprintf(buf, sizeof buf, fmt.c_str(), info_.rec[0], info_.rec[1]);
    h = winText_.get();
    h->setText(windowWiden(buf).c_str());
    windowHelpSetPosition(h, 8, 60);
    windowHelpSetSize(h, w_ - 16, 16);
    vc6::string deck = npcDeckName(npc_ + 10000);
    h = deckLabel_.get();
    windowHelpSetPosition(h, 8, 76);
    windowHelpSetSize(h, w_ - 16, 16);
    if (info_.rank <= 1)
        std::snprintf(buf, sizeof buf, "?????");
    else
        std::snprintf(buf, sizeof buf, "%s", deck.c_str());
    h = deckText_.get();
    h->setText(windowWiden(buf).c_str());
    windowHelpSetPosition(h, 8, 92);
    windowHelpSetSize(h, w_ - 16, 16);
    int32_t y = 108;
    int32_t cond = conditionText(npc_);
    h = rivalText_.get();
    if (cond != -1) {
        std::snprintf(buf, sizeof buf, "%s\n", g_stringDB->get(cond).c_str());
        condition_ = buf;
        windowHelpSetPosition(h, 8, 108);
        h->setText(windowWiden(condition_.c_str()).c_str());
        CWindowTaskText* t = windowHelpText(h);
        int32_t lines = t->lineCount(w_ - 16) * t->fontSize_;
        windowHelpSetSize(h, w_ - 16, static_cast<float>(lines));
        y = lines + 108;
        show(h);
    } else {
        hide(h);
    }
    windowHelpSetBackColor(condText_.get(), 1, 1, 1, 0.7f);
    hide(condText_.get());
    hide(duelButton_.get());
    hide(tradeButton_.get());
    hide(chatButton_.get());
    CWindowTaskBackPlane* b = back_.get();
    b->x_ = 8;
    b->y_ = static_cast<float>(y);
    b->pos_.x = 8;
    b->pos_.y = static_cast<float>(y);
    b->w_ = w_ - 16;
    b->h_ = 0;   // (y + 8) - y - 8
    b->layout();
    h_ = static_cast<float>(y + 8);
    CWindowTaskFrameThin* f = frame_.get();
    f->w_ = w_;
    f->h_ = h_;
    f->layout();
}

// @yo2 0x0089f790 CNpcListMenu::open: not in your own room, nor in the tournament lobby (rank 8), nor when already
// open (those just let the NPC go). At (0, 607 - height): the duel conversation's avatars come up and the NPC greets
// (line 0, or 5 once its PBIN record is set; the present NPCs offer theirs first). The exe reads the mouse when x or
// y is -1 and then doesn't use it.
void CNpcListMenu::open(int32_t npc, int32_t x, int32_t y) {
    if (!setNpc(npc)) return;
    CNetLobby* lobby = appNetLobby();
    if (lobby->ownRoom || lobby->rank == 8 || isVisible(true)) {
        releaseNpc();
        return;
    }
    unk528_ = 0;
    showInfo();
    int32_t mx = 0, my = 0;
    if (x == -1 || y == -1) windowMouseGetXY(&mx, &my);
    int32_t top = static_cast<int32_t>(kOpenBottom - h_);
    if (!g_gameCtrl.canEnter(0x13)) return;
    g_gameCtrl.enter(0x13);
    duelSetAvatarParts(1, avatar_.bytes_);
    int32_t line = 0;
    if ((npc_ == 0x36 || npc_ == 0x42 || npc_ == 0x4b) && !npcPresentDone(npc_)) {
        present_ = presentFor(npc_);
        state_ = PRESENT;
    } else {
        if (info_.rank == 0)
            lobby->itemGet(*appNetAccount(), 4, npc_);
        else
            line = 5;
        present_ = 0;
        state_ = ASK;
    }
    talkOpening(line, present_);
    x_ = pos_.x = 0;
    y_ = pos_.y = static_cast<float>(top);
    bringToFront();
    bringToFront();
    lockFlags_ &= ~2u;
    setDisp(true, true);
}

// The conversation as open() / openAfterDuel() start it: the NPC's avatar, then its line (or its present).
void CNpcListMenu::talkOpening(int32_t line, int32_t present) {
    lobbyFukiDictionary();
    duelAvaShowNpc(1, kAvatarZ, npc_);
    CTask* w = lobbyWaistUp(1);
    if (!w) return;
    Lock::clear(w);
    waistUpShow(w, true);
    waistUpReset(lobbyWaistUp(1));
    waistUpSetSpeaker(lobbyWaistUp(1), name_, 0, 0x5a);
    waistUpSetListener(lobbyWaistUp(1), myName());
    if (present == 0)
        waistUpSay(lobbyWaistUp(1), npc_, line);
    else
        waistUpSayPresent(lobbyWaistUp(1), present, 0, 5);
}

// @yo2 0x0089fc70 CNpcListMenu::openAfterDuel: the same window back after a duel with the NPC (not in rank 8), its
// line for the result (duelResultLine), then AFTER_DUEL
void CNpcListMenu::openAfterDuel(int32_t npc, int32_t x, int32_t y) {
    if (!setNpc(npc) || appNetLobby()->rank == 8) return;
    unk528_ = 0;
    showInfo();
    int32_t mx = 0, my = 0;
    if (x == -1 || y == -1) windowMouseGetXY(&mx, &my);
    int32_t top = static_cast<int32_t>(kOpenBottom - h_);
    duelSetAvatarParts(1, avatar_.bytes_);
    int32_t line = duelResultLine();
    talkOpening(line, 0);
    x_ = pos_.x = 0;
    y_ = pos_.y = static_cast<float>(top);
    bringToFront();
    bringToFront();
    lockFlags_ &= ~2u;
    setDisp(true, true);
    state_ = AFTER_DUEL;
}
