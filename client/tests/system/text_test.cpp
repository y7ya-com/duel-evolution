// src/System text: glyphs rendered into text-texture pages (cursor, rows, pages, '\n', alpha), word wrap (width,
// '\n', kinsoku), pen-position records, ruby layout, caret queries, sprite quads per glyph, CTextElm drawing through
// the z-sort queue, the dead glyph-cell manager. Fonts come from the fake GDI in stubs.cpp: 16 px high, every glyph
// a 7 x 12 box advancing 8 (cells 9 wide).
#include <cassert>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "System/yo2TextElm.h"
#include "System/yo2ZSort.h"

struct FakeDraw {
    IDirect3DTexture8* tex;
    std::vector<float> v;
};
extern std::vector<FakeDraw> g_draws;
extern int g_fakeFontsAlive;
extern int g_texturesAlive;

static float vx(const FakeDraw& d, int vert) { return d.v[vert * 6 + 0]; }
static float vy(const FakeDraw& d, int vert) { return d.v[vert * 6 + 1]; }
static uint32_t texel(IDirect3DTexture8* t, int x, int y) {
    uint32_t p;
    std::memcpy(&p, t->shadow.data() + (y * t->level0.w + x) * 4, 4);
    return p;
}

// "A\tB": A, then a pen-position record (x = 50), then B
struct TabConverter : ITagConverter {
    int32_t convert(const vc6::wstring& text, vc6::vector<CharRecord>& out) override {
        out.clear();
        for (size_t i = 0; i < text.size(); ++i) {
            CharRecord r{};
            r.color = 0xffffff;
            if (text[i] == u'\t') {
                r.type = 1;
                r.value = 50;
            } else {
                r.code = text[i];
            }
            out.push_back(r);
        }
        return 0;
    }
};

static void testTexture() {
    CD3DTextTexture t;
    t.setText(u"AB\nC");
    assert(t.dirty() && t.update() == 0 && !t.dirty());
    assert(t.quadCount() == 4 && t.pageCount() == 1);
    TextQuad q;
    assert(t.quad(0, &q) == 0 && q.code == 'A' && q.width == 9 && q.height == 16 && q.u0 == 0 && q.u1 == 9.0f / 256);
    assert(t.quad(2, &q) == 0 && q.code == '\n' && q.width == 0 && q.u0 == 18.0f / 256);
    assert(t.quad(3, &q) == 0 && q.code == 'C' && q.u0 == 18.0f / 256);  // '\n' doesn't move the page cursor
    assert(t.quad(4, &q) == -1);
    TextLineInfo l;
    assert(t.line(0, &l) == 0 && l.count == 2 && l.width == 18 && l.height == 16);
    assert(t.line(1, &l) == 0 && l.count == 1 && l.width == 9 && t.maxLineWidth() == 18 && t.totalHeight() == 32);
    TextRun r;
    assert(t.run(0, &r) == 0 && r.width == 27 && r.u1 == 27.0f / 256 && r.v1 == 16.0f / 256 && t.run(1, &r) == -1);

    // the glyph box lands at ascent - originY = row 1; GRAY8 level 64 -> alpha 251, the record's colour below
    IDirect3DTexture8* page = t.pageAt(0);
    assert(page && texel(page, 0, 1) == 0xfbffffff && texel(page, 6, 12) == 0xfbffffff);
    assert(texel(page, 0, 0) == 0 && texel(page, 7, 1) == 0 && texel(page, 9, 1) == 0xfbffffff);

    // same text: nothing to do; antialias off: alpha is all-or-nothing (and GRAY8 never reaches "all")
    t.setText(u"AB\nC");
    assert(!t.dirty());
    t.setAntialias(false);
    t.update();
    assert(texel(t.pageAt(0), 0, 1) == 0x00ffffff);

    // rows of 28 cells, 16 rows a page: 500 characters take two pages, one run per filled row
    std::u16string many(500, u'x');
    t.setText(many.c_str());
    assert(t.quadCount() == 500 && t.pageCount() == 2);
    assert(t.quad(448, &q) == 0 && q.page == t.pageAt(1) && q.u0 == 0 && q.v0 == 0);
    assert(t.run(15, &r) == 0 && r.page == t.pageAt(0) && t.run(16, &r) == 0 && r.page == t.pageAt(1));

    // a 0x10000+-byte page is refused (the assert is the exe's; we only check the size check exists)
    t.clear();
    assert(t.pageCount() == 0);
}

