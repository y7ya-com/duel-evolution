// yo2Studio.cpp: rendering. A CStudio is one pass: set its render target (by default the back buffer), clear it,
// draw its camera, then flush its draw queues in order. CStudioMng (one global object) owns the studios sorted by
// priority and renders them all each frame, then presents; it also handles a lost device (drop the frame's draws,
// and once the device can be reset: release the default-pool surfaces, Reset, re-acquire them).
#pragma once
#include <cstdint>

#include "CD3DDevice.h"
#include "vc6.h"

class CElement;
class CZSort;

// ---- what this file calls outside yo2Studio.cpp (tests: tests/system/stubs.cpp) ----

class CStudio {
public:
    enum Target : int32_t { BACK_BUFFER = 0, TEXTURE = 1 };  // TEXTURE was never finished ("未対応")

    CStudio();
    virtual ~CStudio();

    void render();
    void useBackBuffer();
    void releaseSurfaces();
    void restore();
    // @yo2 0x006207f0 CStudio::addLayer (vector<CZSort*>::insert at the end)
    void addLayer(CZSort* q) { layers_.push_back(q); }
    void dropFrame();

    int32_t target_ = BACK_BUFFER;          // 0x04
    CElement* camera_ = nullptr;            // 0x08 drawn first (its draw sets view/projection/viewport)
    IDirect3DSurface8* surface_ = nullptr;  // 0x0c render target
    IDirect3DSurface8* depth_ = nullptr;    // 0x10 depth-stencil; null: clear the target only
    vc6::vector<CZSort*> layers_;           // 0x14
    float clear_[4] = {0.5f, 0.1f, 0.1f, 1.0f};  // 0x24 r g b a
};
YO2_SIZEOF(CStudio, 0x34);

class CStudioMng {
public:
    CStudioMng();
    virtual ~CStudioMng();
    static CStudioMng* instance() { return s_instance; }

    CStudio* addStudio(uint32_t priority);
    void removeStudio(CStudio* s);
    void render();
    size_t size() const { return studios_.size(); }

private:
    struct Entry {
        CStudio* studio;
        uint32_t priority;
    };
    [[maybe_unused]] uint32_t unk4_ = 0;  // 0x04
    vc6::vector<Entry> studios_;  // 0x08 by priority, ties in insertion order
    [[maybe_unused]] uint32_t unk18_[4] = {};      // 0x18
    static CStudioMng* s_instance;  // DAT_01271874
};
YO2_SIZEOF(CStudioMng, 0x28);

extern CStudioMng g_studioMng;  // DAT_01271848
