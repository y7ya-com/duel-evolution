// misc session adapters (src/Deck/DeckManager.cpp, ...).
#include <cstdint>

#include "../yo2hook.h"
#include "Deck/DeckManager.h"

// DeckManager.h's System seams, inside the exe: the card box pointer, and CFile::Write (not reached by the cases).
const uint8_t* appCardBox() { return *reinterpret_cast<const uint8_t* const*>(0x012714b4); }
bool yo2SaveFile(const char*, const void*, uint32_t) { return false; }

using DM = CDeckManager;
#define DM_GET(addr, fn) YO2_HOOK uint32_t __thiscall yo2_##addr(DM* d) { return d->fn(); }
#define DM_PTR(addr, fn) YO2_HOOK uint16_t* __thiscall yo2_##addr(DM* d) { return d->fn(); }
#define DM_ID(addr, fn) YO2_HOOK uint32_t __thiscall yo2_##addr(DM* d, uint16_t id) { return d->fn(id); }
#define DM_SET(addr, fn, T) YO2_HOOK void __thiscall yo2_##addr(DM* d, uint16_t id, T n) { d->fn(id, n); }
#define DM_REMOVE(addr, fn) \
    YO2_HOOK uint32_t __thiscall yo2_##addr(DM* d, uint16_t id, const uint8_t* box) { return d->fn(id, box); }
DM_REMOVE(907970, removeMain)
DM_REMOVE(907a30, removeSide)
DM_REMOVE(907af0, removeExtra)
DM_REMOVE(907bb0, removeMissing)
DM_ID(9075f0, addMissing)
DM_ID(907900, addMissingB)
DM_GET(9065f0, mainSize)
DM_GET(906610, sideSize)
DM_GET(906630, extraSize)
DM_GET(906650, missingSize)
DM_GET(906670, mainSizeB)
DM_GET(906690, sideSizeB)
DM_GET(9066b0, extraSizeB)
DM_GET(9066d0, missingSizeB)
DM_ID(9066f0, copies)
DM_SET(906730, setMainCopies, uint8_t)
DM_ID(906760, mainCopies)
DM_PTR(906790, mainList)
DM_SET(9067b0, addMainCopies, int8_t)
DM_SET(9067f0, subMainCopies, uint8_t)
DM_SET(906840, setSideCopies, uint8_t)
DM_ID(906870, sideCopies)
DM_PTR(9068a0, sideList)
DM_SET(9068c0, addSideCopies, int8_t)
DM_SET(906900, subSideCopies, uint8_t)
DM_SET(906950, setExtraCopies, uint8_t)
DM_ID(906980, extraCopies)
DM_PTR(9069b0, extraList)
DM_SET(9069d0, addExtraCopies, int8_t)
DM_SET(906a10, subExtraCopies, uint8_t)
DM_SET(906a60, setMissingCopies, uint8_t)
DM_ID(906a90, missingCopies)
DM_PTR(906ac0, missingList)
DM_SET(906ae0, addMissingCopies, int8_t)
DM_SET(906b20, subMissingCopies, uint8_t)
DM_PTR(906b70, mainListB)
DM_PTR(906b90, sideListB)
DM_PTR(906bb0, extraListB)
DM_PTR(906bd0, missingListB)
DM_GET(906bf0, clear)
YO2_HOOK void __thiscall yo2_906cc0(DM* d) { d->reset(); }
YO2_HOOK void __thiscall yo2_906d90(DM* d) { d->clearMissing(); }

// CDeckRuleCheck: thiscall on a stack object, `this` unused (the data are statics).
YO2_HOOK void __thiscall yo2_904d70(CDeckRuleCheck* r) { r->clear(); }
YO2_HOOK void __thiscall yo2_904dc0(CDeckRuleCheck* r, uint16_t id) { r->addMain(id); }
YO2_HOOK void __thiscall yo2_904df0(CDeckRuleCheck* r, uint16_t id) { r->addSide(id); }
YO2_HOOK void __thiscall yo2_904e20(CDeckRuleCheck* r, uint16_t id) { r->addExtra(id); }
YO2_HOOK bool __thiscall yo2_904e50(CDeckRuleCheck* r) { return r->valid(); }


// src/ChangeAvatar: the small members defined in yo2ChangeAvatar.h (inline, so nothing else of the folder is linked).
#include "ChangeAvatar/yo2ChangeAvatar.h"
YO2_HOOK bool __thiscall yo2_8a8c80(CWindowDialogAvatarSwitch* w) { return w->CWindowDialogAvatarSwitch::onMain(); }
YO2_HOOK void __thiscall yo2_8b07a0(CWindowDialogAvatarSwitch* w, const CAvatarData* a) { w->setAvatar(*a); }
YO2_HOOK void __thiscall yo2_8b2c20(const CChangeAvatarPack* p, int32_t world, CAvatarData* out) {
    p->avatar(world, out);
}
// `this` (the pack) is not read
YO2_HOOK void __thiscall yo2_8b2af0(CChangeAvatarPack*, CAvatarData* a) { CChangeAvatarPack::randomize(a); }
