// GDI text on stb_truetype: CreateFont, TextOut, GetTextExtentPoint32, GetTextMetrics, GetGlyphOutline.
//
// Faces are TrueType files found by name in the font directories: YO2_FONT_DIR (':'-separated), else the system's
// (macOS, Linux; on the web the virtual FS's /fonts). A request is either Japanese (Shift-JIS charset, or a Japanese
// or "Gothic"/"Mincho" face name) or Latin, regular or bold; the first file present from that class's list wins,
// then the other class, then any font at all. A glyph the face lacks comes from the other class's face. Metrics follow
// GDI: the cell is the OS/2 table's usWinAscent + usWinDescent, lfHeight > 0 sizes the cell, < 0 the em.
// Quality: ANTIALIASED/CLEARTYPE blend the coverage; everything else is 1-bit (coverage >= 50%), like XP's GDI.
#define STB_TRUETYPE_IMPLEMENTATION
#define STBTT_STATIC
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-function"
#include "stb_truetype.h"
#pragma GCC diagnostic pop

#include <dirent.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cwchar>
#include <map>
#include <string>

#include "gdi_internal.h"

namespace gdi {

struct Face {
    std::vector<uint8_t> data;
    stbtt_fontinfo info;
    int winAscent, winDescent, unitsPerEm;
    bool bold;   // the file itself is bold
};

}  // namespace gdi

using namespace gdi;

