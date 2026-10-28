// CPlayerListMenu (the exe's src\Lobby\yo2playerListDlg.cpp).
#include "Lobby/yo2PlayerListMenu.h"

#include <cstdio>
#include <cstring>

#include "Game/yo2TgtAvaListDlg.h"
#include "Lobby/yo2LobbyExtern.h"
#include "Net/NetLobby_Social.h"
#include "Net/NetUi.h"
#include "System/window/yo2UGDialogBase.h"
#include "System/yo2StringDB.h"

namespace {
constexpr float kAlpha = 0.9f;      // 0x00bee924
constexpr float kScreenW = 1024;    // 0x00be8680
constexpr float kOpenBottom = 607;  // 0x00beeae4
constexpr float kAvatarZ = 31730;   // 0x46f7e400

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

bool duelling(int32_t state) { return (state >= 0x67 && state <= 0x6a) || state == 0x98; }
// The states in which a player can't be asked for anything: duelling, 0x66, 100, 101.
bool busy(int32_t state) { return duelling(state) || state == 0x66 || state == 100 || state == 0x65; }

vc6::string text(uint32_t id) { return g_stringDB->get(id); }
template <class... A>
vc6::string format(const char* fmt, A... a) {
    char buf[0x400];
    std::snprintf(buf, sizeof buf, fmt, a...);
    return buf;
}

CWindowTaskControll* makeHelp(CTaskPtr<CWindowTaskControll>& to, CPlayerListMenu* w, const char* name) {
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
void place(CWindowTaskControll* h, float x, float y, float w, float hh) {
    windowHelpSetPosition(h, x, y);
    windowHelpSetSize(h, w, hh);
}
// 0x005e99d0 (CWindowTaskSwitch::setPosition, inline)
void placeButton(CWindowTaskTextSwitch* b, float x, float y) {
    b->x_ = x;
    b->y_ = y;
    b->pos_.x = x;
    b->pos_.y = y;
}
}  // namespace

// @yo2 0x0089a390 CDuelRoomList::findByPlayer (inline): the room `pid` is the owner or challenger of
CDuelRoom* lobbyRoomOf(CNetLobby* lobby, int32_t pid) {
    for (auto& r : lobby->rooms)
        if (r->p1 == pid || r->p2 == pid) return r.get();
    return nullptr;
}

// @yo2 0x0088ef50 CPlayerListMenu::create (priority 10000)
CPlayerListMenu* CPlayerListMenu::create(CTask* parent) {
    return dynamic_cast<CPlayerListMenu*>((new CPlayerListMenu)->CTask::create(parent, 10000));
}

// @yo2 0x0088f010 CPlayerListMenu::CPlayerListMenu
// @yo2 0x008a0480 CTaskPtr<CWindowTaskHelp>::CTaskPtr (an inlined copy)
// @yo2 0x008a0450 CTaskPtr<CWindowTaskBackPlane>::CTaskPtr (an inlined copy)
// @yo2 0x008a0770 vector<int>::vector (unk5a8_, std::vector here)
CPlayerListMenu::CPlayerListMenu() { setTaskName("CPlayerListMenu"); }

// @yo2 0x0088f6a0 CPlayerListMenu deleting destructor
// @yo2 0x0088f6d0 CPlayerListMenu::~CPlayerListMenu
CPlayerListMenu::~CPlayerListMenu() = default;

// @yo2 0x0088fa40 CPlayerListMenu::onInit: 336 x 100 at the mouse (z 10), the texts, the eleven buttons and the flag
bool CPlayerListMenu::onInit() {
    inheritTransform_ = true;
    h_ = 100;
    w_ = 336;
    int32_t mx = 0, my = 0;
    windowMouseGetXY(&mx, &my);
    pos_.z = 10;
    pos_.x = static_cast<float>(mx);
    pos_.y = static_cast<float>(my);
    frame_.setUser(this);
    frame_.set(CWindowTaskFrameThin::create(this, this, 3));
    frame_->setAlpha(kAlpha);

    CWindowTaskControll* h = makeHelp(nameText_, this, "CPlayerListMenuのレベル＆名前表示");
    windowHelpText(h)->setAlign(CWindowTaskText::CENTRE);
    windowHelpText(h)->setField430(0);
    windowHelpText(h)->setColor(1, 0, 0, 1);
    helpAtZero(h);
    h->setAlpha(kAlpha);

    h = makeHelp(titleLabel_, this, "CPlayerListMenuの『称号：』テキスト");
    h->setTextId(0x232e);
    windowHelpText(h)->setAlign(CWindowTaskText::LEFT);
    windowHelpSetBackColor(h, 0.8f, 0.8f, 0.8f, kAlpha);
    helpAtZero(h);

    h = makeHelp(titleText_, this, "CPlayerListMenの称号テキスト");
    windowHelpText(h)->setAlign(CWindowTaskText::RIGHT);
    windowHelpSetBackColor(h, 0.8f, 0.8f, 0.8f, kAlpha);
    helpAtZero(h);

    h = makeHelp(winLabel_, this, "CPlayerListMenuの『勝率：』テキスト");
    h->setTextId(0x2331);
    windowHelpText(h)->setAlign(CWindowTaskText::LEFT);
    helpAtZero(h);
    h->setAlpha(kAlpha);

    h = makeHelp(winText_, this, "CPlayerListMenuの勝率テキスト");
    windowHelpText(h)->setAlign(CWindowTaskText::RIGHT);
    helpAtZero(h);
    h->setAlpha(kAlpha);

    h = makeHelp(commentLabel_, this, "CPlayerListMenuの『コメント:』テキスト");
    windowHelpSetBackColor(h, 0.8f, 0.8f, 0.8f, kAlpha);
    h->setTextId(0x13d8);
    windowHelpText(h)->setAlign(CWindowTaskText::LEFT);
    helpAtZero(h);

    h = makeHelp(commentText_, this, "CPlayerListMenuのコメントテキスト");
    windowHelpSetBackColor(h, 0.8f, 0.8f, 0.8f, kAlpha);
    windowHelpText(h)->setAlign(CWindowTaskText::RIGHT);
    helpAtZero(h);

    h = makeHelp(rivalLabel_, this, "CPlayerListMenuの『対戦相手』テキスト");
    h->setTextId(0x13e6);
    windowHelpText(h)->setAlign(CWindowTaskText::LEFT);
    helpAtZero(h);
    h->setAlpha(kAlpha);

    h = makeHelp(rivalText_, this, "CPlayerListMenuの対戦相手テキスト");
    windowHelpText(h)->setAlign(CWindowTaskText::RIGHT);
    helpAtZero(h);
    h->setAlpha(kAlpha);

    h = makeHelp(condText_, this, "CPlayerListMenuのデュエル条件テキスト");
    helpAtZero(h);
    h->setAlpha(kAlpha);

    back_.setUser(this);
    back_.set(CWindowTaskBackPlane::create(this, this));
    windowNameTask(back_.task(), "CPlayerListMenuの背景");
    back_->inheritTransform_ = true;
    back_->z_ = 0;
    back_->pos_.z = 0;
    back_->setAlpha(kAlpha);

    static const struct {
        const char* name;
        int32_t textId;
    } kButtons[BUTTON_COUNT] = {{"デュエル申し込みボタン", 0x13d0}, {"フレンド申し込みボタン", 0x13d1},
                                {"フレンド削除ボタン", 0x148c},     {"トレード申し込みボタン", 0x13d2},
                                {"チャットメッセージボタン", 0x13d3}, {"ブラックリストボタン", 0x13d4},
                                {"ブラックリスト消去ボタン", 0x148d}, {"メール送信ボタン", 0x13d5},
                                {"\t観戦ボタン", 0x13d6},           {"近くに飛ぶボタン", 0x148e},
                                {"チームに誘うボタン", 0x14c7}};
    for (int i = 0; i < BUTTON_COUNT; i++) {
        buttons_[i].setUser(this);
        buttons_[i].set(CWindowTaskTextSwitch::create(this, this));
        windowNameTask(buttons_[i].task(), kButtons[i].name);
        CWindowTaskTextSwitch* b = buttons_[i].get();
        b->inheritTransform_ = true;
        b->minW_ = 288;   // 0x00801e00, inline: the button's minimum size, then layout
        b->unk5b4_ = 24;
        b->layout();
        b->z_ = 2;
        b->pos_.z = 2;
        b->setTextId(kButtons[i].textId);
    }

    level_ = wins_ = losses_ = 0;
    unk570_ = 0;
    condA_ = 0;
    condB_ = 0;
    condWatch_ = 1;
    unk578_ = 0;
    armed_ = false;
    modal_ = true;
    lobbyMouseFlush();
    setTopmost(true);
    layout();
    waistUp_.setUser(this);
    std::memset(pressed_, 0, sizeof pressed_);
    flag_.setUser(this);
    flag_.set(lobbyNationFlagCreate(this, 10000));
    YO2_ASSERT(flag_.task(), "error CPlayerListMenu::m_pNationFlag::Create()");
    flag_.get()->setInstName("Duel国旗");
    flag_->pos_ = {0, 0, 31729};
    flag_->inheritTransform_ = true;
    return true;
}

// @yo2 0x0089a850 CPlayerListMenu::layout: the frame around the window
void CPlayerListMenu::layout() {
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

// @yo2 0x00893a00 CPlayerListMenu::onMain: a right click, or a left click outside once armed, closes it
bool CPlayerListMenu::onMain() {
    int32_t w = static_cast<int32_t>(w_), h = static_cast<int32_t>(h_);
    int32_t mx = 0, my = 0;
    windowMouseGetXY(&mx, &my);
    Vec3 at = frame_->worldTranslation();
    if (!isVisible(false)) return true;
    if (!windowMouseLeftPushed() && isVisible(true)) armed_ = true;
    if (lobbyMouseRightPushed()) {
        armed_ = false;
        close(false);
    }
    float fx = static_cast<float>(mx), fy = static_cast<float>(my);
    if (at.x < fx && at.y < fy && fx < static_cast<float>(w) + at.x && fy < static_cast<float>(h) + at.y)
        return true;
    if (windowMouseLeftPushed() && armed_) {
        armed_ = false;
        close(false);
    }
    return true;
}

// @yo2 0x00893bc0 CPlayerListMenu::onControlEvent: the click sound, then the button's job
void CPlayerListMenu::onControlEvent(CWindowTaskControll* sender) {
    for (int i = 0; i < BUTTON_COUNT; i++) {
        if (sender != buttons_[i].get()) continue;
        appPlaySound(0x10000001, 0);
        switch (i) {
        case DUEL: press(P_DUEL, true); break;
        case FRIEND_ADD: press(P_FRIEND_ADD, false); break;
        case FRIEND_DEL: press(P_FRIEND_DEL, false); break;
        case TRADE: press(P_TRADE, true); break;
        case CHAT: chatTo(); break;
        case BLACK: press(P_BLACK, false); break;
        case BLACK_DEL: press(P_BLACK_DEL, false); break;
        case MAIL: press(P_MAIL, false); break;
        case WATCH: press(P_WATCH, false); break;
        case JUMP: press(P_JUMP, false); break;
        case TEAM:
            pressed_[P_TEAM] = true;
            teamInvitePid_ = pid_;
            close(false);
            break;
        }
        return;
    }
}

// @yo2 0x0089a460 CPlayerListMenu::pressDuel
// @yo2 0x0089a480 CPlayerListMenu::pressFriendAdd
// @yo2 0x0089a4a0 CPlayerListMenu::pressFriendDel
// @yo2 0x0089a4c0 CPlayerListMenu::pressTrade
// @yo2 0x0089a780 CPlayerListMenu::pressBlack
// @yo2 0x0089a7a0 CPlayerListMenu::pressBlackDel
// @yo2 0x0089a7c0 CPlayerListMenu::pressMail
// @yo2 0x0089a7e0 CPlayerListMenu::pressWatch
// @yo2 0x0089a800 CPlayerListMenu::pressJump
// @yo2 0x0089a820 CPlayerListMenu::pressTeam (in onControlEvent: it also keeps the player to invite)
void CPlayerListMenu::press(int32_t flag, bool keepAvatars) {
    pressed_[flag] = true;
    close(keepAvatars);
}

// @yo2 0x0089ad30 CPlayerListMenu::close
void CPlayerListMenu::close(bool keepAvatars) {
    if (!keepAvatars) duelAvaHide(1);
    g_gameCtrl.leave(0x13);
    setDisp(false, true);
    lockFlags_ |= 2;
}

// @yo2 0x0089a4e0 CPlayerListMenu::chatTo: "/<name> " into the chat window, its input focused
void CPlayerListMenu::chatTo() {
    std::u16string line = u"/";
    for (const COnlinePlayer& p : appNetLobby()->players) {
        if (p.pid != pid_) continue;
        line += std::u16string_view(windowWiden(playerNameString(p).c_str()));
        line += u" ";
        CWindowTaskModel* chat = lobbyChatWindow();
        chatWindowSetText(chat, line.c_str());
        chatWindowSetCursor(lobbyChatWindow(), static_cast<int32_t>(line.size()), 0);
        close(false);
        lobbyChatWindow()->bringToFront();
        g_windowFactory->setFocus(chatWindowInput(lobbyChatWindow()));
        break;
    }
}

// @yo2 0x0089a920 CPlayerListMenu::openFor (at the mouse)
bool CPlayerListMenu::openFor(int32_t pid) { return openFor(pid, -1, -1); }

// @yo2 0x0089a950 CPlayerListMenu::openFor
bool CPlayerListMenu::openFor(int32_t pid, int32_t x, int32_t y) {
    if (!findAndSet(pid)) return false;
    open(x, y);
    return true;
}

// @yo2 0x0089ada0 CPlayerListMenu::findAndSet: the lobby's player with `pid`
bool CPlayerListMenu::findAndSet(int32_t pid) {
    for (const COnlinePlayer& p : appNetLobby()->players)
        if (p.pid == pid) {
            setPlayer(&p);
            return true;
        }
    return false;
}

// @yo2 0x0089b290 CPlayerListMenu::setPlayer: what the menu shows of a lobby player
void CPlayerListMenu::setPlayer(const COnlinePlayer* p) {
    if (p) {
        roomLocked_ = 0;
        pid_ = p->pid;
        level_ = p->level;
        wins_ = p->w0b0[1];
        losses_ = p->w0b0[5];
        name_ = playerNameString(*p).c_str();
        title_ = lobbyTitleName(p->titleId);
        state_ = p->state;
        teamName_.assign(p->teamName, strnlen(p->teamName, sizeof p->teamName));
        std::memcpy(teamCode_, p->teamCode, sizeof teamCode_);
        comment_ = (state_ < 100 || state_ > 0x6a) ? p->comment : p->title;   // in a duel: the second line
        rivalName_ = p->duelName;
        rivalLevel_ = p->duelLevel;
        rivalTitle_ = lobbyTitleName(p->duelStats[2]);
        rivalWins_ = p->duelStats[0];
        rivalLosses_ = p->duelStats[1];
        country_.assign(p->country, strnlen(p->country, sizeof p->country));
    }
    layout();
}

// @yo2 0x0089ae10 CPlayerListMenu::setPlayer (a row of the player list dialog)
void CPlayerListMenu::setPlayer(const PlayerListEntry* e) {
    if (e) {
        roomLocked_ = 0;
        pid_ = e->pid;
        level_ = e->level;
        wins_ = e->wins;
        losses_ = e->losses;
        name_ = e->name;
        title_ = lobbyTitleName(static_cast<uint16_t>(e->title));
        comment_ = e->comment;
        state_ = e->state;
        rivalName_ = e->rivalName;
        rivalLevel_ = e->rivalLevel;
        rivalTitle_ = lobbyTitleName(static_cast<uint16_t>(e->rivalTitle));
        rivalWins_ = e->rivalWins;
        rivalLosses_ = e->rivalLosses;
        country_ = e->country;
        teamName_ = e->teamName;
        std::memcpy(teamCode_, e->teamCode, sizeof teamCode_);
    }
    layout();
}

// @yo2 0x0089a990 CPlayerListMenu::open: not in the tournament lobby (rank 8). Centred on the mouse when x or y is
// -1 (32 pixels above it), kept left of 1024 and above 607; the duel conversation's avatar shows the player.
void CPlayerListMenu::open(int32_t x, int32_t y) {
    CNetLobby* lobby = appNetLobby();
    if (lobby->rank == 8) return;
    armed_ = false;
    showInfo(0, 0);
    if (x == -1 || y == -1) {
        int32_t mx = 0, my = 0;
        windowMouseGetXY(&mx, &my);
        x = static_cast<int32_t>(static_cast<float>(mx) - w_ * 0.5f);
        y = my - 32;
    }
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (static_cast<float>(x) + w_ > kScreenW) x = static_cast<int32_t>(kScreenW - w_);
    if (static_cast<float>(y) + h_ > kOpenBottom) y = static_cast<int32_t>(kOpenBottom - h_);
    if (waistUp_.task()) waistUp_.get()->destroy(__FILE__, 0x7cd);
    if (!g_gameCtrl.canEnter(0x13)) return;
    g_gameCtrl.enter(0x13);
    const COnlinePlayer* p = nullptr;
    for (const COnlinePlayer& q : lobby->players)
        if (q.pid == pid_) {
            p = &q;
            break;
        }
    if (!p) return;
    duelSetAvatarParts(1, p->avatar[appClothType()].bytes_);
    duelAvaShowNpc(1, kAvatarZ, -1);
    if (CTask* w = lobbyWaistUp(1)) {
        Lock::clear(w);
        waistUpShow(lobbyWaistUp(1), true);
        waistUpReset(lobbyWaistUp(1));
    }
    x_ = pos_.x = static_cast<float>(x);
    y_ = pos_.y = static_cast<float>(y);
    bringToFront();
    bringToFront();
    lockFlags_ &= ~2u;
    setDisp(true, true);
}

// @yo2 0x00893ff0 CPlayerListMenu::showInfo: the texts top to bottom, then the buttons that apply, the window as
// tall as that
// @yo2 0x008a04b0 vector<TeamMember>::size (std::vector here)
void CPlayerListMenu::showInfo(int32_t, int32_t) {
    CNetLobby* lobby = appNetLobby();
    float tw = w_ - 16;
    pressed_[P_DUEL] = false;
    buttonCount_ = 0;
    vc6::string s = format("%s%02d  %8s\n%s", text(0x2328).c_str(), level_, name_.c_str(), teamName_.c_str());
    nameText_->setText(windowWiden(s.c_str()).c_str());
    place(nameText_.get(), 8, 8, tw, 36);
    place(titleLabel_.get(), 8, 44, tw, 16);
    titleText_->setText(windowWiden(format("%s", title_.c_str()).c_str()).c_str());
    place(titleText_.get(), 8, 60, tw, 16);
    place(winLabel_.get(), 8, 76, tw, 16);
    winText_->setText(windowWiden(format(text(0x13d7).c_str(), wins_, losses_).c_str()).c_str());
    place(winText_.get(), 8, 92, tw, 16);
    place(commentLabel_.get(), 8, 108, tw, 16);
    commentText_->setText(windowWiden(format("%s", comment_.c_str()).c_str()).c_str());
    place(commentText_.get(), 8, 124, tw, 16);
    hide(rivalLabel_.get());
    hide(rivalText_.get());
    windowHelpSetBackColor(condText_.get(), 1, 1, 1, 0.7f);

    // who they're duelling
    int32_t y = 140;
    if (duelling(state_)) {
        show(rivalLabel_.get());
        place(rivalLabel_.get(), 8, 140, tw, 16);
        show(rivalText_.get());
        windowHelpSetPosition(rivalText_.get(), 8, 156);
        std::string rival;
        bool known = rivalLevel_ != 0;
        rivalLabel_->setTextId(0x13e6);
        if (!known) {
            rival += "-----\n";
        } else {
            rival += format("%s%02d  %8s\n", text(0x2328).c_str(), rivalLevel_, rivalName_.c_str()).c_str();
            rival += format("%s:%s\n", text(0x232e).c_str(), rivalTitle_.c_str()).c_str();
            rival += std::string(format(text(0x13d7).c_str(), rivalWins_, rivalLosses_).c_str()) + "\n";
        }
        if (lobby->rank == 0x14)   // the tournament lobby: the room shows whether it can be watched
            for (auto& r : lobby->rooms)
                if (r->p1 == pid_ || r->p2 == pid_) {
                    r->wmode = known;
                    break;
                }
        rivalText_->setText(windowWiden(rival.c_str()).c_str());
        CWindowTaskText* t = windowHelpText(rivalText_.get());
        windowHelpSetSize(rivalText_.get(), tw, static_cast<float>(windowTextHeight(t, static_cast<int32_t>(tw))));
        y = windowTextHeight(t, static_cast<int32_t>(tw)) + 156;
        windowHelpSetBackColor(condText_.get(), 0.8f, 0.8f, 0.8f, kAlpha);
    }

    // everything below starts hidden
    condText_->setDisp(false, true);
    Lock::set(condText_.get());
    for (int i = DUEL; i <= MAIL; i++) {
        buttons_[i]->setDisp(false, true);
        Lock::set(buttons_[i].get());
    }
    hide(buttons_[WATCH].get());
    hide(buttons_[JUMP].get());
    hide(buttons_[TEAM].get());

    // the room they're in: its conditions (and the duel button, when they wait for an opponent)
    int32_t top = y;
    CDuelRoom* room = nullptr;
    if (!lobbyGameOption(0xc0) && (room = lobbyRoomOf(lobby, pid_)) != nullptr) {
        roomId_ = room->id;
        roomP1_ = room->p1;
        roomP2_ = room->p2;
        roomKind_ = room->dstyle;
        roomLocked_ = room->locked;
        show(condText_.get());
        std::string cond;
        auto line = [&](uint32_t id) { cond += std::string(text(id).c_str()) + "\n"; };
        switch (roomKind_) {
        case 3: line(0x13c0); break;
        case 4: case 5: line(0x13bf); break;
        default: line(0x13df); break;   // 6 and the rest
        }
        if (room->x[0] == 0) {
            condA_ = 0;
            line(0x13da);
        } else if (room->x[0] == 1) {
            condA_ = 1;
            line(0x13d9);
        }
        if (room->x[1] == 0) {
            condB_ = 0;
            line(0x13dc);
        } else if (room->x[1] == 1) {
            condB_ = 1;
            line(0x13db);
        }
        if (room->wmode == 0) {
            condWatch_ = 0;
            line(0x13c2);
        } else if (room->wmode == 1) {
            if (roomKind_ == 6) {
                condWatch_ = 0;
                line(0x13c2);
            } else {
                condWatch_ = 1;
                line(0x13c1);
            }
        }
        line(room->x[2] == 0 ? 0x13cd : 0x13cc);
        condText_->setText(windowWiden(cond.c_str()).c_str());
        CWindowTaskText* t = windowHelpText(condText_.get());
        windowHelpSetPosition(condText_.get(), 8, static_cast<float>(y));
        windowHelpSetSize(condText_.get(), tw, static_cast<float>(windowTextHeight(t, static_cast<int32_t>(tw))));
        y += windowTextHeight(t, static_cast<int32_t>(tw));
        top = y;
        if (!lobby->ownRoom) {
            if (state_ == 100 || state_ == 0x65) {
                show(buttons_[DUEL].get());
                placeButton(buttons_[DUEL].get(), 24, static_cast<float>(y + 8));
                y += 36;
                buttonList_[buttonCount_++] = DUEL;
            } else {
                hide(buttons_[DUEL].get());
            }
        }
    }
    y += 8;
    auto add = [&](int32_t b) {
        show(buttons_[b].get());
        placeButton(buttons_[b].get(), 24, static_cast<float>(y));
        buttonList_[buttonCount_++] = b;
    };
    if (!lobbyGameOption(0xc8) && (buttonMask_ & BTN_FRIEND) && !lobbyBlackListContains(pid_) && !lobby->ownRoom &&
        !busy(state_) && state_ != 0x98) {
        if (!lobbyFriendListContains(pid_)) {
            show(buttons_[FRIEND_ADD].get());
            hide(buttons_[FRIEND_DEL].get());
            placeButton(buttons_[FRIEND_ADD].get(), 24, static_cast<float>(y));
            buttonList_[buttonCount_++] = FRIEND_ADD;
        }
        y += 36;
    }
    if (!lobbyGameOption(0xd0) && (buttonMask_ & BTN_TRADE) && lobby->rank != 1 && !lobby->ownRoom && !busy(state_)) {
        add(TRADE);
        y += 36;
    }
    if (!lobbyGameOption(0xc4) && (buttonMask_ & BTN_CHAT) && !lobbyBlackListContains(pid_) && state_ != 0x67 &&
        state_ != 0x68 && state_ != 0x98) {
        add(CHAT);
        y += 36;
    }
    if (!lobbyGameOption(0xcc) && (buttonMask_ & BTN_BLACK) && !lobby->ownRoom) {
        bool listed = lobbyBlackListContains(pid_);
        show(buttons_[listed ? BLACK_DEL : BLACK].get());
        hide(buttons_[listed ? BLACK : BLACK_DEL].get());
        placeButton(buttons_[listed ? BLACK_DEL : BLACK].get(), 24, static_cast<float>(y));
        buttonList_[buttonCount_++] = listed ? BLACK_DEL : BLACK;
        y += 36;
    }
    if ((buttonMask_ & BTN_WATCH) && !lobby->ownRoom) {
        CDuelRoom* r = lobbyRoomOf(lobby, pid_);
        if (condWatch_ && r && duelling(state_) && roomKind_ != 6) {
            add(WATCH);
            y += 36;
        }
    }
    if ((buttonMask_ & BTN_JUMP) && !lobby->ownRoom) {
        add(JUMP);
        y += 36;
    }
    if ((buttonMask_ & BTN_TEAM) && !lobby->ownRoom && !busy(state_) && state_ != 0x98 && lobby->inTeam &&
        (lobby->myTeamAuthority & 4) && lobby->teamMembers.size() < 100 && teamName_ == "") {
        add(TEAM);
        y += 36;
    }

    lobbyNationFlagSet(flag_.get(), country_, 1);
    flag_->pos_ = {8, 8, 10};
    CWindowTaskBackPlane* b = back_.get();
    b->x_ = 8;
    b->y_ = static_cast<float>(top);
    b->pos_.x = 8;
    b->pos_.y = static_cast<float>(top);
    b->w_ = tw;
    b->h_ = static_cast<float>(y - top - 8);
    b->layout();
    h_ = static_cast<float>(y);
    CWindowTaskFrameThin* f = frame_.get();
    f->w_ = w_;
    f->h_ = h_;
    f->layout();
}
