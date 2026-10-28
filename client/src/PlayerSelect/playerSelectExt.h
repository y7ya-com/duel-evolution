// What src/PlayerSelect calls in other folders that main doesn't have yet (tests/misc doubles them). Each says the
// exe function it stands for; names shared with loginExt.h / titleExt.h keep their signatures.
#pragma once
#include <cstdint>

#include "System/vc6.h"

class CTask;
class CElement;
class CEasyTask;
class CAvatarData;

// ---- src/System ----
CEasyTask* bgCommonNew(CTask* parent, CElement* layer, int32_t bg, int32_t arg);   // CBgCommon::New 0xa0a030
bool soundPlay(uint32_t id, int32_t fadeFrames);                                    // 0x686560
bool systemConfigPlayerDeleteLocked();   // CSystemConfigManager (DAT_0127188c) vf38 (0x98): no character deletes
// The player data folder manager (DAT_012714c4): the player's folder, its sub folders and its deck file name.
struct CPlayerDataManager;
CPlayerDataManager* playerData();                                    // 0x00814f40 (inline here) returns DAT_012714c4
vc6::string playerDataDir(CPlayerDataManager* p);                    // 0x00618600: <data>\<player>
void playerDataSetPlayer(CPlayerDataManager* p, vc6::string name);   // 0x00618300: makes the folders, loads player.bin
bool playerDataSave(CPlayerDataManager* p);                          // vf0
// The card box (DAT_012714b4, 0x302c bytes; Pack's pack_externs.h): copies of each card id at +9 + id * 3, the
// total at +4, its folder at +0x301c.
struct CCardBox;
CCardBox* cardBox();
bool cardBoxSave(CCardBox* box);   // vf0
// The friend / black list manager.
void fblistInit();                 // CFBlistManager::init
// CGameMng (g_gameMng, DAT_012bb6b0; Game/yo2GameManager.h, which can't share a file with Net's CAvatarData yet)
int32_t gameWorldId();          // +0x448: which of a player's two avatars is shown (0 the DM one, 1 GX)
void gameWorldSyncLists();      // +0x470 = +0x46c (0x0056b320), +0x480 = +0x47c
void gameWorldEnterMyRoom();    // +0x75 = 1: the world connects to My Room next
void avatarValidate(CAvatarData* data, int world, bool checkSeries);   // 0x00a58cc0 (Game/yo2GameManager.cpp)
void avatarCopyLooks(const CAvatarData& from, CAvatarData* to);       // 0x00a58ec0 (Game/yo2GameManager.cpp)
// Keyboard (CVirtualKey::GetDevice(0)->vf2: pushed this frame), DirectInput key codes.
bool keyPushed(int32_t dik);

// ---- src/Game: CWaistUpAvatar, the waist-up avatar picture (0x009e2c40 ...) ----
CElement* waistUpAvatarNew(CTask* parent, CTask* owner, int32_t kind, const CAvatarData* data, int32_t a, int32_t b,
                           int32_t c);                         // 0x009e2c40
void waistUpAvatarSetVisible(CElement* w, bool on);            // 0x009eb670
void waistUpAvatarSetBreathing(CElement* w, bool on);          // 0x009ebd70
void waistUpAvatarSetScale(CElement* w, float s);              // 0x009ebc80
void waistUpAvatarSetPos(CElement* w, float x, float y);       // 0x009eb7b0
void waistUpAvatarGreet(CElement* w);                          // 0x009ebe00
void waistUpAvatarPlay(CElement* w, int32_t motion, int32_t frames);   // 0x009ebff0
void waistUpAvatarSetFace(CElement* w, int32_t face);          // vf9 (+0x24)
