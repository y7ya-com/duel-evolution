// yo2SceneManager.cpp: CSceneMng owns the current scene and switches scenes, optionally behind a screen fade, with
// a stack for scenes that are suspended (kept alive) or re-created when you come back.
#pragma once
#include "yo2Scene.h"

enum SceneId : int32_t {
    SCENE_PATCHER = 1, SCENE_LOGO, SCENE_RATING, SCENE_TITLE, SCENE_CAUTION, SCENE_LOGIN, SCENE_PLAYER_SELECT,
    SCENE_CONNECT_LOBBY, SCENE_CHANGE_AVATAR, SCENE_MY_ROOM, SCENE_LOBBY, SCENE_AREA_MAP, SCENE_TOURNAMENT,
    SCENE_SHOP, SCENE_ENTRY, SCENE_SHINKI_ENTRY, SCENE_SHINKI_LOBBY_TEST, SCENE_SWF_TEST, SCENE_MAP_TEST,
    SCENE_SWF_VIEWER, SCENE_NPC_VIEWER, SCENE_UGAJIN_TEST, SCENE_CARD_GET_PACK, SCENE_CARD_GET_RESULT,
    SCENE_CARD_PACK_CHECK, SCENE_TAKANO_ENTRY,
    SCENE_DUEL = 0x1c, SCENE_DUEL_END, SCENE_JANKEN, SCENE_TK_TEST, SCENE_RESULT, SCENE_TAMAI_ENTRY,
    SCENE_DUEL_MODE1 = 0x22,   // the duel scene, after the duel module's setMode(1) (0x794d90)
    SCENE_NAKATA_ENTRY, SCENE_DECK, SCENE_CARD_SWAP, SCENE_TRADE, SCENE_PRESENT, SCENE_TP, SCENE_ORUI_ENTRY,
    SCENE_AVATAR_TEST,
    SCENE_NONE = 0x2c,
    SCENE_COUNT
};

// Sent to the old scene (LEAVE, with the next id) and to a resumed scene (RESUME, with the id it returns from).
// @yo2 0x0061dbe0 CTmSceneChange deleting destructor
// @yo2 0x0061dc10 CTmSceneChange::~CTmSceneChange
struct CTmSceneChange : CTaskMessage {
    enum Kind : int32_t { LEAVE = 1, RESUME = 2 };
    CTmSceneChange(int32_t kind, int32_t sceneId) : CTaskMessage(8), kind(kind), sceneId(sceneId) {}
    int32_t kind;     // 0x10
    int32_t sceneId;  // 0x14
};
YO2_AT(CTmSceneChange, kind, 0x10);
YO2_AT(CTmSceneChange, sceneId, 0x14);

class CSceneMng : public CEasyTask {
public:
    enum Fade : int32_t { FADE_NONE = 0, FADE_WAIT = 1 };  // switch now, or once the fader is done
    using Factory = CSceneTask* (*)(CTask* parent, CElement* layer);

    CSceneMng();
    ~CSceneMng() override;
    static CSceneMng* newChild(CTask* parent, uint32_t priority);
    static CSceneMng* instance() { return s_instance; }
    // Each scene's folder registers its New(parent, layer); the exe has the same table as one switch.
    static void registerScene(int32_t id, Factory f) { s_factories[id] = f; }

    int32_t receive(CTaskMessage* msg) override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;

    CSceneTask* scene() const;
    CElement* fader() const;
    int32_t sceneId() const { return sceneId_; }
    int32_t nextSceneId() const { return nextId_; }
    void change(int32_t id, int32_t fade, bool destroyOld);
    void push(int32_t id, int32_t fade, bool destroyOld);
    void pop(int32_t fade);
    void popTo(int32_t id);
    size_t stackDepth() const { return stack_.size(); }

private:
    struct Entry {
        int32_t id;
        CSceneTask* suspended;  // null: re-create the scene when coming back
    };
    void switchScene();
    CSceneTask* createNewTask(int32_t id);

    CTaskPtr<CSceneTask> scene_;     // 0x70
    int32_t sceneId_ = SCENE_NONE;   // 0x7c
    int32_t nextId_ = SCENE_NONE;    // 0x80 SCENE_NONE: no switch pending
    CSceneTask* nextScene_ = nullptr;  // 0x84 a suspended scene to resume instead of creating one
    vc6::deque<Entry> stack_;        // 0x88
    bool destroyOld_ = false;        // 0xb8 destroy the current scene when switching away
    int32_t fade_ = FADE_NONE;       // 0xbc
    CTaskPtr<CElement> fader_;       // 0xc0 a CScreenFader (src/duel)
    [[maybe_unused]] uint32_t unkCC_ = 0;  // 0xcc

    static CSceneMng* s_instance;    // DAT_01271790
    static Factory s_factories[SCENE_COUNT];
    struct Layout;
};
YO2_SIZEOF(CSceneMng, 0xd0);

// CScreenFader lives in src/duel (yo2.exe labels it duel); the scene manager needs only these. state 3 = faded out,
// state 0 = idle.
CElement* screenFaderNew(CTask* parent, uint32_t priority);  // CScreenFader::New (0x7dc600)
bool screenFaderFinished(CElement* fader);                    // 0x7dcd20
bool screenFaderIdle(CElement* fader);                        // 0x7dcd40

// CApp::sceneLayer (0x607250): the element scenes and the fader hang their drawing off. yo2App.cpp.
CElement* appSceneLayer();
