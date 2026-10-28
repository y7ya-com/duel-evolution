#include "CD3DTextTexture.h"

#include <cstddef>
#include <cstring>

#include "window/yo2WindowTask.h"
#include "yo2Debug.h"

namespace {

D3DMATRIX identity() {  // (assigned: the real D3DMATRIX is a union, the stand-in a plain array)
    D3DMATRIX m{};
    m.m[0][0] = m.m[1][1] = m.m[2][2] = m.m[3][3] = 1;
    return m;
}
const D3DMATRIX kIdentity = identity();

// The asserts' messages, Shift-JIS as in the exe.
// 文字用テクスチャの定義が大きすぎます (the character texture is defined too large)
const char kMsgPageTooBig[] = "\x95\xb6\x8e\x9a\x97p\x83" "e\x83N\x83X\x83`\x83\x83\x82\xcc\x92\xe8\x8b`\x82\xaa"
                              "\x91\xe5\x82\xab\x82\xb7\x82\xac\x82\xdc\x82\xb7";
// テキストテクスチャの作成に失敗しました (creating the text texture failed)
const char kMsgCreate[] = "\x83" "e\x83L\x83X\x83g\x83" "e\x83N\x83X\x83`\x83\x83\x82\xcc\x8d\xec\x90\xac\x82\xc9\x8e"
                          "\xb8\x94s\x82\xb5\x82\xdc\x82\xb5\x82\xbd";
// テクストテクスチャのロックに失敗しました (locking the text texture failed; the exe's typo)
const char kMsgLock[] = "\x83" "e\x83N\x83X\x83g\x83" "e\x83N\x83X\x83`\x83\x83\x82\xcc\x83\x8d\x83" "b\x83N\x82\xc9"
                        "\x8e\xb8\x94s\x82\xb5\x82\xdc\x82\xb5\x82\xbd";
// ...作成に失敗しました。ビデオメモリ不足の可能性があります (... possibly out of video memory)
const char kMsgCreateMore[] = "\x83" "e\x83L\x83X\x83g\x83" "e\x83N\x83X\x83`\x83\x83\x82\xcc\x8d\xec\x90\xac\x82\xc9"
                              "\x8e\xb8\x94s\x82\xb5\x82\xdc\x82\xb5\x82\xbd\x81" "B\x83r\x83" "f\x83I\x83\x81\x83"
                              "\x82\x83\x8a\x95s\x91\xab\x82\xcc\x89\xc2\x94\\\x90\xab\x82\xaa\x82\xa0\x82\xe8\x82"
                              "\xdc\x82\xb7";
// テキストテクスチャのロックに失敗しました。
const char kMsgLockMore[] = "\x83" "e\x83L\x83X\x83g\x83" "e\x83N\x83X\x83`\x83\x83\x82\xcc\x83\x8d\x83" "b\x83N\x82"
                            "\xc9\x8e\xb8\x94s\x82\xb5\x82\xdc\x82\xb5\x82\xbd\x81" "B";
// ＭＳ ゴシック, the converter's default face
const char kDefaultFace[] = "\x82l\x82r \x83S\x83V\x83" "b\x83N";

// __ftol: truncate toward zero.
int32_t ftol(double v) { return static_cast<int32_t>(v); }

// @yo2 0x0058e7b0 EasyProfiler instance getter (Begin/End are empty in the shipped exe: nothing to profile)
void profile(const char*) {}

void drawQuadAt(SpriteVertex* v, float x, float y, const TextQuad& q) {
    float w = static_cast<float>(q.width), h = static_cast<float>(q.height);
    v[0].x = x, v[0].y = y, v[0].u = q.u0, v[0].v = q.v0;
    v[1].x = x + w, v[1].y = y, v[1].u = q.u1, v[1].v = q.v0;
    v[2].x = x, v[2].y = y + h, v[2].u = q.u0, v[2].v = q.v1;
    v[3].x = x + w, v[3].y = y + h, v[3].u = q.u1, v[3].v = q.v1;
    IDirect3DDevice8* dev = g_d3d->device();
    dev->SetTexture(0, q.page);
    dev->DrawPrimitiveUP(D3DPT_TRIANGLESTRIP, 2, v, sizeof(SpriteVertex));
}

}  // namespace

YO2_SIZEOF(TextQuad, 0x28);
YO2_SIZEOF(TextRun, 0x20);
YO2_SIZEOF(TextLineInfo, 0x0c);
YO2_AT(TextLine, glyphs, 0x1c);
YO2_SIZEOF(TextLine, 0x2c);
YO2_AT(CTextLayout, lineSpacing_, 0x10);
YO2_AT(CTextLayout, keepNewlines_, 0x20);
YO2_SIZEOF(CTextLayout, 0x24);

int32_t g_textPageWidth = 256;   // DAT_00c82ebc
int32_t g_textPageHeight = 256;  // DAT_00c82ec0

// @yo2 0x0058cea0 setTextPageSize
void setTextPageSize(int32_t w, int32_t h) {
    g_textPageWidth = w;
    g_textPageHeight = h;
}

// @yo2 0x006042f0 NullConverter::convert: each character with the
// record defaults (0x006039e0): a 16-pixel ＭＳ ゴシック LOGFONT, white.
int32_t NullConverter::convert(const vc6::wstring& text, vc6::vector<CharRecord>& out) {
    CharRecord r{};
    r.font.height = 16;
    r.font.weight = 400;
    r.font.charSet = 0x80;
    std::memcpy(r.font.faceName, kDefaultFace, sizeof kDefaultFace);
    r.color = 0xffffff;
    out.clear();
    for (size_t i = 0; i < text.size(); ++i) {
        r.code = text[i];
        out.push_back(r);
    }
    return 0;
}

