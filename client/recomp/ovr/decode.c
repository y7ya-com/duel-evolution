// Image decode: the exe's static D3DX decodes every texture through D3DXCreateTextureFromFileInMemoryEx (0xb400b3),
// recompiled IJG libjpeg/libpng on the calling thread. The texture manager calls it with one fixed shape (one level,
// A8R8G8B8, no filtering, no colour key, the texture at least the image's size); that shape is decoded here by stb_image
// and written through the same device calls (CreateTexture, LockRect, UnlockRect). Anything else, or anything stb
// refuses, runs the original (o_00b400b3).
//   RC_DECODE=orig     the original always
//   RC_DECODE=compare  the original, then this decoder on the same bytes, compared texel by texel (logged per format)
//   RC_DECODE_LOG=1    per-call timing and totals
#include "rt.h"
#include "rc_funcs.h"
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#ifdef __EMSCRIPTEN__
#include <emscripten/threading.h>
#endif

#define STB_IMAGE_STATIC
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_JPEG
#define STBI_ONLY_PNG
#define STBI_NO_STDIO
#define STBI_NO_LINEAR
#define STBI_NO_HDR
#include "../../platform/third_party/stb_image.h"

void o_00b400b3(CPU *restrict c);
void o_00b3ced6(CPU *restrict c);
int rc_render_scale(void);                                                  // rt/d3d8.cpp
void rc_texture_hq(uint32_t tex, const uint8_t *bgra, size_t n, int scale);

// 2x card art (tools/cardart.py: merge/data/card.dat 400x580, mini.dat 100x144, JPEG). The game lays it out at its
// 1x size (200x290, 50x72); the texture's GL pixels are the 2x ones when the render scale is 2 (platform/gfx).
// ponytail: the sizes are the marker (no 2008 image has them); a tag in the file if other 2x assets ever come
static int hq_card(uint32_t w, uint32_t h) { return (w == 400 && h == 580) || (w == 100 && h == 144); }

// D3DXGetImageInfoFromFileInMemory(data, size, info): 2x card art reports its 1x size
void f_00b3ced6(CPU *restrict c) {
    uint32_t info = RD32m(c->esp + 12);
    o_00b3ced6(c);
    if (c->eax || !info || !hq_card(RD32m(info), RD32m(info + 4))) return;
    WR32m(info, RD32m(info) / 2);
    WR32m(info + 4, RD32m(info + 4) / 2);
}

enum { MODE_NEW, MODE_ORIG, MODE_COMPARE };
static int mode = -1, logging;

static double now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1e3 + ts.tv_nsec / 1e6;
}

// D3DX's libpng gamma-corrects a file whose gAMA differs from the 2.2 display by libpng's threshold (5%): a gAMA 1.0
// file came out up to 72 levels brighter than stb's. Those go to the original; the usual gAMA 0.45455 is a no-op there.
static int png_plain(const uint8_t *p, uint32_t n) {
    for (uint32_t i = 8; i + 12 <= n;) {
        uint32_t len = (uint32_t)p[i] << 24 | p[i + 1] << 16 | p[i + 2] << 8 | p[i + 3];
        const uint8_t *t = p + i + 4;
        if (!memcmp(t, "IDAT", 4)) return 1;
        if (len > n - i - 12) return 0;
        if (!memcmp(t, "gAMA", 4) && len == 4) {
            double g = (double)((uint32_t)t[4] << 24 | t[5] << 16 | t[6] << 8 | t[7]) / 100000;
            if (fabs(g * 2.2 - 1) >= 0.05) return 0;
        }
        i += 12 + len;
    }
    return 0;
}

static const char *kind(const uint8_t *p, uint32_t n) {
    if (n >= 3 && p[0] == 0xff && p[1] == 0xd8) return "jpeg";
    if (n >= 8 && !memcmp(p, "\x89PNG", 4)) return png_plain(p, n) ? "png" : "other";
    return "other";
}

// guest stdcall through a COM vtable slot: arguments pushed last to first, `this` first
static uint32_t com(CPU *c, uint32_t obj, uint32_t slot, int n, const uint32_t *args) {
    for (int i = n - 1; i >= 0; i--) PUSHm(c, args[i]);
    PUSHm(c, obj);
    PUSHm(c, 0x59e3f5u);
    rc_icall(c, RD32m(RD32m(obj) + slot * 4));
    return c->eax;
}

// ponytail: unlocked counters (loader threads race them); they only feed the log
static struct { unsigned calls, fast, same, differ; double ms; } st[3];   // jpeg, png, other

double rc_decode_ms;   // decode time on the page's main thread since the last frame (rt/web.c -> web/stall.js)

