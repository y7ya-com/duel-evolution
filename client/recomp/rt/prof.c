// RC_PROF=<ms> (profiling, macOS): a sampler thread stops the game's main thread every millisecond and records its
// host call stack (frame-pointer walk); a frame slower than <ms> logs the functions found on most of its samples.
// The host stack is the guest call stack (f_XXXXXXXX frames), so this names the guest functions behind a hitch.
#include "rt.h"
#ifdef __APPLE__
#include <dlfcn.h>
#include <mach/mach.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <unistd.h>

#define RING 16384
#define DEPTH 96
static struct Sample { double t; int n; void *pc[DEPTH]; } ring[RING];
static volatile unsigned head;
static mach_port_t target;
static double thresh;

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
        s->t = now_ms();
        head++;
    }
    return NULL;
}

void rc_prof_start(void) {   // from the game's main thread
    const char *e = getenv("RC_PROF");
    if (!e || target) return;
    thresh = atof(e);
    target = mach_thread_self();
    pthread_t t;
    pthread_create(&t, NULL, sampler, NULL);
}

static const char *sym(void *pc) {   // dladdr is slow (a linear symbol search): cache it per return address
    static struct { void *pc; const char *name; } cache[1 << 16];
    unsigned h = (unsigned)((uintptr_t)pc >> 2) * 2654435761u >> 16;
    while (cache[h].pc && cache[h].pc != pc) h = (h + 1) & 0xffff;
    if (!cache[h].pc) {
        Dl_info di;
        cache[h].name = dladdr((char *)pc - 1, &di) && di.dli_sname ? di.dli_sname : "?";
        cache[h].pc = pc;
    }
    return cache[h].name;
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
void rc_prof_start(void) {}
void rc_prof_frame(int frame, double start, double end) { (void)frame, (void)start, (void)end; }
#endif
