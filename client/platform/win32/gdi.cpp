// GDI on memory: DCs, DIB sections, BitBlt, pixels, palettes, regions and paths (see wingdi.h). Text: font.cpp.
#include "gdi_internal.h"

#include <algorithm>
#include <climits>
#include <cmath>
#include <cstring>
#include <set>

#include "platform.h"

using namespace gdi;

namespace {

std::set<void*> gLive;   // every HDC / HGDIOBJ handed out: a stale or foreign handle fails, as on Windows

template <class T> T* live(void* h) { return h && gLive.count(h) ? (T*)h : nullptr; }
template <class T> T* track(T* p) {
    gLive.insert(p);
    return p;
}

Bitmap* monoStock() {   // what a new memory DC holds: 1x1, 1 bpp
    static Bitmap* b = [] {
        Bitmap* m = track(new Bitmap);
        m->w = m->h = 1;
        m->bpp = 1;
        m->stride = 4;
        m->bits = new uint8_t[4]();
        m->owns = true;
        m->stock = true;
        m->colors[1] = RGBQUAD{255, 255, 255, 0};
        return m;
    }();
    return b;
}

Bitmap* screen() {   // the "window" surface GetDC hands out: the game's size, 32 bpp, never shown
    static Bitmap* b = [] {
        Bitmap* s = track(new Bitmap);
        s->w = 1024;
        s->h = 768;
        s->stride = s->w * 4;
        s->bits = new uint8_t[(size_t)s->stride * s->h]();
        s->owns = true;
        s->stock = true;
        return s;
    }();
    return b;
}

int strideOf(int w, int bpp) { return ((w * bpp + 31) / 32) * 4; }

COLORREF bgr(const RGBQUAD& q) { return RGB(q.rgbRed, q.rgbGreen, q.rgbBlue); }

int nearest(const RGBQUAD* pal, int n, COLORREF c) {
    int best = 0, bestD = 1 << 30;
    for (int i = 0; i < n; i++) {
        int dr = pal[i].rgbRed - GetRValue(c), dg = pal[i].rgbGreen - GetGValue(c), db = pal[i].rgbBlue - GetBValue(c);
        int d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = i; }
    }
    return best;
}

int shiftOf(uint32_t m) { int s = 0; while (m && !(m & 1)) { m >>= 1; s++; } return s; }
int bitsOf(uint32_t m) { int n = 0; for (; m; m &= m - 1) n++; return n; }

uint32_t pack(uint32_t v, uint32_t mask) {   // an 8-bit channel into a bit-field mask
    int n = bitsOf(mask);
    return n ? ((v >> (8 - std::min(n, 8))) << shiftOf(mask)) & mask : 0;
}
uint32_t unpack(uint32_t px, uint32_t mask) {
    int n = bitsOf(mask);
    if (!n) return 0;
    uint32_t v = (px & mask) >> shiftOf(mask);
    return n >= 8 ? v >> (n - 8) : (v << (8 - n)) | (v >> (2 * n - 8 > 0 ? 2 * n - 8 : 0));
}

}  // namespace

COLORREF Bitmap::get(int x, int y) const {
    const uint8_t* r = row(y);
    switch (bpp) {
    case 1: return bgr(colors[(r[x >> 3] >> (7 - (x & 7))) & 1]);
    case 8: return bgr(colors[r[x]]);
    case 16: {
        uint32_t px = r[2 * x] | r[2 * x + 1] << 8;
        return RGB(unpack(px, masks[0]), unpack(px, masks[1]), unpack(px, masks[2]));
    }
    case 24: return RGB(r[3 * x + 2], r[3 * x + 1], r[3 * x]);
    default: return RGB(r[4 * x + 2], r[4 * x + 1], r[4 * x]);
    }
}