static void tally(const char *k, double ms, int fast) {
#ifdef __EMSCRIPTEN__
    if (emscripten_is_main_runtime_thread()) rc_decode_ms += ms;
#endif
    int i = k[0] == 'j' ? 0 : k[0] == 'p' ? 1 : 2;
    st[i].calls++, st[i].fast += fast, st[i].ms += ms;
    if (logging && (st[0].calls + st[1].calls + st[2].calls) % 50 == 0)
        rc_log("decode: jpeg %u (%u fast, %.0f ms) png %u (%u fast, %.0f ms) other %u (%.0f ms)", st[0].calls, st[0].fast,
               st[0].ms, st[1].calls, st[1].fast, st[1].ms, st[2].calls, st[2].ms);
}

// args: device, data, size, width, height, levels, usage, format, pool, filter, mipfilter, colorkey, srcinfo, palette, out
void f_00b400b3(CPU *restrict c) {
    if (mode < 0) {
        const char *e = getenv("RC_DECODE");
        mode = rc_nospeed || (e && !strcmp(e, "orig")) ? MODE_ORIG : e && !strcmp(e, "compare") ? MODE_COMPARE : MODE_NEW;
        logging = getenv("RC_DECODE_LOG") != NULL;
    }
    uint32_t a[15];
    for (int i = 0; i < 15; i++) a[i] = RD32m(c->esp + 4 + 4 * i);
    const uint8_t *data = G(a[1]);
    const char *k = kind(data, a[2]);
    int iw = 0, ih = 0, in = 0;
    int hq = k[0] == 'j' && stbi_info_from_memory(data, (int)a[2], &iw, &ih, &in) && hq_card((uint32_t)iw, (uint32_t)ih);
    int shape = a[5] == 1 && a[6] == 0 && a[7] == 0x15 && a[9] == 1 && a[10] == 1 && a[11] == 0 && !a[12] && !a[13] &&
                a[3] && a[3] <= 4096 && a[4] && a[4] <= 4096 && (k[0] == 'p' || hq);
    // ponytail: PNG only, the one format compare mode has verified (the 2008 data has no JPEG), plus our 2x card art
    // (D3DX would clip it to the 1x texture: it never goes to the original); > 4096 the platform refuses, so those
    // take D3DX's own failure path
    double t0 = now_ms();
    if (logging && !shape) {   // each argument combination the fast path refuses, once
        static uint32_t seen[64][3];
        static int ns;
        uint32_t key[3] = {a[5] | a[6] << 8 | a[7] << 16, a[9] | a[10] << 16, a[11] ^ a[12] ^ a[13]};
        int i = 0;
        while (i < ns && memcmp(seen[i], key, sizeof key)) i++;
        if (i == ns && ns < 64) {
            memcpy(seen[ns++], key, sizeof key);
            rc_log("decode: original for %s %ux%u levels %u usage %u fmt %#x pool %u filter %#x/%#x key %#x info %#x pal %#x",
                   k, a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12], a[13]);
        }
    }
    if ((mode != MODE_NEW && !hq) || !shape) {
        o_00b400b3(c);
        if (mode == MODE_COMPARE && shape && c->eax == 0) {   // the same bytes through stb, against what D3DX made
            int w, h, n;
            uint8_t *px = stbi_load_from_memory(data, (int)a[2], &w, &h, &n, 4);
            uint32_t tex = RD32m(a[14]), s = c->esp - 0x40;
            uint32_t save = c->esp;
            c->esp = s;
            uint32_t args[] = {0, s + 8, 0, 0x10};
            int i = k[0] == 'j' ? 0 : 1;
            if (px && (uint32_t)w <= a[3] && (uint32_t)h <= a[4] && !com(c, tex, 16, 4, args)) {
                const uint8_t *bits = G(RD32m(s + 12)), zero[4] = {0};
                uint32_t pitch = RD32m(s + 8), diff = 0, maxd = 0;
                for (uint32_t y = 0; y < a[4]; y++)
                    for (uint32_t x = 0; x < a[3]; x++) {   // the image top left, transparent black around it
                        const uint8_t *d = bits + y * pitch + x * 4;
                        const uint8_t *p = x < (uint32_t)w && y < (uint32_t)h ? px + (y * w + x) * 4 : zero;
                        int e[4] = {d[0] - p[2], d[1] - p[1], d[2] - p[0], d[3] - p[3]};   // BGRA vs RGBA
                        for (int j = 0; j < 4; j++) {
                            uint32_t m = (uint32_t)abs(e[j]);
                            if (m) diff++;
                            if (m > maxd) maxd = m;
                        }
                    }
                uint32_t u[] = {0};
                com(c, tex, 17, 1, u);
                if (diff) st[i].differ++; else st[i].same++;
                if (diff) {
                    rc_log("decode compare: %s %dx%d in %ux%u: %u channels differ, max %u", k, w, h, a[3], a[4], diff, maxd);
                    char name[64];
                    snprintf(name, sizeof name, "decode-differ-%u.%s", st[i].differ, k);   // the source bytes, to look at
                    FILE *f = fopen(name, "wb");
                    if (f) fwrite(data, 1, a[2], f), fclose(f);
                }
                if ((st[0].same + st[0].differ + st[1].same + st[1].differ) % 25 == 0)
                    rc_log("decode compare: jpeg %u same %u differ, png %u same %u differ", st[0].same, st[0].differ,
                           st[1].same, st[1].differ);
            }
            c->esp = save;
            stbi_image_free(px);
        }
        tally(k, now_ms() - t0, 0);
        return;
    }
    int w, h, n;
    uint8_t *px = stbi_load_from_memory(data, (int)a[2], &w, &h, &n, 4);
    uint8_t *big = NULL;   // 2x card art: px becomes its 1x box-filtered copy (what the game reads and hit-tests)
    if (px && hq) {
        int lw = w / 2, lh = h / 2;
        uint8_t *small = malloc((size_t)lw * lh * 4);
        for (int y = 0; y < lh; y++)
            for (int x = 0; x < lw; x++)
                for (int j = 0; j < 4; j++) {
                    const uint8_t *p = px + ((size_t)(2 * y) * w + 2 * x) * 4 + j;
                    small[((size_t)y * lw + x) * 4 + j] = (uint8_t)((p[0] + p[4] + p[w * 4] + p[w * 4 + 4] + 2) / 4);
                }
        big = px, px = small, w = lw, h = lh;
    }
    if (!px || (uint32_t)w > a[3] || (uint32_t)h > a[4]) {   // not the plain shape after all: the original
        if (logging) rc_log("decode: original for %s, image %dx%d into %ux%u", k, px ? w : -1, px ? h : -1, a[3], a[4]);
        stbi_image_free(px);
        stbi_image_free(big);
        o_00b400b3(c);
        tally(k, now_ms() - t0, 0);
        return;
    }
    uint32_t ret = RD32m(c->esp), s = c->esp - 0x40;
    c->esp = s;
    uint32_t ct[] = {a[3], a[4], 1, 0, 0x15, a[8], s + 4};   // CreateTexture(w, h, levels, usage, format, pool, &tex)
    uint32_t hr = com(c, a[0], 20, 7, ct);
    if (!hr) {
        uint32_t tex = RD32m(s + 4);
        uint32_t lk[] = {0, s + 8, 0, 0};
        hr = com(c, tex, 16, 4, lk);
        if (!hr) {
            uint8_t *bits = G(RD32m(s + 12));
            uint32_t pitch = RD32m(s + 8);
            for (uint32_t y = 0; y < a[4]; y++) {   // filter NONE: the image top left, transparent black around it
                uint8_t *d = bits + (size_t)y * pitch;
                if (y >= (uint32_t)h) { memset(d, 0, a[3] * 4); continue; }
                const uint8_t *p = px + (size_t)y * w * 4;
                for (int x = 0; x < w; x++, p += 4, d += 4) d[0] = p[2], d[1] = p[1], d[2] = p[0], d[3] = p[3];
                memset(d, 0, (a[3] - w) * 4);
            }
            uint32_t u[] = {0};
            com(c, tex, 17, 1, u);
            WR32m(a[14], tex);
            if (big && rc_render_scale() >= 2) {   // the GL texture gets the 2x pixels, laid out like the 1x ones
                uint32_t tw = a[3] * 2, th = a[4] * 2;
                size_t sz = (size_t)tw * th * 4;
                uint8_t *hqb = calloc(sz, 1);
                for (int y = 0; y < 2 * h; y++) {
                    const uint8_t *p = big + (size_t)y * 2 * w * 4;
                    uint8_t *d = hqb + (size_t)y * tw * 4;
                    for (int x = 0; x < 2 * w; x++, p += 4, d += 4) d[0] = p[2], d[1] = p[1], d[2] = p[0], d[3] = p[3];
                }
                rc_texture_hq(tex, hqb, sz, 2);
                free(hqb);
            }
        } else {
            com(c, tex, 2, 0, NULL);   // Release
        }
    }
    stbi_image_free(px);
    stbi_image_free(big);
    c->esp = s + 0x40;
    c->eax = hr;
    c->ret_to = ret;
    c->esp += 4 + 15 * 4;
    tally(k, now_ms() - t0, 1);
}
