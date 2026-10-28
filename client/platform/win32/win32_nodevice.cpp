// The "no such device" parts of the Win32 shim (DESIGN.md §7): DirectDraw, MCI (CD audio), the common file
// dialogs and a few user32 window calls. Each fails or answers the way a PC without that hardware or OS feature
// does, so yaneSDK takes its own fallback path. DirectShow needs nothing here: CoCreateInstance in win32.cpp
// already fails for every class it does not implement, CLSID_DirectDraw and CLSID_AMMultiMediaStream included.
#include "windows.h"
#include "mmsystem.h"
#include "ddraw.h"
#include "commdlg.h"

// ---------------------------------------------------------------- DirectDraw: not installed
const GUID CLSID_DirectDraw = {0xD7B70EE0, 0x4340, 0x11CF, {0xB0, 0x63, 0x00, 0x20, 0xAF, 0xC2, 0xCD, 0x35}};
const GUID IID_IDirectDraw = {0x6C14DB80, 0xA733, 0x11CE, {0xA5, 0x21, 0x00, 0x20, 0xAF, 0x0B, 0xE5, 0x60}};
const GUID IID_IDirectDraw2 = {0xB3A6F3E0, 0x2B43, 0x11CF, {0xA2, 0xDE, 0x00, 0xAA, 0x00, 0xB9, 0x33, 0x56}};
const GUID IID_IDirectDrawSurface = {0x6C14DB81, 0xA733, 0x11CE, {0xA5, 0x21, 0x00, 0x20, 0xAF, 0x0B, 0xE5, 0x60}};

HRESULT DirectDrawCreate(GUID*, LPDIRECTDRAW* out, IUnknown*) {
    if (out) *out = nullptr;
    return DDERR_NODIRECTDRAWHW;
}
HRESULT DirectDrawCreateEx(GUID*, LPVOID* out, REFIID, IUnknown*) {
    if (out) *out = nullptr;
    return DDERR_NODIRECTDRAWHW;
}
HRESULT DirectDrawCreateClipper(DWORD, LPDIRECTDRAWCLIPPER* out, IUnknown*) {
    if (out) *out = nullptr;
    return DDERR_NODIRECTDRAWHW;
}
HRESULT DirectDrawEnumerateA(LPDDENUMCALLBACKA, LPVOID) { return DD_OK; }

// ---------------------------------------------------------------- MCI: no CD drive (no MCI devices at all)
MCIERROR mciSendCommandA(MCIDEVICEID, UINT, DWORD_PTR, DWORD_PTR) { return MCIERR_DEVICE_NOT_INSTALLED; }
BOOL mciGetErrorStringA(MCIERROR, LPSTR buf, UINT size) {
    if (!buf || !size) return FALSE;
    lstrcpynA(buf, "The specified device is not installed.", (int)size);
    return TRUE;
}

// ---------------------------------------------------------------- common dialogs: the user cancelled
BOOL GetOpenFileNameA(LPOPENFILENAMEA) { return FALSE; }
BOOL GetSaveFileNameA(LPOPENFILENAMEA) { return FALSE; }
DWORD CommDlgExtendedError() { return 0; }

// ---------------------------------------------------------------- user32 extras
HWND GetWindow(HWND w, UINT cmd) {
    if (!IsWindow(w)) return nullptr;
    // The game window is alone at the top level, owns nothing and has no tracked children
    return cmd == GW_HWNDFIRST || cmd == GW_HWNDLAST ? w : nullptr;
}
HWND GetTopWindow(HWND parent) { return parent ? nullptr : GetForegroundWindow(); }
int SetWindowRgn(HWND, HRGN, BOOL) { return 1; }
