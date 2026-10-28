// Stand-ins for what src/System calls in other folders (or in System files not written yet), linked into the
// System tests only.
#include "System/yo2SceneManager.h"

int g_fakeFaderState;

CElement* screenFaderNew(CTask* parent, uint32_t priority) { return CElement::newChild(parent, priority); }
bool screenFaderFinished(CElement*) { return g_fakeFaderState == 3; }
bool screenFaderIdle(CElement*) { return g_fakeFaderState == 0; }

CElement* g_fakeSceneLayer;
CElement* appSceneLayer() { return g_fakeSceneLayer; }

#include <map>
#include <string>

#include "System/yo2File.h"

std::map<std::string, std::vector<uint8_t>> g_fakeFiles;
bool yo2LoadFile(const char* name, std::vector<uint8_t>& out) {
    auto it = g_fakeFiles.find(name);
    if (it == g_fakeFiles.end())
        return false;
    out = it->second;
    return true;
}
