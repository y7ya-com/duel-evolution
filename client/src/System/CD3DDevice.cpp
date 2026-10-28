#include "CD3DDevice.h"

#include "yo2Debug.h"
#include "yo2StringDB.h"

CD3DDevice* g_d3d;

namespace {

// One render state or stage-0 texture stage state. For render states `tag` 1 means "listed, but setMode doesn't
// apply it" (TEXTUREFACTOR, which elements set themselves); for texture stage states it is the stage.
struct StateEntry {
    uint8_t tag;
    uint32_t state;
    uint32_t value;
};
struct StateLists {
    std::vector<StateEntry> rs, tssA, tssB;
};
struct Mode {
    StateLists base;
    StateLists from[CD3DDevice::MODES];  // what to set when switching here from mode i
};
Mode s_modes[CD3DDevice::MODES];  // DAT_0126d5d0

struct ModeDef {
    std::vector<StateEntry> rs, tssA, tssB;
};
// The exe's static tables (0x00c82850..0x00c82be8), as FUN_00583f30 feeds them in.
const ModeDef kModeDefs[CD3DDevice::MODES] = {
    // 0: opaque, depth test+write, alpha test, (MULTIPLYADD) colour op, linear clamp
    {{{0, D3DRS_ZFUNC, D3DCMP_LESSEQUAL}, {0, D3DRS_ZWRITEENABLE, 1}, {0, D3DRS_ALPHABLENDENABLE, 0},
      {0, D3DRS_ALPHATESTENABLE, 1}, {0, D3DRS_ALPHAFUNC, D3DCMP_NOTEQUAL}, {0, D3DRS_SRCBLEND, D3DBLEND_SRCALPHA},
      {0, D3DRS_DESTBLEND, D3DBLEND_INVSRCALPHA}, {0, D3DRS_COLORWRITEENABLE, 15},
      {0, D3DRS_TEXTUREFACTOR, 0xffffffff}, {0, D3DRS_CULLMODE, D3DCULL_NONE}},
     {{0, D3DTSS_COLOROP, D3DTOP_MULTIPLYADD}, {0, D3DTSS_COLORARG1, D3DTA_TEXTURE},
      {0, D3DTSS_COLORARG2, D3DTA_DIFFUSE}, {0, D3DTSS_COLORARG0, D3DTA_TFACTOR},
      {0, D3DTSS_ALPHAOP, D3DTOP_MODULATE}, {0, D3DTSS_ALPHAARG1, D3DTA_TEXTURE},
      {0, D3DTSS_ALPHAARG2, D3DTA_DIFFUSE}, {0, D3DTSS_ALPHAARG0, D3DTA_TFACTOR}},
     {{0, D3DTSS_MAGFILTER, D3DTEXF_LINEAR}, {0, D3DTSS_MINFILTER, D3DTEXF_LINEAR},
      {0, D3DTSS_ADDRESSU, D3DTADDRESS_CLAMP}, {0, D3DTSS_ADDRESSV, D3DTADDRESS_CLAMP}}},
    {{{0, D3DRS_ALPHATESTENABLE, 0}, {1, D3DRS_TEXTUREFACTOR, 0xffffffff}}, {}, {}},
    {{{0, D3DRS_ALPHATESTENABLE, 0}, {1, D3DRS_TEXTUREFACTOR, 0xffffffff}},
     {},
     {{0, D3DTSS_MAGFILTER, D3DTEXF_POINT}, {0, D3DTSS_MINFILTER, D3DTEXF_POINT}}},
    {{{1, D3DRS_TEXTUREFACTOR, 0xffffffff}}, {}, {}},
    {{{0, D3DRS_ALPHABLENDENABLE, 1}, {0, D3DRS_ALPHAFUNC, D3DCMP_NOTEQUAL}, {1, D3DRS_TEXTUREFACTOR, 0xffffffff}},
     {},
     {}},
    {{{0, D3DRS_ALPHABLENDENABLE, 1}, {0, D3DRS_ALPHAFUNC, D3DCMP_NOTEQUAL}, {1, D3DRS_TEXTUREFACTOR, 0xffffffff}},
     {},
     {{0, D3DTSS_MAGFILTER, D3DTEXF_POINT}, {0, D3DTSS_MINFILTER, D3DTEXF_POINT}}},
    {{{0, D3DRS_ALPHABLENDENABLE, 1}, {0, D3DRS_ALPHAFUNC, D3DCMP_NOTEQUAL}, {0, D3DRS_DESTBLEND, D3DBLEND_ONE},
      {1, D3DRS_TEXTUREFACTOR, 0xffffffff}},
     {},
     {}},
    {{{0, D3DRS_ALPHABLENDENABLE, 1}, {0, D3DRS_ALPHAFUNC, D3DCMP_NOTEQUAL}, {0, D3DRS_DESTBLEND, D3DBLEND_ONE},
      {1, D3DRS_TEXTUREFACTOR, 0xffffffff}},
     {},
     {{0, D3DTSS_MAGFILTER, D3DTEXF_POINT}, {0, D3DTSS_MINFILTER, D3DTEXF_POINT}}},
    {{{0, D3DRS_ALPHABLENDENABLE, 1}, {0, D3DRS_ALPHAFUNC, D3DCMP_NOTEQUAL}, {1, D3DRS_TEXTUREFACTOR, 0xffffffff},
      {0, D3DRS_CULLMODE, D3DCULL_NONE}},
     {},
     {{0, D3DTSS_MAGFILTER, D3DTEXF_POINT}, {0, D3DTSS_MINFILTER, D3DTEXF_POINT}}},
    {{{0, D3DRS_ALPHABLENDENABLE, 1}, {0, D3DRS_ALPHAFUNC, D3DCMP_NOTEQUAL}, {1, D3DRS_TEXTUREFACTOR, 0xffffffff},
      {0, D3DRS_CULLMODE, D3DCULL_NONE}},
     {},
     {{0, D3DTSS_MAGFILTER, D3DTEXF_LINEAR}, {0, D3DTSS_MINFILTER, D3DTEXF_LINEAR}}},
    // 10, 11: texture colour as is (SELECTARG1 of TEXTURE)
    {{{0, D3DRS_TEXTUREFACTOR, 0xffffffff}},
     {{0, D3DTSS_COLOROP, D3DTOP_SELECTARG1}, {0, D3DTSS_COLORARG1, D3DTA_TEXTURE},
      {0, D3DTSS_ALPHAOP, D3DTOP_SELECTARG1}, {0, D3DTSS_ALPHAARG1, D3DTA_TEXTURE}},
     {{0, D3DTSS_MAGFILTER, D3DTEXF_POINT}, {0, D3DTSS_MINFILTER, D3DTEXF_POINT}}},
    {{{0, D3DRS_ALPHABLENDENABLE, 1}, {0, D3DRS_ALPHAFUNC, D3DCMP_NOTEQUAL}, {0, D3DRS_TEXTUREFACTOR, 0xffffffff}},
     {{0, D3DTSS_COLOROP, D3DTOP_SELECTARG1}, {0, D3DTSS_COLORARG1, D3DTA_TEXTURE},
      {0, D3DTSS_ALPHAOP, D3DTOP_SELECTARG1}, {0, D3DTSS_ALPHAARG1, D3DTA_TEXTURE}},
     {{0, D3DTSS_MAGFILTER, D3DTEXF_POINT}, {0, D3DTSS_MINFILTER, D3DTEXF_POINT}}},
};

const StateEntry* findState(const std::vector<StateEntry>& l, const StateEntry& e, bool matchTag) {
    for (const StateEntry& x : l)
        if (x.state == e.state && (!matchTag || x.tag == e.tag))
            return &x;
    return nullptr;
}

// The `to` mode's own states, then mode-0 defaults for whatever `from` set and `to` doesn't.
void delta(const std::vector<StateEntry>& to, const std::vector<StateEntry>& from,
           const std::vector<StateEntry>& defaults, bool matchTag, std::vector<StateEntry>& out) {
    out = to;
    for (const StateEntry& e : from)
        if (!findState(to, e, matchTag))
            if (const StateEntry* d = findState(defaults, e, matchTag))
                out.push_back(*d);
}

}  // namespace

