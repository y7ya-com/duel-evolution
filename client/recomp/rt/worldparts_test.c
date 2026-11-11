// ovr/worldparts.c, one look and no world rule for avatar parts (owner, 2026-11-05), over a stand-in guest: the PBIN dictionary, the owned
// flags and the part vector are host fakes behind rc_call, and o_00a58cc0 / o_00ad5ab0 are models of the exe's
// avatarValidate and collect (src/Game/yo2GameManager.cpp, src/Game/yo2PlayerBin.cpp; game_manager_test checks the
// former on the real PBIN map). The rows are synthetic, shaped like the real ones; `build/worldparts_test <rows>`
// takes the real rows instead, one "pbin number kind slot series" per line, e.g. from server/gamedata/lobby.json:
//   python3 -I -c 'import json,sys; [print(k, r[0], r[2], r[3], r[5]) for k, r in json.load(open(sys.argv[1]))["avatar_pbin"].items()]' lobby.json
//   make worldparts_test && build/worldparts_test [rows]
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include "../ovr/worldparts.c"

uint8_t *rc_mem;
void rc_log(const char *fmt, ...) { (void)fmt; }

enum { MNG = 0x100000, DICT = 0x200000, OWNED = 0x300000, OUT = 0x310000, BUF = 0x320000, DATA = 0x330000,
       APPOBJ = 0x340000, ACC = 0x350000, DLG = 0x360000, STACK = 0x800000 };
typedef struct { int32_t number, kind, slot, series; } Row;
static Row rows[0x400];
static uint8_t owned[0x400];

static void put_row(int pbin, int number, int kind, int slot, int series) {
    rows[pbin] = (Row){number, kind, slot, series};
    uint32_t r = DICT + DICT_ROWS + PI_SIZE * pbin;
    WR32m(r, pbin), WR32m(r + PI_NUMBER, number), WR32m(r + PI_KIND, kind), WR32m(r + PI_SLOT, slot),
        WR32m(r + PI_SERIES, series);
}

static void synthetic_rows(void) {   // per sex: the real slots and series of clothes and disks, two odd hairs
    for (int sex = 0; sex < 2; sex++) {
        int base = sex * 0x100, kind = sex + 1;
        for (int n = 0; n < 0x0e; n++) put_row(base + n, n, kind, 1, 1);
        put_row(base + 0x0e, 0x0e, kind, 1, 2);   // a Domino-only and an Academy-only hair (the exe's series): worn
        put_row(base + 0x0f, 0x0f, kind, 1, 3);   // in both worlds now
        for (int n = 0x20; n < 0x24; n++) put_row(base + n, n, kind, 2, 1);
        put_row(base + 0x30, 0x30, kind, 3, 1);
        put_row(base + 0x40, 0x40, kind, 4, 1);
        put_row(base + 0x50, 0x50, kind, 9, 1), put_row(base + 0x51, 0x51, kind, 9, 1);
        put_row(base + 0x60, 0x60, kind, 5, 1);
        put_row(base + 0x90, 0x90, kind, 7, 1);
        int domino = sex ? 0x77 : 0x7c, robe = sex ? 0x75 : 0x78, academy = sex ? 0x86 : 0x8b;
        for (int n = 0x70; n <= domino; n++) put_row(base + n, n, kind, 6, n == robe ? 1 : 2);
        for (int n = 0x80; n <= academy; n++) put_row(base + n, n, kind, 6, 3);
        for (int n = 0xb0; n <= 0xb7; n++) put_row(base + n, n, kind, 8, 2);
        for (int n = 0xb8; n <= 0xbf; n++) put_row(base + n, n, kind, 8, 3);
        for (int n = 0xc0; n <= 0xc4; n++) put_row(base + n, n, kind, 8, 2);
        for (int n = 0xd0; n <= 0xd7; n++) put_row(base + n, n, kind, 8, 3);
    }
}

