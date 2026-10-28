// The sprite sheet's drawing wrappers and CNumber (see SceneSprite.h).
#include "SceneSprite.h"

#include "SceneCard.h"

namespace ds {

namespace {
const float kDeg = 0.017453288659453392f;    // DAT_00bed9c0: pi / 180
const float kTurn = 0.01227184385061264f;    // DAT_00bed9c8: pi / 256 (0x200 a turn)
const float k16 = 1.52587890625e-05f;        // DAT_00bed9c4: 2^-16
const float k17 = 7.62939453125e-06f;        // DAT_00bed9cc: 2^-17
int32_t clampAlpha(int32_t a) { return a > 0xff ? 0xff : a < 0 ? 0 : a; }
}   // namespace

// ================================================================ the wrappers

// @yo2 0x007d6790
void spriteDrawOpaque(CSpriteElmOlder* s, int32_t x, int32_t y, const int32_t* src, const int32_t* size,
                      int32_t flags) {
    spriteDraw(s, x, y, 0xff, src, size, flags);
}

// @yo2 0x007d67d0
void spriteDrawOpaque2(CSpriteElmOlder* s, int32_t x, int32_t y, const int32_t* src, const int32_t* size,
                       int32_t flags) {
    spriteDrawOpaque(s, x, y, src, size, flags);
}

// @yo2 0x007d6810
void spriteDrawAlpha(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t alpha, const int32_t* src,
                     const int32_t* size, int32_t flags) {
    if (alpha >= 0xff) {
        spriteDrawOpaque2(s, x, y, src, size, flags);
        return;
    }
    spriteDraw(s, x, y, alpha, src, size, flags);
}

// @yo2 0x007d6880 (three more arguments, unused)
void spriteDrawAnchored(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t anchor, int32_t alpha) {
    int32_t w, h;
    spriteSize(s, &w, &h);
    alpha = clampAlpha(alpha);
    switch (anchor) {
    case 0: spriteDrawAlpha(s, x - (w >> 1), y - (h >> 1), alpha, nullptr, nullptr, 0); break;
    case 1: spriteDrawAlpha(s, x, y, alpha, nullptr, nullptr, 0); break;
    case 2: spriteDrawAlpha(s, x - w, y, alpha, nullptr, nullptr, 0); break;
    case 3: spriteDrawAlpha(s, x, y - h, alpha, nullptr, nullptr, 0); break;
    case 4: spriteDrawAlpha(s, x - w, y - h, alpha, nullptr, nullptr, 0); break;
    }
}

// @yo2 0x007d69f0 (arguments 5 and 6 unused)
void spriteDrawTurned(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t alpha, const int32_t* src, float scale,
                      float deg, int32_t cx, int32_t cy) {
    int32_t sx = 0, sy = 0, w = 0, h = 0;
    if (!src) {
        spriteSize(s, &w, &h);
    } else {
        sx = src[0], sy = src[1];
        w = src[2] - sx, h = src[3] - sy;
    }
    spriteBlit(s, x, y, scale, scale, sx, sy, w, h, cx, cy, alpha & 0xff, deg * kDeg, 3);
}

// @yo2 0x007d6ad0
void spriteDrawPart(CSpriteElmOlder* s, int32_t x, int32_t y, const int32_t* src, int32_t, const int32_t* clip) {
    int32_t sx = 0, sy = 0, w = 0, h = 0;
    if (!src) {
        spriteSize(s, &w, &h);
    } else {
        sx = src[0], sy = src[1];
        w = src[2] - sx, h = src[3] - sy;
    }
    if (clip) {   // the clip rect on screen picks the part of the sheet placed at (x, y)
        sx = clip[0] - x, sy = clip[1] - y;
        w = clip[2] - clip[0], h = clip[3] - clip[1];
        x = clip[0], y = clip[1];
    }
    spriteBlit(s, x, y, 1.0f, 1.0f, sx, sy, w, h, 0, 0, 0xff, 0.0f, 3);
}

// @yo2 0x007d6be0 (arguments 4, 6 and 7 unused)
void spriteDrawRect(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t alpha, const int32_t* r) {
    spriteBlit(s, x, y, 1.0f, 1.0f, r[0], r[1], r[2] - r[0], r[3] - r[1], 0, 0, alpha & 0xff, 0.0f, 2);
}

// @yo2 0x007d6c60
void spriteDrawRot(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t angle, int32_t sx, int32_t sy, int32_t alpha) {
    alpha = clampAlpha(alpha);
    int32_t w = 0, h = 0;
    spriteSize(s, &w, &h);
    spriteBlit(s, x - (w >> 1), y - (h >> 1), (float)sx * k16, (float)sy * k16, 0, 0, w, h, w >> 1, h >> 1, alpha,
               (float)angle * kTurn, 2);
}

// @yo2 0x007d6d40 (argument 6 unused)
void spriteDrawRotHalf(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t angle, int32_t sx, int32_t sy) {
    int32_t w = 0, h = 0;
    spriteSize(s, &w, &h);
    spriteBlit(s, x - (w >> 1), y - (h >> 1), (float)sx * k17, (float)sy * k17, 0, 0, w, h, w >> 1, h >> 1, 0xff,
               (float)angle * kTurn, 2);
}

// @yo2 0x007d6e00
void spriteDrawRotScale(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t angle, float scale) {
    int32_t w = 0, h = 0;
    spriteSize(s, &w, &h);
    spriteBlit(s, x - (w >> 1), y - (h >> 1), scale, scale, 0, 0, w, h, w >> 1, h >> 1, 0xff, (float)angle * kTurn, 2);
}

// @yo2 0x007d6ea0 (argument 4 unused)
void spriteDrawDeg(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t deg) {
    int32_t w = 0, h = 0;
    spriteSize(s, &w, &h);
    spriteBlit(s, x, y, 1.0f, 1.0f, 0, 0, w, h, w >> 1, h >> 1, 0xff, (float)deg * kDeg, 2);
}

// @yo2 0x007d6f40
void spriteDrawPlain(CSpriteElmOlder* s, int32_t x, int32_t y, const int32_t* src, const int32_t* size,
                     int32_t flags) {
    spriteDraw(s, x, y, 0xff, src, size, flags);
}

// @yo2 0x007d6f80
void spriteDrawDegScale(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t deg, float scale) {
    int32_t w = 0, h = 0;
    spriteSize(s, &w, &h);
    spriteBlit(s, x, y, scale, scale, 0, 0, w, h, w >> 1, h >> 1, 0xff, (float)deg * kDeg, 2);
}

// @yo2 0x007d7020
void spriteDrawAlpha2(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t alpha, const int32_t* src,
                      const int32_t* size, int32_t flags) {
    spriteDraw(s, x, y, alpha, src, size, flags);
}

// ================================================================ CNumber
// ponytail: the exe takes the cell rect from FUN_007d86e0 (the sheet's cached {0, 0, w, h}); spriteSize gives the
// same numbers without touching the sheet.

// @yo2 0x007d1d60 a digit's width (the sheet's width / frames; a sheet without frames asserts and counts as one)
int32_t CNumber::digitW() const {
    int32_t w = 0, h = 0;
    spriteSize(sheet, &w, &h);
    return frames ? w / frames : w;
}

// @yo2 0x007d1d20
int32_t CNumber::height() const {
    int32_t w = 0, h = 0;
    spriteSize(sheet, &w, &h);
    return h;
}

// @yo2 0x007d1ee0 the width `v` takes at `step` per digit (0 = the digit width), with its sign when asked
int32_t CNumber::width(int32_t v, bool sign, int32_t step) const {
    if (step == 0) step = digitW();
    int32_t n = 0;
    do {
        n += step;
        v /= 10;
    } while (v != 0);
    if (frames > 11 && sign) n += step;
    return n;
}

// @yo2 0x007d1f50 glyph g, opaque
int32_t CNumber::glyph(int32_t x, int32_t y, int32_t g, int32_t step) {
    int32_t w, h;
    spriteSize(sheet, &w, &h);
    int32_t dw = digitW();
    if (step == 0) step = dw;
    const int32_t src[4] = {dw * g, 0, dw * g + dw, h};
    spriteSetZ(sheet, z);
    spriteDrawOpaque(sheet, x - step, y, src, nullptr, 0);
    return x - step;
}

// @yo2 0x007d1ff0
int32_t CNumber::glyphAlpha(int32_t x, int32_t y, int32_t g, int32_t alpha, int32_t step) {
    if (alpha > 0xff) return glyph(x, y, g, step);
    int32_t w, h;
    spriteSize(sheet, &w, &h);
    int32_t dw = digitW();
    if (step == 0) step = dw;
    const int32_t src[4] = {dw * g, 0, dw * g + dw, h};
    spriteSetZ(sheet, z);
    spriteDraw(sheet, x - step, y, alpha, src, nullptr, 0);
    return x - step;
}

// @yo2 0x007d20e0
int32_t CNumber::glyphRect(int32_t x, int32_t y, int32_t g, int32_t alpha, int32_t step) {
    if (alpha > 0xff) return glyph(x, y, g, step);
    int32_t w, h;
    spriteSize(sheet, &w, &h);
    int32_t dw = digitW();
    if (step == 0) step = dw;
    const int32_t src[4] = {dw * g, 0, dw * g + dw, h};
    spriteSetZ(sheet, z);
    spriteDrawRect(sheet, x - step, y, alpha, src);
    return x - step;
}

// @yo2 0x007d21d0 `v` opaque, its sign in front when the sheet has one ('-' always, '+' when asked)
int32_t CNumber::draw(int32_t x, int32_t y, int32_t v, bool sign, int32_t step) {
    int32_t a = v < 0 ? -v : v;
    int32_t w, h;
    spriteSize(sheet, &w, &h);
    int32_t dw = digitW();
    if (step == 0) step = dw;
    int32_t src[4] = {0, 0, 0, h};
    do {
        x -= step;
        src[0] = a % 10 * dw;
        src[2] = src[0] + dw;
        spriteSetZ(sheet, z);
        spriteDrawOpaque(sheet, x, y, src, nullptr, 0);
        a /= 10;
    } while (a != 0);
    if (frames > 11) {
        if (v < 0) {
            src[0] = dw * 11;
        } else {
            if (!sign) return x;
            src[0] = dw * 10;
        }
        x -= step;
        src[2] = src[0] + dw;
        spriteSetZ(sheet, z);
        spriteDrawOpaque(sheet, x, y, src, nullptr, 0);
    }
    return x;
}

// @yo2 0x007d2510 the same at `alpha` (over 0xff: opaque)
int32_t CNumber::drawAlpha(int32_t x, int32_t y, int32_t v, int32_t alpha, bool sign, int32_t step) {
    if (alpha > 0xff) return draw(x, y, v, sign, step);
    int32_t a = v < 0 ? -v : v;
    int32_t w, h;
    spriteSize(sheet, &w, &h);
    int32_t dw = digitW();
    if (step == 0) step = dw;
    int32_t src[4] = {0, 0, 0, h};
    do {
        x -= step;
        src[0] = a % 10 * dw;
        src[2] = src[0] + dw;
        spriteSetZ(sheet, z);
        spriteDrawRect(sheet, x, y, alpha, src);
        a /= 10;
    } while (a != 0);
    if (frames > 11) {
        if (v < 0) {
            src[0] = dw * 11, src[2] = dw * 12;
        } else {
            if (!sign) return x;
            src[0] = dw * 10, src[2] = dw * 11;
        }
        spriteSetZ(sheet, z);
        x -= step;
        spriteDrawRect(sheet, x, y, alpha, src);
    }
    return x;
}

// @yo2 0x007d26f0 centred on (x, y)
void CNumber::drawCentred(int32_t x, int32_t y, int32_t v, bool sign, int32_t step) {
    int32_t wd = width(v, sign, step);
    draw(x + wd / 2, y - height() / 2, v, sign, step);
}

// @yo2 0x007d2770 the digits hop in one after another, rightmost first, as `t` runs 1..0x100 (over 0xff: settled)
int32_t CNumber::drawPop(int32_t x, int32_t y, int32_t v, int32_t t, bool sign, int32_t step) {
    if (t < 1) return x;
    if (t > 0xff) return draw(x, y, v, sign, step);
    int32_t d[10];
    int32_t a = v < 0 ? -v : v, n = 0;
    do {
        d[n++] = a % 10;
        a /= 10;
    } while (a != 0);
    if (frames > 11) {
        if (v < 0) {
            d[n++] = 11;
        } else if (sign) {
            d[n++] = 10;
        }
    }
    int32_t dw = digitW(), dh = height();
    if (step == 0) step = dw;
    int32_t w, h;
    spriteSize(sheet, &w, &h);
    int32_t dt = n < 2 ? 0 : 0x40 / (n - 1);
    int32_t up = t * 2 - 0x80, back = t * 4 - 0x80, tt = t;
    for (int32_t i = 0; i < n; i++) {
        x -= step;
        const int32_t src[4] = {d[i] * dw, 0, d[i] * dw + dw, h};
        if (tt >= 0) {
            int32_t yy;
            spriteSetZ(sheet, z);
            if (tt < 0x80) {
                yy = y - (g_sinTable[up & 0x1ff] * dh >> 16);
            } else if (tt < 0xc0) {
                yy = y - (g_sinTable[back & 0x1ff] * (dh / 4) >> 16);
            } else {
                yy = y;
            }
            spriteDrawOpaque(sheet, x, yy, src, nullptr, 0);
        }
        up -= dt * 2;
        back -= dt * 4;
        tt -= dt;
    }
    return x;
}

}   // namespace ds