// @yo2 0x00583f30 static init: the 12 render-mode tables
// @yo2 0x005840e0 render mode constructor (copies its three lists)
// @yo2 0x00584ea0 build the per-pair mode deltas (MODULATE where MULTIPLYADD isn't supported)
// @yo2 0x00584670 one mode delta
// @yo2 0x005844a0 state-list triple constructor
// @yo2 0x005844f0 state-list triple destructor
// @yo2 0x005845b0 render mode destructor
// @yo2 0x00585ed0 vector<StateEntry>::push_back
// @yo2 0x005861a0 vector<StateEntry>::push_back
// @yo2 0x00586a00 vector<StateEntry>::insert(it, n, x)
// @yo2 0x00586e00 vector<StateEntry>::insert(it, n, x)
// @yo2 0x00587200 vector<StateEntry>::insert(it, n, x)
// @yo2 0x00587b50 vector<StateEntry>::size
// @yo2 0x00587c40 vector<StateEntry>::size
// @yo2 0x00587d30 vector<StateEntry>::size
// @yo2 0x00587b80 uninitialized_copy<StateEntry*>
// @yo2 0x00587c70 uninitialized_copy<StateEntry*>
// @yo2 0x00587d60 uninitialized_copy<StateEntry*>
// @yo2 0x00587bf0 uninitialized_fill_n<StateEntry*>
// @yo2 0x00587ce0 uninitialized_fill_n<StateEntry*>
// @yo2 0x00587dd0 uninitialized_fill_n<StateEntry*>
// @yo2 0x00587f00 construct<StateEntry>
// @yo2 0x00587f30 construct<StateEntry>
// @yo2 0x00586180 destroy<StateEntry*>
// @yo2 0x00586450 destroy<StateEntry*>
// @yo2 0x00586470 destroy<StateEntry*>
// @yo2 0x00585d10 vector<StateEntry>::~vector
// @yo2 0x00585d50 vector<StateEntry>::~vector
// @yo2 0x00585d90 vector<StateEntry>::~vector
void CD3DDevice::buildModeTables(bool multiplyAdd) {
    for (int m = 0; m < MODES; ++m) {
        s_modes[m].base = {kModeDefs[m].rs, kModeDefs[m].tssA, kModeDefs[m].tssB};
        if (m == 0 && !multiplyAdd)
            for (StateEntry& e : s_modes[0].base.tssA)
                if (e.state == D3DTSS_COLOROP && e.value == D3DTOP_MULTIPLYADD)
                    e.value = D3DTOP_MODULATE;
    }
    const StateLists& d = s_modes[0].base;
    for (Mode& to : s_modes)
        for (int f = 0; f < MODES; ++f) {
            const StateLists& from = s_modes[f].base;
            delta(to.base.rs, from.rs, d.rs, false, to.from[f].rs);
            delta(to.base.tssA, from.tssA, d.tssA, true, to.from[f].tssA);
            delta(to.base.tssB, from.tssB, d.tssB, true, to.from[f].tssB);
        }
}

