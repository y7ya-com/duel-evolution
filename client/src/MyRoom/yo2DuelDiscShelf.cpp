#include "MyRoom/yo2DuelDiscShelf.h"

#include "Game/yo2TgtAvaListDlg.h"   // g_gameCtrl
#include "MyRoom/myRoomExt.h"
#include "System/window/yo2WindowControls.h"
#include "System/yo2Debug.h"
#include "System/yo2Element.h"

struct CDuelDiskShelf::Layout {
    YO2_AT(CDuelDiskShelf, layer_, 0x74);
    YO2_AT(CDuelDiskShelf, base_, 0x78);
    YO2_AT(CDuelDiskShelf, boards_, 0x84);
    YO2_AT(CDuelDiskShelf, switches_, 0xd8);
    YO2_AT(CDuelDiskShelf, picked_, 0xf0);
    YO2_AT(CDuelDiskShelf, displayed_, 0xf4);
    YO2_AT(CDuelDiskShelf, case_, 0x184);
    YO2_AT(CDuelDiskShelf, list_, 0x190);
};
struct CDisplayDueldisk::Layout {
    YO2_AT(CDisplayDueldisk, layer_, 0x70);
    YO2_AT(CDisplayDueldisk, base_, 0x74);
    YO2_AT(CDisplayDueldisk, sprite_, 0x80);
    YO2_AT(CDisplayDueldisk, disk_, 0x8c);
    YO2_AT(CDisplayDueldisk, lit_, 0x90);
};

// @yo2 0x00816bf0 the initializer of g_diskObjImages
// @yo2 0x00816da0 its atexit registration
vc6::string g_diskObjImages[2] = {"data/Map/Map_r01/Map_disk_a01_obj.png", "data/Map/Map_r01/Map_disk_d01_obj.png"};
// @yo2 0x00816e10 the initializer of g_diskSwitchImages
// @yo2 0x00817170 its atexit registration
vc6::string g_diskSwitchImages[2][4] = {
    {"data/Map/Map_switch/Map_disk_a01_01.png", "data/Map/Map_switch/Map_disk_a01_02.png",
     "data/Map/Map_switch/Map_disk_a01_03.png", "data/Map/Map_switch/Map_disk_a01_03.png"},
    {"data/Map/Map_switch/Map_disk_d01_01.png", "data/Map/Map_switch/Map_disk_d01_02.png",
     "data/Map/Map_switch/Map_disk_d01_03.png", "data/Map/Map_switch/Map_disk_d01_03.png"},
};

namespace {

// The boards (0x00ce58f0): each one's position, then its three slots: the disk switch on it (NONE for none) and
// its offset from the board. Only board 0 has switches: the DM disk, the GX disk, then the case's spot.
struct Board {
    int32_t x, y, z;
    struct Slot {
        int32_t id, dx, dy;
    } slots[3];
};
constexpr Board kBoards[CDuelDiskShelf::BOARDS] = {
    {52, 45, 50, {{0, 154, 0}, {1, 77, 51}, {3, 0, 102}}},
    {52, 109, 40, {{3, 154, 0}, {3, 77, 51}, {3, 0, 102}}},
    {52, 172, 30, {{3, 154, 0}, {3, 77, 51}, {3, 0, 102}}},
    {52, 236, 20, {{3, 154, 0}, {3, 77, 51}, {3, 0, 102}}},
    {52, 299, 10, {{3, 154, 0}, {3, 77, 51}, {3, 0, 102}}},
};

}  // namespace

// @yo2 0x0081a100 the board and slot of switch `id`
static void findSwitch(int32_t* board, int32_t* slot, int32_t id) {
    for (int32_t b = 0; b < CDuelDiskShelf::BOARDS; b++)
        for (int32_t s = 0; s < 3; s++)
            if (kBoards[b].slots[s].id == id) {
                *board = b;
                *slot = s;
                return;
            }
    YO2_ASSERT(false, "no disk pos [%d]", id);
}

// @yo2 0x008171c0 CDuelDiskShelf::create
CDuelDiskShelf* CDuelDiskShelf::create(CTask* parent, CElement* layer) {
    auto* s = new CDuelDiskShelf;
    s->layer_ = layer;
    return dynamic_cast<CDuelDiskShelf*>(s->CTask::create(parent, 10000));
}

// @yo2 0x008172a0 CDuelDiskShelf::CDuelDiskShelf
CDuelDiskShelf::CDuelDiskShelf() { setTaskName("CDuelDiskShelf"); }
// @yo2 0x008175c0 CDuelDiskShelf::~CDuelDiskShelf
// @yo2 0x00817550 CDuelDiskShelf deleting destructor
CDuelDiskShelf::~CDuelDiskShelf() = default;
// The empty IWindowTaskMediator slots it overrides (inline in the header):
// @yo2 0x008174d0 CDuelDiskShelf::onControlCommand
// @yo2 0x008174f0 CDuelDiskShelf::mediatorSlot2
// @yo2 0x00817510 CDuelDiskShelf::mediatorSlot3
// @yo2 0x00817530 CDuelDiskShelf::beginDrag

