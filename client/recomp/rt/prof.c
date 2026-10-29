// RC_PROF=<ms> (profiling, macOS): a sampler thread stops the game's main thread every millisecond and records its
// host call stack (frame-pointer walk); a frame slower than <ms> logs the functions found on most of its samples.
// The host stack is the guest call stack (f_XXXXXXXX frames), so this names the guest functions behind a hitch.
// RC_PROF_DUMP=<file> (with RC_PROF): every sample is also tallied per scene (ovr/scene.c; 0x100|to while switching)
// and written at RC_FRAMES: per function its leaf samples, its innermost-f_ samples and its inclusive samples; samples
// parked in a kernel wait count as idle. tools/profsum.py ranks them.
#include "rt.h"
#ifdef __APPLE__
#include <dlfcn.h>
#include <mach/mach.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#define RING 16384
#define DEPTH 96
static struct Sample { double t; int n; void *pc[DEPTH]; } ring[RING];
static volatile unsigned head;
static mach_port_t target;
static double thresh;

static const char *sym(void *pc);
__attribute__((weak)) int rc_scene_now(void) { return -1; }

// the RC_PROF_DUMP tally (sampler thread only)
static FILE *dump;
static struct Agg { const char *name; int scene, self, gself, incl; } agg[1 << 16];
static struct Agg *tally(const char *name, int scene) {
    unsigned h = ((unsigned)((uintptr_t)name >> 3) * 2654435761u ^ (unsigned)scene * 40503u) >> 16;
    while (agg[h].name && (agg[h].name != name || agg[h].scene != scene)) h = (h + 1) & 0xffff;
    if (!agg[h].name) agg[h].name = name, agg[h].scene = scene;
    return &agg[h];
}
static int idle_leaf(const char *n) {
    return !strncmp(n, "__psynch", 8) || !strncmp(n, "__semwait", 9) || !strncmp(n, "mach_msg", 8) ||
           !strncmp(n, "__ulock", 7) || !strncmp(n, "__nanosleep", 11) || !strncmp(n, "__select", 8);
}
static void tally_sample(const struct Sample *s) {
    static const char *TOTAL = "(total)", *IDLE = "(idle)";
    int scene = rc_scene_now();
    const char *seen[DEPTH];
    int ns = 0, guest = 0;
    if (!s->n) return;
    const char *leaf = sym(s->pc[0]);
    if (idle_leaf(leaf)) { tally(IDLE, scene)->self++; return; }
    tally(TOTAL, scene)->self++;
    for (int k = 0; k < s->n; k++) {
        const char *name = sym(s->pc[k]);
        int dup = 0;
        for (int j = 0; j < ns; j++) dup |= seen[j] == name;
        if (dup) continue;
        seen[ns++] = name;
        struct Agg *a = tally(name, scene);
        a->incl++;
        if (!k) a->self++;
        if (!guest && name[0] == 'f' && name[1] == '_') {
            guest = 1, a->gself++;
            // RC_PROF_UNDER=<f_name>: the host frames below that innermost guest function, as scene 0xfff
            static const char *under;
            if (!under) under = getenv("RC_PROF_UNDER") ? getenv("RC_PROF_UNDER") : "";
            if (!strcmp(name, under))
                for (int j = 0; j < k; j++) {
                    struct Agg *u = tally(sym(s->pc[j]), 0xfff);
                    u->incl++;
                    if (!j) u->self++;
                }
        }
    }
}

static double now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1e3 + ts.tv_nsec / 1e6;
}

static void *sampler(void *arg) {
    (void)arg;
    for (;;) {
        usleep(1000);
        struct Sample *s = &ring[head % RING];
        arm_thread_state64_t st;
        mach_msg_type_number_t cnt = ARM_THREAD_STATE64_COUNT;
        if (thread_suspend(target) != KERN_SUCCESS) continue;
        if (thread_get_state(target, ARM_THREAD_STATE64, (thread_state_t)&st, &cnt) == KERN_SUCCESS) {
            int n = 0;
            s->pc[n++] = (void *)arm_thread_state64_get_pc(st);
            s->pc[n++] = (void *)arm_thread_state64_get_lr(st);
            uintptr_t *fp = (uintptr_t *)arm_thread_state64_get_fp(st);
            while (fp && n < DEPTH && ((uintptr_t)fp & 7) == 0) {
                uintptr_t ret = fp[1];
                if (!ret) break;
                s->pc[n++] = (void *)ret;
                uintptr_t *next = (uintptr_t *)fp[0];
                if (next <= fp) break;   // the stack grows down: callers sit higher
                fp = next;
            }
            s->n = n;
        } else
            s->n = 0;
        thread_resume(target);
        if (dump) tally_sample(s);
        s->t = now_ms();
        head++;
    }
    return NULL;
}

