// What a tag converter turns text into for CD3DTextTexture: one record per character (CD3DTextTexture.h has the
// renderer, yo2TagConverter.h the converters). Kept apart so the window factory, which owns the app's converter,
// needn't include the renderer.
#pragma once
#include <cstdint>

#include "CGlyphOutline.h"
#include "vc6.h"

// One character as the tag converter hands it over (76 bytes).
struct CharRecord {
    GdiLogFont font;          // 0x00 (not used by the renderer)
    uint32_t color;           // 0x3c 0x00RRGGBB
    uint16_t code;            // 0x40 the character
    int32_t value;            // 0x44 type 1: the pen x to continue at
    int32_t type;             // 0x48 0 = character, 1 = pen-position record
};
YO2_SIZEOF(CharRecord, 0x4c);

class ITagConverter {
public:
    virtual int32_t convert(const vc6::wstring& text, vc6::vector<CharRecord>& out) = 0;
};

// The converter that knows no tags: one white record per character.
class NullConverter : public ITagConverter {
public:
    int32_t convert(const vc6::wstring& text, vc6::vector<CharRecord>& out) override;
};
