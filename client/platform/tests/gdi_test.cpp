// The GDI / text stand-ins (win32/gdi.cpp, font.cpp, text.cpp, ole.cpp), natively and under Node:
//   build/platform/gdi_test        node build-web/platform/gdi_test.js
#include <windows.h>
#include <olectl.h>

#include <cstdio>
#include <cstring>
#include <vector>

static int failures;
static void check(bool ok, const char* what) {
    printf("%s %s\n", ok ? "ok  " : "FAIL", what);
    if (!ok) failures++;
}

static HBITMAP dib(int w, int h, int bpp, void** bits, const RGBQUAD* pal = nullptr) {
    struct { BITMAPINFOHEADER h; RGBQUAD c[256]; } bi = {};
    bi.h = {sizeof(BITMAPINFOHEADER), w, -h, 1, (WORD)bpp, BI_RGB, 0, 0, 0, 0, 0};
    if (pal) memcpy(bi.c, pal, sizeof bi.c);
    return CreateDIBSection(nullptr, (BITMAPINFO*)&bi, DIB_RGB_COLORS, bits, nullptr, 0);
}

static int lit(const uint32_t* px, int n, uint32_t bg) {
    int k = 0;
    for (int i = 0; i < n; i++) k += (px[i] & 0xFFFFFF) != bg;
    return k;
}

