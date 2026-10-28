// Test CLI for the first half of the duel scene (src/duel/Scene*.cpp), built by tests/duel_scene1_test.py.
//   selftest <sintable.bin>   behaviour checks of the dialogs and the match bookkeeping, and CCard / match code
//                             against the decompiled originals (ref_*, compiled from the dc output by the script)
//   tables                    the scene's constant tables, for the script to compare with the exe's bytes
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <new>
#include <random>

#include "duel/CardDB.h"
#include "duel/Engine.h"
#include "duel/NetDuel.h"
#include "duel/SceneDialogs.h"
#include "duel_scene1_stubs.h"

#include "duel/SceneDuelScene.h"
#include "System/yo2StringDB.h"
#include "System/yo2ZSort.h"

using namespace ds;
using s1::st;

// ---------------------------------------------------------------- the reference side (ref.c)
extern "C" {
uint32_t* p_viewer;
int32_t* p_miniH;
int32_t* p_cardW;
int32_t* p_sin;
uint8_t* p_games;
uint8_t* p_game0;
int32_t* p_endMode;
int32_t* p_result;
int ref_758540(char* c);
unsigned ref_758210(char* c, uint16_t* code);
void ref_7583d0(char* c);
void ref_794a90(int r);
uint64_t ext_7bea20(unsigned p, unsigned z, unsigned i) {
    int32_t x, y;
    matPos(p, z, i, &x, &y);
    return (uint32_t)x | (uint64_t)(uint32_t)y << 32;
}
int ext_7904f0(void) { return st().isMatch; }
}

static int g_checks, g_fails;
#define CHECK(c)                                                                        \
    do {                                                                                \
        g_checks++;                                                                     \
        if (!(c)) {                                                                     \
            g_fails++;                                                                  \
            if (g_fails < 30) fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #c); \
        }                                                                               \
    } while (0)


// ---------------------------------------------------------------- CCard against the decompiled original
// The card's fields from +0x10 on, as the exe lays them out (the host's vptr is 8 bytes, the exe's 4).
static void clearFields(CCard& c) { std::memset(static_cast<void*>(&c.cardId), 0, 0x70); }
static void toExe(const CCard& c, uint8_t* b) {
    std::memset(b, 0, 0x80);
    std::memcpy(b + 0x10, &c.cardId, 0x70);
}
static void randomCard(std::mt19937& r, CCard& c) {
    clearFields(c);
    auto R = [&](int lo, int hi) { return (int32_t)(lo + (int64_t)(r() % (uint32_t)(hi - lo + 1))); };
    uint16_t zones[] = {0x00, 0x02, 0x06, 0x0a, 0x0c, 0x12, 0x16, 0x16, 0x18, 0x1c, 0x20, 0x2c};
    auto code = [&]() {
        return (uint16_t)(zones[r() % 12] | (r() & 1) | (R(0, 9) << 6) | (r() & 1) << 14 | (r() & 1) << 15);
    };
    c.code = code();
    c.prevCode = r() % 3 ? code() : c.code;
    c.anim = r() % 3 ? 0x100 : R(0, 7) * 0x20;
    c.flash = R(0, 9);
    c.flashLevel = R(0, 0x10) * 0x10;
    c.upright = r() % 4 == 0;
    c.pinned = r() % 3 == 0;
    c.tx = R(0, 1000), c.ty = R(0, 700), c.fx = R(0, 1000), c.fy = R(0, 700), c.x = R(0, 1000), c.y = R(0, 700);
    if (r() % 3 == 0) c.fx = c.tx, c.fy = c.ty;
    c.rot = R(0, 0x1ff), c.scale = R(0, 0x20000), c.flip = R(0, 0x100), c.tick = R(0, 0xbf);
}

