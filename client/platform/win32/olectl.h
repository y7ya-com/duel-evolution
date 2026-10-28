// IPicture / OleLoadPicture on stb_image (ole.cpp): BMP, JPEG, GIF and PNG, which is more than OLE itself decoded.
#pragma once
#include "ole2.h"

typedef LONG OLE_XSIZE_HIMETRIC, OLE_YSIZE_HIMETRIC, OLE_XPOS_HIMETRIC, OLE_YPOS_HIMETRIC;
typedef LONG OLE_XPOS_PIXELS, OLE_YPOS_PIXELS;

struct IPicture : IUnknown {
    virtual HRESULT get_Width(OLE_XSIZE_HIMETRIC* w) = 0;    // HIMETRIC: pixels * 2540 / 96
    virtual HRESULT get_Height(OLE_YSIZE_HIMETRIC* h) = 0;
    // Draws the picture scaled to (cx, cy) at (x, y). The source rectangle is the usual whole picture, given
    // bottom-up (ySrc = height, cySrc = -height): drawn upright. ponytail: other source rectangles are drawn whole.
    virtual HRESULT Render(HDC hdc, LONG x, LONG y, LONG cx, LONG cy, OLE_XPOS_HIMETRIC xSrc, OLE_YPOS_HIMETRIC ySrc,
                           OLE_XSIZE_HIMETRIC cxSrc, OLE_YSIZE_HIMETRIC cySrc, LPCRECT bounds) = 0;
};
typedef IPicture* LPPICTURE;
extern const IID IID_IPicture;

HRESULT OleLoadPicture(LPSTREAM stream, LONG size, BOOL keepOriginalFormat, REFIID iid, LPVOID* out);
