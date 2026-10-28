#include "yo2Rating.h"

#include <ctime>

#include "System/yo2Debug.h"

namespace {
// The original asserts name the exe's source file.
constexpr const char* kFile = "C:\\yugionline\\yo2\\client\\src\\Rating\\yo2Rating.cpp";

int32_t now() { return static_cast<int32_t>(std::time(nullptr)); }

CElement* fader() { return CSceneMng::instance()->fader(); }

// One of the notice sprites: created under `parent`, named, placed.
void makeSprite(CTaskPtr<CElement>& ptr, CTaskUser* user, CTask* parent, const char* texture, const char* instName,
                Vec3 pos) {
    ptr.setUser(user);
    ptr.set(spriteElmNew(parent, 10000, texture));
    YO2_ASSERT(ptr.task() != nullptr, "rating作成失敗");  // "rating creation failed"
    ptr.get()->setInstName(instName);
    ptr.get()->pos_ = pos;
}
}  // namespace

// ================================================================ CRatingScene

// @yo2 0x00997ac0 CRatingScene::New (CSceneMng's SCENE_RATING case; labelled Gunsling in labels.tsv)
CSceneTask* CRatingScene::make(CTask* parent, CElement* layer) { return spawn<CRatingScene>(parent, layer); }

// (inlined into New)
CRatingScene::CRatingScene() {
    baseElm_.setUser(this);
    setTaskName("CRatingScene");
}

// @yo2 0x00997d10 CRatingScene::~CRatingScene (labelled Gunsling)
// @yo2 0x00997ce0 CRatingScene deleting destructor (labelled Gunsling)
CRatingScene::~CRatingScene() = default;

// @yo2 0x00998d20 CRatingScene::Receive (just CEasyTask's)
int32_t CRatingScene::receive(CTaskMessage* msg) { return CEasyTask::receive(msg); }

// @yo2 0x00997dd0 CRatingScene::onInit: base element, rating mark, grade table, white background; fade in
bool CRatingScene::onInit() {
    // The base element is created like CSceneTask::createBaseElement, with the logo scene's messages (copied).
    baseElm_.set(CElement::newChild(baseParent_, 10000));
    YO2_ASSERT(baseElm_.task() != nullptr, "error CLogoScene::m_pBaseElm::Create()");
    baseElm_.get()->setInstName("CLogoScene::m_pBaseElm");

    makeSprite(ratingMark_, this, baseElm_.get(), "data/etc/korean/rating_all.png", "レーティング画像",
               {677, 50, 100});
    makeSprite(gradeTable_, this, baseElm_.get(), "data/etc/korean/rating1.png", "グレード表画像", {233, 314, 100});
    makeSprite(background_, this, baseElm_.get(), "data/etc/korean/back.png", "白バック画像", {0, 0, 50});
    background_.get()->scale_ = {10, 8, 0};  // a small white texture stretched over the screen

    leaveAt_ = 0;
    state_ = FADING_IN;
    screenFaderFadeIn(fader(), kFadeFrames, kFadeZ);
    return true;
}

// @yo2 0x00998c00 CRatingScene::onMain: wait for the fade-in, hold 4 s, then fade out into the title
bool CRatingScene::onMain() {
    if (state_ == FADING_IN) {
        if (screenFaderIdle(fader())) {
            leaveAt_ = now() + kShowSeconds;
            state_ = SHOWING;
        }
    } else if (state_ == SHOWING) {
        if (leaveAt_ < now()) {
            screenFaderFadeOut(fader(), kFadeFrames, kFadeZ);
            CSceneMng::instance()->change(SCENE_TITLE, CSceneMng::FADE_WAIT, true);
            state_ = LEAVING;
        }
    }
    return true;
}

// @yo2 0x00998cd0 CRatingScene::onDestroy: the base element (and the sprites under it) go too
void CRatingScene::onDestroy() {
    if (baseElm_.task())
        baseElm_.get()->destroy(kFile, 0x59);
}

