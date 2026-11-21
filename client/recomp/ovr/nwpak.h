// ovr/nwpak.h: a new-style WAIST-UP item's pack, read and checked, and the pixel work its rendering needs (skin
// palette swap, the disk's transform, the blend). Host code only, no guest memory, so rt/nwpak_test.c runs it
// natively. ovr/newstylewu.c is the glue to the exe.
//
// The pack (client/tools/newstyle_wu.py writes it; the chibi packs' container, every entry stored):
//   "YO2NSPK1", u32 count, per entry u8 name length, name, u8 method (0), u32 stored, u32 size, u32 CRC-32; the data.
//   body_r.png, body_l.png   the item's whole figure below the head per pose (the avatar editor's r, Select
//                            Player's l), its skin in neutral greys: R = G = B = v marks skin, v the ramp position
//   wu.txt                   records, one per line ('#' comments):
//     bare <x> <y>                         the bare body's row origin on the canvas the records are measured on (a
//                                          caller that draws the bust shifted, in 256 px tiles, moves every layer
//                                          alike: newstylewu.c takes the shift from the bare body's layer)
//     ramp <v0> .. <vK-1>                 grey stops, 0 first, 255 last, increasing (K 2..16)
//     tone <S> <r g b> x K                 skin tone S's colour per stop (S 1..8)
//     pose <r|l> <x> <y> <w> <h>           the pictures' box on the 768 canvas
//     neck <r|l> <dx> <dy>                 the head layers' offset from the bare body's place
//     headcut <r|l> <y>                    the bare body's rows above canvas row y are the head
//     disk <r|l> <cx> <cy> <angle> <scale> <dx> <dy>
//                                          the disk strip rotated (degrees, clockwise on screen) and scaled about
//                                          (cx, cy), then moved by (dx, dy)
// nwpak_load accepts a pack only if all of it holds (layout, CRCs, each pose's PNG decodes at its box's size,
// every record present and in range); otherwise it says why and the item stays on its original art.
#ifndef NWPAK_H
#define NWPAK_H
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "nspak.h"

enum { NW_CANVAS = 768, NW_MAX_STOPS = 16, NW_MAX_TONES = 8, NW_MAX_ENTRIES = 64 };

typedef struct {
    int x, y, w, h;           // the box
    int ndx, ndy, headcut;
    double cx, cy, angle, scale, dx, dy;
    uint8_t *body;            // RGBA, w x h
} NwPose;

typedef struct {
    int nstops, ntones;
    int bare_x, bare_y, has_bare;
    uint8_t stops[NW_MAX_STOPS];
    uint8_t tone[NW_MAX_TONES + 1][NW_MAX_STOPS][3];   // [S][stop]: S = 1..ntones
    uint8_t lut[NW_MAX_TONES + 1][256][3];             // the ramp per tone, 256 greys
    NwPose pose[2];                                    // 0 r, 1 l
} NwItem;

static void nwpak_free(NwItem *it) {
    for (int p = 0; p < 2; p++) {
        free(it->pose[p].body);
        it->pose[p].body = NULL;
    }
}

// the 256-entry table of tone S: linear between the stops, rounded (newstyle_wu.py ramp_lut, waistup.js the same)
static void nwpak_build_lut(NwItem *it) {
    for (int s = 1; s <= it->ntones; s++)
        for (int v = 0; v < 256; v++) {
            int k = 0;
            while (k < it->nstops - 2 && v > it->stops[k + 1]) k++;
            int span = it->stops[k + 1] - it->stops[k];
            double f = span ? (double)(v - it->stops[k]) / span : 0;
            for (int c = 0; c < 3; c++)
                it->lut[s][v][c] = (uint8_t)(int)(it->tone[s][k][c] * (1 - f) + it->tone[s][k + 1][c] * f + 0.5);
        }
}

