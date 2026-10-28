// SoundTest.cpp: CSoundTest, a developer tool (no scene creates it in the shipped game): a SWF control panel
// (./TestData/takano/soundTest/player.txt) whose buttons play, stop and step through the BGM and sound-effect lists,
// and a small window showing the current numbers.
#pragma once
#include "System/yo2EasyTask.h"
#include "System/yo2TaskPtr.h"

class CElement;

class CSoundTest : public CEasyTask {
public:
    CSoundTest();
    ~CSoundTest() override;
    static CSoundTest* New(CTask* parent, CElement* layer);

    int32_t receive(CTaskMessage* msg) override;
    bool onInit() override;
    bool onMain() override;
    int32_t bgm() const { return bgm_; }
    int32_t se() const { return se_; }

private:
    struct Layout;
    void showNumbers();

    CElement* layer_ = nullptr;   // 0x70 where the panel and window go
    CTaskPtr<CElement> window_;   // 0x74 CTaskPtr<CWindowModelThin>
    int32_t bgm_ = 0;             // 0x80 sound id 0x20000000 + n
    int32_t se_ = 0;              // 0x84 sound id 0x10000000 + n
};
YO2_SIZEOF(CSoundTest, 0x88);

// ---- other folders (not ported in this branch; tests/ui_sound doubles them) ----
// src/Swf: the movie player and the sound engine.
CElement* swfEngineNew(CElement* parent, uint32_t priority, const vc6::string& path, bool loop);  // 0x66d7a0
void swfEngineSetPlaying(CElement* swf, bool on);   // 0x66e390
void swfEngineSetListener(CElement* swf, CTask* t); // CSwfEngine+0x3f8 CTaskPtr<>::set (0x5ddd70)
const char* swfEventObjectName(const CTaskMessage* msg);  // CTmSwfObjEvent (tag 0x13): +0x10 object, name +0x34c
bool swfEventClicked(const CTaskMessage* msg);            // +0x15
bool soundPlay(uint32_t id, int32_t fadeFrames);    // 0x686560
bool soundStop(uint32_t id, int32_t fadeFrames);    // 0x6866a0
int32_t soundBgmCount();                            // DAT_0127df74 (bgm.txt)
int32_t soundSeCount();                             // DAT_0127df78 (se.txt)
// src/System: the window.
CElement* windowModelThinNew(CTask* parent, int32_t a, int32_t b, int32_t c);  // CWindowModelThin::create
void windowSetSize(CElement* win, float w, float h);   // CWindowTaskModel w_/h_ (+0x388)
void windowLayout(CElement* win);                      // vf9
void windowSetOrigin(CElement* win, float x, float y); // CWindowTaskModel x_/y_ (+0x380)
void windowSetText(CElement* win, const char16_t* s);  // vf12
