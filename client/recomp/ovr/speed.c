// Speed overrides: strong f_XXXXXXXX definitions replace the recompiled (weak) ones at link time. Each keeps the
// original's observable behaviour (same results, same guest calls that matter) and drops only work that cannot change
// it. Found by profiling the deck editor (RC_PROF); see recomp/README.md "Overrides".
#include "rt.h"
#include "rc_funcs.h"

// RC_NOSPEED=1 (A/B measurements): every override runs the recompiled original, kept as o_XXXXXXXX (ovr/orig.txt)
void o_005e1b90(CPU *restrict c), o_005e1710(CPU *restrict c), o_00589590(CPU *restrict c);
#include <stdlib.h>
#include <string.h>

// call a guest function at `fn` the way generated code does (return address pushed, callee pops its own arguments)
static void gcall(CPU *c, uint32_t fn, uint32_t ret) {
    PUSHm(c, ret);
    rc_icall(c, fn);
}

// ---- sprite draw order: std::sort of a scene's sprite list by z (MSVC6 <algorithm>, inlined into 0x5e1b90)
// The comparator 0x5e1710 is `z(b) < (float)z(a)` with z = virtual +0x20, but it also calls z twice more and runs four
// debug pointer checks per compare; the sort calls it O(n log n) times on every list change (40-50% of the editor's
// hitch frames). Here z is read once per sprite and the same algorithm (median of 3, unguarded partition, insertion
// sort below 16) runs on the cached keys, so the resulting order, ties included, is the original's.
typedef struct { uint32_t p; float a; double b; } Spr;   // a: z as a left operand (stored to a float), b: as a right one

static double sprite_z(CPU *c, uint32_t e) {
    c->ecx = e;
    gcall(c, RD32m(RD32m(e) + 0x20), 0x5e1737u);
    double z = c->st[c->ftop & 7];
    c->ftop = (c->ftop + 1) & 7;
    return z;
}
static int less_z(const Spr *x, const Spr *y) { return y->b < (double)x->a; }   // the comparator's P(x, y)

static const Spr *median3(const Spr *x, const Spr *y, const Spr *z) {
    if (less_z(x, y)) return less_z(y, z) ? y : less_z(x, z) ? z : x;
    return less_z(x, z) ? x : less_z(y, z) ? z : y;
}
static Spr *partition(Spr *f, Spr *l, Spr piv) {
    for (;; ++f) {
        while (less_z(f, &piv)) ++f;
        while (less_z(&piv, --l)) {}
        if (l <= f) return f;
        Spr t = *f; *f = *l; *l = t;
    }
}
static void unguarded_insert(Spr *l, Spr v) {
    for (Spr *m = l; less_z(&v, --m); l = m) *l = *m;
    *l = v;
}
static void insertion_sort(Spr *f, Spr *l) {
    if (f == l) return;
    for (Spr *m = f; ++m != l;) {
        Spr v = *m;
        if (!less_z(&v, f)) unguarded_insert(m, v);
        else { memmove(f + 1, f, (size_t)(m - f) * sizeof *f); *f = v; }
    }
}
static void quick(Spr *f, Spr *l) {   // 0x5e3820 (_Sort)
    while (l - f > 16) {
        Spr *m = partition(f, l, *median3(f, f + (l - f) / 2, l - 1));
        if (l - m <= m - f) { quick(m, l); l = m; }
        else { quick(f, m); f = m; }
    }
}

void f_005e1b90(CPU *restrict c) {   // thiscall: vector of sprite pointers at [ecx+4, ecx+8)
    if (rc_nospeed) { o_005e1b90(c); return; }
    uint32_t b = RD32m(c->ecx + 4), e = RD32m(c->ecx + 8), n = (e - b) / 4;
    static _Thread_local Spr *v;
    static _Thread_local uint32_t cap;
    if (n > 1) {
        if (n > cap) { free(v); cap = n * 2; v = malloc(cap * sizeof *v); }   // main thread only
        for (uint32_t i = 0; i < n; i++) {
            v[i].p = RD32m(b + 4 * i);
            v[i].b = sprite_z(c, v[i].p);
            v[i].a = (float)v[i].b;
        }
        if (n <= 16) insertion_sort(v, v + n);
        else {
            quick(v, v + n);
            insertion_sort(v, v + 16);
            for (Spr *p = v + 16; p != v + n; ++p) unguarded_insert(p, *p);
        }
        for (uint32_t i = 0; i < n; i++) WR32m(b + 4 * i, v[i].p);
    }
    c->ret_to = RD32m(c->esp);
    c->esp += 4;
}

