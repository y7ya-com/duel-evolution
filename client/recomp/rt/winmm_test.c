// winmm timers without the game: a callback that re-arms a one-shot from inside itself (the exe's FUN_00536ba0) keeps
// going past the 63 slots, a killed periodic timer never calls back again, stale IDs are rejected.
// `make winmm_test` (through tools/buildslot.py), then build/winmm_test.
#include <stdatomic.h>
#include <stdlib.h>
#include <unistd.h>

#include "win.h"

uint8_t *rc_mem;
int rc_verbose;
static atomic_uint next_stack = 0x100000;
void rc_log(const char *fmt, ...) { (void)fmt; }
uint32_t rc_ticks_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}
uint64_t rc_real_us(uint32_t ms) { return (uint64_t)ms * 1000; }
int rc_fastforward;
void rc_thread_busy(int d) { (void)d; }
void rc_vwait(uint32_t ms) { (void)ms; }
void rc_set_cur(CPU *c) { (void)c; }
void rc_free_thread_stack(CPU *c) { (void)c; }
CPU *rc_new_thread_cpu(uint32_t stack_size) {
    (void)stack_size;
    CPU *c = calloc(1, sizeof *c);
    c->thread = calloc(1, sizeof *c->thread);
    c->esp = atomic_fetch_add(&next_stack, 0x10000) + 0x10000 - 64;   // 64 KB of fake guest stack each
    return c;
}

IMP(WINMM, timeSetEvent);
IMP(WINMM, timeKillEvent);
static uint32_t call(CPU *c, void (*f)(CPU *), int n, const uint32_t *a) {   // stdcall into an import shim
    uint32_t sp = c->esp;
    for (int i = n - 1; i >= 0; i--) PUSHm(c, a[i]);
    PUSHm(c, 0);   // return address
    f(c);
    c->esp = sp;
    return c->eax;
}
static uint32_t set_event(CPU *c, uint32_t ms, uint32_t cb, uint32_t user, uint32_t flags) {
    uint32_t a[5] = {ms, 1, cb, user, flags};
    return call(c, imp_WINMM_timeSetEvent, 5, a);
}
static uint32_t kill_event(CPU *c, uint32_t id) { return call(c, imp_WINMM_timeKillEvent, 1, &id); }

static atomic_int chain, periodic;
uint32_t rc_call(CPU *c, uint32_t fn, int n, const uint32_t *args) {   // the guest callbacks
    (void)n; (void)args;
    if (fn == 1 && atomic_fetch_add(&chain, 1) + 1 < 200) set_event(c, 1, 1, 0, 0);   // one-shot re-arms itself
    if (fn == 2) atomic_fetch_add(&periodic, 1);
    return 0;
}

static int fails;
static void check(int ok, const char *what) {
    printf("%s %s\n", ok ? "ok  " : "FAIL", what);
    fails += !ok;
}

int main(void) {
    rc_mem = calloc(1, 64u << 20);
    CPU *c = rc_new_thread_cpu(0);
    set_event(c, 1, 1, 0, 0);
    for (int i = 0; i < 500 && atomic_load(&chain) < 200; i++) usleep(10000);
    check(atomic_load(&chain) == 200, "self re-arming one-shot runs 200 times (slots freed as they fire)");

    uint32_t id = set_event(c, 1, 2, 0, 1);   // TIME_PERIODIC
    usleep(30000);
    check(kill_event(c, id) == 0, "timeKillEvent of a live periodic timer");
    int n = atomic_load(&periodic);
    usleep(20000);
    check(n > 0 && atomic_load(&periodic) == n, "no callback after timeKillEvent returns");
    check(kill_event(c, id) == 97, "second kill of the same ID is rejected");

    uint32_t once = set_event(c, 1, 3, 0, 0);
    usleep(20000);
    check(kill_event(c, once) == 97, "a one-shot that already fired is gone");
    uint32_t later = set_event(c, 1000, 3, 0, 0);
    check(later > once && kill_event(c, later) == 0, "IDs only grow; a pending one-shot can be killed");
    printf(fails ? "FAILED\n" : "PASS\n");
    return fails != 0;
}