// @yo2 0x00585030 CD3DDevice::CD3DDevice
CD3DDevice::CD3DDevice() : d3dxMutex_(new std::mutex) {}

// @yo2 0x005851e0 CD3DDevice::~CD3DDevice
// @yo2 0x005851b0 CD3DDevice deleting destructor
CD3DDevice::~CD3DDevice() { delete d3dxMutex_; }

// @yo2 0x00585200 CD3DDevice::Release: the device, Direct3D, then the wrapper itself
void CD3DDevice::release() {
    if (!g_d3d)
        return;
    if (g_d3d->dev_) {
        g_d3d->dev_->Release();
        g_d3d->dev_ = nullptr;
    }
    if (g_d3d->d3d_) {
        g_d3d->d3d_->Release();
        g_d3d->d3d_ = nullptr;
    }
    delete g_d3d;
    g_d3d = nullptr;
}

// @yo2 0x00585270 CD3DDevice::Initialize
bool CD3DDevice::initialize(HWND window, UINT width, UINT height, bool fullscreen) {
    if (initialized_) {
        yo2Trace("CD3DDevice::Initialize: already initialised\n");  // a MessageBox in the exe
        return false;
    }
    d3d_ = Direct3DCreate8(220);
    if (!d3d_)
        return false;
    d3d_->GetDeviceCaps(0, D3DDEVTYPE_HAL, &caps_);
    multiplyAdd_ = (caps_.TextureOpCaps & D3DTEXOPCAPS_MULTIPLYADD) != 0;
    D3DDISPLAYMODE desktop;
    if (d3d_->GetAdapterDisplayMode(0, &desktop) < 0)
        return false;
    width_ = width;
    height_ = height;
    pp_ = {};
    pp_.BackBufferCount = 1;
    pp_.EnableAutoDepthStencil = 1;
    pp_.AutoDepthStencilFormat = D3DFMT_D16;
    pp_.hDeviceWindow = window;
    pp_.Flags = 0;
    pp_.BackBufferWidth = width;
    pp_.BackBufferHeight = height;
    pp_.SwapEffect = decltype(pp_.SwapEffect)(1);  // D3DSWAPEFFECT_DISCARD (an enum in the real header, an int in the stand-in)
    pp_.FullScreen_PresentationInterval = 0;
    UINT n = d3d_->GetAdapterModeCount(0);
    for (UINT i = 0; i < n; ++i) {
        D3DDISPLAYMODE m;
        d3d_->EnumAdapterModes(0, i, &m);
        if (m.Width != width || m.Height != height)
            continue;
        if (fullscreen && m.RefreshRate == 60) {
            pp_.Windowed = 0;
            pp_.BackBufferFormat = D3DFMT_X8R8G8B8;
            pp_.FullScreen_RefreshRateInHz = 60;
            fullscreen_ = true;
        } else {
            pp_.Windowed = 1;
            pp_.BackBufferFormat = D3DFMT_X8R8G8B8;
            pp_.FullScreen_RefreshRateInHz = 0;
            fullscreen_ = false;
        }
        static const struct {
            D3DDEVTYPE type;
            DWORD flags;
        } tries[] = {{D3DDEVTYPE_HAL, D3DCREATE_HARDWARE_VERTEXPROCESSING | D3DCREATE_MULTITHREADED},
                     {D3DDEVTYPE_HAL, D3DCREATE_SOFTWARE_VERTEXPROCESSING | D3DCREATE_MULTITHREADED},
                     {D3DDEVTYPE_HAL, D3DCREATE_MIXED_VERTEXPROCESSING | D3DCREATE_MULTITHREADED},
                     {D3DDEVTYPE_REF, D3DCREATE_MIXED_VERTEXPROCESSING | D3DCREATE_MULTITHREADED}};
        HRESULT hr = D3D_OK;
        for (const auto& t : tries) {
            hr = d3d_->CreateDevice(0, t.type, window, t.flags, &pp_, &dev_);
            if (hr >= 0) {
                buildModeTables(multiplyAdd_);
                initialized_ = true;
                return true;
            }
        }
        YO2_ASSERT(hr != D3DERR_OUTOFVIDEOMEMORY, "D3DERR_OUTOFVIDEOMEMORY");
        break;
    }
    // "Direct3D could not be initialised" box: title text 0x139f, body text 0x3f1
    yo2Trace("%s: %s\n", g_stringDB->get(0x139f).c_str(), g_stringDB->get(0x3f1).c_str());
    return false;
}

