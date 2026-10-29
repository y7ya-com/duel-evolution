// Recompiled-yo2 runtime core: guest memory, image load, dispatch, traps, CPU helpers.
#include "rt.h"

#ifndef __EMSCRIPTEN__
#include <execinfo.h>
#endif
#include <pthread.h>
#include <signal.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <time.h>
#include <unistd.h>

uint8_t *rc_mem;
int rc_verbose;

// ---------------------------------------------------------------- logging
void rc_log(const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    vfprintf(stderr, fmt, ap);
    va_end(ap);
    fputc('\n', stderr);
}

// the host stack is the guest call stack: every f_XXXXXXXX frame is a guest function
#ifdef __EMSCRIPTEN__
void rc_web_stack(char *line, size_t n);
static void host_stack(void) {
    char line[1024];
    rc_web_stack(line, sizeof line);
    rc_log("  guest stack (innermost first): %s", line);
}
#else
static void host_stack(void) {
    void *pcs[64];
    int n = backtrace(pcs, 64);
    char **sy = backtrace_symbols(pcs, n);
    char line[1024];
    size_t k = 0;
    line[0] = 0;
    for (int i = 0; i < n && sy; i++) {
        const char *f = strstr(sy[i], " f_");
        const char *imp = strstr(sy[i], " imp_");
        const char *p = f ? f + 1 : imp ? imp + 1 : NULL;
        if (!p) continue;
        k += snprintf(line + k, sizeof line - k, "%.*s ", (int)strcspn(p, " "), p);
        if (k > sizeof line - 64) break;
    }
    rc_log("  guest stack (innermost first): %s", line);
}
#endif

static uint32_t heap_rd(uint32_t a) {   // 0 outside the guest heap (0x08000000 up)
    return a - 0x08000000u < 0x38000000u ? rc_rd32(rc_mem + a) : 0;
}

void backtrace_guest(CPU *c) {
    host_stack();
    if (!c) return;
    // best effort: walk the ebp chain (frame-pointer functions only)
    uint32_t bp = c->ebp;
    rc_log("  eax=%08x ecx=%08x edx=%08x ebx=%08x esp=%08x ebp=%08x esi=%08x edi=%08x",
           c->eax, c->ecx, c->edx, c->ebx, c->esp, c->ebp, c->esi, c->edi);
    // what the registers point at in the guest heap, and one hop on (for a COM pointer: the object with its block
    // header, then its vtable's slots 0, 0x2c, 0x30, 0x50 with its header)
    for (int r = 0; r < 8; r++) {
        uint32_t v = (&c->eax)[r], w = heap_rd(v);
        if (r != 4 && heap_rd(v - 8) | w)
            rc_log("  r%d [%08x] %08x %08x hdr %08x %08x | [%08x] %08x %08x %08x %08x hdr %08x %08x", r, v, w,
                   heap_rd(v + 4), heap_rd(v - 8), heap_rd(v - 4), w, heap_rd(w), heap_rd(w + 0x2c), heap_rd(w + 0x30),
                   heap_rd(w + 0x50), heap_rd(w - 8), heap_rd(w - 4));
    }
    uint32_t hi = rc_rd32(rc_mem + c->fs_base + 4), lo = rc_rd32(rc_mem + c->fs_base + 8);   // TEB stack bounds
    for (int i = 0; i < 16 && bp >= lo && bp + 8 <= hi; i++) {
        uint32_t ret = rc_rd32(rc_mem + bp + 4);
        rc_log("  frame %08x ret %08x", bp, ret);
        bp = rc_rd32(rc_mem + bp);
    }
}

_Noreturn void rc_trap(CPU *c, uint32_t addr, const char *what) {
    rc_log("rc_trap at %08x: %s", addr, what);
    backtrace_guest(c);
    fflush(stderr);
    _exit(134);   // not abort(): with SDL/Cocoa up, abort can hang
}

