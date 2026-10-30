// ovr/xstring.c (crash #13): std::string::replace on a shared string holding a NUL. The original's un-share cuts it at
// the NUL and its tail memmove gets -7; the override keeps the length. Runs the recompiled code on the real exe.
// `make xstring_test` (through tools/buildslot.py), then build/xstring_test [yo2.exe].
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "rt.h"
#include "win.h"

void o_00671860(CPU *restrict c);
void f_00671860(CPU *restrict c);

// operator new / delete straight to the runtime heap (the CRT's needs its locks, i.e. imports)
void f_00b09654(CPU *restrict c) { c->eax = rc_halloc(RD32m(c->esp + 4), 0); c->ret_to = RD32m(c->esp); c->esp += 4; }
void f_00b08e6d(CPU *restrict c) { rc_hfree(RD32m(c->esp + 4)); c->ret_to = RD32m(c->esp); c->esp += 4; }

static const char TEXT[] = "AB\0CDEFGHIJ";   // 11 bytes, a NUL at 2
enum { LEN = sizeof TEXT - 1 };

// s: a string sharing a buffer with one other owner; x: "XYZW". Then s.replace(8, 1, x, 0, 4) (the n < n2 path that
// crashed, ret 006719d2). Returns s's buffer.
static uint32_t run(CPU *c, void (*fn)(CPU *restrict), uint32_t *buf, uint32_t *len) {
    uint32_t s = rc_halloc(16, 1), x = rc_halloc(16, 1), b = rc_halloc(48, 1), xb = rc_halloc(16, 1);
    rc_mem[b] = 1;   // the other owner
    memcpy(G(b + 1), TEXT, LEN + 1);
    WR32m(s + 4, b + 1), WR32m(s + 8, LEN), WR32m(s + 0xc, 31);
    memcpy(G(xb + 1), "XYZW", 5);
    WR32m(x + 4, xb + 1), WR32m(x + 8, 4), WR32m(x + 0xc, 31);
    uint32_t args[5] = {8, 1, x, 0, 4};
    c->esp = 0x30100000u - 0x100;
    c->ecx = s;
    for (int i = 4; i >= 0; i--) PUSHm(c, args[i]);
    PUSHm(c, RC_RETURN_MAGIC);
    fn(c);
    assert(c->ret_to == RC_RETURN_MAGIC && c->eax == s);
    assert(rc_mem[b] == 0 && !memcmp(G(b + 1), TEXT, LEN + 1));   // the other owner's copy untouched, now its own
    *len = RD32m(s + 8);
    *buf = RD32m(s + 4);
    return s;
}

int main(int argc, char **argv) {
    rc_init(argc > 1 ? argv[1] : "run/game/yo2.exe");
    CPU *c = rc_new_thread_cpu(0x100000);
    rc_set_cur(c);
    rc_commit(0x30000000u, 0x100000);
    rc_commit(0x7ffd0000u, 0x1000);
    WR32m(0x7ffd0000u, 0xffffffffu);
    c->fs_base = 0x7ffd0000u;

    uint32_t p, n;
    run(c, o_00671860, &p, &n);   // the original: cut at the NUL, then memmove(-7) (skipped by the guard)
    printf("original: len %u\n", n);
    assert(n != LEN + 3);

    run(c, f_00671860, &p, &n);
    static const char WANT[] = "AB\0CDEFGXYZWIJ";
    printf("fixed:    len %u\n", n);
    assert(n == sizeof WANT - 1 && !memcmp(G(p), WANT, sizeof WANT));
    printf("xstring_test: ok\n");
    return 0;
}
