// src/System CD3DSprite: vertex positions/UVs per texture part, source clipping, mirroring, pixel lookup.
#include <cassert>
#include <cstdio>
#include <cstring>
#include <map>
#include <string>
#include <vector>

#include "System/CD3DSprite.h"

struct FakeDraw {
    IDirect3DTexture8* tex;
    std::vector<float> v;
};
extern std::vector<FakeDraw> g_draws;
extern std::map<std::string, std::vector<uint8_t>> g_fakeFiles;

static void image(const char* name, const char* spec) { g_fakeFiles[name].assign(spec, spec + std::strlen(spec)); }
// vertex i of a draw: x y z color u v
static float at(const FakeDraw& d, int vert, int field) { return d.v[vert * 6 + field]; }

int main() {
    g_d3d = new CD3DDevice;
    g_d3d->initialize(nullptr, 800, 600, false);
    image("icon.png", "IMG 100 50");
    image("big.png", "IMG 600 300");
    {
        CD3DSprite s;
        s.setTexture("icon.png");
        assert(s.imageWidth() == 100 && s.source()[2] == 100 && s.dest()[3] == 50);
        s.setColor(0x80ff0000);
        g_draws.clear();
        s.draw(10, 20);
        assert(g_draws.size() == 1);
        const FakeDraw& d = g_draws[0];
        // one 128x64 part: quad at (10,20) of the image size, UVs to 100/128, 50/64
        assert(at(d, 0, 0) == 10 && at(d, 0, 1) == 20 && at(d, 3, 0) == 110 && at(d, 3, 1) == 70);
        assert(at(d, 3, 4) == 100.0f / 128 && at(d, 3, 5) == 50.0f / 64);
        uint32_t c;
        std::memcpy(&c, &d.v[3], 4);
        assert(c == 0x80ff0000);

        // a source sub-rect moves the quad by the clipped offset
        g_draws.clear();
        s.draw(0, 0, 20, 10, 30, 5, 20, 10);
        assert(at(g_draws[0], 0, 0) == 0 && at(g_draws[0], 0, 4) == 30.0f / 128 && at(g_draws[0], 1, 0) == 20);

        // mirrored world matrix: UVs shift one texel left
        D3DMATRIX m = {{{-1, 0, 0, 0}, {0, 1, 0, 0}, {0, 0, 1, 0}, {0, 0, 0, 1}}};
        g_draws.clear();
        s.draw(&m, 100, 50, 0, 0, 100, 50);
        assert(at(g_draws[0], 0, 4) == -1.0f / 128);

        assert(s.pixelPtr(5, 5, 4) != nullptr && s.pixelPtr(-1, 0, 4) == nullptr);
    }
    {
        // a 600x300 image in 256 tiles: drawing the whole source touches all six parts
        CD3DSprite s;
        s.setTexture("big.png");
        g_draws.clear();
        s.draw(0, 0);
        assert(g_draws.size() == 6);
        const FakeDraw& last = g_draws[5];  // part (512, 256): 88 x 44 of a 256 tile
        assert(at(last, 0, 0) == 512 && at(last, 0, 1) == 256 && at(last, 3, 0) == 600 && at(last, 3, 1) == 300);
        assert(at(last, 3, 4) == 88.0f / 256);
        // a source rect inside one tile draws one part
        g_draws.clear();
        s.draw(0, 0, 50, 50, 300, 10, 50, 50);
        assert(g_draws.size() == 1 && at(g_draws[0], 0, 4) == 44.0f / 256);
    }
    CD3DDevice::release();
    std::puts("sprite_test ok");
}