void rc_missing_import(CPU *c, const char *name, int nargs) {
    static int lenient = -1;
    if (lenient < 0) lenient = getenv("RC_LENIENT") != NULL;
    if (lenient && nargs >= 0) {   // exploration mode: log once per call site, return 0, pop the stdcall args
        static uint32_t seen[512];
        static unsigned nseen;
        uint32_t from = rc_rd32(rc_mem + c->esp);
        unsigned i = 0;
        while (i < nseen && seen[i] != from) i++;
        if (i == nseen && nseen < 512) {
            seen[nseen++] = from;
            rc_log("MISSING IMPORT %s (from %08x): returning 0", name, from);
        }
        c->eax = 0;
        c->ret_to = rc_rd32(rc_mem + c->esp);
        c->esp += 4 + 4 * nargs;
        return;
    }
    rc_log("MISSING IMPORT %s (called from %08x)", name, rc_rd32(rc_mem + c->esp));
    backtrace_guest(c);
    fflush(stderr);
    _exit(134);
}

// ---------------------------------------------------------------- memory
static void segv(int sig, siginfo_t *si, void *uc) {
    (void)uc;
    uintptr_t a = (uintptr_t)si->si_addr;
    if (a >= (uintptr_t)rc_mem && a < (uintptr_t)rc_mem + 0x100000000ull)
        fprintf(stderr, "guest fault (signal %d) at guest address %08x\n", sig, (unsigned)(a - (uintptr_t)rc_mem));
    else
        fprintf(stderr, "host fault (signal %d) at %p\n", sig, si->si_addr);
    CPU *c = rc_cur();
    if (c) backtrace_guest(c);
    if (c && getenv("RC_FAULT_DUMP"))   // heap blocks the registers point at (header 8 bytes before)
        for (int r = 0; r < 8; r++) {
            uint32_t v = (&c->eax)[r];
            if (v - 0x08000000u >= 0x10000000u) continue;
            fprintf(stderr, "  r%d %08x:", r, v);
            for (int k = -2; k < 8; k++) fprintf(stderr, " %08x", RD32m(v + 4 * k));
            fprintf(stderr, "\n");
        }
    fflush(stderr);
    _exit(139);
}

#ifdef __EMSCRIPTEN__
void rc_commit(uint32_t a, uint32_t n) { (void)a; (void)n; }   // linear memory: always there
static void mem_init(void) { rc_mem = 0; }                     // guest address == wasm address
#else
void rc_commit(uint32_t a, uint32_t n) {
    uint64_t pg = (uint64_t)getpagesize() - 1;   // 16 KB on Apple silicon
    uint64_t lo = a & ~pg, hi = ((uint64_t)a + n + pg) & ~pg;
    if (mprotect(rc_mem + lo, hi - lo, PROT_READ | PROT_WRITE)) {
        perror("mprotect");
        abort();
    }
}

static void mem_init(void) {
    void *p = mmap(NULL, 0x100000000ull, PROT_NONE, MAP_PRIVATE | MAP_ANON | MAP_NORESERVE, -1, 0);
    if (p == MAP_FAILED) {
        perror("mmap 4G");
        exit(1);
    }
    rc_mem = p;
    struct sigaction sa = {0};
    sa.sa_sigaction = segv;
    sa.sa_flags = SA_SIGINFO | SA_RESETHAND;
    sigaction(SIGSEGV, &sa, NULL);
    sigaction(SIGBUS, &sa, NULL);
}
#endif

// ---------------------------------------------------------------- image
static uint32_t rd32f(const uint8_t *b, size_t o) { uint32_t v; memcpy(&v, b + o, 4); return v; }
static uint16_t rd16f(const uint8_t *b, size_t o) { uint16_t v; memcpy(&v, b + o, 2); return v; }

uint32_t rc_image_base, rc_image_size, rc_entry;

static void load_image(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) {
        perror(path);
        exit(1);
    }
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    uint8_t *b = malloc(n);
    if (fread(b, 1, n, f) != (size_t)n) abort();
    fclose(f);
    uint32_t pe = rd32f(b, 0x3c);
    uint16_t nsec = rd16f(b, pe + 6), opt = rd16f(b, pe + 20);
    rc_image_base = rd32f(b, pe + 52);
    rc_image_size = rd32f(b, pe + 80);
    rc_entry = rc_image_base + rd32f(b, pe + 40);
    rc_commit(rc_image_base, rc_image_size);
    memcpy(rc_mem + rc_image_base, b, rd32f(b, pe + 84));   // headers
    for (int i = 0; i < nsec; i++) {
        size_t o = pe + 24 + opt + i * 40;
        uint32_t va = rd32f(b, o + 12), rsz = rd32f(b, o + 16), raw = rd32f(b, o + 20), vsz = rd32f(b, o + 8);
        memcpy(rc_mem + rc_image_base + va, b + raw, rsz < vsz ? rsz : vsz);
    }
    free(b);
    // IAT: each slot gets a magic address that dispatch maps back to the import shim
    for (unsigned i = 0; i < rc_imports_n; i++) WR32m(rc_imports[i].iat, RC_IMPORT_MAGIC + i * 4);
}

