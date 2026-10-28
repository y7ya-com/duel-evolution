// src/Result rewrites under the original ABI. Only code with no unported dependencies can be linked into the DLL;
// the window classes are checked by the host tests (tests/ui_result).
#include "../yo2hook.h"
#include "Result/yo2UiStandIns.h"

YO2_HOOK void __thiscall yo2_8c8a00(CD3DTextTextureView* t, int32_t width, int32_t height) { t->setFont(width, height); }