uint32_t rc_call(CPU *c, uint32_t fn, int n, const uint32_t *a) {
    switch (fn) {
    case 0x00406fe6: assert(c->ecx == MNG && n == 0); return DICT;   // CGameMng::pbinDictionary
    case 0x004110b3:                                                  // CPbinDictionary::getInfo(pbin, &info)
        assert(c->ecx == DICT && n == 2 && a[0] < 0x400 && a[1] < c->esp + 0x20 && a[1] >= c->esp);
        memcpy(G(a[1]), G(DICT + DICT_ROWS + PI_SIZE * a[0]), PI_SIZE);
        return 1;
    case 0x00406f8c: assert(c->ecx == OWNED && n == 1); return owned[a[0]];   // CPlayerBinData::flag
    case 0x00403733:                                                           // vector<PbinInfo>::insert(end, 1, x)
        assert(c->ecx == OUT && n == 3 && a[0] == RD32m(OUT + 8) && a[1] == 1);
        if (!RD32m(OUT + 4)) WR32m(OUT + 4, BUF), WR32m(OUT + 8, BUF);   // an empty vector's first storage
        memcpy(G(RD32m(OUT + 8)), G(a[2]), PI_SIZE);
        WR32m(OUT + 8, RD32m(OUT + 8) + PI_SIZE);
        return 0;
    }
    fprintf(stderr, "unexpected guest call %08x\n", fn);
    abort();
}

static void set_default(uint8_t *b, int world) {
    memset(b, 0, 16);
    b[2] = 0x20, b[3] = 0x30, b[4] = 0x40, b[5] = 0x60, b[7] = 0x90, b[9] = 0x20;
    b[6] = world == 1 ? 0x80 : 0x70, b[8] = world == 1 ? 0xb8 : 0xb0;
}

// the exe's avatarValidate (0x00a58cc0)
void o_00a58cc0(CPU *restrict c) {
    uint8_t *b = G(ARG(0) + 4);
    int world = (int)ARG(1), check = ARG(2) & 0xff, ok = b[0] <= 1, base = b[0] == 1 ? 0x100 : 0;
    for (int i = 0; ok && i < 16; i++) {
        if (i == 0 || i >= 13) ok = b[i] <= 7;
        if (i < 1 || i > 9) continue;
        if (i == 9 && b[i] == 0) b[i] = 0x20;
        const Row *r = &rows[b[i] + base];
        int none = (i == 2 || i == 9) && b[i] == 0x20;
        if ((r->slot != i && !none) || (check && r->series != 1 && r->series != (world != 0) + 2)) ok = 0;
    }
    if (!ok) set_default(b, world);
    RET(3, 0);
}

// the exe's CPbinDictionary::collect (0x00ad5ab0)
void o_00ad5ab0(CPU *restrict c) {
    uint32_t from = ARG(1), to = ARG(2);
    int32_t kind = (int32_t)ARG(3), slot = (int32_t)ARG(4), series = (int32_t)ARG(5);
    for (uint32_t i = from; i <= to; i++) {
        const Row *r = &rows[i];
        if (owned[i] && r->kind == kind && r->slot == slot && (r->series == series || r->series == 1)) {
            uint32_t a[3] = {RD32m(OUT + 8), 1, DICT + DICT_ROWS + PI_SIZE * i};
            CPU t = *c;
            t.ecx = OUT;
            rc_call(&t, 0x00403733, 3, a);
        }
    }
    RET(7, RD32m(OUT + 4) != RD32m(OUT + 8));
}

// the exe's avatar shop list (0x00afac40): the parts of the player's kind whose row, as getInfo copies it, has series
// 1 or the world's
static int shop_kind, shop_n, shop[0x400];
void o_00afac40(CPU *restrict c) {
    uint32_t world = RD32m(MNG + 0x448), want = world == 0 ? 2 : 3, info = STACK - 0x100;
    shop_n = 0;
    for (uint32_t i = 0; i < 0x400; i++) {
        CPU t = *c;
        t.ecx = DICT, t.esp = info;
        uint32_t a[2] = {i, info};
        rc_call(&t, 0x004110b3, 2, a);
        uint32_t s = RD32m(info + PI_SERIES);
        if ((int32_t)RD32m(info + PI_KIND) == shop_kind && (s == 1 || s == want)) shop[shop_n++] = (int)i;
    }
    RET(4, 0);
}

static CPU cpu(void) {
    CPU c;
    memset(&c, 0, sizeof c);
    c.esp = STACK, c.ebx = 0x1111, c.ebp = 0x2222, c.esi = 0x3333, c.edi = 0x4444;
    return c;
}

