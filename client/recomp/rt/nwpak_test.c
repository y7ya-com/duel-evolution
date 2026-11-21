// ovr/nwpak.h, a new-style waist-up item's pack and pixels: the placeholder pack (client/tools/newstyle_wu.py
// placeholder: shapes, no game art) is read with the values the tool wrote, every way a pack can be broken is refused
// with a reason and never a crash (ASan + UBSan), the skin swap and the disk transform draw what the tool's reference
// renderer draws.
//   make nwpak_test            (the pack is rebuilt from the tool into build/)
//   build/nwpak_test --check <pak>   check one real pack, as the engine does
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../ovr/nwpak.h"

static uint8_t *good;
static size_t good_len;

static int load(const uint8_t *b, size_t n, char *err) {
    NwItem it;
    int ok = nwpak_load(b, n, &it, err, 160);
    if (ok) nwpak_free(&it);
    return ok;
}

static void refused(const char *why, const uint8_t *b, size_t n, const char *expect) {
    char err[160] = "";
    int ok = load(b, n, err);
    printf("  %-36s %s\n", why, ok ? "ACCEPTED" : err);
    assert(!ok);
    if (expect) assert(strstr(err, expect));
}

// the pack with wu.txt replaced (its directory entry: size and CRC rewritten)
static uint8_t *with_text(const char *txt, size_t *len) {
    uint32_t n = nspak_u32(good + 8);
    size_t at = 12, data = 0, off = 0, old = 0, rec = 0;
    for (uint32_t i = 0; i < n; i++) {
        uint8_t ln = good[at];
        uint32_t stored = nspak_u32(good + at + 1 + ln + 1);
        if (ln == 6 && !memcmp(good + at + 1, "wu.txt", 6)) off = data, old = stored, rec = at + 1 + ln;
        data += stored;
        at += 1 + ln + 13;
    }
    assert(rec);
    size_t tl = strlen(txt);
    *len = good_len - old + tl;
    uint8_t *b = malloc(*len);
    memcpy(b, good, at + off);
    memcpy(b + at + off, txt, tl);
    memcpy(b + at + off + tl, good + at + off + old, good_len - at - off - old);
    uint32_t v[3] = {(uint32_t)tl, (uint32_t)tl, nspak_crc32((const uint8_t *)txt, tl)};
    for (int k = 0; k < 3; k++)
        for (int j = 0; j < 4; j++) b[rec + 1 + 4 * k + j] = (uint8_t)(v[k] >> (8 * j));
    return b;
}

static const char *TXT =
    "bare 0 112\nramp 0 73 176 230 255\n"
    "tone 1 0 0 0  93 67 51  248 154 101  255 224 191  255 255 252\n"
    "pose r 284 300 200 300\nneck r 0 0\nheadcut r 306\ndisk r 300 430 10 1 6 -4\n"
    "pose l 284 300 200 300\nneck l 3 0\nheadcut l 306\ndisk l 300 430 0 1.1 0 0\n";

static void text_refused(const char *why, const char *from, const char *to, const char *expect) {
    char t[2048];
    const char *at = strstr(TXT, from);
    assert(at);
    snprintf(t, sizeof t, "%.*s%s%s", (int)(at - TXT), TXT, to, at + strlen(from));
    size_t n;
    uint8_t *b = with_text(t, &n);
    refused(why, b, n, expect);
    free(b);
}

