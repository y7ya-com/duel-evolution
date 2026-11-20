// ovr/nspak.h: the check of a new-style chibi pack (client/tools/newstyle_pack.py writes it, ovr/newstyle.c reads it),
// host code only: no guest memory, so rt/nspak_test.c runs it natively.
//
// A pack is c?_nb_<code>_c0<skin>.pak: "YO2NSPK1", u32 count, then per entry u8 name length, name ([a-z0-9_.], at
// most 63), u8 method (0 stored, 1 zlib), u32 stored size, u32 size, u32 CRC-32; then the entries' data in order.
// Little endian. nspak_check accepts a pack only if ALL of this holds, so that nothing it lets through can reach the
// texture manager's assert (a missing or undecodable PNG stops the game):
//   - the layout: magic, counts and sizes inside the file, no trailing bytes, names well formed and not repeated;
//   - every entry inflates (zlib) to its size and matches its CRC-32;
//   - every .png decodes (stb_image, the decoder the platform's D3DX uses) as 128 x 128;
//   - every .txt is a motion dump (the SwfReader text: "PngFileTable = {" first, a frame count);
//   - the outfit's motion dumps are there (c?_nb_<code>_<n|w|g|t><01..08>.txt, _d01_01..03.txt), and every body
//     picture they name (the template "nb_00_c01", renamed to this pack's "nb_<code>_c0<skin>") is in the pack.
// On success *out holds the entries (caller frees with nspak_free); on failure err says why.
#ifndef NSPAK_H
#define NSPAK_H
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef NSPAK_NO_STB
#define STB_IMAGE_STATIC
#define STBI_ONLY_PNG
#define STBI_NO_STDIO
#define STBI_NO_LINEAR
#define STBI_NO_HDR
#define STB_IMAGE_IMPLEMENTATION
#include "../../platform/third_party/stb_image.h"
#endif

typedef struct {
    char name[64];
    uint8_t *data;
    uint32_t size;
} NsEntry;

enum { NSPAK_MAX = 4096, NSPAK_SIDE = 128 };

static uint32_t nspak_crc32(const uint8_t *p, size_t n) {
    static uint32_t t[256];
    if (!t[1])
        for (uint32_t i = 0; i < 256; i++) {
            uint32_t c = i;
            for (int k = 0; k < 8; k++) c = c & 1 ? 0xedb88320u ^ (c >> 1) : c >> 1;
            t[i] = c;
        }
    uint32_t c = 0xffffffffu;
    while (n--) c = t[(c ^ *p++) & 0xff] ^ (c >> 8);
    return c ^ 0xffffffffu;
}

static uint32_t nspak_u32(const uint8_t *p) { return p[0] | p[1] << 8 | p[2] << 16 | (uint32_t)p[3] << 24; }

static int nspak_has(const uint8_t *p, size_t n, const char *s) {
    size_t k = strlen(s);
    for (size_t i = 0; i + k <= n; i++)
        if (!memcmp(p + i, s, k)) return 1;
    return 0;
}

static void nspak_free(NsEntry *e, int n) {
    for (int i = 0; e && i < n; i++) free(e[i].data);
    free(e);
}

static int nspak_find(const NsEntry *e, int n, const char *name) {
    for (int i = 0; i < n; i++)
        if (!strcmp(e[i].name, name)) return i;
    return -1;
}

// engine i's dump in kPlayerMotionFiles' order (motion i / 8: n w g t d01_01 d01_02 d01_03; facing i % 8; the duel
// motions face front, so their 8 engines share one file): 35 files, <pre>_nb_<code>_<motion>[<facing>].txt
static void nspak_dump_name(const char *pre, const char *code, int i, char *out, size_t n) {
    static const char motions[] = "nwgt";
    int m = i / 8;
    if (m < 4) snprintf(out, n, "%s_nb_%s_%c%02d.txt", pre, code, motions[m], i % 8 + 1);
    else snprintf(out, n, "%s_nb_%s_d01_%02d.txt", pre, code, m - 3);
}

// the dump's PNG table names, each checked: "\tpng => <name>," lines up to ")"
static int nspak_dump_pngs_ok(const NsEntry *e, int n, const NsEntry *dump, const char *body_to, char *err, size_t errn) {
    const char *p = (const char *)dump->data, *end = p + dump->size;
    p += 16;   // "PngFileTable = {"
    int pngs = 0;
    while (p < end) {
        const char *eol = memchr(p, '\n', (size_t)(end - p));
        if (!eol) eol = end;
        const char *q = p;
        while (q < eol && (*q == '\t' || *q == ' ' || *q == '\r')) q++;
        if (q < eol && *q == ')') break;
        if (eol - q > 7 && !strncmp(q, "png => ", 7)) {
            q += 7;
            const char *c = memchr(q, ',', (size_t)(eol - q));
            size_t len = c ? (size_t)(c - q) : 0;
            if (!len || len > 63) return snprintf(err, errn, "%s: a bad picture name", dump->name), 0;
            char name[96];
            memcpy(name, q, len), name[len] = 0;
            char *t = strstr(name, "nb_00_c01");
            if (t) {   // a body picture: the pack's own, renamed as the engine renames it
                char full[96];
                // the female body: applyFemaleParts turns the first "cm" into "cw"
                snprintf(full, sizeof full, "%.*s%s%s", (int)(t - name), name, body_to, t + 9);
                if (!strncmp(dump->name, "cw", 2) && !strncmp(full, "cm", 2)) full[1] = 'w';
                if (nspak_find(e, n, full) < 0) return snprintf(err, errn, "%s names %s, not in the pack", dump->name, full), 0;
            }
            pngs++;
        }
        p = eol + 1;
    }
    if (!pngs) return snprintf(err, errn, "%s: no pictures", dump->name), 0;
    return 1;
}

