// A texture load that fails says which file: CD3DTextureManager's loader (0x59de80, arg 1 a struct whose +4 is the
// name, null = the default at 0xbe5000) runs D3DX on the file's bytes, and its asserts are compiled out, so a failure
// (CreateImageSurface got 0x0 from D3DXGetImageInfoFromFileInMemory) went on to a null surface and crashed at 0x59e824
// with nothing naming the file. Each failing D3DX call, and CreateImageSurface (rt/d3d8.cpp), logs one line with the
// HRESULT, the size, the first bytes and the file being loaded on this thread; 16 a run at most.
#include "rt.h"
#include "rc_funcs.h"
#include <stdio.h>
#include <string.h>

void o_0059de80(CPU *restrict c);
void o_00b3d5f6(CPU *restrict c);
void o_00b3eb13(CPU *restrict c);

static _Thread_local uint32_t loading;   // the name's guest address while this thread is in 0x59de80

void rc_imgfail(const char *what, uint32_t hr, const char *detail, uint32_t data, uint32_t size) {
    static int n;
    if (n >= 16) return;
    n++;
    char head[3 * 8 + 1] = "";
    for (uint32_t i = 0; data && i < size && i < 8; i++) snprintf(head + 3 * i, 4, " %02x", rc_mem[data + i]);
    rc_log("image load failed: %s hr %08x%s%s, %u bytes%s, file %.160s", what, hr, *detail ? " " : "", detail, size, head,
           loading ? GS(loading) : "?");
}

// rt/d3d8.cpp: the texture being made is a cursor image (data/common/m_cursor/mausuk_*), for the web's own cursor
int rc_loading_cursor(void) { return loading && strstr(GS(loading), "mausuk") != NULL; }

void f_0059de80(CPU *restrict c) {
    uint32_t arg = RD32m(c->esp + 4), was = loading;
    loading = arg ? RD32m(arg + 4) ? RD32m(arg + 4) : 0xbe5000u : 0;
    o_0059de80(c);
    loading = was;
}

// D3DXCheckTextureRequirements(dev, &w, &h, &levels, usage, &fmt, pool)
void f_00b3d5f6(CPU *restrict c) {
    uint32_t w = RD32m(c->esp + 8), h = RD32m(c->esp + 12);
    o_00b3d5f6(c);
    if (!c->eax) return;
    char d[48];
    snprintf(d, sizeof d, "size %ux%u", w ? RD32m(w) : 0, h ? RD32m(h) : 0);
    rc_imgfail("D3DXCheckTextureRequirements", c->eax, d, 0, 0);
}

// D3DXLoadSurfaceFromFileInMemory(dst, pal, dstRect, data, size, srcRect, filter, key, info)
void f_00b3eb13(CPU *restrict c) {
    uint32_t data = RD32m(c->esp + 16), size = RD32m(c->esp + 20);
    o_00b3eb13(c);
    if (c->eax) rc_imgfail("D3DXLoadSurfaceFromFileInMemory", c->eax, "", data, size);
}
