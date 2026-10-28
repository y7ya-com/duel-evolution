// src/caution adapters: the small inline members emitted in cautionEntry.obj.
#include "../yo2hook.h"
#include "caution/HttpDownload.h"
#include "caution/loginWindowInline.h"

YO2_HOOK const char* __thiscall yo2_7fd780(const CHttpDownload* h) { return h->data(); }
YO2_HOOK bool __thiscall yo2_7fdd30(CWindowLoginView* w) { return w->onMain(); }
YO2_HOOK void __thiscall yo2_7fdd50(CWindowLoginView* w, int32_t mode) { w->setButtonMode(mode); }
YO2_HOOK void __thiscall yo2_7fdd80(CWindowLoginView* w) { w->resetDepth(); }
