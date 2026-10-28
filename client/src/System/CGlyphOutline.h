// CGlyphOutline.cpp: one GDI font and its glyph bitmaps. The text textures (CD3DTextTexture) ask it for a
// character's metrics and its anti-aliased coverage bitmap, in GetGlyphOutline's GGO_GRAY*_BITMAP format (rows
// padded to 4 bytes, GRAY8: 65 levels 0..64), and copy that into their texture pages.
//
// The exe owns a memory DC and an HFONT; the port draws with stb_truetype behind the one seam below, so the DC
// and font fields only hold that seam's handle.
#pragma once
#include <cstdint>

#include "vc6.h"

// LOGFONTA, TEXTMETRICA and GLYPHMETRICS with their Win32 layouts (windows.h is included with NOGDI).
struct GdiLogFont {
    int32_t height = 0;          // 0x00 lfHeight
    int32_t width = 0;           // 0x04
    int32_t escapement = 0;      // 0x08
    int32_t orientation = 0;     // 0x0c
    int32_t weight = 0;          // 0x10
    uint8_t italic = 0;          // 0x14
    uint8_t underline = 0;       // 0x15
    uint8_t strikeOut = 0;       // 0x16
    uint8_t charSet = 0;         // 0x17
    uint8_t outPrecision = 0;    // 0x18
    uint8_t clipPrecision = 0;   // 0x19
    uint8_t quality = 0;         // 0x1a
    uint8_t pitchAndFamily = 0;  // 0x1b
    char faceName[32] = {};      // 0x1c
};
YO2_SIZEOF(GdiLogFont, 0x3c);

struct GdiTextMetric {
    int32_t height, ascent, descent, internalLeading, externalLeading, aveCharWidth, maxCharWidth, weight,
        overhang, digitizedAspectX, digitizedAspectY;
    uint8_t firstChar, lastChar, defaultChar, breakChar, italic, underlined, struckOut, pitchAndFamily, charSet;
};
YO2_SIZEOF(GdiTextMetric, 0x38);

struct GdiGlyphMetrics {
    uint32_t blackBoxX, blackBoxY;  // the bitmap's size
    int32_t originX, originY;       // gmptGlyphOrigin: its top-left relative to the pen on the baseline (y up)
    int16_t cellIncX, cellIncY;     // advance
};
YO2_SIZEOF(GdiGlyphMetrics, 0x14);

enum : uint32_t { GGO_GRAY2 = 4, GGO_GRAY4 = 5, GGO_GRAY8 = 6 };

// ---- the GDI seam (tests: tests/system/stubs.cpp) ----
// Create the font for `lf` and return its metrics: CreateCompatibleDC + CreateFontIndirectA + SelectObject +
// GetTextMetricsA (0x5948f0, 0x594b10). The handle stands for the DC with the font selected.
void* yo2FontCreate(const GdiLogFont& lf, GdiTextMetric* tm);
// SelectObject(old) + DeleteObject + DeleteDC (0x594ad0, 0x594b10).
void yo2FontDestroy(void* font);
// GetGlyphOutlineW(dc, ch, format, gm, size, buf, identity MAT2) (0x594c10, 0x594c60): with size 0 and no buffer
// it only fills `gm` and returns the bitmap's byte size; GDI_ERROR (~0u) if there is no glyph.
uint32_t yo2GlyphOutline(void* font, uint32_t ch, uint32_t format, GdiGlyphMetrics* gm, uint32_t size, void* buf);

class CGlyphOutline {
public:
    CGlyphOutline();
    virtual ~CGlyphOutline();
    CGlyphOutline(const CGlyphOutline&) = delete;
    CGlyphOutline& operator=(const CGlyphOutline&) = delete;

    void recreateFont();
    uint32_t glyphSize(uint32_t ch);
    uint32_t glyph(uint32_t ch, uint32_t size, void* buf);
    float levelScale() const;

    GdiLogFont& font() { return lf_; }
    void setDirty() { dirty_ = true; }
    const GdiGlyphMetrics& metrics() const { return gm_; }
    const GdiTextMetric& textMetric() const { return tm_; }
    uint32_t format() const { return format_; }

private:
    struct Layout;
    GdiLogFont lf_;              // 0x04 what the next recreateFont() builds; callers edit it and set dirty_
    void* font_ = nullptr;       // 0x40 HFONT (the seam's handle)
    [[maybe_unused]] void* oldFont_ = nullptr;  // 0x44 the DC's previous font (unused here)
    GdiGlyphMetrics gm_{};       // 0x48 the last glyph asked for
    [[maybe_unused]] void* dc_ = nullptr;       // 0x5c memory DC (unused here)
    [[maybe_unused]] int32_t mat2_[4];          // 0x60 identity MAT2 (16.16 fixed)
    uint32_t format_ = GGO_GRAY8;  // 0x70
    bool dirty_ = false;         // 0x74 recreate the font before the next glyphSize()
    GdiTextMetric tm_{};         // 0x78
};
struct CGlyphOutline::Layout {
    YO2_AT(CGlyphOutline, lf_, 0x04);
    YO2_AT(CGlyphOutline, font_, 0x40);
    YO2_AT(CGlyphOutline, gm_, 0x48);
    YO2_AT(CGlyphOutline, dc_, 0x5c);
    YO2_AT(CGlyphOutline, mat2_, 0x60);
    YO2_AT(CGlyphOutline, format_, 0x70);
    YO2_AT(CGlyphOutline, dirty_, 0x74);
    YO2_AT(CGlyphOutline, tm_, 0x78);
};
// RTTI's size (0x78) stops before the TEXTMETRIC, which the exe writes at +0x78 all the same.
YO2_SIZEOF(CGlyphOutline, 0xb0);
