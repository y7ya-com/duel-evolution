// Guest memory allocation: VirtualAlloc pages (64 KB granularity) and the Win32 heaps on top of them.
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>

#include "rt.h"

#define GRAN 0x10000u
#define NG ((RC_HEAP_HI - RC_HEAP_LO) / GRAN)
static uint32_t run_len[NG];   // at a run's first granule: its length in granules (0 = free / not a start)
static uint8_t used[NG];
void rc_mem_report(const char *when);
static uint32_t used_granules, peak_granules, top_granule;   // top: the highest granule ever handed out
static uint64_t carved, small_live, large_live;   // rc_mem_report: bytes carved for small classes, requested live
uint32_t rc_heap_hi = RC_HEAP_HI;              // RC_HEAP_MB caps the range (native runs can mimic the wasm 1 GB guest)
static pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;
#define QUAR (64u << 20 >> 16)    // granules of freed runs held back (rc_vfree)
#define QUAR_RUNS (QUAR + 1)      // a run is >= 1 granule, so at most QUAR + 1 runs are queued
static uint32_t quar[QUAR_RUNS], quar_n[QUAR_RUNS], quar_head, quar_tail, quar_granules;

// Lowest-address first fit, as Windows' VirtualAlloc searches. Not next-fit: wasm memory never goes back to the system,
// so a rover sweeping the whole range left every granule it passed resident (phones kill a tab that big).
// ponytail: a linear scan of the granule map; a free-run index if allocation ever shows up in profiles
uint32_t rc_valloc(uint32_t size) {
    uint32_t n = (size + GRAN - 1) / GRAN;
    if (!n) n = 1;
    pthread_mutex_lock(&mu);
    for (int pass = 0; pass < 2; pass++) {   // the second pass after releasing the whole quarantine (rc_vfree)
        if (pass) {
            if (!quar_granules) break;
            for (; quar_head != quar_tail; quar_head = (quar_head + 1) % QUAR_RUNS) memset(used + quar[quar_head], 0, quar_n[quar_head]);
            quar_granules = 0;
        }
        uint32_t i = 0, run = 0, ng = (rc_heap_hi - RC_HEAP_LO) / GRAN;
        for (; i < ng; i++) {
            run = used[i] ? 0 : run + 1;
            if (run == n) {
                uint32_t s = i + 1 - n;
                memset(used + s, 1, n);
                run_len[s] = n;
                used_granules += n;
                if (used_granules > peak_granules) peak_granules = used_granules;
                if (i + 1 > top_granule) top_granule = i + 1;
                pthread_mutex_unlock(&mu);
                uint32_t a = RC_HEAP_LO + s * GRAN;
                rc_commit(a, n * GRAN);
                return a;
            }
        }
    }
    pthread_mutex_unlock(&mu);
    rc_log("rc_valloc: out of guest memory (%u bytes)", size);
    rc_mem_report("at exhaustion");
    // a null here reads guest address 0, which on wasm is ordinary memory: the game would corrupt itself silently (a
    // black screen) instead of failing. Stop with the reason, so the crash reporter shows it.
    rc_trap(rc_cur(), 0, "out of guest memory");
}

// Headless scripting (RC_INPUT walkto): the first word-aligned dword == v in the allocated granules that ok() accepts.
// Freed heap blocks have their first word overwritten by the free list, so a vtable match is a live object.
uint32_t rc_heap_find(uint32_t v, int (*ok)(uint32_t)) {
    for (uint32_t g = 0; g < NG; g++)
        if (used[g])
            for (uint32_t a = RC_HEAP_LO + g * GRAN, e = a + GRAN; a < e; a += 4)
                if (RD32m(a) == v && (!ok || ok(a))) return a;
    return 0;
}

// Can the host read guest address a (and the 0x800 after it)? The image, or an allocated granule.
int rc_readable(uint32_t a) {
    if (a >= 0x400000 && a < 0x135a000 - 0x800) return 1;   // the image (SizeOfImage)
    if (a < RC_HEAP_LO || a >= RC_HEAP_HI - 0x800) return 0;
    uint32_t g = (a - RC_HEAP_LO) / GRAN, h = (a + 0x800 - RC_HEAP_LO) / GRAN;
    return used[g] && used[h];
}

uint32_t rc_vsize(uint32_t a) {
    if (a < RC_HEAP_LO || a >= RC_HEAP_HI) return 0;
    return run_len[(a - RC_HEAP_LO) / GRAN] * GRAN;
}

