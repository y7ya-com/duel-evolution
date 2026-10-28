// Runtime contract for recompiled yo2.exe code (generated C includes this). See recomp/README.md.
// Konami-derived build: private repo only.
#pragma once
#include <math.h>
#include <stdint.h>
#include <string.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct CPU {
    uint32_t eax, ecx, edx, ebx, esp, ebp, esi, edi;
    uint32_t fs_base, df;
    uint8_t cf, zf, sf, of, pf;   // eager flags (most conditions are fused and never touch these)
    uint32_t ret_to;              // the address the last `ret` popped: call sites compare it to unwind non-local returns
    double st[8];          // x87 as doubles: 53-bit mantissa (the original runs at whatever PC D3D left: see README)
    uint32_t ftop;
    uint16_t fcw, fsw;
    struct RcThread *thread;
} CPU;

typedef void (*RcFn)(CPU *);

extern uint8_t *rc_mem;    // guest address a lives at rc_mem + a (4 GB reserved)

#define RC_WEAK __attribute__((weak))
#define RC_FUNC(name) RC_WEAK void name(CPU *restrict c)
#define RC_LOCALS uint8_t *const m = rc_mem; (void)m

static inline uint16_t rc_rd16(const uint8_t *p) { uint16_t v; memcpy(&v, p, 2); return v; }
static inline uint32_t rc_rd32(const uint8_t *p) { uint32_t v; memcpy(&v, p, 4); return v; }
static inline uint64_t rc_rd64(const uint8_t *p) { uint64_t v; memcpy(&v, p, 8); return v; }
static inline float rc_rdf32(const uint8_t *p) { float v; memcpy(&v, p, 4); return v; }
static inline double rc_rdf64(const uint8_t *p) { double v; memcpy(&v, p, 8); return v; }
static inline void rc_wr16(uint8_t *p, uint16_t v) { memcpy(p, &v, 2); }
static inline void rc_wr32(uint8_t *p, uint32_t v) { memcpy(p, &v, 4); }
static inline void rc_wr64(uint8_t *p, uint64_t v) { memcpy(p, &v, 8); }
static inline void rc_wrf32(uint8_t *p, float v) { memcpy(p, &v, 4); }
static inline void rc_wrf64(uint8_t *p, double v) { memcpy(p, &v, 8); }

#define RD8(a) (m[(uint32_t)(a)])
#define RD16(a) rc_rd16(m + (uint32_t)(a))
#define RD32(a) rc_rd32(m + (uint32_t)(a))
#define RD64(a) rc_rd64(m + (uint32_t)(a))
#define RDF32(a) ((double)rc_rdf32(m + (uint32_t)(a)))
#define RDF64(a) rc_rdf64(m + (uint32_t)(a))
#define WR8(a, v) (m[(uint32_t)(a)] = (uint8_t)(v))
#define WR16(a, v) rc_wr16(m + (uint32_t)(a), (uint16_t)(v))
#define WR32(a, v) rc_wr32(m + (uint32_t)(a), (uint32_t)(v))
#define WR64(a, v) rc_wr64(m + (uint32_t)(a), (uint64_t)(v))
#define WRF32(a, v) rc_wrf32(m + (uint32_t)(a), (float)(v))
#define WRF64(a, v) rc_wrf64(m + (uint32_t)(a), (double)(v))

#define PUSH(v) do { uint32_t v_ = (v); c->esp -= 4; WR32(c->esp, v_); } while (0)
#define POP() rc_pop(c)
static inline uint32_t rc_pop(CPU *c) { uint32_t v = rc_rd32(rc_mem + c->esp); c->esp += 4; return v; }

#define ST(i) c->st[(c->ftop + (i)) & 7]
#define FPUSH(v) do { double v_ = (v); c->ftop = (c->ftop - 1) & 7; ST(0) = v_; } while (0)
#define FPOP() (c->ftop = (c->ftop + 1) & 7)

static inline uint8_t rc_parity(uint32_t x) { return (uint8_t)!__builtin_parity(x & 0xff); }
static inline uint32_t rc_eflags(CPU *c, int cf, int zf, int sf, int of, int pf) {
    return 2u | (cf & 1) | (pf & 1) << 2 | (zf & 1) << 6 | (sf & 1) << 7 | (c->df & 1) << 10 | (of & 1) << 11;
}
static inline uint32_t rc_rcl32(uint32_t a, uint32_t n, uint8_t *cf) {
    for (; n; n--) { uint8_t o = a >> 31; a = a << 1 | *cf; *cf = o; }
    return a;
}
static inline uint32_t rc_rcr32(uint32_t a, uint32_t n, uint8_t *cf) {
    for (; n; n--) { uint8_t o = a & 1; a = a >> 1 | (uint32_t)*cf << 31; *cf = o; }
    return a;
}

