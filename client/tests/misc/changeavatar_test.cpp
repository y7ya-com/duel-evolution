// src/ChangeAvatar: CWindowDialogAvatarSwitch (the dressing window), CChangeAvatarPack (avatars + picture + window)
// and CChangeAvaterScene (the screen: where the avatars come from and go to).
// sources: ChangeAvatar/*.cpp System/*.cpp System/window/*.cpp Game/yo2TgtAvaListDlg.cpp Game/yo2PlayerBin.cpp Game/yo2GameData.cpp Game/Avatar/yo2AvatarData.cpp
#include <cmath>
#include <cstdio>
#include <cstring>
#include <map>
#include <string>
#include <tuple>
#include <vector>

#include "../game/window_stubs.h"
#include "../system/d3d8_fake.cpp"
#include "ChangeAvatar/changeAvatarExt.h"
#include "ChangeAvatar/yo2ChangeAvatar.h"
#include "ChangeAvatar/yo2ChangeAvatarScene.h"
#include "Game/yo2PlayerBin.h"
#include "Net/NetTasks.h"
#include "System/yo2SceneManager.h"
#include "System/yo2StringDB.h"
#include "System/yo2ZSort.h"

#define CHECK(c) \
    do { if (!(c)) { std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #c); std::exit(1); } } while (0)

// ---- System's own link needs (as login_test.cpp)
int g_fakeFaderState;
CElement* screenFaderNew(CTask* parent, uint32_t priority) { return CElement::newChild(parent, priority); }
bool screenFaderFinished(CElement*) { return g_fakeFaderState == 3; }
bool screenFaderIdle(CElement*) { return g_fakeFaderState == 0; }
CElement* g_layer;
CElement* appSceneLayer() { return g_layer; }
bool yo2LoadFile(const char*, std::vector<uint8_t>&) { return false; }
std::set<int> g_keysDown;
#ifndef _WIN32
SHORT GetAsyncKeyState(int vk) { return g_keysDown.count(vk) ? SHORT(0x8000) : 0; }
#endif
struct FakeText : CStringDB {   // "T" + the id in hex
    vc6::string get(uint32_t i) const override {
        char s[16];
        std::snprintf(s, sizeof s, "T%x", i);
        return s;
    }
};
std::u16string u(const char* s) { return std::u16string(s, s + std::strlen(s)); }

// ---- src/Net doubles: the PBIN bits, the character record, the two tasks the scene makes
bool CPlayerBinData::flag(uint32_t bit) const { return pbin[bit >> 3] >> (bit & 7) & 1; }
void CPlayerBinData::setFlag(uint32_t bit, bool on) {
    const uint8_t m = uint8_t(1 << (bit & 7));
    pbin[bit >> 3] = on ? pbin[bit >> 3] | m : pbin[bit >> 3] ^ m;
}
CPlayerInfo::CPlayerInfo() = default;
CPlayerInfo g_me;
CPlayerBinData g_accountBin{};
CPlayerInfo* accountActivePlayer() { return &g_me; }
CPlayerBinData* accountPlayerBin() { return &g_accountBin; }
CNetAccountTask* g_account;
CNetAccountTask::CNetAccountTask() = default;
CNetAccountTask::~CNetAccountTask() { g_account = nullptr; }
bool CNetAccountTask::onInit() { return true; }
bool CNetAccountTask::onMain() { return true; }
void CNetAccountTask::onDestroy() {}
CNetAccountTask* CNetAccountTask::spawn(CTask* parent, CTask*) {
    return g_account = dynamic_cast<CNetAccountTask*>((new CNetAccountTask)->create(parent, 10000));
}
CNetLobbyTask* g_lobby;
int g_regAvatars;
CNetLobbyTask::CNetLobbyTask() = default;
CNetLobbyTask::~CNetLobbyTask() { g_lobby = nullptr; }
bool CNetLobbyTask::onInit() { return true; }
bool CNetLobbyTask::onMain() { return true; }
CNetLobbyTask* CNetLobbyTask::spawn(CTask* parent) {
    return g_lobby = dynamic_cast<CNetLobbyTask*>((new CNetLobbyTask)->create(parent, 10000));
}
bool CNetLobbyTask::regAvatar() {
    g_regAvatars++;
    busy = BUSY_WORKING;
    return true;
}

// ---- changeAvatarExt.h doubles
std::vector<std::pair<int32_t, CTask*>> g_bgs;
CEasyTask* bgCommonNew(CTask* parent, CElement*, int32_t bg, int32_t) {
    auto* t = new CEasyTask;
    t->create(parent, 0);
    g_bgs.push_back({bg, t});
    return t;
}
std::vector<uint32_t> g_sounds;
bool soundPlay(uint32_t id, int32_t) { return g_sounds.push_back(id), true; }
std::vector<std::string> g_fades;
void screenFaderFadeOut(CElement*, int32_t frames, int32_t z) { g_fades.push_back("out" + std::to_string(frames) + "/" + std::to_string(z)); }
void screenFaderFadeIn(CElement*, int32_t frames, int32_t z) { g_fades.push_back("in" + std::to_string(frames) + "/" + std::to_string(z)); }
struct FakePlayerData {
    uint8_t avatar[16];
    int saves;
} g_playerData;
CPlayerDataManager* playerData() { return reinterpret_cast<CPlayerDataManager*>(&g_playerData); }
void playerDataSetAvatar(CPlayerDataManager*, const uint8_t bytes[16]) { std::memcpy(g_playerData.avatar, bytes, 16); }
bool playerDataSave(CPlayerDataManager*) { return ++g_playerData.saves, true; }

struct FakeSwitch : CWindowTaskControll {
    void layout() override {}
    bool hitTest(float, float) override { return false; }
    CTask* owner = nullptr;
    std::string image, images[4];
    PictureRect looks[4] = {};
    float x = 0, y = 0;
    bool selected = false;
};
FakeSwitch* sw(CWindowTaskControll* c) { return static_cast<FakeSwitch*>(c); }
FakeSwitch* sw(const CTaskPtr<CWindowTaskControll>& p) { return sw(p.get()); }
CWindowTaskControll* pictureSwitchCreate(CTask* parent, CTask* owner, IWindowTaskMediator* m) {
    auto* s = new FakeSwitch;
    s->owner = owner;
    s->setMediator(m);
    return dynamic_cast<CWindowTaskControll*>(s->create(parent, 10000));
}
void pictureSwitchSetImage(CWindowTaskControll* s, const char* path, const PictureRect looks[4]) {
    sw(s)->image = path;
    std::memcpy(sw(s)->looks, looks, sizeof sw(s)->looks);
}
void pictureSwitchSetImages(CWindowTaskControll* s, const char* a, const char* b, const char* c, const char* d) {
    sw(s)->images[0] = a, sw(s)->images[1] = b, sw(s)->images[2] = c, sw(s)->images[3] = d;
}
void pictureSwitchSetPos(CWindowTaskControll* s, float x, float y) {
    sw(s)->x = s->pos_.x = x;
    sw(s)->y = s->pos_.y = y;
}
float pictureSwitchY(CWindowTaskControll* s) { return sw(s)->y; }
float pictureSwitchHeight(CWindowTaskControll* s) { return float(sw(s)->looks[0].h); }
void pictureSwitchSetSelected(CWindowTaskControll* s, bool on) { sw(s)->selected = on; }

int32_t g_worldState = 1, g_worldId, g_lobbyRank, g_prevLobbyRank = 7;
bool g_enterMyRoom;
int32_t gameWorldState() { return g_worldState; }
int32_t gameWorldId() { return g_worldId; }
int32_t gameWorldPrevLobbyRank() { return g_prevLobbyRank; }
void gameWorldSetLobbyRank(int32_t rank) { g_lobbyRank = rank; }
void gameWorldEnterMyRoom() { g_enterMyRoom = true; }
int g_waDictObject;
CWADictionary* gameWorldWaDictionary() { return reinterpret_cast<CWADictionary*>(&g_waDictObject); }
CPbinDictionary* g_dict;
CPbinDictionary* gameWorldPbinDictionary() { return g_dict; }
std::vector<int> g_validated;
void avatarValidate(CAvatarData*, int world, bool checkSeries) { g_validated.push_back(world * 10 + checkSeries); }
int g_copies;
void avatarCopyLooks(const CAvatarData& from, CAvatarData* to) {
    for (int i = 1; i < CAvatarData::SIZE; i++)
        to->bytes_[i] = from.bytes_[i];
    g_copies++;
}
std::vector<std::string> g_waAsked;
int32_t waDictionaryCount(CWADictionary* d, int32_t sex, int32_t slot, int32_t world) {
    CHECK(d == gameWorldWaDictionary());
    g_waAsked.push_back(std::to_string(sex) + "/" + std::to_string(slot) + "/" + std::to_string(world));
    return 0xff;   // the end of the PBINs looked at (from the slot's first)
}
vc6::wstring playerBinName(uint32_t pbin) {
    char s[16];
    std::snprintf(s, sizeof s, "P%x", pbin);
    return windowWiden(s);
}
struct FakeWaistUp : CElement {
    CAvatarData data;
    int32_t kind = 0, a = 0, b = 0, c = 0;
    CTask* owner = nullptr;
    float scale = 0, x = -1, y = -1;
    bool breathing = false;
    std::vector<std::pair<int32_t, int32_t>> changes;
    ~FakeWaistUp() override;
};
FakeWaistUp* g_waistUp;
FakeWaistUp::~FakeWaistUp() { g_waistUp = nullptr; }
CElement* waistUpAvatarNew(CTask* parent, CTask* owner, int32_t kind, const CAvatarData* data, int32_t a, int32_t b,
                           int32_t c) {
    auto* w = new FakeWaistUp;
    w->owner = owner, w->kind = kind, w->a = a, w->b = b, w->c = c;
    w->data.set(data->bytes_);
    return g_waistUp = dynamic_cast<FakeWaistUp*>(w->create(parent, 10000));
}
FakeWaistUp* wu(CElement* e) { return static_cast<FakeWaistUp*>(e); }
void waistUpAvatarSetBreathing(CElement* w, bool on) { wu(w)->breathing = on; }
void waistUpAvatarSetScale(CElement* w, float s) { wu(w)->scale = s; }
void waistUpAvatarSetPos(CElement* w, float x, float y) { wu(w)->x = x, wu(w)->y = y; }
bool waistUpAvatarChangePart(CElement* w, int32_t slot, int32_t value) {
    wu(w)->changes.push_back({slot, value});
    wu(w)->data.bytes_[slot] = uint8_t(value);
    return true;
}
void waistUpAvatarGetData(CElement* w, CAvatarData* out) { out->set(wu(w)->data.bytes_); }

// ---- helpers
static void frame(CTask* root) {
    root->call(&g_tmMain);
    CTask::flushDeleted();
}
static void addPbin(int pbin, int number, int kind, int slot, int series, bool owned) {
    g_dict->info_[pbin] = PbinInfo{pbin, number, 0, kind, slot, 0, series};
    if (owned)
        g_accountBin.setFlag(pbin, true);
}
static bool shown(CElement* e) { return e->isVisible(true) && !e->isLocked(2); }
static std::u16string textOf(CWindowTaskText* t) { return std::u16string(std::u16string_view(elmOf(t)->text)); }
static int shownItems(CWindowDialogAvatarSwitch* w) {
    int n = 0;
    for (auto& i : w->items_)
        n += shown(i.get());
    return n;
}

int main() {
    g_zsortSet = new CZSortSet;   // never destroyed: its queues still name tasks freed by the tests
    FakeText text;
    g_stringDB = &text;
    CWindowTaskFactory::create();
    CTask* root = CTask::createRoot();
    g_layer = CElement::newChild(root, 1);
    CSceneMng* mng = CSceneMng::newChild(root, 2);
    CSceneMng::registerScene(SCENE_MY_ROOM, [](CTask* p, CElement* l) { return CSceneTask::spawn<CSceneTask>(p, l); });
    g_dict = new CPbinDictionary;   // never destroyed (a task never put in the tree)

    // The PBIN map: front hair (slot 1) 0..3 male, one of them DM-only, one GX-only, one not owned; the female hair
    // 0x100; glasses (slot 9) with "none" at 0x20; GX uniforms (clothes, slot 6) 0x80..0x83; 20 eyes (slot 4, kept
    // past the other blocks: only the slot decides) for paging.
    addPbin(0x00, 0, 1, 1, 1, true);
    addPbin(0x01, 1, 1, 1, 2, true);
    addPbin(0x02, 2, 1, 1, 3, true);
    addPbin(0x03, 3, 1, 1, 1, false);
    addPbin(0x100, 0, 2, 1, 1, true);
    addPbin(0x20, 32, 1, 2, 1, true);
    addPbin(0x50, 0, 1, 9, 1, true);
    addPbin(0x51, 1, 1, 9, 1, true);
    for (int i = 0; i < 4; i++)
        addPbin(0x80 + i, i, 1, 6, 3, true);
    for (int i = 0; i < 20; i++)
        addPbin(0xc0 + i, i, 1, 4, 1, true);

    // ---------------------------------------------------------------- the window on its own
    CAvatarData looks;   // male DM, front hair 1, eyes 5
    looks.bytes_[CAvatarData::FRONT_HAIR] = 1;
    looks.bytes_[CAvatarData::EYES] = 5;
    looks.bytes_[13] = 2;
    CWindowDialogAvatarSwitch* w = CWindowDialogAvatarSwitch::create(g_layer, &looks, &g_accountBin, 0, 344, 109);
    CHECK(w && w->x_ == 344 && w->y_ == 109 && w->world_ == 0 && w->avatar_.equals(looks.bytes_));
    CHECK(std::memcmp(w->bin_.pbin, g_accountBin.pbin, sizeof w->bin_.pbin) == 0);
    CHECK(w->w_ == 336 && w->h_ == 550 && w->bandH_ == 500 && w->modal_ && w->callback_ && w->result() == -1);
    CHECK(w->category_ == -1 && w->value_ == -1 && w->page_ == 0 && w->pageCount_ == 0);
    CHECK(!shown(w->textField_) && w->textField_->instName() == "テキスト名前部分");
    CHECK(w->textField_->w_ == 320 && w->textField_->h_ == 550 - 16 - 500 && w->textField_->posZ_ == 1);
    CHECK(w->frame_->w_ == 336 && w->frame_->bottomH_ == 500);
    CHECK(w->waDict_ == gameWorldWaDictionary());
    // the categories: ids 0..12 at x 350, their pictures by look, centred labels
    CHECK(sw(w->categories_[0])->image == "data/Scene/AvatarChange/abmake_btn_01_c01.png");
    CHECK(sw(w->categories_[4])->image == "data/Scene/AvatarChange/abmake_btn_01_c02.png");
    CHECK(sw(w->categories_[8])->image == "data/Scene/AvatarChange/abmake_btn_01_c03.png");
    CHECK(sw(w->categories_[12])->image == "data/Scene/AvatarChange/abmake_btn_01_c04.png");
    CHECK(sw(w->categories_[1])->looks[1].u == 324 && sw(w->categories_[1])->looks[3].u == 648 &&
          sw(w->categories_[1])->looks[0].h == 44);
    for (int i = 0; i < 13; i++) {
        FakeSwitch* s = sw(w->categories_[i]);
        CHECK(s->unk364_ == uint32_t(i) && s->x == 350 && s->z_ == 1012 && s->pos_.z == 1012 && s->inheritTransform_);
        CHECK(s->owner == w && s->mediator_ == static_cast<IWindowTaskMediator*>(w) && shown(s));
        CWindowTaskText* t = w->categoryTexts_[i].get();
        CHECK(t->x_ == 358 && t->y_ == s->y + 6 && t->fontSize_ == 32 && t->posZ_ == 1013 && shown(t));
        CHECK(elmOf(t)->align == CWindowTaskText::CENTRE && elmOf(t)->pageLines == 1);
    }
    CHECK(sw(w->categories_[0])->y == 63 && sw(w->categories_[12])->y == 603);
    CHECK(textOf(w->categoryTexts_[0].get()) == u"Tca6" && textOf(w->categoryTexts_[12].get()) == u"Tcad");
    // the items: hidden, ids 13..26, 40 apart
    for (int i = 0; i < 14; i++) {
        FakeSwitch* s = sw(w->items_[i]);
        CHECK(s->unk364_ == uint32_t(13 + i) && s->x == 722 && s->y == 89 + 40 * i && !shown(s));
        CHECK(s->image == "data/Scene/AvatarChange/abmake_btn_02_01.png" && s->looks[2].u == 508);
        CWindowTaskText* t = w->itemTexts_[i].get();
        CHECK(t->x_ == 730 && t->y_ == 94 + 40 * i && t->fontSize_ == 24 && textOf(t) == u"????????" && !shown(t));
    }
    // arrows, lines, OK / Back
    CHECK(sw(w->next_)->images[0] == "data/shop/shop_arrow_04_c01.png" && sw(w->next_)->images[3] == "data/shop/shop_arrow_06_c01.png");
    CHECK(sw(w->prev_)->images[1] == "data/shop/shop_arrow_11_c01.png" && w->prev_.get()->instName() == "もどるボタン");
    CHECK(w->next_.get()->pos_.x == 982 && w->prev_.get()->pos_.y == 326 && !w->next_.get()->isVisible(true));
    CElement* frameLine = windowElement(w->frameLine_);
    CElement* link = windowElement(w->linkLine_);
    CHECK(static_cast<CSpriteElm*>(frameLine)->texture == "data/Scene/AvatarChange/abmake_win_01.png");
    CHECK(frameLine->drawMode_ == CElement::BLEND && frameLine->pos_.x == 703 && frameLine->pos_.z == 1011);
    CHECK(link->instName() == "つなぎの線" && link->pos_.x == 672 && link->pos_.y == 69);
    CHECK(sw(w->buttons_[0])->x == 684 && sw(w->buttons_[1])->x == 852 && sw(w->buttons_[1])->y == 683);
    CHECK(sw(w->buttons_[0])->unk364_ == 0 && sw(w->buttons_[1])->unk364_ == 1 && sw(w->buttons_[0])->looks[1].u == 162);
    CHECK(textOf(w->buttonTexts_[0].get()) == u"Tfae" && textOf(w->buttonTexts_[1].get()) == u"Tfa5");
    CHECK(shown(w->buttons_[1].get()) && shown(w->buttonTexts_[1].get()));   // in the world: Back too

    // a PBIN category: front hair, the owned DM/both ones (not 3: not owned, not 2: GX), hair 1 lit
    w->onControlEvent(w->categories_[2].get());
    CHECK(w->result() == 2 && g_sounds.back() == SE_CHECK && w->category_ == 2 && w->value_ == -1);
    CHECK(sw(w->categories_[2])->selected && g_waAsked.back() == "0/11/0");
    CHECK(link->pos_.x == 672 && link->pos_.y == 153 + 22 - 16 && link->pos_.z == w->z_);
    CHECK(shownItems(w) == 2 && w->itemValues_[0] == 0 && w->itemValues_[1] == 1 && w->itemValues_[2] == -1);
    CHECK(textOf(w->itemTexts_[0].get()) == u"P0" && textOf(w->itemTexts_[1].get()) == u"P1");
    CHECK(!sw(w->items_[0])->selected && sw(w->items_[1])->selected && w->pageCount_ == 0);
    CHECK(!w->next_.get()->isVisible(true) && !w->prev_.get()->isVisible(true));
    // an item
    w->onControlEvent(w->items_[0].get());
    CHECK(w->result() == 13 && w->value_ == 0 && g_sounds.back() == SE_ENTER);
    CHECK(sw(w->items_[0])->selected && !sw(w->items_[1])->selected);
    // the same category again: no new page
    w->itemValues_[0] = 99;
    w->onControlEvent(w->categories_[2].get());
    CHECK(w->result() == 2 && w->itemValues_[0] == 99 && w->value_ == 0);
    // fixed choices: the sex; numbered: the skin; colours
    w->onControlEvent(w->categories_[0].get());
    CHECK(!sw(w->categories_[2])->selected && sw(w->categories_[0])->selected && w->value_ == -1);
    CHECK(shownItems(w) == 2 && textOf(w->itemTexts_[1].get()) == u"Tca8" && sw(w->items_[0])->selected);
    w->onControlEvent(w->categories_[8].get());
    CHECK(shownItems(w) == 3 && textOf(w->itemTexts_[0].get()) == u"Tc81 1" && textOf(w->itemTexts_[2].get()) == u"Tc81 3");
    CHECK(sw(w->items_[2])->selected && !sw(w->items_[0])->selected);
    w->onControlEvent(w->categories_[1].get());
    CHECK(shownItems(w) == 7 && textOf(w->itemTexts_[6].get()) == u"Tcb8" && w->itemValues_[6] == 6);
    // glasses: "none" first
    w->onControlEvent(w->categories_[11].get());
    CHECK(shownItems(w) == 3 && w->itemValues_[0] == 32 && textOf(w->itemTexts_[0].get()) == u"P20");
    CHECK(w->itemValues_[2] == 1 && g_waAsked.back() == "0/9/0");
    // eyes: 20, so two pages; eye 5 lit on the first
    w->onControlEvent(w->categories_[5].get());
    CHECK(shownItems(w) == 14 && w->pageCount_ == 1 && sw(w->items_[5])->selected);
    CHECK(w->next_.get()->isVisible(true) && !w->prev_.get()->isVisible(true));
    w->onControlEvent(w->next_.get());
    CHECK(w->page_ == 1 && shownItems(w) == 6 && w->itemValues_[0] == 14 && w->itemValues_[5] == 19);
    // (turning the page doesn't unlight a button: item 5 stays lit, as in the exe)
    CHECK(!w->next_.get()->isVisible(true) && w->prev_.get()->isVisible(true) && sw(w->items_[5])->selected);
    w->onControlEvent(w->next_.get());   // the last page already
    CHECK(w->page_ == 1);
    w->onControlEvent(w->prev_.get());
    w->onControlEvent(w->prev_.get());
    CHECK(w->page_ == 0 && w->itemValues_[0] == 0);
    // OK / Back
    w->onControlEvent(w->buttons_[0].get());
    CHECK(w->result() == 27 && g_sounds.back() == SE_ENTER);
    w->onControlEvent(w->buttons_[1].get());
    CHECK(w->result() == 28 && g_sounds.back() == SE_BACK);
    // the other window in front: 80%
    w->layout();
    CHECK(w->textField_->back_.get()->color_[3] == (w->isTop() ? 1.0f : 0.8f));
    w->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();

    // GX world clothes: the uniforms by level; outside the world no Back
    g_worldState = 0;
    w = CWindowDialogAvatarSwitch::create(g_layer, &looks, &g_accountBin, 1, 0, 0);
    CHECK(!shown(w->buttons_[1].get()) && !shown(w->buttonTexts_[1].get()) && shown(w->buttons_[0].get()));
    for (auto [level, n, first] : {std::tuple{5, 2, 0}, std::tuple{15, 3, 0}, std::tuple{25, 4, 0}}) {
        g_me.level = uint8_t(level);
        w->category_ = -1;
        w->onControlEvent(w->categories_[9].get());
        CHECK(shownItems(w) == n && w->itemValues_[0] == first && g_waAsked.back() == "0/10/1");
    }
    g_me.level = 15;
    w->category_ = -1;
    w->onControlEvent(w->categories_[9].get());
    CHECK(w->itemValues_[0] == 0 && w->itemValues_[1] == 1 && w->itemValues_[2] == 3);   // 0x82 (Obelisk) waits
    w->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    g_worldState = 1;

    // ---------------------------------------------------------------- the pack
    // made up: a random face, the DM / GX starter dress, a beginner's PBINs
    std::srand(5);
    CChangeAvatarPack* p = CChangeAvatarPack::create(root, g_layer, nullptr, nullptr, 3, 1);
    CHECK(p && p->world_ == 1 && p->waistUpArg_ == 3 && p->unk88_ == 50);
    for (int i = 0; i < 2; i++) {
        const uint8_t* b = p->avatars_[i].bytes_;
        CHECK(b[CAvatarData::SEX] == 0 && b[CAvatarData::FRONT_HAIR] < 6 && b[CAvatarData::BACK_HAIR] >= 0x90 &&
              b[CAvatarData::BACK_HAIR] < 0x94 && b[CAvatarData::MOUTH] >= 0x60 && b[CAvatarData::EYES] < 0x44);
        CHECK(b[13] < 3 && b[14] < 7 && b[15] < 7);
        CHECK(std::memcmp(b + 1, p->avatars_[0].bytes_ + 1, 5) == 0);   // one face for both
    }
    CHECK(p->avatars_[0].bytes_[CAvatarData::CLOTHES] == 0x70 && p->avatars_[0].bytes_[CAvatarData::DUEL_DISK] == 0xb0);
    CHECK(p->avatars_[1].bytes_[CAvatarData::CLOTHES] == 0x80 && p->avatars_[1].bytes_[CAvatarData::DUEL_DISK] == 0xb8);
    CHECK(p->bin_.flag(0) && p->bin_.flag(0x43) && p->bin_.flag(0xb8) && !p->bin_.flag(0x44) && !p->bin_.flag(0x100));
    {   // randomize alone: the rand() order is front hair, back hair, mouth, eyes, skin, hair colour, eye colour
        std::srand(11);
        int r[7];
        for (int& x : r)
            x = std::rand();
        std::srand(11);
        CAvatarData a;
        CChangeAvatarPack::randomize(&a);
        CHECK(a.bytes_[1] == r[0] % 6 && a.bytes_[7] == r[1] % 4 + 0x90 && a.bytes_[5] == r[2] % 3 + 0x60);
        CHECK(a.bytes_[4] == r[3] % 4 + 0x40 && a.bytes_[13] == r[4] % 3 && a.bytes_[14] == r[5] % 7 &&
              a.bytes_[15] == r[6] % 7);
    }
    // onInit: the picture of the GX avatar, the window at 0, 0
    CHECK(p->base_.task() && p->base_.get()->instName() == "CChangeAvatarPack::m_pBaseElm" && !p->layer_);
    CHECK(g_validated.back() == 11 && g_waistUp && p->waistUp_.task() == g_waistUp);
    CHECK(g_waistUp->data.equals(p->avatars_[1].bytes_) && g_waistUp->owner == p->base_.get() && g_waistUp->a == 3);
    CHECK(g_waistUp->kind == 0 && g_waistUp->b == 1 && g_waistUp->c == 1 && g_waistUp->scale == 50 &&
          g_waistUp->breathing && g_waistUp->x == 200 && g_waistUp->y == 0);
    w = p->window_.get();
    CHECK(w->x_ == 0 && w->y_ == 0 && w->pos_.x == 0 && w->world_ == 1 && w->avatar_.equals(p->avatars_[1].bytes_));
    CHECK(std::memcmp(w->bin_.pbin, p->bin_.pbin, sizeof w->bin_.pbin) == 0 && w->parent() == p->base_.get());
    p->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    CHECK(!g_waistUp);   // onDestroy took the picture down

    // given: the account's avatars and bits; dressing the DM avatar
    CAvatarData mine[2];
    mine[0].setDefault(CAvatarData::MALE_DM);
    mine[1].setDefault(CAvatarData::MALE_GX);
    mine[0].bytes_[CAvatarData::EYES] = 5;
    const CAvatarData* const given[2] = {&mine[0], &mine[1]};
    p = CChangeAvatarPack::create(root, g_layer, given, &g_accountBin, 0, 0);
    CHECK(p->avatars_[0].equals(mine[0].bytes_) && p->avatars_[1].equals(mine[1].bytes_));
    CHECK(std::memcmp(p->bin_.pbin, g_accountBin.pbin, sizeof p->bin_.pbin) == 0);
    w = p->window_.get();
    w->onControlEvent(w->buttons_[0].get());   // a stale press: START clears it
    frame(root);
    CHECK(p->state_ == CChangeAvatarPack::RUNNING && w->result() == -1);
    // a category does nothing here; an item goes on the picture and comes back
    w->onControlEvent(w->categories_[5].get());
    frame(root);
    CHECK(w->result() == -1 && g_waistUp->changes.empty());
    w->onControlEvent(w->items_[7].get());
    frame(root);
    CHECK(g_waistUp->changes.size() == 1 && g_waistUp->changes[0] == std::make_pair(int32_t(CAvatarData::EYES), 7));
    CHECK(p->avatars_[0].bytes_[CAvatarData::EYES] == 7 && w->avatar_.bytes_[CAvatarData::EYES] == 7 && w->result() == -1);
    CHECK(p->avatars_[1].equals(mine[1].bytes_));
    // the sex: the other world's avatar starts again as that sex, in the GX dress
    w->onControlEvent(w->categories_[0].get());
    frame(root);
    w->onControlEvent(w->items_[1].get());
    frame(root);
    CHECK(g_waistUp->changes.back() == std::make_pair(0, 1) && p->avatars_[0].bytes_[CAvatarData::SEX] == 1);
    {
        CAvatarData expect;
        expect.bytes_[CAvatarData::SEX] = 1;
        expect.bytes_[CAvatarData::CLOTHES] = 0x80;
        expect.bytes_[CAvatarData::DUEL_DISK] = 0xb8;
        CHECK(p->avatars_[1].equals(expect.bytes_));
    }
    // OK: the looks to the other world
    g_copies = 0;
    w->onControlEvent(w->buttons_[0].get());
    frame(root);
    CHECK(p->state_ == CChangeAvatarPack::DONE && g_copies == 1 && w->result() == -1);
    CHECK(p->avatars_[1].bytes_[CAvatarData::EYES] == 7);
    frame(root);   // nothing more
    CHECK(p->state_ == CChangeAvatarPack::DONE);
    CAvatarData out;
    p->avatar(1, &out);
    CHECK(out.equals(p->avatars_[1].bytes_));
    p->state_ = CChangeAvatarPack::RUNNING;
    w->onControlEvent(w->buttons_[1].get());
    frame(root);
    CHECK(p->state_ == CChangeAvatarPack::CANCELLED);
    p->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    CHECK(!g_waistUp);

    // ---------------------------------------------------------------- the scene, in the world
    g_worldId = 1;
    g_me.avatar[0] = mine[0];
    g_me.avatar[1] = mine[1];
    g_fades.clear();
    CChangeAvaterScene* s = dynamic_cast<CChangeAvaterScene*>(CChangeAvaterScene::New(root, g_layer));
    CHECK(s && g_bgs.back().first == 0x40 && s->account_.task() == g_account && s->lobby_.task() == g_lobby);
    CHECK(s->world_ == 1 && s->state_ == CChangeAvaterScene::START && g_fades.back() == "in10/61004");
    p = s->pack_.get();
    CHECK(p->world_ == 1 && p->avatars_[1].equals(mine[1].bytes_) && p->instName() == "CChangeAvatarPackまとめクラス");
    CHECK(std::memcmp(p->bin_.pbin, g_accountBin.pbin, sizeof p->bin_.pbin) == 0);
    frame(root);
    frame(root);
    CHECK(s->state_ == CChangeAvaterScene::DRESSING);
    g_waistUp->data.bytes_[CAvatarData::MOUTH] = 0x61;
    p->window_.get()->onControlEvent(p->window_.get()->buttons_[0].get());
    frame(root);   // the pack takes OK, then the scene stores it
    CHECK(p->state_ == CChangeAvatarPack::DONE);
    if (s->state_ == CChangeAvaterScene::DRESSING)
        frame(root);
    CHECK(s->state_ == CChangeAvaterScene::REGISTER && g_playerData.saves == 1 && g_playerData.avatar[CAvatarData::MOUTH] == 0x61);
    CHECK(g_me.avatar[1].bytes_[CAvatarData::MOUTH] == 0x61 && g_me.avatar[0].bytes_[CAvatarData::MOUTH] == 0x61);
    CHECK(g_fades.back() == "out10/61004" && mng->nextSceneId() == SCENE_MY_ROOM);
    frame(root);
    CHECK(s->state_ == CChangeAvaterScene::WAIT_REGISTER && g_regAvatars == 1 && g_lobbyRank == 1);
    frame(root);
    CHECK(s->state_ == CChangeAvaterScene::WAIT_REGISTER);
    g_lobby->busy = CNetLobbyTask::BUSY_FAILED;
    frame(root);
    CHECK(s->state_ == CChangeAvaterScene::DONE);
    // Back: the world restored, My Room
    s->state_ = CChangeAvaterScene::DRESSING;
    p->state_ = CChangeAvatarPack::CANCELLED;
    frame(root);
    CHECK(s->state_ == CChangeAvaterScene::DONE && g_lobbyRank == 7 && g_playerData.saves == 1);
    s->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();

    // a new character: made-up avatars, and on OK the world goes to My Room by itself
    g_worldState = 0;
    g_worldId = 0;
    std::srand(1);
    s = dynamic_cast<CChangeAvaterScene*>(CChangeAvaterScene::New(root, g_layer));
    p = s->pack_.get();
    CHECK(p->avatars_[0].bytes_[CAvatarData::CLOTHES] == 0x70 && !p->avatars_[0].equals(mine[0].bytes_));
    frame(root);
    frame(root);
    p->window_.get()->onControlEvent(p->window_.get()->buttons_[0].get());
    frame(root);
    if (s->state_ == CChangeAvaterScene::DRESSING)
        frame(root);
    CHECK(s->state_ == CChangeAvaterScene::DONE && g_enterMyRoom && g_playerData.saves == 2 && g_regAvatars == 1);
    CHECK(g_me.avatar[0].equals(p->avatars_[0].bytes_));
    s->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    std::puts("changeavatar ok");
    return 0;
}