void f_005e1710(CPU *restrict c) {   // the comparator itself (thiscall, ret 8), for any other caller
    if (rc_nospeed) { o_005e1710(c); return; }
    uint32_t a = RD32m(c->esp + 4), b = RD32m(c->esp + 8);
    float za = (float)sprite_z(c, a);
    double zb = sprite_z(c, b);
    c->eax = zb < (double)za;
    c->ret_to = RD32m(c->esp);
    c->esp += 12;
}

// ---- CD3DSprite::pixelPtr (0x589590, thiscall x, y, bytesPerPixel): the mouse hit test reads one texel. The original
// locks the WHOLE texture READONLY for it, which the runtime mirrors into guest memory (12% of the main thread). Lock
// just the texel's 4 bytes instead and hand back the same address arithmetic; any refused rect falls back to the
// original whole-texture lock.
// CD3DSpriteTrans::pixelPtr (0x588a50) is the same code with the texture at +0x94 and the size at +0x4d24: its whole
// texture copy was 10% of My Room's main thread (the room's sprites are CD3DSpriteTrans).
typedef struct { uint32_t tex, size, r_info, r_tile, r_lock, r_unlock; } PixelPtr;
static void pixel_ptr(CPU *restrict c, const PixelPtr *k) {
    uint32_t self = c->ecx, ret = RD32m(c->esp);
    int32_t x = (int32_t)RD32m(c->esp + 4), y = (int32_t)RD32m(c->esp + 8), bpp = (int32_t)RD32m(c->esp + 12);
    uint32_t result = 0, esi = c->esi, edi = c->edi;
    float fx = (float)x, fy = (float)y;
    if (x >= 0 && !(rc_rdf32(G(self + k->size)) < fx) && y >= 0 && !(rc_rdf32(G(self + k->size + 4)) < fy)) {
        c->ecx = self + k->tex;
        PUSHm(c, k->r_info); f_0059aa00(c);   // the texture's info
        uint32_t info = c->eax;
        if (info && *(uint8_t *)G(info + 0x5c)) {
            PUSHm(c, (uint32_t)y); PUSHm(c, (uint32_t)x); PUSHm(c, info);
            PUSHm(c, k->r_tile); f_0059b110(c);   // cdecl: the tile holding (x, y)
            c->esp += 12;
            uint32_t tile = c->eax, tex = RD32m(tile);
            if (*(uint8_t *)G(tile + 0x44) == 1) {
                int32_t lx = (int32_t)((double)fx - rc_rdf32(G(tile + 0x24)));   // _ftol truncates
                int32_t ly = (int32_t)((double)fy - rc_rdf32(G(tile + 0x28)));
                int32_t off = lx * bpp, px = off >= 0 ? off / 4 : -1;   // the runtime's lock layout is 4 bytes a texel
                uint32_t s = c->esp - 0x20;                             // scratch below the stack: D3DLOCKED_RECT, RECT
                c->esp = s;
                WR32m(s + 8, (uint32_t)px); WR32m(s + 12, (uint32_t)ly); WR32m(s + 16, (uint32_t)px + 1); WR32m(s + 20, (uint32_t)ly + 1);
                uint32_t lock = RD32m(RD32m(tex) + 0x40), unlock = RD32m(RD32m(tex) + 0x44);
                int32_t hr = -1;
                if (px >= 0 && ly >= 0) {
                    PUSHm(c, 0x10); PUSHm(c, s + 8); PUSHm(c, s); PUSHm(c, 0); PUSHm(c, tex);   // READONLY, that texel
                    gcall(c, lock, k->r_lock);
                    hr = (int32_t)c->eax;
                    if (hr >= 0) result = RD32m(s + 4) + (uint32_t)(off - px * 4);
                }
                if (hr < 0) {   // as the original: the whole texture
                    PUSHm(c, 0x10); PUSHm(c, 0); PUSHm(c, s); PUSHm(c, 0); PUSHm(c, tex);
                    gcall(c, lock, k->r_lock);
                    hr = (int32_t)c->eax;
                    if (hr >= 0) result = RD32m(s + 4) + (uint32_t)(ly * (int32_t)RD32m(s)) + (uint32_t)off;
                }
                if (hr >= 0) { PUSHm(c, 0); PUSHm(c, tex); gcall(c, unlock, k->r_unlock); }
                c->esp = s + 0x20;
            }
        }
    }
    c->esi = esi, c->edi = edi;
    c->eax = result;
    c->ret_to = ret;
    c->esp += 16;
}
// RC_PIXEL=compare: the original, then this on the same call; null or not and the texel's bytes must match
static void pixel_compare(CPU *restrict c, const PixelPtr *k, void (*orig)(CPU *restrict)) {
    uint32_t esp = c->esp, ecx = c->ecx, bpp = RD32m(esp + 12), n = bpp > 4 ? 4 : bpp;
    uint8_t a[4] = {0}, b[4] = {0}, args[12];
    memcpy(args, G(esp + 4), 12);   // the original stores float(y) over its own x argument
    orig(c);
    uint32_t ra = c->eax, ret_to = c->ret_to, esp_after = c->esp;
    if (ra) memcpy(a, G(ra), n);   // before this one's lock reuses the mirror
    c->esp = esp, c->ecx = ecx;
    memcpy(G(esp + 4), args, 12);
    pixel_ptr(c, k);
    if (c->eax) memcpy(b, G(c->eax), n);
    static unsigned calls, diffs;
    calls++;
    if ((!ra != !c->eax || memcmp(a, b, n)) && diffs++ < 20)
        rc_log("pixel compare: call %u (sprite %08x, %d, %d) differs: %08x %02x%02x%02x%02x vs %08x %02x%02x%02x%02x", calls,
               ecx, (int32_t)RD32m(esp + 4), (int32_t)RD32m(esp + 8), ra, a[0], a[1], a[2], a[3], c->eax, b[0], b[1], b[2], b[3]);
    if (!(calls & (calls - 1)) && calls >= 256) rc_log("pixel compare: %u calls, %u differ", calls, diffs);
    c->ret_to = ret_to, c->esp = esp_after;
}
static int pixel_mode(void) {   // 0 this, 1 the original, 2 both compared
    static int mode = -1;
    if (mode < 0) mode = rc_nospeed ? 1 : getenv("RC_PIXEL") && !strcmp(getenv("RC_PIXEL"), "compare") ? 2 : 0;
    return mode;
}
void o_00588a50(CPU *restrict c);
void f_00589590(CPU *restrict c) {
    static const PixelPtr k = {0x84, 0x4d14, 0x5895f2u, 0x589605u, 0x589624u, 0x58965fu};
    int mode = pixel_mode();
    if (mode == 1) o_00589590(c);
    else if (mode == 2) pixel_compare(c, &k, o_00589590);
    else pixel_ptr(c, &k);
}
void f_00588a50(CPU *restrict c) {
    static const PixelPtr k = {0x94, 0x4d24, 0x588ab2u, 0x588ac5u, 0x588ae4u, 0x588b1fu};
    int mode = pixel_mode();
    if (mode == 1) o_00588a50(c);
    else if (mode == 2) pixel_compare(c, &k, o_00588a50);
    else pixel_ptr(c, &k);
}