int main() {
    // ---- code pages
    const char sjis[] = "\x88\x9f\xb1" "A";   // 亜, halfwidth ｱ, A
    WCHAR w[8];
    int n = MultiByteToWideChar(932, 0, sjis, -1, w, 8);
    check(n == 4 && w[0] == 0x4E9C && w[1] == 0xFF71 && w[2] == 'A' && w[3] == 0, "cp932 -> UTF-16 (亜, ｱ, A, NUL)");
    char back[8];
    n = WideCharToMultiByte(932, 0, w, -1, back, 8, nullptr, nullptr);
    check(n == 5 && !memcmp(back, sjis, 5), "UTF-16 -> cp932 round trip");
    check(MultiByteToWideChar(932, 0, sjis, -1, w, 2) == 0 && GetLastError() == 122, "too small a buffer: 0 + ERROR_INSUFFICIENT_BUFFER");
    n = MultiByteToWideChar(1252, 0, "\x80\xe9", 2, w, 8);
    check(n == 2 && w[0] == 0x20AC && w[1] == 0xE9, "cp1252: euro sign, e acute");
    BOOL used;
    WCHAR kanji[] = {0x4E9C, 0};
    n = WideCharToMultiByte(1252, 0, kanji, -1, back, 8, nullptr, &used);
    check(n == 2 && back[0] == '?' && used, "no such character in 1252: '?' and usedDefault");

    // ---- wsprintf: Windows' %s / %S
    WCHAR wb[64];
    wsprintfW(wb, L"%s=%d %S", L"hp", 8000, "lp");
    check(!wcscmp(wb, L"hp=8000 lp"), "wsprintfW: %s wide, %S narrow");
    char nb[64];
    wsprintfA(nb, "%s/%S", "a", L"b");
    check(!strcmp(nb, "a/b"), "wsprintfA: %s narrow, %S wide");

    // ---- DIB sections, BitBlt, pixels
    uint32_t* px;
    HBITMAP b32 = dib(64, 32, 32, (void**)&px);
    HDC dc = CreateCompatibleDC(nullptr);
    HGDIOBJ oldBmp = SelectObject(dc, b32);
    check(b32 && px && oldBmp, "32 bpp DIB section selected into a memory DC");
    SetPixel(dc, 3, 2, RGB(10, 20, 30));
    check(px[2 * 64 + 3] == 0x000A141E && GetPixel(dc, 3, 2) == RGB(10, 20, 30), "SetPixel writes BGRX, GetPixel reads it back");
    RGBQUAD pal[256] = {};
    pal[1] = RGBQUAD{0, 0, 255, 0};   // red
    uint8_t* p8;
    HBITMAP b8 = dib(4, 4, 8, (void**)&p8, pal);
    HDC dc8 = CreateCompatibleDC(nullptr);
    SelectObject(dc8, b8);
    p8[1 * 4 + 2] = 1;
    BitBlt(dc, 10, 10, 4, 4, dc8, 0, 0, SRCCOPY);
    check(px[11 * 64 + 12] == 0x00FF0000 && px[10 * 64 + 10] == 0, "BitBlt 8 bpp (palette) -> 32 bpp");
    BitBlt(dc, 0, 0, 2, 2, nullptr, 0, 0, WHITENESS);
    check(px[0] == 0x00FFFFFF && px[1 * 64 + 1] == 0x00FFFFFF && px[2] == 0, "WHITENESS fills, clipped to w x h");
    memset(px, 0, 64 * 32 * 4);

    // ---- fonts
    HFONT f = CreateFontW(16, 0, 0, 0, FW_NORMAL, 0, 0, 0, SHIFTJIS_CHARSET, 0, 0, NONANTIALIASED_QUALITY, 0, L"MS Gothic");
    HGDIOBJ oldFont = SelectObject(dc, f);
    TEXTMETRICW tm;
    GetTextMetricsW(dc, &tm);
    check(tm.tmHeight == 16 && tm.tmAscent > tm.tmDescent && tm.tmAscent + tm.tmDescent == 16,
          "lfHeight 16 = a 16 px cell (ascent + descent)");
    SIZE sz;
    GetTextExtentPoint32W(dc, L"Ab", 2, &sz);
    char buf[160];
    snprintf(buf, sizeof buf, "GetTextExtentPoint32W(\"Ab\") = %ld x %ld", (long)sz.cx, (long)sz.cy);
    check(sz.cx >= 8 && sz.cx <= 24 && sz.cy == 16, buf);
    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, RGB(255, 255, 255));
    TextOutW(dc, 2, 4, L"\x4E9C" L"A", 2);   // 亜A
    int on = lit(px, 64 * 32, 0);
    bool inCell = true, binary = true;
    for (int y = 0; y < 32; y++)
        for (int x = 0; x < 64; x++) {
            uint32_t v = px[y * 64 + x] & 0xFFFFFF;
            if (v && (y < 4 || y >= 20)) inCell = false;
            if (v && v != 0xFFFFFF) binary = false;
        }
    snprintf(buf, sizeof buf, "TextOutW draws 亜A: %d pixels lit, all inside the cell, 1-bit (non-antialiased)", on);
    check(on > 30 && inCell && binary, buf);

    SetBkMode(dc, OPAQUE);
    SetBkColor(dc, RGB(0, 0, 255));
    TextOutA(dc, 40, 4, "\x88\x9f", 2);   // 亜 in Shift-JIS through the font's code page
    check(px[4 * 64 + 40] == 0x000000FF || px[4 * 64 + 40] == 0x00FFFFFF, "TextOutA (cp932) with OPAQUE fills the cell");

    GLYPHMETRICS gm;
    MAT2 id = {{0, 1}, {0, 0}, {0, 0}, {0, 1}};
    DWORD size = GetGlyphOutlineW(dc, 0x4E9C, GGO_GRAY8_BITMAP, &gm, 0, nullptr, &id);
    std::vector<uint8_t> g(size);
    DWORD got = GetGlyphOutlineW(dc, 0x4E9C, GGO_GRAY8_BITMAP, &gm, size, g.data(), &id);
    uint8_t top = 0;
    for (uint8_t v : g) top = v > top ? v : top;
    DWORD pitch = (gm.gmBlackBoxX + 3) & ~3u;
    snprintf(buf, sizeof buf, "GetGlyphOutlineW GRAY8: %ux%u box, origin (%ld,%ld), advance %d, levels up to %u",
             gm.gmBlackBoxX, gm.gmBlackBoxY, (long)gm.gmptGlyphOrigin.x, (long)gm.gmptGlyphOrigin.y, gm.gmCellIncX, top);
    // no hinting: thin strokes between pixel rows peak below full coverage (GDI snaps them to 64)
    check(size && got == size && size == pitch * gm.gmBlackBoxY && top > 32 && top <= 64 && gm.gmCellIncX >= 12 &&
              gm.gmptGlyphOrigin.y <= tm.tmAscent,
          buf);
    check(GetGlyphOutlineW(dc, ' ', GGO_GRAY8_BITMAP, &gm, 0, nullptr, &id) == 0 && gm.gmCellIncX > 0,
          "a space: no bitmap, still an advance");
    SelectObject(dc, oldFont);
    DeleteObject(f);

    // ---- regions and paths
    HRGN a = CreateRectRgn(0, 0, 10, 10), b = CreateRectRgn(5, 5, 15, 15), r = CreateRectRgn(0, 0, 0, 0);
    check(CombineRgn(r, a, b, RGN_OR) == COMPLEXREGION && PtInRegion(r, 12, 12) && !PtInRegion(r, 12, 2),
          "RGN_OR of two overlapping squares");
    RECT box;
    GetRgnBox(r, &box);
    check(box.left == 0 && box.top == 0 && box.right == 15 && box.bottom == 15, "GetRgnBox");
    check(CombineRgn(r, a, b, RGN_DIFF) == COMPLEXREGION && PtInRegion(r, 2, 2) && !PtInRegion(r, 7, 7),
          "RGN_DIFF cuts the corner out");
    check(CombineRgn(r, a, b, RGN_AND) == SIMPLEREGION && PtInRegion(r, 7, 7), "RGN_AND is the overlap");
    BeginPath(dc);
    MoveToEx(dc, 2, 3, nullptr);
    LineTo(dc, 8, 3);
    LineTo(dc, 8, 6);
    LineTo(dc, 2, 6);
    CloseFigure(dc);
    EndPath(dc);
    HRGN pr = PathToRegion(dc);
    GetRgnBox(pr, &box);
    check(box.left == 2 && box.top == 3 && box.right == 8 && box.bottom == 6, "PathToRegion of a rectangle");
    DeleteObject(a);
    DeleteObject(b);
    DeleteObject(r);
    DeleteObject(pr);

    // ---- OLE picture: a 2x1 24 bpp BMP (red, green) loaded and rendered upright at 2x
    uint8_t bmp[62] = {'B', 'M'};
    *(uint32_t*)(bmp + 2) = sizeof bmp;
    *(uint32_t*)(bmp + 10) = 54;
    BITMAPINFOHEADER ih = {40, 2, 1, 1, 24, BI_RGB, 8, 0, 0, 0, 0};
    memcpy(bmp + 14, &ih, 40);
    const uint8_t pixels[8] = {0, 0, 255, 0, 255, 0, 0, 0};   // BGR red, BGR green, row padding
    memcpy(bmp + 54, pixels, 8);
    LPSTREAM st;
    IPicture* pic = nullptr;
    CreateStreamOnHGlobal((HGLOBAL)bmp, FALSE, &st);
    HRESULT hr = OleLoadPicture(st, sizeof bmp, TRUE, IID_IPicture, (void**)&pic);
    st->Release();
    LONG hw = 0, hh = 0;
    if (pic) { pic->get_Width(&hw); pic->get_Height(&hh); }
    check(hr == S_OK && pic && hw == MulDiv(2, 2540, 96) && hh == MulDiv(1, 2540, 96), "OleLoadPicture: 2x1 BMP, size in HIMETRIC");
    memset(px, 0, 64 * 32 * 4);
    if (pic) pic->Render(dc, 0, 0, 4, 2, 0, hh, hw, -hh, nullptr);
    check(px[0] == 0x00FF0000 && px[1] == 0x00FF0000 && px[2] == 0x0000FF00 && px[64 + 3] == 0x0000FF00,
          "IPicture::Render scales 2x, left red, right green");
    if (pic) pic->Release();

    SelectObject(dc, oldBmp);
    DeleteDC(dc);
    DeleteDC(dc8);
    check(DeleteObject(b32) && DeleteObject(b8) && !DeleteObject((HGDIOBJ)&failures), "DeleteObject: ours yes, a stray pointer no");

    printf(failures ? "FAILED %d\n" : "PASS\n", failures);
    return failures ? 1 : 0;
}
