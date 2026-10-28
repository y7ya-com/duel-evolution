// src/System CD3DDevice: device creation and render-mode switching (deltas), against the call-logging fake device;
// CStringDB lookups.
#include <cassert>
#include <cstdio>
#include <cstring>
#include <map>
#include <string>
#include <vector>

#include "System/CD3DDevice.h"
#include "System/yo2StringDB.h"

extern std::string g_d3dLog;
extern std::map<std::string, std::vector<uint8_t>> g_fakeFiles;

static bool has(const char* s) { return g_d3dLog.find(s) != std::string::npos; }

int main() {
    g_d3d = new CD3DDevice;
    assert(g_d3d->initialize(nullptr, 800, 600, false));
    assert(has("CreateDevice(44,1)") && g_d3d->multiplyAdd() && !g_d3d->fullscreen());
    assert(!g_d3d->initialize(nullptr, 800, 600, false));  // once only

    // 0 -> 4 (blend): blending on; TEXTUREFACTOR is listed but left to the elements
    g_d3dLog.clear();
    g_d3d->setMode(4);
    assert(has("RS(27,1)") && has("RS(25,6)") && !has("RS(60,"));
    // 4 -> 0: mode 0's own states, blending back off
    g_d3dLog.clear();
    g_d3d->setMode(0);
    assert(has("RS(27,0)") && has("RS(60,ffffffff)") && has("TSS(0,1,19)"));
    // same mode: nothing
    g_d3dLog.clear();
    g_d3d->setMode(0);
    assert(g_d3dLog.empty());
    // 0 -> 10: texture colour as is, point filtering; back to 0 restores MULTIPLYADD and linear
    g_d3d->setMode(10);
    assert(has("TSS(0,1,2)") && has("TSS(0,16,1)"));
    g_d3dLog.clear();
    g_d3d->setMode(0);
    assert(has("TSS(0,1,19)") && has("TSS(0,16,2)"));
    // without MULTIPLYADD the tables use MODULATE
    CD3DDevice::buildModeTables(false);
    g_d3d->setMode(10);
    g_d3dLog.clear();
    g_d3d->setMode(0);
    assert(has("TSS(0,1,4)") && !has("TSS(0,1,19)"));
    CD3DDevice::buildModeTables(true);

    // cached render-state setter
    g_d3dLog.clear();
    g_d3d->setRenderState(D3DRS_TEXTUREFACTOR, 0x80ffffff);
    g_d3d->setRenderState(D3DRS_TEXTUREFACTOR, 0x80ffffff);
    assert(g_d3dLog == "RS(60,80ffffff)");

    assert(g_d3d->setFullscreen(true) && has("Reset(0)") && g_d3d->fullscreen());
    CD3DDevice::release();
    assert(!g_d3d);

    // string table: offsets into NUL-terminated text
    const char bin[] = "Hello\0World";
    uint32_t idx[2] = {0, 6};
    g_fakeFiles["data/common/yo2text_?.bin"].assign(bin, bin + sizeof bin);
    g_fakeFiles["data/common/yo2text_?.idx"].assign(reinterpret_cast<uint8_t*>(idx),
                                                   reinterpret_cast<uint8_t*>(idx) + sizeof idx);
    assert(g_stringDB->load() && g_stringDB->count() == 2);
    assert(g_stringDB->get(1) == "World" && g_stringDB->get(0) == "Hello");
    std::puts("device_test ok");
}
