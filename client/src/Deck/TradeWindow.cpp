// yo2TradeWindow.cpp (0x0098f1c0..0x00994660): the trade window's card rows. The vector growth code inlined in
// addOther/addMine (0x00994f60..0x00995130) is the STL's: TradeCards::push here.
#include "TradeWindow.h"

#include <cstdlib>
#include <cstring>

CWindowTaskTrade* g_tradeWindow = nullptr;

// ---------------------------------------------------------------- a VC6-layout vector of task pointers

static void push(TradeCards& v, CWindowTaskTradeCard* c) {
    size_t n = v.size(), cap = v.first ? (size_t)(v.end - v.first) : 0;
    if (n == cap) {
        size_t ncap = n + (n < 2 ? 1 : n);   // the exe grows by max(1, size)
        auto** p = static_cast<CWindowTaskTradeCard**>(malloc(ncap * sizeof(CWindowTaskTradeCard*)));
        if (n) memcpy(p, v.first, n * sizeof *p);
        free(v.first);
        v.first = p;
        v.last = p + n;
        v.end = p + ncap;
    }
    *v.last++ = c;
}

static void erase(TradeCards& v, size_t i) {
    memmove(v.first + i, v.first + i + 1, (v.size() - i - 1) * sizeof *v.first);
    v.last--;
}

// ---------------------------------------------------------------- CWindowTaskTradeCard

// @yo2 0x0098f440
int32_t CWindowTaskTradeCard::typeId() { return 0x17; }

// @yo2 0x0098f500
void CWindowTaskTradeCard::init() {
    w = 100.0f;
    h = 145.0f;
    x = y = z = 0.0f;
    selected = 0;
    hoverTicks = 0;
    last = 0;
    b3a1 = 0;
    homeX = homeY = homeZ = 0.0f;
    enabled = 1;
    _model[0xc7] = 1;   // CElement visible
    uiRedraw(this);
}

// @yo2 0x0098f690 the sprite is data/CARD/<the card list's file name>
void CWindowTaskTradeCard::setCard(uint32_t id) {
    card = (int32_t)id;
    sprite.task = uiCardSprite(this, "data/CARD/" + cardImageName(card));
}

// @yo2 0x0098f660 CElement position (+0x70) <- the card's position
void CWindowTaskTradeCard::syncPosition() {
    memcpy(&_model[0x70], &x, 4);
    memcpy(&_model[0x74], &y, 4);
    memcpy(&_model[0x78], &z, 4);
}

// @yo2 0x0098f590
int32_t CWindowTaskTradeCard::update() {
    if (!uiCursorOver(this)) {
        hoverTicks = 0;
    } else if (hoverTicks++ == 3) {
        uiDetailView(card);
    }
    uiRedraw(this);
    return 1;
}

// @yo2 0x0098fda0
void CWindowTaskTradeCard::destroy() {
    uiSpriteVisible(sprite.task, false);
    uiDeleteTask(sprite.task, 0x8a);
}

// The scalar deleting destructor and its body (CTaskPtr member + CWindowTaskModel base): nothing of their own.
// @yo2 0x0098f460
// @yo2 0x0098f490

// ---------------------------------------------------------------- CWindowTaskTrade

static CWindowTaskTradeCard* newCard(CWindowTaskTrade* w, uint32_t card) {
    CWindowTaskTradeCard* c = uiNewTradeCard(w);
    c->setCard(card);
    return c;
}

// @yo2 0x00993090
bool CWindowTaskTrade::addOther(uint32_t card) {
    push(other, newCard(this, card));
    if (otherCount < 10) otherCount++;
    return true;
}

// @yo2 0x009932f0
bool CWindowTaskTrade::addMine(uint32_t card) {
    push(mine, newCard(this, card));
    if (mineCount < 10) mineCount++;
    return true;
}

static bool removeAt(TradeCards& v, int32_t& count, uint32_t index, int line) {
    if (index >= v.size()) return true;   // out of range: nothing (still "ok")
    v[index]->destroy();
    uiDeleteTask(v[index], line);
    erase(v, index);
    if (count > 0) count--;
    return true;
}

// @yo2 0x00993550
bool CWindowTaskTrade::removeOther(uint32_t index) { return removeAt(other, otherCount, index, 0x22c); }

// @yo2 0x00993680
bool CWindowTaskTrade::removeMine(uint32_t index) { return removeAt(mine, mineCount, index, 0x246); }