__attribute__((weak)) void rc_ovr_init(void) {}
__attribute__((weak)) void rc_ovr_frame(CPU *c) { (void)c; }
int rc_nospeed;

// ---------------------------------------------------------------- dispatch
RcFn rc_lookup(uint32_t t) {
    if (t >= RC_IMPORT_MAGIC && t < RC_IMPORT_MAGIC + rc_imports_n * 4) return rc_imports[(t - RC_IMPORT_MAGIC) / 4].fn;
    if (t >= RC_HOST_MAGIC && t < RC_HOST_MAGIC + RC_HOST_MAX * 4) return rc_host_fns[(t - RC_HOST_MAGIC) / 4];
    // virtual calls hit a few hundred targets over and over: a per-thread direct-mapped cache in front of the
    // binary search over every entry (~16 cache-missing steps)
    static _Thread_local struct { uint32_t addr; RcFn fn; } cache[4096];
    unsigned h = (t ^ t >> 12) & 4095;
    if (cache[h].addr == t && !rc_nospeed) return cache[h].fn;
    unsigned lo = 0, hi = rc_table_n;
    while (lo < hi) {
        unsigned mid = (lo + hi) / 2;
        if (rc_table[mid].addr < t) lo = mid + 1;
        else hi = mid;
    }
    RcFn f = lo < rc_table_n && rc_table[lo].addr == t ? rc_table[lo].fn : NULL;
    if (f) cache[h].addr = t, cache[h].fn = f;
    return f;
}

static pthread_mutex_t atomic_mu = PTHREAD_MUTEX_INITIALIZER;
void rc_atomic(int begin) { (begin ? pthread_mutex_lock : pthread_mutex_unlock)(&atomic_mu); }

void rc_icall(CPU *c, uint32_t t) {
    RcFn f = rc_lookup(t);
    if (!f) {
        char msg[160];   // a COM call: [esp+4] is `this`, its first word the vtable
        uint32_t self = rc_rd32(rc_mem + c->esp + 4);
        snprintf(msg, sizeof msg, "indirect call to unknown %08x (this? %08x: %08x %08x hdr %08x %08x)", t, self,
                 heap_rd(self), heap_rd(self + 4), heap_rd(self - 8), heap_rd(self - 4));
        rc_trap(c, rc_rd32(rc_mem + c->esp), msg);
    }
    f(c);
}

void rc_ijmp(CPU *c, uint32_t t) {
    RcFn f = rc_lookup(t);
    if (!f) {
        char msg[64];
        snprintf(msg, sizeof msg, "indirect jump to unknown %08x", t);
        rc_trap(c, 0, msg);
    }
    f(c);
}

// host functions handed to the guest as code pointers (COM vtables, callbacks)
RcFn rc_host_fns[RC_HOST_MAX];
static unsigned host_n;
uint32_t rc_host_fn(RcFn f) {
    for (unsigned i = 0; i < host_n; i++)
        if (rc_host_fns[i] == f) return RC_HOST_MAGIC + i * 4;
    if (host_n == RC_HOST_MAX) abort();
    rc_host_fns[host_n] = f;
    return RC_HOST_MAGIC + host_n++ * 4;
}

uint32_t rc_call(CPU *c, uint32_t fn, int n, const uint32_t *args) {
    for (int i = n - 1; i >= 0; i--) PUSHm(c, args[i]);
    PUSHm(c, RC_RETURN_MAGIC);
    rc_icall(c, fn);
    // != RC_RETURN_MAGIC: the guest left non-locally (a catch continuation); callers that care check c->ret_to
    return c->eax;
}