void rc_vfree(uint32_t a) {
    if (a < RC_HEAP_LO || a >= RC_HEAP_HI || (a - RC_HEAP_LO) % GRAN) return;
    pthread_mutex_lock(&mu);
    uint32_t s = (a - RC_HEAP_LO) / GRAN, n = run_len[s];
    // zero before the granules are free again: zeroing after the unlock wiped whatever another thread had
    // just allocated there (heap chunks: list nodes with header/next cleared)
    memset(rc_mem + a, 0, (size_t)n * GRAN);   // VirtualAlloc hands out zeroed pages
    run_len[s] = 0;
    // Quarantine: the run stays taken (and zero) until QUAR granules of later frees are queued behind it. The game
    // touches memory just after freeing it (an exited thread's stack/TEB, ...); next-fit never reused a run that
    // soon, and handing it straight out again hung a desktop soak in 1 of 2 runs (phase3, after the red door).
    // ponytail: a FIFO of runs; QUAR (64 MB) bounds the extra residency
    if (n) {
        quar[quar_tail] = s, quar_n[quar_tail] = n, quar_tail = (quar_tail + 1) % QUAR_RUNS;
        quar_granules += n;
        while (quar_granules > QUAR) {   // release the oldest
            memset(used + quar[quar_head], 0, quar_n[quar_head]);
            quar_granules -= quar_n[quar_head];
            quar_head = (quar_head + 1) % QUAR_RUNS;
        }
    }
    used_granules -= n;
    pthread_mutex_unlock(&mu);
}

// ---- heap: power-of-two size classes (16 B .. 32 KB) carved from 64 KB chunks; bigger blocks get their own pages.
// Block header (8 bytes before the pointer): requested size, class (0xff = page block).
// ponytail: one global lock and no coalescing; per-heap arenas if the game's allocation pattern needs it
#define NCLASS 12
// RC_WATCH=<hex guest block>: log every alloc/free/realloc of that block with the guest call stack
void backtrace_guest(CPU *c);
static uint32_t w = 1, w_live;
void rc_watch_check(void) {   // called often (heap ops, indirect calls): report when the watched header is wiped
    if (!w_live || RD32m(w - 4) == 1) return;
    w_live = 0;
    rc_log("RC_WATCH header of %08x changed: %08x %08x, next %08x", w, RD32m(w - 8), RD32m(w - 4), RD32m(w));
    if (rc_cur()) backtrace_guest(rc_cur());
}
static void watch(const char *what, uint32_t p, uint32_t n) {
    if (w == 1) w = getenv("RC_WATCH") ? (uint32_t)strtoul(getenv("RC_WATCH"), NULL, 16) : 0;
    rc_watch_check();
    if (!w || p != w) return;
    w_live = !strcmp(what, "alloc");
    rc_log("RC_WATCH %s %08x (%u)", what, p, n);
    if (rc_cur()) backtrace_guest(rc_cur());
}
static uint32_t freelist[NCLASS];
static uint32_t carve_at, carve_end;

static int class_of(uint32_t n) {
    int k = 0;
    while ((16u << k) < n + 8) k++;
    return k;
}

uint32_t rc_halloc(uint32_t n, int zero) {
    int k = class_of(n);
    uint32_t p;
    if (k >= NCLASS) {
        uint32_t a = rc_valloc(n + 16);
        if (!a) return 0;
        WR32m(a + 8, n);
        WR32m(a + 12, 0xff);
        __atomic_add_fetch(&large_live, n, __ATOMIC_RELAXED);
        return a + 16;   // fresh pages are zero
    }
    uint32_t bs = 16u << k;
    pthread_mutex_lock(&mu);
    if (freelist[k]) {
        p = freelist[k];
        freelist[k] = RD32m(p);
    } else {
        if (carve_at + bs > carve_end) {
            pthread_mutex_unlock(&mu);
            uint32_t a = rc_valloc(GRAN * 4);
            pthread_mutex_lock(&mu);
            carve_at = a;
            carve_end = a + GRAN * 4;
            carved += GRAN * 4;
        }
        p = carve_at + 8;
        carve_at += bs;
    }
    pthread_mutex_unlock(&mu);
    WR32m(p - 8, n);
    WR32m(p - 4, (uint32_t)k);
    __atomic_add_fetch(&small_live, n, __ATOMIC_RELAXED);
    if (zero) memset(rc_mem + p, 0, n);
    watch("alloc", p, n);
    return p;
}

uint32_t rc_hsize(uint32_t p) { return p ? RD32m(p - 8) : 0; }