// @yo2 0x008176e0 CDuelDiskShelf::onInit
bool CDuelDiskShelf::onInit() {
    playerDataLoad(playerData());
    base_.setUser(this);
    base_.set(CElement::newChild(layer_, 10000));
    layer_ = nullptr;
    YO2_ASSERT(base_.task() != nullptr, "error CDuelDiskShelf::m_pBaseElm::Create()");
    base_->setInstName("デュエルディスクの棚");
    base_->pos_.z = 1.0f;
    base_->inheritTransform_ = true;

    for (int32_t i = 0; i < BOARDS; i++) {
        boards_[i].setUser(this);
        windowSpriteCreate(boards_[i], base_.get(), 10000, "data/Map/Map_r01/Map_r01_0301_obj.png");
        YO2_ASSERT(boards_[i].task() != nullptr, "error CDuelDiskShelf::m_pPlate[%d]::Create()", i);
        CElement* e = windowElement(boards_[i]);
        e->setInstName(yo2Format("棚板[%d]", i));
        e->setDrawMode(2);
        e->inheritTransform_ = true;
        e->pos_ = {static_cast<float>(kBoards[i].x), static_cast<float>(kBoards[i].y),
                   static_cast<float>(kBoards[i].z)};
    }

    for (int32_t i = 0; i < SWITCHES; i++) {
        int32_t b, s;
        findSwitch(&b, &s, i);
        const Board::Slot& slot = kBoards[b].slots[s];
        switches_[i].setUser(this);
        switches_[i].set(pictureSwitchCreate(boards_[b].task(), this, this));
        YO2_ASSERT(switches_[i].task() != nullptr, "CWindowTaskPictureSwitch NULL error");
        CWindowTaskControll* sw = switches_[i].get();
        sw->setInstName(yo2Format("デュエルディスク型スイッチ[%d]", i));
        const vc6::string* look = g_diskSwitchImages[i];
        pictureSwitchSetImages(sw, look[0].c_str(), look[1].c_str(), look[2].c_str(), look[3].c_str());
        sw->unk364_ = static_cast<uint32_t>(i);
        sw->z_ = sw->pos_.z = 5000.0f;
        sw->inheritTransform_ = true;
        sw->pos_ = {static_cast<float>(slot.dx), static_cast<float>(slot.dy), 5.0f};
    }

    for (int32_t b = 1; b < BOARDS; b++)
        for (int32_t s = 0; s < 3; s++) {
            CTaskPtr<CDisplayDueldisk>& d = displayed_[(b - 1) * 3 + s];
            d.setUser(this);
            d.set(CDisplayDueldisk::create(this, base_.get()));
            YO2_ASSERT(d.task() != nullptr, "飾ってあるデュエルディスクの初期化に失敗");
            d->setInstName("飾ってあるデュエルディスク");
            d->setPos(kBoards[b].x + kBoards[b].slots[s].dx, kBoards[b].y + kBoards[b].slots[s].dy, kBoards[b].z + 5);
        }
    for (int32_t i = 0; i < DISPLAYED; i++)
        displayed_[i]->setDisk(playerDataShelfDisk(playerData(), i));

    case_.setUser(this);
    case_.set(pictureSwitchCreate(base_.get(), this, this));
    YO2_ASSERT(case_.task() != nullptr, "ディスクケースの初期化に失敗");
    case_->setInstName("ディスクケース型スイッチ");
    const Board& top = kBoards[0];
    pictureSwitchSetPos(case_.get(), static_cast<float>(top.x + top.slots[2].dx),
                        static_cast<float>(top.y + top.slots[2].dy));
    case_->z_ = case_->pos_.z = static_cast<float>(top.z + 6);
    pictureSwitchSetImages(case_.get(), "data/Map/Map_switch/Mapdisk_case_01.png",
                           "data/Map/Map_switch/Mapdisk_case_02.png", "data/Map/Map_switch/Mapdisk_case_03.png",
                           "data/Map/Map_switch/Mapdisk_case_03.png");
    list_.setUser(this);
    return true;
}

// @yo2 0x00819fa0 CDuelDiskShelf::onMain: the switches only work while no other UI has the game
bool CDuelDiskShelf::onMain() {
    bool idle = g_gameCtrl.now() == 0;
    if (!idle) picked_ = NONE;
    for (auto& s : switches_)
        s->enabled_ = idle;
    case_->enabled_ = idle;
    return true;
}

// @yo2 0x0081a060 CDuelDiskShelf::onDestroy
void CDuelDiskShelf::onDestroy() {
    if (base_.task()) base_->destroy(__FILE__, __LINE__);
    if (list_.task()) list_->destroy(__FILE__, __LINE__);
}

