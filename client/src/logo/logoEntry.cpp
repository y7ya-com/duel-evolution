#include "logoEntry.h"

#include "System/yo2Debug.h"
#include "System/yo2SceneManager.h"

namespace {
constexpr int32_t LANG_KOREAN = 6;  // kLanguageCodes[6] "KOR"
}

// @yo2 0x007f03f0 CLogoScene::New (logoEntry.h; the constructor is inlined into it)
CLogoScene::CLogoScene() { setTaskName("CLogoScene"); }
// @yo2 0x007f0600 CLogoScene::~CLogoScene
// @yo2 0x007f05d0 CLogoScene deleting destructor
CLogoScene::~CLogoScene() = default;

// @yo2 0x007f0d10 CLogoScene::Receive (just CEasyTask's)
int32_t CLogoScene::receive(CTaskMessage* msg) { return CSceneTask::receive(msg); }

// @yo2 0x007f0690 CLogoScene::onInit: the base element, then the logo movie under it, 100 deep, playing
bool CLogoScene::onInit() {
    createBaseElement("CLogoScene::m_pBaseElm");
    swf_.setUser(this);
    swf_.set(swfEngineNew(baseElm_.get(), 0, "Data/logo/konami_logo.txt", true));
    YO2_ASSERT(swf_.task() != nullptr, "SwfEngine 生成失敗");  // "failed to create the SwfEngine"
    swf_.get()->setInstName("SwfEngine");
    swf_.get()->pos_.z = 100.0f;
    swfEngineSetPlaying(swf_.get(), true);
    return true;
}

// @yo2 0x007f0c50 CLogoScene::onMain: when the movie is over, the (Korean) rating screen or the title
bool CLogoScene::onMain() {
    if (swfEngineFinished(swf_.get())) {
        int32_t next = systemLanguage() == LANG_KOREAN ? SCENE_RATING : SCENE_TITLE;
        CSceneMng::instance()->push(next, CSceneMng::FADE_WAIT, true);
    }
    return true;
}

// @yo2 0x007f0cc0 CLogoScene::onDestroy: the base element goes (the movie with it)
void CLogoScene::onDestroy() {
    if (dynamic_cast<CElement*>(baseElm_.task()))
        baseElm_.get()->destroy(__FILE__, __LINE__);
}

struct CLogoScene::Layout {
    YO2_AT(CLogoScene, swf_, 0x80);
    YO2_AT(CLogoScene, unk8c_, 0x8c);
};