// ---- CD3DTextTexture ----

// @yo2 0x0058ced0 CD3DTextTexture::CD3DTextTexture
ITagConverter* appTagConverter() { return &g_windowFactory->tags_; }

CD3DTextTexture::CD3DTextTexture() : converter_(appTagConverter()) {}

// @yo2 0x0058d060 CD3DTextTexture::~CD3DTextTexture
// @yo2 0x0058cff0 CD3DTextTexture deleting destructor
CD3DTextTexture::~CD3DTextTexture() { clear(); }

// @yo2 0x0058d1a0 CD3DTextTexture::setText: re-render only when it changed
void CD3DTextTexture::setText(const char16_t* text) {
    if (text_ == std::u16string_view(text ? text : u""))
        return;
    text_ = text;
    dirty_ = true;
}

int32_t CD3DTextTexture::quadCount() {
    update();
    return static_cast<int32_t>(quads_.size());
}

// @yo2 0x0058d320 CD3DTextTexture::quad: 0, or -1 (out untouched) past the end
int32_t CD3DTextTexture::quad(uint32_t i, TextQuad* out) {
    update();
    if (i >= quads_.size())
        return -1;
    *out = quads_[i];
    return 0;
}

// @yo2 0x0058d390 CD3DTextTexture::run
int32_t CD3DTextTexture::run(uint32_t i, TextRun* out) {
    update();
    if (i >= runs_.size())
        return -1;
    *out = runs_[i];
    return 0;
}

// @yo2 0x0058d3e0 CD3DTextTexture::line
int32_t CD3DTextTexture::line(uint32_t i, TextLineInfo* out) {
    update();
    if (i >= lines_.size())
        return -1;
    *out = lines_[i];
    return 0;
}

// @yo2 0x0058d460 CD3DTextTexture::maxLineWidth
int32_t CD3DTextTexture::maxLineWidth() {
    update();
    int32_t w = 0;
    for (const TextLineInfo& l : lines_)
        if (w < l.width)
            w = l.width;
    return w;
}

// @yo2 0x0058d4a0 CD3DTextTexture::totalHeight
int32_t CD3DTextTexture::totalHeight() {
    update();
    int32_t h = 0;
    for (const TextLineInfo& l : lines_)
        h += l.height;
    return h;
}

// @yo2 0x0058d4e0 CD3DTextTexture::page: page i, or a new managed A8R8G8B8 page appended when i is past the end
// @yo2 0x00592a00 copy_backward<IDirect3DTexture8**> (vector<IDirect3DTexture8*>::insert)
// @yo2 0x00592a40 uninitialized_fill_n<IDirect3DTexture8**>
// @yo2 0x00592f30 construct<IDirect3DTexture8*>
// @yo2 0x00590f00 vector<IDirect3DTexture8*>::size
IDirect3DTexture8* CD3DTextTexture::page(uint32_t i) {
    if (i < pages_.size())
        return pages_[i];
    IDirect3DDevice8* dev = g_d3d->device();
    IDirect3DTexture8* tex = nullptr;
    HRESULT hr = D3DXCreateTexture(dev, g_textPageWidth, g_textPageHeight, 0, 0, D3DFMT_A8R8G8B8, D3DPOOL_MANAGED,
                                   &tex);
    UINT w = g_textPageWidth, h = g_textPageHeight;
    D3DFORMAT fmt = D3DFMT_A8R8G8B8;
    D3DXCheckTextureRequirements(dev, &w, &h, nullptr, 0, &fmt, D3DPOOL_MANAGED);  // result unused
    if (hr != D3D_OK)
        return nullptr;
    pages_.push_back(tex);
    return tex;
}

// @yo2 0x0058e970 CD3DTextTexture::clearPage: all texels transparent black
void CD3DTextTexture::clearPage(IDirect3DTexture8* tex) {
    D3DLOCKED_RECT lr;
    if (tex->LockRect(0, &lr, nullptr, 0) < 0)
        return;
    uint32_t* p = static_cast<uint32_t*>(lr.pBits);
    for (int32_t i = 0; i < g_textPageWidth * g_textPageHeight; ++i)
        p[i] = 0;
    tex->UnlockRect(0);
}

// @yo2 0x0058e810 CD3DTextTexture::clear: forget the layout, release the pages
void CD3DTextTexture::clear() {
    quads_.clear();
    runs_.clear();
    lines_.clear();
    for (IDirect3DTexture8* p : pages_)
        p->Release();
    pages_.clear();
}

// @yo2 0x0058e7d0 CD3DTextTexture::pageAt
IDirect3DTexture8* CD3DTextTexture::pageAt(uint32_t i) {
    update();
    return i < pages_.size() ? pages_[i] : nullptr;
}

