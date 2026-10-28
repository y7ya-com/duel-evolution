// The few platform/win32 functions that gdi.cpp / font.cpp / text.cpp call, without linking platform's win32.cpp
// (its window / file layer is replaced by rt/*.c here).
#include "gdi_internal.h"
#undef fopen
#include <cstdio>

static int gStock;   // as platform's win32.cpp: one untracked stock object, SelectObject ignores it
HGDIOBJ GetStockObject(int) { return &gStock; }
FILE* win32_fopen(const char* name, const char* mode) { return fopen(name, mode); }   // font files: host paths
UINT GetACP() { return 932; }
void SetLastError(DWORD) {}
int rc_game_w = 800, rc_game_h = 600;   // set by USER32 when the main window is created
BOOL GetClientRect(HWND, RECT* r) { *r = {0, 0, rc_game_w, rc_game_h}; return TRUE; }
