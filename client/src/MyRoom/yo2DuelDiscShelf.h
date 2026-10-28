// yo2DuelDiscShelf.cpp: the duel disk shelf in My Room. Five shelf boards (sprites); on the top board the two
// duel-disk switches (the DM disk and the GX disk: picking one is the disk the player duels with) and the disk case,
// which opens the disk list (CDuelDiskList) to rearrange the shelf; on the four boards below, the twelve disks on
// display (CDisplayDueldisk), as the player's data has them.
#pragma once
#include <cstdint>

#include "System/window/yo2WindowTask.h"
#include "System/yo2EasyTask.h"
#include "System/yo2TaskPtr.h"

class CSpriteElm;
class CDisplayDueldisk;

class CDuelDiskShelf : public CEasyTask, public IWindowTaskMediator {
public:
    enum : int32_t { BOARDS = 5, SWITCHES = 2, DISPLAYED = 12, NONE = 3 };

    static CDuelDiskShelf* create(CTask* parent, CElement* layer);   // 0x008171c0
    CDuelDiskShelf();
    ~CDuelDiskShelf() override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;
    void onControlEvent(CWindowTaskControll* sender) override;
    void onControlCommand(CWindowTaskControll*) override {}
    void mediatorSlot2(CWindowTaskControll*) override {}
    void mediatorSlot3(CWindowTaskControll*) override {}
    void beginDrag(CWindowTaskControll*, int32_t, int32_t) override {}

    CElement* layer_ = nullptr;                          // 0x74 the parent element until onInit
    CTaskPtr<CElement> base_;                            // 0x78
    CTaskPtr<CSpriteElm> boards_[BOARDS];                // 0x84
    CTaskPtr<CSpriteElm> unkc0_[2];                      // 0xc0 (never set)
    CTaskPtr<CWindowTaskControll> switches_[SWITCHES];   // 0xd8 CTaskPtr<CWindowTaskPictureSwitch>
    int32_t picked_ = NONE;                              // 0xf0 the switch pressed last (NONE while the UI is busy)
    CTaskPtr<CDisplayDueldisk> displayed_[DISPLAYED];    // 0xf4 boards 1..4, three each
    CTaskPtr<CWindowTaskControll> case_;                 // 0x184 CTaskPtr<CWindowTaskPictureSwitch>
    CTaskPtr<CTask> list_;                               // 0x190 CTaskPtr<CWindowModelDueldiskRearrenge>
    uint32_t unk19c_ = 0;

private:
    struct Layout;
};
YO2_SIZEOF(CDuelDiskShelf, 0x1a0);

// A disk on display: a sprite of disk `disk_` (-1 none), lit or not.
class CDisplayDueldisk : public CEasyTask {
public:
    static CDisplayDueldisk* create(CTask* parent, CElement* layer);   // 0x0081a750
    CDisplayDueldisk();
    ~CDisplayDueldisk() override;
    bool onInit() override;
    void setPos(int32_t x, int32_t y, int32_t z);   // 0x0081b020
    void setDisk(int32_t disk);                     // 0x0081b060

    CElement* layer_ = nullptr;        // 0x70
    CTaskPtr<CElement> base_;          // 0x74
    CTaskPtr<CSpriteElm> sprite_;      // 0x80
    int32_t disk_ = -1;                // 0x8c
    bool lit_ = false;                 // 0x90
    uint32_t unk94_ = 0;

private:
    struct Layout;
};
YO2_SIZEOF(CDisplayDueldisk, 0x98);

// "data/Map/Map_switch/Mapdisk_<disk>_0<1 | 2 lit>.png" (0x0081a920)
vc6::string displayDiskImage(int32_t disk, bool lit);

// The disk list window the case opens (0x0081c470 CDuelDiskList::create, 0xb20 bytes). TODO(misc): not ported yet
void duelDiskListOpen(CElement* parent, CDuelDiskShelf* shelf);

// A disk list row (0x44 bytes; CDuelDiskList's): its destructor is 0x0081c170.
struct DuelDiskEntry {
    int32_t disk = 0;          // 0x00
    vc6::string name;          // 0x04
    vc6::string images[3];     // 0x14
};
YO2_SIZEOF(DuelDiskEntry, 0x44);

// The disks' "obj" pictures (0x012ac5b0, DM then GX) and the switches' four looks (0x012ac530).
extern vc6::string g_diskObjImages[2];
extern vc6::string g_diskSwitchImages[2][4];
