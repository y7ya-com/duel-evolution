// DirectInput (the 1..7 interfaces yaneSDK uses) on platform/sdl: system keyboard and mouse, no joysticks.
// Reached both ways the game tries: CoCreateInstance(CLSID_DirectInput) and LoadLibrary("dinput.dll").
#include "comobj.h"
#include "platform.h"

extern "C" void rc_register_proc(const char* dll, const char* name, RcFn fn);

namespace {
uint32_t vt_di, vt_dev;
enum { KBD = 0, MOUSE = 1 };
// guest object: [vtable][kind][refs]
uint32_t make(uint32_t vt, uint32_t kind) {
    uint32_t o = rc_palloc(12);
    WR32m(o, vt);
    WR32m(o + 4, kind);
    WR32m(o + 8, 1);
    return o;
}
bool guid_is(uint32_t g, uint32_t d1) { return g && RD32m(g) == d1; }
int lastX, lastY;
bool haveLast;
}  // namespace

#define M(name) extern "C" void di_##name(CPU* c)
M(QueryInterface) { WR32m(ARG(2), ARG(0)); WR32m(ARG(0) + 8, RD32m(ARG(0) + 8) + 1); RET(3, 0); }   // every IID: itself
M(AddRef) { uint32_t r = RD32m(ARG(0) + 8) + 1; WR32m(ARG(0) + 8, r); RET(1, r); }
M(Release) { uint32_t r = RD32m(ARG(0) + 8) - 1; WR32m(ARG(0) + 8, r); RET(1, r); }   // ponytail: never freed
M(CreateDevice) {
    uint32_t g = ARG(1);
    uint32_t kind = guid_is(g, 0x6F1D2B61) ? KBD : guid_is(g, 0x6F1D2B60) ? MOUSE : 99;
    if (kind == 99) { rc_log("dinput: CreateDevice for an unknown device %08x", g ? RD32m(g) : 0); RET(4, 0x80040154u); }
    WR32m(ARG(2), make(vt_dev, kind));
    RET(4, 0);
}
M(EnumDevices) { RET(5, 0); }        // no game controllers to report
M(GetDeviceStatus) { RET(2, 1); }    // DI_NOTATTACHED
M(Initialize) { RET(3, 0); }
M(Ok1) { RET(1, 0); }
M(Ok2) { RET(2, 0); }
M(Ok3) { RET(3, 0); }
M(GetDeviceState) {
    rc_trace_input(c, "GetDeviceState", RD32m(ARG(0) + 4));
    uint32_t kind = RD32m(ARG(0) + 4), n = ARG(1), out = ARG(2);
    if (kind == KBD) {
        uint8_t st[256];
        platformKeyboardDik(st);
        memcpy(G(out), st, n < 256 ? n : 256);
    } else {
        int x, y, b;
        platformMouse(&x, &y, &b);
        if (!haveLast) { lastX = x; lastY = y; haveLast = true; }
        int32_t s[4] = {x - lastX, y - lastY, 0, 0};
        lastX = x;
        lastY = y;
        uint8_t* btn = (uint8_t*)&s[3];
        btn[0] = (b & 1) ? 0x80 : 0;    // MK_LBUTTON
        btn[1] = (b & 2) ? 0x80 : 0;    // MK_RBUTTON
        btn[2] = (b & 16) ? 0x80 : 0;   // MK_MBUTTON
        memset(G(out), 0, n);
        memcpy(G(out), s, n < 16 ? n : 16);
    }
    RET(3, 0);
}
M(GetDeviceData) { rc_trace_input(c, "GetDeviceData", RD32m(ARG(0) + 4)); if (ARG(3)) WR32m(ARG(3), 0); RET(5, 0); }   // buffered input: never any (immediate data only)
M(GetCapabilities) {
    uint32_t p = ARG(1);
    uint32_t sz = RD32m(p);
    memset(G(p + 4), 0, sz > 4 ? sz - 4 : 0);
    WR32m(p + 4, 1);   // DIDC_ATTACHED
    RET(2, 0);
}

static void init() {
    if (vt_di) return;
    vt_di = rc_vtable({S(di_QueryInterface), S(di_AddRef), S(di_Release), S(di_CreateDevice), S(di_EnumDevices),
                       S(di_GetDeviceStatus), N("IDirectInput::RunControlPanel"), S(di_Initialize),
                       N("IDirectInput2::FindDevice"), N("IDirectInput7::CreateDeviceEx")});
    vt_dev = rc_vtable({S(di_QueryInterface), S(di_AddRef), S(di_Release), S(di_GetCapabilities),
                        N("IDirectInputDevice::EnumObjects"), N("IDirectInputDevice::GetProperty"),
                        RcSlot{"SetProperty", di_Ok3}, RcSlot{"Acquire", di_Ok1}, RcSlot{"Unacquire", di_Ok1},
                        S(di_GetDeviceState), S(di_GetDeviceData), RcSlot{"SetDataFormat", di_Ok2},
                        RcSlot{"SetEventNotification", di_Ok2}, RcSlot{"SetCooperativeLevel", di_Ok3},
                        N("IDirectInputDevice::GetObjectInfo"), N("IDirectInputDevice::GetDeviceInfo"),
                        N("IDirectInputDevice::RunControlPanel"), N("IDirectInputDevice::Initialize"),
                        N("IDirectInputDevice2::CreateEffect"), N("IDirectInputDevice2::EnumEffects"),
                        N("IDirectInputDevice2::GetEffectInfo"), N("IDirectInputDevice2::GetForceFeedbackState"),
                        N("IDirectInputDevice2::SendForceFeedbackCommand"),
                        N("IDirectInputDevice2::EnumCreatedEffectObjects"), N("IDirectInputDevice2::Escape"),
                        RcSlot{"Poll", di_Ok1}, N("IDirectInputDevice2::SendDeviceData"),
                        N("IDirectInputDevice7::EnumEffectsInFile"), N("IDirectInputDevice7::WriteEffectToFile")});
}

// DirectInputCreateA(hinst, version, out, outer): stdcall
extern "C" void di_DirectInputCreateA(CPU* c) { init(); WR32m(ARG(2), make(vt_di, 0)); RET(4, 0); }

// CoCreateInstance dispatch for every class rt/ provides
extern "C" uint32_t rc_dsound_create(CPU* c, const uint8_t* clsid, const uint8_t* iid, uint32_t out);
static uint32_t com_create(CPU* c, const uint8_t* clsid, const uint8_t* iid, uint32_t out) {
    uint32_t d1;
    memcpy(&d1, clsid, 4);
    if (d1 == 0x25E609E0) {   // CLSID_DirectInput
        init();
        WR32m(out, make(vt_di, 0));
        return 0;
    }
    return rc_dsound_create(c, clsid, iid, out);
}
static struct Reg {
    Reg() {
        rc_com_create = com_create;
        rc_register_proc("dinput.dll", "DirectInputCreateA", di_DirectInputCreateA);
    }
} reg;