void Bitmap::put(int x, int y, COLORREF c) {
    uint8_t* r = row(y);
    switch (bpp) {
    case 1: {
        uint8_t bit = 0x80 >> (x & 7);
        if (nearest(colors, 2, c)) r[x >> 3] |= bit;
        else r[x >> 3] &= ~bit;
        break;
    }
    case 8: r[x] = (uint8_t)nearest(colors, 256, c); break;
    case 16: {
        uint32_t px = pack(GetRValue(c), masks[0]) | pack(GetGValue(c), masks[1]) | pack(GetBValue(c), masks[2]);
        r[2 * x] = (uint8_t)px;
        r[2 * x + 1] = (uint8_t)(px >> 8);
        break;
    }
    case 24: r[3 * x] = GetBValue(c); r[3 * x + 1] = GetGValue(c); r[3 * x + 2] = GetRValue(c); break;
    default: r[4 * x] = GetBValue(c); r[4 * x + 1] = GetGValue(c); r[4 * x + 2] = GetRValue(c); r[4 * x + 3] = 0; break;
    }
}

DC* gdi::dc(HDC h) { return live<DC>(h); }
void* gdi::registerObject(Object* o) { return track(o); }

// ================================================================ DCs and objects

HDC CreateCompatibleDC(HDC) { return (HDC)track(new DC(monoStock(), defaultFont())); }

BOOL DeleteDC(HDC h) {
    DC* d = dc(h);
    if (!d || d->window) return FALSE;
    gLive.erase(d);
    delete d;
    return TRUE;
}

HDC GetDC(HWND) {
    DC* d = track(new DC(screen(), defaultFont()));
    d->window = true;
    return (HDC)d;
}
HDC GetWindowDC(HWND w) { return GetDC(w); }
int ReleaseDC(HWND, HDC h) {
    DC* d = dc(h);
    if (!d || !d->window) return 0;
    gLive.erase(d);
    delete d;
    return 1;
}

HDC BeginPaint(HWND w, LPPAINTSTRUCT ps) {
    HDC h = GetDC(w);
    memset(ps, 0, sizeof *ps);
    ps->hdc = h;
    GetClientRect(w, &ps->rcPaint);
    return h;
}
BOOL EndPaint(HWND w, const PAINTSTRUCT* ps) { return ReleaseDC(w, ps->hdc); }

HGDIOBJ SelectObject(HDC h, HGDIOBJ obj) {
    DC* d = dc(h);
    Object* o = live<Object>(obj);
    if (!d || !o) return nullptr;
    switch (o->kind) {
    case OBJ_BITMAP: {
        Bitmap* old = d->bmp;
        d->bmp = (Bitmap*)o;
        return (HGDIOBJ)old;
    }
    case OBJ_FONT: {
        Font* old = d->font;
        d->font = (Font*)o;
        return (HGDIOBJ)old;
    }
    case OBJ_REGION: return (HGDIOBJ)(intptr_t)SIMPLEREGION;   // a clip region: ignored (ponytail: no clipping)
    default: return obj;
    }
}

BOOL DeleteObject(HGDIOBJ obj) {
    Object* o = live<Object>(obj);
    if (!o || o->stock) return o != nullptr;
    gLive.erase(o);
    delete o;
    return TRUE;
}

int GetDeviceCaps(HDC, int index) {
    switch (index) {
    case HORZRES: return 1024;
    case VERTRES: return 768;
    case BITSPIXEL: return 32;
    case PLANES: return 1;
    case NUMCOLORS: return -1;
    case RASTERCAPS: return RC_BITBLT;   // no RC_PALETTE: a true-colour device
    case LOGPIXELSX: case LOGPIXELSY: return 96;
    case SIZEPALETTE: return 0;
    default: return 0;
    }
}

// ================================================================ bitmaps

static Bitmap* fromInfo(const BITMAPINFO* bmi) {
    const BITMAPINFOHEADER& h = bmi->bmiHeader;
    Bitmap* b = new Bitmap;
    b->w = h.biWidth;
    b->h = h.biHeight < 0 ? -h.biHeight : h.biHeight;
    b->bottomUp = h.biHeight > 0;
    b->bpp = h.biBitCount;
    b->stride = strideOf(b->w, b->bpp);
    if (b->bpp <= 8) {
        int n = h.biClrUsed ? (int)h.biClrUsed : 1 << b->bpp;
        memcpy(b->colors, bmi->bmiColors, sizeof(RGBQUAD) * std::min(n, 256));
    } else if (h.biCompression == BI_BITFIELDS) {
        memcpy(b->masks, bmi->bmiColors, sizeof b->masks);
    } else if (b->bpp == 32) {
        b->masks[0] = 0xFF0000; b->masks[1] = 0xFF00; b->masks[2] = 0xFF;
    }
    return b;
}

