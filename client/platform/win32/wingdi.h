// GDI: memory DCs, DIB sections, BitBlt, pixels, text (stb_truetype), regions and paths (gdi.cpp, font.cpp).
// What yaneSDK draws with GDI (fonts into DIBs, region building, the debug overlay) plus GetGlyphOutline, which the
// game's text textures use. A window DC is a memory surface nobody sees: the game presents through Direct3D.
#pragma once

// ---- objects and DCs
#define OBJ_BITMAP 7
#define OBJ_FONT 6
#define OBJ_REGION 8
HDC CreateCompatibleDC(HDC hdc);
BOOL DeleteDC(HDC hdc);
HDC GetDC(HWND hwnd);
HDC GetWindowDC(HWND hwnd);
int ReleaseDC(HWND hwnd, HDC hdc);
typedef struct tagPAINTSTRUCT {
    HDC hdc;
    BOOL fErase;
    RECT rcPaint;
    BOOL fRestore, fIncUpdate;
    BYTE rgbReserved[32];
} PAINTSTRUCT, *LPPAINTSTRUCT;
HDC BeginPaint(HWND hwnd, LPPAINTSTRUCT ps);
BOOL EndPaint(HWND hwnd, const PAINTSTRUCT* ps);
HGDIOBJ SelectObject(HDC hdc, HGDIOBJ obj);
BOOL DeleteObject(HGDIOBJ obj);

#define HORZRES 8
#define VERTRES 10
#define BITSPIXEL 12
#define PLANES 14
#define NUMCOLORS 24
#define RASTERCAPS 38
#define LOGPIXELSX 88
#define LOGPIXELSY 90
#define SIZEPALETTE 104
#define RC_BITBLT 1
#define RC_PALETTE 0x0100
int GetDeviceCaps(HDC hdc, int index);

// ---- bitmaps
#define DIB_RGB_COLORS 0
#define DIB_PAL_COLORS 1
HBITMAP CreateDIBSection(HDC hdc, const BITMAPINFO* bmi, UINT usage, void** bits, HANDLE section, DWORD offset);
HBITMAP CreateCompatibleBitmap(HDC hdc, int w, int h);
int SetDIBitsToDevice(HDC hdc, int xDest, int yDest, DWORD w, DWORD h, int xSrc, int ySrc, UINT startScan,
                      UINT lines, const void* bits, const BITMAPINFO* bmi, UINT usage);

#define SRCCOPY 0x00CC0020
#define SRCPAINT 0x00EE0086
#define SRCAND 0x008800C6
#define SRCINVERT 0x00660046
#define NOTSRCCOPY 0x00330008
#define DSTINVERT 0x00550009
#define BLACKNESS 0x00000042
#define WHITENESS 0x00FF0062
BOOL BitBlt(HDC dst, int x, int y, int w, int h, HDC src, int sx, int sy, DWORD rop);
COLORREF GetPixel(HDC hdc, int x, int y);
COLORREF SetPixel(HDC hdc, int x, int y, COLORREF c);

// ---- palettes (a true-colour device: nothing to realise)
#define PC_RESERVED 0x01
#define PC_EXPLICIT 0x02
#define PC_NOCOLLAPSE 0x04
UINT GetSystemPaletteEntries(HDC hdc, UINT start, UINT n, LPPALETTEENTRY entries);
UINT SetPaletteEntries(HPALETTE pal, UINT start, UINT n, const PALETTEENTRY* entries);
UINT RealizePalette(HDC hdc);

// ---- text
#define LF_FACESIZE 32
#define FW_DONTCARE 0
#define FW_THIN 100
#define FW_LIGHT 300
#define FW_NORMAL 400
#define FW_MEDIUM 500
#define FW_SEMIBOLD 600
#define FW_BOLD 700
#define FW_HEAVY 900
#define ANSI_CHARSET 0
#define DEFAULT_CHARSET 1
#define SHIFTJIS_CHARSET 128
#define HANGEUL_CHARSET 129
#define GB2312_CHARSET 134
#define CHINESEBIG5_CHARSET 136
#define OUT_DEFAULT_PRECIS 0
#define OUT_TT_PRECIS 4
#define CLIP_DEFAULT_PRECIS 0
#define DEFAULT_QUALITY 0
#define DRAFT_QUALITY 1
#define PROOF_QUALITY 2
#define NONANTIALIASED_QUALITY 3
#define ANTIALIASED_QUALITY 4
#define CLEARTYPE_QUALITY 5
#define DEFAULT_PITCH 0
#define FIXED_PITCH 1
#define VARIABLE_PITCH 2
#define FF_DONTCARE 0x00
#define FF_ROMAN 0x10
#define FF_SWISS 0x20
#define FF_MODERN 0x30
typedef struct tagLOGFONTA {
    LONG lfHeight, lfWidth, lfEscapement, lfOrientation, lfWeight;
    BYTE lfItalic, lfUnderline, lfStrikeOut, lfCharSet, lfOutPrecision, lfClipPrecision, lfQuality, lfPitchAndFamily;
    CHAR lfFaceName[LF_FACESIZE];
} LOGFONTA, *LPLOGFONTA, LOGFONT, *LPLOGFONT;
typedef struct tagLOGFONTW {
    LONG lfHeight, lfWidth, lfEscapement, lfOrientation, lfWeight;
    BYTE lfItalic, lfUnderline, lfStrikeOut, lfCharSet, lfOutPrecision, lfClipPrecision, lfQuality, lfPitchAndFamily;
    WCHAR lfFaceName[LF_FACESIZE];
} LOGFONTW, *LPLOGFONTW;
HFONT CreateFontA(int h, int w, int esc, int orient, int weight, DWORD italic, DWORD underline, DWORD strikeOut,
                  DWORD charset, DWORD outPrecision, DWORD clipPrecision, DWORD quality, DWORD pitchAndFamily,
                  LPCSTR face);
