// crash #17: a card texture the game releases while the device still has it bound dies on the device's next
// SetTexture; its guest shell must answer "gone" afterwards (rc_texture_fill -1), not the freed texture.
// make d3d8_test (ASan: before 8a4f371 the shim reported a heap-use-after-free in rc_texture_fill)
#include "d3d8.cpp"   // the shim's internals (wrap, any_Release) with platform/gfx's real texture

#include <cassert>
#include <cstdarg>

static uint8_t mem[1 << 16];
uint8_t* rc_mem = mem;
static uint32_t brk = 0x1000;
extern "C" uint32_t rc_palloc(uint32_t n) { uint32_t p = brk; brk += (n + 15) & ~15u; return p; }
extern "C" uint32_t rc_hsize(uint32_t) { return 0; }
extern "C" void rc_log(const char* f, ...) { va_list a; va_start(a, f); vprintf(f, a); va_end(a); puts(""); }
int rc_game_w, rc_game_h, rc_render_frame = 1, rc_nospeed;   // the rest of the runtime: unused here
extern "C" void rc_imgfail(const char*, uint32_t, const char*, uint32_t, uint32_t) {}
extern "C" void rc_ovr_frame(CPU*) {}
extern "C" void rc_present_hook(void) {}
extern "C" void rc_scene_present(void) {}
extern "C" void backtrace_guest(CPU*) {}
uint32_t rc_vtable(std::initializer_list<RcSlot>) { return 0; }
FILE* win32_fopen(const char*, const char*) { return nullptr; }
void platformPresent() {}
void platformDrawableSize(int*, int*) {}

int main() {
    auto* t = new IDirect3DTexture8;   // as IDirect3DDevice8::CreateTexture makes it (no GL until a draw)
    t->level0.owner = t, t->level0.w = t->level0.h = 2, t->level0.fmt = D3DFMT_A8R8G8B8;
    t->shadow.assign(16, 0);
    uint32_t g = wrap(t, vt_tex);
    t->AddRef();   // SetTexture(0, t): the device's reference

    CPU c{};
    c.esp = 0x8000;   // Release(g): [ret][this]
    WR32m(c.esp, 0x1234), WR32m(c.esp + 4, g);
    any_Release(&c);
    assert(c.eax == 1);   // the game's last reference: still bound

    t->Release();   // SetTexture(0, other): the texture dies here
    uint8_t px[16] = {};
    assert(rc_texture_fill(g, px, 2, 2, nullptr, 0, 1) == -1);   // its late art finds it gone
    puts("d3d8_test: ok");
}
