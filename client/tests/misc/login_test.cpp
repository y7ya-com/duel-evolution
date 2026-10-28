// src/login: CWindowLogin (the ID / password window) and CLoginScene (fill it, log in, store what was asked).
// sources: login/*.cpp System/*.cpp System/window/*.cpp Game/yo2TgtAvaListDlg.cpp
#include <cmath>
#include <cstdio>
#include <map>
#include <string>
#include <vector>

#include "../game/window_stubs.h"
#include "../system/d3d8_fake.cpp"
#include "Net/NetTasks.h"
#include "System/yo2SceneManager.h"
#include "System/yo2StringDB.h"
#include "System/yo2ZSort.h"
#include "login/loginDialog.h"
#include "login/loginExt.h"
#include "login/yo2LoginEntry.h"

#define CHECK(c) \
    do { if (!(c)) { std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #c); std::exit(1); } } while (0)

// ---- System's own link needs (as tests/system/stubs.cpp and tests/game/platform_stubs.cpp)
int g_fakeFaderState;
CElement* screenFaderNew(CTask* parent, uint32_t priority) { return CElement::newChild(parent, priority); }
bool screenFaderFinished(CElement*) { return g_fakeFaderState == 3; }
bool screenFaderIdle(CElement*) { return g_fakeFaderState == 0; }
CElement* g_layer;
CElement* appSceneLayer() { return g_layer; }
bool yo2LoadFile(const char*, std::vector<uint8_t>&) { return false; }
std::set<int> g_keysDown;
#ifndef _WIN32   // (the i686 pass only compiles this file, against the real windows.h)
SHORT GetAsyncKeyState(int vk) { return g_keysDown.count(vk) ? SHORT(0x8000) : 0; }
#endif
struct FakeText : CStringDB {
    vc6::string get(uint32_t i) const override { return i == 0xfa2 ? "OK" : i == 0xfa3 ? "Cancel" : "?"; }
};

// ---- loginExt.h doubles
std::vector<std::pair<int32_t, CTask*>> g_bgs;
CEasyTask* bgCommonNew(CTask* parent, CElement*, int32_t bg, int32_t) {
    auto* t = new CEasyTask;
    t->create(parent, 0);
    g_bgs.push_back({bg, t});
    return t;
}
CTask* gameWorld() { return nullptr; }
CElement* gameWorldMenu(CTask*) { return nullptr; }
void menuWindowReset(CElement*) {}
void menuWindowClose(CElement*) {}
vc6::string g_lastId;
bool g_idLocked, g_saved;
vc6::string systemConfigLastLoginId() { return g_lastId; }
void systemConfigSetLastLoginId(vc6::string id) { g_lastId = id; }
bool systemConfigSave() { return g_saved = true; }
bool systemConfigLoginIdLocked() { return g_idLocked; }
struct UserConfigBytes {   // a CUserConfigManager-sized block (yo2LoginEntry.cpp reads +0x25 / +0x38 / +0x48)
    uint32_t vtbl;
    uint8_t _04[0x21];
    bool savesPassword;
    uint8_t _26[0x12];
    vc6::string password, encoded;
} g_uc{};
CUserConfigManager* g_userConfigManager = reinterpret_cast<CUserConfigManager*>(&g_uc);
vc6::string g_ucUser;
bool g_ucLoadOk = true, g_ucSaved;
std::map<std::string, std::pair<bool, std::string>> g_ucFiles;   // user -> saved password
void userConfigSetUser(CUserConfigManager*, vc6::string user) { g_ucUser = user; }
bool userConfigLoad(CUserConfigManager*) {
    auto it = g_ucFiles.find(g_ucUser.c_str());
    if (!g_ucLoadOk || it == g_ucFiles.end()) return false;
    g_uc.savesPassword = it->second.first;
    g_uc.password = it->second.second.c_str();
    return true;
}
bool userConfigSave(CUserConfigManager*) {
    g_ucFiles[g_ucUser.c_str()] = {g_uc.savesPassword, g_uc.password.c_str()};
    return g_ucSaved = true;
}
vc6::string userConfigEncode(CUserConfigManager*, vc6::string pw) {
    vc6::string e = "enc:";
    e += pw;
    return e;
}
bool g_legacy;
uint8_t g_legacyRecord[32];
vc6::string g_legacyPath;
bool legacyLoginFileEnabled() { return g_legacy; }
vc6::string legacyLoginFileFolder() { return "old"; }
bool legacyLoginFileRead(const vc6::string& path, uint8_t record[32]) {
    g_legacyPath = path;
    std::memcpy(record, g_legacyRecord, 32);
    return true;
}
// the widgets: a CWindowTaskControll with what the login window reads and writes
struct FakeInput : CWindowTaskControll {
    void layout() override {}
    bool hitTest(float, float) override { return false; }
    float x = 0, y = 0, w = 0, h = 0;
    int32_t maxLen = 0, style = 0;
    bool password = false, flags = false, entered = false, checked = false;
    vc6::wstring text;
};
FakeInput* fake(CWindowTaskControll* c) { return static_cast<FakeInput*>(c); }
CWindowTaskControll* inputCreate(CTask* parent, IWindowTaskMediator* m, int32_t style) {
    auto* in = new FakeInput;
    in->style = style;
    in->setMediator(m);
    return dynamic_cast<CWindowTaskControll*>(in->create(parent, 10000));
}
void inputSetRect(CWindowTaskControll* in, float x, float y, float w, float h) {
    fake(in)->x = x, fake(in)->y = y, fake(in)->w = w, fake(in)->h = h;
}
void inputSetMaxLength(CWindowTaskControll* in, int32_t n) { fake(in)->maxLen = n; }
void inputSetPassword(CWindowTaskControll* in, bool on) { fake(in)->password = on; }
void inputSetFlags3f6_3fd(CWindowTaskControll* in) { fake(in)->flags = true; }
bool inputEntered(CWindowTaskControll* in) { return fake(in)->entered; }
vc6::wstring inputText(CWindowTaskControll* in) { return fake(in)->text; }
void inputSetText(CWindowTaskControll* in, const vc6::wstring& s) { fake(in)->text = s; }
CWindowTaskControll* checkboxCreate(CTask* parent, IWindowTaskMediator* m) { return inputCreate(parent, m, -1); }
bool checkboxChecked(CWindowTaskControll* c) { return fake(c)->checked; }
void checkboxSetChecked(CWindowTaskControll* c, bool on) { fake(c)->checked = on; }
std::vector<uint32_t> g_sounds;
bool soundPlay(uint32_t id, int32_t) { return g_sounds.push_back(id), true; }
vc6::string narrow(const vc6::wstring& s) {
    std::string n;
    for (char16_t c : std::u16string_view(s)) n += char(c);
    return vc6::string(n);
}

// ---- src/Net's tasks: just what the scene drives
std::vector<std::pair<std::string, std::string>> g_logins;
CNetGateTask* g_gate;
CNetAccountTask* g_account;
CNetGateTask::CNetGateTask() = default;
CNetGateTask::~CNetGateTask() { g_gate = nullptr; }
bool CNetGateTask::onInit() { return true; }
bool CNetGateTask::onMain() { return true; }
void CNetGateTask::onDestroy() {}
CNetGateTask* CNetGateTask::spawn(CTask* parent, CTask*) {
    return g_gate = dynamic_cast<CNetGateTask*>((new CNetGateTask)->create(parent, 10000));
}
CNetAccountTask::CNetAccountTask() = default;
CNetAccountTask::~CNetAccountTask() { g_account = nullptr; }
bool CNetAccountTask::onInit() { return true; }
bool CNetAccountTask::onMain() { return true; }
void CNetAccountTask::onDestroy() {}
CNetAccountTask* CNetAccountTask::spawn(CTask* parent, CTask*) {
    return g_account = dynamic_cast<CNetAccountTask*>((new CNetAccountTask)->create(parent, 10000));
}
bool CNetAccountTask::login(const std::string& user, const std::string& password) {
    g_logins.push_back({user, password});
    busy = BUSY_WORKING;
    return true;
}

static void frame(CTask* root) {
    root->call(&g_tmMain);
    CTask::flushDeleted();
}
static bool locked(CTask* t, uint32_t mask) { return t->isLocked(mask); }

int main() {
    g_zsortSet = new CZSortSet;   // never destroyed: its queues still name tasks freed by the tests
    FakeText text;
    g_stringDB = &text;
    CWindowTaskFactory::create();
    CTask* root = CTask::createRoot();
    g_layer = CElement::newChild(root, 1);
    CSceneMng* mng = CSceneMng::newChild(root, 2);
    for (int id : {SCENE_TITLE, SCENE_PLAYER_SELECT})   // where the login goes: empty scenes
        CSceneMng::registerScene(id, [](CTask* p, CElement* l) { return CSceneTask::spawn<CSceneTask>(p, l); });

    // ---------------------------------------------------------------- the window
    {
        CWindowLogin* w = CWindowLogin::create(g_layer, 256, 256, 0xfa2);
        CHECK(w && w->x_ == 256 && w->okTextId_ == 0xfa2 && w->modal_ && w->callback_);
        CHECK(w->frameLogin_.get()->w_ == 464 && w->frameLogin_.get()->h_ == 264 && w->frameLogin_.get()->bottomH_ == 184);
        CHECK(w->message_.get()->w_ == 448 && w->message_.get()->x_ == 8);
        CHECK(w->textId_.get()->y_ == 80 && w->textPass_.get()->y_ == 144 && w->textId_.get()->posZ_ == 3);
        FakeInput* id = fake(w->inputId_.get());
        FakeInput* pass = fake(w->inputPass_.get());
        CHECK(id->y == 96 && id->w == 336 && id->maxLen == 20 && !id->password && id->flags && id->z_ == 2);
        CHECK(pass->y == 160 && pass->password && id->focused_ == 1);
        CHECK(w->checkId_.get()->pos_.x == 424 && w->checkPass_.get()->pos_.y == 192);
        CHECK(!w->textDemoId_.get()->isVisible(true) && w->textCheckId_.get()->isVisible(true));
        CWindowTaskTextSwitch* ok = w->buttonOk_.get();
        CWindowTaskTextSwitch* cancel = w->buttonCancel_.get();
        CHECK(ok->y_ == 224 && ok->unk364_ == 0xfa2 && cancel->unk364_ == 0xfa3);
        CHECK(std::fabs(ok->x_ - (120 - (ok->w_ - 80) / 2)) < 1e-3 && std::fabs(cancel->x_ - (280 - (cancel->w_ - 80) / 2)) < 1e-3);

        // OK, Enter in an input, Cancel
        w->onControlEvent(ok);
        CHECK(w->result() == 0xfa2 && g_sounds.back() == SE_ENTER);
        w->resetResult();
        w->onControlEvent(pass);
        CHECK(w->result() == -1);
        pass->entered = true;
        w->onControlEvent(pass);
        CHECK(w->result() == 0xfa2);
        w->onControlEvent(cancel);
        CHECK(w->result() == 0xfa3 && g_sounds.back() == SE_BACK);
        // the check boxes keep "password saved" only with "ID saved"
        w->setIdChecked(true);
        w->setPassChecked(true);
        fake(w->checkId_.get())->checked = false;   // (the box flips itself before it reports)
        w->onControlEvent(w->checkId_.get());
        CHECK(!w->passChecked() && g_sounds.back() == SE_CHECK);
        fake(w->checkPass_.get())->checked = true;
        w->onControlEvent(w->checkPass_.get());
        CHECK(w->idChecked());
        // the tab order
        w->mediatorSlot2(id);
        CHECK(pass->focused_ == 1);
        w->mediatorSlot2(pass);
        CHECK(ok->focused_ == 1);
        w->mediatorSlot2(ok);
        CHECK(cancel->focused_ == 1);
        w->mediatorSlot2(cancel);
        CHECK(id->focused_ == 1);
        w->mediatorSlot3(id);
        CHECK(cancel->focused_ == 1);
        w->mediatorSlot3(pass);
        CHECK(id->focused_ == 1);
        // the texts
        w->setUserId("duelist");
        w->setPassword("pw");
        CHECK(w->userId() == "duelist" && w->password() == "pw" && id->text == u"duelist");
        w->destroy(__FILE__, __LINE__);
        CTask::flushDeleted();

        // with the ID fixed by the launcher, labels stand in for the inputs
        g_idLocked = true;
        w = CWindowLogin::create(g_layer, 0, 0, 0xfa2);
        CHECK(!w->inputId_.get()->isVisible(true) && !w->inputId_.get()->enabled_ && !w->checkPass_.get()->enabled_);
        CHECK(w->textDemoId_.get()->isVisible(true) && !w->textCheckId_.get()->isVisible(true));
        w->setPassword("abc");
        CHECK(elmOf(w->textDemoPass_.get())->text == u"***");
        w->destroy(__FILE__, __LINE__);
        CTask::flushDeleted();
        g_idLocked = false;
    }

    // ---------------------------------------------------------------- the scene: filled from the configs
    g_lastId = "kaiba";
    g_ucFiles["kaiba"] = {true, "blueeyes"};
    CLoginScene* s = dynamic_cast<CLoginScene*>(CLoginScene::New(root, g_layer));
    CHECK(s && g_bgs.back().first == 0x29 && g_account && s->account_.task() == g_account);
    CWindowLogin* w = s->login_.get();
    CHECK(w->userId() == "kaiba" && w->idChecked() && w->password() == "blueeyes" && w->passChecked());
    CHECK(g_ucUser == "kaiba");

    // OK -> the gate, then the login with what was typed
    frame(root);
    frame(root);
    CHECK(s->state_ == CLoginScene::WAIT_INPUT);
    fake(w->inputPass_.get())->text = u"blueeyes2";
    w->onControlEvent(w->buttonOk_.get());
    frame(root);
    CHECK(s->state_ == CLoginScene::CONNECT_DELAY && locked(w, 1) && w->result() == -1);
    frame(root);
    frame(root);
    CHECK(s->state_ == CLoginScene::WAIT_GATE && g_gate && s->gate_.task() == g_gate);
    frame(root);
    CHECK(s->state_ == CLoginScene::WAIT_GATE);
    g_gate->state = CNetGateTask::IDLE;
    frame(root);
    frame(root);
    CHECK(s->state_ == CLoginScene::LOGIN && !g_gate);
    frame(root);
    CHECK(g_logins.size() == 1 && g_logins[0].first == "kaiba" && g_logins[0].second == "blueeyes2");
    frame(root);
    CHECK(s->state_ == CLoginScene::WAIT_LOGIN);
    // a failed login gives the window back
    g_account->busy = CNetAccountTask::BUSY_FAILED;
    frame(root);
    CHECK(s->state_ == CLoginScene::SHOW && !locked(w, 1));
    // a good one stores what the boxes say: ID kept, password not
    w->setPassChecked(false);
    s->state_ = CLoginScene::WAIT_LOGIN;
    g_account->busy = CNetAccountTask::BUSY_DONE;
    frame(root);
    CHECK(s->state_ == CLoginScene::LOGGED_IN && g_saved && g_lastId == "kaiba");
    CHECK(g_ucSaved && !g_ucFiles["kaiba"].first && g_ucFiles["kaiba"].second.empty() && g_uc.encoded == "enc:");
    frame(root);
    CHECK(!g_account && s->state_ == CLoginScene::TO_PLAYER_SELECT);
    frame(root);
    CHECK(mng->nextSceneId() == SCENE_PLAYER_SELECT);
    s->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();

    // no last ID: the old yugi_usr.dat; Cancel goes back to the title; a gate error too
    g_lastId = "";
    g_legacy = true;
    std::memcpy(g_legacyRecord, "yugi\0\0\0\0\0\0\0\0\0\0\0\0dark magician\0\0\0", 32);
    s = dynamic_cast<CLoginScene*>(CLoginScene::New(root, g_layer));
    w = s->login_.get();
    CHECK(g_legacyPath == "old\\yugi_usr.dat" && w->userId() == "yugi" && w->idChecked());
    CHECK(w->password() == "dark magician" && w->passChecked() && g_ucUser == "yugi");
    frame(root);
    frame(root);
    w->onControlEvent(w->buttonCancel_.get());
    frame(root);
    CHECK(mng->nextSceneId() == SCENE_TITLE);
    s->state_ = CLoginScene::CONNECT;
    frame(root);
    g_gate->state = CNetGateTask::IDLE;
    g_gate->done = 1;
    frame(root);
    CHECK(s->state_ == CLoginScene::TO_TITLE && !g_gate);
    std::puts("login ok");
    return 0;
}