namespace {

std::string lower(std::string s) {
    for (char& c : s) c = (char)tolower((unsigned char)c);
    return s;
}

std::string utf8(const WCHAR* w) {
    std::string out;
    char b[8];
    for (; *w; w++) {
        int n = WideCharToMultiByte(65001, 0, w, 1, b, sizeof b, nullptr, nullptr);
        out.append(b, n > 0 ? n : 0);
    }
    return out;
}

std::vector<std::string> fontDirs() {
    std::vector<std::string> dirs;
    if (const char* env = getenv("YO2_FONT_DIR")) {
        std::string s = env;
        for (size_t i = 0, j; i <= s.size(); i = j + 1) {
            j = s.find(':', i);
            if (j == std::string::npos) j = s.size();
            if (j > i) dirs.push_back(s.substr(i, j - i));
        }
        return dirs;
    }
#ifdef __EMSCRIPTEN__
    dirs.push_back("/fonts");   // then the host's (Node with NODERAWFS sees them; a browser doesn't)
#endif
    for (const char* d : {"/System/Library/Fonts", "/System/Library/Fonts/Supplemental", "/Library/Fonts",
                          "/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/truetype/liberation",
                          "/usr/share/fonts/opentype/noto", "/usr/share/fonts/truetype"})
        dirs.push_back(d);
    return dirs;
}

// every font file in the font directories: lower-case name -> path
const std::map<std::string, std::string>& fontFiles() {
    static std::map<std::string, std::string> files;
    static bool scanned = false;
    if (!scanned) {
        scanned = true;
        for (const std::string& d : fontDirs()) {
            DIR* dir = opendir(d.c_str());
            if (!dir) continue;
            while (dirent* e = readdir(dir)) {
                std::string n = lower(e->d_name);
                std::string ext = n.size() > 4 ? n.substr(n.size() - 4) : "";
                if ((ext == ".ttf" || ext == ".ttc" || ext == ".otf") && !files.count(n))
                    files[n] = d + "/" + e->d_name;
            }
            closedir(dir);
        }
    }
    return files;
}

// first file whose lower-case name equals one of `exact` or contains one of `part`
std::string findFile(std::initializer_list<const char*> exact, std::initializer_list<const char*> part) {
    const auto& files = fontFiles();
    for (const char* e : exact) {
        auto it = files.find(e);
        if (it != files.end()) return it->second;
    }
    for (const char* p : part)
        for (const auto& f : files)
            if (f.first.find(p) != std::string::npos) return f.second;
    return "";
}

std::string classFile(bool jp, bool bold) {
    if (jp)
        return bold ? findFile({}, {"w6.ttc", "notosanscjk-bold", "notosansjp-bold", "ipagp", "ipag."})
                    : findFile({"msgothic.ttc", "msgothic.ttf"}, {"w3.ttc", "notosanscjk-regular", "notosansjp-regular",
                                                                  "notosanscjk", "ipagp", "ipag."});
    return bold ? findFile({"arialbd.ttf", "arial bold.ttf", "dejavusans-bold.ttf", "liberationsans-bold.ttf"}, {})
                : findFile({"arial.ttf", "dejavusans.ttf", "liberationsans-regular.ttf", "tahoma.ttf"}, {});
}

uint16_t be16(const uint8_t* p) { return (uint16_t)(p[0] << 8 | p[1]); }
uint32_t be32(const uint8_t* p) { return (uint32_t)p[0] << 24 | p[1] << 16 | p[2] << 8 | p[3]; }

// GDI's cell: the OS/2 table's usWinAscent / usWinDescent (hhea's if there is none)
void winMetrics(Face* f) {
    const uint8_t* font = f->data.data() + f->info.fontstart;
    int n = be16(font + 4);
    f->unitsPerEm = be16(f->data.data() + f->info.head + 18);
    for (int i = 0; i < n; i++) {
        const uint8_t* rec = font + 12 + 16 * i;
        if (memcmp(rec, "OS/2", 4) == 0 && be32(rec + 12) >= 78) {
            const uint8_t* os2 = f->data.data() + be32(rec + 8);
            f->winAscent = be16(os2 + 74);
            f->winDescent = be16(os2 + 76);
            return;
        }
    }
    int asc, desc, gap;
    stbtt_GetFontVMetrics(&f->info, &asc, &desc, &gap);
    f->winAscent = asc;
    f->winDescent = -desc;
}

// a face from a file, the collection member named `name` if there is one (msgothic.ttc: Gothic, PGothic, UI Gothic)
Face* load(const std::string& path, const std::string& name, bool bold) {
    static std::map<std::string, Face*> cache;
    std::string key = path + "|" + name;
    auto it = cache.find(key);
    if (it != cache.end()) return it->second;
    Face* f = nullptr;
    if (FILE* fp = fopen(path.c_str(), "rb")) {
        f = new Face;
        fseek(fp, 0, SEEK_END);
        f->data.resize((size_t)ftell(fp));
        fseek(fp, 0, SEEK_SET);
        if (fread(f->data.data(), 1, f->data.size(), fp) != f->data.size()) f->data.clear();
        fclose(fp);
        int off = name.empty() ? -1 : stbtt_FindMatchingFont(f->data.data(), name.c_str(), STBTT_MACSTYLE_DONTCARE);
        if (off < 0) off = stbtt_GetFontOffsetForIndex(f->data.data(), 0);
        if (f->data.empty() || off < 0 || !stbtt_InitFont(&f->info, f->data.data(), off)) {
            delete f;
            f = nullptr;
        } else {
            f->bold = bold;
            winMetrics(f);
        }
    }
    cache[key] = f;
    return f;
}

bool japanese(const Font* fn) {
    if (fn->lf.lfCharSet == SHIFTJIS_CHARSET) return true;
    std::string name = lower(utf8(fn->lf.lfFaceName));
    for (unsigned char c : name)
        if (c >= 0x80) return true;
    return name.find("gothic") != std::string::npos || name.find("mincho") != std::string::npos ||
           name.find("meiryo") != std::string::npos;
}

Face* pick(bool jp, bool bold, const std::string& name) {
    std::string p = classFile(jp, bold);
    return p.empty() ? nullptr : load(p, name, bold);
}

float scaleFor(const Face* f, LONG h) {
    if (h > 0) return (float)h / (float)(f->winAscent + f->winDescent);
    if (h < 0) return (float)-h / (float)f->unitsPerEm;
    return 16.f / (float)(f->winAscent + f->winDescent);   // 0: the default size
}

// Resolve the face and the pixel metrics (on first use, so CreateFont stays cheap)
void setup(Font* fn) {
    if (fn->face) return;
    bool jp = japanese(fn), bold = fn->lf.lfWeight >= FW_SEMIBOLD;
    std::string name = utf8(fn->lf.lfFaceName);
    Face* f = pick(jp, bold, name);
    if (!f && bold) f = pick(jp, false, name);
    if (!f) f = pick(!jp, bold, "");
    if (!f) f = pick(!jp, false, "");
    if (!f) {   // any font at all
        for (const auto& file : fontFiles())
            if ((f = load(file.second, "", false))) break;
    }
    fn->face = f;
    if (!f) return;
    fn->synthBold = bold && !f->bold;
    fn->scale = scaleFor(f, fn->lf.lfHeight);
    fn->ascent = (int)lroundf(f->winAscent * fn->scale);
    fn->descent = (int)lroundf(f->winDescent * fn->scale);
    fn->height = fn->ascent + fn->descent;
}

// The face that has `cp`, with its scale: the font's own, else the other class's at the same cell height
const Face* glyphFace(Font* fn, uint32_t cp, float& scale) {
    scale = fn->scale;
    if (!fn->face || stbtt_FindGlyphIndex(&fn->face->info, (int)cp)) return fn->face;
    static std::map<bool, Face*> fallback;
    bool jp = !japanese(fn);
    if (!fallback.count(jp)) fallback[jp] = pick(jp, false, "");
    Face* f = fallback[jp];
    if (!f || !stbtt_FindGlyphIndex(&f->info, (int)cp)) return fn->face;   // its own .notdef box
    scale = (float)fn->height / (float)(f->winAscent + f->winDescent);
    return f;
}

int advance(Font* fn, uint32_t cp) {
    float s;
    const Face* f = glyphFace(fn, cp, s);
    if (!f) return 0;
    int adv, lsb;
    stbtt_GetCodepointHMetrics(&f->info, (int)cp, &adv, &lsb);
    return (int)lroundf(adv * s) + (fn->synthBold ? 1 : 0);
}

struct Coverage {
    std::vector<uint8_t> px;   // 0..255
    int w = 0, h = 0, x0 = 0, y0 = 0;   // box relative to the pen on the baseline
};

Coverage render(Font* fn, uint32_t cp) {
    Coverage c;
    float s;
    const Face* f = glyphFace(fn, cp, s);
    if (!f) return c;
    int x1, y1;
    stbtt_GetCodepointBitmapBox(&f->info, (int)cp, s, s, &c.x0, &c.y0, &x1, &y1);
    c.w = x1 - c.x0;
    c.h = y1 - c.y0;
    if (c.w <= 0 || c.h <= 0) { c.w = c.h = 0; return c; }
    int extra = fn->synthBold ? 1 : 0;
    std::vector<uint8_t> g((size_t)c.w * c.h);
    stbtt_MakeCodepointBitmap(&f->info, g.data(), c.w, c.h, c.w, s, s, (int)cp);
    c.px.assign((size_t)(c.w + extra) * c.h, 0);
    for (int y = 0; y < c.h; y++)
        for (int x = 0; x < c.w; x++)
            for (int k = 0; k <= extra; k++) {   // synthetic bold: the glyph again, 1 px right
                uint8_t& d = c.px[(size_t)y * (c.w + extra) + x + k];
                d = std::max(d, g[(size_t)y * c.w + x]);
            }
    c.w += extra;
    return c;
}

bool antialiased(const Font* fn) {
    return fn->lf.lfQuality == ANTIALIASED_QUALITY || fn->lf.lfQuality == CLEARTYPE_QUALITY;
}

COLORREF blend(COLORREF d, COLORREF s, int a) {   // a: 0..255
    auto ch = [&](int sh) { return (((d >> sh) & 0xFF) * (255 - a) + ((s >> sh) & 0xFF) * a + 127) / 255; };
    return (COLORREF)(ch(0) | ch(8) << 8 | ch(16) << 16);
}

void fill(Bitmap* b, int x0, int y0, int x1, int y1, COLORREF c) {
    for (int y = std::max(y0, 0); y < std::min(y1, b->h); y++)
        for (int x = std::max(x0, 0); x < std::min(x1, b->w); x++) b->put(x, y, c);
}

UINT codePage(const Font* fn) { return fn->lf.lfCharSet == SHIFTJIS_CHARSET ? 932 : GetACP(); }

std::wstring wide(const Font* fn, const char* s, int n) {
    if (n < 0) n = (int)strlen(s);
    int len = MultiByteToWideChar(codePage(fn), 0, s, n, nullptr, 0);
    std::wstring w((size_t)len, L'\0');
    MultiByteToWideChar(codePage(fn), 0, s, n, &w[0], len);
    return w;
}

LOGFONTW toWide(const LOGFONTA& a) {
    LOGFONTW w;
    memcpy(&w, &a, offsetof(LOGFONTA, lfFaceName));
    UINT cp = a.lfCharSet == SHIFTJIS_CHARSET ? 932 : CP_ACP;
    int n = MultiByteToWideChar(cp, 0, a.lfFaceName, (int)strnlen(a.lfFaceName, LF_FACESIZE), w.lfFaceName,
                                LF_FACESIZE - 1);
    w.lfFaceName[n > 0 ? n : 0] = 0;
    return w;
}

}  // namespace

