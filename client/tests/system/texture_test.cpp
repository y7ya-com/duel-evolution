// src/System texture layer: CD3DTextureManager sharing/refcounts, single texture vs tile grid, OneTexture.
#include <cassert>
#include <cstring>
#include <cstdio>
#include <map>
#include <string>
#include <vector>

#include "System/CTextureManager.h"

extern std::string g_d3dLog;
extern int g_texturesAlive;
extern std::map<std::string, std::vector<uint8_t>> g_fakeFiles;

static void image(const char* name, const char* spec) { g_fakeFiles[name].assign(spec, spec + std::strlen(spec)); }

int main() {
    g_d3d = new CD3DDevice;
    g_d3d->initialize(nullptr, 800, 600, false);
    image("small.png", "IMG 100 50");
    image("big.png", "IMG 600 300");

    // fits one 128x64 texture: one part covering the texture, UVs 0..1
    {
        OneTexture a, b;
        a.set("small.png");
        assert(a.loaded() && a.width() == 100 && a.height() == 50 && a.texWidth() == 128 && a.texHeight() == 64);
        const TexInfo* i = a.info();
        assert(i->partCount == 1 && i->parts[0].rect[2] == 128 && i->parts[0].uv[2] == 1);
        assert(g_d3dLog.find("TexFromFile") != std::string::npos && g_texturesAlive == 1);
        b.set("small.png");  // shared: no second texture
        assert(g_texturesAlive == 1 && b.info()->parts[0].tex == i->parts[0].tex);
        a.unload();
        assert(g_texturesAlive == 1);
    }
    assert(g_texturesAlive == 0);  // the last user released it

    // 600x300 with a 256 limit: 256-pixel tiles, 3 x 2, edge tiles partial
    {
        OneTexture t;
        t.set("big.png");
        TexInfo i = *t.info();
        assert(i.cols == 3 && i.rows == 2 && i.partCount == 6 && g_texturesAlive == 6);
        const TexPart& edge = i.parts[2];
        assert(edge.rect[0] == 512 && edge.rect[1] == 0 && edge.rect[2] == 256 && edge.rect[3] == 256);
        assert(edge.uv[2] == 88.0f / 256 && edge.uv[3] == 1);
        assert(i.parts[5].uv[3] == 44.0f / 256 && g_d3dLog.find("Blit(512,256,88x44)") != std::string::npos);
        assert(i.partAt(550, 280) == &i.parts[5] && i.partAt(10, 10) == &i.parts[0]);
        int32_t r[4], dx, dy;
        assert(i.clipToPart(1, 200, 100, 100, 50, r, &dx, &dy));  // straddles parts 0 and 1
        assert(r[0] == 0 && r[1] == 100 && r[2] == 44 && r[3] == 50 && dx == 256 && dy == 100);
        assert(!i.clipToPart(2, 0, 0, 10, 10, r, &dx, &dy));
    }
    assert(g_texturesAlive == 0);

    // blank textures
    {
        OneTexture t;
        t.create("canvas", 300, 20);
        assert(t.loaded() && t.texWidth() == 256 && t.texHeight() == 32 && t.width() == 300);
    }
    assert(g_texturesAlive == 0);
    CD3DDevice::release();
    std::puts("texture_test ok");
}
