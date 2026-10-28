#include "yo2Studio.h"

#include <algorithm>

#include "CTextureManager.h"
#include "yo2App.h"
#include "yo2Debug.h"
#include "yo2Element.h"
#include "yo2ZSort.h"

CStudioMng* CStudioMng::s_instance;
CStudioMng g_studioMng;

namespace {
// D3DCOLOR_ARGB from 0..1 floats, each channel truncated (the exe's ftol).
D3DCOLOR argb(const float c[4]) {
    auto ch = [](float v) { return static_cast<uint32_t>(static_cast<int32_t>(v * 255.0f)); };
    return ch(c[3]) << 24 | ch(c[0]) << 16 | ch(c[1]) << 8 | ch(c[2]);
}
IDirect3DDevice8* device() { return g_d3d->device(); }
constexpr HRESULT kDeviceLost = static_cast<HRESULT>(0x88760868);
constexpr HRESULT kDeviceNotReset = static_cast<HRESULT>(0x88760869);
constexpr HRESULT kDriverInternalError = static_cast<HRESULT>(0x88760827);
constexpr HRESULT kOutOfMemory = static_cast<HRESULT>(0x8007000e);
}  // namespace

// ---- CStudio ----

// @yo2 0x00620b70 CStudio::CStudio
CStudio::CStudio() = default;

// @yo2 0x00620c10 CStudio::~CStudio
// @yo2 0x00620be0 CStudio deleting destructor
CStudio::~CStudio() { releaseSurfaces(); }

// @yo2 0x00620a10 CStudio::Render: target, clear, camera, then the queues in order
void CStudio::render() {
    IDirect3DDevice8* dev = device();
    dev->SetRenderTarget(surface_, depth_);
    if (dev->BeginScene() < 0)
        return;
    DWORD flags = depth_ ? D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER : D3DCLEAR_TARGET;
    dev->Clear(0, nullptr, flags, argb(clear_), 1.0f, 0);
    if (camera_)
        camera_->draw(0);
    for (CZSort* q : layers_)
        q->flush();
    dev->EndScene();
}

// @yo2 0x006205d0 CStudio::useBackBuffer: render into whatever the device renders into now
void CStudio::useBackBuffer() {
    target_ = BACK_BUFFER;
    if (surface_)
        surface_->Release();
    device()->GetRenderTarget(&surface_);
    if (depth_)
        depth_->Release();
    device()->GetDepthStencilSurface(&depth_);
}

// @yo2 0x00620650 CStudio::releaseSurfaces (before a device reset)
void CStudio::releaseSurfaces() {
    if (surface_) {
        surface_->Release();
        surface_ = nullptr;
    }
    if (depth_) {
        depth_->Release();
        depth_ = nullptr;
    }
}

// @yo2 0x00620690 CStudio::restore (after a device reset)
void CStudio::restore() {
    if (target_ == BACK_BUFFER)
        useBackBuffer();
    else if (target_ == TEXTURE)
        YO2_ASSERT(false, "未対応");  // not supported
}

// @yo2 0x00620ca0 CStudio::dropFrame: the device is lost; empty the queues (their draws go nowhere)
void CStudio::dropFrame() {
    for (CZSort* q : layers_) {
        q->flush();
        q->clear();
    }
}

// ---- CStudioMng ----

// @yo2 0x006210a0 CStudioMng::CStudioMng
CStudioMng::CStudioMng() {
    YO2_ASSERT(s_instance == nullptr, "シングルトン");  // singleton
    s_instance = this;
}

// @yo2 0x00621260 CStudioMng::~CStudioMng
// @yo2 0x00621230 CStudioMng deleting destructor
CStudioMng::~CStudioMng() {
    for (const Entry& e : studios_)
        delete e.studio;
    s_instance = nullptr;
}

// @yo2 0x00620d60 CStudioMng::addStudio: after every studio of the same or lower priority
// @yo2 0x006219a0 uninitialized_copy<Entry*>
// @yo2 0x006219f0 uninitialized_fill_n<Entry*>
// @yo2 0x00621a30 construct<Entry>
CStudio* CStudioMng::addStudio(uint32_t priority) {
    auto* s = new CStudio;
    studios_.push_back({s, priority});
    Entry* last = studios_.end() - 1;
    Entry* at = std::find_if(studios_.begin(), last, [&](const Entry& e) { return e.priority > priority; });
    std::rotate(at, last, studios_.end());
    return s;
}

// @yo2 0x00621010 CStudioMng::removeStudio
void CStudioMng::removeStudio(CStudio* s) {
    for (Entry* e = studios_.begin(); e != studios_.end(); ++e) {
        if (e->studio == s) {
            delete s;
            studios_.erase(e);
            return;
        }
    }
}

// @yo2 0x00621300 CStudioMng::Render: every studio, then Present; a lost device skips the frame or is reset
void CStudioMng::render() {
    IDirect3DDevice8* dev = device();
    HRESULT hr = dev->TestCooperativeLevel();
    if (hr == D3D_OK) {
        for (const Entry& e : studios_)
            e.studio->render();
        dev->Present(nullptr, nullptr, nullptr, nullptr);
        for (CZSort& q : g_app->zsort().layer)
            q.clear();
    } else if (hr == kDeviceLost) {
        for (const Entry& e : studios_)
            e.studio->dropFrame();
    } else if (hr == kDeviceNotReset) {
        g_texMgr->onDeviceLost();
        for (const Entry& e : studios_)
            e.studio->releaseSurfaces();
        hr = g_d3d->reset();
        if (hr == kDriverInternalError) {
            YO2_ASSERT(false, "デバイス内部エラーが起きました。");  // internal device error
        } else if (hr == D3DERR_INVALIDCALL) {
            // the device didn't come back: something still holds a default-pool resource
            YO2_ASSERT(false, "デバイスの復旧に失敗。リソースの解放漏れがありそうです。");
        } else if (hr == D3DERR_OUTOFVIDEOMEMORY) {
            YO2_ASSERT(false, "デバイスの復旧に必要なビデオメモリが足りません。");  // not enough video memory
        } else if (hr == kOutOfMemory) {
            YO2_ASSERT(false, "デバイスの復旧に必要なメモリが足りません");  // not enough memory
        } else {
            for (const Entry& e : studios_)
                e.studio->restore();
            g_texMgr->onDeviceReset();
            g_d3d->setMode(0);
        }
    } else {
        YO2_ASSERT(false, "Device Error");
    }
}
