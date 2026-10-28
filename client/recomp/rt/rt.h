// Runtime internals shared by rt/*.c (not seen by generated code beyond rc.h).
#pragma once
#include "rc.h"
#include "rc_table.h"

#define RC_IMPORT_MAGIC 0xfffe0000u   // IAT slot i holds RC_IMPORT_MAGIC + 4*i
#define RC_HOST_MAGIC 0xfffc0000u     // host functions exposed as guest code pointers
#define RC_HOST_MAX 8192
#define RC_RETURN_MAGIC 0xfffbfff0u   // return address pushed by host->guest calls
// Guest layout: everything the guest can touch lies below 1 GB, so the wasm32 build maps guest address == wasm
// address (rc_mem = 0, Emscripten's own data placed above with -sGLOBAL_BASE=0x40000000).
#define RC_PEB 0x01ff0000u
#define RC_HEAP_LO 0x08000000u        // guest heap / VirtualAlloc range
#ifdef __EMSCRIPTEN__
#define RC_HEAP_HI 0x40000000u
#else
#define RC_HEAP_HI 0xf0000000u
#endif

struct RcThread {
    uint32_t tls[64];
    uint32_t last_error;
    uint32_t id;
    uint32_t stack_lo, stack_size;   // its slot in the stack area, recycled by rc_free_thread_stack
    uint32_t handle;                 // its thread handle (CreateThread), signalled when it ends
};
void rc_free_thread_stack(CPU *c);
extern uint32_t rc_timescale;
uint64_t rc_now_us(void);           // the guest's monotonic clock (scaled by RC_TIMESCALE)
uint64_t rc_real_us(uint32_t ms);   // a guest wait of ms, in host microseconds
extern int rc_fastforward;          // RC_FASTFORWARD: virtual time, frames back to back, rendering only when needed
void rc_time_skip(uint64_t us);     // advance the guest clock (fast-forward)
void rc_thread_busy(int delta);     // fast-forward: a non-main guest thread starts/stops running (+1/-1)
void rc_ff_main_sleep(uint32_t ms); // fast-forward: the main thread's Sleep (wait for idle threads, jump the clock)
int rc_is_main_thread(CPU *c);
void rc_vwait(uint32_t ms);         // wait until the guest clock has advanced by ms
extern int rc_render_frame;         // fast-forward: 0 = this frame's draws and Present are skipped
void rc_trace_input(CPU *c, const char *api, uint32_t arg);
extern int rc_nospeed;                                      // RC_NOSPEED=1: ovr/ and the runtime's speed paths off (A/B)
void rc_ovr_init(void);                                     // ovr/: after loading, before the entry point (weak no-op)
void rc_deck_tap(const uint8_t *buf, int len);              // decktap.c: outgoing 0x6601/0x6603
void rc_prof_start(void);                                   // prof.c (RC_PROF)
void rc_prof_frame(int frame, double start_ms, double end_ms);

extern RcFn rc_host_fns[RC_HOST_MAX];
extern uint32_t rc_image_base, rc_image_size, rc_entry;
extern int rc_verbose;

void rc_log(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
void rc_init(const char *exe);
void rc_commit(uint32_t a, uint32_t n);
RcFn rc_lookup(uint32_t t);
uint32_t rc_host_fn(RcFn f);
uint32_t rc_call(CPU *c, uint32_t fn, int n, const uint32_t *args);
CPU *rc_cur(void);
void rc_set_cur(CPU *c);
CPU *rc_new_thread_cpu(uint32_t stack_size);

// guest memory access outside generated code
#define G(a) ((void *)(rc_mem + (uint32_t)(a)))
#define GS(a) ((a) ? (char *)(rc_mem + (uint32_t)(a)) : (char *)0)
static inline uint32_t RD32m(uint32_t a) { return rc_rd32(rc_mem + a); }
static inline void WR32m(uint32_t a, uint32_t v) { rc_wr32(rc_mem + a, v); }
static inline void PUSHm(CPU *c, uint32_t v) { c->esp -= 4; WR32m(c->esp, v); }

// import shims: arguments are on the guest stack above the return address
#define ARG(n) RD32m(c->esp + 4 + 4 * (n))
#define RET(nargs, v) do { c->eax = (uint32_t)(v); c->ret_to = RD32m(c->esp); c->esp += 4 + 4 * (nargs); return; } while (0)
#define RETC(v) do { c->eax = (uint32_t)(v); c->ret_to = RD32m(c->esp); c->esp += 4; return; } while (0)   /* cdecl */
#define IMP(dll, name) void imp_##dll##_##name(CPU *c)