HBITMAP CreateDIBSection(HDC, const BITMAPINFO* bmi, UINT, void** bits, HANDLE, DWORD) {
    if (!bmi || bmi->bmiHeader.biWidth <= 0 || !bmi->bmiHeader.biHeight) return nullptr;
    int bpp = bmi->bmiHeader.biBitCount;
    if (bpp != 1 && bpp != 4 && bpp != 8 && bpp != 16 && bpp != 24 && bpp != 32) return nullptr;
    if (bpp == 4) return nullptr;   // ponytail: no 4 bpp DIBs in yaneSDK or the game
    Bitmap* b = fromInfo(bmi);
    b->bits = new uint8_t[(size_t)b->stride * b->h]();
    b->owns = true;
    if (bits) *bits = b->bits;
    return (HBITMAP)track(b);
}

HBITMAP CreateCompatibleBitmap(HDC, int w, int h) {
    if (w <= 0 || h <= 0) return nullptr;
    Bitmap* b = new Bitmap;
    b->w = w;
    b->h = h;
    b->stride = w * 4;
    b->bits = new uint8_t[(size_t)b->stride * h]();
    b->owns = true;
    return (HBITMAP)track(b);
}

static DWORD rop(DWORD op, COLORREF s, COLORREF d) {
    switch (op) {
    case SRCPAINT: return s | d;
    case SRCAND: return s & d;
    case SRCINVERT: return s ^ d;
    case NOTSRCCOPY: return ~s & 0xFFFFFF;
    case DSTINVERT: return ~d & 0xFFFFFF;
    case BLACKNESS: return 0;
    case WHITENESS: return 0xFFFFFF;
    default: return s;   // SRCCOPY
    }
}

static void blit(Bitmap* dst, int x, int y, int w, int h, const Bitmap* src, int sx, int sy, DWORD op) {
    bool usesSrc = op != BLACKNESS && op != WHITENESS && op != DSTINVERT;
    // clip to both bitmaps
    if (x < 0) { sx -= x; w += x; x = 0; }
    if (y < 0) { sy -= y; h += y; y = 0; }
    if (usesSrc) {
        if (sx < 0) { x -= sx; w += sx; sx = 0; }
        if (sy < 0) { y -= sy; h += sy; sy = 0; }
        w = std::min(w, src->w - sx);
        h = std::min(h, src->h - sy);
    }
    w = std::min(w, dst->w - x);
    h = std::min(h, dst->h - y);
    if (w <= 0 || h <= 0) return;
    if (op == SRCCOPY && src->bpp == dst->bpp && dst->bpp >= 8 &&
        (dst->bpp != 8 || !memcmp(src->colors, dst->colors, sizeof src->colors)) &&
        (dst->bpp != 16 || !memcmp(src->masks, dst->masks, sizeof src->masks))) {
        int bytes = dst->bpp / 8;
        for (int j = 0; j < h; j++)
            memmove(dst->row(y + j) + x * bytes, src->row(sy + j) + sx * bytes, (size_t)w * bytes);
        return;
    }
    for (int j = 0; j < h; j++)
        for (int i = 0; i < w; i++)
            dst->put(x + i, y + j, rop(op, usesSrc ? src->get(sx + i, sy + j) : 0, dst->get(x + i, y + j)));
}

BOOL BitBlt(HDC hdst, int x, int y, int w, int h, HDC hsrc, int sx, int sy, DWORD op) {
    DC* d = dc(hdst);
    DC* s = dc(hsrc);
    if (!d || (!s && op != BLACKNESS && op != WHITENESS && op != DSTINVERT)) return FALSE;
    blit(d->bmp, x, y, w, h, s ? s->bmp : nullptr, sx, sy, op);
    return TRUE;
}

