// yo2Menu.cpp: the menu bar's notice icons (mail, friend requests, duel offers, events, tournaments, maintenance...).
// Each is a 32 x 32 control playing a SWF icon (CSwfEngine); a click tells its window. What each icon shows and when
// (its onInit / onMain) is not on the traced path yet: only the base and the constructors are here.
#pragma once
#include <cstdint>

#include "Game/yo2HelpText.h"
#include "System/window/yo2WindowTask.h"

class CSwfEngine;   // TODO(Swf)

class CNoticeIconBase : public CWindowTaskControll {
public:
    CNoticeIconBase();
    ~CNoticeIconBase() override;
    bool onMain() override;
    // @yo2 0x00a79f70 CNoticeIconBase::kind
    uint32_t kind() const override { return 0x1c; }
    // @yo2 0x00a79f50 CNoticeIconBase::layout
    void layout() override { pos_.z = static_cast<float>(z()); }
    bool handleMessage(WindowMsg m) override;   // a click: pressed for a frame, the window told
    bool hitTest(float x, float y) override;     // the 32 x 32 icon

    CTaskPtr<CSwfEngine> swf_;   // 0x368
    bool pressed_ = false;       // 0x374
    int32_t pressFrames_ = 0;    // 0x378
};
YO2_AT(CNoticeIconBase, swf_, 0x368);
YO2_AT(CNoticeIconBase, pressed_, 0x374);
YO2_AT(CNoticeIconBase, pressFrames_, 0x378);
YO2_SIZEOF(CNoticeIconBase, 0x37c);

#define YO2_NOTICE_ICON(Name)                                                   \
    class Name : public CNoticeIconBase {                                       \
    public:                                                                     \
        static Name* create(CTask* parent, IWindowTaskMediator* mediator);      \
        Name();                                                                 \
        ~Name() override;                                                       \
        uint32_t unk37c_ = 0;                                                   \
    };                                                                          \
    YO2_SIZEOF(Name, 0x380)
YO2_NOTICE_ICON(CNoticeIconMail);
YO2_NOTICE_ICON(CNoticeIconFriend);
YO2_NOTICE_ICON(CNoticeIconDuelroom);
YO2_NOTICE_ICON(CNoticeIconOffer);
YO2_NOTICE_ICON(CNoticeIconEvent);
YO2_NOTICE_ICON(CNoticeIconTour);
YO2_NOTICE_ICON(CNoticeIconTeam);
#undef YO2_NOTICE_ICON

// The maintenance notice also has a help text (its time window).
class CNoticeIconMaintenance : public CNoticeIconBase {
public:
    static CNoticeIconMaintenance* create(CTask* parent, IWindowTaskMediator* mediator);
    CNoticeIconMaintenance();
    ~CNoticeIconMaintenance() override;

    HelpText help_;   // 0x37c
    uint8_t unk398_[8] = {};
};
YO2_AT(CNoticeIconMaintenance, help_, 0x37c);
YO2_SIZEOF(CNoticeIconMaintenance, 0x3a0);
