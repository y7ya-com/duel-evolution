// Scene-change signal for the web loader ring. CSceneMng::switchScene (0x61d6a0, src/System/yo2SceneManager.cpp) is
// the one place every scene change goes through (change/push/pop: title -> login, My Room door -> lobby, duel result
// -> lobby). "begin" when it runs; "end" on the first Present after it at which the screen fader is not fading to or
// holding black (the lobby holds black ~1 s past its first frame while it loads). Scenes switched without a fade end
// on their first Present. Nothing fires on a screen that does not change scene.
// Web: Module.onYo2Scene?.(kind, from, to), kind "begin" or "end", from/to SceneId numbers (yo2SceneManager.h:
// 4 title, 6 login, 7 player select, 10 My Room, 12 lobby, 0x1c duel, 0x1e janken, 0x20 result, ...).
// Native: RC_SCENE_LOG=1 logs each event, "end" with the shown frame's mean brightness.
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "rt.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
EM_JS_DEPS(rc_scene, "$UTF8ToString");
EM_JS(void, scene_js, (const char *kind, int from, int to), {
    if (Module['onYo2Scene']) Module['onYo2Scene'](UTF8ToString(kind), from, to);
});
#else
static void scene_js(const char *kind, int from, int to) { (void)kind; (void)from; (void)to; }
#endif

void o_0061d6a0(CPU *c);
void rc_free_scene(CPU *c);   // ovr/freemode.c: My Room's replacement in free mode
void rc_duelspeed_scene(int to);   // ovr/duelspeed.c
int rc_backbuffer_luma(void);

static int pending, from_id, to_id, logging = -1;
static uint32_t mgr;   // the CSceneMng (one per process)
static unsigned presents;
static double t_begin;

static double ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1e3 + ts.tv_nsec / 1e6;
}

static void emit(const char *kind) {
    if (logging < 0) logging = getenv("RC_SCENE_LOG") && atoi(getenv("RC_SCENE_LOG"));
    if (logging)
        rc_log("scene %s %d -> %d (present %u, +%.0f ms, luma %d)", kind, from_id, to_id, presents, ms() - t_begin,
               *kind == 'e' ? rc_backbuffer_luma() : -1);
    scene_js(kind, from_id, to_id);
}

// 0x0061d6a0 CSceneMng::switchScene, thiscall, no arguments
void f_0061d6a0(CPU *c) {
    RC_LOCALS;
    mgr = c->ecx;
    rc_free_scene(c);
    from_id = (int)RD32(mgr + 0x7c);   // sceneId_ (SCENE_NONE 0x2c before the first scene)
    to_id = (int)RD32(mgr + 0x80);     // nextId_
    t_begin = ms();
    emit("begin");
    rc_duelspeed_scene(to_id);
    pending = 1;
    o_0061d6a0(c);
}

// Whether the screen fader is fading to, or holding, opaque black: CScreenFader (0x7dc600) state at +0x340 (0 idle,
// 1/2 fading, 3 done), from/to colours as RGBA floats at +0x344/+0x354. The duel's end fades to half grey, a dim the
// result screen draws over, so only black counts.
static int fader_black(void) {
    RC_LOCALS;
    uint32_t f = RD32(mgr + 0xc4);   // fader_: CTaskPtr at 0xc0, its task at +4
    if (!f || RD32(f + 0x340) == 0) return 0;
    float to[4];
    memcpy(to, m + f + 0x354, sizeof to);
    return to[3] > 0.5f && to[0] + to[1] + to[2] < 0.1f;
}

int rc_scene_now(void) { return pending ? 0x100 | to_id : to_id; }   // rt/prof.c

// dev_Present (rt/d3d8.cpp), after the frame is shown, on the guest main thread
void rc_scene_present(void) {
    presents++;
    if (!pending || fader_black()) return;
    pending = 0;
    emit("end");
}