// @yo2 0x0058d7a0 CD3DTextTexture::update ("UpdateTextTexture"): when dirty, convert the text and draw every glyph
// into the pages, left to right, row by row; 0 when done (or clean), 1 on an error (the text stays dirty)
// @yo2 0x00591710 vector<TextQuad>::insert(pos, n, value) (push_back)
// @yo2 0x00591ad0 vector<TextRun>::insert(pos, n, value)
// @yo2 0x00592ad0 copy<TextQuad*> (vector<TextQuad>::erase)
// @yo2 0x00592b20 copy<TextRun*>
int32_t CD3DTextTexture::update() {
    if (!dirty_)
        return 0;
    const int32_t W = g_textPageWidth, H = g_textPageHeight;
    YO2_ASSERT(W * H <= 0x10000, kMsgPageTooBig);

    vc6::vector<CharRecord> chars;
    if (converter_)
        converter_->convert(text_, chars);
    quads_.clear();
    runs_.clear();
    lines_.clear();

    int32_t pageNo = 0;
    IDirect3DTexture8* tex = page(0);
    if (!tex) {
        YO2_ASSERT(false, kMsgCreate);
        return 1;
    }
    clearPage(tex);
    D3DLOCKED_RECT lr;
    if (tex->LockRect(0, &lr, nullptr, 0) < 0) {
        YO2_ASSERT(false, kMsgLock);
        return 1;
    }
    profile("UpdateTextTexture");

    std::vector<uint8_t> bits(0x10000);
    const GdiTextMetric& tm = outline_.textMetric();
    int32_t x = 0, y = 0, count = 0, lineW = 0;
    int32_t h = tm.height;  // the last glyph's cell height (left uninitialised by the exe)
    for (const CharRecord& c : chars) {
        if (c.type == 1) {  // a pen-position record passes straight through
            TextQuad q{};
            q.code = -1;
            q.type = 1;
            q.value = c.value;
            quads_.push_back(q);
            continue;
        }
        if (c.code == 0xfeff)
            continue;
        if (c.code == '\n') {
            lines_.push_back({count, lineW, tm.height});
            TextQuad q{};
            q.code = '\n';
            q.u0 = q.u1 = static_cast<float>(double(x) / W);
            q.v0 = q.v1 = static_cast<float>(double(y) / H);
            q.page = tex;
            quads_.push_back(q);
            lineW = 0;
            count = 0;
            continue;
        }

        uint32_t size = outline_.glyphSize(c.code);
        if (static_cast<int32_t>(size) > W * H)
            return 1;  // left locked, as in the exe
        outline_.glyph(c.code, size, bits.data());
        const GdiGlyphMetrics& gm = outline_.metrics();
        int32_t w = gm.cellIncX + 1;
        h = tm.height;
        if (w > W || h > H) {
            tex->UnlockRect(0);
            return 1;
        }
        if (x + w > W) {  // row full: close it
            runs_.push_back({0, 0, static_cast<float>(double(y) / H), static_cast<float>(double(x) / W),
                             static_cast<float>(double(y + h) / H), x, h, tex});
            y += h;
            x = 0;
        }
        if (y + h > H) {  // page full: next page
            tex->UnlockRect(0);
            x = y = 0;
            tex = page(++pageNo);
            if (!tex) {
                YO2_ASSERT(false, kMsgCreateMore);
                return 1;
            }
            clearPage(tex);
            if (tex->LockRect(0, &lr, nullptr, 0) < 0) {
                YO2_ASSERT(false, kMsgLockMore);
                return 1;
            }
        }

        uint32_t* dst = static_cast<uint32_t*>(lr.pBits) +
                        ((tm.ascent - gm.originY + y) * (static_cast<uint32_t>(lr.Pitch) >> 2) + gm.originX + x);
        float scale = outline_.levelScale();
        if (static_cast<int32_t>(size) > 0) {
            const uint8_t* src = bits.data();
            for (int32_t row = 0; row < static_cast<int32_t>(gm.blackBoxY); ++row) {
                for (int32_t col = 0; col < static_cast<int32_t>(gm.blackBoxX); ++col) {
                    uint32_t a = static_cast<uint32_t>(ftol(double(float(src[col]) * scale)));
                    if (!antialias_)
                        a = 0x10f < a ? 0xff : 0;  // (never true for the GRAY formats: their max is 255)
                    dst[col] = a << 24 | c.color;
                }
                src += (gm.blackBoxX + 3) & 0xfffc;
                dst += static_cast<uint32_t>(lr.Pitch) >> 2;
            }
        }
        TextQuad q{};
        q.code = c.code;
        q.u0 = static_cast<float>(double(x) / W);
        q.v0 = static_cast<float>(double(y) / H);
        q.u1 = static_cast<float>(double(x + w) / W);
        q.v1 = static_cast<float>(double(y + h) / H);
        q.width = w;
        q.height = h;
        q.page = tex;
        quads_.push_back(q);
        x += w;
        lineW += w;
        ++count;
    }
    runs_.push_back({0, 0, static_cast<float>(double(y) / H), static_cast<float>(double(x) / W),
                     static_cast<float>(double(y + h) / H), x, h, tex});
    lines_.push_back({count, lineW, tm.height});
    profile("UpdateTextTexture");
    tex->UnlockRect(0);
    dirty_ = false;
    return 0;
}

// ---- CTextLayout ----

// The exe has adjust() write the int after the texture, which is its sprite's mode.
int32_t& CD3DTextSprite::modeOf(CD3DTextTexture* tex) {
    char* sprite = reinterpret_cast<char*>(tex) - offsetof(CD3DTextSprite, tex_);
    return *reinterpret_cast<int32_t*>(sprite + offsetof(CD3DTextSprite, mode_));
}

