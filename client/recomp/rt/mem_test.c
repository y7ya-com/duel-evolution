// VirtualAlloc granules without the game: lowest-address first fit, a freed run held back until 64 MB of later frees
// are queued behind it (rt/mem.c quarantine), and the whole quarantine released before running out of memory.
// `make mem_test` (through tools/buildslot.py), then build/mem_test.
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/mman.h>

#include "rt.h"

uint8_t *rc_mem;
void rc_log(const char *fmt, ...) { (void)fmt; }
void rc_commit(uint32_t a, uint32_t n) { (void)a; (void)n; }
CPU *rc_cur(void) { return NULL; }
void rc_trap(CPU *c, uint32_t a, const char *why) { (void)c; (void)a; fprintf(stderr, "trap: %s\n", why); exit(1); }
unsigned rc_stacks_made, rc_stacks_freed;
void backtrace_guest(CPU *c) { (void)c; }
extern uint32_t rc_heap_hi;
uint32_t rc_valloc(uint32_t size);   // rt.c declares these where it uses them
void rc_vfree(uint32_t a);

int main(void) {
    rc_mem = mmap(NULL, 0x100000000ull, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANON | MAP_NORESERVE, -1, 0);
    assert(rc_mem != MAP_FAILED);
    const uint32_t MB = 1u << 20;
    uint32_t a = rc_valloc(MB), b = rc_valloc(MB);
    assert(a == RC_HEAP_LO && b == a + MB);   // lowest address first
    rc_mem[a] = 7;
    rc_vfree(a);
    assert(rc_mem[a] == 0);                   // zeroed at once
    assert(rc_valloc(MB) == b + MB);          // but not handed out again yet
    for (int i = 0; i < 64; i++) rc_vfree(rc_valloc(MB));   // 64 MB of later frees push it out of the quarantine
    assert(rc_valloc(MB) == a);
    // out of room: the quarantine is released instead of trapping
    rc_heap_hi = RC_HEAP_LO + 200 * MB;
    uint32_t big = rc_valloc(150 * MB);
    rc_vfree(big);                            // 150 MB queued (more than QUAR: the oldest go, this one stays)
    assert(rc_valloc(150 * MB) == big);       // only fits where the quarantined run is
    puts("mem_test: ok");
    return 0;
}
