#include "SoundTest.h"

#include <cstdio>
#include <cstring>

#include "System/yo2Debug.h"
#include "System/yo2Element.h"

namespace {
constexpr int32_t BGM_FIRST = 0x20000000, SE_FIRST = 0x10000000;
constexpr int32_t TM_SWF_OBJ_EVENT = 0x13;
}  // namespace

// CSoundTest::New (0x688e30), the constructor (0x688d00) and the destructors (0x688d80 / 0x688db0) are labelled
// Swf in labels.tsv, so they carry no marker here.
CSoundTest::CSoundTest() = default;
CSoundTest::~CSoundTest() = default;
CSoundTest* CSoundTest::New(CTask* parent, CElement* layer) {
    auto* t = new CSoundTest;
    t->layer_ = layer;
    return dynamic_cast<CSoundTest*>(t->create(parent, 10000));
}

// "SE: n\nBGM: m" (1-based) in the window. The exe formats it with swprintf (0x605440) into a 0x400-character buffer.
void CSoundTest::showNumbers() {
    char narrow[64];
    std::snprintf(narrow, sizeof narrow, "SE: %d\nBGM: %d", se_ - (SE_FIRST - 1), bgm_ - (BGM_FIRST - 1));
    char16_t text[64];
    size_t i = 0;
    for (; narrow[i]; i++)
        text[i] = static_cast<unsigned char>(narrow[i]);
    text[i] = 0;
    windowSetText(window_.get(), text);
}

// @yo2 0x00688ef0 CSoundTest::onInit: the control movie, the first BGM playing, the number window at (0, 128)
bool CSoundTest::onInit() {
    CElement* panel = swfEngineNew(layer_, 0, "./TestData/takano/soundTest/player.txt", true);
    YO2_ASSERT(panel != nullptr, "SwfEngine 生成失敗");  // "failed to create the SwfEngine"
    panel->setInstName("SwfEngine");
    panel->pos_.z = -1.0f;
    swfEngineSetPlaying(panel, true);
    swfEngineSetListener(panel, this);
    se_ = SE_FIRST;
    bgm_ = BGM_FIRST;
    soundPlay(bgm_, 0);
    window_.setUser(this);
    window_.set(windowModelThinNew(layer_, 0, 0, 1));
    windowSetSize(window_.get(), 300.0f, 64.0f);
    windowLayout(window_.get());
    windowSetOrigin(window_.get(), 0.0f, 128.0f);
    window_.get()->pos_.x = 0.0f;
    window_.get()->pos_.y = 128.0f;
    showNumbers();
    return true;
}

// @yo2 0x00689520 CSoundTest::onMain (nothing per frame)
bool CSoundTest::onMain() { return true; }

// @yo2 0x00689540 CSoundTest::Receive: the panel's buttons; both lists wrap around
int32_t CSoundTest::receive(CTaskMessage* msg) {
    if (msg->tag != TM_SWF_OBJ_EVENT || !swfEventClicked(msg))
        return CEasyTask::receive(msg);
    const char* name = swfEventObjectName(msg);
    auto is = [name](const char* s) { return std::strcmp(name, s) == 0; };

    if (is("bgm_play")) {
        soundPlay(bgm_, 0);
    } else if (is("bgm_stop")) {
        soundStop(bgm_, 0);
    } else if (is("bgm_next")) {
        soundStop(bgm_, 0);
        if (++bgm_ >= soundBgmCount() + BGM_FIRST)
            bgm_ = BGM_FIRST;
        soundPlay(bgm_, 0);
    } else if (is("bgm_back")) {
        soundStop(bgm_, 0);
        if (--bgm_ < BGM_FIRST)
            bgm_ = soundBgmCount() + BGM_FIRST - 1;
        soundPlay(bgm_, 0);
    } else if (is("bgm_rew")) {
        soundStop(bgm_, 0);
        soundPlay(bgm_, 0);
    }

    if (is("se_play")) {
        soundPlay(se_, 0);
    } else if (is("se_stop")) {
        soundStop(se_, 0);
    } else if (is("se_next")) {
        soundStop(se_, 0);
        if (++se_ >= soundSeCount() + SE_FIRST)
            se_ = SE_FIRST;
        soundPlay(se_, 0);
    } else if (is("se_back")) {
        soundStop(se_, 0);
        if (--se_ < SE_FIRST)
            se_ = soundSeCount() + SE_FIRST - 1;
        soundPlay(se_, 0);
    } else if (is("se_rew")) {
        soundStop(se_, 0);
        soundPlay(se_, 0);
    }
    showNumbers();
    yo2Trace("BGM %x / SE %x\n", bgm_, se_);
    return CEasyTask::receive(msg);
}

struct CSoundTest::Layout {
    YO2_AT(CSoundTest, layer_, 0x70);
    YO2_AT(CSoundTest, window_, 0x74);
    YO2_AT(CSoundTest, bgm_, 0x80);
    YO2_AT(CSoundTest, se_, 0x84);
};

// Two more of the Sound objects' range are the message cipher's static object (a Blowfish, DAT_01288828: P-array and
// S-boxes allocated by 0x583060) that src/Net/ygpacket.cpp's cipher() now builds on first use:
// @yo2 0x00689e40 static init of the message cipher (Blowfish::Blowfish on DAT_01288828)
// @yo2 0x00689e60 its atexit registration (the destructor 0x583090)