// @yo2 0x005910b0 vector<TextLine>::_Xran (at() out of range: throws out_of_range)
// @yo2 0x005911d0 out_of_range::what
// @yo2 0x005911f0 out_of_range copy constructor
// @yo2 0x005913b0 _Xran's throw of the out_of_range
// @yo2 0x005913e0 out_of_range::~out_of_range
// @yo2 0x00591450 out_of_range deleting destructor
// @yo2 0x00591480 length_error::~length_error
// @yo2 0x005914f0 _Xlen's throw of the length_error
// @yo2 0x00591520 length_error deleting destructor
// @yo2 0x00591550 length_error copy constructor
const TextLine& CTextLayout::lineAt(size_t i) const { return lines_.vec().at(i); }

// @yo2 0x00590b50 CTextLayout::rubyMeasure: from quad `start` of a (which 0) or b, the next "$R..." ruby's base
// text (before '(') or, modes 2 and 3, its ruby (inside the parentheses): mode 0/2 its width, 1/3 its length
int32_t CTextLayout::rubyMeasure(int32_t i, int32_t which, CD3DTextTexture* a, CD3DTextTexture* b, int32_t mode) {
    CD3DTextTexture* t = which == 0 ? a : b;
    int32_t n = t->quadCount();
    int32_t result = 0;
    bool in = false;
    TextQuad q{};
    for (;;) {
        q.code = 0;
        if (i >= n)
            return result;
        t->quad(i, &q);
        if (mode >= 2 && mode <= 3) {
            if (in) {
                if (q.code == ')')
                    return result;
                result += mode == 2 ? q.width : 1;
                ++i;
            } else if (q.code == '$' && (t->quad(i + 1, &q), q.code == 'R')) {
                do  // skip to just past '(' (the exe loops forever without one)
                    t->quad(i++, &q);
                while (q.code != '(' && i <= n);
                in = true;
            } else {
                ++i;
            }
        } else if (in) {
            if (q.code == '(')
                return result;
            result += mode != 0 ? 1 : q.width;
            ++i;
        } else {
            if (q.code == '$') {
                t->quad(i + 1, &q);
                if (q.code == 'R') {
                    ++i;
                    in = true;
                }
            }
            ++i;
        }
    }
}

// @yo2 0x0058ea20 CTextLayout::adjust ("Adjust"): wrap the texture's quads into lines no wider than w; a line
// never starts with 、 or 。 (the character before it moves down too); '\n' ends a line and is appended to out
// @yo2 0x00592210 vector<TextGlyph>::insert(pos, n, value)
// @yo2 0x005925d0 vector<TextLine>::insert(pos, n, value)
// @yo2 0x00592a80 copy<TextGlyph*> (vector<TextGlyph>::operator=)
// @yo2 0x00592bc0 copy<TextGlyph*> (vector<TextGlyph>::erase)
// @yo2 0x00592c10 copy<TextLine*> (vector<TextLine>::erase)
// @yo2 0x00591070 vector<TextGlyph>::capacity
// @yo2 0x0058c730 uninitialized_copy<TextGlyph*>
// @yo2 0x0058cc70 vector<TextGlyph>::size
// @yo2 0x0058ccd0 construct<TextGlyph>
void CTextLayout::adjust(float w, float h, int32_t align, CD3DTextTexture* tex, vc6::wstring* out) {
    if (!(w > 15.0f))
        return;
    if (!(h > 15.0f))
        h = 16.0f;
    if (rubyMeasure(0, 0, tex, nullptr, 0) != 0) {  // ruby text: laid out by adjustRuby() instead
        CD3DTextSprite::modeOf(tex) = CD3DTextSprite::HAS_RUBY;
        return;
    }
    height_ = h;
    width_ = w;
    align_ = align;
    int32_t n = tex->quadCount();
    TextQuad q{};
    q.code = -1;
    std::vector<TextGlyph> cur;
    lines_.clear();
    profile("Adjust");

    float y = 0;
    int32_t i = 0;
    for (;;) {
        float lineW = 0;
        int32_t start = i;
        cur.clear();
        int32_t code;
        for (;;) {
            code = 0;  // so running out of quads ends the line with code 0
            q.code = 0;
            if (i >= n)
                break;
            tex->quad(i, &q);
            if (q.type == 1) {
                lineW = static_cast<float>(q.value);
                ++i;
                continue;
            }
            float qw = static_cast<float>(q.width);
            code = q.code;
            if (qw + lineW > w || code == '\n' || qw > w)
                break;
            cur.push_back({lineW, y, lineW, i, static_cast<uint16_t>(code)});
            lineW += qw;
            ++i;
        }
        if (static_cast<float>(q.width) > w)
            break;  // a character wider than the box ends the layout
        if (code == 0) {
            if (cur.empty())
                break;
        } else if ((code == 0x3002 || code == 0x3001) && i > 1 && cur.size() > 1) {  // (the exe tests only i > 1
            // and, on a one-glyph line, pops it, rewinds to the line's start and wraps the same line forever)
            lineW = cur.back().x;
            cur.pop_back();
            --i;
        }
        TextLine line;
        line.y = ftol(y);
        int32_t th = tex->outline().textMetric().height;
        y = static_cast<float>(double(y) + lineSpacing_ + th);
        line.width = ftol(lineW);
        line.height = ftol(double(th) + lineSpacing_);
        line.count = i - start;
        line.start = start;
        if (!keepNewlines_)
            while (code != 0 && i < n && code == '\n') {
                tex->quad(++i, &q);
                code = q.code;
            }
        if (code == '\n') {
            ++i;
            out->append(1, u'\n');
            line.newline = true;
        }
        line.glyphs.vec() = cur;
        lines_.push_back(line);
        if (i >= n)
            break;
    }
    profile("Adjust");
}