int SetDIBitsToDevice(HDC h, int xDest, int yDest, DWORD w, DWORD hgt, int xSrc, int ySrc, UINT startScan,
                      UINT lines, const void* bits, const BITMAPINFO* bmi, UINT) {
    DC* d = dc(h);
    if (!d || !bits || !bmi) return 0;
    Bitmap* view = fromInfo(bmi);   // a view of the caller's bits, rows startScan .. startScan + lines
    view->bits = (uint8_t*)bits;
    int full = view->h;
    view->h = (int)lines;
    // a bottom-up DIB counts ySrc (and the scan lines) from its bottom row
    int top = view->bottomUp ? full - ySrc - (int)hgt : ySrc;
    if (view->bottomUp) top -= full - (int)(startScan + lines);
    else top -= (int)startScan;
    blit(d->bmp, xDest, yDest, (int)w, (int)hgt, view, xSrc, top, SRCCOPY);
    delete view;
    return (int)lines;
}

COLORREF GetPixel(HDC h, int x, int y) {
    DC* d = dc(h);
    if (!d || x < 0 || y < 0 || x >= d->bmp->w || y >= d->bmp->h) return CLR_INVALID;
    return d->bmp->get(x, y);
}

COLORREF SetPixel(HDC h, int x, int y, COLORREF c) {
    DC* d = dc(h);
    if (!d || x < 0 || y < 0 || x >= d->bmp->w || y >= d->bmp->h) return (COLORREF)-1;
    d->bmp->put(x, y, c);
    return d->bmp->get(x, y);
}

UINT GetSystemPaletteEntries(HDC, UINT, UINT n, LPPALETTEENTRY e) {
    if (e) memset(e, 0, sizeof *e * n);
    return 0;   // not a palette device
}
UINT SetPaletteEntries(HPALETTE, UINT, UINT n, const PALETTEENTRY*) { return n; }
UINT RealizePalette(HDC) { return 0; }

// ================================================================ regions: non-overlapping rectangles in y-x bands

namespace {

struct Region : Object {
    std::vector<RECT> r;
    Region() : Object(OBJ_REGION) {}
};

// the x intervals of rs covering the band [y0, y1)
std::vector<std::pair<LONG, LONG>> spans(const std::vector<RECT>& rs, LONG y0, LONG y1) {
    std::vector<std::pair<LONG, LONG>> out;
    for (const RECT& q : rs)
        if (q.top <= y0 && q.bottom >= y1) out.push_back({q.left, q.right});
    std::sort(out.begin(), out.end());
    return out;
}

bool inside(const std::vector<std::pair<LONG, LONG>>& s, LONG x) {
    for (auto& p : s)
        if (p.first <= x && x < p.second) return true;
    return false;
}

std::vector<RECT> combine(const std::vector<RECT>& a, const std::vector<RECT>& b, int mode) {
    std::vector<LONG> ys;
    for (auto* rs : {&a, &b})
        for (const RECT& q : *rs) { ys.push_back(q.top); ys.push_back(q.bottom); }
    std::sort(ys.begin(), ys.end());
    ys.erase(std::unique(ys.begin(), ys.end()), ys.end());
    std::vector<RECT> out;
    for (size_t k = 0; k + 1 < ys.size(); k++) {
        LONG y0 = ys[k], y1 = ys[k + 1];
        auto sa = spans(a, y0, y1), sb = spans(b, y0, y1);
        std::vector<LONG> xs;
        for (auto* s : {&sa, &sb})
            for (auto& p : *s) { xs.push_back(p.first); xs.push_back(p.second); }
        std::sort(xs.begin(), xs.end());
        xs.erase(std::unique(xs.begin(), xs.end()), xs.end());
        for (size_t i = 0; i + 1 < xs.size(); i++) {
            bool ia = inside(sa, xs[i]), ib = inside(sb, xs[i]);
            bool in = mode == RGN_AND ? ia && ib : mode == RGN_OR ? ia || ib : mode == RGN_XOR ? ia != ib : ia && !ib;
            if (!in) continue;
            if (!out.empty() && out.back().top == y0 && out.back().right == xs[i]) out.back().right = xs[i + 1];
            else out.push_back(RECT{xs[i], y0, xs[i + 1], y1});
        }
    }
    return out;
}

int complexity(const Region* r) { return r->r.empty() ? NULLREGION : r->r.size() == 1 ? SIMPLEREGION : COMPLEXREGION; }

}  // namespace

