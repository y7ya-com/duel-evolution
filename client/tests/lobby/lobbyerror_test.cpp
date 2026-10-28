// src/Lobby/yo2LobbyError.{h,cpp}: the error messages, and the error state run on a stand-in scene.
#include <string>
#include <vector>

#include "Lobby/yo2LobbyError.h"
#include "System/yo2Scene.h"
#include "System/yo2StringDB.h"
#include "System/yo2ZSort.h"
#include "lobby_test.h"
#include "window_stubs.h"

struct FakeText : CStringDB {
    vc6::string get(uint32_t i) const override {
        char b[16];
        std::snprintf(b, sizeof b, "T%x", i);
        return b;
    }
};

struct FakeErr : CWindowModelDialogWithBtns {
    std::u16string text;
    int layouts = 0;
    void setText(const WChar* s) override { text = s; }
    void layout() override { layouts++; }
    void onControlEvent(CWindowTaskControll*) override {}
};
static FakeErr* g_err;
CWindowModelDialogWithBtns* windowModelDialogErrorCreate(CTask* parent) {
    g_err = new FakeErr;
    g_err->create(parent, 10000);
    return g_err;
}
vc6::string lobbyErrorUrl() { return "http://example.invalid/help"; }
static int g_faderHides, g_backToMain;
static std::vector<std::string> g_opened;
static std::vector<uint32_t> g_sounds;
void appPlaySound(uint32_t id, int32_t) { g_sounds.push_back(id); }
void screenFaderHide() { g_faderHides++; }
void lobbyErrorBackToMain() { g_backToMain++; }
void lobbyShellOpen(const char* url) { g_opened.push_back(url); }

struct FakeScene : CSceneTask {
    int32_t stateFrames = 5, errorCode = 0, prevState = 0, state = 0x30, nextState = LOBBY_STATE_MAIN, errChoice = 7;
    CTaskPtr<CWindowModelDialogWithBtns> errDlg;
    vc6::string errUrl;
    int closedCount = 0;
    FakeScene() { errDlg.setUser(this); }
    int onErrorDialog(CWindowTaskModel*, CALLBACK_MESSAGE_TYPE, intptr_t v) { return lobbyOnErrorDialog(*this, v); }
    void errorClosed() { closedCount++; }
};

static std::u16string u(const char* s) {
    std::u16string r;
    while (*s) r += (char16_t)(uint8_t)*s++;
    return r;
}

int main() {
    FakeText text;
    g_stringDB = &text;
    vc6::string url;
    CHECK(lobbyErrorMessage(-0x26a, &url) == "T11cf" && url.empty());
    CHECK(lobbyErrorMessage(-0x25c, &url) == "T11c9(-604)");
    CHECK(lobbyErrorMessage(-0x1f0, &url) == "T11c5(-496)" && lobbyErrorMessage(-0x1f6, &url) == "T11c5(-502)");
    CHECK(lobbyErrorMessage(-0x105, &url) == "T11b8" && lobbyErrorMessage(-0x191, &url) == "T11c1(-401)");
    CHECK(lobbyErrorMessage(-0x288, &url) == "T1ba2" && lobbyErrorMessage(-0x286, &url) == "T1194(-646)");
    CHECK(lobbyErrorMessage(0, &url) == "T1194(0)" && lobbyErrorMessage(-151, &url) == "T1194(-151)");
    CHECK(lobbyErrorMessage(-0x264, &url) == "T11cc\n\nhttp://example.invalid/help" && url == "http://example.invalid/help");

    CZSortSet layers;
    g_zsortSet = &layers;
    CWindowTaskFactory::create();
    CElement* root = CElement::createRoot();
    FakeScene* s = CSceneTask::spawn<FakeScene>(root, root);
    s->createBaseElement("base");

    // first call: the dialog, topmost, with the message; nothing answered yet
    s->errorCode = -0x264;
    CHECK(!lobbyErrorState(*s));
    CHECK(g_err && s->errDlg.get() == g_err && g_err->parent() == s->baseElement() && s->errChoice == -1);
    CHECK(g_err->instName() == "m_pErrDlg -> CWindowModelDialogOk" && g_err->topmost_ && g_err->layouts == 1);
    CHECK(g_err->text == u("T11cc\n\nhttp://example.invalid/help") && g_faderHides == 1 && s->state == 0x30);
    CHECK(!lobbyErrorState(*s) && g_faderHides == 2 && g_err->layouts == 1);   // waiting: the same dialog

    // the callback answers; next call closes it, opens the page and moves on to the main state
    g_err->callback_->call(g_err, CALLBACK_MESSAGE_TYPE(0), 4000);
    CHECK(s->errChoice == 1 && g_sounds == std::vector<uint32_t>{0x10000001});
    lobbyErrorState(*s);
    for (CZSort& q : layers.layer) q.clear();
    CTask::flushDeleted();
    CHECK(!s->errDlg.task() && s->closedCount == 1 && g_backToMain == 1);
    CHECK((g_opened == std::vector<std::string>{"http://example.invalid/help"}) && s->errUrl.empty());
    CHECK(s->prevState == 0x30 && s->state == LOBBY_STATE_MAIN && s->nextState == LOBBY_STATE_MAIN && s->stateFrames == 0);

    // an error going elsewhere than the main state: no page, no "back to main"
    s->errorCode = -0x1fe;
    s->state = 0x31;
    s->nextState = 0x20;
    lobbyErrorState(*s);
    CHECK(g_err->text == u("T11c6"));
    g_err->callback_->call(g_err, CALLBACK_MESSAGE_TYPE(0), 0xfa1);   // any other button: still open
    CHECK(s->errChoice == -1 && g_sounds.size() == 1);
    g_err->callback_->call(g_err, CALLBACK_MESSAGE_TYPE(0), 0xfa2);
    lobbyErrorState(*s);
    CHECK(s->state == 0x20 && s->prevState == 0x31 && g_backToMain == 1 && g_opened.size() == 1);
    for (CZSort& q : layers.layer) q.clear();   // the draw queues still name freed elements
    std::printf("ok: lobbyerror (messages per code, the -612 page, dialog -> answer -> next state)\n");
}
