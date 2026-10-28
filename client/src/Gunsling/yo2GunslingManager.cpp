#include "yo2GunslingManager.h"

#include <cstdlib>

#include "Net/NetLobby.h"
#include "System/yo2Debug.h"
#include "System/yo2SceneManager.h"

CGunsMng* CGunsMng::s_instance;

namespace {
constexpr int32_t kEntryPoint = 8;   // the area's entry spot (CFieldMap init position / direction 8)
constexpr int32_t kFaderZ = 0xee4c;
constexpr uint32_t SE_EVENT_TITLE = 0x10000004;
constexpr float kTitleZ = 61014.0f;  // in front of the map

CSceneTask* currentAreaMap() { return asAreaMap(CSceneMng::instance()->scene()); }

const char* titleMovie(int32_t eventKind) {
    switch (eventKind) {
    case 1: case 13: return "data/Y/duel/effect/guns_ef_start_a01_j.txt";
    case 5: case 15: return "data/Y/duel/effect/trial_ef_start_a01_j.txt";
    case 7: return "data/Y/duel/effect/anniv_ef_start_a01_j.txt";
    case 17: return "data/Y/duel/effect/evolution_ef_start_a01_j.txt";
    case 21: return "data/Y/duel/effect/ult_ef_start_a01_j.txt";
    default: return nullptr;  // no title movie
    }
}
}  // namespace

// @yo2 0x00996660 CGunsMng::CGunsMng: one per process
CGunsMng::CGunsMng() {
    YO2_ASSERT(s_instance == nullptr, "CGunsMng::CGunsMng()");
    s_instance = this;
    setTaskName("GunsMng");
}

// @yo2 0x009968b0 CGunsMng::~CGunsMng
// @yo2 0x00996880 CGunsMng deleting destructor
CGunsMng::~CGunsMng() { s_instance = nullptr; }

// @yo2 0x00996310 CGunsMng::Create
CGunsMng* CGunsMng::create(CTask* parent, uint32_t priority) {
    YO2_ASSERT(s_instance == nullptr, "error CGunsMng::ins");
    auto* m = new CGunsMng;
    return dynamic_cast<CGunsMng*>(m->CTask::create(parent, priority));
}

// @yo2 0x00996950 CGunsMng::onInit: its own lobby-connection task
bool CGunsMng::onInit() {
    lobbyTask_.setUser(this);
    lobbyTask_.set(netLobbyTaskSpawn(this));
    YO2_ASSERT(lobbyTask_.task() != nullptr, "error CNetLobbyTask::Create()");
    lobbyTask_.get()->setInstName("ガンスマネージャCNetLobbyTask");  // "guns manager CNetLobbyTask"
    return true;
}

// @yo2 0x00996df0 CGunsMng::onDestroy (empty)
void CGunsMng::onDestroy() {}

// @yo2 0x009964e0 CGunsMng::enterArea: move to a random spot (±30) around the event area's entry, tell the server,
// fade out and switch to the area map
void CGunsMng::enterArea(int32_t eventKind) {
    eventKind_ = eventKind;
    gameWorldSetArea(gameWorld(), appNetLobby()->block2);
    float dy = static_cast<float>(std::rand() % 60 - 30);
    float dx = static_cast<float>(std::rand() % 60 - 30);
    Vec3 pos = fieldMapInitPos(gameWorldArea(gameWorld()), kEntryPoint) + Vec3{dx, dy, 0};
    int32_t dir = fieldMapInitDir(gameWorldArea(gameWorld()), kEntryPoint);
    netLobbyTaskSendMove(lobbyTask_.get(), myPlayerPid(), static_cast<uint16_t>(static_cast<int32_t>(pos.x)),
                         static_cast<uint16_t>(static_cast<int32_t>(pos.y)), static_cast<uint8_t>(dir), 0);
    step_ = WAIT_MAP;
    screenFaderFadeOut(CSceneMng::instance()->fader(), 10, kFaderZ);
    CSceneMng::instance()->change(SCENE_AREA_MAP, CSceneMng::FADE_WAIT, true);
}

// @yo2 0x00996da0 CGunsMng::onMain
bool CGunsMng::onMain() {
    switch (step_) {
    case WAIT_MAP: waitMap(); break;
    case SHOW_TITLE: showTitle(); break;
    case PLAY_TITLE: playTitle(); break;
    case IN_AREA: inArea(); break;
    }
    return true;
}

// @yo2 0x00996e10 CGunsMng step 1: once the fade is over and the area map has loaded, freeze the player
void CGunsMng::waitMap() {
    CElement* fader = CSceneMng::instance()->fader();
    if (!(screenFaderFinished(fader) || screenFaderIdle(fader)))  // the exe: fader state is neither 1 nor 2
        return;
    CSceneTask* map = currentAreaMap();
    if (map && areaMapLoaded(map)) {
        areaMapSetFrozen(map, true);
        step_ = SHOW_TITLE;
    }
}

// @yo2 0x00996e90 CGunsMng step 2: dim the map to half over 30 frames and play the event's title movie on it
void CGunsMng::showTitle() {
    CSceneTask* map = currentAreaMap();
    if (!map)
        return;
    const float from[4] = {1, 1, 1, 1}, to[4] = {0.5f, 0.5f, 0.5f, 1};
    screenFaderFade(CSceneMng::instance()->fader(), from, to, 30, false, true, kFaderZ);
    title_.setUser(this);
    if (const char* movie = titleMovie(eventKind_)) {
        soundPlay(SE_EVENT_TITLE, 0);
        title_.set(swfEngineNew(dynamic_cast<CElement*>(map->baseElement()), 0, movie, true));
    }
    if (dynamic_cast<CElement*>(title_.task())) {
        title_.get()->setInstName("m_pGunsTitle");
        swfEngineSetPlaying(title_.get(), true);
        title_.get()->pos_ = Vec3{0, 0, kTitleZ};
    }
    step_ = PLAY_TITLE;
}

// @yo2 0x009978b0 CGunsMng step 3: when the movie ends, drop it and undim; once the fader rests, unfreeze
void CGunsMng::playTitle() {
    if (dynamic_cast<CElement*>(title_.task()) && swfEngineFinished(title_.get())) {
        title_.get()->destroy(__FILE__, __LINE__);
        const float white[3] = {1, 1, 1};
        screenFaderFadeTo(CSceneMng::instance()->fader(), white, 30, true, false, kFaderZ);
    }
    if (screenFaderIdle(CSceneMng::instance()->fader())) {
        if (CSceneTask* map = currentAreaMap())
            areaMapSetFrozen(map, false);
        step_ = IN_AREA;
    }
}

// @yo2 0x009979e0 CGunsMng step 4: done once the player heads out of the area
void CGunsMng::inArea() {
    CSceneTask* map = currentAreaMap();
    if (map && areaMapLeaving(map))
        step_ = LEFT;
}

struct CGunsMng::Layout {
    YO2_AT(CGunsMng, step_, 0x70);
    YO2_AT(CGunsMng, eventKind_, 0x74);
    YO2_AT(CGunsMng, unk78_, 0x78);
    YO2_AT(CGunsMng, lobbyTask_, 0x7c);
    YO2_AT(CGunsMng, title_, 0x88);
};
