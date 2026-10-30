// The guest's clocks. Every clock the guest sees comes from here:
//   rc_now_us   the tick clock (GetTickCount, timeGetTime, QueryPerformanceCounter; Sleep and timeouts wait on it). It
//               runs at a rate in permille: RC_TIMESCALE (test runs: N x 1000 for the whole run) times the duel speed
//               (ovr/duelspeed.c, in the duel scenes only). A rate change rebases it, so it never jumps.
//   rc_wall_us  the time of day (time(), GetSystemTime*): RC_TIMESCALE only, never the duel speed, so the duel clocks
//               the game shows (time() based, the server's) keep counting in real seconds.
// RC_FASTFORWARD's virtual time (rc_time_skip) moves both.
#include <pthread.h>
#include <stdint.h>
#include <time.h>

uint32_t rc_timescale = 1;
static pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;
static uint64_t t0_us, skip_us, base_mono, base_tick;
static uint32_t rate = 1000;   // the tick clock's, in permille

uint64_t rc_mono_us(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000000 + (uint64_t)ts.tv_nsec / 1000;
}
void rc_clock_init(uint32_t timescale) {
    pthread_mutex_lock(&mu);
    rc_timescale = timescale > 1 ? timescale : 1;
    t0_us = base_mono = base_tick = rc_mono_us();
    rate = rc_timescale * 1000;
    pthread_mutex_unlock(&mu);
}
uint64_t rc_now_us(void) {
    pthread_mutex_lock(&mu);
    uint64_t t = base_tick + (rc_mono_us() - base_mono) * rate / 1000;
    pthread_mutex_unlock(&mu);
    return t + __atomic_load_n(&skip_us, __ATOMIC_RELAXED);
}
uint64_t rc_wall_us(void) { return t0_us + (rc_mono_us() - t0_us) * rc_timescale + __atomic_load_n(&skip_us, __ATOMIC_RELAXED); }
// the tick clock's rate, x1000 on top of RC_TIMESCALE (1000 = real time; ovr/duelspeed.c)
void rc_set_tick_rate(uint32_t permille) {
    pthread_mutex_lock(&mu);
    uint64_t m = rc_mono_us();
    base_tick += (m - base_mono) * rate / 1000, base_mono = m;
    rate = rc_timescale * (permille ? permille : 1000);
    pthread_mutex_unlock(&mu);
}
uint32_t rc_tick_rate(void) { return __atomic_load_n(&rate, __ATOMIC_RELAXED); }
uint64_t rc_real_us(uint32_t ms) { return (uint64_t)ms * 1000000 / rc_tick_rate(); }   // a guest wait, in host time
void rc_time_skip(uint64_t us) { __atomic_add_fetch(&skip_us, us, __ATOMIC_RELAXED); }