// @yo2 0x009937b0 the rows trade places (the counts stay)
void CWindowTaskTrade::swapRows() {
    TradeCards t = mine;
    mine = other;
    other = t;
    layout();
}

// @yo2 0x009938e0
void CWindowTaskTrade::resetMine(uint32_t index) {
    if (index >= mine.size()) return;
    CWindowTaskTradeCard* c = mine[index];
    c->x = c->homeX;
    c->y = c->homeY;
    c->z = c->homeZ;
    uiRedraw(c);
    c->selected = 0;
}

// @yo2 0x009939c0
// @yo2 0x00994330
int32_t CWindowTaskTrade::countMine(int32_t card) {
    int32_t n = 0;
    for (size_t i = 0; i < mine.size(); i++)
        if (mine[i]->card == card) n++;
    return n;
}

// @yo2 0x00993a40 rows from x 262 (top row y 52, mine y 340), step 72 (40 once ready), each card 8 lower and
// 1 nearer than the previous; the last one of a row is drawn whole
void CWindowTaskTrade::layout() {
    const float step = ready ? 40.0f : 72.0f;
    for (TradeCards* row : {&other, &mine}) {
        float x = 262.0f, y = row == &other ? 52.0f : 340.0f, z = 2.0f;
        for (size_t i = 0; i < row->size(); i++) {
            CWindowTaskTradeCard* c = (*row)[i];
            c->x = c->homeX = x;
            c->y = c->homeY = y;
            uiRedraw(c);
            c->z = c->homeZ = z;
            uiRedraw(c);
            c->last = 0;
            x += step;
            y += 8.0f;
            z += 1.0f;
        }
        if (row->size()) (*row)[row->size() - 1]->last = 1;
    }
}

static void clearRow(TradeCards& v, int line) {
    for (size_t i = 0; i < v.size(); i++) {
        v[i]->destroy();
        uiDeleteTask(v[i], line);
    }
    v.last = v.first;
}

// @yo2 0x00993da0
void CWindowTaskTrade::clear() {
    clearRow(other, 0x2cd);
    clearRow(mine, 0x2d8);
    otherCount = mineCount = 0;
}

// @yo2 0x00994000
void CWindowTaskTrade::clearOther() {
    clearRow(other, 0x2ef);
    otherCount = 0;
}

// @yo2 0x00994250
void CWindowTaskTrade::setEnabled(bool on) {
    enabled = on;
    uiKabanRefresh(on);
    for (size_t i = 0; i < other.size(); i++) other[i]->enabled = on;
    for (size_t i = 0; i < mine.size(); i++) mine[i]->enabled = on;
}

// @yo2 0x00994540 every id of both rows (the caller's arrays hold 10)
void CWindowTaskTrade::ids(int32_t* o, int32_t* m) const {
    for (size_t i = 0; i < other.size() && i < 10; i++) o[i] = other.first[i]->card;   // fix: the exe has no bound
    for (size_t i = 0; i < mine.size() && i < 10; i++) m[i] = mine.first[i]->card;
}

// @yo2 0x00994660
uint32_t CWindowTaskTrade::otherIds(int32_t* out) const {
    uint32_t n = 0;
    for (; n < other.size() && n < 10; n++) out[n] = other.first[n]->card;
    return n;
}

// @yo2 0x009017e0
void CWindowTaskTrade::setMineCount(int32_t n) {
    mineCount = n;
    uiRedraw(this);
}

// @yo2 0x009929e0 my "ready": locks the card box and the ready button, lights my lamp and packs the rows
void CWindowTaskTrade::setReady(bool on) {
    ready = on;
    uiTradeLock(!ready);
    uiKabanRefresh(ready);
    uiReadyLamp(0, ready);
    layout();
}

// @yo2 0x009943d0
void tradeShowOtherReady(int mode) {
    if (mode == 0) {
        uiReadyLamp(1, false);
        uiReadyLamp(2, false);
    } else if (mode == 1) {
        uiReadyLamp(1, true);
        uiReadyLamp(2, false);
    } else if (mode == 2) {
        uiReadyLamp(1, false);
        uiReadyLamp(2, true);
    }
}

// @yo2 0x009945d0
void tradeRefreshKaban(bool on) { uiKabanRefresh(on); }

// @yo2 0x00994630
void tradeRefreshKabanAll() { uiKabanRefreshAll(); }
