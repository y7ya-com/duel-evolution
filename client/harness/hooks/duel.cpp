// src/duel rewrites under the original ABI (the duel session's file). The engine functions are cdecl free functions
// on the exe's own engine block (g_eng is 0x012c7880 in this build, see src/duel/Engine.h).
#include "../yo2hook.h"
#include "duel/EngineInternal.h"

// card database (CardDB.cpp)
YO2_HOOK int __cdecl yo2_73b600(int id) { return cardNormalize(id); }
YO2_HOOK int __cdecl yo2_73bbe0(int id) { return cardPropIndex(id); }
YO2_HOOK int __cdecl yo2_73bc50(int index) { return cardPropId(index); }
YO2_HOOK const uint32_t* __cdecl yo2_73bf50(int id) { return cardProp(id); }
YO2_HOOK int __cdecl yo2_73bf20(int id) { return cardRace(id); }
YO2_HOOK int __cdecl yo2_73bf80(int id) { return cardAttr(id); }
YO2_HOOK int __cdecl yo2_73bfb0(int id) { return cardLevel(id); }
YO2_HOOK int __cdecl yo2_73bfe0(int id) { return cardIcon(id); }
YO2_HOOK int __cdecl yo2_73c010(int id) { return cardKind(id); }
YO2_HOOK int __cdecl yo2_73c040(int id) { return cardAtk(id); }
YO2_HOOK int __cdecl yo2_73c080(int id) { return cardDef(id); }
YO2_HOOK int __cdecl yo2_73c0c0(int id) { return cardAtkRaw(id); }
YO2_HOOK int __cdecl yo2_73c100(int id) { return cardDefRaw(id); }
YO2_HOOK int __cdecl yo2_73c140(int id, int bit) { return cardBit(id, bit); }

// text (DuelText.cpp)
YO2_HOOK void __cdecl yo2_745e50(char* d, const char* s) { textCopy(d, s); }
YO2_HOOK void __cdecl yo2_745ea0(char* d, const char* s) { textAppend(d, s); }
YO2_HOOK void __cdecl yo2_745f10(char* d, const char* f, const char* a) { textFormatS(d, f, a); }
YO2_HOOK void __cdecl yo2_746130(char* d, const char* f, int n) { textFormatD(d, f, n); }
YO2_HOOK void __cdecl yo2_7461b0(char* d, int n) { textAppendInt(d, n); }
YO2_HOOK void __cdecl yo2_746230(char* d, const char* s) { textStripColor(d, s); }

// engine: serials, piles, hand (EngineBoard.cpp, EngineQuery2.cpp)
YO2_HOOK uint32_t __cdecl yo2_6eaf00(uint32_t j) { return engNextSerial(j); }
YO2_HOOK int __cdecl yo2_6f7ad0(uint32_t j, uint32_t i) { return engGraveRemoveAt(j, i); }
YO2_HOOK int __cdecl yo2_6f7b70(uint32_t j, const uint32_t* w) { return engGraveRemove(j, w); }
YO2_HOOK void __cdecl yo2_6f7c10(uint32_t j, uint32_t uid) { engGraveToTop(j, uid); }
YO2_HOOK void __cdecl yo2_6f7d20(uint32_t j, uint32_t uid) { engBanishToTop(j, uid); }
YO2_HOOK int __cdecl yo2_6f82d0(uint32_t j, uint32_t i) { return engBanishRemoveAt(j, i); }
YO2_HOOK int __cdecl yo2_6f83b0(uint32_t j, const uint32_t* w) { return engBanishRemove(j, w); }
YO2_HOOK int __cdecl yo2_6f9750(uint32_t j, const uint32_t* w) { return engHandRemove(j, w); }
YO2_HOOK int __cdecl yo2_6f8520(uint32_t j) { return engGraveMonsters(j); }
YO2_HOOK int __cdecl yo2_6f9e90(uint32_t j) { return engHandMonsters(j); }
YO2_HOOK int __cdecl yo2_6f9ad0(uint32_t j, int race) { return engHandCountRace(j, race); }
YO2_HOOK int __cdecl yo2_6f9b70(uint32_t j, int attr) { return engHandCountAttr(j, attr); }
YO2_HOOK int __cdecl yo2_6f8c00(uint32_t j) { return engBanishMonsters(j); }
YO2_HOOK void __cdecl yo2_704f20(uint32_t j) { engDeckForget(j); }
YO2_HOOK uint32_t __cdecl yo2_720850() { return engRand(); }
YO2_HOOK uint32_t __cdecl yo2_720890(int n) { return engRandN(n); }
YO2_HOOK int __cdecl yo2_704100(int card) { return engBoostIcon(card); }
YO2_HOOK void __cdecl yo2_6fa3c0(int card, EngStats* st) { engTokenStats(card, st); }