HFONT CreateFontW(int h, int w, int esc, int orient, int weight, DWORD italic, DWORD underline, DWORD strikeOut,
                  DWORD charset, DWORD outPrecision, DWORD clipPrecision, DWORD quality, DWORD pitchAndFamily,
                  LPCWSTR face);
HFONT CreateFontIndirectA(const LOGFONTA* lf);
HFONT CreateFontIndirectW(const LOGFONTW* lf);
#define CreateFont CreateFontA
#define CreateFontIndirect CreateFontIndirectA

typedef struct tagTEXTMETRICA {
    LONG tmHeight, tmAscent, tmDescent, tmInternalLeading, tmExternalLeading, tmAveCharWidth, tmMaxCharWidth, tmWeight,
        tmOverhang, tmDigitizedAspectX, tmDigitizedAspectY;
    BYTE tmFirstChar, tmLastChar, tmDefaultChar, tmBreakChar, tmItalic, tmUnderlined, tmStruckOut, tmPitchAndFamily,
        tmCharSet;
} TEXTMETRICA, *LPTEXTMETRICA, TEXTMETRIC, *LPTEXTMETRIC;
typedef struct tagTEXTMETRICW {
    LONG tmHeight, tmAscent, tmDescent, tmInternalLeading, tmExternalLeading, tmAveCharWidth, tmMaxCharWidth, tmWeight,
        tmOverhang, tmDigitizedAspectX, tmDigitizedAspectY;
    WCHAR tmFirstChar, tmLastChar, tmDefaultChar, tmBreakChar;
    BYTE tmItalic, tmUnderlined, tmStruckOut, tmPitchAndFamily, tmCharSet;
} TEXTMETRICW, *LPTEXTMETRICW;
BOOL GetTextMetricsA(HDC hdc, LPTEXTMETRICA tm);
BOOL GetTextMetricsW(HDC hdc, LPTEXTMETRICW tm);
#define GetTextMetrics GetTextMetricsA

#define TRANSPARENT 1
#define OPAQUE 2
COLORREF SetTextColor(HDC hdc, COLORREF c);
COLORREF SetBkColor(HDC hdc, COLORREF c);
int SetBkMode(HDC hdc, int mode);
// Text is drawn with its cell's top-left at (x, y) (TA_TOP | TA_LEFT); A forms use the font's code page.
BOOL TextOutA(HDC hdc, int x, int y, LPCSTR s, int n);
BOOL TextOutW(HDC hdc, int x, int y, LPCWSTR s, int n);
#define TextOut TextOutA
BOOL GetTextExtentPoint32A(HDC hdc, LPCSTR s, int n, LPSIZE size);
BOOL GetTextExtentPoint32W(HDC hdc, LPCWSTR s, int n, LPSIZE size);
#define GetTextExtentPoint32 GetTextExtentPoint32A

typedef struct _FIXED { WORD fract; short value; } FIXED;
typedef struct _MAT2 { FIXED eM11, eM12, eM21, eM22; } MAT2, *LPMAT2;
typedef struct _GLYPHMETRICS {
    UINT gmBlackBoxX, gmBlackBoxY;
    POINT gmptGlyphOrigin;
    short gmCellIncX, gmCellIncY;
} GLYPHMETRICS, *LPGLYPHMETRICS;
#define GGO_METRICS 0
#define GGO_BITMAP 1
#define GGO_GRAY2_BITMAP 4
#define GGO_GRAY4_BITMAP 5
#define GGO_GRAY8_BITMAP 6
#define GDI_ERROR 0xFFFFFFFF
// Rows top-down, each padded to a DWORD; GRAY8 coverage is 0..64, GRAY4 0..16, GRAY2 0..4, BITMAP 1 bit (MSB first).
// The matrix is ignored (the game passes the identity).
DWORD GetGlyphOutlineW(HDC hdc, UINT ch, UINT format, LPGLYPHMETRICS gm, DWORD bufSize, LPVOID buf, const MAT2* m);
DWORD GetGlyphOutlineA(HDC hdc, UINT ch, UINT format, LPGLYPHMETRICS gm, DWORD bufSize, LPVOID buf, const MAT2* m);
#define GetGlyphOutline GetGlyphOutlineA

// ---- regions and paths
#define ERROR 0
#define NULLREGION 1
#define SIMPLEREGION 2
#define COMPLEXREGION 3
#define RGN_AND 1
#define RGN_OR 2
#define RGN_XOR 3
#define RGN_DIFF 4
#define RGN_COPY 5
HRGN CreateRectRgn(int left, int top, int right, int bottom);
int CombineRgn(HRGN dst, HRGN a, HRGN b, int mode);
int GetRgnBox(HRGN r, LPRECT box);
BOOL PtInRegion(HRGN r, int x, int y);
BOOL BeginPath(HDC hdc);
BOOL EndPath(HDC hdc);
BOOL CloseFigure(HDC hdc);
BOOL MoveToEx(HDC hdc, int x, int y, LPPOINT old);
BOOL LineTo(HDC hdc, int x, int y);
HRGN PathToRegion(HDC hdc);   // alternate (even-odd) fill, pixel centres