void rc_prof_start(void) {   // from the game's main thread
    const char *e = getenv("RC_PROF");
    if (!e || target) return;
    thresh = atof(e);
    if (getenv("RC_PROF_DUMP")) dump = fopen(getenv("RC_PROF_DUMP"), "w");
    target = mach_thread_self();
    pthread_t t;
    pthread_create(&t, NULL, sampler, NULL);
}

struct SymCache { void *pc; const char *name; };
static const char *sym_in(struct SymCache *cache, void *pc) {   // dladdr is slow (a linear symbol search): cache it per address
    unsigned h = (unsigned)((uintptr_t)pc >> 2) * 2654435761u >> 16;
    while (cache[h].pc && cache[h].pc != pc) h = (h + 1) & 0xffff;
    if (!cache[h].pc) {
        Dl_info di;
        cache[h].name = (uintptr_t)pc > 1 && dladdr((char *)pc - 1, &di) && di.dli_sname ? di.dli_sname : "?";
        cache[h].pc = pc;
    }
    return cache[h].name;
}
// one cache per thread that symbolizes: the main thread (rc_prof_frame) and the sampler (the dump's tally)
static const char *sym(void *pc) {
    static struct SymCache main_cache[1 << 16], sampler_cache[1 << 16];
    return sym_in(pthread_mach_thread_np(pthread_self()) == target ? main_cache : sampler_cache, pc);
}

void rc_prof_end(void) {   // RC_FRAMES reached: write the tally (the sampler is stopped by suspending it first)
    if (!dump) return;
    FILE *f = dump;
    dump = NULL;
    usleep(5000);   // let a tally in progress finish
    for (int i = 0; i < 1 << 16; i++)
        if (agg[i].name)
            fprintf(f, "%x\t%d\t%d\t%d\t%s\n", agg[i].scene, agg[i].self, agg[i].gself, agg[i].incl, agg[i].name);
    fclose(f);
}

struct Hit { const char *name; int n; };
static int by_n(const void *a, const void *b) { return ((const struct Hit *)b)->n - ((const struct Hit *)a)->n; }

void rc_prof_frame(int frame, double start, double end) {
    if (!target || end - start < thresh) return;
    static struct Hit hits[4096];
    int nh = 0, total = 0;
    unsigned h = head;
    for (unsigned i = h > RING ? h - RING : 0; i < h; i++) {
        struct Sample *s = &ring[i % RING];
        if (s->t < start || s->t > end || !s->n) continue;
        total++;
        const char *seen[DEPTH];
        int ns = 0;
        for (int k = 0; k < s->n; k++) {
            const char *name = sym(s->pc[k]);
            int dup = 0;
            for (int j = 0; j < ns; j++) dup |= seen[j] == name;   // dladdr hands back the same pointer per symbol
            if (dup) continue;
            seen[ns++] = name;
            int j = 0;
            while (j < nh && hits[j].name != name) j++;
            if (j == nh && nh < 4096) hits[nh++] = (struct Hit){name, 0};
            if (j < nh) hits[j].n++;
        }
    }
    if (!total) return;
    qsort(hits, nh, sizeof hits[0], by_n);
    char line[4096];
    int len = snprintf(line, sizeof line, "prof frame %d: %.0f ms, %d samples:", frame, end - start, total);
    for (int j = 0; j < nh && len < (int)sizeof line - 64; j++)
        if (hits[j].n * 20 >= total && hits[j].name[0] != '?')   // >= 5% of the frame
            len += snprintf(line + len, sizeof line - len, " %s %d%%", hits[j].name, hits[j].n * 100 / total);
    rc_log("%s", line);
}
#else
void rc_prof_end(void) {}
void rc_prof_start(void) {}
void rc_prof_frame(int frame, double start, double end) { (void)frame, (void)start, (void)end; }
#endif
