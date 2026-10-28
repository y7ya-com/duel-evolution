// Doubles for what src/Sound calls in other folders; every call is logged.
#include <cstdarg>
#include <cstdio>
#include <string>
#include <vector>

#include "Sound/SoundTest.h"
#include "System/yo2Element.h"

std::vector<std::string> g_log;
static void logf(const char* fmt, ...) {
    char buf[256];
    va_list ap;
    va_start(ap, fmt);
    std::vsnprintf(buf, sizeof buf, fmt, ap);
    va_end(ap);
    g_log.push_back(buf);
}
struct SwfEvent : CTaskMessage {
    SwfEvent(const char* n, bool c) : CTaskMessage(0x13), name(n), clicked(c) {}
    std::string name;
    bool clicked;
};
CTaskMessage* makeSwfEvent(const char* name, bool clicked) { return new SwfEvent(name, clicked); }
CElement* g_panel;

CElement* swfEngineNew(CElement* parent, uint32_t priority, const vc6::string& path, bool loop) {
    logf("swf %s %u %d", path.c_str(), priority, loop);
    return g_panel = CElement::newChild(parent, priority);
}
void swfEngineSetPlaying(CElement* s, bool on) { logf("play %s %d", s->instName().c_str(), on); }
void swfEngineSetListener(CElement*, CTask* t) { logf("listener %s", t->taskName().c_str()); }
const char* swfEventObjectName(const CTaskMessage* m) { return static_cast<const SwfEvent*>(m)->name.c_str(); }
bool swfEventClicked(const CTaskMessage* m) { return static_cast<const SwfEvent*>(m)->clicked; }
bool soundPlay(uint32_t id, int32_t f) {
    logf("+%x %d", id, f);
    return true;
}
bool soundStop(uint32_t id, int32_t f) {
    logf("-%x %d", id, f);
    return true;
}
int32_t soundBgmCount() { return 3; }
int32_t soundSeCount() { return 2; }
CElement* windowModelThinNew(CTask* parent, int32_t a, int32_t b, int32_t c) {
    logf("window %d %d %d", a, b, c);
    return CElement::newChild(parent, 10000);
}
void windowSetSize(CElement*, float w, float h) { logf("size %g %g", w, h); }
void windowLayout(CElement*) { logf("layout"); }
void windowSetOrigin(CElement*, float x, float y) { logf("origin %g %g", x, y); }
void windowSetText(CElement*, const char16_t* s) {
    std::string t;
    for (; *s; s++) t += *s == '\n' ? '|' : static_cast<char>(*s);
    logf("text %s", t.c_str());
}
