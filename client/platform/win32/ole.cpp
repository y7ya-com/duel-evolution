// See ole2.h / olectl.h.
#include <olectl.h>

#include <cstring>
#include <vector>

#include "gdi_internal.h"

#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-function"
#define STB_IMAGE_STATIC
#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"
#pragma GCC diagnostic pop

const IID IID_IPicture = {0x7BF80980, 0xBF32, 0x101A, {0x8B, 0xBB, 0x00, 0xAA, 0x00, 0x30, 0x0C, 0xAB}};

namespace {

struct MemStream : IStream {
    const uint8_t* p;
    ULONG refs = 1;
    explicit MemStream(const void* p) : p((const uint8_t*)p) {}
    ULONG AddRef() override { return ++refs; }
    ULONG Release() override {
        ULONG r = --refs;
        if (!r) delete this;
        return r;
    }
    HRESULT Read(void* dst, ULONG n, ULONG* got) override {
        memcpy(dst, p, n);
        p += n;
        if (got) *got = n;
        return S_OK;
    }
};

LONG himetric(int px) { return MulDiv(px, 2540, 96); }

struct Picture : IPicture {
    int w = 0, h = 0;
    std::vector<uint8_t> rgba;   // top-down
    ULONG refs = 1;
    ULONG AddRef() override { return ++refs; }
    ULONG Release() override {
        ULONG r = --refs;
        if (!r) delete this;
        return r;
    }
    HRESULT get_Width(OLE_XSIZE_HIMETRIC* v) override { return v ? (*v = himetric(w), S_OK) : E_FAIL; }
    HRESULT get_Height(OLE_YSIZE_HIMETRIC* v) override { return v ? (*v = himetric(h), S_OK) : E_FAIL; }
    HRESULT Render(HDC hdc, LONG x, LONG y, LONG cx, LONG cy, OLE_XPOS_HIMETRIC, OLE_YPOS_HIMETRIC,
                   OLE_XSIZE_HIMETRIC, OLE_YSIZE_HIMETRIC, LPCRECT) override {
        gdi::DC* d = gdi::dc(hdc);
        if (!d || cx <= 0 || cy <= 0) return E_FAIL;
        gdi::Bitmap* b = d->bmp;
        for (LONG j = 0; j < cy; j++) {
            LONG py = y + j;
            if (py < 0 || py >= b->h) continue;
            int sy = (int)((int64_t)j * h / cy);
            for (LONG i = 0; i < cx; i++) {
                LONG px = x + i;
                if (px < 0 || px >= b->w) continue;
                const uint8_t* s = &rgba[((size_t)sy * w + (size_t)((int64_t)i * w / cx)) * 4];
                b->put(px, py, RGB(s[0], s[1], s[2]));   // ponytail: alpha ignored (OLE's formats had none)
            }
        }
        return S_OK;
    }
};

}  // namespace

HRESULT CreateStreamOnHGlobal(HGLOBAL h, BOOL, LPSTREAM* out) {
    if (!h || !out) return E_FAIL;
    *out = new MemStream(h);
    return S_OK;
}

HRESULT OleInitialize(LPVOID) { return S_OK; }
void OleUninitialize() {}

HRESULT OleLoadPicture(LPSTREAM stream, LONG size, BOOL, REFIID iid, LPVOID* out) {
    if (!out) return E_FAIL;
    *out = nullptr;
    if (!stream || size <= 0 || iid != IID_IPicture) return E_FAIL;
    std::vector<uint8_t> bytes((size_t)size);
    stream->Read(bytes.data(), (ULONG)size, nullptr);
    int w, h, n;
    uint8_t* px = stbi_load_from_memory(bytes.data(), size, &w, &h, &n, 4);
    if (!px) return E_FAIL;   // CTL_E_INVALIDPICTURE on Windows
    Picture* p = new Picture;
    p->w = w;
    p->h = h;
    p->rgba.assign(px, px + (size_t)w * h * 4);
    stbi_image_free(px);
    *out = p;
    return S_OK;
}
