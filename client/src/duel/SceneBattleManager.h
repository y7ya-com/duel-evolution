// CBattleManager (yo2BattleManager.cpp, 0x00754040..0x007549c0 + 0x00754bb0): the attack on the mat. The engine
// drives it through the free functions below: an attack starts (arrows on the monsters that may attack), the attacker
// is picked, the arrow follows the mouse while aiming, then sweeps to the target with the attack movie, the target
// card slides off when it is destroyed, the cards flash and the LP gauges count the damage.
#pragma once
#include "SceneGameObject.h"
#include "SceneSprite.h"

namespace ds {

class CCard;

// TODO(System) CSwfEngine (yo2SwfEngine.cpp): a Flash-like movie element. The scene creates one, plays a label and
// pokes these fields; the class itself is System's (or Swf's) to port.
class CSwfEngine : public CElement {
public:
    uint8_t swf_[YO2_TAIL(0x400, CElement)];
};
// TODO(Swf) FUN_0066d7a0: new movie under `parent` at `priority` from a list file; `flag` 1 = keep its own size
CSwfEngine* swfCreate(CTask* parent, uint32_t priority, const vc6::string& path, int32_t flag);
void swfPlay(CSwfEngine* s, int32_t loop);                      // TODO(Swf) FUN_0066e390
void swfPlayLabel(CSwfEngine* s, int32_t loop, const char* label);   // TODO(Swf) FUN_0066f550 (label by value)
uint8_t& swfHold(CSwfEngine* s);                                // TODO(Swf) +0x3e4: keep the current frame
uint8_t& swfEnded(CSwfEngine* s);                               // TODO(Swf) +0x3f1: the movie ran out

// The card manager's lookups (yo2CardManager, DAT_012a6e48; labelled System).
CCard* cardAt(uint32_t side, int32_t zone, uint32_t index);      // TODO(System) FUN_00760f40
bool cardSettled(uint32_t side, int32_t zone, uint32_t index);   // TODO(System) FUN_00761060
// The LP gauge of side j (CDuelScene + 0xa9c + j * 0x44): show `amount` taken at `slot` (-1 = the player)
void lpGaugeDamage(uint32_t side, int32_t amount, int32_t slot, bool flag);   // TODO(scene1) FUN_007cefc0
void playSe(uint32_t id, int32_t v);                            // TODO(System) FUN_00686560 (sound by id)
CWindowTaskModel* sceneModalWindow();                           // TODO(scene1) CDuelScene +0x104 CTaskPtr get

class CBattleManager : public CGameObject, public CTaskUser {
public:
    CBattleManager();                     // FUN_007544e0
    ~CBattleManager() override;           // FUN_00754660
    bool isActive() const override;       // FUN_00754600 slot 1: attacking (states 4, 6, 7)
    void update() override;               // FUN_00754980 slot 2
    void draw() override;                 // FUN_00754bb0 slot 3

    bool isFighter(uint32_t side, int32_t slot) const;   // FUN_00754810
    void setResult(int32_t d0, int32_t d1, uint32_t f0, uint32_t f1);   // FUN_00754790
    void clearFighter(int32_t which);     // FUN_00754930
    void clearFighters();                 // FUN_00754960

    int32_t state = 0;          // 0x14 0 idle, 1 armed, 2 attacker picked, 3 aiming, 4 attacking, 5, 6 removed, 7 hit, 8 done
    int32_t counter = 0;        // 0x18 frames into the state (in 1/256 steps)
    uint32_t attackerSide = 0;  // 0x1c
    int32_t attackerSlot = -1;  // 0x20
    uint32_t attackerUid = 0;   // 0x24 the attacker's serial (it may move away)
    uint32_t targetSide = 0;    // 0x28
    int32_t targetSlot = -1;    // 0x2c 5 and up: a direct attack
    uint32_t targetUid = 0;     // 0x30
    int32_t damage[2] = {};     // 0x34 per player
    uint32_t flags[2] = {};     // 0x3c per player: 1 defense, 2 destroyed, 8 to the other player, 0x10 no gauge
    CTaskPtr<CSwfEngine> movie; // 0x44 duel_ef_attack_a
    PlaneLoader sheets;         // 0x50 attack_new.txt: 0 arrow, 1 hit, 3 card cut
};
YO2_AT(CBattleManager, state, 0x14);
YO2_AT(CBattleManager, attackerSide, 0x1c);
YO2_AT(CBattleManager, targetSlot, 0x2c);
YO2_AT(CBattleManager, damage, 0x34);
YO2_AT(CBattleManager, flags, 0x3c);
YO2_AT(CBattleManager, movie, 0x44);
YO2_AT(CBattleManager, sheets, 0x50);
YO2_SIZEOF(CBattleManager, 0x88);

#if YO2_IN_EXE
#define g_battleManager YO2_EXE_VAR(CBattleManager*, 0x012a6790)
#define g_attackAngle YO2_EXE_VAR(int32_t, 0x012a6794)
#else
extern CBattleManager* g_battleManager;   // DAT_012a6790
extern int32_t g_attackAngle;             // DAT_012a6794 the arrow's last angle (the hit movie turns to it)
#endif

// The engine's calls (all on g_battleManager).
void battleStart(uint32_t attackerSide);          // FUN_00754040
void battleReset();                               // FUN_007541e0
void battleRestart();                             // FUN_00754200
void battleSetAttackerSlot(int32_t slot);         // FUN_00754270
void battleSetAttacker(uint32_t side, int32_t slot);   // FUN_007542b0
void battleAim();                                 // FUN_00754340
void battleSetTarget(int32_t side, int32_t slot); // FUN_00754360
bool battleActive();                              // FUN_00754400
void battleSetResult(int32_t d0, int32_t d1, uint32_t f0, uint32_t f1);   // FUN_00754430
bool battleIsFighter(uint32_t side, int32_t slot);   // FUN_00754460
void battleClearFighter(int32_t which);           // FUN_00754490
void battleClearFighters();                       // FUN_007544c0

// A card's serial on the mat (word 0 bit 14 + bits 23..30 * 2), how the manager recognises the fighters.
uint32_t slotUid(uint32_t side, int32_t slot);

}   // namespace ds