// engine: effective numbers (EngineStats.cpp)
YO2_HOOK void __cdecl yo2_6fae40(uint32_t j, int s, EngStats* st, uint32_t flags, int minStamp) {
    engStats(j, s, st, flags, minStamp);
}
YO2_HOOK void __cdecl yo2_6fa560(uint32_t j, int s, EngStats* st, uint32_t flags, int unused) {
    engBaseStats(j, s, st, flags, unused);
}
YO2_HOOK int __cdecl yo2_702cc0(uint32_t j, int s, int raw) { return engLevelEx(j, s, raw); }
YO2_HOOK int __cdecl yo2_703400(uint32_t j, int s, uint32_t skip) { return engRaceEx(j, s, skip); }
YO2_HOOK int __cdecl yo2_703990(uint32_t j, int s, uint32_t* stamp) { return engAttrEx(j, s, stamp); }

// ---------------------------------------------------------------- duel scene (src/duel/Scene*.cpp, helper C)
#include "duel/SceneCard.h"
#include "duel/SceneDuelScene.h"

// match bookkeeping (SceneDuelScene.cpp)
YO2_HOOK void __cdecl yo2_794a90(int32_t result) { ds::matchRecordGame(result); }
YO2_HOOK void __cdecl yo2_794bd0(int32_t v) { ds::matchSetEndMode(v); }
YO2_HOOK void __cdecl yo2_794ec0(int32_t j, int32_t v) { ds::duelSideJudge(j, v); }
// CCard (SceneCard.cpp): __thiscall methods, taken as __fastcall (ECX = this, EDX unused)
YO2_HOOK int32_t __fastcall yo2_758540(ds::CCard* c) { return c->step(); }
YO2_HOOK int32_t __fastcall yo2_758210(ds::CCard* c, int, const uint16_t* code) { return c->moveTo(code); }
YO2_HOOK void __fastcall yo2_7583d0(ds::CCard* c) { c->snap(); }
YO2_HOOK void __thiscall yo2_742e30(ds::CCard* c) { c->popCounterBadge(); }
YO2_HOOK void __thiscall yo2_742e50(ds::CCard* c) { c->popLockBadge(); }
YO2_HOOK void __thiscall yo2_742e70(ds::CCard* c, int32_t delta, int32_t kind) { c->popCounter(delta, kind); }

// the duel's deck messages and flags (NetDuel.cpp)
YO2_HOOK void __cdecl yo2_739ff0() { duelDeckSave(); }
YO2_HOOK void __cdecl yo2_73a030() { duelDeckRestore(); }
YO2_HOOK void __cdecl yo2_73a070() { duelRequestReset(); }
YO2_HOOK void __cdecl yo2_73a090(int32_t j) { duelDefaultDeck(j); }
YO2_HOOK void __cdecl yo2_73d340() { duelViewFusingSet(); }
YO2_HOOK void __cdecl yo2_73d360() { duelViewFusingClear(); }
YO2_HOOK int32_t __cdecl yo2_73d380() { return duelViewFusing(); }

// the tag scenes' draw (EngineCmd5.cpp)
YO2_HOOK void __cdecl yo2_734250() { engTagCmdDraw(); }

// CCardPlane (SceneCard.cpp)
YO2_HOOK void __thiscall yo2_763240(ds::CardPlane* p) { ds::cardPlaneDestruct(p); }
YO2_HOOK void __thiscall yo2_7632c0(ds::CardPlane* p, int32_t id) { ds::cardPlaneSetCard(p, id); }
