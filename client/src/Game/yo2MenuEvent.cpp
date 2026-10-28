// yo2Menu.cpp: the event lobby windows, CWindowModelGoEvent.
#include <string>

#include "Game/yo2GameCtrl.h"
#include "Game/yo2Menu.h"

namespace {
struct TaskLockBits : CTask {
    static uint32_t& of(CTask* t) { return t->*(&TaskLockBits::lockFlags_); }
};
void hide(CElement* e) {
    e->setDisp(false, true);
    TaskLockBits::of(e) |= 2u;
}
// The event's text by the menu bar's lobby rank (the first one stays for an unknown rank).
int32_t eventText(int32_t rank) {
    switch (rank) {
    case 1: case 0xd: return 0x1b73;
    case 5: case 0xf: return 0x1b7e;
    case 0x11: return 0x1b9b;
    case 0x15: return 0x1ba7;
    case 0xb: return 0x1b7c;
    case 7: return 0x1b86;
    default: return 0x1b73;
    }
}
}   // namespace

// @yo2 0x00a80b90 CWindowModelGoEvent::CWindowModelGoEvent
CWindowModelGoEvent::CWindowModelGoEvent() { setTaskName("イベントロビー移動ウィンドウ"); }

// @yo2 0x00a80eb0 CWindowModelGoEvent::create: only if CTRL_MOVE_MENU2 can be taken
CWindowModelGoEvent* CWindowModelGoEvent::create(CTask* parent, bool fromTournament) {
    if (!g_gameCtrl.enter(CTRL_MOVE_MENU2))
        return nullptr;
    auto* w = new CWindowModelGoEvent;
    w->fromTournament_ = fromTournament;
    w->setup(0, 0, 4000, 0xfa1, 1);
    return dynamic_cast<CWindowModelGoEvent*>(w->CTask::create(parent, 10000));
}

// @yo2 0x00a80d20 CWindowModelGoEvent::~CWindowModelGoEvent
// @yo2 0x00a80cf0 CWindowModelGoEvent deleting destructor
CWindowModelGoEvent::~CWindowModelGoEvent() = default;

// @yo2 0x00a80fc0 CWindowModelGoEvent::onInit: 300 wide, the event's text; below level 2 the yes / no buttons give
// way to an OK under the "level too low" text
bool CWindowModelGoEvent::onInit() {
    w_ = 300;
    textField_->setText(windowText(0x1b73).c_str());
    textField_->setText(windowText(eventText(menuBarEventRank())).c_str());
    if (fromTournament_ && menuBarEventSub() == 0xb)
        textField_->setText(windowText(0x1b7c).c_str());
    if (accountPlayerLevel() < 2) {
        std::u16string text{std::u16string_view(windowText(0x1b7d))};
        size_t at = text.find(u"%s");
        if (at != std::u16string::npos)
            text.replace(at, 2, u"Lv2");
        textField_->setText(text.c_str());
        hide(yes_);
        hide(no_);
        ok_.setUser(this);
        ok_.set(CWindowTaskTextSwitch::create(this, this));
        windowNameTask(ok_.task(), "レベルが低いから参加できないときのボタン");
        ok_->setTextId(0xfa2);
        ok_->setCentre(w_ * 0.5f, h_ - bandH_ * 0.5f);
        ok_->z_ = ok_->pos_.z = 3;
    }
    layout();
    centre();
    return true;
}

// @yo2 0x00a81dc0 CWindowModelGoEvent::onMain: false (destroyed) once the mode is gone or on a right click
bool CWindowModelGoEvent::onMain() { return g_gameCtrl.now() == CTRL_MOVE_MENU2 && !appMouseRightPushed(); }

// @yo2 0x00a81f10 CWindowModelGoEvent::onDestroy
void CWindowModelGoEvent::onDestroy() {
    g_gameCtrl.leave(CTRL_MOVE_MENU2);
    CWindowTaskModel::onDestroy();
}

// @yo2 0x00a81e00 CWindowModelGoEvent::onControlEvent: はい 4000, いいえ / OK 0xfa1 to the callback
void CWindowModelGoEvent::onControlEvent(CWindowTaskControll* sender) {
    bringToFront();
    if (!callback_)
        return;
    if (sender == yes_) {
        callback_->call(this, CALLBACK_MESSAGE_TYPE(0), 4000);
        appPlaySound(0x10000001, 0);
    } else if (sender == no_) {
        callback_->call(this, CALLBACK_MESSAGE_TYPE(0), 0xfa1);
        appPlaySound(0x10000002, 0);
    } else if (sender == ok_.task()) {
        callback_->call(this, CALLBACK_MESSAGE_TYPE(0), 0xfa1);
        appPlaySound(0x10000001, 0);
    }
    layout();
}
