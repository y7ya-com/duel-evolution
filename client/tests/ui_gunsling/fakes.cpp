// Doubles for what src/Gunsling calls in other folders. Every call is logged.
#include <cstdarg>
#include <cstdio>
#include <string>
#include <vector>

#include "Gunsling/yo2GunslingManager.h"
#include "Net/NetLobby.h"
#include "System/yo2Scene.h"

std::vector<std::string> g_log;
static void logf(const char* fmt, ...) {
    char buf[256];
    va_list ap;
    va_start(ap, fmt);
    std::vsnprintf(buf, sizeof buf, fmt, ap);
    va_end(ap);
    g_log.push_back(buf);
}

CNetLobby* g_lobby;
CTask* g_world;
int32_t g_area = -1;
CElement* g_swf;
bool g_swfFinished;

#include "fakes.h"
CSceneTask* makeAreaMap(CTask* parent, CElement* layer) { return CSceneTask::spawn<FakeAreaMap>(parent, layer); }
FakeAreaMap* areaMapOf(CSceneTask* s) { return dynamic_cast<FakeAreaMap*>(s); }

CEasyTask* netLobbyTaskSpawn(CTask* parent) {
    auto* t = new CEasyTask;
    return dynamic_cast<CEasyTask*>(t->create(parent, 10000));
}
bool netLobbyTaskSendMove(CEasyTask* t, uint32_t pid, uint16_t x, uint16_t y, uint8_t dir, uint8_t b) {
    logf("move %s %u %u %u %u %u", t->instName().c_str(), pid, x, y, dir, b);
    return true;
}
CNetLobby* appNetLobby() { return g_lobby; }
uint32_t myPlayerPid() { return 4242; }
CTask* gameWorld() { return g_world; }
void gameWorldSetArea(CTask*, int32_t a) { g_area = a; }
int32_t gameWorldArea(CTask*) { return g_area; }
Vec3 fieldMapInitPos(int32_t area, int32_t entry) {
    logf("initPos %d %d", area, entry);
    return {1000, 2000, 5};
}
int32_t fieldMapInitDir(int32_t area, int32_t entry) {
    logf("initDir %d %d", area, entry);
    return 3;
}
CSceneTask* asAreaMap(CSceneTask* s) { return areaMapOf(s); }
bool areaMapLoaded(CSceneTask* m) { return areaMapOf(m)->loaded; }
void areaMapSetFrozen(CSceneTask* m, bool on) { areaMapOf(m)->frozen = on; }
bool areaMapLeaving(CSceneTask* m) { return areaMapOf(m)->leaving; }
void screenFaderFadeOut(CElement*, int32_t frames, int32_t z) { logf("fadeOut %d %d", frames, z); }
void screenFaderFade(CElement*, const float from[4], const float to[4], int32_t frames, bool a, bool b, int32_t z) {
    logf("fade %g,%g,%g,%g -> %g,%g,%g,%g %d %d %d %d", from[0], from[1], from[2], from[3], to[0], to[1], to[2], to[3],
         frames, a, b, z);
}
void screenFaderFadeTo(CElement*, const float c[3], int32_t frames, bool a, bool b, int32_t z) {
    logf("fadeTo %g,%g,%g %d %d %d %d", c[0], c[1], c[2], frames, a, b, z);
}
CElement* swfEngineNew(CElement* parent, uint32_t priority, const vc6::string& path, bool loop) {
    logf("swf %s %s %u %d", parent->instName().c_str(), path.c_str(), priority, loop);
    return g_swf = CElement::newChild(parent, priority);
}
void swfEngineSetPlaying(CElement* swf, bool on) { logf("play %s %d", swf->instName().c_str(), on); }
bool swfEngineFinished(CElement* swf) { return swf == g_swf && g_swfFinished; }
bool soundPlay(uint32_t id, int32_t fade) {
    logf("sound %x %d", id, fade);
    return true;
}

// Net's socket calls (src/Net/MessageIO.h): the platform's, never reached by these tests
#include "Net/MessageIO.h"
YgTransport ygSocketTransport(int32_t) { return {}; }
void ygSocketClose(int32_t) {}
int32_t ygConnectAsync(const char*, uint16_t, YgConn*, uint32_t) { return -1; }
int32_t ygSocketSelect(int32_t, uint32_t) { return -1; }