// ================================================================ fonts

Font* gdi::defaultFont() {   // the system font a new DC holds
    static Font* f = [] {
        LOGFONTW lf = {};
        lf.lfHeight = 16;
        lf.lfWeight = FW_BOLD;
        Font* s = (Font*)registerObject(new Font(lf));
        s->stock = true;
        return s;
    }();
    return f;
}

HFONT CreateFontIndirectW(const LOGFONTW* lf) { return lf ? (HFONT)registerObject(new Font(*lf)) : nullptr; }
HFONT CreateFontIndirectA(const LOGFONTA* lf) {
    if (!lf) return nullptr;
    LOGFONTW w = toWide(*lf);
    return CreateFontIndirectW(&w);
}

HFONT CreateFontW(int h, int w, int esc, int orient, int weight, DWORD italic, DWORD underline, DWORD strikeOut,
                  DWORD charset, DWORD outPrecision, DWORD clipPrecision, DWORD quality, DWORD pitchAndFamily,
                  LPCWSTR face) {
    LOGFONTW lf = {h, w, esc, orient, weight, (BYTE)italic, (BYTE)underline, (BYTE)strikeOut, (BYTE)charset,
                   (BYTE)outPrecision, (BYTE)clipPrecision, (BYTE)quality, (BYTE)pitchAndFamily, {}};
    if (face) wcsncpy(lf.lfFaceName, face, LF_FACESIZE - 1);
    return CreateFontIndirectW(&lf);
}