// wu.txt -> it (records only). 0 + err on anything malformed
static int nwpak_parse_text(const char *txt, size_t n, NwItem *it, char *err, size_t errn) {
    char line[512];
    int have[2][4] = {{0}};   // pose, neck, headcut, disk
    size_t at = 0;
    while (at < n) {
        size_t e = at;
        while (e < n && txt[e] != '\n') e++;
        size_t ln = e - at < sizeof line - 1 ? e - at : sizeof line - 1;
        memcpy(line, txt + at, ln), line[ln] = 0;
        at = e + 1;
        char *hash = strchr(line, '#');
        if (hash) *hash = 0;
        char *tok[64];
        int nt = 0;
        for (char *t = strtok(line, " \t\r"); t && nt < 64; t = strtok(NULL, " \t\r")) tok[nt++] = t;
        if (!nt) continue;
        if (!strcmp(tok[0], "bare")) {
            if (nt != 3) return snprintf(err, errn, "bare: bad record"), 0;
            it->bare_x = atoi(tok[1]), it->bare_y = atoi(tok[2]), it->has_bare = 1;
            if (it->bare_x < 0 || it->bare_y < 0 || it->bare_x >= NW_CANVAS || it->bare_y >= NW_CANVAS)
                return snprintf(err, errn, "bare: out of range"), 0;
        } else if (!strcmp(tok[0], "ramp")) {
            it->nstops = nt - 1;
            if (it->nstops < 2 || it->nstops > NW_MAX_STOPS) return snprintf(err, errn, "ramp: %d stops", it->nstops), 0;
            for (int i = 0; i < it->nstops; i++) {
                int v = atoi(tok[i + 1]);
                if (v < 0 || v > 255 || (i && v <= it->stops[i - 1])) return snprintf(err, errn, "ramp: bad stops"), 0;
                it->stops[i] = (uint8_t)v;
            }
            if (it->stops[0] != 0 || it->stops[it->nstops - 1] != 255) return snprintf(err, errn, "ramp: not 0..255"), 0;
        } else if (!strcmp(tok[0], "tone")) {
            int s = nt > 1 ? atoi(tok[1]) : 0;
            if (!it->nstops || s < 1 || s > NW_MAX_TONES || nt != 2 + 3 * it->nstops)
                return snprintf(err, errn, "tone %d: bad record", s), 0;
            for (int i = 0; i < it->nstops * 3; i++) {
                int v = atoi(tok[2 + i]);
                if (v < 0 || v > 255) return snprintf(err, errn, "tone %d: bad colour", s), 0;
                it->tone[s][i / 3][i % 3] = (uint8_t)v;
            }
            if (s > it->ntones) it->ntones = s;
        } else if (!strcmp(tok[0], "pose") || !strcmp(tok[0], "neck") || !strcmp(tok[0], "headcut") || !strcmp(tok[0], "disk")) {
            if (nt < 2 || (strcmp(tok[1], "r") && strcmp(tok[1], "l"))) return snprintf(err, errn, "%s: bad pose", tok[0]), 0;
            NwPose *p = &it->pose[tok[1][0] == 'l'];
            int pi = tok[1][0] == 'l';
            if (!strcmp(tok[0], "pose")) {
                if (nt != 6) return snprintf(err, errn, "pose: bad record"), 0;
                p->x = atoi(tok[2]), p->y = atoi(tok[3]), p->w = atoi(tok[4]), p->h = atoi(tok[5]);
                if (p->x < 0 || p->y < 0 || p->w <= 0 || p->h <= 0 || p->x + p->w > NW_CANVAS || p->y + p->h > NW_CANVAS)
                    return snprintf(err, errn, "pose %s: bad box", tok[1]), 0;
                have[pi][0] = 1;
            } else if (!strcmp(tok[0], "neck")) {
                if (nt != 4) return snprintf(err, errn, "neck: bad record"), 0;
                p->ndx = atoi(tok[2]), p->ndy = atoi(tok[3]);
                if (abs(p->ndx) > 128 || abs(p->ndy) > 128) return snprintf(err, errn, "neck %s: out of range", tok[1]), 0;
                have[pi][1] = 1;
            } else if (!strcmp(tok[0], "headcut")) {
                if (nt != 3) return snprintf(err, errn, "headcut: bad record"), 0;
                p->headcut = atoi(tok[2]);
                if (p->headcut <= 0 || p->headcut > NW_CANVAS) return snprintf(err, errn, "headcut %s: out of range", tok[1]), 0;
                have[pi][2] = 1;
            } else {
                if (nt != 8) return snprintf(err, errn, "disk: bad record"), 0;
                p->cx = atof(tok[2]), p->cy = atof(tok[3]), p->angle = atof(tok[4]), p->scale = atof(tok[5]);
                p->dx = atof(tok[6]), p->dy = atof(tok[7]);
                if (!(p->scale >= 0.5 && p->scale <= 2) || !(fabs(p->angle) <= 90) || !(fabs(p->dx) <= NW_CANVAS) ||
                    !(fabs(p->dy) <= NW_CANVAS) || !(fabs(p->cx) <= 2 * NW_CANVAS) || !(fabs(p->cy) <= 2 * NW_CANVAS))
                    return snprintf(err, errn, "disk %s: out of range", tok[1]), 0;
                have[pi][3] = 1;
            }
        } else return snprintf(err, errn, "unknown record %.20s", tok[0]), 0;
    }
    if (!it->has_bare) return snprintf(err, errn, "bare missing"), 0;
    if (!it->nstops || !it->ntones) return snprintf(err, errn, "no ramp"), 0;
    for (int s = 1; s <= it->ntones; s++) {   // tones 1..ntones all given (an unset one reads as all black)
        int any = 0;
        for (int i = 0; i < it->nstops; i++) any |= it->tone[s][i][0] | it->tone[s][i][1] | it->tone[s][i][2];
        if (!any) return snprintf(err, errn, "tone %d missing", s), 0;
    }
    static const char *what[] = {"pose", "neck", "headcut", "disk"};
    for (int p = 0; p < 2; p++)
        for (int k = 0; k < 4; k++)
            if (!have[p][k]) return snprintf(err, errn, "%s %c missing", what[k], "rl"[p]), 0;
    nwpak_build_lut(it);
    return 1;
}

