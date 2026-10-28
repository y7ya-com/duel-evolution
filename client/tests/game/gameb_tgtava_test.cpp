// src/Game/yo2TgtAvaListDlg.cpp: CTgtAvaListDlg (the "which avatar?" list) over real player avatars and a real
// CWindowModelList; the area map, NPC and info-window calls are stand-ins.
#include <vector>

#include "Game/Avatar/yo2ChibiAvatarElm.h"
#include "Game/Avatar/yo2ChibiAvatarManager.h"
#include "Game/Avatar/yo2PlChibiAvatar.h"
#include "Game/yo2GameManager.h"
#include "Game/yo2HelpText.h"
#include "Game/yo2TgtAvaListDlg.h"
#include "Game/yo2TgtAvaListExtern.h"
#include "System/window/yo2WindowDialogs.h"
#include "System/yo2SceneManager.h"
#include "System/yo2StringDB.h"
// (CGameMng is linked for setRoomEntry, and it defines the avatar check avatar_stubs.h stands in for)
#define avatarValidate avatarValidateStandIn
#include "avatar_stubs.h"
#undef avatarValidate
#include "game_test.h"
// the window controls' menu bar reads g_helpTextMng: name it here so the linker takes yo2HelpText.o from libgame
HelpTextMng** keepHelpText = &g_helpTextMng;

