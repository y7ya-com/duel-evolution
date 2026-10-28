// logoEntry.cpp: CLogoScene, the first scene after the patcher. It plays the Konami logo SWF and, once the movie has
// played through, moves on to the rating screen (Korean edition, language 6) or straight to the title.
#pragma once
#include "System/yo2Scene.h"

class CLogoScene : public CSceneTask {
public:
    CLogoScene();
    ~CLogoScene() override;
    static CSceneTask* New(CTask* parent, CElement* layer) { return spawn<CLogoScene>(parent, layer); }

    int32_t receive(CTaskMessage* msg) override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;

private:
    struct Layout;
    CTaskPtr<CElement> swf_;  // 0x80 CTaskPtr<CSwfEngine> "SwfEngine": the logo movie
    [[maybe_unused]] uint32_t unk8c_;  // 0x8c never touched
};
YO2_SIZEOF(CLogoScene, 0x90);

// What the logo needs from other folders (not ported yet; the tests supply doubles). The SWF player is a CElement
// subclass (CSwfEngine, src/Swf), so it is handled as a CElement here.
CElement* swfEngineNew(CElement* parent, uint32_t priority, const vc6::string& path, bool loop);  // 0x66d7a0
void swfEngineSetPlaying(CElement* swf, bool on);  // 0x66e390: CSwfEngine+0x3ef
bool swfEngineFinished(CElement* swf);             // CSwfEngine+0x3f1, set by its onMain once the movie ran out
int32_t systemLanguage();  // DAT_0127188c (CSystemConfigManager)->vf3 (0x622b40): the language id (0..6 JPN ENG DEU FRA ITA ESP KOR)
