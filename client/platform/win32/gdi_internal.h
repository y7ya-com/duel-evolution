// What gdi.cpp and font.cpp share: the objects behind HDC / HBITMAP / HFONT / HRGN.
#pragma once
#define NOMINMAX   // std::min / std::max here
#include <windows.h>

#include <cstdint>
#include <vector>

namespace gdi {

struct Object {
    int kind;   // OBJ_BITMAP / OBJ_FONT / OBJ_REGION, or 0 for brushes, pens and palettes nobody draws with
    bool stock = false;
    explicit Object(int kind) : kind(kind) {}
    virtual ~Object() {}
};

// A DIB: 1, 8, 16 (5-5-5, or bit fields), 24 or 32 bits per pixel, rows DWORD-aligned
struct Bitmap : Object {
    int w = 0, h = 0, bpp = 32, stride = 0;
    bool bottomUp = false;   // the DIB's memory order (biHeight > 0); x/y below are always from the top
    uint8_t* bits = nullptr;
    bool owns = false;
    RGBQUAD colors[256] = {};
    uint32_t masks[3] = {0x7C00, 0x03E0, 0x001F};   // 16 bpp
    Bitmap() : Object(OBJ_BITMAP) {}
    ~Bitmap() override {
        if (owns) delete[] bits;
    }
    uint8_t* row(int y) const { return bits + (size_t)(bottomUp ? h - 1 - y : y) * stride; }
    COLORREF get(int x, int y) const;
    void put(int x, int y, COLORREF c);
};

struct Face;   // a loaded TrueType face (font.cpp)

struct Font : Object {
    LOGFONTW lf;
    Face* face = nullptr;
    float scale = 0;            // font units -> pixels
    int ascent = 0, descent = 0, height = 0;   // pixels; height = the cell (ascent + descent)
    bool synthBold = false;     // FW_BOLD asked, no bold file found: drawn twice, 1 px apart, as GDI does
    explicit Font(const LOGFONTW& lf) : Object(OBJ_FONT), lf(lf) {}
};

struct DC {
    Bitmap* bmp;               // the selected bitmap (a memory DC starts with a 1x1 monochrome one)
    Font* font;                // the selected font (a DC starts with the system font)
    COLORREF text = 0, bk = 0xFFFFFF;
    int bkMode = OPAQUE;
    bool window = false;       // GetDC / BeginPaint: released, not deleted
    // path (BeginPath .. EndPath): closed polygons
    bool inPath = false;
    std::vector<std::vector<POINT>> figures;
    POINT cur = {0, 0};
    DC(Bitmap* bmp, Font* font) : bmp(bmp), font(font) {}
};

DC* dc(HDC h);
void* registerObject(Object* o);   // a new HGDIOBJ (gdi.cpp keeps the set of live handles)
Font* defaultFont();
// draws (TextOutW) / measures; implemented in font.cpp
void textOut(DC* d, int x, int y, const WCHAR* s, int n);
SIZE textExtent(DC* d, const WCHAR* s, int n);

}  // namespace gdi