// ---------------------------------------------------------------- CPU helpers
// RC_TRACE_INPUT=1: log each (input API, argument, caller) once, to see which calls a scene polls
void rc_trace_input(CPU *c, const char *api, uint32_t arg) {
    static int on = -1;
    static uint64_t seen[512];
    static unsigned n;
    if (on < 0) on = getenv("RC_TRACE_INPUT") ? atoi(getenv("RC_TRACE_INPUT")) : 0;
    if (!on) return;
    if (on == 2) {   // every call, with what the shim will see
        rc_log("input: %s(%x) from %08x", api, arg, RD32m(c->esp));
        return;
    }
    uint64_t k = (uint64_t)RD32m(c->esp) << 32 ^ (uint64_t)arg << 8 ^ (uint64_t)(uintptr_t)api;
    for (unsigned i = 0; i < n; i++)
        if (seen[i] == k) return;
    if (n < 512) seen[n++] = k;
    rc_log("input: %s(%x) from %08x", api, arg, RD32m(c->esp));
}

void rc_cpuid(CPU *c) {
    // a plain Pentium Pro: x87 + TSC + CMOV, no MMX/SSE/3DNow!, so D3DX takes its x87 paths
    switch (c->eax) {
    case 0: c->eax = 1; c->ebx = 0x756e6547; c->edx = 0x49656e69; c->ecx = 0x6c65746e; break;  // GenuineIntel
    case 1: c->eax = 0x0612; c->ebx = 0; c->ecx = 0; c->edx = (1 << 0) | (1 << 4) | (1 << 15); break;
    default: c->eax = c->ebx = c->ecx = c->edx = 0;
    }
}

void rc_rdtsc(CPU *c) {
    uint64_t t = rc_now_us() * 1000;
    c->eax = (uint32_t)t;
    c->edx = (uint32_t)(t >> 32);
}

void rc_fxam(CPU *c) {
    double x = ST(0);
    c->fsw &= ~0x4700u;
    if (signbit(x)) c->fsw |= 0x200;
    if (isnan(x)) c->fsw |= 0x100;
    else if (isinf(x)) c->fsw |= 0x500;
    else if (x == 0) c->fsw |= 0x4000;
    else c->fsw |= 0x400;
}

void rc_finit(CPU *c) {
    c->fcw = 0x37f;
    c->fsw = 0;
    c->ftop = 0;
}

double rc_ld80(const uint8_t *p) {
    uint64_t mant;
    uint16_t se;
    memcpy(&mant, p, 8);
    memcpy(&se, p + 8, 2);
    int e = se & 0x7fff;
    double s = (se & 0x8000) ? -1.0 : 1.0;
    if (e == 0 && mant == 0) return 0.0 * s;
    if (e == 0x7fff) return (mant << 1) ? NAN : s * INFINITY;
    return s * ldexp((double)mant, e - 16383 - 63);
}

void rc_st80(uint8_t *p, double v) {
    uint64_t mant = 0;
    uint16_t se = signbit(v) ? 0x8000 : 0;
    if (isnan(v)) { se |= 0x7fff; mant = 0xc000000000000000ull; }
    else if (isinf(v)) { se |= 0x7fff; mant = 0x8000000000000000ull; }
    else if (v != 0) {
        int e;
        double f = frexp(fabs(v), &e);           // v = f * 2^e, f in [0.5, 1)
        mant = (uint64_t)ldexp(f, 64);
        se |= (uint16_t)(e - 1 + 16383);
    }
    memcpy(p, &mant, 8);
    memcpy(p + 8, &se, 2);
}

// FSAVE/FRSTOR (108-byte protected-mode image): env + 8 x 80-bit registers
void rc_fstenv(CPU *c, uint32_t a) {
    uint8_t *m = rc_mem;
    WR32(a, c->fcw | 0xffff0000u);
    WR32(a + 4, rc_fsw(c) | 0xffff0000u);
    WR32(a + 8, 0xffffffffu);   // tags: all empty (not modelled)
    for (int i = 12; i < 28; i += 4) WR32(a + i, 0);
}
void rc_fldenv(CPU *c, uint32_t a) {
    uint8_t *m = rc_mem;
    c->fcw = RD16(a);
    c->fsw = RD16(a + 4);
    c->ftop = (c->fsw >> 11) & 7;
}
void rc_fsave(CPU *c, uint32_t a) {
    rc_fstenv(c, a);
    for (int i = 0; i < 8; i++) rc_st80(rc_mem + a + 28 + i * 10, ST(i));
    rc_finit(c);
}
void rc_frstor(CPU *c, uint32_t a) {
    rc_fldenv(c, a);
    for (int i = 0; i < 8; i++) ST(i) = rc_ld80(rc_mem + a + 28 + i * 10);
}

