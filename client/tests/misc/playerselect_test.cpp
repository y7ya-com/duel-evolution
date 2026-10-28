// src/PlayerSelect: CWindowPlayerSelect (the four character rows) and CPlayerSelectScene (pick / create / delete,
// the card box and deck setup on the way to My Room).
// sources: PlayerSelect/*.cpp Deck/DeckManager.cpp System/*.cpp System/window/*.cpp Game/yo2TgtAvaListDlg.cpp Game/Avatar/yo2AvatarData.cpp Net/NetAccount.cpp Net/MessageIO.cpp Net/ygpacket.cpp Net/NetGate.cpp
#include <cstdio>
#include <cstring>
#include <map>
#include <string>
#include <vector>

#include "../game/window_stubs.h"
#include "../system/d3d8_fake.cpp"
#include "Deck/DeckManager.h"
#include "Net/NetLobby_Social.h"
#include "Net/NetTasks.h"
#include "PlayerSelect/playerSelectExt.h"
#include "PlayerSelect/yo2PlayerSelect.h"
#include "PlayerSelect/yo2PlayerSelectEntry.h"
#include "System/yo2SceneManager.h"
#include "System/yo2StringDB.h"
#include "System/yo2ZSort.h"

#define CHECK(c) \
    do { if (!(c)) { std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #c); std::exit(1); } } while (0)

// ---- System's own link needs
int g_fakeFaderState;
CElement* screenFaderNew(CTask* parent, uint32_t priority) { return CElement::newChild(parent, priority); }
bool screenFaderFinished(CElement*) { return g_fakeFaderState == 3; }
bool screenFaderIdle(CElement*) { return g_fakeFaderState == 0; }
CElement* g_layer;
CElement* appSceneLayer() { return g_layer; }
std::map<std::string, std::vector<uint8_t>> g_files;
bool yo2LoadFile(const char* name, std::vector<uint8_t>& out) {
    auto it = g_files.find(name);
    if (it == g_files.end()) return false;
    out = it->second;
    return true;
}
bool yo2SaveFile(const char* name, const void* data, size_t size) {   // System/yo2File.h
    g_files[name].assign((const uint8_t*)data, (const uint8_t*)data + size);
    return true;
}
std::set<int> g_keysDown;
#ifndef _WIN32
SHORT GetAsyncKeyState(int vk) { return g_keysDown.count(vk) ? SHORT(0x8000) : 0; }
#endif
struct FakeText : CStringDB {
    vc6::string get(uint32_t i) const override { return i == 0xc24 ? "no data" : i == 0xfa7 ? "Delete" : "?"; }
};

// ---- the card database and limit list: ids 1-60, fusions are 3, 6, 9...; limit 3 except 2 (one copy)
int cardPropId(int index) { return index; }
int engCardLimit(int id) { return id == 2 ? 1 : 3; }
int engSameCard(int a, int b) { return a == b; }
int cardKind(int id) { return id % 3 == 0 ? 2 : 1; }

// ---- Net: the account (4 character records, the trunk, the PBIN) and its tasks
CNetAccount* g_acc = new CNetAccount{};
CNetAccount* appNetAccount() { return g_acc; }
YgTransport ygSocketTransport(int32_t) { return YgTransport{}; }   // (the platform hooks Net's objects name)
void ygSocketClose(int32_t) {}
int32_t ygConnectAsync(const char*, uint16_t, YgConn*, uint32_t) { return 0; }
int32_t ygSocketSelect(int32_t, uint32_t) { return 0; }
std::string playerNameString(const CPlayerInfo& p) { return p.name; }
std::vector<std::string> g_calls;
CNetAccountTask* g_account;
CNetAccountTaskReqDuellpass150* g_duelpass;
CNetAccountTask::CNetAccountTask() = default;
CNetAccountTask::~CNetAccountTask() { g_account = nullptr; }
bool CNetAccountTask::onInit() { return true; }
bool CNetAccountTask::onMain() { return true; }
void CNetAccountTask::onDestroy() {}
CNetAccountTask* CNetAccountTask::spawn(CTask* parent, CTask*) {
    return g_account = dynamic_cast<CNetAccountTask*>((new CNetAccountTask)->create(parent, 10000));
}
static bool record(const std::string& c) { g_calls.push_back(c), g_account->busy = CNetAccountTask::BUSY_WORKING; return true; }
bool CNetAccountTask::createCharacter(int32_t s) { return record("create " + std::to_string(s)); }
bool CNetAccountTask::deleteCharacter(int32_t s) { return record("delete " + std::to_string(s)); }
bool CNetAccountTask::requestTrunk() { return record("trunk"); }
bool CNetAccountTask::requestPbin(int32_t s) { return record("pbin " + std::to_string(s)); }
bool CNetAccountTask::requestPlayerList() { return record("list"); }
bool CNetAccountTask::bye() { return record("bye"); }
bool CNetAccountTask::hangUp() { return record("hangup"); }
CNetAccountTaskReqDuellpass150::~CNetAccountTaskReqDuellpass150() { g_duelpass = nullptr; }
bool CNetAccountTaskReqDuellpass150::onInit() { return true; }
bool CNetAccountTaskReqDuellpass150::onMain() { return true; }
CNetAccountTaskReqDuellpass150* CNetAccountTaskReqDuellpass150::spawn(CTask* parent) {
    return g_duelpass = dynamic_cast<CNetAccountTaskReqDuellpass150*>((new CNetAccountTaskReqDuellpass150)->create(parent, 10000));
}

// ---- playerSelectExt.h doubles
CEasyTask* bgCommonNew(CTask* parent, CElement*, int32_t, int32_t) {
    auto* t = new CEasyTask;
    t->create(parent, 0);
    return t;
}
bool soundPlay(uint32_t, int32_t) { return true; }
bool g_deleteLocked;
bool systemConfigPlayerDeleteLocked() { return g_deleteLocked; }
struct PlayerDataBytes { uint8_t _00[0x38]; vc6::string deckFile; } g_pd;
CPlayerDataManager* g_playerData = reinterpret_cast<CPlayerDataManager*>(&g_pd);
vc6::string g_player;
vc6::string playerDataDir(CPlayerDataManager*) {
    vc6::string d = "data\\";
    d += g_player;
    return d;
}
void playerDataSetPlayer(CPlayerDataManager*, vc6::string name) { g_player = name; }
int g_pdSaves;
bool playerDataSave(CPlayerDataManager*) { return ++g_pdSaves; }
alignas(8) uint8_t g_box[0x4000];   // (0x302c on i686; the host's vc6::string at +0x301c is wider)
CCardBox* cardBox() { return reinterpret_cast<CCardBox*>(g_box); }
const uint8_t* appCardBox() { return g_box; }
int g_boxSaves;
bool cardBoxSave(CCardBox*) { return ++g_boxSaves; }
int g_fblist, g_synced;
void fblistInit() { g_fblist++; }
int32_t gameWorldId() { return 0; }
void gameWorldSyncLists() { g_synced++; }
bool g_myRoom;
void gameWorldEnterMyRoom() { g_myRoom = true; }
std::vector<int> g_validated;
void avatarValidate(CAvatarData* a, int world, bool) { g_validated.push_back(world), (void)a; }
void avatarCopyLooks(const CAvatarData& from, CAvatarData* to) { std::memcpy(to->bytes_ + 1, from.bytes_ + 1, 5); }
std::set<int> g_pushed;
bool keyPushed(int32_t dik) { return g_pushed.count(dik); }
struct FakeWua : CElement {
    bool visible = false, breathing = false, greeted = false;
    float scale = 0, x = 0, y = 0;
    int motion = 0, face = -1;
    const CAvatarData* data = nullptr;
};
FakeWua* wua(CElement* e) { return static_cast<FakeWua*>(e); }
CElement* waistUpAvatarNew(CTask* parent, CTask*, int32_t, const CAvatarData* d, int32_t, int32_t, int32_t) {
    auto* w = new FakeWua;
    w->data = d;
    return dynamic_cast<CElement*>(w->create(parent, 10000));
}
void waistUpAvatarSetVisible(CElement* w, bool on) { wua(w)->visible = on; }
void waistUpAvatarSetBreathing(CElement* w, bool on) { wua(w)->breathing = on; }
void waistUpAvatarSetScale(CElement* w, float s) { wua(w)->scale = s; }
void waistUpAvatarSetPos(CElement* w, float x, float y) { wua(w)->x = x, wua(w)->y = y; }
void waistUpAvatarGreet(CElement* w) { wua(w)->greeted = true; }
void waistUpAvatarPlay(CElement* w, int32_t m, int32_t) { wua(w)->motion = m; }
void waistUpAvatarSetFace(CElement* w, int32_t f) { wua(w)->face = f; }

static void frame(CTask* root) {
    root->call(&g_tmMain);
    CTask::flushDeleted();
}
static void character(int slot, const char* name, uint8_t level) {
    CPlayerInfo& p = g_acc->me.players[slot];
    p.valid = 1;
    std::strcpy(p.name, name);
    p.level = level;
}
static std::u16string label(CWindowTaskTextSwitch* s) { return std::u16string(elmOf(s->caption_.get()->text_.get())->text); }

int main() {
    g_zsortSet = new CZSortSet;
    FakeText text;
    g_stringDB = &text;
    CWindowTaskFactory::create();
    CTask* root = CTask::createRoot();
    g_layer = CElement::newChild(root, 1);
    CSceneMng* mng = CSceneMng::newChild(root, 2);
    for (int id : {SCENE_TITLE, SCENE_CHANGE_AVATAR})
        CSceneMng::registerScene(id, [](CTask* p, CElement* l) { return CSceneTask::spawn<CSceneTask>(p, l); });

    // ---- helpers of this file
    {
        CAvatarData a;
        std::memset(a.bytes_, 0, 16);
        CPlayerBinData bin{};
        CHECK(!avatarIsOwned(&a, &bin));                       // byte 1 (part 0) isn't owned
        for (int i = 0; i < 256; i++) bin.pbin[i >> 3] |= 1 << (i & 7);   // every male part
        CHECK(avatarIsOwned(&a, &bin));
        a.bytes_[13] = 7;
        CHECK(!avatarIsOwned(&a, &bin));
        a.bytes_[13] = 6;
        a.bytes_[0] = 1;                                        // female: her bits start at 0x100
        CHECK(!avatarIsOwned(&a, &bin));
        a.bytes_[0] = 2;
        CHECK(!avatarIsOwned(&a, &bin));
        cardBoxClear(cardBox());
        cardBoxAdd(cardBox(), 7, 200);
        cardBoxAdd(cardBox(), 7, 100);
        CHECK(cardBoxCopies(cardBox(), 7) == 255 && *(int32_t*)(g_box + 4) == 255);
    }

    // ---- the window over two characters (slots 0 and 2)
    character(0, "yugi", 7);
    character(2, "kaiba", 12);
    for (int i = 0; i < 0x100; i++) g_acc->bin.pbin[i >> 3] |= 1 << (i & 7);
    g_acc->me.players[0].avatar[1].bytes_[0] = 5;   // an avatar the PBIN can't own: reset on the way in
    CPlayerSelectScene* s = dynamic_cast<CPlayerSelectScene*>(CPlayerSelectScene::New(root, g_layer));
    CHECK(s && CPlayerSelectScene::instance() == s && g_account);
    CWindowPlayerSelect* w = s->window_.get();
    CHECK(w->user_ == &g_acc->me && w->selected_ == 0 && w->w_ == 480 && w->h_ == 272 && w->bandH_ == 208);
    CHECK(label(w->rows_[0].get()) == u"yugi" && label(w->rows_[1].get()) == u"no data");
    CHECK(elmOf(w->levels_[2].get())->text == u"Lv12" && !w->levels_[1].get()->isVisible(true));
    CHECK(w->deletes_[0].get()->enabled_ && !w->deletes_[1].get()->enabled_);
    CHECK(w->rows_[3].get()->y_ == 192 && w->rows_[0].get()->x_ == 16 && w->back_.get()->x_ == 376);
    CHECK(w->avatarMade_[0] && !w->avatarMade_[1] && w->avatarMade_[2]);
    CHECK(wua(w->avatars_[0].get())->visible && wua(w->avatars_[0].get())->greeted && !wua(w->avatars_[2].get())->visible);
    CHECK(wua(w->avatars_[2].get())->scale == 50 && g_validated.size() == 2);

    // the developers' keys
    frame(root);   // START -> DUELPASS
    g_pushed = {3};
    frame(root);
    CHECK(wua(w->avatars_[0].get())->motion == 800);
    g_pushed = {0x2e};
    frame(root);
    CHECK(wua(w->avatars_[0].get())->face == 3);
    g_pushed.clear();

    // DUELPASS, then the rows
    CHECK(g_duelpass && s->state_ == CPlayerSelectScene::WAIT_DUELPASS);
    g_duelpass->state = CNetAccountTaskReqDuellpass150::DONE;
    frame(root);
    frame(root);
    CHECK(s->state_ == CPlayerSelectScene::WAIT_INPUT && !s->newCharacter_);

    // pick yugi: the trunk fills the card box, there's no deck file yet, so a starter deck
    w->onControlEvent(w->rows_[0].get());
    frame(root);
    CHECK(s->state_ == CPlayerSelectScene::TRUNK && g_acc->me.activeSlot == 0 && g_player == "yugi" && g_fblist == 1);
    CHECK(w->isLocked(1) && w->rows_[2].get()->isLocked(1));
    for (int i = 0; i < 60; i++) g_acc->me.trunk[i] = 2;   // two of each of ids 1..60
    frame(root);
    CHECK(g_calls.back() == "trunk");
    g_account->busy = CNetAccountTask::BUSY_DONE;
    frame(root);
    CHECK(s->state_ == CPlayerSelectScene::PBIN && g_boxSaves == 1 && cardBoxCopies(cardBox(), 60) == 2);
    CHECK(s->deck_ == g_deckManager && g_pd.deckFile == "deck.ydc" && g_deckManager->fileName_ == "deck.ydc");
    // ids 1..31 offered (the 40 is checked after each id): 41 main cards, the fusions 3..30 twice each
    CHECK(g_deckManager->mainSize() == 41 && g_deckManager->mainList()[0] == 1 && g_deckManager->mainList()[1] == 1);
    CHECK(g_deckManager->mainList()[2] == 2 && g_deckManager->mainList()[3] == 4);   // id 2: one copy only
    CHECK(g_deckManager->extraSize() == 20 && g_deckManager->extraList()[0] == 3);
    CHECK(g_files.count("data\\yugi\\deck.ydc") && CDeckRuleCheck::s_main == 41 && CDeckRuleCheck::s_extra == 20);
    frame(root);
    CHECK(g_calls.back() == "pbin 0");
    g_account->busy = CNetAccountTask::BUSY_DONE;
    frame(root);
    CHECK(s->state_ == CPlayerSelectScene::LEAVE && g_acc->me.players[0].avatar[1].equals(CAvatarData().bytes_));
    frame(root);
    CHECK(g_calls.back() == "bye" && g_myRoom && s->state_ == CPlayerSelectScene::DONE);

    // an empty slot: create the character, then the same loading, then the avatar change; the deck file exists now
    s->state_ = CPlayerSelectScene::SHOW;
    frame(root);
    frame(root);
    w->onControlEvent(w->rows_[1].get());
    frame(root);
    CHECK(g_calls.back() == "create 1" && s->state_ == CPlayerSelectScene::WAIT_CREATE);
    character(1, "jonouchi", 1);
    g_account->busy = CNetAccountTask::BUSY_DONE;
    frame(root);
    CHECK(s->newCharacter_ && g_player == "jonouchi" && s->state_ == CPlayerSelectScene::TRUNK);
    g_files["data\\jonouchi\\deck.ydc"] = g_files["data\\yugi\\deck.ydc"];
    frame(root);
    g_account->busy = CNetAccountTask::BUSY_DONE;
    frame(root);
    CHECK(g_deckManager->mainSize() == 41 && g_pdSaves == 3);   // loaded, not rebuilt (no extra save of the name)
    frame(root);
    g_account->busy = CNetAccountTask::BUSY_DONE;
    frame(root);
    frame(root);
    frame(root);
    CHECK(mng->nextSceneId() == SCENE_CHANGE_AVATAR || mng->sceneId() == SCENE_CHANGE_AVATAR);
    s->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    CHECK(!CPlayerSelectScene::instance());

    // delete, then the list again; Back hangs up and goes to the title
    s = dynamic_cast<CPlayerSelectScene*>(CPlayerSelectScene::New(root, g_layer));
    w = s->window_.get();
    s->state_ = CPlayerSelectScene::WAIT_INPUT;
    w->onControlEvent(w->deletes_[2].get());
    frame(root);
    CHECK(g_calls.back() == "delete 2" && s->state_ == CPlayerSelectScene::WAIT_DELETE && g_player == "kaiba");
    g_acc->me.players[2].valid = 0;
    g_account->busy = CNetAccountTask::BUSY_DONE;
    frame(root);
    frame(root);
    CHECK(g_calls.back() == "list");
    g_account->busy = CNetAccountTask::BUSY_DONE;
    frame(root);
    CHECK(s->state_ == CPlayerSelectScene::SHOW && label(w->rows_[2].get()) == u"no data");
    frame(root);
    w->onControlEvent(w->back_.get());
    frame(root);
    CHECK(g_calls.back() == "hangup" && s->state_ == CPlayerSelectScene::WAIT_HANGUP);
    g_account->busy = CNetAccountTask::BUSY_DONE;
    frame(root);
    CHECK(mng->nextSceneId() == SCENE_TITLE);

    // the launcher can forbid deleting
    g_deleteLocked = true;
    w->refresh();
    CHECK(!w->deletes_[0].get()->enabled_ && !w->deletes_[0].get()->isVisible(true));
    std::puts("playerselect ok");
    return 0;
}
