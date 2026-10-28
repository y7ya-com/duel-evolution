// CD3DTextTexture.cpp: text drawn as textured quads.
//
// CD3DTextTexture renders a UTF-16 string into 256x256 A8R8G8B8 "pages": a tag converter (ITagConverter) turns the
// text into per-character records (character, colour, special records), and each character's glyph bitmap
// (CGlyphOutline) is copied in at a cursor that moves left to right, row by row, page by page. What comes out is a
// list of quads (one per character: its page, UV rectangle and cell size; '\n' gives a zero-size quad), one strip
// per filled row, and per-'\n' line totals.
//
// CTextLayout word-wraps those quads into lines for a box (CJK-style: break anywhere, but never start a line with
// U+3001/U+3002), and CD3DTextSprite draws them: either the raw quads in order, or the wrapped lines (aligned
// left/centre/right). Ruby (furigana) is written "$Rbase(ruby)": the base sprite lays out the text without the
// parenthesised part, a second sprite (in a smaller font) only the parenthesised part, each spaced to centre on
// the other.
#pragma once
#include <cstdint>
#include <vector>

#include "CD3DSprite.h"
#include "CGlyphOutline.h"
#include "vc6ext.h"
#include "yo2CharRecord.h"

// DAT_00c82ebc / DAT_00c82ec0: the page size (256 x 256).
extern int32_t g_textPageWidth;
extern int32_t g_textPageHeight;
void setTextPageSize(int32_t w, int32_t h);

// The application's tag converter (DAT_0126fa8c + 0x2c), every text texture's default. Defined with the app.
ITagConverter* appTagConverter();

// One character cell in a page (0x28 bytes).
struct TextQuad {
    int32_t code;                 // 0x00 the character; 10 for a line break; -1 = none
    float u0, v0, u1, v1;         // 0x04
    int32_t width, height;        // 0x14 cell size in pixels (advance + 1, the font height)
    int32_t type;                 // 0x1c 1 = a pen-position record (`value` is the new pen x)
    int32_t value;                // 0x20
    IDirect3DTexture8* page;      // 0x24
};
// One filled row of a page, from u 0 to the cursor (0x20 bytes).
struct TextRun {
    int32_t unk0;                 // 0x00 never set
    float u0, v0, u1, v1;         // 0x04
    int32_t width, height;        // 0x14
    IDirect3DTexture8* page;      // 0x1c
};
// Totals per source line (up to each '\n').
struct TextLineInfo {
    int32_t count;   // characters
    int32_t width;   // pixels
    int32_t height;  // font height
};

class CD3DTextTexture {
public:
    CD3DTextTexture();
    virtual ~CD3DTextTexture();
    CD3DTextTexture(const CD3DTextTexture&) = delete;
    CD3DTextTexture& operator=(const CD3DTextTexture&) = delete;

    void setText(const char16_t* text);
    const vc6::wstring& text() const { return text_; }
    int32_t update();
    void clear();

    int32_t quadCount();
    int32_t quad(uint32_t i, TextQuad* out);
    int32_t run(uint32_t i, TextRun* out);
    int32_t line(uint32_t i, TextLineInfo* out);
    int32_t maxLineWidth();
    int32_t totalHeight();
    IDirect3DTexture8* pageAt(uint32_t i);
    size_t pageCount() const { return pages_.size(); }

    void setConverter(ITagConverter* c) { converter_ = c; dirty_ = true; }
    void setConverterOnly(ITagConverter* c) { converter_ = c; }  // without re-rendering
    ITagConverter* nullConverter() { return &nullConverter_; }
    CGlyphOutline& outline() { return outline_; }
    bool antialias() const { return antialias_; }
    void setAntialias(bool on) { antialias_ = on; dirty_ = true; }
    bool dirty() const { return dirty_; }
    void setDirty() { dirty_ = true; }
    int32_t unk120() const { return unk120_; }
    int32_t unk124() const { return unk124_; }

private:
    struct Layout;
    IDirect3DTexture8* page(uint32_t i);
    static void clearPage(IDirect3DTexture8* tex);

