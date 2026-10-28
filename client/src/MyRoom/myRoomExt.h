// What src/MyRoom needs from code other sessions own. Each declaration names the exe function it stands for; the
// game build links the real ones, tests define doubles.
#pragma once
#include <cstdint>

#include "System/vc6.h"

class CTask;
class CElement;
class CWindowTaskControll;
class IWindowTaskMediator;

// ---- System ----
bool soundPlay(uint32_t id, int32_t fadeFrames);   // 0x00686560 (Swf)
constexpr uint32_t SE_DISK_SWITCH = 0x10000000;

// CWindowTaskPictureSwitch (0x3d8, src\System\CWindowTask.cpp): a button drawn from pictures. TODO(System)
CWindowTaskControll* pictureSwitchCreate(CTask* parent, CTask* owner, IWindowTaskMediator* mediator);   // 0x005baf10
void pictureSwitchSetImages(CWindowTaskControll* s, const char* normal, const char* hover, const char* pressed,
                            const char* disabled);                                                  // vf19 0x005bc590
void pictureSwitchSetPos(CWindowTaskControll* s, float x, float y);   // 0x005fc4d0

// The player data folder manager (DAT_012714c4, PlayerSelect/playerSelectExt.h). TODO(System)
struct CPlayerDataManager;
CPlayerDataManager* playerData();                                  // 0x00814f40 (PlayerSelect)
void playerDataLoad(CPlayerDataManager* p);                        // vf1: re-reads player.bin
int32_t playerDataShelfDisk(CPlayerDataManager* p, int32_t slot);  // +0x118 + slot * 4: the disk on shelf slot 0..11