static void checkCardsVsRef() {
    std::mt19937 r(1234);
    for (int n = 0; n < 20000; n++) {
        g_eng.viewer = r() & 1;
        g_cardW = 40 + (int32_t)(r() % 120);
        g_miniH = 20 + (int32_t)(r() % 100);
        static CCard a;
        uint8_t b[0x80], pa[0x80];
        randomCard(r, a);
        toExe(a, b);
        int which = n % 3;
        if (which == 0) {
            int ra = a.step(), rb = ref_758540(reinterpret_cast<char*>(b));
            CHECK(ra == rb);
        } else if (which == 1) {
            uint16_t code = (uint16_t)r();
            uint16_t c2 = code;
            unsigned ra = (unsigned)a.moveTo(&code), rb = ref_758210(reinterpret_cast<char*>(b), &c2);
            CHECK(ra == rb);
        } else {
            a.snap();
            ref_7583d0(reinterpret_cast<char*>(b));
        }
        toExe(a, pa);
        bool same = std::memcmp(pa, b, sizeof b) == 0;
        CHECK(same);
        if (!same && g_fails < 5) {
            for (size_t i = 0; i < sizeof b; i++)
                if (pa[i] != b[i]) fprintf(stderr, "  case %d byte %#zx: %02x vs %02x\n", which, i, pa[i], b[i]);
        }
    }
    // a whole glide: 8 frames from field to hand, settled at the end
    CCard c;
    clearFields(c);
    c.code = 0x0a;
    c.snap();
    uint16_t hand = 0x16 | 2 << 6;
    c.moveTo(&hand);
    int frames = 0;
    while (c.anim != 0x100 && frames < 20) c.step(), frames++;
    CHECK(frames == 8);
    c.step();   // the settling frame
    int32_t hx, hy;
    matPos(0, 0xb, 2, &hx, &hy);
    CHECK(c.x == hx && c.y == hy && c.scale == 0x10000 && c.prevCode == hand);
}

// ---------------------------------------------------------------- the match tally against the original
static void checkMatchVsRef() {
    p_games = &g_matchGames;
    p_game0 = g_matchGame;
    p_endMode = &g_matchEndMode;
    p_result = &g_matchResult;
    for (int match = 0; match < 2; match++) {
        for (int mode5 = 0; mode5 < 2; mode5++) {
            for (int games = 0; games <= 3; games++) {
                for (int combo = 0; combo < 256; combo++) {
                    uint8_t res[4] = {0, (uint8_t)(combo & 3), (uint8_t)(combo >> 2 & 3), (uint8_t)(combo >> 4 & 3)};
                    int32_t start = (int32_t)(combo >> 6) - 1;
                    st().isMatch = match;
                    // ours
                    g_matchGames = (uint8_t)games;
                    std::memcpy(g_matchGame, res, 4);
                    g_matchEndMode = mode5 ? 5 : 0;
                    g_matchResult = start;
                    matchRecordGame(res[games ? games : 1]);
                    uint8_t gA[4];
                    std::memcpy(gA, g_matchGame, 4);
                    int32_t rA = g_matchResult;
                    // the original
                    std::memcpy(g_matchGame, res, 4);
                    g_matchResult = start;
                    ref_794a90(res[games ? games : 1]);
                    CHECK(rA == g_matchResult);
                    CHECK(std::memcmp(gA, g_matchGame, 4) == 0);
                }
            }
        }
    }
    // a best-of-3: win, lose, win -> won after game 3; win, win -> won after game 2
    s1::reset();
    st().isMatch = 1;
    g_matchEndMode = 0;
    g_matchResult = -1;
    duelStart(1);
    matchRecordGame(1);
    CHECK(g_matchResult == -1);
    duelStart(2);
    CHECK(g_duelMode == 1 && g_matchGames == 2);
    matchRecordGame(2);
    CHECK(g_matchResult == -1);
    duelStart(2);
    matchRecordGame(1);
    CHECK(g_matchResult == 1);
    g_matchResult = -1;
    duelStart(1);
    CHECK(g_matchGames == 1 && g_matchGame[1] == 0 && g_matchGame[2] == 0);
    matchRecordGame(1);
    duelStart(2);
    matchRecordGame(1);
    CHECK(g_matchResult == 1);
}

// ---------------------------------------------------------------- dialogs
static uint8_t s_scene[0x2490];
static CElement* g_root;

template <class T>
static T* opened(T* d) {   // CTask::create: TM_INIT runs onInit
    return dynamic_cast<T*>(d->CTask::create(g_root, DLG_OK));
}

