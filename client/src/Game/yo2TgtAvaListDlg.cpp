#include "Game/yo2TgtAvaListDlg.h"

#include <cstring>
#include <vector>

#include "Game/Avatar/yo2ChibiAvatar.h"
#include "Game/Avatar/yo2ChibiAvatarElm.h"
#include "Game/Avatar/yo2ChibiAvatarManager.h"
#include "Game/Avatar/yo2PlChibiAvatar.h"
#include "Game/yo2GameManager.h"
#include "Game/yo2TgtAvaListExtern.h"
#include "System/window/yo2WindowDialogs.h"
#include "System/yo2SceneManager.h"

// @yo2 0x00ad9b90 CTgtAvaListDlg::CTgtAvaListDlg
CTgtAvaListDlg::CTgtAvaListDlg() {
    setTaskName("CTgtAvaListDlg");
    list_.setUser(this);
    avatarMng_.setUser(this);
    target_.setUser(this);
}

// @yo2 0x00ad9db0 CTgtAvaListDlg::~CTgtAvaListDlg
// @yo2 0x00ad9d60 CTgtAvaListDlg deleting destructor
CTgtAvaListDlg::~CTgtAvaListDlg() = default;

namespace {
struct TaskLockBits : CTask {
    static uint32_t& of(CTask* t) { return t->*(&TaskLockBits::lockFlags_); }
};
}   // namespace

// @yo2 0x00ad8ec0 CTgtAvaListDlg::create
CTgtAvaListDlg* CTgtAvaListDlg::create(CTask* parent, uint32_t priority, uint32_t flags, CChibiAvatarMng* mng) {
    auto* d = new CTgtAvaListDlg;
    d->flags_ = flags;
    d->avatarMng_.set(mng);
    return dynamic_cast<CTgtAvaListDlg*>(d->CTask::create(parent, priority));
}

// @yo2 0x00ad9e80 CTgtAvaListDlg::onInit: the (hidden) list window "クリックしたアバターのリストダイアログ", titled 0x13e5
bool CTgtAvaListDlg::onInit() {
    list_.set(CWindowModelList::create(chibiMngLayer(avatarMng_.get()), 0, 0));
    YO2_ASSERT(list_.task(), "error CTgtAvaListDlg::m_pDlg::Create()");
    list_->setInstName("クリックしたアバターのリストダイアログ");
    list_->setText(windowText(0x13e5).c_str());
    list_->setDisp(false, true);
    TaskLockBits::of(list_.get()) |= 2u;
    return true;
}

// @yo2 0x00ada5b0 CTgtAvaListDlg::onMain: a right click or the × closes the list; a pick targets the avatar
// (CLOSE_ON_PICK closes the list, OPEN_INFO opens the player's info or talks to the NPC)
bool CTgtAvaListDlg::onMain() {
    if (g_gameCtrl.now() != CTRL_AVATAR_LIST || appMouseRightPushed() || list_->closeRequested_)
        close();
    int32_t picked = list_->list_->clicked_;
    if (picked < 0)
        return true;
    target_.set(avatars_[picked]);
    if (flags_ & CLOSE_ON_PICK)
        close();
    if (!(flags_ & OPEN_INFO))
        return true;
    CChibiAvatar* t = target_.get();
    if (t->kind_ == CChibiAvatar::KIND_PLAYER)
        playerInfoOpen(static_cast<uint32_t>(static_cast<CPlChibiAvatar*>(t)->pid_));
    else if (t->kind_ == CChibiAvatar::KIND_NPC)
        npcTalkOpen(npcAvatarId(t));
    return true;
}

// @yo2 0x00ada780 CTgtAvaListDlg::onDestroy
void CTgtAvaListDlg::onDestroy() {
    close();
    g_gameCtrl.leave(CTRL_AVATAR_LIST);
    if (list_.task())
        list_->destroy(__FILE__, __LINE__);
}

// @yo2 0x00ad9a00 CTgtAvaListDlg::close: the avatars' highlight off (and the NPCs' mark, unless one is the target),
// TM_MAIN off, the mode left, the list hidden
void CTgtAvaListDlg::close() {
    for (CChibiAvatar* a : avatars_) {
        CChibiAvatarElm* e = a->elm();
        if (!e)
            continue;
        e->color_[0] = e->color_[1] = e->color_[2] = e->color_[3] = 1;
        if (!target_.task() && a->kind_ == CChibiAvatar::KIND_NPC)
            npcAvatarSetMarked(a, false);
    }
    TaskLockBits::of(this) |= 1u;
    g_gameCtrl.leave(CTRL_AVATAR_LIST);
    if (list_.task() && list_.get() && list_->isVisible(false)) {
        list_->setDisp(false, true);
        TaskLockBits::of(list_.get()) |= 2u;
    }
}

// @yo2 0x00ad90d0 CTgtAvaListDlg::open: the list under the cursor; each avatar highlighted, each NPC marked, turned
// toward the player (on the area map) and remembered in the game's room entries
// @yo2 0x00adaa90 vector<CChibiAvatar*>::capacity (avatars_ = found: vc6::vector's own growth)
// @yo2 0x00ada7f0 vector<CChibiAvatar*>::_Tidy (the collected vector, freed by std::vector)
bool CTgtAvaListDlg::open(int32_t x, int32_t y, int32_t wx, int32_t wy, CChibiAvatar* exclude) {
    if (!g_gameCtrl.canEnter(CTRL_AVATAR_LIST))
        return false;
    target_.set(nullptr);
    std::vector<CChibiAvatar*> found;
    chibiMngCollectAt(avatarMng_.get(), wx, wy, &found);
    CChibiAvatar** begin = found.data();
    CChibiAvatar** end = begin + found.size();
    CChibiAvatar** it = avatarFind(begin, end, exclude);
    if (it != end)
        it = avatarRemoveCopy(it + 1, end, it, exclude);
    found.resize(static_cast<size_t>(it - begin));
    if (found.empty())
        return false;
    close();
    avatars_.clear();
    for (CChibiAvatar* a : found)
        avatars_.push_back(a);
    g_gameCtrl.enter(CTRL_AVATAR_LIST);
    CWindowModelList* l = list_.get();
    l->setPos(static_cast<float>(x - 120), static_cast<float>(y - 30));
    l->bringToFront();
    TaskLockBits::of(l) &= ~2u;
    l->setDisp(true, true);
    l->bringToFront();
    l->clear();
    l->reset();
    l->closeRequested_ = false;
    for (CChibiAvatar* a : avatars_) {
        CChibiAvatarElm* e = a->elm();
        e->color_[0] = 1, e->color_[1] = 0.8f, e->color_[2] = 0.5f, e->color_[3] = 1;
        l->addItem(a->name().c_str());
        if (a->kind_ != CChibiAvatar::KIND_NPC)
            continue;
        npcAvatarSetMarked(a, true);
        CSceneTask* scene = CSceneMng::instance()->scene();
        CChibiAvatar* me = scene ? areaMapMyAvatar(scene) : nullptr;
        if (me)
            a->elm_.get()->setDirection(CChibiAvatarElm::dirFromVector(me->elm()->pos_ - e->pos_));
        int32_t at[3];
        static_assert(sizeof at == sizeof e->pos_, "the room entry keeps the position's three floats");
        std::memcpy(at, &e->pos_, sizeof at);
        g_gameMng->setRoomEntry(npcAvatarId(a), at, static_cast<uint8_t>(e->dir_));
    }
    TaskLockBits::of(this) &= ~1u;
    return true;
}