// ---- CD3DTextTexture::clearPage (0x58e970, stdcall page): lock the page, zero width x height texels, unlock. Its loop
// rereads both size globals for every texel (4-12% of a scene switch, which makes the scene's text pages); here one
// memset does the same stores between the same Lock and Unlock calls. A page of power-of-two sides is exactly that size
// (D3DXCreateTexture keeps it), so the memset covers the whole lock: D3DLOCK_DISCARD, the old texels aren't copied in.
void o_0058e970(CPU *restrict c);
void f_0058e970(CPU *restrict c) {
    if (rc_nospeed) { o_0058e970(c); return; }
    uint32_t ret = RD32m(c->esp), tex = RD32m(c->esp + 4), esi = c->esi, s = c->esp - 0x10;
    int32_t w = (int32_t)RD32m(0xc82ebc), h = (int32_t)RD32m(0xc82ec0);   // g_textPageWidth, g_textPageHeight
    uint32_t flags = w > 0 && h > 0 && !(w & (w - 1)) && !(h & (h - 1)) ? 0x2000 : 0;
    c->esp = s;   // the D3DLOCKED_RECT (pitch, bits), below the stack
    PUSHm(c, flags); PUSHm(c, 0); PUSHm(c, s); PUSHm(c, 0); PUSHm(c, tex);
    gcall(c, RD32m(RD32m(tex) + 0x40), 0x58e989u);   // LockRect(0, &lr, NULL, flags)
    if ((int32_t)c->eax >= 0) {
        int32_t n = w * h;
        if (n > 0) memset(G(RD32m(s + 4)), 0, (size_t)n * 4);
        PUSHm(c, 0); PUSHm(c, tex);
        gcall(c, RD32m(RD32m(tex) + 0x44), 0x58e9c7u);   // UnlockRect(0)
    }
    c->esp = s + 0x10;
    c->esi = esi;
    c->ret_to = ret;
    c->esp += 8;
}