HFONT CreateFontA(int h, int w, int esc, int orient, int weight, DWORD italic, DWORD underline, DWORD strikeOut,
                  DWORD charset, DWORD outPrecision, DWORD clipPrecision, DWORD quality, DWORD pitchAndFamily,
                  LPCSTR face) {
    LOGFONTA lf = {h, w, esc, orient, weight, (BYTE)italic, (BYTE)underline, (BYTE)strikeOut, (BYTE)charset,
                   (BYTE)outPrecision, (BYTE)clipPrecision, (BYTE)quality, (BYTE)pitchAndFamily, {}};
    if (face) strncpy(lf.lfFaceName, face, LF_FACESIZE - 1);
    return CreateFontIndirectA(&lf);
}

COLORREF SetTextColor(HDC h, COLORREF c) {
    DC* d = dc(h);
    if (!d) return CLR_INVALID;
    COLORREF old = d->text;
    d->text = c;
    return old;
}
COLORREF SetBkColor(HDC h, COLORREF c) {
    DC* d = dc(h);
    if (!d) return CLR_INVALID;
    COLORREF old = d->bk;
    d->bk = c;
    return old;
}
int SetBkMode(HDC h, int mode) {
    DC* d = dc(h);
    if (!d) return 0;
    int old = d->bkMode;
    d->bkMode = mode;
    return old;
}

