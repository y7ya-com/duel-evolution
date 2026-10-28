// Doubles for what src/logo calls in other folders: a CSwfEngine that is a plain CElement, and the language setting.
#include <string>

#include "logo/logoEntry.h"

std::string g_swfPath;
uint32_t g_swfPriority = 99;
bool g_swfLoop, g_swfPlaying, g_swfFinished;
CElement* g_swf;
int32_t g_language = 1;

CElement* swfEngineNew(CElement* parent, uint32_t priority, const vc6::string& path, bool loop) {
    g_swfPath = path.c_str();
    g_swfPriority = priority;
    g_swfLoop = loop;
    return g_swf = CElement::newChild(parent, priority);
}
void swfEngineSetPlaying(CElement* swf, bool on) {
    if (swf == g_swf) g_swfPlaying = on;
}
bool swfEngineFinished(CElement* swf) { return swf == g_swf && g_swfFinished; }
int32_t systemLanguage() { return g_language; }