// ---- __RTDynamicCast (0xb0b20e, cdecl: object, VfDelta, source type, target type, isReference): task accessors
// dynamic_cast on every use (8% of the main thread while loading). The result depends only on the subobject's vftable
// (complete type and position), VfDelta and the two types, so the offset (or "fails") is cached per thread and the
// original runs only the first time. Null stays null; a failing reference cast still goes to the original (bad_cast).
void o_00b0b20e(CPU *restrict c);
void f_00b0b20e(CPU *restrict c) {
    static _Thread_local struct { uint32_t vf, vfdelta, src, dst; int32_t delta; uint8_t ok; } cache[1024];
    uint32_t ret = RD32m(c->esp), obj = RD32m(c->esp + 4), vfdelta = RD32m(c->esp + 8), src = RD32m(c->esp + 12),
             dst = RD32m(c->esp + 16), ref = RD32m(c->esp + 20);
    uint32_t vf = obj && !rc_nospeed ? RD32m(obj) : 0;
    unsigned h = (vf >> 3 ^ src >> 2 ^ dst << 1 ^ vfdelta) & 1023;
    if (vf && cache[h].vf == vf && cache[h].vfdelta == vfdelta && cache[h].src == src && cache[h].dst == dst &&
        (cache[h].ok || !ref)) {
        c->eax = cache[h].ok ? obj + (uint32_t)cache[h].delta : 0;
        c->ret_to = ret;
        c->esp += 4;
        return;
    }
    o_00b0b20e(c);
    if (!vf || c->ret_to != ret) return;   // thrown (bad_cast, __non_rtti_object): nothing to remember
    cache[h].vf = vf, cache[h].vfdelta = vfdelta, cache[h].src = src, cache[h].dst = dst;
    cache[h].ok = c->eax != 0;
    cache[h].delta = (int32_t)(c->eax - obj);
}

// ---- debug checks off (RC_ASSERTS=1 keeps them). Every check in the exe is
//     if (flag == 0 && check_fails) { if (!report(&flag, text, file, line)) abort(); }
// with report = 0x60cff0 (or its thunk 0x410514) and a one-byte flag per check that the exe only reads. With the flag
// set the condition stops before evaluating the check (task pointer validation on every CTask::Call, the sort
// comparator's, ...). The flags are found in the code itself: `push offset flag` (in 0x126f000-0x12be000) followed
// within 17 bytes by a call to report. A real failure is no longer reported (the game may crash later instead).
void rc_ovr_init(void) {
    if (getenv("RC_ASSERTS") || rc_nospeed) return;
    const uint8_t *code = G(0x401000);
    const uint32_t size = 0x7e30d3;
    unsigned n = 0;
    for (uint32_t i = 0; i + 25 < size; i++) {
        if (code[i] != 0x68) continue;
        uint32_t v = rc_rd32(code + i + 1);
        if (v < 0x126f000u || v >= 0x12be000u) continue;
        for (uint32_t q = i + 5; q < i + 22; q++) {
            if (code[q] != 0xe8) continue;
            uint32_t to = 0x401000u + q + 5 + rc_rd32(code + q + 1);
            if (to != 0x410514u && to != 0x60cff0u) continue;
            uint8_t *flag = G(v);
            if (!*flag) *flag = 1, n++;
            break;
        }
    }
    // flags the scan misses (their push is further from the call than 17 bytes): CTextureManager's load (0x59de80)
    // asserts at 0x59e078 on a texture missing from the game files (line 784); with the report the game ended (fatal
    // MessageBox, ExitProcess(1)) on the structure-deck list's empty "data/MINI/" name (live, 2026-10-31). Past the
    // check it goes on with an empty texture entry.
    static const uint32_t more[] = { 0x126f9b2 };
    for (unsigned k = 0; k < sizeof more / sizeof *more; k++)
        if (!rc_mem[more[k]]) rc_mem[more[k]] = 1, n++;
    rc_log("speed: %u debug checks off (RC_ASSERTS=1 keeps them)", n);
}