static void checkSelectDialog() {
    s1::reset();
    std::u16string src = u"Pick one\nAlpha\nBeta\nGamma";
    auto* d = new CUSelectDialog(src.c_str(), 3, 0x5);   // options 0 and 2
    CHECK(d->textCount == 4 && d->cancelValue == -1 && d->options == 3 && d->fade_ == 0x100);
    placeThin(d, 100.0f, 50.0f, 0);
    d = opened(d);
    CHECK(d && d->rows == 2 && d->rowValue[0] == 0 && d->rowValue[1] == 2);
    CHECK(st().listRows.size() == 2 && st().listRows[0] == "Alpha" && st().listRows[1] == "Gamma");
    CHECK(d->boxW_ == 336 + 100 && d->boxH_ == 2 * 16 + 0x38 && d->w_ == 436.0f);
    CHECK(d->x_ == (float)(d->cx_ - (d->boxW_ >> 1)) && d->movable_);
    d->fade_ = 0;   // faded in
    // the second row under the mouse, then a release answers option 2
    st().mouseX = (int32_t)d->x_ + 20;
    st().mouseY = (int32_t)d->y_ + 48 + 16 + 3;
    d->tick();
    CHECK(st().hover == 1 && !d->answered_);
    st().released = true;
    d->tick();
    CHECK(d->answered_ && d->result_ == 2);
    // a two-line first row shifts the row index
    d->answered_ = false;
    st().released = false;
    st().rowSpan = {2};
    st().mouseY = (int32_t)d->y_ + 48 + 32 + 3;   // the third 16 px line: row 1 after the two-line row 0
    d->tick();
    CHECK(st().hover == 1);
    // auto mode answers the first offered option
    d->answered_ = false;
    g_duelAuto = 1;
    d->tick();
    CHECK(d->answered_ && d->result_ == 0);
    g_duelAuto = 0;
    // right click answers the cancel value only when there is one
    d->cancelValue = 1;
    st().rightClicked = true;
    d->onMouse(appMouse());
    CHECK(!st().sent.empty() && st().sent.back() == 1 && d->fade_ == -1);
    CHECK(d->onMain());
    d->onClosed();
    CHECK(!d->onMain());
}

static void checkStandAndCoin() {
    s1::reset();
    std::u16string q = u"Which?";
    auto* s = CUSelectStandDialog::create(g_root, 300.0f, 200.0f, 0, q.c_str(), 7, 0);
    CHECK(s && s->question == q.c_str() && s->cardId == 7);
    CHECK(s->cards[0].x == s->cx_ - 50 && s->cards[1].x == s->cx_ + 50);
    CHECK(s->cards[0].order_ == 0x701 && s->cards[0].cardId == 7 && s->cards[1].atk == 70);
    CHECK(s->canClose());
    s->fade_ = 0;
    st().keys = 1u << KEY_RIGHT;
    s->tick();
    CHECK(!st().warps.empty() && st().warps.back().first == s->cx_ + 50 &&
          st().warps.back().second == s->boxH_ / 2 - 50 + s->cy_);
    st().keys = 0;
    // a click on the right card
    st().spriteW = 40, st().spriteH = 60;
    st().mouseX = s->cards[1].x + 3, st().mouseY = s->cards[1].y - 4;
    s->boxW_ = 1000, s->boxH_ = 1000;   // the box covers the cards
    st().clicked = true;
    s->onMouse(appMouse());
    CHECK(s->answered_ && s->result_ == 1 && s->cards[1].flash == 1 && g_cardHover == &s->cards[1]);
    CHECK(!s->canClose());   // the picked card flashes first
    st().log.clear();
    s->ugSlot23();
    CHECK(st().draws.size() >= 2 && s->cards[0].y == s->boxH_ / 2 - 50 + s->cy_);   // both cards drawn

    s1::reset();
    std::u16string cq = u"Heads?";
    auto* c = new CUSelectCoinDialog;
    CHECK(c->cx_ == 512 && c->cy_ == 300 && c->boxW_ == 200 && c->boxH_ == 0x5c + 0x32 && c->hover == -1);
    placeThin(c, 344.0f, 228.0f, 0);
    c = opened(c);
    CHECK(c && st().log.back() == "load data/Y2/duel/effect/coin_new.txt");
    st().frames = 14;
    st().spriteW = 14 * 48, st().spriteH = 48;
    c->boxW_ = 1000, c->boxH_ = 1000;   // the box covers the coins
    // the left coin: frame 6 at (cx - 80, h/2 - 40 + cy)
    int32_t bx = c->cx_ - 0x50, by = c->boxH_ / 2 - 0x28 + c->cy_;
    st().mouseX = bx, st().mouseY = by;
    st().clicked = true;
    c->onMouse(appMouse());
    CHECK(c->hover == 0 && c->answered_ && c->result_ == 1);
    c->answered_ = false;
    st().mouseX = bx + 0xa0;
    c->onMouse(appMouse());
    CHECK(c->hover == 1 && c->result_ == 0);
    CHECK(!c->canClose());
    for (int i = 0; i < 16; i++) c->tick();
    CHECK(c->canClose());
    // drawn: the hovered coin opaque or blinking, the other at 0x80
    st().draws.clear();
    c->fade_ = 0;
    c->ugSlot23();
    CHECK(st().draws.size() == 2);
    if (st().draws.size() < 2) return;
    CHECK(st().draws[0].alpha == 0x80);
    CHECK(st().draws[0].src[0] == 6 * 48 && st().draws[1].src[0] == 13 * 48 && st().draws[1].src[3] == 49);
    CHECK(st().draws[1].alpha == ((c->afterAnswer & 2) ? 0x80 : 0xff));
}