// the pack -> it (caller: nwpak_free). 0 + err when anything fails
static int nwpak_load(const uint8_t *blob, size_t len, NwItem *it, char *err, size_t errn) {
    memset(it, 0, sizeof *it);
    if (len < 12 || memcmp(blob, "YO2NSPK1", 8)) return snprintf(err, errn, "not a pack"), 0;
    uint32_t n = nspak_u32(blob + 8);
    if (!n || n > NW_MAX_ENTRIES) return snprintf(err, errn, "%u entries", n), 0;
    struct { char name[64]; uint32_t stored, size, crc; uint8_t method; size_t off; } d[NW_MAX_ENTRIES];
    size_t at = 12, data = 0;
    for (uint32_t i = 0; i < n; i++) {
        if (at + 1 > len) return snprintf(err, errn, "truncated directory"), 0;
        uint8_t ln = blob[at];
        if (!ln || ln > 63 || at + 1 + ln + 13 > len) return snprintf(err, errn, "truncated directory"), 0;
        memcpy(d[i].name, blob + at + 1, ln), d[i].name[ln] = 0;
        const uint8_t *r = blob + at + 1 + ln;
        d[i].method = r[0], d[i].stored = nspak_u32(r + 1), d[i].size = nspak_u32(r + 5), d[i].crc = nspak_u32(r + 9);
        if (d[i].method != 0 || d[i].stored != d[i].size || d[i].size > (8u << 20)) return snprintf(err, errn, "%s: bad sizes", d[i].name), 0;
        for (uint32_t j = 0; j < i; j++)
            if (!strcmp(d[j].name, d[i].name)) return snprintf(err, errn, "%s twice", d[i].name), 0;
        d[i].off = data;
        data += d[i].stored;
        at += 1 + ln + 13;
    }
    if (at + data != len) return snprintf(err, errn, at + data > len ? "truncated" : "trailing bytes"), 0;
    const uint8_t *base = blob + at;
    for (uint32_t i = 0; i < n; i++)
        if (nspak_crc32(base + d[i].off, d[i].size) != d[i].crc) return snprintf(err, errn, "%s: corrupt (CRC)", d[i].name), 0;
    int k = -1;
    for (uint32_t i = 0; i < n; i++)
        if (!strcmp(d[i].name, "wu.txt")) k = (int)i;
    if (k < 0) return snprintf(err, errn, "wu.txt missing"), 0;
    if (!nwpak_parse_text((const char *)base + d[k].off, d[k].size, it, err, errn)) return 0;
    static const char *pics[2] = {"body_r.png", "body_l.png"};
    for (int q = 0; q < 2; q++) {
        int f = -1;
        for (uint32_t i = 0; i < n; i++)
            if (!strcmp(d[i].name, pics[q])) f = (int)i;
        if (f < 0) return nwpak_free(it), snprintf(err, errn, "%s missing", pics[q]), 0;
        NwPose *p = &it->pose[q];
        int w = 0, h = 0, ch = 0;
#ifndef NSPAK_NO_STB
        stbi_uc *px = stbi_load_from_memory(base + d[f].off, (int)d[f].size, &w, &h, &ch, 4);
#else
        uint8_t *px = NULL;
#endif
        if (!px || w != p->w || h != p->h) {
            free(px);
            nwpak_free(it);
            return snprintf(err, errn, "%s: not a %d x %d PNG", pics[q], p->w, p->h), 0;
        }
        p->body = px;
    }
    return 1;
}

// ---- pixels. The destination is the exe's canvas surface: 32-bit A8R8G8B8, bytes B G R A, `pitch` bytes a row.

// AvatarTexMaker's blendPixel: colour = dst (1 - a) + src a, alpha = the larger
static inline void nw_put(uint8_t *d, int r, int g, int b, int a) {
    if (a <= 0) return;
    double k = a / 255.0, inv = 1 - k;
    d[0] = (uint8_t)(int)(d[0] * inv + b * k);
    d[1] = (uint8_t)(int)(d[1] * inv + g * k);
    d[2] = (uint8_t)(int)(d[2] * inv + r * k);
    if (a > d[3]) d[3] = (uint8_t)a;
}