// --- x87 helpers
static inline uint16_t rc_fsw(CPU *c) { return (uint16_t)((c->fsw & ~0x3800u) | (c->ftop & 7) << 11); }
static inline void rc_fcom(CPU *c, double x, double y) {
    c->fsw &= ~0x4500u;
    if (x != x || y != y) c->fsw |= 0x4500u;
    else if (x < y) c->fsw |= 0x100u;
    else if (x == y) c->fsw |= 0x4000u;
}
static inline double rc_fround(CPU *c, double x) {
    switch ((c->fcw >> 10) & 3) {
    case 0: return nearbyint(x);   // host default rounding = nearest-even
    case 1: return floor(x);
    case 2: return ceil(x);
    default: return trunc(x);
    }
}
static inline int32_t rc_fist32(CPU *c, double x) {
    double r = rc_fround(c, x);
    return (r >= -2147483648.0 && r < 2147483648.0) ? (int32_t)r : INT32_MIN;
}
static inline int16_t rc_fist16(CPU *c, double x) {
    double r = rc_fround(c, x);
    return (r >= -32768.0 && r < 32768.0) ? (int16_t)r : INT16_MIN;
}
static inline int64_t rc_fist64(CPU *c, double x) {
    double r = rc_fround(c, x);
    return (r >= -9223372036854775808.0 && r < 9223372036854775808.0) ? (int64_t)r : INT64_MIN;
}
void rc_fxam(CPU *c);
void rc_finit(CPU *c);
double rc_ld80(const uint8_t *p);
void rc_st80(uint8_t *p, double v);
void rc_frstor(CPU *c, uint32_t a);
void rc_fsave(CPU *c, uint32_t a);
void rc_fldenv(CPU *c, uint32_t a);
void rc_fstenv(CPU *c, uint32_t a);

// --- string instructions (rep: 0 none, 1 rep/repe, 2 repne)
#define RC_STEP(sz) (c->df ? -(int32_t)(sz) : (int32_t)(sz))
#define RC_STR(sz, T, RD, WR)                                                                         \
    static inline void rc_movs##sz(CPU *c, int rep) {                                                 \
        uint8_t *m = rc_mem;                                                                          \
        if (!rep) { WR(c->edi, RD(c->esi)); c->esi += RC_STEP(sz); c->edi += RC_STEP(sz); return; }    \
        if (!c->df && (c->edi - c->esi >= c->ecx * sz)) {  /* no forward overlap: bulk copy */        \
            memmove(m + c->edi, m + c->esi, (size_t)c->ecx * sz);                                     \
            c->esi += c->ecx * sz; c->edi += c->ecx * sz; c->ecx = 0; return;                         \
        }                                                                                             \
        for (; c->ecx; c->ecx--) { WR(c->edi, RD(c->esi)); c->esi += RC_STEP(sz); c->edi += RC_STEP(sz); } \
    }                                                                                                 \
    static inline void rc_stos##sz(CPU *c, int rep) {                                                 \
        uint8_t *m = rc_mem;                                                                          \
        if (!rep) { WR(c->edi, (T)c->eax); c->edi += RC_STEP(sz); return; }                           \
        if (sz == 1 && !c->df) { memset(m + c->edi, (uint8_t)c->eax, c->ecx); c->edi += c->ecx; c->ecx = 0; return; } \
        for (; c->ecx; c->ecx--) { WR(c->edi, (T)c->eax); c->edi += RC_STEP(sz); }                    \
    }                                                                                                 \
    static inline void rc_lods##sz(CPU *c, int rep) {                                                 \
        uint8_t *m = rc_mem;                                                                          \
        do {                                                                                          \
            if (rep && !c->ecx) return;                                                               \
            T v = (T)RD(c->esi); c->esi += RC_STEP(sz);                                               \
            c->eax = sz == 4 ? (uint32_t)v : (c->eax & ~(uint32_t)(T)-1) | v;                         \
        } while (rep && --c->ecx);                                                                    \
    }                                                                                                 \
    static inline int rc_scas##sz(CPU *c, int rep, uint32_t *a, uint32_t *b) {                        \
        uint8_t *m = rc_mem; int did = 0;                                                             \
        for (;;) {                                                                                    \
            if (rep && !c->ecx) return did;                                                           \
            *a = (T)c->eax; *b = (T)RD(c->edi); c->edi += RC_STEP(sz); did = 1;                       \
            if (!rep) return 1;                                                                       \
            c->ecx--;                                                                                 \
            if ((rep == 1) != (*a == *b)) return 1;                                                   \
        }                                                                                             \
    }                                                                                                 \
    static inline int rc_cmps##sz(CPU *c, int rep, uint32_t *a, uint32_t *b) {                        \
        uint8_t *m = rc_mem; int did = 0;                                                             \
        for (;;) {                                                                                    \
            if (rep && !c->ecx) return did;                                                           \
            *a = (T)RD(c->esi); *b = (T)RD(c->edi); c->esi += RC_STEP(sz); c->edi += RC_STEP(sz); did = 1; \
            if (!rep) return 1;                                                                       \
            c->ecx--;                                                                                 \
            if ((rep == 1) != (*a == *b)) return 1;                                                   \
        }                                                                                             \
    }
RC_STR(1, uint8_t, RD8, WR8)
RC_STR(2, uint16_t, RD16, WR16)
RC_STR(4, uint32_t, RD32, WR32)

// --- runtime services (rt/*.c)
void rc_icall(CPU *c, uint32_t target);        // indirect call: return address already pushed
void rc_ijmp(CPU *c, uint32_t target);         // indirect jump to a function entry (tail call)
_Noreturn void rc_trap(CPU *c, uint32_t addr, const char *what);
void rc_cpuid(CPU *c);
void rc_rdtsc(CPU *c);
void rc_missing_import(CPU *c, const char *name, int nargs);   // nargs -1: unknown

#ifdef __cplusplus
}
#endif