static int nspak_check(const uint8_t *blob, size_t len, const char *pre, const char *code, int skin, NsEntry **out,
                       int *count, char *err, size_t errn) {
    *out = NULL, *count = 0;
    if (len < 12 || memcmp(blob, "YO2NSPK1", 8)) return snprintf(err, errn, "not a new-style pack"), 0;
    uint32_t n = nspak_u32(blob + 8);
    if (!n || n > NSPAK_MAX) return snprintf(err, errn, "%u entries", n), 0;
    NsEntry *e = calloc(n, sizeof *e);
    size_t at = 12, data = 0;
    struct { uint8_t method; uint32_t stored, size, crc; } *h = calloc(n, sizeof *h);
    int ok = 0;
    for (uint32_t i = 0; i < n; i++) {   // the directory
        if (at + 1 > len) goto trunc;
        uint8_t ln = blob[at];
        if (!ln || ln > 63 || at + 1 + ln + 13 > len) goto trunc;
        for (int k = 0; k < ln; k++) {
            char ch = (char)blob[at + 1 + k];
            if (!((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_' || ch == '.')) {
                snprintf(err, errn, "entry %u: a bad name", i);
                goto done;
            }
        }
        memcpy(e[i].name, blob + at + 1, ln);
        e[i].name[ln] = 0;
        if (nspak_find(e, (int)i, e[i].name) >= 0) { snprintf(err, errn, "%s twice", e[i].name); goto done; }
        const uint8_t *r = blob + at + 1 + ln;
        h[i].method = r[0], h[i].stored = nspak_u32(r + 1), h[i].size = nspak_u32(r + 5), h[i].crc = nspak_u32(r + 9);
        if (h[i].method > 1 || h[i].size > (8u << 20) || h[i].stored > (8u << 20)) { snprintf(err, errn, "%s: bad sizes", e[i].name); goto done; }
        at += 1 + ln + 13;
        data += h[i].stored;
    }
    if (at + data != len) { snprintf(err, errn, at + data > len ? "truncated" : "trailing bytes"); goto done; }
    for (uint32_t i = 0; i < n; i++) {   // the contents
        const uint8_t *src = blob + at;
        at += h[i].stored;
        e[i].data = malloc(h[i].size ? h[i].size : 1);
        e[i].size = h[i].size;
        if (h[i].method == 0) {
            if (h[i].stored != h[i].size) { snprintf(err, errn, "%s: bad sizes", e[i].name); goto done; }
            memcpy(e[i].data, src, h[i].size);
        } else {
#ifndef NSPAK_NO_STB
            int got = stbi_zlib_decode_buffer((char *)e[i].data, (int)h[i].size, (const char *)src, (int)h[i].stored);
            if (got != (int)h[i].size) { snprintf(err, errn, "%s: does not inflate", e[i].name); goto done; }
#else
            snprintf(err, errn, "%s: compressed", e[i].name);
            goto done;
#endif
        }
        if (nspak_crc32(e[i].data, e[i].size) != h[i].crc) { snprintf(err, errn, "%s: corrupt (CRC)", e[i].name); goto done; }
        size_t nl = strlen(e[i].name);
        if (nl > 4 && !strcmp(e[i].name + nl - 4, ".png")) {
#ifndef NSPAK_NO_STB
            int w = 0, hh = 0, ch = 0;
            stbi_uc *px = stbi_load_from_memory(e[i].data, (int)e[i].size, &w, &hh, &ch, 4);
            stbi_image_free(px);
            if (!px || w != NSPAK_SIDE || hh != NSPAK_SIDE) { snprintf(err, errn, "%s: not a 128 x 128 PNG", e[i].name); goto done; }
#endif
        } else if (nl > 4 && !strcmp(e[i].name + nl - 4, ".txt")) {
            if (e[i].size < 32 || memcmp(e[i].data, "PngFileTable = {", 16) ||
                !nspak_has(e[i].data, e[i].size, "Frame count = ")) { snprintf(err, errn, "%s: not a motion dump", e[i].name); goto done; }
        } else { snprintf(err, errn, "%s: unknown kind", e[i].name); goto done; }
    }
    char body_to[16], name[96];
    snprintf(body_to, sizeof body_to, "nb_%s_c%02d", code, skin);
    for (int i = 0; i < 56; i++) {
        nspak_dump_name(pre, code, i, name, sizeof name);
        int k = nspak_find(e, (int)n, name);
        if (k < 0) { snprintf(err, errn, "%s missing", name); goto done; }
        if (!nspak_dump_pngs_ok(e, (int)n, &e[k], body_to, err, errn)) goto done;
    }
    ok = 1;
    goto done;
trunc:
    snprintf(err, errn, "truncated directory");
done:
    free(h);
    if (!ok) { nspak_free(e, (int)n); return 0; }
    *out = e, *count = (int)n;
    return 1;
}
#endif