    vc6::vector<TextQuad> quads_;              // 0x04
    vc6::vector<TextRun> runs_;                // 0x14
    vc6::vector<TextLineInfo> lines_;          // 0x24
    vc6::vector<IDirect3DTexture8*> pages_;    // 0x34
    vc6::wstring text_;                        // 0x44
    vc6::vector<uint32_t> unk54_;              // 0x54 freed by the destructor, otherwise unused
    ITagConverter* converter_;                 // 0x64
    NullConverter nullConverter_;              // 0x68
    bool dirty_ = true;                        // 0x6c re-render on the next update()
    bool antialias_ = true;                    // 0x6d off: alpha is 0 or 255
    CGlyphOutline outline_;                    // 0x70
    int32_t unk120_ = 0;                       // 0x120 compared with the font height/width by CTextElm::onInit
    int32_t unk124_ = 0;                       // 0x124
    [[maybe_unused]] int32_t unk128_ = 0;                     // 0x128
};
struct CD3DTextTexture::Layout {
    YO2_AT(CD3DTextTexture, quads_, 0x04);
    YO2_AT(CD3DTextTexture, runs_, 0x14);
    YO2_AT(CD3DTextTexture, lines_, 0x24);
    YO2_AT(CD3DTextTexture, pages_, 0x34);
    YO2_AT(CD3DTextTexture, text_, 0x44);
    YO2_AT(CD3DTextTexture, unk54_, 0x54);
    YO2_AT(CD3DTextTexture, converter_, 0x64);
    YO2_AT(CD3DTextTexture, nullConverter_, 0x68);
    YO2_AT(CD3DTextTexture, dirty_, 0x6c);
    YO2_AT(CD3DTextTexture, antialias_, 0x6d);
    YO2_AT(CD3DTextTexture, outline_, 0x70);
    YO2_AT(CD3DTextTexture, unk120_, 0x120);
    YO2_AT(CD3DTextTexture, unk128_, 0x128);
};
YO2_SIZEOF(CD3DTextTexture, 0x12c);

// A placed character of a wrapped line (0x14 bytes).
struct TextGlyph {
    float x, y;       // 0x00 pen position within the box (y: the line's top)
    float drawX;      // 0x08 x plus the line's alignment offset
    int32_t quad;     // 0x0c index into the texture's quads
    uint16_t code;    // 0x10
};
YO2_SIZEOF(TextGlyph, 0x14);

// A wrapped line (0x2c bytes).
struct TextLine {
    int32_t start = 0;      // 0x00 first quad
    int32_t count = 0;      // 0x04 quads (placed glyphs for ruby layouts)
    int32_t width = 0;      // 0x08
    int32_t height = 0;     // 0x0c including the line spacing
    int32_t y = 0;          // 0x10
    float xOffset = 0;      // 0x14 alignment
    bool newline = false;   // 0x18 ended by '\n'
    vc6::objvector<TextGlyph> glyphs;  // 0x1c
};

class CTextLayout {
public:
    enum Align : int32_t { LEFT, CENTER, RIGHT };

    void adjust(float w, float h, int32_t align, CD3DTextTexture* tex, vc6::wstring* out);
    void adjustRuby(float w, float h, int32_t align, CD3DTextTexture* tex, CD3DTextTexture* other,
                    vc6::wstring* out, bool isRuby);
    void relayout(CD3DTextTexture* tex, vc6::wstring* out);
    void relayoutRuby(CD3DTextTexture* tex, CD3DTextTexture* other, vc6::wstring* out, bool isRuby);
    void align(float width, int32_t mode);
    void hitTest(float x, float y, int32_t* col, int32_t* row);
    void caretPos(int32_t col, int32_t row, float* x, float* y);
    void indexAt(int32_t col, int32_t row, int32_t* index);
    void position(int32_t index, int32_t* col, int32_t* row);
    static int32_t rubyMeasure(int32_t start, int32_t which, CD3DTextTexture* a, CD3DTextTexture* b,
                               int32_t mode);

    const std::vector<TextLine>& lines() const { return lines_.vec(); }

    vc6::objvector<TextLine> lines_;  // 0x00
    float lineSpacing_ = 0;           // 0x10 extra pixels between lines
    float width_ = 256;               // 0x14 the box adjust() last used
    float height_ = 9999;             // 0x18
    int32_t align_ = LEFT;            // 0x1c
    bool keepNewlines_ = true;        // 0x20 off: runs of '\n' after a break are swallowed

private:
    const TextLine& lineAt(size_t i) const;
};

