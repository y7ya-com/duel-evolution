// user32 extras for yaneRegionHook & co. (implemented in win32_nodevice.cpp). Included at the end of windows.h.
#pragma once

#ifndef WM_ENTERMENULOOP
#define WM_ENTERMENULOOP 0x0211
#endif
#ifndef WM_EXITMENULOOP
#define WM_EXITMENULOOP 0x0212
#endif
#ifndef WM_CAPTURECHANGED
#define WM_CAPTURECHANGED 0x0215
#endif
#ifndef WM_QUERYNEWPALETTE
#define WM_QUERYNEWPALETTE 0x030F
#endif
#ifndef WM_PALETTEISCHANGING
#define WM_PALETTEISCHANGING 0x0310
#endif
#ifndef WM_PALETTECHANGED
#define WM_PALETTECHANGED 0x0311
#endif

// Window walking. The game window is the only top-level window and owns none (no message boxes or tool
// windows here), so CFastDraw::GetAllWindowRect finds nothing over it.
#define GW_HWNDFIRST 0
#define GW_HWNDLAST 1
#define GW_HWNDNEXT 2
#define GW_HWNDPREV 3
#define GW_OWNER 4
#define GW_CHILD 5
HWND GetWindow(HWND w, UINT cmd);
HWND GetTopWindow(HWND parent);   // NULL parent: the game window
#define GetNextWindow(w, cmd) GetWindow(w, cmd)

// Window shape: accepted and ignored (the platform window stays rectangular). Returns nonzero, as on success.
// yaneSDK's CRegionHook keeps and deletes its own region, so nothing leaks here.
int SetWindowRgn(HWND w, HRGN rgn, BOOL redraw);
#ifndef RGN_AND
#define RGN_AND 1
#define RGN_OR 2
#define RGN_XOR 3
#define RGN_DIFF 4
#define RGN_COPY 5
#endif