// --- the window controls' bridges, on the Avatar files' CSpriteElm ---------------------------------------------------
void windowSpriteCreate(CTaskPtr<CSpriteElm>& to, CTask* parent, uint32_t priority) {
    auto* s = new CSpriteElm;
    s->create(parent, priority);
    to.set(s);
}
void windowSpriteCreate(CTaskPtr<CSpriteElm>& to, CTask* parent, uint32_t priority, const vc6::string&) {
    windowSpriteCreate(to, parent, priority);
}
void windowSpriteTexture(const CTaskPtr<CSpriteElm>&, const vc6::string&) {}
struct WinText : CElement {
    vc6::wstring text;
};
static std::vector<std::u16string> g_items;
void windowTextElmCreate(CTaskPtr<CTextElm>& to, CTask* parent, uint32_t priority) {
    to.set(CTextElm::create(parent, priority));
}
void windowTextElmSetText(const CTaskPtr<CTextElm>& t, const vc6::wstring& s) { t.get()->setText(std::u16string(s)); }
void windowTextElmSetBox(const CTaskPtr<CTextElm>&, float, float) {}
int32_t windowTextElmWidth(const CTaskPtr<CTextElm>&) { return 40; }
int32_t windowTextElmLineCount(const CTaskPtr<CTextElm>&, float) { return 1; }
int32_t windowTextElmLinesFrom(const CTaskPtr<CTextElm>&, int32_t, float) { return 1; }
void windowTextElmSetFontSize(const CTaskPtr<CTextElm>&, int32_t) {}
void windowTextElmSetLineGap(const CTaskPtr<CTextElm>&, int32_t) {}
void windowTextElmSetUnk748(const CTaskPtr<CTextElm>&, bool) {}
void windowTextElmSetAlign(const CTaskPtr<CTextElm>&, int32_t) {}
int32_t windowTextElmAlign(const CTaskPtr<CTextElm>&) { return 0; }
void windowTextElmSetFirstLine(const CTaskPtr<CTextElm>&, int32_t) {}
int32_t windowTextElmFirstLine(const CTaskPtr<CTextElm>&) { return 0; }
int32_t windowTextElmFontHeight(const CTaskPtr<CTextElm>&) { return 16; }
void windowTextElmSetPageLines(const CTaskPtr<CTextElm>&, int32_t) {}
int32_t windowTextElmPageLines(const CTaskPtr<CTextElm>&) { return 0; }
void windowTextElmSetField430(const CTaskPtr<CTextElm>&, int32_t) {}
void windowMouse(int32_t* x, int32_t* y) { *x = *y = -1000; }
bool windowMouseLeftPushed() { return false; }
class CDupSprite : public CElement {};
void windowDupCreate(CTaskPtr<CDupSprite>& to, CTask* parent, uint32_t priority, const vc6::string&) {
    auto* d = new CDupSprite;
    d->create(parent, priority);
    to.set(d);
}
void windowDupClear(const CTaskPtr<CDupSprite>&) {}
void windowDupCreate(CTaskPtr<CDupSprite>& to, CTask* parent, uint32_t priority) { windowDupCreate(to, parent, priority, ""); }
// what the input box (CWindowTaskInput, linked with the window controls) reaches; never called here
void windowTextElmSetKeepNewlines(const CTaskPtr<CTextElm>&, bool) {}
void windowSpriteTextureSize(const CTaskPtr<CSpriteElm>&, float* w, float* h) { *w = *h = 0; }
int32_t windowSpriteTextureFormat(const CTaskPtr<CSpriteElm>&) { return 0; }
const uint8_t* windowSpriteTexturePixel(const CTaskPtr<CSpriteElm>&, int32_t, int32_t, int32_t) { return nullptr; }
void windowTextElmCaretIndex(const CTaskPtr<CTextElm>&, int32_t, int32_t, int32_t* index) { *index = 0; }
void windowTextElmCaretFromIndex(const CTaskPtr<CTextElm>&, int32_t, int32_t* col, int32_t* line) { *col = *line = 0; }
void windowTextElmCaretPos(const CTaskPtr<CTextElm>&, int32_t, int32_t, float* x, float* y) { *x = *y = 0; }
void windowTextElmCaretAt(const CTaskPtr<CTextElm>&, float, float, int32_t* col, int32_t* line) { *col = *line = 0; }
class CIME : public CTask {};
void windowImeCreate(CTaskPtr<CIME>&, CTask*, CWindowTaskControll*) {}
void windowImeMessage(const CTaskPtr<CIME>&, const WindowMsg&) {}
void windowImeSetPos(const CTaskPtr<CIME>&, float, float, float) {}
void windowDupAddTile(const CTaskPtr<CDupSprite>&, const WindowDupTile&) {}
#ifndef _WIN32
short GetKeyState(int) { return 0; }
// (the clipboard, as the input box's paste declares it; <windows.h> here would redirect fopen)
struct HWND__;
int IsClipboardFormatAvailable(unsigned) { return 0; }
int OpenClipboard(HWND__*) { return 0; }
int CloseClipboard() { return 1; }
void* GetClipboardData(unsigned) { return nullptr; }
void* GlobalLock(void* h) { return h; }
int GlobalUnlock(void*) { return 1; }
#endif
static CElement* g_layer;
CElement* appSceneLayer() { return g_layer; }
CElement* screenFaderNew(CTask* parent, uint32_t priority) { return CElement::newChild(parent, priority); }
bool screenFaderFinished(CElement*) { return true; }
bool screenFaderIdle(CElement*) { return true; }

// --- what CGameMng / Net reach that this test never runs -------------------------------------------------------------
struct CNetLobby;
CNetLobby* appNetLobby() { return nullptr; }

// --- yo2TgtAvaListExtern.h ---------------------------------------------------------------------------------------------
static std::vector<CChibiAvatar*> g_at;
void chibiMngCollectAt(CChibiAvatarMng*, int32_t, int32_t, std::vector<CChibiAvatar*>* out) { *out = g_at; }
CElement* chibiMngLayer(CChibiAvatarMng*) { return g_layer; }
void npcAvatarSetMarked(CChibiAvatar*, bool) {}
int32_t npcAvatarId(CChibiAvatar*) { return 0; }
CChibiAvatar* areaMapMyAvatar(CSceneTask*) { return nullptr; }
static std::vector<uint32_t> g_infos;
void playerInfoOpen(uint32_t pid) { g_infos.push_back(pid); }
void npcTalkOpen(int32_t) {}
static bool g_rightPushed;
bool appMouseRightPushed() { return g_rightPushed; }