static int ncalls;
// f (the override) or o (the model of the exe) on a copy of `in`, into out
static void validate_on(void (*fn)(CPU *restrict), const uint8_t *in, int world, int check, uint8_t *out) {
    memcpy(G(DATA + 4), in, 16);
    CPU c = cpu();
    PUSHm(&c, check), PUSHm(&c, world), PUSHm(&c, DATA), PUSHm(&c, 0x00abcdef);
    fn(&c);
    assert(c.esp == STACK && c.ret_to == 0x00abcdef);   // stdcall: its 3 arguments popped
    assert(c.ebx == 0x1111 && c.ebp == 0x2222 && c.esi == 0x3333 && c.edi == 0x4444);
    memcpy(out, G(DATA + 4), 16);
    ncalls++;
}

static int is_default(const uint8_t *b, int world) {
    uint8_t d[16];
    set_default(d, world);
    return !memcmp(b, d, 16);
}

// what avatarValidate draws: any outfit and any disk of their slot in either world, whatever the series
static int expect_drawn(int sex, int clothes, int disk) {
    return rows[sex * 0x100 + clothes].slot == 6 && rows[sex * 0x100 + disk].slot == 8;
}

// the exe's CWindowDialogAvatarSwitch::refresh (0x008ae060), as far as the override cares: the LV it reads (through
// accountActivePlayer, the active slot's CPlayerInfo +0xa4) for its gate
static int refresh_calls, refresh_level;
void o_008ae060(CPU *restrict c) {
    assert(c->ecx == DLG);
    refresh_calls++;
    uint32_t app = RD32m(APP), acc = app ? RD32m(app + 0xc68) : 0;
    uint8_t slot = acc ? *(uint8_t *)G(acc + ACC_ME + ME_SLOT) : 0xff;
    refresh_level = slot < 4 ? *(uint8_t *)G(acc + ACC_ME + ME_PLAYERS + PLAYER_SIZE * slot + PLAYER_LEVEL) : -2;
    RETC(0);
}
static uint8_t *level_of(int slot) { return G(ACC + ACC_ME + ME_PLAYERS + PLAYER_SIZE * slot + PLAYER_LEVEL); }
static void set_bit(uint32_t bits, int bit, int on) {
    uint8_t *b = G(bits);
    b[bit >> 3] = on ? b[bit >> 3] | 1 << (bit & 7) : b[bit >> 3] & ~(1 << (bit & 7));
}
// refresh through the override: the level it saw (-1: the original not called)
static int refresh_sees(void) {
    CPU c = cpu();
    c.ecx = DLG;
    PUSHm(&c, 0x00abcdef);
    int before = refresh_calls;
    refresh_level = -1;
    f_008ae060(&c);
    assert(c.esp == STACK && c.ret_to == 0x00abcdef && refresh_calls == before + 1);
    return refresh_level;
}

// the list collect makes, as pbin numbers
static int list(void (*fn)(CPU *restrict), int sex, int slot, int series, int *pbins) {
    WR32m(OUT + 4, 0), WR32m(OUT + 8, 0);   // empty, as the editor's
    CPU c = cpu();
    c.ecx = DICT;
    uint32_t base = sex * 0x100, args[7] = {OWNED, base, base + 0xff, (uint32_t)sex + 1, (uint32_t)slot, (uint32_t)series, OUT};
    for (int i = 6; i >= 0; i--) PUSHm(&c, args[i]);
    PUSHm(&c, 0x00abcdef);
    fn(&c);
    assert(c.esp == STACK && c.ret_to == 0x00abcdef);
    int n = (int)(RD32m(OUT + 8) - RD32m(OUT + 4)) / PI_SIZE;
    assert((c.eax & 0xff) == (n > 0));
    for (int i = 0; i < n; i++) pbins[i] = (int)RD32m(BUF + PI_SIZE * i);
    return n;
}