HRGN CreateRectRgn(int l, int t, int r, int b) {
    Region* g = new Region;
    if (l > r) std::swap(l, r);
    if (t > b) std::swap(t, b);
    if (l < r && t < b) g->r.push_back(RECT{l, t, r, b});
    return (HRGN)track(g);
}

int CombineRgn(HRGN dst, HRGN a, HRGN b, int mode) {
    Region* d = live<Region>(dst);
    Region* ra = live<Region>(a);
    Region* rb = live<Region>(b);
    if (!d || !ra || (mode != RGN_COPY && !rb)) return ERROR;
    d->r = mode == RGN_COPY ? ra->r : combine(ra->r, rb->r, mode);
    return complexity(d);
}

int GetRgnBox(HRGN h, LPRECT box) {
    Region* g = live<Region>(h);
    if (!g || !box) return ERROR;
    *box = RECT{0, 0, 0, 0};
    for (size_t i = 0; i < g->r.size(); i++) {
        const RECT& q = g->r[i];
        if (!i) *box = q;
        box->left = std::min(box->left, q.left);
        box->top = std::min(box->top, q.top);
        box->right = std::max(box->right, q.right);
        box->bottom = std::max(box->bottom, q.bottom);
    }
    return complexity(g);
}

BOOL PtInRegion(HRGN h, int x, int y) {
    Region* g = live<Region>(h);
    if (!g) return FALSE;
    for (const RECT& q : g->r)
        if (q.left <= x && x < q.right && q.top <= y && y < q.bottom) return TRUE;
    return FALSE;
}

// ---- paths

BOOL BeginPath(HDC h) {
    DC* d = dc(h);
    if (!d) return FALSE;
    d->inPath = true;
    d->figures.clear();
    return TRUE;
}

BOOL MoveToEx(HDC h, int x, int y, LPPOINT old) {
    DC* d = dc(h);
    if (!d) return FALSE;
    if (old) *old = d->cur;
    d->cur = POINT{x, y};
    if (d->inPath) d->figures.push_back({d->cur});
    return TRUE;
}

BOOL LineTo(HDC h, int x, int y) {
    DC* d = dc(h);
    if (!d) return FALSE;
    if (d->inPath) {
        if (d->figures.empty()) d->figures.push_back({d->cur});
        d->figures.back().push_back(POINT{x, y});
    }
    // ponytail: outside a path nothing draws lines (yaneSDK only builds paths with them)
    d->cur = POINT{x, y};
    return TRUE;
}

BOOL CloseFigure(HDC h) {
    DC* d = dc(h);
    return d && d->inPath && !d->figures.empty();   // every figure is closed when filled
}

BOOL EndPath(HDC h) {
    DC* d = dc(h);
    if (!d || !d->inPath) return FALSE;
    d->inPath = false;
    return TRUE;
}

// Each pixel row is filled where its centre is inside an odd number of figures (ALTERNATE), per figure edge list.
// ponytail: a pixel-centre rule; GDI's own rasteriser differs by a pixel on some edges.
HRGN PathToRegion(HDC h) {
    DC* d = dc(h);
    if (!d || d->inPath) return nullptr;
    LONG top = INT_MAX, bottom = INT_MIN;
    for (auto& f : d->figures)
        for (const POINT& p : f) { top = std::min(top, p.y); bottom = std::max(bottom, p.y); }
    Region* g = new Region;
    for (LONG y = top; y < bottom; y++) {
        double cy = y + 0.5;
        std::vector<double> xs;
        for (auto& f : d->figures)
            for (size_t i = 0; i < f.size(); i++) {
                POINT a = f[i], b = f[(i + 1) % f.size()];
                if ((a.y <= cy) == (b.y <= cy)) continue;
                xs.push_back(a.x + (cy - a.y) * (b.x - a.x) / (double)(b.y - a.y));
            }
        std::sort(xs.begin(), xs.end());
        for (size_t i = 0; i + 1 < xs.size(); i += 2) {   // one band per row: appending keeps the bands sorted
            LONG x0 = (LONG)std::ceil(xs[i] - 0.5), x1 = (LONG)std::ceil(xs[i + 1] - 0.5);
            if (x0 < x1) g->r.push_back(RECT{x0, y, x1, y + 1});
        }
    }
    d->figures.clear();
    return (HRGN)track(g);
}