static void checkNumDiceDiscard() {
    s1::reset();
    std::u16string t = u"How many?", u = u"x";
    auto* n = CUSelectNumDialog::create(g_root, 10, 10, 0, t.c_str(), u.c_str(), 2, 4);
    CHECK(n && n->value == 2 && n->minValue == 2 && n->maxValue == 4 && n->running_ && n->fade_ == 0x100);
    CHECK(n->message == u"How many?\nD598\nD599\nx2");
    n->fade_ = 0;
    st().keys = 1u << KEY_LEFT;
    n->tick();
    CHECK(n->value == 2);
    st().keys = 1u << KEY_RIGHT;
    for (int i = 0; i < 4; i++) n->tick();
    CHECK(n->value == 4 && st().sent.empty());
    n->dialog_.result_ = DLG_OK;   // the OK button
    n->tick();
    CHECK(st().sent.size() == 1 && st().sent[0] == 4 && n->unk3e8_);
    CHECK(!n->onMain());

    s1::reset();
    std::u16string dt = u"Dice";
    auto* d = new CUDiceDialog(dt.c_str(), 2, 0x7e);   // all six faces offered, pick 2
    CHECK(d->free == 0x3f && d->need == 2 && d->boxW_ == 0x90 && d->boxH_ == 0x80 && d->message == u"Dice");
    int32_t p[2];
    d->facePos(p, 4);
    CHECK(p[0] == d->cx_ + 0x20 && p[1] == d->cy_ - 0x10);
    st().spriteW = 30, st().spriteH = 30;
    st().clicked = true;
    d->facePos(p, 1);
    st().mouseX = p[0] + 5, st().mouseY = p[1] + 5;
    d->onMouse(appMouse());
    CHECK(d->picked == 1 && d->chosen == 2 && d->free == 0x3d && !d->answered_);
    d->onMouse(appMouse());   // the same face again: no longer offered
    CHECK(d->picked == 1);
    d->facePos(p, 5);
    st().mouseX = p[0], st().mouseY = p[1] + 29;
    d->onMouse(appMouse());
    CHECK(d->answered_ && d->result_ == (0x22 << 1));
    st().clicked = false;
    st().keys = 1u << KEY_LEFT;
    d->answered_ = false;
    d->fade_ = 0;
    d->hover = 0;
    d->tick();
    d->facePos(p, 5);
    CHECK(!st().warps.empty() && st().warps.back().first == p[0] + 0x10);

    s1::reset();
    for (int i = 0; i < 0x200; i++) g_sinTable[i] = i << 8;   // a ramp, enough to follow the arithmetic
    auto* x = CUDiscardDialog::create(g_root, 400.0f, 300.0f, 0, u"Discard");
    CHECK(x && x->boxW_ == 0x13a && x->boxH_ == 0x10);
    CHECK(x->x_ == (float)(x->cx_ - 0x9d) && x->w_ == 314.0f && x->h_ == 16.0f);
    st().discardLeft = 0;
    CHECK(!x->onMain());
    st().discardLeft = 3;
    x->fade_ = 0;
    CHECK(x->onMain());
    CHECK(st().draws.size() == 3);
    if (st().draws.size() < 3) return;
    int32_t step = g_miniH / 2;
    CHECK(st().draws[1].x - st().draws[0].x == step && st().draws[0].size[0] == g_miniW / 2);
    CHECK(st().draws[0].x == (x->cx_ - x->boxW_ / 2) + g_miniW - (g_miniW / 2) / 2);
    x->fade_ = 0xf0;   // opening: the bar grows along the sine table
    x->cx_ = 900;
    CHECK(x->onMain());
    int32_t sv = g_sinTable[(uint32_t)((-0x40 - (0xf0 - 0x20)) * 2) & 0x1ff] >> 8, hh = sv * 0x70 / 256;
    CHECK(x->boxH_ == (hh < 0x11 ? 0x10 : hh) && x->x_ == (float)(0x363 - 0x9d));
}

