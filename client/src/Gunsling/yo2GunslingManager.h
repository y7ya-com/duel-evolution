// yo2GunslingManager.cpp: CGunsMng, the one task that runs the entrance to an event duel area (GUNSLINGER, TRIAL,
// ANNIVERSARY, EVOLUTION, ULTIMATE): it places the player at a random spot of the area's entry point, switches to
// the area map, dims the screen and plays the event's title movie, then waits until the player leaves.
#pragma once
#include "System/yo2EasyTask.h"
#include "System/yo2Math.h"
#include "System/yo2TaskPtr.h"

class CElement;
class CSceneTask;

class CGunsMng : public CEasyTask {
public:
    enum Step : int32_t {
        IDLE = 0,
        WAIT_MAP = 1,     // fading out to the area map
        SHOW_TITLE = 2,   // the map is up: dim it, start the event's title movie
        PLAY_TITLE = 3,   // until the movie ends, then undim
        IN_AREA = 4,      // until the player leaves the area
        LEFT = 6,
    };

    CGunsMng();
    ~CGunsMng() override;
    static CGunsMng* create(CTask* parent, uint32_t priority);
    static CGunsMng* instance() { return s_instance; }

    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;
    void enterArea(int32_t eventKind);
    int32_t step() const { return step_; }

private:
    struct Layout;
    void waitMap();
    void showTitle();
    void playTitle();
    void inArea();

    int32_t step_ = IDLE;              // 0x70 Step
    int32_t eventKind_ = -1;           // 0x74 picks the title movie
    [[maybe_unused]] uint8_t unk78_ = 0;  // 0x78
    CTaskPtr<CEasyTask> lobbyTask_;    // 0x7c CTaskPtr<CNetLobbyTask> "ガンスマネージャCNetLobbyTask"
    CTaskPtr<CElement> title_;         // 0x88 CTaskPtr<CSwfEngine> "m_pGunsTitle"
    [[maybe_unused]] uint32_t unk94_;  // 0x94

    static CGunsMng* s_instance;       // DAT_012b4af8
};
YO2_SIZEOF(CGunsMng, 0x98);

// ---- other folders (not ported in this branch; tests/ui_gunsling doubles them) ----
struct CNetLobby;
CEasyTask* netLobbyTaskSpawn(CTask* parent);  // CNetLobbyTask::spawn (src/Net)
// CNetLobbyTask::sendMove (0x6d46b0) -> CNetLobby::sendMove (0x6cec70, src/Net): 0x5300 MOVE
bool netLobbyTaskSendMove(CEasyTask* task, uint32_t pid, uint16_t x, uint16_t y, uint8_t dir, uint8_t b);
CNetLobby* appNetLobby();                  // CApp+0xc6c
uint32_t myPlayerPid();                    // 0xa54ac0: the logged-in player's pid (CNetAccount's selected player)
CTask* gameWorld();                        // DAT_012bb6b0 (src/Game)
void gameWorldSetArea(CTask* world, int32_t area);  // world +0x98
int32_t gameWorldArea(CTask* world);
Vec3 fieldMapInitPos(int32_t area, int32_t entry);   // CFieldMap::initPos 0xa4fe30
int32_t fieldMapInitDir(int32_t area, int32_t entry);  // CFieldMap::initDir 0xa50190
// CAreaMapScene (src/Game): the map scene this manager decorates.
CSceneTask* asAreaMap(CSceneTask* scene);    // dynamic_cast<CAreaMapScene*>
bool areaMapLoaded(CSceneTask* map);         // +0x2ed
void areaMapSetFrozen(CSceneTask* map, bool on);  // +0x24c: the player can't move
bool areaMapLeaving(CSceneTask* map);        // +0x2d0 || +0x2d7
// CScreenFader (src/duel), the scene manager's.
void screenFaderFadeOut(CElement* fader, int32_t frames, int32_t z);  // 0x7dcb00
void screenFaderFade(CElement* fader, const float from[4], const float to[4], int32_t frames, bool a, bool b,
                     int32_t z);                                             // 0x7dc6c0
void screenFaderFadeTo(CElement* fader, const float rgb[3], int32_t frames, bool a, bool b, int32_t z);  // 0x7dc8e0
// src/Swf
CElement* swfEngineNew(CElement* parent, uint32_t priority, const vc6::string& path, bool loop);  // 0x66d7a0
void swfEngineSetPlaying(CElement* swf, bool on);  // 0x66e390
bool swfEngineFinished(CElement* swf);             // +0x3f1
bool soundPlay(uint32_t id, int32_t fadeFrames);   // 0x686560
