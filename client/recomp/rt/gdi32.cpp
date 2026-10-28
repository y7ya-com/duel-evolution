// GDI32 for the recompiled exe on platform/win32's GDI (gdi.cpp, font.cpp). Host handles are 64-bit pointers, so
// the guest sees 32-bit stand-ins; DIB section pixels are moved into guest memory so the game writes them directly.
#include <string>
#include <vector>

#include "gdi_internal.h"   // platform/win32

extern "C" {
#include "win.h"
}

namespace {
std::vector<void*> hs;   // guest handle 0x40000 + 4*i <-> host handle
const uint32_t HBASE = 0x40000;

uint32_t gh(void* h) {
    if (!h) return 0;
    for (size_t i = 0; i < hs.size(); i++)
        if (hs[i] == h) return HBASE + 4 * (uint32_t)i;
    hs.push_back(h);
    return HBASE + 4 * (uint32_t)(hs.size() - 1);
}
void* hh(uint32_t g) {
    if (g < HBASE) return nullptr;
    size_t i = (g - HBASE) / 4;
    return i < hs.size() ? hs[i] : nullptr;
}
void forget(uint32_t g) {
    size_t i = (g - HBASE) / 4;
    if (g >= HBASE && i < hs.size()) hs[i] = nullptr;
}
std::vector<WCHAR> wide(uint32_t s, int n) {   // guest UTF-16 -> host WCHAR (32-bit)
    if (n < 0) { n = 0; while (rc_rd16(rc_mem + s + 2 * n)) n++; }
    std::vector<WCHAR> w((size_t)n + 1, 0);
    for (int i = 0; i < n; i++) w[i] = rc_rd16(rc_mem + s + 2 * i);
    return w;
}
}  // namespace

extern "C" uint32_t rc_gdi_handle(void* h) { return gh(h); }   // USER32's GetDC / BeginPaint
extern "C" void* rc_gdi_host(uint32_t g) { return hh(g); }

#define GD(name) extern "C" void imp_GDI32_##name(CPU* c)
#define HDCA(n) ((HDC)hh(ARG(n)))

