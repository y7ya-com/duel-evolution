// Duel speed: the player's choice of 1x (2008's pacing), 1.5x or 2x, in the duel scenes only (janken, duel, duel end,
// result). There the guest's tick clock (rt/clock.c) runs that much faster. The exe's fixed 30 fps step comes that much
// sooner, so every frame-counted animation, hold and fade plays faster, with the same logic frame for frame: the same
// moves and the same messages to the server, sooner. Only enough frames are drawn to keep the screen at the original
// 30 a second (every 2nd at 2x, 2 of 3 at 1.5x); the steps in between cost only the logic. The time of day (time():
// the duel clocks the game shows, which the server owns) and every other scene keep real time. Off under
// RC_FASTFORWARD (its own clock).
// Web: Module.yo2DuelSpeed (client/web-shell/duelspeed.js: the control, kept in localStorage), read on entering a
// duel scene and every 15 frames in one, so a change applies at once. Native: RC_DUEL_SPEED=1|1.5|2.
#include <stdlib.h>
#include "rt.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

static uint32_t speed = 1000;   // permille; 1000 outside the duel scenes
static int in_duel;

static uint32_t wanted(void) {
#ifdef __EMSCRIPTEN__
    double s = EM_ASM_DOUBLE({ return +Module.yo2DuelSpeed || 1; });
#else
    double s = getenv("RC_DUEL_SPEED") ? atof(getenv("RC_DUEL_SPEED")) : 1;
#endif
    return s >= 1.75 ? 2000 : s >= 1.25 ? 1500 : 1000;   // the three the control offers
}
static void apply(uint32_t pm) {
    if (pm == speed) return;
    speed = pm;
    rc_set_tick_rate(pm);
    rc_log("duelspeed: %u.%ux", pm / 1000, pm % 1000 / 100);
}
// ovr/scene.c, as a scene switch begins: SceneId 0x1c duel, 0x1d duel end, 0x1e janken, 0x20 result
void rc_duelspeed_scene(int to) {
    in_duel = to == 0x1c || to == 0x1d || to == 0x1e || to == 0x20;
    apply(in_duel && !rc_fastforward ? wanted() : 1000);
}
// every Present (rt/user32.cpp): a change made during a duel applies within 15 frames; whether the next frame is drawn
int rc_duelspeed_frame(int frame) {
    static uint32_t acc;
    if (in_duel && !rc_fastforward && frame % 15 == 0) apply(wanted());
    if (speed == 1000) { acc = 0; return 1; }
    acc += 1000;
    if (acc < speed) return 0;
    acc -= speed;
    return 1;
}
