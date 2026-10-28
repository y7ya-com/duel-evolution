// yo2TextElm.cpp: CTextElm, the element that draws text (a CD3DTextSprite, plus a second one for ruby), and
// CTextTextureManager, a glyph-cell cache over shared texture pages that nothing in the shipped exe constructs.
#pragma once
#include <cstdint>
#include <string>
#include <string_view>

#include "CD3DTextTexture.h"
#include "yo2Element.h"

// WideCharToMultiByte for one code page (platform: an embedded CP932/CP949 table; tests: ASCII). Defined by the
// build that links System.
std::string yo2Utf16ToCodePage(uint32_t codePage, std::u16string_view s);

// 0x635090: text in the game's ANSI code page (g_textCodePage).
vc6::string narrowText(const vc6::wstring& s);

class CTextElm : public CElement {
public:
    CTextElm();
    ~CTextElm() override;
    static CTextElm* newChild(CTask* parent, uint32_t priority);

    int32_t receive(CTaskMessage* msg) override;
    void draw(int32_t arg) override;
    bool onInit() override;

    void setText(const vc6::wstring& text);
    const vc6::wstring& text() const;

    CD3DTextSprite& sprite() { return sprite_; }
    CD3DTextSprite& rubySprite() { return ruby_; }

private:
    struct Layout;
    CD3DTextSprite sprite_;   // 0x340
    CD3DTextSprite ruby_;     // 0x544 the furigana, when the text has "$R...(...)"

public:
    bool wrap_ = false;       // 0x748 draw wrapped lines in rect_'s size (else the raw text)
    int32_t align_ = 0;       // 0x74c CTextLayout::Align
    int32_t firstLine_ = 0;   // 0x750
    int32_t lineCount_ = 100; // 0x754
    bool showText_ = true;    // 0x758

private:
    [[maybe_unused]] uint32_t unk75c_ = 0;  // 0x75c (the exe's size is 0x760)
};
YO2_SIZEOF(CTextElm, 0x760);

// A glyph-cell cache: cells keyed by (character, two font words), allocated left to right, row by row in 256x256
// pages. Dead code in the shipped exe (no constructor call); reserveTexture() even treats success as failure.
struct GlyphKey {
    int16_t code;      // 0x00
    int32_t unk4;      // 0x04
    uint32_t unk8;     // 0x08
    bool operator<(const GlyphKey& o) const;
};
struct GlyphCell {
    int32_t unk[6];
};

class CTextTextureManager {
public:
    CTextTextureManager();
    ~CTextTextureManager();
    CTextTextureManager(const CTextTextureManager&) = delete;
    CTextTextureManager& operator=(const CTextTextureManager&) = delete;

    bool reserveTexture();
    void allocate(int32_t out[4], int32_t size);
    void clear();
    size_t pageCount() const { return pages_.size(); }
    vc6::map<GlyphKey, GlyphCell>& cells() { return cells_; }

private:
    struct Layout;
    // @yo2 0x00635550 map<GlyphKey, GlyphCell>::~map
    // @yo2 0x00636380 map<GlyphKey, GlyphCell>::erase(iterator)
    // @yo2 0x00636900 map<GlyphKey, GlyphCell>::_Insert
    // @yo2 0x00636d70 construct<pair<const GlyphKey, GlyphCell>>
    vc6::map<GlyphKey, GlyphCell> cells_;       // 0x00
    vc6::vector<IDirect3DTexture8*> pages_;     // 0x10
    CGlyphOutline outline_;                     // 0x20
    int32_t cursorX_ = 0;                       // 0xd0
    int32_t cursorY_ = 0;                       // 0xd4
    int32_t unkD8_ = 0;                         // 0xd8 handed out with each cell, never set
    int32_t unkDC_ = 0;                         // 0xdc
    int32_t rowHeight_ = 0;                     // 0xe0
};
YO2_SIZEOF(CTextTextureManager, 0xe4);
