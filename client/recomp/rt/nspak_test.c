// ovr/nspak.h, the engine's check of a new-style pack: a good pack passes, and every way a pack can be broken (short,
// a flipped byte, an undecodable or wrong-size PNG with a good CRC, a dump or a body picture missing, a bad name) is
// refused with a reason, never a crash (ASan + UBSan).
//   make nspak_test   (the placeholder pack: client/tools/newstyle_pack.py --placeholder, no game data)
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../ovr/nspak.h"

static uint8_t *good;
static size_t good_len;

typedef struct { char name[64]; uint8_t method; uint32_t stored, size, crc; uint8_t *data; } Ent;
static Ent ents[NSPAK_MAX];
static int nents;

static void parse(void) {   // the good pack's directory, to rebuild altered packs from
    size_t at = 12;
    nents = (int)nspak_u32(good + 8);
    for (int i = 0; i < nents; i++) {
        uint8_t ln = good[at];
        memcpy(ents[i].name, good + at + 1, ln), ents[i].name[ln] = 0;
        const uint8_t *r = good + at + 1 + ln;
        ents[i].method = r[0], ents[i].stored = nspak_u32(r + 1), ents[i].size = nspak_u32(r + 5), ents[i].crc = nspak_u32(r + 9);
        at += 1 + ln + 13;
    }
    for (int i = 0; i < nents; i++) ents[i].data = good + at, at += ents[i].stored;
    assert(at == good_len);
}

static void put32(uint8_t **p, uint32_t v) { (*p)[0] = v, (*p)[1] = v >> 8, (*p)[2] = v >> 16, (*p)[3] = v >> 24, *p += 4; }

static uint8_t *build(const Ent *e, int n, size_t *len) {
    size_t total = 12;
    for (int i = 0; i < n; i++) total += 1 + strlen(e[i].name) + 13 + e[i].stored;
    uint8_t *b = malloc(total), *p = b;
    memcpy(p, "YO2NSPK1", 8), p += 8;
    put32(&p, (uint32_t)n);
    for (int i = 0; i < n; i++) {
        size_t ln = strlen(e[i].name);
        *p++ = (uint8_t)ln;
        memcpy(p, e[i].name, ln), p += ln;
        *p++ = e[i].method;
        put32(&p, e[i].stored), put32(&p, e[i].size), put32(&p, e[i].crc);
    }
    for (int i = 0; i < n; i++) memcpy(p, e[i].data, e[i].stored), p += e[i].stored;
    *len = total;
    return b;
}

static int check(const uint8_t *b, size_t len, char *err) {
    NsEntry *e;
    int n;
    int ok = nspak_check(b, len, "cm", "99", 1, &e, &n, err, 160);
    if (ok) {
        assert(n == nents && e[0].size > 0);
        nspak_free(e, n);
    } else assert(err[0] && !e && !n);
    return ok;
}

static int find(const char *suffix) {
    for (int i = 0; i < nents; i++) {
        size_t a = strlen(ents[i].name), b = strlen(suffix);
        if (a >= b && !strcmp(ents[i].name + a - b, suffix)) return i;
    }
    assert(!"entry");
    return -1;
}

static void refused(const char *why, const uint8_t *b, size_t len, const char *expect) {
    char err[160] = "";
    int ok = check(b, len, err);
    printf("  %-34s %s\n", why, ok ? "ACCEPTED" : err);
    assert(!ok);
    if (expect) assert(strstr(err, expect));
}