int main(int argc, char **argv) {
    rc_mem = calloc(1, 0x01400000);
    WR32m(GAME_MNG, MNG);
    if (argc > 1) {   // the real rows
        FILE *f = fopen(argv[1], "r");
        assert(f);
        int pbin, number, kind, slot, series, n = 0;
        while (fscanf(f, "%d %d %d %d %d", &pbin, &number, &kind, &slot, &series) == 5)
            if (pbin >= 0 && pbin < 0x400) put_row(pbin, number, kind, slot, series), n++;
        fclose(f);
        printf("worldparts_test: %d rows from %s\n", n, argv[1]);
    } else {
        synthetic_rows();
    }
    memset(owned, 1, sizeof owned);
    owned[PBIN_GRADUATED] = owned[PBIN_RANKED] = 0;   // no item: the server's flags (set in 3 and 5)
    uint8_t in[16], out[16], ref[16];

    // 1. every clothes x disk byte, both sexes, both worlds: kept whenever the slots are right, whatever the series
    int kept = 0;
    for (int sex = 0; sex < 2; sex++)
        for (int world = 0; world < 2; world++)
            for (int cl = 0; cl < 256; cl++)
                for (int dk = 0; dk < 256; dk++) {
                    set_default(in, 0);
                    in[0] = sex, in[6] = cl, in[8] = dk;
                    validate_on(f_00a58cc0, in, world, 1, out);
                    if (expect_drawn(sex, cl, dk)) {
                        assert(!memcmp(in, out, 16));
                        kept++;
                    } else {
                        assert(is_default(out, world));
                    }
                }
    // every row of every slot, both sexes, both worlds, alone in an otherwise default look: kept iff of its slot
    for (int sex = 0; sex < 2; sex++)
        for (int world = 0; world < 2; world++)
            for (int slot = 1; slot <= 9; slot++)
                for (int n = 0; n < 0x100; n++) {
                    set_default(in, world);
                    in[0] = sex, in[slot] = n;
                    validate_on(f_00a58cc0, in, world, 1, out);
                    if (slot == 9 && n == 0) in[9] = 0x20;   // the exe's ACCESSORY2 0 -> none
                    int none = (slot == 2 || slot == 9) && in[slot] == 0x20, mine = rows[sex * 0x100 + n].slot == slot;
                    assert(mine || none ? !memcmp(in, out, 16) : is_default(out, world));
                }
    // the named cases
    struct { int sex, clothes, disk, world, ok; } named[] = {
        {0, 0x70, 0xb8, 0, 1}, {0, 0x70, 0xb0, 1, 1},   // a Domino outfit in the Academy
        {0, 0x80, 0xb0, 0, 1}, {0, 0x82, 0xd7, 0, 1},   // Academy outfits (uniforms too) and disks in Domino
        {0, 0x80, 0xb0, 1, 1}, {0, 0x80, 0xc4, 1, 1},   // Domino disks in the Academy
        {0, 0x78, 0xb0, 0, 1}, {0, 0x78, 0xb8, 1, 1},   // the QUALIFIER's Robe (series 1), both worlds
        {1, 0x75, 0xb0, 0, 1}, {1, 0x75, 0xb8, 1, 1},
        {1, 0x81, 0xb0, 0, 1}, {1, 0x71, 0xb8, 1, 1},
        {0, 0x30, 0xb0, 1, 0}, {0, 0x80, 0x30, 0, 0},   // a part of another slot: still the default
    };
    for (size_t k = 0; k < sizeof named / sizeof *named; k++) {
        set_default(in, 0);
        in[0] = named[k].sex, in[6] = named[k].clothes, in[8] = named[k].disk;
        validate_on(f_00a58cc0, in, named[k].world, 1, out);
        assert(named[k].ok ? !memcmp(in, out, 16) : is_default(out, named[k].world));
    }
    // every part whose row is one world's only (series 2 Domino, 3 Academy), any slot: drawn in the other world too
    int oneWorld = 0;
    for (int sex = 0; sex < 2; sex++)
        for (int n = 0; n < 0x100; n++) {
            const Row *r = &rows[sex * 0x100 + n];
            if (r->kind != sex + 1 || r->slot < 1 || r->slot > 9 || (r->series != 2 && r->series != 3)) continue;
            int other = r->series == 2;   // the Academy for a Domino part, Domino for an Academy one
            set_default(in, other), in[0] = sex, in[r->slot] = n;
            validate_on(f_00a58cc0, in, other, 1, out), assert(!memcmp(in, out, 16));
            oneWorld++;
        }
    assert(oneWorld > 0);
    // the exe's own checks still reset: a bad sex, a part of another slot, a colour out of range
    for (int world = 0; world < 2; world++) {
        set_default(in, 1 - world), in[0] = 2;
        validate_on(f_00a58cc0, in, world, 1, out), assert(is_default(out, world));
        set_default(in, 1 - world), in[1] = 0x30;
        validate_on(f_00a58cc0, in, world, 1, out), assert(is_default(out, world));
        for (int i = 13; i < 16; i++) {
            set_default(in, 1 - world), in[i] = 8;
            validate_on(f_00a58cc0, in, world, 1, out), assert(is_default(out, world));
        }
    }

    // 2. any input: exactly the exe with checkSeries false, whatever checkSeries says
    srand(1);
    static const uint8_t pool[] = {0x00, 0x01, 0x0e, 0x0f, 0x20, 0x21, 0x30, 0x40, 0x50, 0x51, 0x60, 0x90, 0x70,
                                   0x80, 0xb0, 0xb8, 0x00, 0x20, 0xff};
    for (int n = 0; n < 200000; n++) {
        int world = rand() % 3 - (rand() % 8 == 0);   // mostly 0 and 1; 2 and -1 count as the Academy
        for (int i = 0; i < 16; i++) in[i] = pool[rand() % sizeof pool];
        in[0] = rand() % 9 ? rand() % 2 : rand() % 4;
        for (int i = 13; i < 16; i++) in[i] = rand() % 9;
        int check = rand() % 4 != 0;
        if (rand() % 2) in[6] = rand() % 2 ? 0x70 : 0x80, in[8] = rand() % 2 ? 0xb0 : 0xb8;
        validate_on(f_00a58cc0, in, world, check | (rand() % 2 ? 0x100 : 0), out);   // only the low byte is the bool
        validate_on(o_00a58cc0, in, world, 0, ref);
        assert(!memcmp(out, ref, 16));
    }

    // 3. the editor's lists (series 2 in Domino, 3 in the Academy): every owned part of the kind and slot, both worlds
    int got[256], want[256];
    for (int pass = 0; pass < 2; pass++) {
        if (pass) {   // then with some parts not owned, and the server's graduated flag (no longer read) set
            for (int i = 0; i < 0x400; i += 3) owned[i] = 0;
            owned[0x70] = owned[0x80] = owned[0xb3] = owned[0x0e] = 0;
            owned[PBIN_GRADUATED] = 1;
        }
        for (int sex = 0; sex < 2; sex++)
            for (int series = 2; series <= 3; series++)
                for (int slot = 1; slot <= 9; slot++) {
                    int n = list(f_00ad5ab0, sex, slot, series, got), m = 0;
                    for (int i = sex * 0x100; i < sex * 0x100 + 0x100; i++)
                        if (owned[i] && rows[i].slot == slot && rows[i].kind == sex + 1) want[m++] = i;
                    assert(n == m && !memcmp(got, want, sizeof *got * m));
                    if (!pass && (slot == 6 || slot == 8)) assert(m > 0);
                    for (int i = 0; i < n; i++) assert(owned[got[i]]);   // never one not owned
                }
    }
    memset(owned, 0, sizeof owned);
    assert(list(f_00ad5ab0, 0, 8, 2, got) == 0);
    memset(owned, 1, sizeof owned);
    owned[PBIN_GRADUATED] = owned[PBIN_RANKED] = 0;

    // 4. the avatar shop's list: every row reads series 1 (so every part of the player's kind, any world value), and
    // the dictionary as it was afterwards
    static uint8_t before[PI_SIZE * 0x400];
    memcpy(before, G(DICT + DICT_ROWS), sizeof before);
    static const int worlds[] = {0, 1, 5};
    for (int sex = 0; sex < 2; sex++)
        for (size_t w = 0; w < sizeof worlds / sizeof *worlds; w++) {
            WR32m(MNG + 0x448, worlds[w]);
            shop_kind = sex + 1;
            CPU c = cpu();
            c.ecx = 0x00340000;
            for (int i = 0; i < 4; i++) PUSHm(&c, 0);
            PUSHm(&c, 0x00abcdef);
            f_00afac40(&c);
            assert(c.esp == STACK && c.ret_to == 0x00abcdef && !memcmp(before, G(DICT + DICT_ROWS), sizeof before));
            int m = 0, clothes = 0, disks = 0;
            for (int i = 0; i < 0x400; i++) {
                if (rows[i].kind != sex + 1) continue;
                assert(m < shop_n && shop[m] == i);
                m++, clothes += rows[i].slot == 6, disks += rows[i].slot == 8;
            }
            assert(m == shop_n && disks == 29 && clothes == (sex ? 15 : 25));
        }

    // 5. the editor's LV gate: lifted (LV reads 255 for the call, then is put back) only with PBIN_RANKED in the dialog's
    // bits; without it (an older server, a new character's starter bits) the exe's gate sees the real LV
    WR32m(APPOBJ + 0xc68, ACC);
    WR32m(APP, APPOBJ);
    for (int slot = 0; slot < 4; slot++) *level_of(slot) = (uint8_t)(3 + slot);
    uint32_t dlgBits = DLG + DLG_BIN + BIN_BITS;
    for (int slot = 0; slot < 4; slot++) {
        *(uint8_t *)G(ACC + ACC_ME + ME_SLOT) = (uint8_t)slot;
        set_bit(dlgBits, PBIN_RANKED, 0);
        assert(refresh_sees() == 3 + slot);
        set_bit(dlgBits, PBIN_RANKED, 1);
        set_bit(dlgBits, PBIN_GRADUATED, slot & 1);
        assert(refresh_sees() == 0xff);
        for (int k = 0; k < 4; k++) assert(*level_of(k) == 3 + k);   // every LV as it was
    }
    *(uint8_t *)G(ACC + ACC_ME + ME_SLOT) = 4;   // no active character (the exe's null): the original, untouched
    assert(refresh_sees() == -2);
    WR32m(APP, 0);                                // no app yet: the same
    assert(refresh_sees() == -2);

    // 6. what others see: every look of right-slot parts (any series) is drawn exactly as sent, never reset: every
    // combination of hair, accessory, outfit, duel disk and glasses rows (and "none"), both sexes, both worlds, with
    // the body features (nose, eyes, mouth, back hair) and colours cycling through all of theirs alongside. Ownership
    // and the dorm uniforms' rank gate are the server's (ranking.ts rankRowAllowed), not drawn here.
    int lawful = 0;
    for (int sex = 0; sex < 2; sex++)
        for (int world = 0; world < 2; world++) {
            int cand[10][256], nc[10] = {0};
            for (int slot = 1; slot <= 9; slot++) {
                if (slot == 2 || slot == 9) cand[slot][nc[slot]++] = 0x20;   // "none" (validAppearance takes it as is)
                for (int n = 0; n < 0x100; n++) {
                    const Row *r = &rows[sex * 0x100 + n];
                    if (r->kind != sex + 1 || r->slot != slot || ((slot == 2 || slot == 9) && n == 0x20)) continue;
                    cand[slot][nc[slot]++] = n;
                }
                assert(nc[slot] > 0);
            }
            long k = 0;
            for (int h = 0; h < nc[1]; h++)
                for (int a = 0; a < nc[2]; a++)
                    for (int cl = 0; cl < nc[6]; cl++)
                        for (int dk = 0; dk < nc[8]; dk++)
                            for (int gl = 0; gl < nc[9]; gl++, k++) {
                                memset(in, 0, 16);
                                in[0] = sex, in[1] = cand[1][h], in[2] = cand[2][a], in[6] = cand[6][cl], in[8] = cand[8][dk], in[9] = cand[9][gl];
                                in[3] = cand[3][k % nc[3]], in[4] = cand[4][k / 3 % nc[4]], in[5] = cand[5][k / 7 % nc[5]], in[7] = cand[7][k / 11 % nc[7]];
                                in[13] = k % 3, in[14] = k / 5 % 7, in[15] = k / 13 % 7;   // validAppearance's colour ranges
                                validate_on(f_00a58cc0, in, world, 1, out);
                                assert(!memcmp(in, out, 16));
                                lawful++;
                            }
        }
    printf("worldparts_test ok (%d validations, %d clothes x disk pairs kept, %d looks drawn as sent)\n", ncalls, kept, lawful);
    return 0;
}