static void checkRitualPhaseLockOnLists() {
    s1::reset();
    auto* r = CURitualDialog::create(g_root, 0.0f, 0.0f, 0, u"Ritual", 5);
    CHECK(r && r->level == 5 && g_ritualDialogOpen == 1);
    st().spriteW = 20, st().spriteH = 20;
    st().pairA = 2;
    r->fade_ = 0;
    r->ugSlot23();
    CHECK(st().draws.size() == 5);
    if (st().draws.size() == 5) {
        CHECK(st().draws[1].x - st().draws[0].x == 22);
        CHECK(st().draws[2].sprite != st().draws[3].sprite && st().draws[3].sprite == st().draws[4].sprite);
    }
    st().pairA = 0;
    r->tick();
    CHECK(st().sent.size() == 1 && st().sent[0] == 0);
    st().pairANone = 1;
    CHECK(!r->onMain());
    r->onClosed();
    CHECK(g_ritualDialogOpen == 0 && r->unk3e8_);

    s1::reset();
    CHECK(phaseRowText(0x3c, 2) == 413 && phaseRowText(0x38, 3) == 412 && phaseRowText(0x3c, 3) == 410);
    CHECK(phaseRowText(0x24, 4) == 413 && phaseRowText(0x30, 4) == 413 && phaseRowText(0x28, 4) == 414);
    auto* p = CUPhaseSelectDialog::create(g_root, 100.0f, 100.0f, 0, u"Phase", 0x34);   // bits 2, 4, 5
    CHECK(p && p->count == 3 && p->phase[0] == 2 && p->phase[1] == 4 && p->phase[2] == 5);
    CHECK(p->text[0] == 413 && p->text[1] == 414 && p->text[2] == 415);
    CHECK(p->boxH_ == 3 * 16 + 0x38);
    CHECK(st().listRows.size() == 3 && st().listRows[0] == "T414" && st().listRows[2] == "T413");
    p->fade_ = 0;
    st().mouseX = (int32_t)p->x_ + 30;
    st().mouseY = (int32_t)p->y_ + 48 + 2;   // row 0 = the second entry (end)
    st().released = true;
    p->tick();
    CHECK(p->answered_ && p->result_ == 4);
    p->answered_ = false;
    st().mouseY = (int32_t)p->y_ + 48 + 32 + 2;   // the last row = the first entry (battle)
    p->tick();
    CHECK(p->result_ == 2);
    p->answered_ = false;
    st().mouseY = (int32_t)p->y_ + 5;   // above the rows: cancel
    p->tick();
    CHECK(p->answered_ && p->result_ == 7);

    s1::reset();
    g_duelScene = s_scene;
    *engAt<uint32_t>(0x012cc374) = 1;
    auto* l = new CULockOnDialog(u"Target");
    CHECK(l->following == 1);
    placeThin(l, 0, 0, 0);
    l = opened(l);
    CHECK(l && l->boxX == ftol(l->x_) && g_duelScene[0x12c] == 1);
    st().mouseX = -1000, st().mouseY = -1000;
    int32_t bx0 = l->boxX;
    l->tick();
    CHECK(l->boxX == bx0 && l->following == 1);
    st().mouseX = (int32_t)l->x_ + 2, st().mouseY = (int32_t)l->y_ + 2;   // touches the box: it moves to (358, 612)
    int32_t by0 = l->boxY;
    l->tick();
    CHECK(l->following == 0 && l->targetY == 0x264 && l->boxY == (by0 - 0x264) * 4 / 5 + 0x264);
    *engAt<uint32_t>(0x012cc374) = 0;
    l->fade_ = 0;
    l->tick();
    CHECK(l->unk3e8_ && !l->running_ && g_duelScene[0x12c] == 0);

    s1::reset();
    auto* ty = new CUSelectTypeDialog((1u << 3) | (1u << 7) | (1u << 20) | 1u);
    CHECK(ty->count == 3 && ty->types[0] == 3 && ty->types[2] == 20);
    auto* inner = CWindowModelDialogOk::create(g_root, 0, 0, 1, 0);
    ty->inner_ = inner;
    ty->picks = 1;
    ty = opened(ty);
    CHECK(ty && st().listRows.size() == 3 && st().listRows[1] == "type 7" && ty->x_ == 362.0f);
    CHECK(inner->movable_ && inner->w_ == 300.0f && inner->h_ == 368.0f);
    inner->dialog_.result_ = 0;
    CHECK(ty->onMain() && st().sent.empty());
    inner->dialog_.result_ = DLG_OK;
    st().selectedCount = 1;
    st().selectedMask = 2;
    CHECK(!ty->onMain() && st().sent.size() == 1 && st().sent[0] == 7);

    s1::reset();
    auto* at = new CUSelectAttributeDialog(0x7e);
    at->inner_ = inner;
    at->picks = 2;
    at = opened(at);
    CHECK(at && at->count == 6);
    CHECK(at->y_ == (float)(0x180 - ((6 + 3) * 0x10 >> 1)) && at->h_ == 144.0f);
    inner->dialog_.result_ = DLG_OK;
    st().selectedCount = 2;
    st().selectedMask = 0x21;   // rows 0 and 5: attributes 1 and 6
    CHECK(!at->onMain() && st().sent.size() == 1 && st().sent[0] == ((1u << 1) | (1u << 6)));
}