// an RGBA picture (w x h) at (x, y), its skin greys through lut (NULL: as they are)
static void nw_blend_rgba(uint8_t *dst, int pitch, int dw, int dh, const uint8_t *src, int w, int h, int x, int y,
                          const uint8_t (*lut)[3]) {
    for (int j = 0; j < h; j++) {
        int Y = y + j;
        if (Y < 0 || Y >= dh) continue;
        for (int i = 0; i < w; i++) {
            int X = x + i;
            if (X < 0 || X >= dw) continue;
            const uint8_t *s = src + ((size_t)j * w + i) * 4;
            if (!s[3]) continue;
            int r = s[0], g = s[1], b = s[2];
            if (lut && r == g && g == b) r = lut[r][0], g = lut[s[1]][1], b = lut[s[2]][2];
            nw_put(dst + (size_t)Y * pitch + (size_t)X * 4, r, g, b, s[3]);
        }
    }
}

// the forward transform's matrix (newstyle_wu.py similarity): p' = R(angle) s (p - c) + c + d
static void nw_matrix(const NwPose *p, double m[6]) {
    double t = p->angle * M_PI / 180, c = cos(t) * p->scale, s = sin(t) * p->scale;
    m[0] = c, m[1] = -s, m[2] = p->cx - c * p->cx + s * p->cy + p->dx;
    m[3] = s, m[4] = c, m[5] = p->cy - s * p->cx - c * p->cy + p->dy;
}

// a disk strip (B G R A, `spitch` bytes a row; its w x h drawn at canvas (sx, sy)) through the pose's transform:
// bilinear on premultiplied colour, every destination pixel the strip can reach
static void nw_blend_disk(uint8_t *dst, int pitch, int dw, int dh, const uint8_t *src, int spitch, int w, int h, int sx,
                          int sy, const NwPose *p) {
    double m[6];
    nw_matrix(p, m);
    double det = m[0] * m[4] - m[1] * m[3];
    if (fabs(det) < 1e-9) return;
    // the inverse: canvas p' -> the strip's canvas p
    double i0 = m[4] / det, i1 = -m[1] / det, i3 = -m[3] / det, i4 = m[0] / det;
    double x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (int k = 0; k < 4; k++) {
        double X = sx + (k & 1 ? w : 0), Y = sy + (k & 2 ? h : 0);
        double u = m[0] * X + m[1] * Y + m[2], v = m[3] * X + m[4] * Y + m[5];
        if (u < x0) x0 = u;
        if (u > x1) x1 = u;
        if (v < y0) y0 = v;
        if (v > y1) y1 = v;
    }
    int ax = (int)floor(x0) - 1, ay = (int)floor(y0) - 1, bx = (int)ceil(x1) + 1, by = (int)ceil(y1) + 1;
    if (ax < 0) ax = 0;
    if (ay < 0) ay = 0;
    if (bx > dw) bx = dw;
    if (by > dh) by = dh;
    for (int Y = ay; Y < by; Y++)
        for (int X = ax; X < bx; X++) {
            double qx = X - m[2], qy = Y - m[5];
            double u = i0 * qx + i1 * qy - sx, v = i3 * qx + i4 * qy - sy;   // in the strip
            if (u <= -1 || v <= -1 || u >= w || v >= h) continue;
            int u0 = (int)floor(u), v0 = (int)floor(v);
            double fu = u - u0, fv = v - v0, acc[4] = {0, 0, 0, 0};
            for (int k = 0; k < 4; k++) {
                int uu = u0 + (k & 1), vv = v0 + (k >> 1);
                if (uu < 0 || vv < 0 || uu >= w || vv >= h) continue;
                double wt = (k & 1 ? fu : 1 - fu) * (k >> 1 ? fv : 1 - fv);
                const uint8_t *s = src + (size_t)vv * spitch + (size_t)uu * 4;
                double a = s[3] * wt;
                acc[0] += s[0] * a, acc[1] += s[1] * a, acc[2] += s[2] * a, acc[3] += a;
            }
            if (acc[3] < 0.5) continue;
            int a = (int)(acc[3] + 0.5);
            nw_put(dst + (size_t)Y * pitch + (size_t)X * 4, (int)(acc[2] / acc[3] + 0.5), (int)(acc[1] / acc[3] + 0.5),
                   (int)(acc[0] / acc[3] + 0.5), a > 255 ? 255 : a);
        }
}
#endif