GD(CreateCompatibleDC) { RET(1, gh(CreateCompatibleDC(HDCA(0)))); }
GD(DeleteDC) { BOOL r = DeleteDC(HDCA(0)); forget(ARG(0)); RET(1, r); }
GD(DeleteObject) { BOOL r = DeleteObject((HGDIOBJ)hh(ARG(0))); if (r) forget(ARG(0)); RET(1, r); }
GD(SelectObject) { RET(2, gh(SelectObject(HDCA(0), (HGDIOBJ)hh(ARG(1))))); }
GD(GetStockObject) { RET(1, gh(GetStockObject((int)ARG(0)))); }
GD(GetDeviceCaps) { RET(2, (uint32_t)GetDeviceCaps(HDCA(0), (int)ARG(1))); }
GD(SetBkColor) { RET(2, SetBkColor(HDCA(0), ARG(1))); }
GD(SetBkMode) { RET(2, (uint32_t)SetBkMode(HDCA(0), (int)ARG(1))); }
GD(SetTextColor) { RET(2, SetTextColor(HDCA(0), ARG(1))); }
GD(GetPixel) { RET(3, GetPixel(HDCA(0), (int)ARG(1), (int)ARG(2))); }
GD(SetPixel) { RET(4, SetPixel(HDCA(0), (int)ARG(1), (int)ARG(2), ARG(3))); }
GD(BitBlt) {
    RET(9, BitBlt(HDCA(0), (int)ARG(1), (int)ARG(2), (int)ARG(3), (int)ARG(4), HDCA(5), (int)ARG(6), (int)ARG(7), ARG(8)));
}
GD(CreateDIBSection) {
    void* bits = nullptr;
    HBITMAP b = CreateDIBSection(HDCA(0), (const BITMAPINFO*)G(ARG(1)), ARG(2), &bits, nullptr, 0);
    if (!b) RET(6, 0);
    gdi::Bitmap* bm = static_cast<gdi::Bitmap*>((gdi::Object*)b);   // the handle is the object (gdi.cpp track())
    uint32_t n = (uint32_t)bm->stride * (uint32_t)bm->h;
    uint32_t g = rc_halloc(n, 1);
    if (bm->owns) delete[] bm->bits;
    bm->bits = (uint8_t*)G(g);
    bm->owns = false;   // ponytail: the guest copy is never freed (DIB sections are made once per text texture)
    if (ARG(3)) WR32m(ARG(3), g);
    RET(6, gh(b));
}
GD(SetDIBitsToDevice) {
    RET(12, (uint32_t)SetDIBitsToDevice(HDCA(0), (int)ARG(1), (int)ARG(2), ARG(3), ARG(4), (int)ARG(5), (int)ARG(6),
                                        ARG(7), ARG(8), G(ARG(9)), (const BITMAPINFO*)G(ARG(10)), ARG(11)));
}
GD(GetSystemPaletteEntries) { RET(4, GetSystemPaletteEntries(HDCA(0), ARG(1), ARG(2), (LPPALETTEENTRY)G(ARG(3)))); }
GD(CreateFontA) {
    RET(14, gh(CreateFontA((int)ARG(0), (int)ARG(1), (int)ARG(2), (int)ARG(3), (int)ARG(4), ARG(5), ARG(6), ARG(7),
                           ARG(8), ARG(9), ARG(10), ARG(11), ARG(12), GS(ARG(13)))));
}
GD(CreateFontIndirectA) { RET(1, gh(CreateFontIndirectA((const LOGFONTA*)G(ARG(0))))); }
GD(GetTextMetricsA) { RET(2, GetTextMetricsA(HDCA(0), (LPTEXTMETRICA)G(ARG(1)))); }
GD(GetTextExtentPoint32W) {
    auto w = wide(ARG(1), (int)ARG(2));
    RET(4, GetTextExtentPoint32W(HDCA(0), w.data(), (int)ARG(2), (LPSIZE)G(ARG(3))));
}
GD(TextOutW) {
    auto w = wide(ARG(3), (int)ARG(4));
    RET(5, TextOutW(HDCA(0), (int)ARG(1), (int)ARG(2), w.data(), (int)ARG(4)));
}
GD(TextOutA) { RET(5, TextOutA(HDCA(0), (int)ARG(1), (int)ARG(2), GS(ARG(3)), (int)ARG(4))); }
GD(GetGlyphOutlineW) {
    RET(7, GetGlyphOutlineW(HDCA(0), ARG(1), ARG(2), (LPGLYPHMETRICS)G(ARG(3)), ARG(4), ARG(5) ? G(ARG(5)) : nullptr,
                            (const MAT2*)G(ARG(6))));
}
GD(CreateRectRgn) { RET(4, gh(CreateRectRgn((int)ARG(0), (int)ARG(1), (int)ARG(2), (int)ARG(3)))); }
GD(CombineRgn) { RET(4, (uint32_t)CombineRgn((HRGN)hh(ARG(0)), (HRGN)hh(ARG(1)), (HRGN)hh(ARG(2)), (int)ARG(3))); }
GD(BeginPath) { RET(1, BeginPath(HDCA(0))); }
GD(EndPath) { RET(1, EndPath(HDCA(0))); }
GD(CloseFigure) { RET(1, CloseFigure(HDCA(0))); }
GD(PathToRegion) { RET(1, gh(PathToRegion(HDCA(0)))); }
GD(MoveToEx) { RET(4, MoveToEx(HDCA(0), (int)ARG(1), (int)ARG(2), ARG(3) ? (LPPOINT)G(ARG(3)) : nullptr)); }
GD(LineTo) { RET(3, LineTo(HDCA(0), (int)ARG(1), (int)ARG(2))); }
