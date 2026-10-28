// The duel's sprite drawing helpers (CSpriteElmOlder's wrappers, 0x007d6790..0x007d7020) and CNumber (0x007d1d20..
// 0x007d26f0), the digit strip the cards' ATK / DEF and counters are drawn with. Everything ends in the sheet's two
// queued blits, spriteBlit (FUN_007d5dc0) and spriteDraw (FUN_007d6310), which stay seams with the sheet itself.
#pragma once
#include "SceneCommon.h"

namespace ds {

// TODO(scene2) FUN_007d5dc0: queue the sheet's (srcX, srcY, w, h) part, scaled by (sx, sy) and turned `angle` radians
// about (cx, cy), with its pivot at (x + cx, y + cy); alpha 0..255; mode 2 (most) or 3
void spriteBlit(CSpriteElmOlder* s, int32_t x, int32_t y, float sx, float sy, int32_t srcX, int32_t srcY, int32_t w,
                int32_t h, int32_t cx, int32_t cy, int32_t alpha, float angle, int32_t mode);

void planeSetZ(PlaneLoader* p, int32_t i, float z);   // TODO(scene2) FUN_007d9050: ensure sheet i, set its z

void spriteDrawOpaque(CSpriteElmOlder* s, int32_t x, int32_t y, const int32_t* src, const int32_t* size,
                      int32_t flags);    // FUN_007d6790 (spriteDraw at alpha 0xff)
void spriteDrawOpaque2(CSpriteElmOlder* s, int32_t x, int32_t y, const int32_t* src, const int32_t* size,
                       int32_t flags);   // FUN_007d67d0
void spriteDrawAlpha(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t alpha, const int32_t* src,
                     const int32_t* size, int32_t flags);   // FUN_007d6810
// FUN_007d6880: (x, y) is the sheet's centre (anchor 0), top left (1), top right (2), bottom left (3), bottom right (4)
void spriteDrawAnchored(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t anchor, int32_t alpha);
// FUN_007d69f0: a part (`src` {x0, y0, x1, y1} or all) scaled and turned `deg` degrees about (cx, cy), mode 3
void spriteDrawTurned(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t alpha, const int32_t* src, float scale,
                      float deg, int32_t cx, int32_t cy);
// FUN_007d6ad0: a part (`src` or all) at (x, y), cut to the `clip` rect {x0, y0, x1, y1} when given
void spriteDrawPart(CSpriteElmOlder* s, int32_t x, int32_t y, const int32_t* src, int32_t flags, const int32_t* clip);
void spriteDrawRect(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t alpha, const int32_t* rect);   // FUN_007d6be0
// FUN_007d6c60: centred on (x, y), turned `angle` (0x200 a turn), scaled (16.16), alpha 0..255
void spriteDrawRot(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t angle, int32_t sx, int32_t sy, int32_t alpha);
// FUN_007d6d40: the same at alpha 0xff with the scale in 15.17 (0x10000 = half size)
void spriteDrawRotHalf(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t angle, int32_t sx, int32_t sy);
void spriteDrawRotScale(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t angle, float scale);   // FUN_007d6e00
// FUN_007d6ea0: top left at (x, y), turned `deg` degrees about its centre
void spriteDrawDeg(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t deg);
void spriteDrawPlain(CSpriteElmOlder* s, int32_t x, int32_t y, const int32_t* src, const int32_t* size,
                     int32_t flags);   // FUN_007d6f40
void spriteDrawDegScale(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t deg, float scale);   // FUN_007d6f80
void spriteDrawAlpha2(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t alpha, const int32_t* src,
                      const int32_t* size, int32_t flags);   // FUN_007d7020

// CNumber (0x10, built inline by its owners): the digits 0..9 of a sheet, then 10 '+' and 11 '-' when the sheet has
// 12+ frames. Numbers are drawn right to left from x; each call returns the x the number begins at.
class CNumber {
public:
    uint32_t vtbl;                    // 0x00
    float z;                          // 0x04 the sheet's depth for every digit
    CSpriteElmOlder* sheet;           // 0x08
    int32_t frames;                   // 0x0c frames across the sheet

    int32_t digitW() const;                                                    // FUN_007d1d60
    int32_t height() const;                                                    // FUN_007d1d20
    int32_t width(int32_t v, bool sign, int32_t step) const;                   // FUN_007d1ee0
    int32_t glyph(int32_t x, int32_t y, int32_t g, int32_t step);              // FUN_007d1f50
    int32_t glyphAlpha(int32_t x, int32_t y, int32_t g, int32_t alpha, int32_t step);   // FUN_007d1ff0
    int32_t glyphRect(int32_t x, int32_t y, int32_t g, int32_t alpha, int32_t step);    // FUN_007d20e0
    int32_t draw(int32_t x, int32_t y, int32_t v, bool sign, int32_t step);    // FUN_007d21d0
    int32_t drawAlpha(int32_t x, int32_t y, int32_t v, int32_t alpha, bool sign, int32_t step);   // FUN_007d2510
    void drawCentred(int32_t x, int32_t y, int32_t v, bool sign, int32_t step);   // FUN_007d26f0
    int32_t drawPop(int32_t x, int32_t y, int32_t v, int32_t t, bool sign, int32_t step);   // FUN_007d2770
};
YO2_AT(CNumber, z, 0x04);
YO2_AT(CNumber, sheet, 0x08);
YO2_AT(CNumber, frames, 0x0c);
YO2_SIZEOF(CNumber, 0x10);

}   // namespace ds
