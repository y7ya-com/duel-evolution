// CCard / CCardPlane / CNumber / CCardLoader (0x00757920..0x00758990): the card sprites of the duel mat.
//
// A card sits at a mat position code (SceneCard.h). moveTo() starts a glide from where it is to the code's place:
// update() then advances `anim` by 0x20 a frame (8 frames), easing the position along a quarter sine, turning by
// the shortest way to the new owner/defense rotation, flipping face up/down and scaling between the field size and
// the hand size; when all four parts have arrived the card is settled (anim = 0x100).
#include "SceneCard.h"

#include <windows.h>

#include <new>

#include "CardDB.h"
#include "Engine.h"
#include "EngineInternal.h"
#include "NetDuel.h"

namespace ds {

// ---------------------------------------------------------------- statics
#if !YO2_IN_EXE
int32_t g_cardRefs;              // DAT_012a6824
void* g_cardPlane;               // DAT_012a6828
PlaneLoader* g_cardSheet;        // DAT_012a682c
CCard* g_cardHover;              // DAT_012a6830
uint8_t g_cardHoverSet;          // DAT_012a6834
int32_t g_numberRefs;            // DAT_012aa6d0
PlaneLoader* g_numberSheet;      // DAT_012aa6d4
int32_t g_loaderRefs;            // DAT_012a6b74
PlaneLoader* g_cardListBig;      // DAT_012a6b7c
PlaneLoader* g_cardListMini;     // DAT_012a6b78
#endif

namespace {

enum : uint32_t {
    VT_CNUMBER = 0x00bebbe4,
    VT_CCARDPLANE = 0x00bebbf0,
    VT_CCARDLOADER = 0x00bebbfc,
    VT_PLANELOADER = 0x00bea328,
    VT_AUTOPTR_A = 0x00be65fc,
    VT_AUTOPTR_B = 0x00be65f0,
};
}   // namespace

// CCardPlane's System half (yo2CardPlane, 0x00763240..): which sheet and cell a card shows at a rotation.
void cardPlaneDestruct(CardPlane* p);                         // TODO(System) FUN_00763240 ~CCardPlane
void cardPlaneSetCard(CardPlane* p, int32_t id);              // TODO(System) FUN_007632c0
CSpriteElmOlder* cardPlaneField(CardPlane* p, int32_t deg, int32_t v);   // TODO(System) FUN_00763470
CSpriteElmOlder* cardPlaneHandBig(CardPlane* p, int32_t deg);  // TODO(System) FUN_00763420
CSpriteElmOlder* cardPlaneHandMini(CardPlane* p, int32_t deg); // TODO(System) FUN_007633b0

// ---------------------------------------------------------------- CPlaneLoaderElm (inline copies emitted here)

// @yo2 0x00757cd0 CPlaneLoaderElm::CPlaneLoaderElm
void planeConstruct(PlaneLoader* p, uint8_t alloc) {
    new (&p->dir) vc6::string();
    (void)alloc;   // the string's allocator byte (vc6::string keeps its own)
    p->tableVtbl = VT_AUTOPTR_A;
    p->table = nullptr;
    p->tableOwned = 0;
    p->namesVtbl = VT_AUTOPTR_B;
    p->names = nullptr;
    p->namesOwned = 0;
    p->vtbl = VT_PLANELOADER;
    p->count = 0;
    p->own = 1;
    p->sprites = nullptr;
}

// @yo2 0x00757920 sheet i of a set, loaded on first use
CSpriteElmOlder* planeSprite(PlaneLoader* p, int32_t i) {
    planeEnsure(p, i);
    return static_cast<CSpriteElmOlder*>(p->sprites[i].task());   // the exe's dynamic_cast, without the liveness check
}

namespace {
PlaneLoader* newPlane(uint8_t alloc) {
    PlaneLoader* p = static_cast<PlaneLoader*>(::operator new(sizeof(PlaneLoader)));
    planeConstruct(p, alloc);
    return p;
}
}   // namespace

// ---------------------------------------------------------------- CCardLoader: the two card list sheets

// @yo2 0x00757d40 CCardLoader::CCardLoader (the first one loads data/card and data/mini list_card.txt)
void cardLoaderAcquire() {
    if (g_loaderRefs++ != 0) return;
    g_cardListBig = newPlane(0);
    g_cardListMini = newPlane(0);
    planeLoad(g_cardListBig, vc6::string("data/card/list_card.txt"));
    planeLoad(g_cardListMini, vc6::string("data/mini/list_card.txt"));
}

// @yo2 0x00757f60 CCardLoader scalar deleting destructor (the last one frees both sheets)
void cardLoaderRelease() {
    if (--g_loaderRefs != 0) return;
    if (g_cardListBig) {
        planeDelete(g_cardListBig);
        g_cardListBig = nullptr;
    }
    if (g_cardListMini) {
        planeDelete(g_cardListMini);
        g_cardListMini = nullptr;
    }
}

// @yo2 0x00757ff0 CCardPlane scalar deleting destructor
void cardPlaneDelete(CardPlane* p, uint8_t flags) {
    cardPlaneDestruct(p);
    if (flags & 1) ::operator delete(p);
}

// ---------------------------------------------------------------- CNumber
void numberRelease() {
    if (--g_numberRefs == 0 && g_numberSheet) {
        planeDelete(g_numberSheet);
        g_numberSheet = nullptr;
    }
}

void numberAcquire() {
    if (g_numberRefs++ == 0) {
        g_numberSheet = newPlane(0);
        planeLoadY(g_numberSheet, "duel/font/number.txt");
    }
}

// @yo2 0x00758020 CNumber::~CNumber
void numberDestruct(CNumber* n) {
    n->vtbl = VT_CNUMBER;
    numberRelease();
}

// @yo2 0x00758060 CNumber scalar deleting destructor
void numberDelete(CNumber* n, uint8_t flags) {
    numberDestruct(n);
    if (flags & 1) ::operator delete(n);
}

// ---------------------------------------------------------------- CCard

// @yo2 0x007579c0
void cardHoverMark() { g_cardHoverSet = 1; }

int32_t cardRotation(uint16_t code, bool upright, uint32_t viewer) {
    if (upright) return 0;
    return (int32_t)(((uint32_t)(code >> 15) + (uint32_t)((code & 1u) == (viewer ^ 1u)) * 2u) * 0x80u);
}

// @yo2 0x007579e0 CCard::CCard (the first card loads duel/card/card.txt and the number sheet)
CCard::CCard(uint8_t alloc) : CGameObject(1) {
    code = 0;
    prevCode = 0;
    plane.vtbl = VT_CCARDLOADER;
    cardLoaderAcquire();   // CCardPlane's CCardLoader base
    plane.b = 0xffffffffu;
    plane.vtbl = VT_CCARDPLANE;
    number.vtbl = VT_CNUMBER;
    number.sheet = nullptr;
    number.frames = 10;
    number.z = 100.0f;
    numberAcquire();
    number.sheet = nullptr;
    number.frames = 10;
    if (g_cardRefs++ == 0) {
        CardPlane* cp = static_cast<CardPlane*>(::operator new(sizeof(CardPlane)));
        cp->vtbl = VT_CCARDLOADER;
        cardLoaderAcquire();
        cp->b = 0;
        cp->vtbl = VT_CCARDPLANE;
        g_cardPlane = cp;
        g_cardSheet = newPlane(alloc);
        vc6::string path("data/Y/");
        path += "duel/card/card.txt";
        planeLoad(g_cardSheet, path);
    }
    x = 0;
    drawNow = 1;
    upright = 0;
    pinned = 0;
    anim = 0;
    flash = 0;
    flashLevel = 0;
    v54 = 0;
    tick = 0;
    fx = fy = 0;
    y = 0;
    rot = 0;
    scale = 0x10000;
    flip = 0;
    z = 0;
    setCard(0);
    order_ = 0x100;
}

// @yo2 0x00758100 CCard::~CCard
// @yo2 0x007580d0 CCard scalar deleting destructor
CCard::~CCard() {
    if (--g_cardRefs == 0) {
        if (g_cardPlane) {
            cardPlaneDelete(static_cast<CardPlane*>(g_cardPlane), 1);
            g_cardPlane = nullptr;
        }
        if (g_cardSheet) {
            planeDelete(g_cardSheet);
            g_cardSheet = nullptr;
        }
    }
    number.vtbl = VT_CNUMBER;
    numberRelease();
    cardPlaneDestruct(&plane);
}

// @yo2 0x007584d0 slot 4: the card shown (its ATK / DEF for the mat numbers)
void CCard::setCard(int32_t id) {
    cardId = id;
    cardPlaneSetCard(&plane, id);
    if (id > 0) {
        atk = cardAtk(cardPropId(id));
        def = cardDef(cardPropId(id));
    }
}

// @yo2 0x00758210 start moving to `newCode`. Monster zones 1..4 fold into zone 0 and spell zones 6..9 into
// zone 5 (index = zone % 5); returns zone / 5 for those, else the zone.
int32_t CCard::moveTo(const uint16_t* newCode) {
    fx = x;
    fy = y;
    prevCode = code;
    pinned = 0;
    uint16_t v = *newCode;
    anim = 0;
    code = v;
    uint32_t z = v >> 1 & 0x1fu;
    switch (z) {
    case 1: case 2: case 3: case 4:
        code = (uint16_t)((z % 5) << 6 | (v & 0xc001u));
        return (int32_t)(z / 5);
    case 6: case 7: case 8: case 9:
        code = (uint16_t)((z % 5) << 6 | (v & 0xc00bu) | 10u);
        return (int32_t)(z / 5);
    default:
        return (int32_t)z;
    }
}

// @yo2 0x007582f0 the sheet the card is drawn from: its own plane once half flipped, else the shared one
CSpriteElmOlder* cardSprite(CCard* c) {
    CardPlane* pl = c->flip >= 0x80 ? &c->plane : static_cast<CardPlane*>(g_cardPlane);
    int32_t deg = c->rot / 0x80 * 90;
    if ((c->code & 0x3e) != ZONE_HAND << 1) return cardPlaneField(pl, deg, -1);
    if (g_netDuel->state & ND_SPECTATOR) return cardPlaneHandBig(pl, deg);
    return cardPlaneHandMini(pl, deg);
}

// @yo2 0x007583d0 put the card at its code's place at once
void CCard::snap() {
    int32_t px, py;
    matPos(code & 1u, (code & 0x3eu) >> 1, code >> 6 & 0xffu, &px, &py);
    x = px;
    fx = px;
    y = py;
    fy = py;
    rot = cardRotation(code, upright, g_eng.viewer);
    anim = 0x100;
    prevCode = code;
    flip = (int32_t)(((code & 0x4000u) >> 14) << 8);
}

void CCard::update() { step(); }

// @yo2 0x0076a100 hold the card at (px, py) (the list windows place their cards by hand)
void CCard::pin(int32_t px, int32_t py) {
    fx = px;
    x = px;
    pinned = 1;
    tx = px;
    ty = py;
    fy = py;
    y = py;
}

// @yo2 0x00758540 slot 2: one frame
int32_t CCard::step() {
    if (!pinned) matPos(code & 1u, (code & 0x3eu) >> 1, code >> 6 & 0xffu, &tx, &ty);
    if (anim == 0x100) {
        x = tx;
        prevCode = code;
        y = ty;
        rot = cardRotation(code, upright, g_eng.viewer);
        if (flash > 0 && flash < 8 && (flashLevel -= 0x10) == 0) {
            flash = 0;
            flashLevel = 0;
        }
    } else {
        int32_t a = anim + 0x20;
        int done = 0;
        anim = a;
        int32_t ratio = (g_miniH << 16) / (g_cardW / 2);
        bool wasHand = (prevCode & 0x3e) == ZONE_HAND << 1, isHand = (code & 0x3e) == ZONE_HAND << 1;
        if (wasHand == isHand) {
            scale = 0x10000;
            done = 1;
        } else if (isHand) {
            scale = (0x10000 - ratio) * a / 256 + ratio;
        } else {
            scale = (ratio - 0x10000) * a / 256 + 0x10000;
        }
        uint32_t r0 = (uint32_t)cardRotation(prevCode, false, g_eng.viewer);
        uint32_t r1 = (uint32_t)cardRotation(code, false, g_eng.viewer);
        if (upright) r1 = r0 = 0;
        if ((r1 ^ r0) == 0) {
            rot = (int32_t)r1;
            done++;
        } else if ((r1 ^ r0) == 0x100) {
            rot = (int32_t)((r0 + (uint32_t)a) & 0x1ff);
        } else if (((r1 - r0) & 0x1ff) < 0x101) {
            rot = (int32_t)(((uint32_t)(a / 2) + r0) & 0x1ff);
        } else {
            rot = (int32_t)((r0 - (uint32_t)(a / 2)) & 0x1ff);
        }
        if (((prevCode ^ code) & 0x4000) == 0) {
            done++;
            flip = (int32_t)((code >> 14 & 1u) << 8);
        } else if ((code & 0x4000) == 0) {
            flip = 0x100 - a;
        } else {
            flip = a;
        }
        if (fx == tx && fy == ty) {
            x = tx;
            done++;
            y = ty;
        } else {
            uint32_t k = (uint32_t)(a / 2 - 0x80) & 0x1ff;
            x = ((tx - fx) * g_sinTable[k] >> 16) + fx;
            y = ((ty - fy) * g_sinTable[k] >> 16) + fy;
        }
        if (done == 4) anim = 0x100;
    }
    int32_t t = tick + 1;
    tick = t % 0xc0;
    return t / 0xc0;
}

// @yo2 0x007588b0 slot 5: (mx, my) on the settled, unflashed card (half size in the hand)
bool CCard::hit(int32_t mx, int32_t my) const {
    if (anim != 0x100 || flash != 0) return false;
    int32_t w, h;
    spriteSize(cardSprite(const_cast<CCard*>(this)), &w, &h);
    if ((code & 0x3e) == ZONE_HAND << 1) {
        w /= 2;
        h /= 2;
    }
    return x - w / 2 <= mx && mx < x + w / 2 && y - h / 2 <= my && my < y + h / 2;
}

// ---------------------------------------------------------------- drawing

namespace {
const int32_t kCentreX = 0x200;   // DAT_00bed658: where a card turning over in the hand swings toward

bool handCode(uint16_t c) { return (c & 0x3e) == ZONE_HAND << 1; }
// sheet i of duel/card/card.txt and the width of one of its frames
CSpriteElmOlder* cardCell(int32_t i, int32_t* w, int32_t* h) {
    CSpriteElmOlder* s = planeSprite(g_cardSheet, i);
    spriteSize(s, w, h);
    *w /= planeFrames(g_cardSheet, i);
    return s;
}
// A mini card picture (data/mini, sheet `pic`) at half the mini size
void drawMini(int32_t pic, int32_t x, int32_t y, float z) {
    const int32_t size[2] = {g_miniW / 2, g_miniH / 2};
    planeEnsure(g_cardListMini, pic);
    spriteSetZ(planeSprite(g_cardListMini, pic), z + 1.0f);
    planeEnsure(g_cardListMini, pic);
    spriteDrawPlain(planeSprite(g_cardListMini, pic), x, y, nullptr, size, 0);
}
}   // namespace

void CCard::useNumberSheet(int32_t i) {
    number.sheet = planeSprite(g_numberSheet, i);
    int32_t f = planeFrames(g_numberSheet, i);
    number.frames = f ? f : 10;
}

// @yo2 0x00758990 slot 3: the card (turning over, moving, settled with its highlight and owner mark), then its
// ATK / DEF and badges
void CCard::draw() {
    if (!drawNow) return;
    int32_t px = x, py = y, w, h;
    float zf = (float)(z ? z : order_);
    bool inHand = handCode(code), small = inHand || handCode(prevCode);
    uint32_t viewer = g_eng.viewer;
    if (flash == 5) {   // turning over: it grows and fades on the mat, swings out of the hand
        CSpriteElmOlder* s = cardSprite(this);
        spriteSetZ(s, zf);
        spriteSize(s, &w, &h);
        if (!inHand) {
            int32_t sc = (g_sinTable[(flashLevel / 2 - 0x80) & 0x1ff] >> 1) + 0x10000;
            int32_t c = g_sinTable[flashLevel & 0x1ff];
            spriteDrawRot(s, px, py, rot, sc, sc, c < 0 ? 0 : c >> 8);
            return;
        }
        int32_t c = g_sinTable[(flashLevel / 2 - 0x80) & 0x1ff];
        bool opp = (code & 1u) == (viewer ^ 1u);
        px += (kCentreX - px) * c * 2 >> 16;
        py += (opp ? -1 : 1) * c * h >> 16;
        if (opp) {
            spriteDrawDeg(s, px - w / 2, py - h / 2, 180);
        } else {
            spriteDrawPlain(s, px - w / 2, py - h / 2, nullptr, nullptr, 0);
        }
        if (flashLevel == 0x100) setCard(g_eng.uid[cardUid(g_eng.pl[code & 1u].hand[codeIndex(code)])].propIndex);
        return;
    }
    if (anim != 0x100) {   // moving: the unturned cell, turned, flipped (narrowed) and scaled by the blit
        CardPlane* pl = flip < 0x80 ? static_cast<CardPlane*>(g_cardPlane) : &plane;
        CSpriteElmOlder* s = small ? cardPlaneHandMini(pl, 0) : cardPlaneField(pl, 0, -1);
        spriteSetZ(s, zf);
        int32_t f = flip > 0x80 ? 0x100 - flip : flip;
        if (scale == 0x10000 && rot == 0 && (flip & 0xff) == 0) {
            spriteSize(s, &w, &h);
            if (!small) {
                spriteDrawPlain(s, px - w / 2, py - h / 2, nullptr, nullptr, 0);
            } else {
                spriteDrawRotHalf(s, px, py, 0, 0x10000, 0x10000);
            }
            return;
        }
        int32_t c = g_sinTable[f & 0x1ff];
        if (!small) {
            spriteDrawRotHalf(s, px, py, rot, MulDiv(scale, c, 0x10000) << 1, scale * 2);
        } else {
            spriteDrawRotHalf(s, px, py, rot, MulDiv(scale, c, 0x10000), scale);
        }
        return;
    }
    if (flash == 2) {   // shaking
        int32_t d = flashLevel / 32;
        if (d & 1) d = -d;
        px += d / 2;
    }
    CSpriteElmOlder* s = cardSprite(this);
    spriteSetZ(s, zf);
    spriteSize(s, &w, &h);
    int32_t deg = rot / 0x80 * 90;
    if (inHand) {
        spriteDrawDegScale(s, px - w / 2, py - h / 2, deg, 0.5f);
        w /= 2;
        h /= 2;
    } else {
        spriteDrawDegScale(s, px - w / 2, py - h / 2, deg, 1.0f);
    }
    bool blink = flash == 1 && (flashLevel / 32 & 1);
    if (g_cardHover == this || blink) {
        bool lit = false;
        if (g_cardHoverSet || blink) {   // the card again, faint and added on top
            spriteSetZ(s, zf + 2.0f);
            if (small) {
                float a = 0.0f;
                int32_t hx = px - w / 2, hy = py - h / 2;
                if (code & 1u) {
                    a = 180.0f;
                    hx += w;
                    hy += h;
                }
                spriteDrawTurned(s, hx, hy, 0x40, nullptr, 0.5f, a, 0, 0);
            } else {
                spriteSize(s, &w, &h);
                float a = (float)(prevCode >> 15) * 90.0f + ((code & 1u) ? 180.0f : 0.0f);
                spriteDrawTurned(s, px - w / 2, py - h / 2, 0x40, nullptr, 1.0f, a, w >> 1, h >> 1);
            }
            lit = true;
        }
        // the frame: in the hand or not, and whose card it is (a card of this side or a face-up one shows its real
        // owner)
        uint32_t own = code & 1u;
        bool opp = own == (viewer ^ 1u);
        if ((own == viewer || (code & CODE_FACEUP)) && (code & 0x3e) < 0x20) {
            opp = (*engWordAt(own, (int)codeZone(code), (int)codeIndex(code)) >> 14 & 1u) == (viewer ^ 1u);
        }
        CSpriteElmOlder* m = planeSprite(g_cardSheet, (int32_t)inHand + (int32_t)opp * 2);
        spriteSetZ(m, zf + 1.0f);
        if (lit) {
            int32_t mw, mh;
            spriteSize(m, &mw, &mh);
            if (code & CODE_DEFENSE) {
                spriteDrawDeg(m, px - mw / 2, py - mh / 2, 90);
            } else {
                spriteDrawOpaque(m, px - mw / 2, py - mh / 2, nullptr, nullptr, 0);
            }
        }
    } else if (ndInput() && g_eng.inputClass != 0 && g_eng.inputClass != 2 && inHand &&
               (ndHandMask((int)(code & 1u), (int)codeIndex(code), 0) & 0x1fff)) {   // a hand card that can be used
        float a = 0.0f;
        int32_t ph = tick * 3 % 0xc0;
        int32_t hx = px - w / 2, hy = py - h / 2;
        if (code & 1u) {
            hx += w;
            hy += h;
            a = 180.0f;
        }
        if (ph > 0x60) ph = 0x60 - ph % 0x60;
        spriteSetZ(s, zf + 2.0f);
        spriteDrawTurned(s, hx, hy, (ph + 100) & 0xff, nullptr, 0.5f, a, 0, 0);
    }
    drawStats();
}

// @yo2 0x00759430 a monster's ATK / DEF (easing toward the engine's, coloured up / down against the base values,
// with arrows while they change), then the badges of a face-up card on the field
void CCard::drawStats() {
    float zf = (float)order_ + 1.0f;
    uint32_t own = code & 1u;
    int32_t slot = (int32_t)(codeIndex(code) + codeZone(code));
    if (slot > 10) {
        int32_t id = cardPropId(cardId);
        atk = cardAtk(id);
        def = cardDef(id);
        return;
    }
    do {
        if ((code & 0x3e) != 0 || (own != g_eng.viewer && !(code & CODE_FACEUP))) {
            int32_t id = cardPropId(cardId);
            atk = cardAtk(id);
            def = cardDef(id);
            break;
        }
        if ((g_netDuel->state & ND_SPECTATOR) && !(code & CODE_FACEUP)) break;
        EngStats st;
        engStatsOf2(own, slot, &st);
        if (engCardText(own, (int)codeIndex(code)) != st.card || st.card < 1) break;
        int32_t dAtk = st.atk - atk, dDef = st.def - def;
        atk = st.atk + (atk - st.atk) * 7 / 8;
        def = st.def + (def - st.def) * 7 / 8;
        useNumberSheet(1);
        int32_t dw = number.digitW(), nh = number.height();
        int32_t ny = y + ((own != (g_eng.viewer ^ 1u)) ? 0x2e : -0x2e) - nh / 2;
        useNumberSheet(st.baseDef < def ? 2 : def < st.baseDef ? 3 : 1);
        int32_t k = dw * 5 / 2;
        int32_t xr = dw / 2 + k + x;
        number.drawAlpha(number.width(def, false, 0) / 2 + xr, ny, def, (code & CODE_DEFENSE) ? 0x100 : 0xa0, false, 0);
        auto arrow = [&](int32_t d, int32_t ax) {   // up (sheets 10 / 11) or down (12 / 13), bobbing
            if (d == 0) return;
            int32_t i = (int32_t)(g_appTick >> 2 & 1u) + (d > 0 ? 10 : 12);
            spriteSetZ(planeSprite(g_cardSheet, i), zf);
            int32_t bob = (int32_t)(g_appTick >> 1 & 3u);
            spriteDrawAnchored(planeSprite(g_cardSheet, i), ax, d > 0 ? ny - bob - 7 : bob - 9 + ny, 0, 0xff);
        };
        arrow(dDef, xr);
        arrow(dDef, xr);   // twice, as in the exe
        useNumberSheet(1);
        number.glyphRect(dw / 2 + x, ny, 10, 0xa0, 0);   // the '/'
        useNumberSheet(st.baseAtk < atk ? 2 : atk < st.baseAtk ? 3 : 1);
        int32_t xl = x - dw / 2 - k;
        number.drawAlpha(number.width(atk, false, 0) / 2 + xl, ny, atk, (code & CODE_DEFENSE) ? 0xa0 : 0x100, false, 0);
        arrow(dAtk, xl);
    } while (false);
    if ((code & CODE_FACEUP) && (code & 0x3e) <= 0x14) {
        drawMarks();
        drawLock();
        drawCounterRoom();
        drawCounters();
    }
}

// @yo2 0x0075a030 what changed on the card: the equipped card (monsters), the declared card (0x1368 / 0x1b67), a
// spell / trap mark (key 0x1c40), and the race / attribute icons the card has now (its own first only when changed)
void CCard::drawMarks() {
    int32_t races[5] = {}, attrs[5] = {};
    int32_t id = cardPropId(cardId);
    float zf = (float)order_;
    uint32_t own = code & 1u;
    int32_t slot = (int32_t)(codeIndex(code) + codeZone(code));
    const EngSlot& es = g_eng.pl[own].slot[slot];
    if ((code & 0x3e) < 10) {   // a monster zone
        int32_t equip = (int32_t)engSlotKeyValue(own, slot, 0x1a74);
        EngStats st;
        engStatsOf2(own, slot, &st);
        races[0] = st.race;
        attrs[0] = st.attr;
        if (id == 0x14cc) {
            races[1] = (int32_t)es.value;
        } else if (id == 0x197d) {
            attrs[1] = (int32_t)es.value;
        } else if (id == 0x19c2) {
            int32_t* o = attrs + 1;
            for (int32_t i = 0; i < 7; i++) {
                if (es.value & 1u << i) *o++ = i;
            }
        }
        if (equip >= 1) {
            int32_t pic = (int32_t)engSlotKeyValue(own, slot, 0xfa5);
            if (pic == -1) pic = cardPropIndex(equip);
            drawMini(pic, x, y, zf);
        }
    } else {
        switch (id) {
        case 0x14d1: case 0x1357: case 0x1358:
            races[0] = (int32_t)es.value;
            break;
        case 0x145b: case 0x171f: case 0x1a19:
            attrs[0] = (int32_t)es.value;
            break;
        case 0x1368: case 0x1b67:
            if (es.value != 0) drawMini(cardPropIndex((int)es.value), x, y, zf);
            break;
        }
        if (engSlotHasKey(own, slot, 0x1c40)) drawMini(cardPropIndex(0x1c41 - (int)cardIsSpell(id)), x - g_miniW / 2, y, zf);
    }
    int32_t dir = (own == (g_eng.viewer ^ 1u)) ? -1 : 1;
    int32_t half = g_miniH * dir / 2, xoff = g_miniW * dir;
    int32_t iy = y - half;
    for (int32_t i = 0, n = 0; i < 5; i++) {   // races, sheet 5, down the left edge
        int32_t r = races[i];
        if (r == 0 || r >= 0x17 || (r == cardRace(id) && i <= 0)) continue;
        int32_t w, h;
        CSpriteElmOlder* s = cardCell(5, &w, &h);
        const int32_t src[4] = {(r - 1) * w, 0, r * w, h};
        if (n != 0 || i > 0) iy += dir == 1 ? h : -h;
        n++;
        planeSetZ(g_cardSheet, 5, zf + 1.0f);
        spriteDrawOpaque2(s, x - xoff / 2 - w / 2, iy - h / 2, src, nullptr, 0);
    }
    iy = y - half;
    for (int32_t i = 0, n = 0; i < 5; i++) {   // attributes, sheet 4, down the right edge
        int32_t a = attrs[i];
        if (a == 0 || a >= 8 || (a == cardAttr(id) && i <= 0)) continue;
        int32_t w, h;
        CSpriteElmOlder* s = cardCell(4, &w, &h);
        const int32_t src[4] = {(a - 1) * w, 0, a * w, h};
        if (n != 0 || i > 0) iy += dir == 1 ? h : -h;
        n++;
        planeSetZ(g_cardSheet, 4, zf + 2.0f);
        spriteDrawOpaque2(s, xoff / 2 + x - w / 2, iy - h / 2, src, nullptr, 0);
    }
}

namespace {
// The pop of a badge (sheet 7 or 9 of card.txt) as flashLevel runs past 0x100
void drawBadgePop(int32_t sheet, int32_t t, int32_t x, int32_t y, float z) {
    int32_t w, h;
    CSpriteElmOlder* s = cardCell(sheet, &w, &h);
    int32_t f = -t >> 4 & 7;
    const int32_t src[4] = {f * w, 0, (f + 1) * w, h};
    spriteSetZ(s, z);
    spriteDrawOpaque2(s, x - w / 2, y - h / 2, src, nullptr, 0);
}
int32_t badgeY(const CCard* c) {   // the edge of the card toward the viewer's side of it
    return ((c->code & 1u) == (g_eng.viewer ^ 1u) ? -1 : 1) * (g_miniH / 2 - 5) + c->y;
}
}   // namespace

// @yo2 0x0075ac50 the counter-room badge (sheet 6) with its count (-1: the turns the card has been out)
void CCard::drawCounterRoom() {
    uint32_t own = code & 1u;
    int32_t slot = (int32_t)(codeIndex(code) + codeZone(code));
    float zf = (float)order_;
    int32_t n = engCounterRoom(own, slot);
    int32_t by = badgeY(this);
    if (n <= 0 && flash != 3) return;
    int32_t w, h;
    CSpriteElmOlder* s = cardCell(6, &w, &h);
    int32_t f = flash == 3 && flashLevel < 0x100 ? flashLevel / 64 + 2 : (int32_t)((g_appTick >> 4) % 3u);
    const int32_t src[4] = {f * w, 0, (f + 1) * w, h};
    int32_t bx = x - g_miniW / 2;
    float bz = zf + 10.0f;
    spriteSetZ(s, bz);
    spriteDrawOpaque2(s, bx, by - (h + 1) / 2, src, nullptr, 0);
    bx += w;
    if (n == -1) n = engTurnCount(engCardAt(own, slot));
    useNumberSheet(8);
    number.z = bz;
    number.drawCentred(bx + 6, by, n, false, 0);
    if (flash == 3 && flashLevel > 0xff) drawBadgePop(7, flashLevel, bx + 6, by, zf + 12.0f);
}

// @yo2 0x0075b120 a monster's lock badge (sheet 8) with its number
void CCard::drawLock() {
    if ((code & 0x3e) >= 10) return;
    uint32_t own = code & 1u;
    int32_t n = (int32_t)engSlotMinLock(own, (int32_t)(codeIndex(code) + codeZone(code)));
    float zf = (float)order_;
    int32_t by = badgeY(this);
    if (n == 0 && flash != 4) return;
    int32_t w, h;
    CSpriteElmOlder* s = cardCell(8, &w, &h);
    int32_t f = flash == 4 && flashLevel < 0x100 ? flashLevel / 64 : 0;
    const int32_t src[4] = {f * w, 0, (f + 1) * w, h};
    int32_t bx = g_miniW / 2 - 3 + x;
    float bz = zf + 10.0f;
    spriteSetZ(s, bz);
    spriteDrawOpaque2(s, bx - w - 8, by - h / 2, src, nullptr, 0);
    useNumberSheet(8);
    number.z = bz;
    number.draw(bx, by - number.height() / 2, n, false, 0);
    if (flash == 4 && flashLevel > 0xff) drawBadgePop(9, flashLevel, bx - 4, by, zf + 12.0f);
}

// @yo2 0x0075b5c0 the counters on the card (23 kinds, a row each on sheet 14), stacked from the badge row inward
void CCard::drawCounters() {
    static const int32_t kRow[0x17] = {1, 2, 5, 8, 18, 10, 11, 12, 13, 14, 15, 16, 17, 17, 17, 0, 3, 4, 6, 7, 9, 17,
                                       17};   // DAT_00bebb4c
    uint32_t own = code & 1u;
    int32_t slot = (int32_t)(codeIndex(code) + codeZone(code));
    float zf = (float)order_ + 3.0f;
    int32_t off = 0;
    for (int32_t k = 0; k < 0x17; k++) {
        int32_t n = (int32_t)engCounters(own, slot, k);
        if (k == 0 && engCounterRoom(own, slot) > 0) off += 0x10;
        if (n == 0 && k != v54) continue;
        int32_t row = kRow[k];
        int32_t by = ((own == (g_eng.viewer ^ 1u)) ? -1 : 1) * (g_miniH / 2 - off - 5) + y;
        if (n == 0 && flash != 6 && flash != 7) continue;
        int32_t w, h;
        CSpriteElmOlder* s = cardCell(14, &w, &h);
        h /= 0x14;
        int32_t f = (flash == 6 || flash == 7) ? flashLevel / 64 : 0;
        if (k != v54) f = 0;
        const int32_t src[4] = {f * w, h * row, (f + 1) * w, (row + 1) * h};
        int32_t bx = x - g_miniW / 2;
        spriteSetZ(s, zf);
        spriteDrawOpaque2(s, bx, by - (h + 1) / 2, src, nullptr, 0);
        bx += w;
        useNumberSheet(8);
        number.z = zf + 10.0f;
        number.drawCentred(bx + 6, by, n, false, 0);
        if (k == v54) {
            if (flash == 6 && flashLevel > 0xff) {
                drawBadgePop(7, flashLevel, bx + 6, by, zf);
            } else if (flash == 7 && flashLevel >= 0x100) {
                drawBadgePop(9, flashLevel, bx + 6, by, zf);
            }
        }
        off += 0x10;
    }
}

}   // namespace ds