static void checkSummon() {
    s1::reset();
    g_duelScene = s_scene;
    std::memset(s_scene, 0, sizeof s_scene);
    auto* m = CUSummonDialogSp::create(g_root, 0, 0, 0);
    CHECK(m && m->chosen == -1 && !m->hasChoice());
    CCard card;
    clearFields(card);
    card.code = 0x0a | 1 << 6;   // a monster zone of player 0
    m->open(0, 0, 0x203, &card);   // bits 0, 1, 9: commands 8, 0, 1
    CHECK(m->count == 3 && m->cmd[0] == 8 && m->cmd[1] == 0 && m->cmd[2] == 1 && m->bit[2] == 9);
    CHECK(st().listRows.size() == 3 && st().listRows[2] == "cmd 1" && m->shown);
    int32_t px, py;
    matPos(0, 5, 1, &px, &py);
    CHECK(m->x_ == (float)(px - 0x4f));
    CHECK(m->y_ == (float)((py - g_miniH / 2) - 4 * 16) && m->h_ == 64.0f && m->w_ == 158.0f);
    CHECK(m->inRect(px - 0x4f, (int32_t)m->y_) && !m->inRect(px + 200, py));
    // the mouse on the second row: a click picks bit 1
    st().mouseX = px - 0x4f + 20;
    st().mouseY = (int32_t)m->y_ + 8 + 16 + 3;
    st().clicked = true;
    CHECK(m->onMain());
    CHECK(m->hoverRow == 1 && m->chosen == 1 && m->hasChoice() && m->choice() == 1);
    // off the menu and the card: hidden
    st().mouseX = 5, st().mouseY = 5;
    st().clicked = false;
    m->onMain();
    CHECK(!m->shown);
}