// @yo2 0x00585850 CD3DDevice::setFullscreen: Reset() with the new presentation parameters
bool CD3DDevice::setFullscreen(bool fullscreen) {
    if (fullscreen == fullscreen_)
        return false;
    pp_.Windowed = fullscreen ? 0 : 1;
    pp_.BackBufferFormat = D3DFMT_X8R8G8B8;
    pp_.BackBufferWidth = width_;
    pp_.BackBufferHeight = height_;
    pp_.FullScreen_RefreshRateInHz = 60;
    pp_.FullScreen_PresentationInterval = 0;
    HRESULT hr = dev_->Reset(&pp_);
    fullscreen_ = fullscreen;
    return hr >= 0;
}

// @yo2 0x00585930 CD3DDevice::setMode: apply the delta from the current render mode
void CD3DDevice::setMode(int32_t mode) {
    if (mode == mode_)
        return;
    const StateLists& d = s_modes[mode].from[mode_];
    for (const StateEntry& e : d.rs)
        if (e.tag == 0)
            dev_->SetRenderState(static_cast<D3DRENDERSTATETYPE>(e.state), e.value);
    for (const StateEntry& e : d.tssA)
        dev_->SetTextureStageState(e.tag, static_cast<D3DTEXTURESTAGESTATETYPE>(e.state), e.value);
    for (const StateEntry& e : d.tssB)
        dev_->SetTextureStageState(e.tag, static_cast<D3DTEXTURESTAGESTATETYPE>(e.state), e.value);
    mode_ = mode;
}

// @yo2 0x00585a20 CD3DDevice::setRenderState: skip the call when the value is already set
HRESULT CD3DDevice::setRenderState(D3DRENDERSTATETYPE state, DWORD value) {
    DWORD cur;
    dev_->GetRenderState(state, &cur);
    if (cur == value)
        return D3D_OK;
    return dev_->SetRenderState(state, value);
}