static std::vector<TextLine> layoutOf(CD3DTextSprite& s, const char16_t* text, float w) {
    s.setText(text);
    s.setBounds(w, 100);
    return s.layout().lines();
}

static void testLayout() {
    CD3DTextSprite s;
    // width: 3 cells fit in 30
    auto lines = layoutOf(s, u"ABCD", 30);
    assert(lines.size() == 2 && lines[0].count == 3 && lines[0].width == 27 && lines[1].start == 3);
    assert(lines[1].y == 16 && lines[1].glyphs[0].x == 0 && lines[1].glyphs[0].y == 16 && lines[1].glyphs[0].quad == 3);
    // '\n' ends a line and is consumed
    lines = layoutOf(s, u"AB\nC", 100);
    assert(lines.size() == 2 && lines[0].newline && lines[0].count == 2 && lines[1].start == 3 && !lines[1].newline);
    // kinsoku: 。 may not start a line, so B moves down with it
    lines = layoutOf(s, u"AB。", 20);
    assert(lines.size() == 2 && lines[0].count == 1 && lines[1].count == 2 && lines[1].glyphs[0].code == 'B');
    assert(s.textHeight(20) == 32);
    assert(s.lineText(1) == std::u16string_view(u"B。") && s.lineText(5).empty());
    // a one-glyph line keeps its glyph rather than rewinding forever
    lines = layoutOf(s, u"A。", 16);
    assert(lines.size() == 2 && lines[0].count == 1 && lines[1].count == 1);

    // alignment, caret queries
    lines = layoutOf(s, u"ABCD", 30);
    s.layout().align(30, CTextLayout::RIGHT);
    assert(s.layout().lines()[1].xOffset == 21 && s.layout().lines()[1].glyphs[0].drawX == 21);
    s.layout().align(30, CTextLayout::CENTER);
    assert(s.layout().lines()[0].xOffset == 1);  // (30 - 27) >> 1
    float x, y;
    s.caretPos(2, 0, &x, &y);
    assert(x == 18 && y == 0);
    s.caretPos(5, 1, &x, &y);
    assert(x == 9 + 10 && y == 16);  // past the end: width + the centring offset
    int32_t col, row, idx;
    s.indexAt(1, 1, &idx);
    assert(idx == 4);
    s.position(4, &col, &row);
    assert(col == 1 && row == 1);
    s.hitTest(25, 20, &col, &row);  // line 1 (y past line 0's middle), right of D's middle
    assert(row == 1 && col == 1);

    // pen-position records: B continues at x = 50
    TabConverter tabs;
    CD3DTextSprite t;
    t.texture().setConverter(&tabs);
    lines = layoutOf(t, u"A\tB", 100);
    assert(lines.size() == 1 && lines[0].glyphs.size() == 2 && lines[0].glyphs[1].x == 50);
}

static void testSpriteDraw() {
    CD3DTextSprite s;
    s.setText(u"Hi\nX");
    g_draws.clear();
    s.drawAt(10, 20);
    assert(g_draws.size() == 3);  // '\n' draws nothing
    assert(vx(g_draws[0], 0) == 10 && vy(g_draws[0], 0) == 20 && vx(g_draws[0], 3) == 19 && vy(g_draws[0], 3) == 36);
    assert(vx(g_draws[1], 0) == 19 && vx(g_draws[2], 0) == 10 && vy(g_draws[2], 0) == 36);
    assert(g_draws[0].v[4] == 0 && g_draws[0].v[6 * 3 + 4] == 9.0f / 256 && g_draws[0].tex == s.texture().pageAt(0));
    assert(s.penX() == 19 && s.penY() == 36);

    // wrapped: drawLines() lays out for the box and draws line by line
    s.setText(u"ABCD");
    g_draws.clear();
    s.drawLines(0, 0, 30, 100, 0, 10, CTextLayout::LEFT);
    assert(g_draws.size() == 4 && vx(g_draws[3], 0) == 0 && vy(g_draws[3], 0) == 16);
    g_draws.clear();
    s.drawLines(0, 0, 30, 100, 1, 10, CTextLayout::RIGHT);  // from line 1: drawn at the top, right-aligned
    assert(g_draws.size() == 1 && vx(g_draws[0], 0) == 21 && vy(g_draws[0], 0) == 0);
    g_draws.clear();
    s.drawLayout(5, 5, 30, 100, 0, 2, 0);  // the first two glyphs only
    assert(g_draws.size() == 2 && vx(g_draws[1], 0) == 14);
    assert(s.linesFitting(0, 10) == 0 && s.linesFitting(0, 100) == 2);
}