// @yo2 0x0058fcf0 CTextLayout::adjustRuby ("Adjust"): wrap "$Rbase(ruby)" text. The base sprite (isRuby false)
// places everything but the parenthesised ruby; the ruby sprite places only that, advancing over the rest with
// the other sprite's glyph widths. The shorter of base and ruby is spread to centre on the longer one; lines
// holding ruby get the ruby font's height on top. At most 216 pixels wide.
void CTextLayout::adjustRuby(float w, float h, int32_t align, CD3DTextTexture* tex, CD3DTextTexture* other,
                             vc6::wstring* out, bool isRuby) {
    if (!(w > 15.0f))
        return;
    if (!(h > 15.0f))
        h = 16.0f;
    width_ = w;
    if (w > 216.0f)
        w = width_ = 216.0f;
    height_ = h;
    align_ = align;
    int32_t n = tex->quadCount();
    TextQuad q{};
    q.code = -1;
    bool rubyLine = false;  // this line holds ruby (until the next '\n')
    std::vector<TextGlyph> cur;
    lines_.clear();
    profile("Adjust");

    // font heights are read live: rubyMeasure() can re-render either texture with a new font
    auto th = [tex] { return tex->outline().textMetric().height; };
    auto otherH = [other] { return other->outline().textMetric().height; };
    float y = 0, spacing = 0;
    int32_t i = 0, state = 0;  // 0 text, 1 ruby base (after "$R"), 2 ruby (inside the parentheses)
    for (;;) {
        float lineW = 0;
        int32_t placed = 0;
        if (state == 0)
            spacing = 0;
        int32_t start = i;
        cur.clear();
        if (!rubyLine)
            rubyLine = rubyMeasure(i, 0, tex, nullptr, 0) != 0;
        if (rubyLine && !isRuby && i == 0)
            y += static_cast<float>(otherH());
        int32_t next = i + 1;
        int32_t code;
        for (;;) {
            code = 0;
            q.code = 0;
            if (i >= n)
                break;
            tex->quad(i, &q);
            if (q.type == 1) {
                lineW = static_cast<float>(q.value);
                ++i, ++next;
                continue;
            }
            code = q.code;
            if (state == 1) {
                if (code == '(') {
                    if (!isRuby)
                        spacing = 0;
                    ++i, ++next;
                    state = 2;
                    continue;
                }
                if (isRuby) {
                    ++i, ++next;
                    continue;
                }
            } else if (state == 2) {
                if (code == ')') {
                    if (isRuby)
                        spacing = 0;
                    ++i, ++next;
                    state = 0;
                    continue;
                }
                if (!isRuby) {
                    ++i, ++next;
                    continue;
                }
            } else if (code == '$') {
                tex->quad(next, &q);
                if (q.code != 'R') {
                    tex->quad(i, &q);
                    code = q.code;
                } else {  // "$R": centre the base and the ruby on each other
                    int32_t diff, cnt;
                    if (isRuby) {
                        int32_t rubyW = rubyMeasure(i, 0, tex, other, 2);
                        diff = rubyMeasure(i, 1, tex, other, 0) - rubyW;
                        cnt = rubyMeasure(i, 0, tex, other, 3);
                    } else {
                        diff = rubyMeasure(i, 1, tex, other, 2) - rubyMeasure(i, 0, tex, other, 0);
                        cnt = rubyMeasure(i, 0, tex, other, 1);
                    }
                    if (diff > 0) {
                        int32_t per = diff / (cnt + 1), rest = diff % (cnt + 1);
                        spacing = static_cast<float>(per);
                        lineW = static_cast<float>(double(rest % 2 + rest / 2) + (double(spacing) + lineW));
                    } else if (isRuby) {  // ruby wider than its base: keep it inside the box
                        int32_t baseW = rubyMeasure(i, 1, tex, other, 0);
                        int32_t rubyW = rubyMeasure(i, 0, tex, other, 2);
                        int32_t baseCnt = rubyMeasure(i, 0, tex, other, 1);
                        int32_t per = (rubyW - baseW) / (baseCnt + 1);
                        int32_t baseEnd = ftol(double(per) * baseCnt + baseW + lineW);
                        int32_t rubyEnd = ftol(double(rubyW) + lineW);
                        if (static_cast<float>(baseEnd) < w && static_cast<float>(rubyEnd) > w)
                            lineW = static_cast<float>(lineW - (double(rubyEnd) - w));
                        spacing = 0;
                    }
                    i += 2, next += 2;
                    state = 1;
                    if (!isRuby)
                        continue;
                    other->quad(i, &q);
                    if (!(static_cast<float>(q.width) + lineW > w))
                        continue;
                    lineW = 9999.0f;  // the ruby doesn't fit: force the break
                    code = q.code;
                }
            }

            float qw = static_cast<float>(q.width);
            if (qw + lineW > w || code == '\n') {
                if (code == '\n')
                    rubyLine = false;
                break;
            }
            if (qw > w)
                break;
            if (isRuby && !(rubyLine && state == 2)) {  // not ruby: only advance, by the base's glyph
                other->quad(i, &q);
                lineW = static_cast<float>(double(q.width) + spacing + lineW);
                if (lineW > w) {
                    code = q.code;
                    break;
                }
                ++i, ++next;
                continue;
            }
            cur.push_back({lineW, y, lineW, i, static_cast<uint16_t>(code)});
            lineW = static_cast<float>(double(q.width) + spacing + lineW);
            ++i, ++next, ++placed;
        }

        if (static_cast<float>(q.width) > w)
            break;
        if (code == 0) {
            if (cur.empty())
                break;
        } else if ((code == 0x3002 || code == 0x3001) && i > 1 && !isRuby && cur.size() > 1) {  // (see adjust())
            lineW = cur.back().x;
            cur.pop_back();
            --i;
        }
        TextLine line;
        line.y = ftol(y);
        int32_t lh = rubyLine ? otherH() + th() : th();
        y = static_cast<float>(double(y) + lineSpacing_ + lh);
        line.width = ftol(lineW);
        line.height = ftol(double(lh) + lineSpacing_);
        line.count = placed;
        line.start = start;
        if (!keepNewlines_)
            while (code != 0 && i < n && code == '\n') {
                tex->quad(++i, &q);
                code = q.code;
            }
        if (code == '\n') {
            ++i;
            out->append(1, u'\n');
            line.newline = true;
        }
        line.glyphs.vec() = cur;
        lines_.push_back(line);
        if (i >= n)
            break;
    }
    profile("Adjust");
}

