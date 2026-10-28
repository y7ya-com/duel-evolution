// yo2ChibiAvatar.cpp: CChibiAvatar, the base of every chibi on the map (CPlChibiAvatar for players,
// CNpcChibiAvatar for NPCs). It owns the drawn CChibiAvatarElm and walks it through
//   IDLE -> (requestLoad) REQUESTED -> (the subclass's setup) LOADING -> LOADED -> (show) SHOWN -> (hide) IDLE.
// LOADING streams the part textures and builds the part animations one per frame, and only one avatar on the map
// loads at a time (CChibiAvatarMng::lockLoader).
#pragma once
#include <cstdint>
#include <string>

#include "Game/Avatar/yo2AvatarExtern.h"
#include "Game/Avatar/yo2ChibiAvatarElm.h"
#include "System/yo2EasyTask.h"
#include "System/yo2TaskPtr.h"

class CChibiAvatarMng;

// Which states allow what: {state, flags} rows (reset() installs the table at 0x00d08ec8).
struct ChibiStateTable {
    enum Flag : uint32_t { VISIBLE = 1, BUSY = 2, SETUP = 4 };
    const int32_t (*rows)[2] = nullptr;   // 0x00
    int32_t count = 0;                    // 0x04
    bool allows(int32_t state, uint32_t flags) const;
};
YO2_SIZEOF(ChibiStateTable, 8);

class CChibiAvatar : public CEasyTask {
public:
    enum State : int32_t { IDLE, REQUESTED, LOADING, LOADED, SHOWN };
    enum Kind : int32_t { KIND_NONE, KIND_PLAYER, KIND_NPC };

    CChibiAvatar();
    ~CChibiAvatar() override;
    bool onMain() override;

    virtual void reset();                 // slot 9
    virtual void requestLoad();           // slot 10
    virtual void setup(bool arg) = 0;     // slot 11: REQUESTED -> LOADING, per subclass
    virtual void show(bool instant);      // slot 12
    virtual void hide(bool instant);      // slot 13
    virtual void onIdle();                // slot 14
    virtual void onLoading();             // slot 15
    virtual void onLoaded();              // slot 16
    virtual void onShown();               // slot 17

    bool createElm(CTask* parent, const uint8_t avatar[CAvatarData::SIZE]);
    void setAvatar(const uint8_t avatar[CAvatarData::SIZE]);
    void setPosition(const Vec3& pos, uint8_t dir);
    const std::u16string& name() const;
    bool onScreen() const;

    // The elm, or null when there is none (a plain dynamic_cast, as the exe does: no "NULL access" assert).
    CChibiAvatarElm* elm() const { return dynamic_cast<CChibiAvatarElm*>(elm_.task()); }

    CTask* elmParent_ = nullptr;       // 0x70 where onInit creates the elm (given to the subclasses' create)
    CChibiAvatarMng* mng_ = nullptr;   // 0x74
    int32_t kind_ = KIND_NONE;         // 0x78 Kind (set by the subclasses' reset)
    ChibiStateTable states_;           // 0x7c
    int32_t state_ = IDLE;             // 0x84 State (the exe's constructor leaves it unset; reset() clears it)
    bool autoShow_ = true;             // 0x88 LOADED goes straight on to show(false)
    const uint8_t* initAvatar_ = nullptr;   // 0x8c the CAvatarData bytes onInit's elm starts with
    bool texturesRequested_ = false;   // 0x90
    CTaskPtr<CChibiAvatarElm> elm_;    // 0x94
    CChibiAvatarEffect effect_;        // 0xa0
    CTaskPtr<CTextElm> nameLabel_;     // 0xb8
    CTaskPtr<CTextElm> label2_;        // 0xc4
    bool unkd0_ = false;               // 0xd0
    Vec3 pos_;                         // 0xd4 where show() puts the elm
    uint8_t dir_ = 0;                  // 0xe0 facing, 0..7
    bool unke1_ = false;               // 0xe1
};
YO2_AT(CChibiAvatar, elmParent_, 0x70);
YO2_AT(CChibiAvatar, mng_, 0x74);
YO2_AT(CChibiAvatar, kind_, 0x78);
YO2_AT(CChibiAvatar, states_, 0x7c);
YO2_AT(CChibiAvatar, initAvatar_, 0x8c);
YO2_AT(CChibiAvatar, state_, 0x84);
YO2_AT(CChibiAvatar, autoShow_, 0x88);
YO2_AT(CChibiAvatar, texturesRequested_, 0x90);
YO2_AT(CChibiAvatar, elm_, 0x94);
YO2_AT(CChibiAvatar, effect_, 0xa0);
YO2_AT(CChibiAvatar, nameLabel_, 0xb8);
YO2_AT(CChibiAvatar, label2_, 0xc4);
YO2_AT(CChibiAvatar, pos_, 0xd4);
YO2_AT(CChibiAvatar, dir_, 0xe0);
YO2_AT(CChibiAvatar, unke1_, 0xe1);
YO2_SIZEOF(CChibiAvatar, 0xe4);
