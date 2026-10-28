#include "CGlyphOutline.h"

#include <cstring>

#include "yo2SystemConfig.h"

// @yo2 0x005948f0 CGlyphOutline::CGlyphOutline: the configured UI font for the current language, 0 height
CGlyphOutline::CGlyphOutline() : mat2_{0x10000, 0, 0, 0x10000} {
    int32_t lang = systemConfig()->language();
    lf_.charSet = lang == 0 ? 0x80 : lang == 6 ? 0x81 : 1;  // SHIFTJIS, HANGUL, DEFAULT
    lf_.pitchAndFamily = 0x30;                               // FF_MODERN
    vc6::string face = systemConfig()->fontName();
    std::strncpy(lf_.faceName, face.c_str(), sizeof lf_.faceName - 1);  // the exe strcpys
    font_ = yo2FontCreate(lf_, &tm_);
}

// @yo2 0x00594ad0 CGlyphOutline::~CGlyphOutline
// @yo2 0x00594aa0 CGlyphOutline deleting destructor
CGlyphOutline::~CGlyphOutline() { yo2FontDestroy(font_); }

// @yo2 0x00594b10 CGlyphOutline::recreateFont: rebuild from lf_ (after callers edited it)
void CGlyphOutline::recreateFont() {
    yo2FontDestroy(font_);
    font_ = yo2FontCreate(lf_, &tm_);
    dirty_ = false;
}

// @yo2 0x00594c10 CGlyphOutline::glyphSize: fills the metrics, returns the bitmap's byte size
uint32_t CGlyphOutline::glyphSize(uint32_t ch) {
    if (dirty_)
        recreateFont();
    return yo2GlyphOutline(font_, ch, format_, &gm_, 0, nullptr);
}

// @yo2 0x00594c60 CGlyphOutline::glyph: the coverage bitmap into buf
uint32_t CGlyphOutline::glyph(uint32_t ch, uint32_t size, void* buf) {
    return yo2GlyphOutline(font_, ch, format_, &gm_, size, buf);
}

// @yo2 0x00594ca0 CGlyphOutline::levelScale: coverage level -> 0..255 alpha (255/5, 255/17, 255/65)
float CGlyphOutline::levelScale() const {
    switch (format_) {
    case GGO_GRAY2:
        return 51.0f;
    case GGO_GRAY4:
        return 15.0f;
    case GGO_GRAY8:
        return 3.923076868057251f;
    default:
        return -1.0f;
    }
}