// @yo2 0x0058e9f0 CTextLayout::relayout: adjust() with the last box
void CTextLayout::relayout(CD3DTextTexture* tex, vc6::wstring* out) { adjust(width_, height_, align_, tex, out); }

// @yo2 0x0058fcb0 CTextLayout::relayoutRuby
void CTextLayout::relayoutRuby(CD3DTextTexture* tex, CD3DTextTexture* other, vc6::wstring* out, bool isRuby) {
    adjustRuby(width_, height_, align_, tex, other, out, isRuby);
}

// @yo2 0x0058f290 CTextLayout::align: per line, shift the glyphs' drawX by 0 (left), half (centre) or all
// (right) of the space left in `width`
void CTextLayout::align(float width, int32_t mode) {
    for (TextLine& l : lines_) {
        float off = 0;
        if (mode == CENTER)
            off = static_cast<float>(ftol(width - l.width) >> 1);
        else if (mode == RIGHT)
            off = width - l.width;
        l.xOffset = off;
        for (TextGlyph& g : l.glyphs)
            g.drawX = off + g.x;
    }
}

// @yo2 0x0058f320 CTextLayout::hitTest: the line under y (past its middle: the next one), then the caret column
// nearest x
void CTextLayout::hitTest(float x, float y, int32_t* col, int32_t* row) {
    *col = 0;
    *row = 0;
    std::vector<TextGlyph> glyphs;
    float top = 0;
    int32_t r = 0;
    for (const TextLine& l : lines_) {
        *row = r;
        glyphs = l.glyphs.vec();
        if (y - static_cast<float>(l.height / 2) < top) {
            *col = ftol(l.xOffset);
            break;
        }
        top += static_cast<float>(l.height);
        ++r;
    }
    float prev = -8.0f;
    int32_t c = 0;
    for (const TextGlyph& g : glyphs) {
        if (x - (g.drawX - prev) * 0.5f < g.drawX) {
            *col = c;
            return;
        }
        prev = g.drawX;
        *col = ++c;
    }
}

// @yo2 0x0058f520 CTextLayout::caretPos: where the caret before column `col` of line `row` sits
// @yo2 0x00590f30 vector<TextGlyph> copy constructor
void CTextLayout::caretPos(int32_t col, int32_t row, float* x, float* y) {
    size_t n = lines_.size();
    if (n == 0) {
        *x = 0;
        *y = 0;
        return;
    }
    size_t r = row < 0 ? 0 : static_cast<size_t>(row);
    if (r > n - 1) {
        const TextLine& last = lineAt(n - 1);
        if (last.newline) {  // after a final '\n': the start of the next line
            *y = static_cast<float>(last.y + last.height);
            *x = 0;
            return;
        }
        r = n - 1;
    }
    TextLine l = lines_[r];
    *y = static_cast<float>(l.y);
    if (l.glyphs.empty() || col < 0)
        *x = l.xOffset;
    else if (static_cast<size_t>(col) >= l.glyphs.size())
        *x = static_cast<float>(l.width) + l.xOffset;
    else
        *x = l.glyphs[col].x;
}

// @yo2 0x0058f830 CTextLayout::indexAt: the quad index of (col, row)
void CTextLayout::indexAt(int32_t col, int32_t row, int32_t* index) {
    size_t n = lines_.size();
    if (n == 0) {
        *index = 0;
        return;
    }
    size_t r = row < 0 ? 0 : static_cast<size_t>(row);
    if (r > n - 1) {
        const TextLine& last = lines_[n - 1];
        if (last.newline) {
            *index = last.count + 1 + last.start;
            return;
        }
        r = n - 1;
    }
    if (col < 0)
        col = 0;
    const TextLine& l = lines_[r];
    *index = l.start + (l.count < col ? l.count : col);
}

// @yo2 0x0058f9e0 CTextLayout::position: (col, row) of quad index `index`
void CTextLayout::position(int32_t index, int32_t* col, int32_t* row) {
    size_t n = lines_.size();
    if (n == 0 || index < 1) {
        *col = 0;
        *row = 0;
        return;
    }
    const TextLine& last = lines_[n - 1];
    if (index > last.count + last.start) {
        *col = last.count;
        *row = static_cast<int32_t>(last.newline ? n : n - 1);
        return;
    }
    *col = 0;
    *row = 0;
    for (size_t r = 0; r < n; ++r) {
        const TextLine& l = lines_[r];
        if (index <= l.count + l.start) {
            *col = index - l.start;
            *row = static_cast<int32_t>(r);
            return;
        }
    }
}