// The runtime's own guest objects (COM shells and vtables, lock mirrors): pages of their own, never freed, never part of
// the game's heap. On Windows these live in d3d8.dll's / dsound.dll's heap, so a stale pointer in the game (a latent
// use-after-free) only ever hits the game's own blocks; sharing the small-block free lists here let one turn a texture
// manager's COM shell into a free-list link (the web build's "indirect call to unknown" trap). Same 8-byte header as
// rc_halloc (size, class 0xfe), so rc_hsize works; rc_hfree refuses them (bad block).
uint32_t rc_palloc(uint32_t n) {
    static pthread_mutex_t pmu = PTHREAD_MUTEX_INITIALIZER;
    static uint32_t at, end;
    uint32_t need = (n + 8 + 15) & ~15u, p;
    if (need > GRAN) {   // a big mirror: pages of its own
        p = rc_valloc(need) + 8;
    } else {
        pthread_mutex_lock(&pmu);
        if (at + need > end) at = rc_valloc(GRAN * 16), end = at + GRAN * 16;
        p = at + 8;
        at += need;
        pthread_mutex_unlock(&pmu);
    }
    WR32m(p - 8, n);
    WR32m(p - 4, 0xfe);
    memset(rc_mem + p, 0, n);
    return p;
}

// A small block on a free list has FREED in its class word. Freeing it again would put it on the list twice and hand
// it to two owners: the second one's first word becomes the list link (a COM shell whose vtable turned into a free-list
// pointer). So a second free is refused and logged with the guest return addresses on the stack, which name the caller.
#define FREED 0x8000u
static void bad_free(uint32_t p, uint32_t k) {
    static int reported;
    if (reported++ >= 20) return;
    rc_log("rc_hfree: %s %08x (class word %x)", (k & FREED) && (k & ~FREED) < NCLASS ? "double free of" : "bad block", p, k);
    if (rc_cur()) backtrace_guest(rc_cur());
}

void rc_hfree(uint32_t p) {
    if (!p) return;
    watch("free", p, rc_hsize(p));
    uint32_t k = RD32m(p - 4);
    if (k == 0xff) {
        __atomic_sub_fetch(&large_live, RD32m(p - 8), __ATOMIC_RELAXED);
        rc_vfree(p - 16);
        return;
    }
    pthread_mutex_lock(&mu);
    k = RD32m(p - 4);   // checked and marked under the lock: two threads freeing one block must not both push it
    if (k >= NCLASS) {
        pthread_mutex_unlock(&mu);
        bad_free(p, k);
        return;
    }
    WR32m(p - 4, k | FREED);
    __atomic_sub_fetch(&small_live, RD32m(p - 8), __ATOMIC_RELAXED);
    WR32m(p, freelist[k]);
    freelist[k] = p;
    pthread_mutex_unlock(&mu);
}

int rc_hrealloc_fits(uint32_t p, uint32_t n) {   // can p grow/shrink to n without moving
    uint32_t k = p ? RD32m(p - 4) : 0xff;
    return k < NCLASS && n + 8 <= (16u << k);
}

uint32_t rc_hrealloc(uint32_t p, uint32_t n, int zero) {
    if (!p) return rc_halloc(n, zero);
    watch("realloc", p, n);
    uint32_t old = rc_hsize(p), k = RD32m(p - 4);
    if (k < NCLASS && n + 8 <= (16u << k)) {
        if (zero && n > old) memset(rc_mem + p + old, 0, n - old);
        WR32m(p - 8, n);
        return p;
    }
    uint32_t q = rc_halloc(n, zero);
    if (q) {
        memcpy(rc_mem + q, rc_mem + p, old < n ? old : n);
        rc_hfree(p);
    }
    return q;
}

void rc_mem_report(const char *when) {   // guest memory in use / high-water, in MB
    extern unsigned rc_stacks_made, rc_stacks_freed;
    rc_log("guest memory %s: %u MB in use, peak %u MB, top %u MB (of %u MB); thread stacks %u made, %u freed", when,
           used_granules * (GRAN >> 10) >> 10, peak_granules * (GRAN >> 10) >> 10, top_granule * (GRAN >> 10) >> 10,
           (rc_heap_hi - RC_HEAP_LO) >> 20,
           rc_stacks_made, rc_stacks_freed);
    rc_log("  heap: small blocks %u MB live in %u MB carved; large blocks %u MB live", (unsigned)(small_live >> 20),
           (unsigned)(carved >> 20), (unsigned)(large_live >> 20));
    if (getenv("RC_MEM_SIZES")) {   // the live large blocks by size: what is piling up
        enum { NB = 24 };
        uint32_t sz[NB] = {0}, cnt[NB] = {0};
        int nb = 0;
        for (uint32_t s = 0; s < NG; s++) {
            if (!run_len[s]) continue;
            uint32_t a = RC_HEAP_LO + s * GRAN;
            if (RD32m(a + 12) != 0xff) continue;
            uint32_t n = RD32m(a + 8);
            int i = 0;
            while (i < nb && sz[i] != n) i++;
            if (i == nb && nb < NB) sz[nb++] = n;
            if (i < NB) cnt[i]++;
        }
        for (int i = 0; i < nb; i++)
            if (cnt[i] >= 4) rc_log("    %u x %u bytes = %u MB", cnt[i], sz[i], (unsigned)((uint64_t)cnt[i] * sz[i] >> 20));
    }
}