class CD3DTextSprite : public CD3DSpriteBasic {
public:
    enum Mode : int32_t { PLAIN, HAS_RUBY, RUBY };

    CD3DTextSprite();
    ~CD3DTextSprite();

    void setText(const char16_t* text);
    void setRubyText(const char16_t* text, CD3DTextTexture* other, bool isRuby);
    void setBounds(float w, float h);

    void drawQuad(float x, float y, int32_t index);
    void drawQuads(float x, float y, int32_t first, int32_t count);
    void drawAt(float x, float y);
    void drawText(const D3DMATRIX* world);
    void drawLine(float x, float y, float alignWidth, int32_t align, int32_t line);
    void drawLayout(float x, float y, float w, float h, int32_t first, int32_t count, int32_t align);
    void drawLines(float x, float y, float w, float h, int32_t firstLine, int32_t lineCount, int32_t align);
    void drawWrapped(const D3DMATRIX* world, float w, float h, int32_t firstLine, int32_t lineCount,
                     int32_t align);

    int32_t textHeight(float width);
    // How many lines the text wraps to at this width (CWindowTaskText::lineCount 0x5af750 inlines it).
    int32_t lineCountAt(float width);
    int32_t linesFitting(int32_t startLine, float height);
    vc6::wstring lineText(int32_t line);
    // @yo2 0x0058bb80 CD3DTextSprite::caretPos (forwards to the layout)
    void caretPos(int32_t col, int32_t row, float* x, float* y) { layout_.caretPos(col, row, x, y); }
    // @yo2 0x0058bbc0 CD3DTextSprite::hitTest (forwards to the layout)
    void hitTest(float x, float y, int32_t* col, int32_t* row) { layout_.hitTest(x, y, col, row); }
    // @yo2 0x0058bc00 CD3DTextSprite::indexAt (forwards to the layout)
    void indexAt(int32_t col, int32_t row, int32_t* index) { layout_.indexAt(col, row, index); }
    // @yo2 0x0058bc30 CD3DTextSprite::position (forwards to the layout)
    void position(int32_t index, int32_t* col, int32_t* row) { layout_.position(index, col, row); }

    CD3DTextTexture& texture() { return tex_; }
    CTextLayout& layout() { return layout_; }
    int32_t mode() const { return mode_; }
    float penX() const { return penX_; }
    float penY() const { return penY_; }
    void setLineGap(float g) { lineGap_ = g; }
    vc6::wstring& wrapped() { return wrapped_; }
    static int32_t& modeOf(CD3DTextTexture* tex);

private:
    friend class CTextElm;
    struct Layout;
    float boundsW_, boundsH_;          // 0x084 setBounds()
    CD3DTextTexture tex_;              // 0x08c
    int32_t mode_ = PLAIN;             // 0x1b8 Mode
    CTextLayout layout_;               // 0x1bc
    float penX_ = 0, penY_ = 0;        // 0x1e0 where drawQuads() ended
    float lineGap_ = 0;                // 0x1e8 drawQuads(): extra pixels per '\n'
    float lastW_ = 0, lastH_ = 0;      // 0x1ec the box drawLayout()/drawLines() last laid out for
    vc6::wstring wrapped_;             // 0x1f4 adjust()'s output (the '\n's it consumed)
};
struct CD3DTextSprite::Layout {
    YO2_AT(CD3DTextSprite, boundsW_, 0x084);
    YO2_AT(CD3DTextSprite, tex_, 0x08c);
    YO2_AT(CD3DTextSprite, mode_, 0x1b8);
    YO2_AT(CD3DTextSprite, layout_, 0x1bc);
    YO2_AT(CD3DTextSprite, penX_, 0x1e0);
    YO2_AT(CD3DTextSprite, lineGap_, 0x1e8);
    YO2_AT(CD3DTextSprite, lastW_, 0x1ec);
    YO2_AT(CD3DTextSprite, wrapped_, 0x1f4);
};
YO2_SIZEOF(CD3DTextSprite, 0x204);