int main(int argc, char **argv) {
    int real = argc > 2 && !strcmp(argv[1], "--check");
    FILE *f = fopen(real ? argv[2] : argc > 1 ? argv[1] : "build/nwpak_placeholder.pak", "rb");
    if (!f) return printf("no pack\n"), 1;
    good = malloc(32 << 20);
    good_len = fread(good, 1, 32 << 20, f);
    fclose(f);
    NwItem it;
    char err[160] = "";
    int ok = nwpak_load(good, good_len, &it, err, sizeof err);
    printf("  %s: %s\n", real ? argv[2] : "placeholder pack", ok ? "ok" : err);
    if (real) {   // a real pack: the check only
        if (ok) nwpak_free(&it);
        free(good);
        return !ok;
    }
    assert(ok);
    // the records as the tool wrote them
    assert(it.nstops == 5 && it.stops[1] == 73 && it.ntones == 3 && it.bare_x == 0 && it.bare_y == 112);
    assert(it.pose[0].x == 284 && it.pose[0].w == 200 && it.pose[1].ndx == 3 && it.pose[0].headcut == 306);
    assert(it.pose[0].angle == 10 && it.pose[0].dx == 6 && it.pose[1].scale == 1.1);
    // the ramp exactly as newstyle_wu.py ramp_lut (and waistup.js)
    static const uint8_t want[3][3][3] = {{{209, 132, 88}, {251, 185, 141}, {93, 67, 51}},
                                          {{210, 169, 128}, {252, 217, 177}, {93, 79, 64}},
                                          {{151, 71, 49}, {184, 101, 72}, {68, 37, 27}}};
    for (int s = 1; s <= 3; s++)
        for (int c = 0; c < 3; c++)
            assert(it.lut[s][150][c] == want[s - 1][0][c] && it.lut[s][200][c] == want[s - 1][1][c] &&
                   it.lut[s][73][c] == want[s - 1][2][c]);
    printf("  ramp: as the tool's\n");

    // the skin swap: the grey arm (200) becomes tone 3's, the nudged grey-looking row (128, 128, 129) stays cloth
    enum { W = 768, H = 768 };
    uint8_t *canvas = calloc((size_t)W * H, 4);
    NwPose *p = &it.pose[0];
    nw_blend_rgba(canvas, W * 4, W, H, p->body, p->w, p->h, p->x, p->y, (const uint8_t(*)[3])it.lut[3]);
    uint8_t *arm = canvas + ((size_t)(300 + 130) * W + 284 + 100) * 4, *row = canvas + ((size_t)300 * W + 284 + 100) * 4,
            *coat = canvas + ((size_t)(300 + 250) * W + 284 + 100) * 4;
    assert(arm[2] == 184 && arm[1] == 101 && arm[0] == 72 && arm[3] == 255);
    assert(row[2] == 128 && row[1] == 128 && row[0] == 129);
    assert(coat[2] == 40 && coat[1] == 60 && coat[0] == 160);
    printf("  skin swap: the greys only\n");

    // the disk: identity reproduces the strip; a shift moves it; a turn keeps the pivot
    uint8_t strip[20 * 10 * 4];
    for (int i = 0; i < 200; i++) strip[i * 4] = 10, strip[i * 4 + 1] = 20, strip[i * 4 + 2] = (uint8_t)(i % 20 * 10), strip[i * 4 + 3] = 255;
    NwPose q = {0};
    q.scale = 1, q.cx = 100, q.cy = 100;
    memset(canvas, 0, (size_t)W * H * 4);
    nw_blend_disk(canvas, W * 4, W, H, strip, 20 * 4, 20, 10, 50, 60, &q);
    for (int y = 0; y < 10; y++)
        for (int x = 0; x < 20; x++) {
            uint8_t *d = canvas + ((size_t)(60 + y) * W + 50 + x) * 4;
            assert(d[3] == 255 && d[2] == x * 10 && d[0] == 10);
        }
    assert(canvas[((size_t)59 * W + 50) * 4 + 3] == 0 && canvas[((size_t)60 * W + 70) * 4 + 3] == 0);
    q.dx = 5, q.dy = -2;
    memset(canvas, 0, (size_t)W * H * 4);
    nw_blend_disk(canvas, W * 4, W, H, strip, 20 * 4, 20, 10, 50, 60, &q);
    assert(canvas[((size_t)58 * W + 55) * 4 + 3] == 255 && canvas[((size_t)58 * W + 55) * 4 + 2] == 0);
    assert(canvas[((size_t)60 * W + 54) * 4 + 3] == 0);
    q.dx = q.dy = 0, q.angle = 90, q.cx = 50, q.cy = 60;   // clockwise on screen: +x goes to +y
    memset(canvas, 0, (size_t)W * H * 4);
    nw_blend_disk(canvas, W * 4, W, H, strip, 20 * 4, 20, 10, 50, 60, &q);
    assert(canvas[((size_t)(60 + 15) * W + 50 - 5) * 4 + 3] == 255 && canvas[((size_t)(60 + 15) * W + 50 - 5) * 4 + 2] == 150);
    printf("  disk transform: identity, shift, turn\n");
    free(canvas);

    // broken packs
    uint8_t *b = malloc(good_len + 16);
    memcpy(b, good, good_len), memcpy(b, "YO2NSPK2", 8);
    refused("wrong magic", b, good_len, "not a pack");
    refused("empty", good, 0, NULL);
    refused("cut short", good, good_len - 100, "truncated");
    memcpy(b, good, good_len), b[good_len] = 0;
    refused("a trailing byte", b, good_len + 1, "trailing");
    memcpy(b, good, good_len), b[good_len - 50] ^= 0x40;
    refused("a flipped byte", b, good_len, "corrupt");
    memcpy(b, good, good_len), memset(b + 8, 0xff, 4);
    refused("an absurd count", b, good_len, "entries");
    free(b);
    text_refused("the box not the pictures' size", "pose r 284 300 200 300", "pose r 284 300 201 300", "PNG");
    text_refused("a box off the canvas", "pose l 284 300 200 300", "pose l 600 300 200 300", "bad box");
    text_refused("a pose's disk missing", "disk l 300 430 0 1.1 0 0\n", "", "disk l missing");
    text_refused("an absurd scale", "1 6 -4", "9 6 -4", "out of range");
    text_refused("a NaN angle", "disk r 300 430 10", "disk r 300 430 nan", "out of range");
    text_refused("stops not increasing", "ramp 0 73 176", "ramp 0 176 73", "ramp");
    text_refused("a tone short of stops", "255 255 252\n", "\n", "tone 1");
    text_refused("an unknown record", "headcut r 306", "headcut r 306\nwings r 1", "unknown");
    text_refused("a neck far away", "neck l 3 0", "neck l 300 0", "neck");
    text_refused("the bare body's place missing", "bare 0 112\n", "", "bare missing");
    nwpak_free(&it);
    free(good);
    printf("nwpak_test: ok\n");
    return 0;
}
