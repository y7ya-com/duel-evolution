// rt/clock.c: a tick-rate change (the duel speed) never makes the tick clock jump, the tick clock then runs at that
// rate while the time of day stays real, and guest waits shrink with it. `make clock_test && build/clock_test`
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <unistd.h>

uint64_t rc_now_us(void), rc_wall_us(void), rc_real_us(uint32_t ms);
void rc_clock_init(uint32_t timescale), rc_set_tick_rate(uint32_t permille);

static int near(int64_t got, int64_t want, int64_t tol) { return got > want - tol && got < want + tol; }

int main(void) {
    rc_clock_init(1);
    assert(rc_real_us(33) == 33000);
    uint64_t t0 = rc_now_us(), w0 = rc_wall_us();
    rc_set_tick_rate(2000);   // 2x
    assert(near((int64_t)(rc_now_us() - t0), 0, 2000));   // no jump
    assert(rc_real_us(33) == 16500);
    usleep(100000);
    int64_t dt = (int64_t)(rc_now_us() - t0), dw = (int64_t)(rc_wall_us() - w0);
    assert(near(dt, 2 * dw, 30000));   // ticks ran twice as fast as the wall clock
    assert(near(dw, 100000, 60000));
    uint64_t t1 = rc_now_us();
    rc_set_tick_rate(1500);
    assert(near((int64_t)(rc_now_us() - t1), 0, 2000));
    assert(rc_real_us(33) == 22000);
    rc_set_tick_rate(1000);
    assert(rc_real_us(33) == 33000);
    rc_clock_init(4);   // RC_TIMESCALE=4, then a duel at 1.5x: 6x
    rc_set_tick_rate(1500);
    assert(rc_real_us(60) == 10000);
    puts("clock_test ok");
    return 0;
}
