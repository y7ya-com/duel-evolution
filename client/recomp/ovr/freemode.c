// Free mode, a Duel Evolution addition (not in the 2008 game): the title's DECK EDITOR and FREE DUEL. Either one signs
// in through ONLINE's own path (login scene, Select Player), then, instead of My Room:
//   DECK: the Edit Deck scene, its trunk every card x3 (the server's free view); Exit goes back to the title;
//   (the title's rows 3 and 4, btn_web and btn_clear, carry the captions: rt/freetitle.cpp; rt/debrand.cpp keeps them)
// The mode is per sign-in: the title ends it. RC_FREE_MODE=deck|duel starts in it (tests: ONLINE then acts as it).
#include <stdlib.h>
#include <string.h>
#include "rt.h"

enum { SC_PATCHER = 1, SC_TITLE = 4, SC_NONE = 0x2c, SC_MY_ROOM = 10, SC_DECK = 0x24 };

int rc_free_mode = -1;   // 0 off, 1 DECK, 2 DUEL

int rc_free(void) {
    if (rc_free_mode < 0) {
        const char *e = getenv("RC_FREE_MODE");
        rc_free_mode = !e ? 0 : !strcmp(e, "deck") ? 1 : !strcmp(e, "duel") ? 2 : 0;
    }
    return rc_free_mode;
}

// CSceneMng::switchScene (ovr/scene.c), before it runs: mgr+0x7c the current id, +0x80 the next, +0x84 a suspended
// scene to resume (then the id is not ours to change).
void rc_free_scene(CPU *c) {
    RC_LOCALS;
    uint32_t mgr = c->ecx;
    uint32_t from = RD32(mgr + 0x7c), to = RD32(mgr + 0x80);
    if (!rc_free()) return;
    if (to == SC_TITLE && from != SC_PATCHER && from != SC_NONE) {   // back from a signed-in scene
        rc_log("free: back at the title, mode %d off", rc_free_mode);
        rc_free_mode = 0;
        return;
    }
    uint32_t next = to;
    if (rc_free_mode == 1 && from == SC_DECK) next = SC_TITLE;   // the editor's Exit pops to whatever pushed it
    else if (to == SC_MY_ROOM && !RD32(mgr + 0x84)) next = rc_free_mode == 1 ? SC_DECK : SC_TITLE;
    if (next == to) return;
    rc_log("free: scene %u -> %u instead of %u", from, next, to);
    WR32(mgr + 0x80, next);
    WR32(mgr + 0x84, 0);   // ponytail: a suspended scene popped to is left alive (Exit pops a destroyed one)
    // The world's own quit (its onMain 0xa58040, when CWorldMng says quit_): 0xa58510 destroys CWorldMng (hanging up
    // My Room's lobby), popTo + change(title); then the world's state 0, no quit pending. Without it the next
    // sign-in hangs at Select Player.
    uint32_t world = RD32(0x012bb6b0);
    if (next == SC_TITLE && world) {
        rc_free_mode = 0;
        CPU t = *c;
        t.ecx = world;
        rc_call(&t, 0x00a58510, 0, NULL);
        WR32(world + 0x70, 0);
        WR8(world + 0x74, 0);
    }
}

void o_007fa450(CPU *c);
uint32_t rc_online_scene(void);   // rt.c: ONLINE's next scene (the login), and rt/session.cpp's "ONLINE was pressed"

// The clicked SWF object's name: a VC6 std::string at +0x34c (allocator, then the char pointer at +4).
static int named(uint32_t obj, const char *want) {
    RC_LOCALS;
    uint32_t p = RD32(obj + 0x34c + 4);
    for (size_t i = 0;; i++) {
        uint8_t ch = p ? RD8(p + i) : 0;
        if (ch != (uint8_t)want[i]) return 0;
        if (!ch) return 1;
    }
}

// 0x007fa450 CTitleScene::Receive(msg), thiscall, ret 4. A click (CTmSwfObjEvent: tag 0x13, +0x10 the object, +0x15
// clicked) on btn_web / btn_clear once the movie has played (title_ at +0x90, CSwfEngine +0x3f1) does what ONLINE
// (btn_start) does: the OK sound, then CSceneMng::push(the login, FADE_WAIT, destroy), with the free mode set.
void f_007fa450(CPU *c) {
    RC_LOCALS;
    uint32_t self = c->ecx, msg = RD32(c->esp + 4), swf = RD32(self + 0x90);
    int mode = 0;
    if (!getenv("RC_NOFREEMODE") && RD32(msg + 4) == 0x13 && RD8(msg + 0x15) && swf && RD8(swf + 0x3f1))
        mode = named(RD32(msg + 0x10), "btn_web") ? 1 : named(RD32(msg + 0x10), "btn_clear") ? 2 : 0;
    if (!mode) {
        o_007fa450(c);
        return;
    }
    rc_free_mode = mode;
    rc_log("free: title %s", mode == 1 ? "DECK EDITOR" : "FREE DUEL");
    uint32_t sound[2] = {0x10000001, 0}, push[3] = {rc_online_scene(), 1, 1};
    rc_call(c, 0x00411fcc, 2, sound);   // soundPlay(SE_OK, 0), cdecl
    c->esp += 8;
    c->ecx = RD32(0x01271790);          // CSceneMng::instance()
    rc_call(c, 0x0041271a, 3, push);    // push(id, fade, destroyOld), thiscall
    c->eax = 0;
    c->ret_to = RD32(c->esp);
    c->esp += 8;   // ret 4
}
