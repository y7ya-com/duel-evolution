// rcdiff: run recompiled functions on cases from recomp/difftest.py, print what they did.
// Case (binary, little endian): fn, regs[8] (esp ignored), nargs, args[16], arena[ARENA_N]
// Result line: fn eax ecx edx ebx esp_delta ebp esi edi st0 | arena-diff | data-diff
#include <stdio.h>
#include <stdlib.h>

#include "rt.h"

#define ARENA 0x20000000u
#define ARENA_N 4096
#define DATA_LO 0xc7c000u
#define DATA_N 0x658d84u
#define RET_SENTINEL 0x7f000000u

static uint8_t *snap;

static void diff(const uint8_t *a, const uint8_t *b, uint32_t base, uint32_t n) {
    for (uint32_t i = 0; i < n;) {
        if (a[i] == b[i]) { i++; continue; }
        uint32_t j = i;
        while (j < n && a[j] != b[j]) j++;
        printf(" %x:", base + i);
        for (uint32_t k = i; k < j; k++) printf("%02x", b[k]);
        i = j;
    }
}

int main(int argc, char **argv) {
    rc_init(argc > 2 ? argv[2] : "../game/yo2.exe");
    rc_commit(ARENA, ARENA_N);
    snap = malloc(DATA_N);
    memcpy(snap, rc_mem + DATA_LO, DATA_N);
    FILE *f = fopen(argv[1], "rb");
    uint32_t hdr[26];
    uint8_t arena[ARENA_N];
    CPU *c0 = rc_new_thread_cpu(0x100000);
    rc_set_cur(c0);
    // same stack and TEB addresses as difftest.py's Unicorn side, so stored stack pointers compare equal
    rc_commit(0x30000000u, 0x100000);
    rc_commit(0x7ffd0000u, 0x1000);
    WR32m(0x7ffd0000u, 0xffffffffu);
    c0->fs_base = 0x7ffd0000u;
    uint32_t sp0 = 0x30100000u - 0x100;
    while (fread(hdr, 4, 26, f) == 26 && fread(arena, 1, ARENA_N, f) == ARENA_N) {
        memcpy(rc_mem + DATA_LO, snap, DATA_N);
        memcpy(rc_mem + ARENA, arena, ARENA_N);
        WR32m(0x7ffd0000u, 0xffffffffu);
        CPU *c = c0;
        c->eax = hdr[1]; c->ecx = hdr[2]; c->edx = hdr[3]; c->ebx = hdr[4];
        c->ebp = hdr[6]; c->esi = hdr[7]; c->edi = hdr[8];
        c->esp = sp0;
        rc_finit(c);
        c->fcw = 0x27f;
        uint32_t n = hdr[9];
        for (int i = (int)n - 1; i >= 0; i--) PUSHm(c, hdr[10 + i]);
        PUSHm(c, RET_SENTINEL);
        uint32_t esp_before = c->esp;
        RcFn fn = rc_lookup(hdr[0]);
        if (!fn) { printf("%x nofn\n", hdr[0]); continue; }
        fn(c);
        double st0 = c->ftop == 0 ? 0.0 : ST(0);
        printf("%x %x %x %x %x %d %x %x %x %.17g %u |", hdr[0], c->eax, c->ecx, c->edx, c->ebx,
               (int)(c->esp - esp_before), c->ebp, c->esi, c->edi, st0, (8 - c->ftop) & 7);
        diff(arena, rc_mem + ARENA, ARENA, ARENA_N);
        printf(" |");
        diff(snap, rc_mem + DATA_LO, DATA_LO, DATA_N);
        printf("\n");
        fflush(stdout);
    }
    return 0;
}

// no imports in difftest cases: Unicorn skips any case that reaches one