// @yo2 0x0081a280 CDuelDiskShelf::onControlEvent: a disk switch picks that disk; the case opens the disk list
void CDuelDiskShelf::onControlEvent(CWindowTaskControll* sender) {
    picked_ = NONE;
    for (int32_t i = 0; i < SWITCHES; i++)
        if (sender == switches_[i].task()) {
            soundPlay(SE_DISK_SWITCH, 0);
            yo2Trace("[%d]のデュエルディスク押された！\n", i);
            picked_ = i;
        }
    if (sender == case_.task() && g_gameCtrl.now() == 0 && !list_.task()) {
        duelDiskListOpen(dynamic_cast<CElement*>(base_.task()), this);
        g_gameCtrl.enter(0xe);
    }
}

// @yo2 0x0081a750 CDisplayDueldisk::create
CDisplayDueldisk* CDisplayDueldisk::create(CTask* parent, CElement* layer) {
    auto* d = new CDisplayDueldisk;
    d->layer_ = layer;
    return dynamic_cast<CDisplayDueldisk*>(d->CTask::create(parent, 10000));
}

// @yo2 0x0081a530 CDisplayDueldisk::CDisplayDueldisk
CDisplayDueldisk::CDisplayDueldisk() { setTaskName("飾られているデュエルディスク"); }
// @yo2 0x0081a6c0 CDisplayDueldisk::~CDisplayDueldisk
// @yo2 0x0081a690 CDisplayDueldisk deleting destructor
CDisplayDueldisk::~CDisplayDueldisk() = default;

// @yo2 0x0081a810 CDisplayDueldisk::onInit: an empty sprite until setDisk
bool CDisplayDueldisk::onInit() {
    base_.setUser(this);
    base_.set(CElement::newChild(layer_, 10000));
    base_->inheritTransform_ = true;
    disk_ = -1;
    lit_ = false;
    sprite_.setUser(this);
    windowSpriteCreate(sprite_, base_.get(), 10000);
    windowNameTask(sprite_.task(), "デュエルディスクのえ");
    CElement* e = windowElement(sprite_);
    e->inheritTransform_ = true;
    e->setDrawMode(2);
    return true;
}

// @yo2 0x0081b020 CDisplayDueldisk::setPos
void CDisplayDueldisk::setPos(int32_t x, int32_t y, int32_t z) {
    windowElement(sprite_)->pos_ = {static_cast<float>(x), static_cast<float>(y), static_cast<float>(z)};
}

namespace {
struct TaskLockAccess : CTask {
    static void unlock(CTask* t, uint32_t mask) { t->*(&TaskLockAccess::lockFlags_) &= ~mask; }
};
}  // namespace

// @yo2 0x0081b060 CDisplayDueldisk::setDisk
void CDisplayDueldisk::setDisk(int32_t disk) {
    if (disk == disk_) return;
    disk_ = disk;
    CElement* e = windowElement(sprite_);
    if (disk == -1) {
        e->setDisp(false, true);
        return;
    }
    TaskLockAccess::unlock(e, 2);
    e->setDisp(true, true);
    windowSpriteTexture(sprite_, displayDiskImage(disk_, lit_));
}

// @yo2 0x0081a920
vc6::string displayDiskImage(int32_t disk, bool lit) {
    // The pictures, in the exe's table order: a "da" (DM) or "dd" (GX) disk, its series and color.
    static const char* const kImages[] = {
        "da_01_c01", "da_01_c02", "da_01_c03", "da_02_c01", "da_02_c02", "da_02_c03", "da_02_c04", "dd_01_c01",
        "dd_01_c02", "dd_01_c03", "dd_02_c01", "dd_02_c02", "dd_02_c03", "dd_02_c04", "da_01_c04", "dd_01_c04",
        "da_01_c05", "dd_01_c05", "da_03_c01", "da_03_c02", "da_03_c03", "da_03_c04", "dd_03_c01", "dd_03_c02",
        "dd_03_c03", "dd_03_c04", "da_01_c06", "da_01_c08", "da_01_c07",
    };
    int32_t i = 0;
    switch (disk) {
    case 0: i = 7; break;
    case 1: i = 8; break;
    case 2: i = 9; break;
    case 3: i = 10; break;
    case 4: i = 11; break;
    case 5: i = 12; break;
    case 6: i = 13; break;
    case 7: i = 22; break;
    case 9: i = 1; break;
    case 10: i = 2; break;
    case 11: i = 3; break;
    case 12: i = 4; break;
    case 13: i = 5; break;
    case 14: i = 6; break;
    case 15: i = 18; break;
    case 16: i = 23; break;
    case 17: i = 24; break;
    case 18: i = 25; break;
    case 19: i = 15; break;
    case 20: i = 17; break;
    case 0x20: i = 19; break;
    case 0x21: i = 20; break;
    case 0x22: i = 21; break;
    case 0x23: i = 14; break;
    case 0x24: i = 16; break;
    case 0x25: i = 26; break;
    case 0x26: i = 28; break;
    case 0x27: i = 27; break;
    default: break;
    }
    vc6::string path = "data/Map/Map_switch/Mapdisk_";
    path += kImages[i];
    path += lit ? "_02.png" : "_01.png";
    return path;
}

// @yo2 0x0081c170 DuelDiskEntry::~DuelDiskEntry (implicit)