struct CRatingScene::Layout {
    YO2_AT(CRatingScene, state_, 0x80);
    YO2_AT(CRatingScene, leaveAt_, 0x84);
    YO2_AT(CRatingScene, ratingMark_, 0x88);
    YO2_AT(CRatingScene, gradeTable_, 0x94);
    YO2_AT(CRatingScene, background_, 0xa0);
};

// ================================================================ CRatingTask

// (inlined into New)
CRatingTask::CRatingTask() {
    base_.setUser(this);
    setTaskName("CRatingTask");
}

// @yo2 0x00998fa0 CRatingTask::~CRatingTask
// @yo2 0x00998f70 CRatingTask deleting destructor
CRatingTask::~CRatingTask() = default;

// @yo2 0x00998d40 CRatingTask::New: `layer` becomes the base element's parent
CRatingTask* CRatingTask::newChild(CTask* parent, CTask* layer) {
    auto* t = new CRatingTask;
    t->layer_ = layer;
    return dynamic_cast<CRatingTask*>(t->create(parent, 10000));
}

// @yo2 0x00999d60 CRatingTask::Receive (just CEasyTask's)
int32_t CRatingTask::receive(CTaskMessage* msg) { return CEasyTask::receive(msg); }

// @yo2 0x00999070 CRatingTask::onInit: base element, help text, first showing in an hour; fade in
bool CRatingTask::onInit() {
    base_.set(CElement::newChild(layer_, 10000));
    YO2_ASSERT(base_.task() != nullptr, "error CLogoScene::m_pBaseElm::Create()");
    base_.get()->setInstName("CLogoScene::m_pBaseElm");
    ratingMark_.setUser(this);
    help_.setText(stringDbWide(kHelpTextId));
    nextShow_ = now() + kIntervalSeconds;
    hideAt_ = 0;
    state_ = WAITING;
    screenFaderFadeIn(fader(), CRatingScene::kFadeFrames, CRatingScene::kFadeZ);
    return true;
}

// @yo2 0x009995a0 CRatingTask::onMain: the hourly 4-second showing
bool CRatingTask::onMain() {
    int32_t t = now();
    switch (state_) {
    case WAITING:
        if (nextShow_ < t + kHideHelpSeconds)
            help_.setPriority(-1);
        if (nextShow_ < t) {
            hideAt_ = t + kShowSeconds;
            state_ = SHOWING;
            ratingMark_.set(spriteElmNew(base_.get(), 10000, "data/etc/korean/rating_all.png"));
            YO2_ASSERT(ratingMark_.task() != nullptr, "rating作成失敗");
            ratingMark_.get()->setInstName("レーティング画像");
            ratingMark_.get()->pos_ = {677, 50, 61105};
            ratingMark_.get()->setDrawMode(CElement::BLEND);
            ratingMark_.get()->setDisp(true, true);
            help_.setPriority(999);
        }
        break;
    case SHOWING:
        if (hideAt_ < now())
            state_ = HIDING;
        break;
    case HIDING:
        state_ = WAITING;
        nextShow_ = now() + kIntervalSeconds;
        ratingMark_.get()->destroy(kFile, 0xae);
        ratingMark_.set(nullptr);
        break;
    }
    return true;
}

// @yo2 0x00999d10 CRatingTask::onDestroy
void CRatingTask::onDestroy() {
    if (base_.task())
        base_.get()->destroy(kFile, 0xba);
}

struct CRatingTask::Layout {
    YO2_AT(CRatingTask, state_, 0x70);
    YO2_AT(CRatingTask, layer_, 0x74);
    YO2_AT(CRatingTask, base_, 0x78);
    YO2_AT(CRatingTask, nextShow_, 0x84);
    YO2_AT(CRatingTask, hideAt_, 0x88);
    YO2_AT(CRatingTask, ratingMark_, 0x8c);
    YO2_AT(CRatingTask, unused98_, 0x98);
    YO2_AT(CRatingTask, unusedA4_, 0xa4);
    YO2_AT(CRatingTask, help_, 0xb0);
};
