// The calls one part-A file makes into another, wired to the real code. Each part was written against externs for
// the others (so it builds and tests alone, with its own weak stubs); this file defines those externs by forwarding
// to the implementations, for the full program. The kaban <-> kabanlist pairs are in DeckGlueKaban.cpp (KabanWindow.h
// and KabanWindowList.h can't share a translation unit). No exe code of its own: every target carries its marker.
// Still externs, because their targets are labelled System (not part A): deckFigureCreate 0x00909220,
// cardPicName / miniFile / cardImageName 0x00922010, kabanNumberCreate 0x009553e0, cardLoaderCreate 0x009223f0,
// inputValueCreate 0x00922d20, sortList* 0x009215f0 / 0x00921ba0 / 0x009215d0, deckNumberCreate 0x00934b40.
#include "DeckEntryMain.h"
#include "DeckParts.h"

namespace dk {

// ---- KabanWindowList -> DeckParts
void figureSetValue(CWindowTaskDeckFigure* f, int32_t v) { f->setNumber((uint32_t)v); }               // 0x0090a710
void figureShow(CWindowTaskDeckFigure* f, bool on) { f->show(on); }                                   // 0x0090a980
void figureSetPos(CWindowTaskDeckFigure* f, int32_t x, int32_t y, int32_t z) { f->setPos(x, y, z); }   // 0x0090ab40
void deckBarSetValue(CWindowTaskDeckBar* b, int32_t v) { b->showTitle1(v != 0); }                     // 0x00913c10
CWindowTaskDeckBar* deckBarCreate(void* parent, void* mediator, int32_t v) {                          // 0x0090aca0
    return deckBarNew(parent, mediator, v);
}

// ---- KabanWindowList -> DeckWindow
bool deckRefuses(int32_t id) { return g_deckWindow->full((uint32_t)id); }         // 0x0094edf0
int32_t deckWindowCopies(int32_t id) { return g_deckWindow->copies((uint32_t)id); }   // 0x0094ecc0

// ---- KabanWindow -> KabanWindowList (declared in KabanWindow.h, which this file can't include)
void kabanSetFilter(int32_t mode);
bool kabanBusy();
void kabanSetInputEnabled(bool on);
void kabanSearch(int32_t field, int32_t op, VcVector<int32_t>* values, int32_t lo, int32_t hi, const char* text);

void kabanSetFilter(int32_t mode) { g_kabanList->setCategory(mode); }   // 0x00971240
bool kabanBusy() { return g_modelKaban && g_modelKaban->mode != 0; }     // CWindowModelKaban +0x3b0
void kabanSetInputEnabled(bool on) { kabanPicked(on ? 1 : 0); }         // 0x00977450
void kabanSearch(int32_t field, int32_t op, VcVector<int32_t>* values, int32_t lo, int32_t hi, const char* text) {
    // TODO(Deck A): the search dialog hands over a narrow string; the list compares wide card text
    VcWString wide;
    for (const char* p = text; p && *p; p++) {
        uint16_t c = (uint8_t)*p;
        wide.append(&c, 1);
    }
    g_kabanList->search(field, op, *values, lo, hi, text ? wide.c_str() : nullptr);   // 0x009716e0
}

// ---- DeckEntryMain -> DeckEntry
VcString deckObjName(CDeckObject* d) { return deckFileName(d); }   // 0x008e8cc0

}   // namespace dk
