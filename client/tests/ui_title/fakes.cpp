// Doubles for what src/title calls in other folders (see src/title/titleExt.h). Every call is logged.
#include "fakes.h"

#include <cstdarg>
#include <cstdio>

#include "Net/NetLobby.h"

std::vector<std::string> g_log;
void logf(const char* fmt, ...) {
    char buf[256];
    va_list ap;
    va_start(ap, fmt);
    std::vsnprintf(buf, sizeof buf, fmt, ap);
    va_end(ap);
    g_log.push_back(buf);
}
std::string elmName(const CTask* t) { return t ? t->instName().c_str() : "null"; }

CTask* g_world;
int32_t g_language = 1;
CElement* g_swf;
bool g_swfFinished;
const CTaskPtrBase* g_destroyedPtr;
FakeDialog* g_lastDialog;
CElement* g_lastOption;
CNetLobby* g_lobby;
CElement *g_menu, *g_chat, *g_place, *g_duelConfig;
CTask* g_duelAva;

CElement* swfEngineNew(CElement* parent, uint32_t priority, const vc6::string& path, bool loop) {
    logf("swf %s %u %d", path.c_str(), priority, loop);
    return g_swf = CElement::newChild(parent, priority);
}
void swfEngineSetPlaying(CElement* swf, bool on) { logf("swfPlay %s %d", elmName(swf).c_str(), on); }
bool swfEngineFinished(CElement* swf) { return swf == g_swf && g_swfFinished; }
void swfEngineSetActive(CElement* swf, bool on) { logf("swfActive %s %d", elmName(swf).c_str(), on); }
void swfEngineSetListener(CElement* swf, CTask* t) { logf("swfListener %s %s", elmName(swf).c_str(), t->taskName().c_str()); }
bool soundPlay(uint32_t id, int32_t fade) {
    logf("sound %x %d", id, fade);
    return true;
}
CTask* bgCommonNew(CTask* parent, CElement* layer, int32_t bg, int32_t arg) {
    logf("bg %s %d %d", elmName(layer).c_str(), bg, arg);
    return CTask::newChild(parent, 10000);
}
CElement* dialogYesNoNew(CElement* parent, int32_t a, int32_t b, int32_t yes, int32_t no, int32_t c) {
    logf("yesno %s %d %d %d %d %d", elmName(parent).c_str(), a, b, yes, no, c);
    auto* d = new FakeDialog;
    return g_lastDialog = dynamic_cast<FakeDialog*>(d->create(parent, 10000));
}
int32_t dialogResult(CElement* dlg) { return static_cast<FakeDialog*>(dlg)->result; }
void windowSetSize(CElement* w, float x, float y) { logf("size %s %g %g", elmName(w).c_str(), x, y); }
void windowLayout(CElement* w) { logf("layout %s", elmName(w).c_str()); }
void windowSetTextId(CElement* w, int32_t id) { logf("text %s %#x", elmName(w).c_str(), id); }
void windowCentre(CElement* w) { logf("centre %s", elmName(w).c_str()); }
int32_t systemLanguage() { return g_language; }
void systemConfigSetLastLoginId(vc6::string id) { logf("lastLoginId '%s'", id.c_str()); }
bool systemConfigSave() {
    logf("configSave");
    return true;
}
vc6::string systemHomepageUrl() { return "http://home/"; }
void shellOpen(const char* url) { logf("open %s", url); }
void appQuit() { logf("quit"); }
void screenFaderFadeIn(CElement* fader, int32_t frames, int32_t z) { logf("fadeIn %d %d %d", fader != nullptr, frames, z); }
CTask* gameWorld() { return g_world; }
void gameWorldEnterTitle(CTask* w) { logf("worldEnterTitle %d", w != nullptr); }
CElement* gameWorldMenu(CTask*) { return g_menu; }
CElement* gameWorldChat(CTask*) { return g_chat; }
CElement* gameWorldPlace(CTask*) { return g_place; }
CElement* gameWorldDuelConfig(CTask*) { return g_duelConfig; }
CTask* gameWorldDuelAvatar(CTask*) { return g_duelAva; }
void gameWorldSetKorean(CTask* w, bool k) { logf("korean %d %d", w != nullptr, k); }
void chatWindowClear(CElement* c) { logf("chatClear %s", elmName(c).c_str()); }
void chatWindowSetTab(CElement* c, int32_t tab, bool on) { logf("chatTab %s %d %d", elmName(c).c_str(), tab, on); }
void menuWindowReset(CElement* m) { logf("menuReset %s", elmName(m).c_str()); }
void menuWindowClose(CElement* m) { logf("menuClose %s", elmName(m).c_str()); }
void duelAvatarClear(CTask* a, int32_t side) { logf("duelAvaClear %s %d", elmName(a).c_str(), side); }
void duelRequestReset() { logf("duelRequestReset"); }
CNetLobby* appNetLobby() { return g_lobby; }
void appDuelConnectionDisconnect() { logf("duelDisconnect"); }
const CTaskPtrBase* destroyedTaskPtr(const CTaskMessage*) { return g_destroyedPtr; }
const char* swfEventObjectName(const CTaskMessage* m) { return static_cast<const SwfEvent*>(m)->name.c_str(); }
bool swfEventClicked(const CTaskMessage* m) { return static_cast<const SwfEvent*>(m)->clicked; }
CElement* optionDlgNew(CElement* parent, int32_t x, int32_t y, const vc6::string& bg) {
    logf("option %s %d %d %s", elmName(parent).c_str(), x, y, bg.c_str());
    return g_lastOption = CElement::newChild(parent, 10000);
}

// Net's socket calls (src/Net/MessageIO.h): the platform's, never reached by these tests
#include "Net/MessageIO.h"
YgTransport ygSocketTransport(int32_t) { return {}; }
void ygSocketClose(int32_t) {}
int32_t ygConnectAsync(const char*, uint16_t, YgConn*, uint32_t) { return -1; }
int32_t ygSocketSelect(int32_t, uint32_t) { return -1; }
