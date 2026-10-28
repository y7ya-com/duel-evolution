// yo2TagConverter.cpp: the tag converters that turn text into the per-character records CD3DTextTexture draws.
// AtConverter understands "@0".."@9" (switch to that font and colour), "@>N/" (move the pen to x = N) and "@@"
// (a literal '@'); any other "@x" is the two characters. The application's converter (the window factory's) has
// ten styles set up at start-up: see applyWindowTagStyles.
#pragma once
#include <cstdint>
#include <string_view>

#include "yo2CharRecord.h"

// A record with the converters' defaults: a 16-pixel ＭＳ ゴシック (Shift-JIS) font, white, no character.
CharRecord defaultCharRecord();
// Append records: copies, the characters of a narrow (game code page) string, or of a wide one.
void appendRecords(vc6::vector<CharRecord>& out, const vc6::vector<CharRecord>& in);
void appendText(vc6::vector<CharRecord>& out, const vc6::string& text);
void appendText(vc6::vector<CharRecord>& out, const vc6::wstring& text);

class AtConverter : public ITagConverter {
public:
    enum { STYLES = 10 };

    AtConverter() { reset(); }
    int32_t convert(const vc6::wstring& text, vc6::vector<CharRecord>& out) override;

    void reset();
    void setHeight(uint32_t style, int32_t height);
    void setWeight(uint32_t style, int32_t weight);
    void setColor(uint32_t style, uint32_t rgb);
    const GdiLogFont& font(uint32_t style) const { return fonts_[style]; }
    uint32_t color(uint32_t style) const { return colors_[style]; }

private:
    GdiLogFont fonts_[STYLES];  // 0x004
    uint32_t colors_[STYLES];   // 0x25c 0x00RRGGBB
    struct Layout;
};
YO2_SIZEOF(AtConverter, 0x284);

// Every character in one colour (no tags). Nothing in the shipped exe makes one.
class ColorConverter : public ITagConverter {
public:
    int32_t convert(const vc6::wstring& text, vc6::vector<CharRecord>& out) override;
    uint32_t color = 0xffffff;  // 0x04
};

// The styles CApp gives the window factory's converter: @0 black, @1 red and bold 18-pixel, @2 blue, @3 green,
// @4 olive, @5 magenta, @6 cyan, @7 orange, @9 white (@8 keeps the default white).
void applyWindowTagStyles(AtConverter& c);
