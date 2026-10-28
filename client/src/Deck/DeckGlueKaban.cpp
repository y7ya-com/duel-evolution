// The KabanWindowList -> KabanWindow and KabanWindow -> DeckWindow halves of DeckGlue.cpp (see there).
#include "DeckWindow.h"
#include "KabanWindow.h"

namespace dk {

// ---- declared in KabanWindowList.h (which can't share this translation unit with KabanWindow.h)
void kabanCardSet(CWindowTaskKabanCard* c, int32_t id);
void kabanCardClear(CWindowTaskKabanCard* c);
void kabanNumberSet(CWindowTaskKabanNumber* n, int32_t v);
void kabanNumberEnable(CWindowTaskKabanNumber* n, bool on);
void kabanOrderEnable(CWindowTaskKabanOrder* o, bool on);
void kabanSearchEnable(CWindowTaskKabanSearch* s, bool on);
void kabanSearchReset(CWindowTaskKabanSearch* s);
void kabanCardPlace(CWindowTaskKabanCard* c, float x, float y);
void kabanCardSetDepth(CWindowTaskKabanCard* c, float z);
CWindowTaskKabanOrder* kabanOrderCreate(void* parent, void* mediator);
CWindowTaskKabanSearch* kabanSearchCreate(void* parent, void* mediator);
CWindowTaskKabanCard* kabanCardCreate(void* parent, void* mediator);

void kabanCardSet(CWindowTaskKabanCard* c, int32_t id) { c->setCard((uint32_t)id); }       // 0x009656e0
void kabanCardClear(CWindowTaskKabanCard* c) { c->clearCard(); }                           // 0x00965cf0
void kabanNumberSet(CWindowTaskKabanNumber* n, int32_t v) { n->setCount(v); }              // 0x009563b0
void kabanNumberEnable(CWindowTaskKabanNumber* n, bool on) { n->setEnabled(on); }          // 0x009568d0
void kabanOrderEnable(CWindowTaskKabanOrder* o, bool on) { o->setEnabled(on); }            // 0x00958c30
void kabanSearchEnable(CWindowTaskKabanSearch* s, bool on) { s->setEnabled(on); }          // 0x009616a0
void kabanSearchReset(CWindowTaskKabanSearch* s) { s->closeDialogs(); }                    // 0x00961880
// the exe writes the dragged card's position (+0x374/+0x378) and z (+0x384), then calls its vf13 (layout)
void kabanCardPlace(CWindowTaskKabanCard* c, float x, float y) {
    c->x = x, c->y = y;
    c->layout();   // 0x009656b0
}
void kabanCardSetDepth(CWindowTaskKabanCard* c, float z) {
    c->z = z;
    c->layout();
}
CWindowTaskKabanOrder* kabanOrderCreate(void* p, void* m) { return CWindowTaskKabanOrder::create(p, m); }     // 0x00956b70
CWindowTaskKabanSearch* kabanSearchCreate(void* p, void* m) { return CWindowTaskKabanSearch::create(p, m); }  // 0x00959350
CWindowTaskKabanCard* kabanCardCreate(void* p, void* m) { return CWindowTaskKabanCard::create(p, m); }        // 0x00965330

// ---- KabanWindow -> DeckWindow
bool deckShowingExtra() { return g_deckWindow->extraView(); }   // 0x00951620
void deckSetTab(int32_t tab) { g_deckWindow->switchView(tab); }  // 0x00950a00
void deckRefresh() { g_deckWindow->rebuild(); }                 // 0x0094ee60

}   // namespace dk