// ---- CD3DTextSprite ----

// @yo2 0x005896c0 CD3DTextSprite::CD3DTextSprite: bounds = one page
CD3DTextSprite::CD3DTextSprite()
    : boundsW_(static_cast<float>(g_textPageWidth)), boundsH_(static_cast<float>(g_textPageHeight)) {}

// @yo2 0x00634a90 CD3DTextSprite::~CD3DTextSprite
// @yo2 0x00634e60 vector<TextLine>::~vector
// @yo2 0x0058c280 vector<TextLine>::_Tidy
// @yo2 0x0058a0f0 TextLine::~TextLine
// @yo2 0x0058ce20 TextLine scalar deleting destructor (vector erase's destroy)
// @yo2 0x0058c7c0 destroy<TextLine*>
// @yo2 0x0058c930 destroy<TextGlyph> (empty)
// @yo2 0x006352f0 allocator<TextGlyph>::deallocate
CD3DTextSprite::~CD3DTextSprite() = default;

// @yo2 0x005897f0 CD3DTextSprite::setText: re-render and re-wrap when it changed
void CD3DTextSprite::setText(const char16_t* text) {
    if (tex_.text() == std::u16string_view(text ? text : u""))
        return;
    tex_.setText(text);
    mode_ = PLAIN;
    layout_.relayout(&tex_, &wrapped_);
}

// @yo2 0x005898c0 CD3DTextSprite::setRubyText: the ruby sprite takes the text; the base sprite only re-wraps
void CD3DTextSprite::setRubyText(const char16_t* text, CD3DTextTexture* other, bool isRuby) {
    if (!isRuby) {
        layout_.relayoutRuby(&tex_, other, &wrapped_, false);
        return;
    }
    if (tex_.text() == std::u16string_view(text ? text : u""))
        return;
    tex_.setText(text);
    mode_ = RUBY;
    layout_.relayoutRuby(&tex_, other, &wrapped_, true);
}

// @yo2 0x0058bc60 CD3DTextSprite::setBounds: re-wrap for a new box
void CD3DTextSprite::setBounds(float w, float h) {
    boundsW_ = w;
    boundsH_ = h;
    layout_.adjust(w, h, 0, &tex_, &wrapped_);
}

// @yo2 0x005899f0 CD3DTextSprite::drawQuad: quad `index` with its top-left at (x, y)
void CD3DTextSprite::drawQuad(float x, float y, int32_t index) {
    g_d3d->device()->SetVertexShader(0x142);
    if (index < 0 || index > tex_.quadCount())
        return;
    TextQuad q{};
    q.code = -1;
    tex_.quad(index, &q);  // index == count draws an empty quad, as in the exe (which draws stack garbage)
    drawQuadAt(v_, x, y, q);
}

// @yo2 0x0058a250 CD3DTextSprite::drawQuads: `count` quads from `first` (-1: to the end) as typed text from
// (x, y), '\n' moving down a font height plus lineGap_; the pen's end is kept in penX_/penY_
void CD3DTextSprite::drawQuads(float x, float y, int32_t first, int32_t count) {
    g_d3d->device()->SetVertexShader(0x142);
    if (first < 0)
        return;
    int32_t n = tex_.quadCount();
    if (first > n)
        return;
    if (count == -1 || n < first + count)
        count = n - first;
    int32_t end = first + count;
    int32_t penX = 0, penY = 0;
    TextQuad q{};
    q.code = -1;
    for (int32_t i = first; i < end; ++i) {
        tex_.quad(i, &q);
        if (q.code == '\n') {
            penY = ftol(double(tex_.outline().textMetric().height) + lineGap_ + penY);
            penX = 0;
            continue;
        }
        drawQuadAt(v_, static_cast<float>(penX) + x, static_cast<float>(penY) + y, q);
        penX += q.width;
    }
    penX_ = static_cast<float>(penX) + x;
    penY_ = static_cast<float>(penY) + y;
}

// @yo2 0x0058a130 CD3DTextSprite::drawAt: all of it at (x, y), untransformed
void CD3DTextSprite::drawAt(float x, float y) {
    IDirect3DDevice8* dev = g_d3d->device();
    dev->SetVertexShader(0x142);
    dev->SetTransform(D3DTS_WORLD, &kIdentity);
    drawQuads(x, y, 0, -1);
}

// @yo2 0x0058bcb0 CD3DTextSprite::drawText: all of it under a world matrix
void CD3DTextSprite::drawText(const D3DMATRIX* world) {
    IDirect3DDevice8* dev = g_d3d->device();
    dev->SetTransform(D3DTS_WORLD, world);
    dev->SetVertexShader(0x142);
    drawQuads(0, 0, 0, -1);
}

// @yo2 0x00589b80 CD3DTextSprite::drawLine: wrapped line `line`, aligned in alignWidth, at (x, y)
// @yo2 0x00589f20 vector<TextLine> copy constructor
// @yo2 0x0058cd00 construct<TextLine> (copy)
// @yo2 0x0058c800 uninitialized_copy<TextLine*>
void CD3DTextSprite::drawLine(float x, float y, float alignWidth, int32_t align, int32_t line) {
    layout_.align(alignWidth, align);
    std::vector<TextLine> lines = layout_.lines();
    if (line < 0 || static_cast<size_t>(line) >= lines.size())
        return;  // the exe reads past the end
    for (const TextGlyph& g : lines[line].glyphs)
        drawQuad(x + g.drawX, y, g.quad);
}

