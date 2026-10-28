// IMM32 for non-Windows. Composition reaches the game as WM_CHAR from the pump (DESIGN.md §1, IME row); the
// context calls succeed and do nothing.
#pragma once
#include "windows.h"

#define ISC_SHOWUICOMPOSITIONWINDOW 0x80000000
#define ISC_SHOWUIALL 0xC000000F
HIMC ImmAssociateContext(HWND w, HIMC c);
HIMC ImmGetContext(HWND w);
BOOL ImmReleaseContext(HWND w, HIMC c);
BOOL ImmSetOpenStatus(HIMC c, BOOL open);
BOOL ImmGetOpenStatus(HIMC c);
