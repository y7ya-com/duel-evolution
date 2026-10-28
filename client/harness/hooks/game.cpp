// src/Game rewrites under the original ABI (member functions are __thiscall in MSVC 6 and in i686 gcc alike).
#include "../yo2hook.h"
#include "Game/yo2PlayerBin.h"

// CPbinDictionary (yo2PlayerBin.cpp)
YO2_HOOK bool __thiscall yo2_ad5920(const CPbinDictionary* d, uint32_t pbin, PbinInfo* out) { return d->getInfo(pbin, out); }
YO2_HOOK int32_t __thiscall yo2_ad5eb0(const CPbinDictionary* d, uint32_t pbin) { return d->initial(pbin); }
YO2_HOOK int32_t __thiscall yo2_ad6020(const CPbinDictionary* d, uint32_t pbin) { return d->kind(pbin); }
YO2_HOOK int32_t __thiscall yo2_ad6190(const CPbinDictionary* d, uint32_t pbin) { return d->slot(pbin); }
YO2_HOOK int32_t __thiscall yo2_ad6300(const CPbinDictionary* d, uint32_t pbin) { return d->nameText(pbin); }
YO2_HOOK int32_t __thiscall yo2_ad6470(const CPbinDictionary* d, uint32_t pbin) { return d->series(pbin); }
