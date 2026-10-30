// The sound effects load after the first frame, not before it. The sound init (FUN_00685a60) has FUN_00686be0 load
// every effect data/etc/se.txt lists (41 PCM files in Sound.dat's /SE/, 5.7 MB, each read twice: FUN_00687490) before
// the title's first frame. On the web those reads are 8 synchronous 1 MB Range requests: 3.9 s of a 40 s cold boot at
// 20 Mbit/s. Here 00686be0 only records the folder and reports success. The load itself (00687490, unchanged) runs at
// a later Present: on the web once web/lazyfs.js has fetched those chunks in the background (Module.yo2Lazy.sounds()),
// natively at the first one. Until then the effect count (DAT_0127dfb8) is 0, so a play, stop or volume change finds
// no effect and does nothing (FUN_00687940, FUN_00686d40): an effect played before the load is skipped. The volume is
// applied again after the load. RC_SE_EAGER=1 (web: ?RC_SE_EAGER=1) loads them at the original point, for comparisons.
#include <stdio.h>
#include <stdlib.h>
#include "rt.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

uint32_t rc_halloc(uint32_t n, int zero);
extern int rc_frame_no;
void o_00686be0(CPU *restrict c);

#define SE_LOADED 0x127dfd0u   // 1: the effects are loaded
#define SE_STATE 0x127dfb8u    // count, loader, path list, effects, path buffer, lengths
#define SE_DIR 0x127dfd4u      // the folder ("<Sound.dat>/SE/"), read by 00687490
#define SE_VOLUME 0xc98250u    // the effects' volume, 0..0x7f
#define SOUND_ON 0x127df6cu    // 00685a60 succeeded (cleared when the sound device is released)

static uint32_t dir;   // the folder, copied: the caller's buffer is on its stack
static int pending;

void f_00686be0(CPU *restrict c) {
    const char *s = GS(ARG(0));
    if (*(uint8_t *)G(SE_LOADED) || !s || pending || getenv("RC_SE_EAGER")) { o_00686be0(c); return; }
    for (int i = 0; i < 6; i++) WR32m(SE_STATE + 4 * i, 0);   // as the original: nothing loaded yet
    size_t n = strlen(s) + 1;
    if (!dir) dir = rc_halloc(256, 1);
    memcpy(G(dir), s, n < 256 ? n : 255);
    WR32m(SE_DIR, dir);
    WR32m(SE_VOLUME, 0x7f);
    pending = 1;
    RETC(1);
}

void rc_starter_frame(CPU *c);   // starterdeck.c
void rc_htmlui_frame(CPU *c);    // htmlui.c

// at every Present (d3d8.cpp)
void rc_ovr_frame(CPU *c) {
    rc_starter_frame(c);
    rc_htmlui_frame(c);
    if (!pending) return;
    if (!*(uint8_t *)G(SOUND_ON)) { pending = 0; return; }   // the init failed after all: no sound
#ifdef __EMSCRIPTEN__
    if (!EM_ASM_INT({ return Module.yo2Lazy && Module.yo2Lazy.sounds ? Module.yo2Lazy.sounds() : 1; })) return;
#endif
    pending = 0;
    uint32_t sp = c->esp;
    if (rc_call(c, 0x687490, 0, NULL) & 0xff) {
        *(uint8_t *)G(SE_LOADED) = 1;
        c->esp -= 4;   // FUN_00686d40(&volume): the volume the options set meanwhile, on every effect
        WR32m(c->esp, RD32m(SE_VOLUME));
        uint32_t v = c->esp;
        rc_call(c, 0x686d40, 1, &v);
    } else {
        WR32m(SE_STATE, 0);   // 00687490 freed what it made but left the count
    }
    c->esp = sp;
    rc_log("sedefer: %u sound effects loaded at frame %d", RD32m(SE_STATE), rc_frame_no);
#ifdef __EMSCRIPTEN__
    EM_ASM({ if (Module.yo2Lazy && Module.yo2Lazy.soundsLoaded) Module.yo2Lazy.soundsLoaded(); });
#endif
}