int main(int argc, char **argv) {
    if (argc == 5) {   // nspak_test <pak> <cm|cw> <code> <skin>: check one real pack, as the engine does
        FILE *g = fopen(argv[1], "rb");
        if (!g) return printf("%s: missing\n", argv[1]), 1;
        uint8_t *blob = malloc(64 << 20);
        size_t n = fread(blob, 1, 64 << 20, g);
        fclose(g);
        NsEntry *e;
        int count;
        char why[160] = "";
        int ok = nspak_check(blob, n, argv[2], argv[3], atoi(argv[4]), &e, &count, why, sizeof why);
        printf("%s: %s\n", argv[1], ok ? "ok" : why);
        if (ok) nspak_free(e, count);
        free(blob);
        return !ok;
    }
    FILE *f = fopen(argc > 1 ? argv[1] : "build/nspak_placeholder.pak", "rb");
    assert(f);
    good = malloc(8 << 20);
    good_len = fread(good, 1, 8 << 20, f);
    fclose(f);
    parse();
    char err[160] = "";
    int ok = check(good, good_len, err);
    printf("  good pack: %s (%d entries)\n", ok ? "ok" : err, nents);
    fflush(stdout);
    assert(ok);

    uint8_t *b = malloc(good_len + 16);
    memcpy(b, good, good_len), memcpy(b, "YO2NSPK2", 8);
    refused("wrong magic", b, good_len, "not a new-style");
    refused("empty", good, 0, NULL);
    refused("cut short", good, good_len - 1000, "truncated");
    memcpy(b, good, good_len), b[good_len] = 0;
    refused("a trailing byte", b, good_len + 1, "trailing");
    memcpy(b, good, good_len), b[good_len - 3000] ^= 0x40;
    refused("a flipped byte", b, good_len, "corrupt");
    memcpy(b, good, good_len), memset(b + 8, 0xff, 4);
    refused("an absurd count", b, good_len, "entries");

    Ent e2[NSPAK_MAX];
    size_t len;
    uint8_t junk[64] = {0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'};
    memcpy(e2, ents, sizeof(Ent) * nents);   // a PNG that is not one, with a CRC that matches
    int k = find("_w03_04.png");
    e2[k].data = junk, e2[k].stored = e2[k].size = sizeof junk, e2[k].crc = nspak_crc32(junk, sizeof junk);
    uint8_t *p = build(e2, nents, &len);
    refused("undecodable PNG, good CRC", p, len, "PNG");
    free(p);

    memcpy(e2, ents, sizeof(Ent) * nents);
    k = find("_n05_01.png");
    memmove(&e2[k], &e2[k + 1], sizeof(Ent) * (nents - k - 1));
    p = build(e2, nents - 1, &len);
    refused("a body picture missing", p, len, "not in the pack");
    free(p);

    memcpy(e2, ents, sizeof(Ent) * nents);
    k = find("_hsw07_02.png");
    memmove(&e2[k], &e2[k + 1], sizeof(Ent) * (nents - k - 1));
    p = build(e2, nents - 1, &len);
    refused("a trimmed head missing", p, len, "not in the pack");
    free(p);

    memcpy(e2, ents, sizeof(Ent) * nents);
    k = find("_d01_02.txt");
    memmove(&e2[k], &e2[k + 1], sizeof(Ent) * (nents - k - 1));
    p = build(e2, nents - 1, &len);
    refused("a motion dump missing", p, len, "missing");
    free(p);

    memcpy(e2, ents, sizeof(Ent) * nents);
    k = find("_g02_01.png");
    strcpy(e2[k].name, "../../evil.png");
    p = build(e2, nents, &len);
    refused("a path in a name", p, len, "bad name");
    free(p);

    memcpy(e2, ents, sizeof(Ent) * nents);
    k = find("_g02_01.png");
    strcpy(e2[k].name, e2[k + 1].name);
    p = build(e2, nents, &len);
    refused("a name twice", p, len, "twice");
    free(p);

    memcpy(e2, ents, sizeof(Ent) * nents);   // a dump that is not one
    k = find("_t03.txt");
    static uint8_t txt[] = "hello, not a motion dump at all.....";
    e2[k].data = txt, e2[k].method = 0, e2[k].stored = e2[k].size = sizeof txt, e2[k].crc = nspak_crc32(txt, sizeof txt);
    p = build(e2, nents, &len);
    refused("a dump that is not one", p, len, "not a motion dump");
    free(p);

    // every prefix of the pack: refused, never a crash or a read past the end
    for (size_t cut = 0; cut < good_len; cut += cut < 4096 ? 1 : 4093) {
        uint8_t *q = malloc(cut ? cut : 1);
        memcpy(q, good, cut);
        NsEntry *e;
        int n;
        assert(!nspak_check(q, cut, "cm", "99", 1, &e, &n, err, sizeof err));
        free(q);
    }
    printf("  every prefix refused\n");
    // the wrong skin tone or code: the dumps name pictures this pack doesn't have
    NsEntry *e;
    int n;
    assert(!nspak_check(good, good_len, "cm", "99", 2, &e, &n, err, sizeof err));
    printf("  %-34s %s\n", "another skin tone's names", err);
    free(b);
    free(good);
    printf("nspak_test ok\n");
    return 0;
}