struct FakeText : CStringDB {
    vc6::string get(uint32_t id) const override { return yo2Format("T%u", id); }
};

int main() {
    // the pointer algorithms
    CChibiAvatar* a = reinterpret_cast<CChibiAvatar*>(0x10);
    CChibiAvatar* b = reinterpret_cast<CChibiAvatar*>(0x20);
    CChibiAvatar* v[5] = {a, b, a, b, b};
    CChibiAvatar* out[5] = {};
    CHECK(avatarFind(v, v + 5, b) == v + 1 && avatarFind(v, v + 5, nullptr) == v + 5);
    CHECK(avatarRemoveCopy(v, v + 5, out, b) == out + 2 && out[0] == a && out[1] == a);
    CHECK(avatarCopy(v, v + 3, out) == out + 3 && out[2] == a);

    CZSortSet& layers = testZSort();
    (void)layers;
    FakeText text;
    g_stringDB = &text;
    CWindowTaskFactory::create();
    CTask* root = CTask::createRoot();
    g_layer = CElement::newChild(root, 5);
    CGameMng::create(root, 3);
    CSceneMng::newChild(root, 4);

    CAvatarData d;
    d.setDefault(CAvatarData::FEMALE_DM);
    CPlChibiAvatar* me = CPlChibiAvatar::create(root, g_layer, d.bytes_);
    CPlChibiAvatar* p1 = CPlChibiAvatar::create(root, g_layer, d.bytes_);
    CPlChibiAvatar* p2 = CPlChibiAvatar::create(root, g_layer, d.bytes_);
    p1->reset(), p2->reset();   // the kind (KIND_PLAYER) comes with reset
    p1->pid_ = 101, p2->pid_ = 202;

    auto* mng = new CChibiAvatarMng;
    mng->CTask::create(root, 6);
    CTgtAvaListDlg* t = CTgtAvaListDlg::create(root, 7, CTgtAvaListDlg::OPEN_INFO | CTgtAvaListDlg::CLOSE_ON_PICK, mng);
    CHECK(t && t->flags_ == 3 && t->avatarMng_.get() == mng && t->list_ && t->list_->parent() == g_layer);
    CHECK(t->list_->instName() == "クリックしたアバターのリストダイアログ" && !t->list_->disp_);

    // nothing but the player himself under the cursor: no list
    g_at = {me};
    CHECK(!t->open(500, 400, 10, 20, me) && g_gameCtrl.now() == CTRL_NONE);
    // two others: listed, highlighted, the mode taken
    g_at = {p1, me, p2};
    CHECK(t->open(500, 400, 10, 20, me) && g_gameCtrl.now() == CTRL_AVATAR_LIST);
    CHECK(t->avatars_.size() == 2 && t->avatars_[0] == p1 && t->avatars_[1] == p2);
    CHECK(t->list_->disp_ && t->list_->x_ == 380 && t->list_->y_ == 370);
    CHECK(p1->elm()->color_[1] == 0.8f && p2->elm()->color_[2] == 0.5f && me->elm()->color_[1] == 1);
    // a pick: the target, the list closed (highlight off, mode left), the info opened
    t->list_->list_->clicked_ = 1;
    t->onMain();
    CHECK(t->target_.get() == p2 && g_infos.size() == 1 && g_infos[0] == 202);
    CHECK(g_gameCtrl.now() == CTRL_NONE && !t->list_->disp_ && p2->elm()->color_[1] == 1);
    // a right click closes an open list
    t->list_->list_->clicked_ = -1;
    CHECK(t->open(500, 400, 10, 20, me));
    g_rightPushed = true;
    t->onMain();
    CHECK(g_gameCtrl.now() == CTRL_NONE && !t->list_->disp_ && g_infos.size() == 1);
    g_rightPushed = false;

    t->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    g_stringDB = nullptr;
    std::puts("gameb_tgtava: ok");
}
