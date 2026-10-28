// DirectSound for the recompiled exe: guest COM objects in front of platform/audio's mixer (SDL). Locked buffer
// regions are mirrored in guest memory and copied back on Unlock.
#include <mutex>
#include <vector>

#include "comobj.h"
#include "dsound.h"   // platform/win32

namespace {
struct Obj { ComObject* h; uint32_t mirror; };   // mirror: guest copy of a buffer's samples (Lock)
std::vector<Obj> objs;
uint32_t vt_ds, vt_buf;

uint32_t wrap(ComObject* h, uint32_t vt) {
    uint32_t g = rc_palloc(8);
    WR32m(g, vt);
    WR32m(g + 4, (uint32_t)objs.size());
    objs.push_back({h, 0});
    return g;
}
Obj& O(uint32_t g) { return objs[RD32m(g + 4)]; }

// YO2_SOUND_TRACE=1: who creates and finally releases the device, as the code addresses found on the guest stack
// (frame pointers are omitted, so this scans for values inside .text; the first is the caller)
const bool trace = getenv("YO2_SOUND_TRACE");
void trace_stack(CPU* c, const char* what) {
    char buf[160];
    int n = 0, k = 0;
    for (uint32_t a = c->esp; a < c->esp + 0x200 && k < 8; a += 4) {
        uint32_t v = RD32m(a);
        if (v >= 0x401000 && v < 0xbe0000) n += snprintf(buf + n, sizeof buf - n, " %x", v), k++;
    }
    rc_log("dsound: %s, guest stack:%s", what, buf);
}
template <class T> T* H(uint32_t g) { return static_cast<T*>(O(g).h); }
}  // namespace

#define M(name) extern "C" void ds_##name(CPU* c)
#define DS H<IDirectSound>(ARG(0))
#define BUF H<IDirectSoundBuffer>(ARG(0))

M(QueryInterface) { O(ARG(0)).h->AddRef(); WR32m(ARG(2), ARG(0)); RET(3, 0); }
M(AddRef) { RET(1, O(ARG(0)).h->AddRef()); }
M(Release) {
    Obj& o = O(ARG(0));
    uint32_t r = o.h->Release();
    if (!r && trace && RD32m(ARG(0)) == vt_ds) trace_stack(c, "IDirectSound released");
    if (!r) { o.h = nullptr; if (o.mirror) rc_hfree(o.mirror); o.mirror = 0; }
    RET(1, r);
}
M(CreateSoundBuffer) {
    uint32_t d = ARG(1);
    DSBUFFERDESC desc{RD32m(d), RD32m(d + 4), RD32m(d + 8), RD32m(d + 12),
                      RD32m(d + 16) ? (WAVEFORMATEX*)G(RD32m(d + 16)) : nullptr};
    IDirectSoundBuffer* b = nullptr;
    HRESULT hr = DS->CreateSoundBuffer(&desc, &b, nullptr);
    WR32m(ARG(2), hr ? 0 : wrap(b, vt_buf));
    RET(4, hr);
}
M(DuplicateSoundBuffer) {
    IDirectSoundBuffer* b = nullptr;
    HRESULT hr = DS->DuplicateSoundBuffer(H<IDirectSoundBuffer>(ARG(1)), &b);
    WR32m(ARG(2), hr ? 0 : wrap(b, vt_buf));
    RET(3, hr);
}
M(SetCooperativeLevel) { RET(3, 0); }
M(Initialize) { RET(2, DS->Initialize(nullptr)); }
M(GetCaps) { uint32_t p = ARG(1), n = RD32m(p); memset(G(p + 4), 0, n > 4 ? n - 4 : 0); RET(2, 0); }
M(Compact) { RET(1, 0); }
M(GetSpeakerConfig) { WR32m(ARG(1), 4); RET(2, 0); }   // DSSPEAKER_STEREO
M(SetSpeakerConfig) { RET(2, 0); }