static void checkScene() {
    s1::reset();
    g_duelScene = s_scene;
    std::memset(s_scene, 0, sizeof s_scene);
    // the LP verdict
    g_eng.viewer = 0;
    g_eng.pl[0].lp = 1000, g_eng.pl[1].lp = 4000;
    *reinterpret_cast<int32_t*>(s_scene + 0xac4) = 2000;
    *reinterpret_cast<int32_t*>(s_scene + 0xac4 + 0x44) = 500;
    duelJudgeLp();
    CHECK(*reinterpret_cast<int32_t*>(s_scene + 0x130) == 1 && g_sideJudge[0] == 1 && g_sideJudge[1] == 1);
    CHECK(st().log.size() >= 1 && st().log[0] == "bgm " + std::to_string(0x20000019) + " 15");
    g_eng.pl[0].lp = 8000;
    duelJudgeLp();
    CHECK(*reinterpret_cast<int32_t*>(s_scene + 0x130) == 2 && g_sideJudge[0] == 2 && g_sideJudge[1] == 1);
    st().log.clear();
    g_eng.pl[1].lp = 7000;
    g_fieldSpell = 7;
    duelJudgeLp();
    CHECK(*reinterpret_cast<int32_t*>(s_scene + 0x130) == 0 && g_sideJudge[0] == 0);
    CHECK(st().log.back() == "bgm " + std::to_string(0x2000002b) + " 0");
    CHECK(fieldBgm(0x16) == 0x2000002c && fieldBgm(15) == 0x2000002d && fieldBgm(-1) == 0x2000002d);
    g_netDuel->bgm = 0x20000012;
    CHECK(fieldBgm(0) == 0x20000012);
    // the scene's busy task list
    int busy[3] = {0, 0, 1};
    uint8_t entries[3][0x10] = {};
    for (int i = 0; i < 3; i++) {
        int* p = &busy[i];
        std::memcpy(entries[i] + 4, &p, sizeof p);
    }
    struct List {
        uint8_t alloc;
        uint8_t *first, *last, *end;
    }* l = reinterpret_cast<List*>(s_scene + 0x197c);   // s_scene + 0x197c is 4-aligned; 0x197c + 4 = 0x1980
    static_assert(alignof(List) <= 8, "");
    List tmp{0, &entries[0][0], &entries[0][0] + 2 * 0x10, nullptr};
    std::memcpy(static_cast<void*>(l), &tmp, sizeof tmp);
    CHECK(!sceneAnyBusy());
    tmp.last = &entries[0][0] + sizeof entries;
    std::memcpy(static_cast<void*>(l), &tmp, sizeof tmp);
    CHECK(sceneAnyBusy());
}