// ================================================================ drawing and measuring

SIZE gdi::textExtent(DC* d, const WCHAR* s, int n) {
    setup(d->font);
    SIZE sz = {0, d->font->height};
    for (int i = 0; i < n; i++) sz.cx += advance(d->font, (uint32_t)s[i]);
    return sz;
}

void gdi::textOut(DC* d, int x, int y, const WCHAR* s, int n) {
    Font* fn = d->font;
    setup(fn);
    if (!fn->face) return;
    SIZE ext = textExtent(d, s, n);
    Bitmap* b = d->bmp;
    if (d->bkMode == OPAQUE) fill(b, x, y, x + ext.cx, y + ext.cy, d->bk);
    bool aa = antialiased(fn);
    int pen = x, base = y + fn->ascent;
    for (int i = 0; i < n; i++) {
        Coverage c = render(fn, (uint32_t)s[i]);
        for (int gy = 0; gy < c.h; gy++) {
            int py = base + c.y0 + gy;
            if (py < 0 || py >= b->h) continue;
            for (int gx = 0; gx < c.w; gx++) {
                int px = pen + c.x0 + gx, a = c.px[(size_t)gy * c.w + gx];
                if (px < 0 || px >= b->w || !a) continue;
                if (aa) b->put(px, py, blend(b->get(px, py), d->text, a));
                else if (a >= 128) b->put(px, py, d->text);
            }
        }
        pen += advance(fn, (uint32_t)s[i]);
    }
    int thick = std::max(1, fn->height / 16);
    if (fn->lf.lfUnderline) fill(b, x, base + 1, pen, base + 1 + thick, d->text);
    if (fn->lf.lfStrikeOut) fill(b, x, base - fn->ascent / 3, pen, base - fn->ascent / 3 + thick, d->text);
}

BOOL TextOutW(HDC h, int x, int y, LPCWSTR s, int n) {
    DC* d = dc(h);
    if (!d || !s || n < 0) return FALSE;
    textOut(d, x, y, s, n);
    return TRUE;
}
BOOL TextOutA(HDC h, int x, int y, LPCSTR s, int n) {
    DC* d = dc(h);
    if (!d || !s || n < 0) return FALSE;
    std::wstring w = wide(d->font, s, n);
    textOut(d, x, y, w.c_str(), (int)w.size());
    return TRUE;
}

BOOL GetTextExtentPoint32W(HDC h, LPCWSTR s, int n, LPSIZE size) {
    DC* d = dc(h);
    if (!d || !s || !size || n < 0) return FALSE;
    *size = textExtent(d, s, n);
    return TRUE;
}
BOOL GetTextExtentPoint32A(HDC h, LPCSTR s, int n, LPSIZE size) {
    DC* d = dc(h);
    if (!d || !s || !size || n < 0) return FALSE;
    std::wstring w = wide(d->font, s, n);
    *size = textExtent(d, w.c_str(), (int)w.size());
    return TRUE;
}