M(GetCurrentPosition) {
    DWORD p = 0, w = 0;
    HRESULT hr = BUF->GetCurrentPosition(&p, &w);
    if (ARG(1)) WR32m(ARG(1), p);
    if (ARG(2)) WR32m(ARG(2), w);
    RET(3, hr);
}
M(GetFormat) {
    DWORD n = 0;
    HRESULT hr = BUF->GetFormat(ARG(1) ? (WAVEFORMATEX*)G(ARG(1)) : nullptr, ARG(2), &n);
    if (ARG(3)) WR32m(ARG(3), n);
    RET(4, hr);
}
M(GetVolume) { LONG v = 0; HRESULT hr = BUF->GetVolume(&v); WR32m(ARG(1), (uint32_t)v); RET(2, hr); }
M(GetPan) { LONG v = 0; HRESULT hr = BUF->GetPan(&v); WR32m(ARG(1), (uint32_t)v); RET(2, hr); }
M(GetFrequency) { DWORD v = 0; HRESULT hr = BUF->GetFrequency(&v); WR32m(ARG(1), v); RET(2, hr); }
M(GetStatus) { DWORD v = 0; HRESULT hr = BUF->GetStatus(&v); WR32m(ARG(1), v); RET(2, hr); }
M(BufInitialize) { RET(3, 0); }
M(Lock) {
    IDirectSoundBuffer* b = BUF;
    Obj& o = O(ARG(0));
    void *p1 = nullptr, *p2 = nullptr;
    DWORD n1 = 0, n2 = 0;
    HRESULT hr = b->Lock(ARG(1), ARG(2), &p1, &n1, ARG(5) ? &p2 : nullptr, ARG(5) ? &n2 : nullptr, ARG(7));
    if (hr) RET(8, hr);
    if (!o.mirror) o.mirror = rc_halloc((uint32_t)b->data.size(), 1);
    uint8_t* base = b->data.data();
    {
        std::lock_guard<std::recursive_mutex> g(b->ds->lock);
        memcpy(G(o.mirror), base, b->data.size());
    }
    WR32m(ARG(3), o.mirror + (uint32_t)((uint8_t*)p1 - base));
    WR32m(ARG(4), n1);
    if (ARG(5)) WR32m(ARG(5), p2 ? o.mirror + (uint32_t)((uint8_t*)p2 - base) : 0);
    if (ARG(6)) WR32m(ARG(6), n2);
    RET(8, 0);
}
M(Unlock) {
    IDirectSoundBuffer* b = BUF;
    Obj& o = O(ARG(0));
    std::lock_guard<std::recursive_mutex> g(b->ds->lock);
    for (int k = 0; k < 2; k++) {
        uint32_t p = ARG(1 + 2 * k), n = ARG(2 + 2 * k);
        if (p && n && o.mirror && p >= o.mirror && p - o.mirror + n <= b->data.size())
            memcpy(b->data.data() + (p - o.mirror), G(p), n);
    }
    RET(5, 0);
}
M(Play) { RET(4, BUF->Play(ARG(1), ARG(2), ARG(3))); }
M(SetCurrentPosition) { RET(2, BUF->SetCurrentPosition(ARG(1))); }
M(SetFormat) { RET(2, BUF->SetFormat((const WAVEFORMATEX*)G(ARG(1)))); }
M(SetVolume) { RET(2, BUF->SetVolume((LONG)ARG(1))); }
M(SetPan) { RET(2, BUF->SetPan((LONG)ARG(1))); }
M(SetFrequency) { RET(2, BUF->SetFrequency(ARG(1))); }
M(Stop) { RET(1, BUF->Stop()); }
M(Restore) { RET(1, 0); }
M(BufGetCaps) {
    uint32_t p = ARG(1), n = RD32m(p);
    memset(G(p + 4), 0, n > 4 ? n - 4 : 0);
    WR32m(p + 8, (uint32_t)BUF->data.size());
    RET(2, 0);
}

extern "C" uint32_t rc_dsound_create(CPU* c, const uint8_t* clsid, const uint8_t*, uint32_t out) {
    uint32_t d1;
    memcpy(&d1, clsid, 4);
    if (d1 != 0x47D4D946) return 0x80040154u;   // only CLSID_DirectSound
    if (!vt_ds) {
        vt_ds = rc_vtable({S(ds_QueryInterface), S(ds_AddRef), S(ds_Release), S(ds_CreateSoundBuffer), S(ds_GetCaps),
                           S(ds_DuplicateSoundBuffer), S(ds_SetCooperativeLevel), S(ds_Compact),
                           S(ds_GetSpeakerConfig), S(ds_SetSpeakerConfig), S(ds_Initialize)});
        vt_buf = rc_vtable({S(ds_QueryInterface), S(ds_AddRef), S(ds_Release), S(ds_BufGetCaps),
                            S(ds_GetCurrentPosition), S(ds_GetFormat), S(ds_GetVolume), S(ds_GetPan),
                            S(ds_GetFrequency), S(ds_GetStatus), S(ds_BufInitialize), S(ds_Lock), S(ds_Play),
                            S(ds_SetCurrentPosition), S(ds_SetFormat), S(ds_SetVolume), S(ds_SetPan),
                            S(ds_SetFrequency), S(ds_Stop), S(ds_Unlock), S(ds_Restore)});
    }
    if (trace) trace_stack(c, "CoCreateInstance(CLSID_DirectSound)");
    IDirectSound* ds = new IDirectSound(44100);   // CoCreateInstance path: the game calls Initialize next
    WR32m(out, wrap(ds, vt_ds));
    (void)c;
    return 0;
}