static void testRubyAndElement() {
    CZSortSet layers;
    g_zsortSet = &layers;
    CElement* root = CElement::createRoot();
    CTextElm* e = CTextElm::newChild(root, 0);
    assert(e && e->lineCount_ == 100 && e->rect_[2] == 256 && e->drawMode_ == CElement::BLEND_POINT);

    // ruby: the base sprite gets "AB", the 8-pixel ruby sprite "xy", centred over it
    e->setText(u"$RAB(xy)");
    assert(e->sprite().mode() == CD3DTextSprite::HAS_RUBY && e->rubySprite().mode() == CD3DTextSprite::RUBY);
    const auto& base = e->sprite().layout().lines();
    assert(base.size() == 1 && base[0].glyphs.size() == 2 && base[0].glyphs[0].x == 0 && base[0].glyphs[1].x == 9);
    assert(base[0].glyphs[0].y == 8 && base[0].height == 24);  // under the ruby line
    const auto& ruby = e->rubySprite().layout().lines();
    assert(ruby.size() == 1 && ruby[0].glyphs.size() == 2 && ruby[0].glyphs[0].x == 3 && ruby[0].glyphs[1].x == 10);
    assert(ruby[0].glyphs[0].code == 'x');
    assert(CTextLayout::rubyMeasure(0, 0, &e->sprite().texture(), nullptr, 1) == 2);

    // plain text through the z-sort queue: drawn with the element's world matrix
    e->setText(u"Hi");
    assert(e->sprite().mode() == CD3DTextSprite::PLAIN && e->text() == std::u16string_view(u"Hi"));
    assert(narrowText(e->text()) == "Hi");
    e->pos_ = {100, 50, 1};
    root->call(&g_tmMain);
    g_draws.clear();
    layers.layer[CZSortSet::MIDDLE].flush();
    for (CZSort& q : layers.layer)
        q.clear();
    assert(g_draws.size() == 2 && vx(g_draws[1], 0) == 9);
    assert(g_d3d->device()->world.m[3][0] == 100 && g_d3d->device()->world.m[3][1] == 50);

    // wrapped in rect_'s size
    e->wrap_ = true;
    e->rect_[2] = 20;
    e->setText(u"ABC");
    root->call(&g_tmMain);
    g_draws.clear();
    layers.layer[CZSortSet::MIDDLE].flush();
    for (CZSort& q : layers.layer)
        q.clear();
    assert(g_draws.size() == 3 && vy(g_draws[2], 0) == 16);

    CTmDispStatus st;
    e->call(&st);
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
}

static void testCellManager() {
    CTextTextureManager m;
    int32_t c[4];
    m.allocate(c, 100);
    assert(c[0] == 0 && c[1] == 0);
    m.allocate(c, 100);
    assert(c[0] == 100 && c[1] == 0);
    m.allocate(c, 100);  // past 256: next row
    assert(c[0] == 0 && c[1] == 100);
    m.allocate(c, 100);
    m.allocate(c, 100);  // past the page: reserveTexture() (which drops the page it made)
    assert(c[0] == 0 && c[1] == 0 && m.pageCount() == 0);
    m.cells()[GlyphKey{'A', 0, 0}] = GlyphCell{};
    assert(m.cells().size() == 1 && (GlyphKey{'A', 0, 0} < GlyphKey{'A', 0, 1}));
}

int main() {
    g_d3d = new CD3DDevice;
    g_d3d->initialize(nullptr, 800, 600, false);
    int fonts = g_fakeFontsAlive, textures = g_texturesAlive;
    testTexture();
    testLayout();
    testSpriteDraw();
    testRubyAndElement();
    testCellManager();
    assert(g_fakeFontsAlive == fonts);
    assert(g_texturesAlive == textures + 1);  // the page reserveTexture() created and dropped
    CD3DDevice::release();
    std::puts("text_test ok");
}
