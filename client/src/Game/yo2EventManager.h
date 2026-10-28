// yo2EventManager.cpp: scripted NPC events on the world map, and the speech-balloon ("fuki") dictionary.
//
// CEventPlayer plays one event of the built-in event script (g_eventScript, 40 steps in the exe's data): an NPC
// appears, says a few balloon lines and leaves. CFukiDictionary loads data/Avatar/npc/fuki_index.csv: per NPC, the
// text ids of its balloon lines and a style number for each.
#pragma once
#include <cstdint>

#include "System/yo2EasyTask.h"
#include "System/yo2Element.h"
#include "System/yo2TaskPtr.h"

class CNpcChibiAvatar;       // TODO(Game/Avatar): the NPC the event spawns
class CWindowModelBalloon;   // TODO(System window framework): the speech balloon

// One step of the event script.
struct EventStep {
    enum Command : int32_t {
        SPAWN_NPC = 0,   // arg: the NPC kind (CEventPlayer::npcNameText)
        NPC_LEAVE = 1,   // the NPC walks off; the step ends when it is gone
        BALLOON = 2,     // arg: text id of one balloon line; consecutive BALLOON steps are one balloon
    };
    int32_t event;     // 0x00 which event the step belongs to
    int32_t command;   // 0x04 Command (event 6 has a lone command 4, which onMain ignores)
    int32_t arg;       // 0x08
};
YO2_SIZEOF(EventStep, 0x0c);

enum { EVENT_STEPS = 40 };
extern const EventStep g_eventScript[EVENT_STEPS];   // DAT_00d2c860

class CEventPlayer : public CEasyTask {
public:
    enum State : int32_t { IDLE = 0, PLAYING = 1, DONE = 2 };

    static CEventPlayer* create(CTask* parent, CTask* baseParent);
    CEventPlayer();
    ~CEventPlayer() override;

    bool onInit() override;
    void onDestroy() override;
    // onMain (0x00a4d150) is not rewritten yet: see STATUS_world.md (blocked: window framework)

    void start(int32_t event, int32_t number, const vc6::string& name, int32_t timeout);
    bool stepLeftEvent() const;
    static int32_t npcNameText(int32_t npcKind);

    CTask* baseParent_ = nullptr;          // 0x70 parent of baseElm_; cleared once onInit has made it
    CTaskPtr<CElement> baseElm_;           // 0x74 "CEventPlayer::m_pBaseElm": the NPC and balloon hang here
    CTaskPtr<CNpcChibiAvatar> npc_;        // 0x80
    CTaskPtr<CWindowModelBalloon> balloon_;  // 0x8c
    int32_t event_ = 1;                    // 0x98 the event being played
    int32_t state_ = IDLE;                 // 0x9c State
    uint32_t step_ = 0;                    // 0xa0 index into g_eventScript
    bool stepStart_ = true;                // 0xa4 the current step hasn't run its first frame yet
    int32_t npcKind_ = 0;                  // 0xa8 from the SPAWN_NPC step
    int32_t npcNameText_ = 0;              // 0xac text id of the NPC's name, shown on its balloons
    vc6::string name_;                     // 0xb0 replaces "@@s" in balloon lines
    int32_t number_ = 0;                   // 0xc0 replaces "@@d" in balloon lines
    int32_t timeout_ = 0;                  // 0xc4 frames left before the event is cut short
    bool hasTimeout_ = false;              // 0xc8
    uint32_t unkcc_ = 0;                   // 0xcc never used
};
YO2_AT(CEventPlayer, baseParent_, 0x70);
YO2_AT(CEventPlayer, baseElm_, 0x74);
YO2_AT(CEventPlayer, npc_, 0x80);
YO2_AT(CEventPlayer, balloon_, 0x8c);
YO2_AT(CEventPlayer, event_, 0x98);
YO2_AT(CEventPlayer, state_, 0x9c);
YO2_AT(CEventPlayer, step_, 0xa0);
YO2_AT(CEventPlayer, stepStart_, 0xa4);
YO2_AT(CEventPlayer, npcKind_, 0xa8);
YO2_AT(CEventPlayer, npcNameText_, 0xac);
YO2_AT(CEventPlayer, name_, 0xb0);
YO2_AT(CEventPlayer, number_, 0xc0);
YO2_AT(CEventPlayer, timeout_, 0xc4);
YO2_AT(CEventPlayer, hasTimeout_, 0xc8);
YO2_SIZEOF(CEventPlayer, 0xd0);

// One NPC of fuki_index.csv: two CSV lines, "npc,text1..text84" then "npc,style1..style84".
struct FukiEntry {
    enum { LINES = 84 };
    int32_t npc;            // 0x000
    int32_t text[LINES];    // 0x004 text id of balloon line i, 0 = none
    int32_t style[LINES];   // 0x154 its balloon style
};
YO2_SIZEOF(FukiEntry, 0x2a4);

class CFukiDictionary : public CEasyTask {
public:
    enum { COUNT = 120 };

    static CFukiDictionary* create(CTask* parent);
    ~CFukiDictionary() override;

    bool onInit() override;
    // @yo2 0x00a4f050 CFukiDictionary::onDestroy (empty)
    void onDestroy() override {}

    bool load();
    int32_t text(int32_t npc, int32_t line) const;
    // @yo2 0x00a4f9c0 CFukiDictionary::unused: always 0 (its callers pass it on as an argument)
    int32_t unused(int32_t /*npc*/, int32_t /*line*/) const { return 0; }
    int32_t style(int32_t npc, int32_t line) const;

    FukiEntry entries_[COUNT] = {};   // 0x00070
    int32_t count_ = 0;               // 0x13d50
    int32_t unk13d54_ = 0;            // 0x13d54 never used
};
YO2_AT(CFukiDictionary, entries_, 0x70);
YO2_AT(CFukiDictionary, count_, 0x13d50);
YO2_SIZEOF(CFukiDictionary, 0x13d58);