// @yo2 0x0058a480 CD3DTextSprite::drawLayout: the text wrapped in w x h, glyph by glyph from the start, at most
// `count` of them (shortened when first + count runs past the quads)
// @yo2 0x0058c2d0 vector<TextLine>::operator=
// @yo2 0x0058c950 copy<TextLine*> (assignment over existing lines)
// @yo2 0x0058ae90 TextLine::operator=
// @yo2 0x0058bf80 vector<TextGlyph>::operator=
// @yo2 0x0058c5e0 vector<TextLine>::size
// @yo2 0x0058c780 vector<TextLine>::capacity
void CD3DTextSprite::drawLayout(float x, float y, float w, float h, int32_t first, int32_t count, int32_t align) {
    int32_t n = tex_.quadCount();
    if (first > n)
        return;
    int32_t limit = n < first + count ? n - first : count;
    vc6::wstring scratch;
    if (w != lastW_ || h != lastH_) {
        layout_.adjust(w, h, align, &tex_, &scratch);
        lastW_ = w;
        lastH_ = h;
    }
    std::vector<TextLine> lines;
    lines = layout_.lines();
    int32_t drawn = 0;
    for (const TextLine& l : lines)
        for (const TextGlyph& g : l.glyphs) {
            if (drawn >= limit)
                return;
            drawQuad(x + g.x, y + g.y, g.quad);
            ++drawn;
        }
}

// @yo2 0x0058a960 CD3DTextSprite::drawLines: wrapped lines firstLine.. (lineCount of them) of the w x h box,
// aligned, the first one at y
void CD3DTextSprite::drawLines(float x, float y, float w, float h, int32_t firstLine, int32_t lineCount,
                               int32_t align) {
    vc6::wstring scratch;
    if (w != lastW_ || h != lastH_) {
        layout_.adjust(w, h, align, &tex_, &scratch);
        lastW_ = w;
        lastH_ = h;
    }
    std::vector<TextLine> lines;
    lines = layout_.lines();
    if (firstLine < 0)
        firstLine = 0;
    uint32_t n = static_cast<uint32_t>(lines.size());
    if (n < static_cast<uint32_t>(firstLine + lineCount))
        lineCount = static_cast<int32_t>(n) - firstLine;
    int32_t top = 0;
    if (firstLine > 0 && static_cast<uint32_t>(firstLine) < n) {
        top = lines[firstLine].y;
        if (top == firstLine * 24 + 8)  // (as in the exe)
            top -= 8;
    }
    float topF = static_cast<float>(top);
    for (int32_t i = firstLine; i < firstLine + lineCount; ++i)
        drawLine(x, static_cast<float>((double(lines[i].y) + y) - topF), w, align, i);
}

// @yo2 0x0058bd20 CD3DTextSprite::drawWrapped: drawLines() at the origin of a world matrix
void CD3DTextSprite::drawWrapped(const D3DMATRIX* world, float w, float h, int32_t firstLine, int32_t lineCount,
                                 int32_t align) {
    g_d3d->device()->SetTransform(D3DTS_WORLD, world);
    drawLines(0, 0, w, h, firstLine, lineCount, align);
}

// @yo2 0x0058b180 CD3DTextSprite::textHeight: the height the text wraps to at this width
int32_t CD3DTextSprite::textHeight(float width) {
    layout_.adjust(width, 9999.0f, 0, &tex_, &wrapped_);
    std::vector<TextLine> lines = layout_.lines();
    if (lines.empty())
        return 0;  // the exe reads before the start
    return lines.back().height + lines.back().y;
}

int32_t CD3DTextSprite::lineCountAt(float width) {
    layout_.adjust(width, 9999.0f, 0, &tex_, &wrapped_);
    return static_cast<int32_t>(layout_.lines().size());
}

// @yo2 0x0058b270 CD3DTextSprite::linesFitting: how many lines from startLine fit in `height` (all lines' count
// when the rest fits)
int32_t CD3DTextSprite::linesFitting(int32_t startLine, float height) {
    std::vector<TextLine> lines = layout_.lines();
    uint32_t start = static_cast<uint32_t>(startLine);
    int32_t base = 0;
    if (lines.empty() || lines.size() <= start)
        start = 0;
    else if (start != 0)
        base = lines[start].y;
    for (uint32_t i = start + 1; i < lines.size(); ++i)
        if (height <= static_cast<float>(lines[i].y - base))
            return static_cast<int32_t>(i - start) - 1;
    return static_cast<int32_t>(lines.size());
}

// @yo2 0x0058b6b0 CD3DTextSprite::lineText: the characters of wrapped line `line` (after re-wrapping for the bounds)
// @yo2 0x0058bb50 TextLine::TextLine
// @yo2 0x0058c620 wstring::append(n, ch)
// @yo2 0x0058c850 wstring::assign(ptr, n)
// @yo2 0x0058bd90 wstring copy constructor
// @yo2 0x0058bf00 char_traits<wchar_t>::copy
vc6::wstring CD3DTextSprite::lineText(int32_t line) {
    setBounds(boundsW_, boundsH_);
    std::vector<TextLine> lines = layout_.lines();
    if (line < 0 || static_cast<size_t>(line) >= lines.size())
        return vc6::wstring(u"");
    vc6::wstring s;
    for (const TextGlyph& g : lines[line].glyphs)
        s.append(1, g.code);
    return s;
}