template <class TM> static BOOL metrics(HDC h, TM* tm) {
    DC* d = dc(h);
    if (!d || !tm) return FALSE;
    Font* fn = d->font;
    setup(fn);
    memset(tm, 0, sizeof *tm);
    tm->tmHeight = fn->height;
    tm->tmAscent = fn->ascent;
    tm->tmDescent = fn->descent;
    if (fn->face) tm->tmInternalLeading = fn->height - (int)lroundf(fn->face->unitsPerEm * fn->scale);
    tm->tmAveCharWidth = advance(fn, 'x');
    tm->tmMaxCharWidth = std::max(advance(fn, 'W'), advance(fn, 0x3042));
    tm->tmWeight = fn->lf.lfWeight ? fn->lf.lfWeight : FW_NORMAL;
    tm->tmDigitizedAspectX = tm->tmDigitizedAspectY = 96;
    tm->tmFirstChar = 0x20;
    tm->tmLastChar = 0xFF;
    tm->tmDefaultChar = '?';
    tm->tmBreakChar = ' ';
    tm->tmItalic = fn->lf.lfItalic;
    tm->tmUnderlined = fn->lf.lfUnderline;
    tm->tmStruckOut = fn->lf.lfStrikeOut;
    tm->tmPitchAndFamily = 0x06;   // TMPF_VECTOR | TMPF_TRUETYPE
    tm->tmCharSet = fn->lf.lfCharSet;
    return TRUE;
}
BOOL GetTextMetricsW(HDC h, LPTEXTMETRICW tm) { return metrics(h, tm); }
BOOL GetTextMetricsA(HDC h, LPTEXTMETRICA tm) { return metrics(h, tm); }

DWORD GetGlyphOutlineW(HDC h, UINT ch, UINT format, LPGLYPHMETRICS gm, DWORD bufSize, LPVOID buf, const MAT2*) {
    DC* d = dc(h);
    if (!d || !gm) return GDI_ERROR;
    Font* fn = d->font;
    setup(fn);
    if (!fn->face) return GDI_ERROR;
    Coverage c = render(fn, ch);
    gm->gmBlackBoxX = c.w ? (UINT)c.w : 1;
    gm->gmBlackBoxY = c.h ? (UINT)c.h : 1;
    gm->gmptGlyphOrigin = POINT{c.x0, -c.y0};   // the box's top-left, from the pen on the baseline (y up)
    gm->gmCellIncX = (short)advance(fn, ch);
    gm->gmCellIncY = 0;
    if (format == GGO_METRICS) return 0;
    if (!c.w) return 0;   // a blank glyph: no bitmap
    int levels = format == GGO_GRAY8_BITMAP ? 64 : format == GGO_GRAY4_BITMAP ? 16 : format == GGO_GRAY2_BITMAP ? 4 : 0;
    if (!levels && format != GGO_BITMAP) return GDI_ERROR;   // outlines (GGO_NATIVE, ...): not used
    DWORD pitch = levels ? (DWORD)((c.w + 3) & ~3) : (DWORD)(((c.w + 31) / 32) * 4);
    DWORD size = pitch * (DWORD)c.h;
    if (!buf || !bufSize) return size;
    if (bufSize < size) return GDI_ERROR;
    uint8_t* out = (uint8_t*)buf;
    memset(out, 0, size);
    for (int y = 0; y < c.h; y++)
        for (int x = 0; x < c.w; x++) {
            int a = c.px[(size_t)y * c.w + x];
            if (levels) out[y * pitch + x] = (uint8_t)((a * levels + 127) / 255);
            else if (a >= 128) out[y * pitch + x / 8] |= (uint8_t)(0x80 >> (x & 7));
        }
    return size;
}

DWORD GetGlyphOutlineA(HDC h, UINT ch, UINT format, LPGLYPHMETRICS gm, DWORD bufSize, LPVOID buf, const MAT2* m) {
    DC* d = dc(h);
    if (!d) return GDI_ERROR;
    char mb[2];
    int n = 0;
    if (ch > 0xFF) mb[n++] = (char)(ch >> 8);
    mb[n++] = (char)ch;
    std::wstring w = wide(d->font, mb, n);
    return GetGlyphOutlineW(h, w.empty() ? '?' : (UINT)w[0], format, gm, bufSize, buf, m);
}