// CNumber (right to left, the sign glyph) and CCard::draw's paths: moving (edge-on at a half flip), settled with the
// ATK / DEF easing toward the engine's values, and the stats reset off the field.
static void checkCardDraw() {
    s1::reset();
    st().spriteW = 120, st().spriteH = 16;   // a 12-frame digit strip, 10 px a digit
    static CSpriteElmOlder sheet;
    CNumber n{0, 5.0f, &sheet, 12};
    CHECK(n.digitW() == 10 && n.height() == 16);
    CHECK(n.width(-305, false, 0) == 30 && n.width(-305, true, 0) == 40 && n.width(0, false, 7) == 7);
    CHECK(n.draw(100, 50, -305, false, 0) == 60);
    CHECK(st().draws.size() == 4);
    if (st().draws.size() == 4) {
        const int32_t want[4][2] = {{90, 50}, {80, 0}, {70, 30}, {60, 110}};   // x, cell x0: 5, 0, 3, '-'
        for (int i = 0; i < 4; i++)
            CHECK(st().draws[i].x == want[i][0] && st().draws[i].src[0] == want[i][1] &&
                  st().draws[i].src[2] == want[i][1] + 10 && st().draws[i].alpha == 0xff);
    }
    st().draws.clear();
    CHECK(n.drawAlpha(100, 50, 42, 0x80, true, 12) == 64);   // 2, 4, '+'
    CHECK(st().draws.size() == 3 && st().draws[2].src[0] == 100 && st().draws[0].alpha == 0x80 && st().draws[0].blit);
    // the first digit of a pop hops a full height at t = 0x40 (cos 0 = 1), the next 0x20 later
    st().draws.clear();
    n.drawPop(100, 50, 12, 0x40, false, 0);
    CHECK(st().draws.size() == 2 && st().draws[0].y == 50 - 16 &&
          st().draws[1].y == 50 - (g_sinTable[0x180] * 16 >> 16));

    // a card moving, half flipped: drawn edge-on (x scale 0) at full height
    s1::reset();
    st().spriteW = 80, st().spriteH = 116;
    CCard c;
    c.code = 2 << 6;   // player 0, monster zone, slot 2
    c.prevCode = c.code;
    c.x = 300, c.y = 400;
    c.anim = 0x40;
    c.flip = 0x80;
    c.drawNow = 1;
    c.draw();
    CHECK(st().draws.size() == 1 && st().draws[0].blit && st().draws[0].sx == 0.0f && st().draws[0].sy == 1.0f &&
          st().draws[0].x == 300 - 40 && st().draws[0].y == 400 - 58);
    // settled: the card, then ATK / DEF eased 1/8 of the way toward the engine's
    st().draws.clear();
    c.anim = 0x100;
    c.flip = 0x100;
    c.code |= CODE_FACEUP;
    c.atk = 1800, c.def = 500;
    g_eng.viewer = 0;
    st().cardText = 5;
    int32_t stats[13] = {5, 5, 1, 1, 2, 4, 1000, 900, 1000, 800};
    std::memcpy(st().stats, stats, sizeof stats);
    c.draw();
    CHECK(c.atk == 1000 + 800 * 7 / 8 && c.def == 900 + (500 - 900) * 7 / 8);
    CHECK(st().draws.size() > 1 && st().draws[0].x == 300 - 40);
    // off the field the shown values are the card's printed ones again
    c.code = (uint16_t)(ZONE_HAND << 1 | 3 << 6);
    c.drawStats();
    CHECK(c.atk == cardAtk(cardPropId(c.cardId)) && c.def == cardDef(cardPropId(c.cardId)));
}

static int selftest(const char* sinPath) {
    FILE* f = std::fopen(sinPath, "rb");
    if (!f || std::fread(g_sinTable, 4, 0x200, f) != 0x200) {
        fprintf(stderr, "cannot read %s\n", sinPath);
        return 2;
    }
    std::fclose(f);
    p_viewer = &g_eng.viewer;
    p_miniH = &g_miniH;
    p_cardW = &g_cardW;
    p_sin = g_sinTable;
    struct FakeText : CStringDB {
        vc6::string get(uint32_t) const override { return "text"; }
    } text;
    g_stringDB = &text;
    CZSortSet layers;
    g_zsortSet = &layers;
    CWindowTaskFactory::create();
    g_root = CElement::createRoot();
    checkCardsVsRef();
    checkMatchVsRef();
    // the dialog checks follow the decompiled formulas on a linear sine table set where they need one
    checkSelectDialog();
    checkStandAndCoin();
    checkRitualPhaseLockOnLists();
    checkSummon();
    checkScene();
    f = std::fopen(sinPath, "rb");   // the real table again for the discard bar
    if (f) {
        if (std::fread(g_sinTable, 4, 0x200, f) != 0x200) return 2;
        std::fclose(f);
    }
    checkCardDraw();
    checkNumDiceDiscard();
    if (g_fails) {
        fprintf(stderr, "%d of %d checks failed\n", g_fails, g_checks);
        return 1;
    }
    printf("ok scene1 %d\n", g_checks);
    return 0;
}

static int tables() {
    printf("summon");
    for (int32_t v : kSummonCommands) printf(" %d", v);
    printf("\nphase");
    for (auto& e : kPhaseTexts)
        for (int32_t v : e) printf(" %d", v);
    printf("\n");
    return 0;
}

int main(int argc, char** argv) {
    if (argc >= 3 && !std::strcmp(argv[1], "selftest")) return selftest(argv[2]);
    if (argc >= 2 && !std::strcmp(argv[1], "tables")) return tables();
    fprintf(stderr, "usage: %s selftest <sintable.bin> | tables\n", argv[0]);
    return 2;
}
