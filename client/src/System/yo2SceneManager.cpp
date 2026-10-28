#include "yo2SceneManager.h"

#include "yo2Debug.h"

CSceneMng* CSceneMng::s_instance;
CSceneMng::Factory CSceneMng::s_factories[SCENE_COUNT];

// @yo2 0x0061cab0 CSceneMng::CSceneMng
CSceneMng::CSceneMng() {
    scene_.setUser(this);
    setTaskName("CSceneMng");
    s_instance = this;
}

// @yo2 0x0061ce00 CSceneMng::~CSceneMng
// @yo2 0x0061ccb0 CSceneMng deleting destructor
// @yo2 0x0061cd00 deque<Entry>::clear
// @yo2 0x0061ea70 deque<Entry> iterator reset
CSceneMng::~CSceneMng() { s_instance = nullptr; }

// @yo2 0x0061c080 CSceneMng::Create: one per process
CSceneMng* CSceneMng::newChild(CTask* parent, uint32_t priority) {
    YO2_ASSERT(s_instance == nullptr, "二重生成");  // created twice
    auto* m = new CSceneMng;
    return dynamic_cast<CSceneMng*>(m->create(parent, priority));
}

// @yo2 0x0061c250 CSceneMng::scene
CSceneTask* CSceneMng::scene() const { return dynamic_cast<CSceneTask*>(scene_.task()); }

// @yo2 0x0061ca80 CSceneMng::fader
CElement* CSceneMng::fader() const { return dynamic_cast<CElement*>(fader_.task()); }

// @yo2 0x0061c280 CSceneMng::change
void CSceneMng::change(int32_t id, int32_t fade, bool destroyOld) {
    fade_ = fade;
    destroyOld_ = destroyOld;
    nextId_ = id;
    nextScene_ = nullptr;
}

// @yo2 0x0061c2c0 CSceneMng::push: remember where we are, then change; the current scene is kept alive (and
// resumed by pop) unless it is being destroyed
// @yo2 0x0061e820 deque<Entry>::push_back (grow)
// @yo2 0x0061e9e0 deque<Entry> map grow
// @yo2 0x0061ea90 deque<Entry> iterator set node
void CSceneMng::push(int32_t id, int32_t fade, bool destroyOld) {
    stack_.push_back({sceneId_, destroyOld ? nullptr : scene()});
    nextId_ = id;
    nextScene_ = nullptr;
    fade_ = fade;
    destroyOld_ = destroyOld;
}

// @yo2 0x0061c540 CSceneMng::pop: back to the scene on top of the stack; the current one is destroyed
void CSceneMng::pop(int32_t fade) {
    fade_ = fade;
    destroyOld_ = true;
    Entry e = stack_.back();
    nextId_ = e.id;
    nextScene_ = e.suspended;
    stack_.pop_back();
}

// @yo2 0x0061c7c0 CSceneMng::popTo: drop entries (destroying their suspended scenes) through the one for `id`
void CSceneMng::popTo(int32_t id) {
    while (!stack_.empty()) {
        Entry e = stack_.back();
        stack_.pop_back();
        if (e.suspended)
            e.suspended->destroy(__FILE__, __LINE__);
        if (e.id == id)
            break;
    }
}

// @yo2 0x0061cfc0 CSceneMng::Receive
int32_t CSceneMng::receive(CTaskMessage* msg) {
    if (msg->tag == TM_DISP_STATUS) {
        auto* s = static_cast<CTmDispStatus*>(msg);
        s->print("---- CSceneMng ----\n");
        s->print("NowScene  = %d:%p[%s]\n", sceneId_, scene_.task(), scene_.get()->taskName().c_str());
        s->print("NextScene = %d\n", nextId_);
        s->print("NextTask  = %p\n", nextScene_);
        if (!s->chain)
            return TR_HANDLED;
    }
    return CEasyTask::receive(msg);
}

// @yo2 0x0061d130 CSceneMng::onInit: create the screen fader
bool CSceneMng::onInit() {
    fader_.setUser(this);
    fader_.set(screenFaderNew(appSceneLayer(), 10000));
    YO2_ASSERT(fader() != nullptr, "error CScreenFader::Create()");
    fader_.get()->setInstName("フェーダ");  // "fader"
    return true;
}

// @yo2 0x0061d5b0 CSceneMng::onMain: switch when a change is pending (and, with FADE_WAIT, the fade is done)
bool CSceneMng::onMain() {
    if (nextId_ == SCENE_NONE)
        return true;
    if (fade_ == FADE_WAIT) {
        if (!screenFaderFinished(fader_.get()) && !screenFaderIdle(fader_.get()))
            return true;
    } else if (fade_ != FADE_NONE) {
        return true;
    }
    switchScene();
    return true;
}

// @yo2 0x0061d630 CSceneMng::onDestroy
void CSceneMng::onDestroy() {
    if (fader())
        fader_.get()->destroy(__FILE__, __LINE__);
}

// @yo2 0x0061d6a0 CSceneMng::switchScene
void CSceneMng::switchScene() {
    if (scene()) {
        CTmSceneChange leave(CTmSceneChange::LEAVE, nextId_);
        scene_.get()->call(&leave);
        if (destroyOld_)
            scene_.get()->destroy(__FILE__, __LINE__);
    }
    CSceneTask* next = nextScene_;
    if (!next) {
        next = createNewTask(nextId_);
    } else {
        CTmSceneChange resume(CTmSceneChange::RESUME, sceneId_);
        next->call(&resume);
    }
    scene_.set(next);
    sceneId_ = nextId_;
    nextId_ = SCENE_NONE;
    nextScene_ = nullptr;
}

// @yo2 0x0061dc30 CSceneMng::CreateNewTask
CSceneTask* CSceneMng::createNewTask(int32_t id) {
    CSceneTask* s = nullptr;
    if (id >= 0 && id < SCENE_COUNT && s_factories[id])
        s = s_factories[id](this, appSceneLayer());
    YO2_ASSERT(s != nullptr, "error CSceneMng::CreateNewTask() scene=%d", id);
    return s;
}

struct CSceneMng::Layout {
    YO2_AT(CSceneMng, scene_, 0x70);
    YO2_AT(CSceneMng, sceneId_, 0x7c);
    YO2_AT(CSceneMng, nextId_, 0x80);
    YO2_AT(CSceneMng, nextScene_, 0x84);
    YO2_AT(CSceneMng, stack_, 0x88);
    YO2_AT(CSceneMng, destroyOld_, 0xb8);
    YO2_AT(CSceneMng, fade_, 0xbc);
    YO2_AT(CSceneMng, fader_, 0xc0);
};
