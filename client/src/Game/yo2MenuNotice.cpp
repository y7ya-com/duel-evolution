// yo2Menu.cpp: the notice icons' base and constructors.
#include "Game/yo2MenuNotice.h"

// (inlined into every icon's create)
CNoticeIconBase::CNoticeIconBase() { setTaskName("通知アイコン"); }

// @yo2 0x00a79fc0 CNoticeIconBase::~CNoticeIconBase
// @yo2 0x00a79f90 CNoticeIconBase deleting destructor
CNoticeIconBase::~CNoticeIconBase() = default;

// @yo2 0x00a79c70 CNoticeIconBase::onMain: the press lasts one frame
bool CNoticeIconBase::onMain() {
    if (pressFrames_ < 1) {
        pressed_ = false;
        pressFrames_ = 0;
    }
    pressFrames_--;
    return true;
}

// @yo2 0x00a79c00 CNoticeIconBase::handleMessage: WM_LBUTTONDOWN
bool CNoticeIconBase::handleMessage(WindowMsg m) {
    if (m.msg != 0x201)
        return false;
    pressed_ = true;
    pressFrames_ = 1;
    mediator_->onControlEvent(this);
    return true;
}

// @yo2 0x00a79b20 CNoticeIconBase::hitTest: strictly inside 32 x 32 from the (truncated) world position
bool CNoticeIconBase::hitTest(float x, float y) {
    int32_t left = static_cast<int32_t>(worldTranslation().x);
    int32_t top = static_cast<int32_t>(worldTranslation().y);
    return static_cast<float>(left) < x && x < static_cast<float>(left + 32) && static_cast<float>(top) < y &&
           y < static_cast<float>(top + 32);
}

#define YO2_NOTICE_ICON(Name, title)                                            \
    Name::Name() { setTaskName(title); }                                        \
    Name* Name::create(CTask* parent, IWindowTaskMediator* mediator) {          \
        auto* i = new Name;                                                     \
        i->mediator_ = mediator;                                                \
        return dynamic_cast<Name*>(i->CTask::create(parent, 10000));            \
    }                                                                           \
    Name::~Name() = default;
// @yo2 0x00a7a8b0 CNoticeIconMail::create (the constructors inlined)
// @yo2 0x00a7ab60 CNoticeIconMail::~CNoticeIconMail
// @yo2 0x00a7ab30 CNoticeIconMail deleting destructor
YO2_NOTICE_ICON(CNoticeIconMail, "メール通知アイコン")
// @yo2 0x00a7b0d0 CNoticeIconFriend::create
// @yo2 0x00a7b380 CNoticeIconFriend::~CNoticeIconFriend
// @yo2 0x00a7b350 CNoticeIconFriend deleting destructor
YO2_NOTICE_ICON(CNoticeIconFriend, "フレンド申し込み通知アイコン")
// @yo2 0x00a7b8f0 CNoticeIconDuelroom::create
// @yo2 0x00a7bba0 CNoticeIconDuelroom::~CNoticeIconDuelroom
// @yo2 0x00a7bb70 CNoticeIconDuelroom deleting destructor
YO2_NOTICE_ICON(CNoticeIconDuelroom, "デュエルルーム作成アイコン")
// @yo2 0x00a7c110 CNoticeIconOffer::create
// @yo2 0x00a7c3c0 CNoticeIconOffer::~CNoticeIconOffer
// @yo2 0x00a7c390 CNoticeIconOffer deleting destructor
YO2_NOTICE_ICON(CNoticeIconOffer, "デュエル申し込みアイコン")
// @yo2 0x00a7c930 CNoticeIconEvent::create
// @yo2 0x00a7cbe0 CNoticeIconEvent::~CNoticeIconEvent
// @yo2 0x00a7cbb0 CNoticeIconEvent deleting destructor
YO2_NOTICE_ICON(CNoticeIconEvent, "イベント情報アイコン")
// @yo2 0x00a7d150 CNoticeIconTour::create
// @yo2 0x00a7d400 CNoticeIconTour::~CNoticeIconTour
// @yo2 0x00a7d3d0 CNoticeIconTour deleting destructor
YO2_NOTICE_ICON(CNoticeIconTour, "大会情報アイコン")
// @yo2 0x00a7d970 CNoticeIconTeam::create
// @yo2 0x00a7dc20 CNoticeIconTeam::~CNoticeIconTeam
// @yo2 0x00a7dbf0 CNoticeIconTeam deleting destructor
YO2_NOTICE_ICON(CNoticeIconTeam, "チーム申し込み通知アイコン")
#undef YO2_NOTICE_ICON

// @yo2 0x00a79cb0 CNoticeIconMaintenance::create (the constructors inlined)
CNoticeIconMaintenance* CNoticeIconMaintenance::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* i = new CNoticeIconMaintenance;
    i->mediator_ = mediator;
    return dynamic_cast<CNoticeIconMaintenance*>(i->CTask::create(parent, 10000));
}

CNoticeIconMaintenance::CNoticeIconMaintenance() { setTaskName("メンテ通知アイコン"); }

// @yo2 0x00a7a060 CNoticeIconMaintenance::~CNoticeIconMaintenance
// @yo2 0x00a7a030 CNoticeIconMaintenance deleting destructor
CNoticeIconMaintenance::~CNoticeIconMaintenance() = default;