// ---------------------------------------------------------------- threads / TEB
static pthread_key_t cur_key;
static int cur_ready;   // not rc_mem: on the web rc_mem is 0 (guest address == wasm address), so that test was always false
CPU *rc_cur(void) { return cur_ready ? pthread_getspecific(cur_key) : NULL; }

uint32_t rc_valloc(uint32_t size);
void rc_vfree(uint32_t a);
unsigned rc_stacks_made, rc_stacks_freed;   // rc_mem_report
void rc_free_thread_stack(CPU *c) { rc_vfree(c->thread->stack_lo); __atomic_add_fetch(&rc_stacks_freed, 1, __ATOMIC_RELAXED); }

CPU *rc_new_thread_cpu(uint32_t stack_size) {
    CPU *c = calloc(1, sizeof *c);
    c->thread = calloc(1, sizeof *c->thread);
    if (stack_size < 0x100000) stack_size = 0x100000;
    stack_size = (stack_size + 0xffff) & ~0xffffu;
    // from the VirtualAlloc granules: the game keeps ~130 threads at 1 MB (PE reserve) alive, more than any fixed
    // stack area holds; a bump area overflowed into the heap. ponytail: no guard page below the stack
    uint32_t lo = rc_valloc(stack_size + 0x10000);
    __atomic_add_fetch(&rc_stacks_made, 1, __ATOMIC_RELAXED);
    if (!lo) rc_trap(NULL, 0, "no guest memory for a thread stack");
    uint32_t teb = lo + stack_size;
    c->thread->stack_lo = lo;
    c->thread->stack_size = stack_size;
    rc_commit(lo, stack_size);
    rc_commit(teb, 0x1000);
    c->esp = lo + stack_size - 16;
    c->fs_base = teb;
    uint8_t *m = rc_mem;
    WR32(teb + 0x00, 0xffffffffu);   // SEH chain end
    WR32(teb + 0x04, lo + stack_size);
    WR32(teb + 0x08, lo);
    WR32(teb + 0x18, teb);
    WR32(teb + 0x30, RC_PEB);
    rc_finit(c);
    c->fcw = 0x27f;                  // MSVC CRT default: 53-bit precision, all exceptions masked
    return c;
}

void rc_set_cur(CPU *c) { pthread_setspecific(cur_key, c); }

// RC_TIMESCALE=N (test runs): the game's clocks run N times faster and its sleeps and timeouts last 1/N as long, so a
// scripted run reaches each scene in fewer wall seconds. Every clock the guest sees comes from rc_now_us.
uint32_t rc_timescale = 1;
static uint64_t mono_us(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000000 + (uint64_t)ts.tv_nsec / 1000;
}
static uint64_t t0_us, skip_us;
uint64_t rc_now_us(void) { return t0_us + (mono_us() - t0_us) * rc_timescale + __atomic_load_n(&skip_us, __ATOMIC_RELAXED); }
uint64_t rc_real_us(uint32_t ms) { return (uint64_t)ms * 1000 / rc_timescale; }   // a guest wait, in host time

