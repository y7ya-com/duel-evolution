// The recompiled CRT memmove (0xb09270) against libc's, on the real exe: every length 0-80, every alignment, overlaps
// both ways. Crash #13 was its overlapping copy down (dst above src) of 20-31 bytes: `neg ecx; jmp [ecx*4 + tbl]`
// reaches 7 table slots back, cfg.jump_table took 4 and the boot copied 16 bytes of them, so slots -5..-7 read 0.
// `make memmove_test` (through tools/buildslot.py), then build/memmove_test [yo2.exe].
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "rt.h"

void f_00b09270(CPU *restrict c);

int main(int argc, char **argv) {
    rc_init(argc > 1 ? argv[1] : "run/game/yo2.exe");
    CPU *c = rc_new_thread_cpu(0x100000);
    rc_set_cur(c);
    rc_commit(0x30000000u, 0x100000);
    rc_commit(0x20000000u, 0x1000);
    const uint32_t A = 0x20000400u;
    uint8_t want[256];
    unsigned runs = 0;
    for (uint32_t n = 0; n <= 80; n++)
        for (uint32_t s = 0; s < 4; s++)
            for (int d = -12; d <= 12; d++) {
                for (int k = 0; k < 256; k++) want[k] = rc_mem[A - 64 + k] = (uint8_t)(k * 7 + 1);
                memmove(want + 64 + s + d, want + 64 + s, n);
                c->esp = 0x30100000u - 0x100;
                PUSHm(c, n), PUSHm(c, A + s), PUSHm(c, A + s + d), PUSHm(c, RC_RETURN_MAGIC);
                f_00b09270(c);
                if (c->eax != A + s + d || memcmp(rc_mem + A - 64, want, 256)) {
                    printf("memmove(dst %+d, n %u, src align %u): wrong\n", d, n, s);
                    return 1;
                }
                runs++;
            }
    printf("memmove_test: ok (%u copies)\n", runs);
    return 0;
}
