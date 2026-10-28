#include "Game/Avatar/yo2ChibiAvatar.h"

#include "Game/Avatar/yo2ChibiAvatarManager.h"
#include "System/yo2Debug.h"

// The state table reset() installs (0x00d08ec8).
static const int32_t kStates[5][2] = {
    {CChibiAvatar::IDLE, 0},
    {CChibiAvatar::REQUESTED, ChibiStateTable::BUSY | ChibiStateTable::SETUP},
    {CChibiAvatar::LOADING, ChibiStateTable::BUSY},
    {CChibiAvatar::LOADED, ChibiStateTable::BUSY},
    {CChibiAvatar::SHOWN, ChibiStateTable::VISIBLE | ChibiStateTable::BUSY},
};

// @yo2 0x009c2880 CChibiAvatar::CChibiAvatar
CChibiAvatar::CChibiAvatar() {
    setTaskName("CChibiAvatar");
}

// @yo2 0x009c2ad0 CChibiAvatar::~CChibiAvatar
// @yo2 0x009c2aa0 CChibiAvatar deleting destructor
CChibiAvatar::~CChibiAvatar() = default;

// @yo2 0x009c1a40 CChibiAvatar::reset: back to IDLE with no parts loaded, the name label saying "unknown"
void CChibiAvatar::reset() {
    kind_ = KIND_NONE;
    autoShow_ = true;
    states_.rows = kStates;
    states_.count = 5;
    state_ = IDLE;
    initAvatar_ = nullptr;
    if (texturesRequested_) {
        elm()->releaseTextures();
        texturesRequested_ = false;
    }
    if (elm())
        elm_.get()->clear();
    if (dynamic_cast<CTextElm*>(nameLabel_.task()))
        nameLabel_.get()->setText(u"unknown");
    unkd0_ = false;
    pos_ = {};
    dir_ = 0;
}

// @yo2 0x009c1f40 CChibiAvatar::requestLoad
void CChibiAvatar::requestLoad() {
    state_ = REQUESTED;
}

// @yo2 0x009c1f60 CChibiAvatar::show: the elm on at pos_/dir_; unless `instant`, it starts transparent and fades in
void CChibiAvatar::show(bool instant) {
    elm()->enable();
    elm()->warp(pos_, dir_);
    if (!instant) {
        CChibiAvatarElm* e = elm();
        e->color_[0] = e->color_[1] = e->color_[2] = 1.0f;
        e->color_[3] = 0.0f;
        effect_.fadeIn();
    }
    state_ = SHOWN;
}

// @yo2 0x009c2040 CChibiAvatar::hide: `instant` drops the elm's parts and goes IDLE; otherwise it fades out
void CChibiAvatar::hide(bool instant) {
    if (!instant) {
        effect_.fadeOut();
        return;
    }
    elm()->disable();
    if (texturesRequested_) {
        elm()->releaseTextures();
        texturesRequested_ = false;
    }
    mng_->unlockLoader(this);
    state_ = IDLE;
}

// @yo2 0x009c2c40 CChibiAvatar::onIdle (empty)
void CChibiAvatar::onIdle() {}

// @yo2 0x009c2c60 CChibiAvatar::onLoading: once the manager lets this avatar load, request the part textures,
// then (when they are in) build one part per frame; LOADED when none is left
void CChibiAvatar::onLoading() {
    if (!mng_->lockLoader(this))
        return;
    if (!texturesRequested_) {
        elm()->requestTextures();
        texturesRequested_ = true;
    }
    if (elm()->texturesLoaded() && elm()->createParts(1) == 0) {
        mng_->unlockLoader(this);
        state_ = LOADED;
    }
}

// @yo2 0x009c2d40 CChibiAvatar::onLoaded
void CChibiAvatar::onLoaded() {
    if (autoShow_)
        show(false);
}

// @yo2 0x009c2a80 CChibiAvatar::onShown (empty)
void CChibiAvatar::onShown() {}

// @yo2 0x009c2bd0 CChibiAvatar::onMain: the state's handler (REQUESTED waits for the subclass's setup)
bool CChibiAvatar::onMain() {
    switch (state_) {
    case IDLE: onIdle(); break;
    case LOADING: onLoading(); break;
    case LOADED: onLoaded(); break;
    case SHOWN: onShown(); break;
    }
    return true;
}

// @yo2 0x009c2220 CChibiAvatar::createElm: the elm under `parent`, wearing `avatar`; the fade effect drives it
bool CChibiAvatar::createElm(CTask* parent, const uint8_t avatar[CAvatarData::SIZE]) {
    elm_.setUser(this);
    elm_.set(CChibiAvatarElm::create(parent));
    YO2_ASSERT(elm() != nullptr, "error CChibiAvatar::CreateAvatarElm");
    elm_.get()->setInstName("ちびアバターElm(名無し)");   // "chibi avatar Elm (no name)"
    elm_.get()->setAvatar(avatar);
    effect_.elm_.set(elm());
    return true;
}

// @yo2 0x009c21c0 CChibiAvatar::setAvatar
void CChibiAvatar::setAvatar(const uint8_t avatar[CAvatarData::SIZE]) {
    elm_.get()->setAvatar(avatar);
}

// @yo2 0x009c2100 CChibiAvatar::setPosition: move the elm now and remember it for show()
void CChibiAvatar::setPosition(const Vec3& pos, uint8_t dir) {
    elm()->pos_ = pos;
    elm()->setDirection(dir);
    pos_ = pos;
    dir_ = dir;
}

// @yo2 0x009c21f0 CChibiAvatar::name: the name label's text
const std::u16string& CChibiAvatar::name() const {
    return nameLabel_.get()->text();
}

// @yo2 0x009c2d70 CChibiAvatar::onScreen: the elm's world position within the 1024 x 768 screen plus 100 pixels
bool CChibiAvatar::onScreen() const {
    Vec3 p = elm()->worldTranslation();
    return p.x > -100.0f && p.x < 1024.0f + 100.0f && p.y > -100.0f && p.y < 768.0f + 100.0f;
}