// RC_FASTFORWARD=1 (test runs): virtual time. The guest main thread's Sleep advances the clock and returns at once, so
// the game's frame pacing never waits and frames run back to back; other threads wait for the virtual clock to reach
// their deadline (rc_vwait). Real time still flows underneath (x RC_TIMESCALE), so nothing waits forever on it.
int rc_fastforward;
void rc_time_skip(uint64_t us) { __atomic_add_fetch(&skip_us, us, __ATOMIC_RELAXED); }
// Discrete-event step: the other guest threads (loaders, timers, network) count themselves busy while they run guest
// code and idle while blocked in Sleep or a wait. The main thread's frame-pacing Sleep first waits for them all to be
// idle (at most RC_FF_IDLE_MS real ms, default 200, against a thread blocked somewhere uncounted), then jumps the
// clock: background work finishes in the same few frames however fast the host runs, so frame-numbered scripts hold.
static int busy_threads;
void rc_thread_busy(int d) { __atomic_add_fetch(&busy_threads, d, __ATOMIC_SEQ_CST); }
void rc_ff_main_sleep(uint32_t ms) {
    static uint64_t cap_us;
    if (!cap_us) cap_us = (getenv("RC_FF_IDLE_MS") ? (uint64_t)atoi(getenv("RC_FF_IDLE_MS")) : 200) * 1000;
    uint64_t t = mono_us();
#ifdef __EMSCRIPTEN__
    void rc_web_sleep(uint32_t ms);   // the browser thread: let workers' proxied calls run while it waits
    while (__atomic_load_n(&busy_threads, __ATOMIC_SEQ_CST) > 0 && mono_us() - t < cap_us) rc_web_sleep(0);
#else
    while (__atomic_load_n(&busy_threads, __ATOMIC_SEQ_CST) > 0 && mono_us() - t < cap_us) usleep(100);
#endif
    static unsigned capped;   // the cap hit: a thread stays busy (spinning on Sleep(0) or a 0 ms wait?) and each frame
    int busy = __atomic_load_n(&busy_threads, __ATOMIC_SEQ_CST);   // costs RC_FF_IDLE_MS: say so now and then
    if (busy > 0 && (capped++ & 255) == 0)
        rc_log("ff: main waited %u ms for %d busy thread(s) (%u times so; RC_FF_IDLE_MS)", (unsigned)(cap_us / 1000), busy,
               capped);
    rc_time_skip((uint64_t)ms * 1000);
}
int rc_is_main_thread(CPU *c) { return c && c->thread && c->thread->id == 0x80; }
void rc_vwait(uint32_t ms) {   // block until the guest clock has advanced by ms (fast-forward: virtual)
    uint64_t until = rc_now_us() + (uint64_t)ms * 1000;
    while (rc_now_us() < until) usleep(200);
}

uint32_t rc_texloaders = 4;   // emit.py IMM_HOOKS: texture loader threads (YO2_TEXLOADERS, 128 = original)
uint32_t rc_first_scene = 4;   // IMM_HOOKS (rt/debrand.cpp): the title, not the KONAMI logo
int rc_online_pressed;         // set by ONLINE (rc_online_scene); rt/session.cpp answers the login dialog
uint32_t rc_online_scene(void) { rc_online_pressed = 1; return 6; }   // ONLINE: the login, not the rules page

void rc_init(const char *exe) {
    pthread_key_create(&cur_key, NULL);
    cur_ready = 1;
    t0_us = mono_us();
    if (getenv("RC_TIMESCALE") && atoi(getenv("RC_TIMESCALE")) > 1) rc_timescale = (uint32_t)atoi(getenv("RC_TIMESCALE"));
    rc_fastforward = getenv("RC_FASTFORWARD") && atoi(getenv("RC_FASTFORWARD")) > 0;
    {
        extern uint32_t rc_heap_hi;
        if (getenv("RC_HEAP_MB")) rc_heap_hi = RC_HEAP_LO + ((uint32_t)atoi(getenv("RC_HEAP_MB")) << 20);
#ifdef __EMSCRIPTEN__
        // the guest ends where Emscripten's own data starts (-sGLOBAL_BASE): 1 GB, or lower in the small iOS build
        extern char __global_base;
        if ((uint32_t)(uintptr_t)&__global_base < rc_heap_hi) rc_heap_hi = (uint32_t)(uintptr_t)&__global_base;
#endif
    }
    if (getenv("YO2_TEXLOADERS")) {
        int n = atoi(getenv("YO2_TEXLOADERS"));
        rc_texloaders = n < 1 ? 4 : n > 0x80 ? 0x80 : (uint32_t)n;
    }
    mem_init();
    load_image(exe);
    rc_commit(RC_PEB, 0x1000);
    rc_verbose = getenv("RC_VERBOSE") != NULL;
}
