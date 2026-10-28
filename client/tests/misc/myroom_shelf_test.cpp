// src/MyRoom/yo2DuelDiscShelf.cpp: CDuelDiskShelf (boards, the two disk switches, the case) and CDisplayDueldisk.
// sources: MyRoom/yo2DuelDiscShelf.cpp System/*.cpp System/window/*.cpp Game/yo2TgtAvaListDlg.cpp
#include <cstdio>
#include <cstring>
#include <set>
#include <string>
#include <vector>

#include "../game/window_stubs.h"
#include "../system/d3d8_fake.cpp"
#include "Game/yo2TgtAvaListDlg.h"
#include "MyRoom/myRoomExt.h"
#include "MyRoom/yo2DuelDiscShelf.h"
#include "System/yo2ZSort.h"

#define CHECK(c) \
    do { if (!(c)) { std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #c); std::exit(1); } } while (0)

// ---- System's own link needs (as changeavatar_test.cpp)
CElement* screenFaderNew(CTask* parent, uint32_t priority) { return CElement::newChild(parent, priority); }
bool screenFaderFinished(CElement*) { return true; }
bool screenFaderIdle(CElement*) { return true; }
CElement* appSceneLayer() { return nullptr; }
bool yo2LoadFile(const char*, std::vector<uint8_t>&) { return false; }
std::set<int> g_keysDown;
#ifndef _WIN32
SHORT GetAsyncKeyState(int) { return 0; }
#endif

// ---- myRoomExt.h doubles
std::vector<uint32_t> g_sounds;
bool soundPlay(uint32_t id, int32_t) { return g_sounds.push_back(id), true; }
struct FakeSwitch : CWindowTaskControll {
    void layout() override {}
    bool hitTest(float, float) override { return false; }
    CTask* owner = nullptr;
    IWindowTaskMediator* mediator = nullptr;
    std::string images[4];
};
FakeSwitch* sw(CWindowTaskControll* c) { return static_cast<FakeSwitch*>(c); }
CWindowTaskControll* pictureSwitchCreate(CTask* parent, CTask* owner, IWindowTaskMediator* m) {
    auto* s = new FakeSwitch;
    s->owner = owner;
    s->mediator = m;
    return dynamic_cast<CWindowTaskControll*>(s->create(parent, 10000));
}
void pictureSwitchSetImages(CWindowTaskControll* s, const char* a, const char* b, const char* c, const char* d) {
    sw(s)->images[0] = a, sw(s)->images[1] = b, sw(s)->images[2] = c, sw(s)->images[3] = d;
}
void pictureSwitchSetPos(CWindowTaskControll* s, float x, float y) { s->pos_.x = x, s->pos_.y = y; }
int g_loads;
int32_t g_shelf[12] = {0, 9, -1, 0x27, 7, 8, -1, -1, -1, -1, -1, 1};
CPlayerDataManager* playerData() { return reinterpret_cast<CPlayerDataManager*>(&g_shelf); }
void playerDataLoad(CPlayerDataManager*) { g_loads++; }
int32_t playerDataShelfDisk(CPlayerDataManager*, int32_t slot) { return g_shelf[slot]; }
int g_listOpens;
void duelDiskListOpen(CElement*, CDuelDiskShelf*) { g_listOpens++; }

static void frame(CTask* root) {
    root->call(&g_tmMain);
    CTask::flushDeleted();
}

int main() {
    g_zsortSet = new CZSortSet;
    CWindowTaskFactory::create();
    CTask* root = CTask::createRoot();
    CElement* layer = CElement::newChild(root, 1);

    // the picture names
    CHECK(displayDiskImage(0, false) == "data/Map/Map_switch/Mapdisk_dd_01_c01_01.png");
    CHECK(displayDiskImage(9, true) == "data/Map/Map_switch/Mapdisk_da_01_c02_02.png");
    CHECK(displayDiskImage(0x27, false) == "data/Map/Map_switch/Mapdisk_da_01_c08_01.png");
    CHECK(displayDiskImage(8, false) == "data/Map/Map_switch/Mapdisk_da_01_c01_01.png");   // unknown: the first
    CHECK(g_diskSwitchImages[1][3] == "data/Map/Map_switch/Map_disk_d01_03.png");

    CDuelDiskShelf* s = CDuelDiskShelf::create(root, layer);
    CHECK(s != nullptr);
    frame(root);
    CHECK(g_loads == 1 && s->layer_ == nullptr && s->base_.task() && s->base_->instName() == "デュエルディスクの棚");
    CHECK(s->base_->pos_.z == 1.0f && s->base_->inheritTransform_);

    // boards
    for (int i = 0; i < CDuelDiskShelf::BOARDS; i++) {
        CSpriteElm* b = s->boards_[i].get();
        CHECK(b->texture == "data/Map/Map_r01/Map_r01_0301_obj.png" && b->parent() == s->base_.task());
        CHECK(b->pos_.x == 52 && b->pos_.z == 50 - 10 * i);
    }
    CHECK(s->boards_[4]->pos_.y == 299 && s->boards_[4]->instName() == "棚板[4]");

    // switches: on board 0, the DM disk at (154, 0), the GX one at (77, 51)
    FakeSwitch* dm = sw(s->switches_[0].get());
    FakeSwitch* gx = sw(s->switches_[1].get());
    CHECK(dm->parent() == s->boards_[0].task() && dm->owner == s && dm->mediator == s);
    CHECK(dm->pos_.x == 154 && dm->pos_.y == 0 && dm->pos_.z == 5 && dm->z_ == 5000 && dm->unk364_ == 0);
    CHECK(gx->pos_.x == 77 && gx->pos_.y == 51 && gx->unk364_ == 1);
    CHECK(dm->images[0] == "data/Map/Map_switch/Map_disk_a01_01.png" && gx->images[2] == g_diskSwitchImages[1][2].c_str());
    CHECK(dm->instName() == "デュエルディスク型スイッチ[0]");

    // displayed disks: boards 1..4, three each, at board + slot offset, z + 5
    CDisplayDueldisk* d0 = s->displayed_[0].get();
    CHECK(d0->sprite_->pos_.x == 52 + 154 && d0->sprite_->pos_.y == 109 && d0->sprite_->pos_.z == 45);
    CDisplayDueldisk* d11 = s->displayed_[11].get();
    CHECK(d11->sprite_->pos_.x == 52 && d11->sprite_->pos_.y == 299 + 102 && d11->sprite_->pos_.z == 15);
    CHECK(d0->disk_ == 0 && d0->sprite_->texture == displayDiskImage(0, false) && d0->sprite_->isVisible(true));
    CHECK(s->displayed_[2]->disk_ == -1 && s->displayed_[2]->sprite_->texture.empty());   // never set: no picture
    CHECK(d0->sprite_->instName() == "デュエルディスクのえ");
    d0->setDisk(-1);
    CHECK(!d0->sprite_->isVisible(true));
    d0->setDisk(5);
    CHECK(d0->sprite_->isVisible(true) && d0->sprite_->texture == displayDiskImage(5, false));

    // the case
    FakeSwitch* box = sw(s->case_.get());
    CHECK(box->parent() == s->base_.task() && box->pos_.x == 52 && box->pos_.y == 147 && box->pos_.z == 56);
    CHECK(box->images[3] == "data/Map/Map_switch/Mapdisk_case_03.png" && box->instName() == "ディスクケース型スイッチ");

    // presses
    CHECK(s->picked_ == CDuelDiskShelf::NONE);
    s->onControlEvent(gx);
    CHECK(s->picked_ == 1 && g_sounds.size() == 1 && g_sounds[0] == SE_DISK_SWITCH);
    s->onControlEvent(box);
    CHECK(s->picked_ == CDuelDiskShelf::NONE && g_listOpens == 1 && g_gameCtrl.now() == 0xe);

    // while another UI has the game: the switches are off and the case does nothing
    s->picked_ = 0;
    frame(root);
    CHECK(s->picked_ == CDuelDiskShelf::NONE && !dm->enabled_ && !gx->enabled_ && !box->enabled_);
    s->onControlEvent(box);
    CHECK(g_listOpens == 1);
    g_gameCtrl.leave(0xe);
    frame(root);
    CHECK(dm->enabled_ && box->enabled_);

    s->destroy(__FILE__, __LINE__);
    frame(root);
    std::puts("myroom_shelf ok");
    return 0;
}
