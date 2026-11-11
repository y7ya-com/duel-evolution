// Intercept CTmAvatarOnExit before CAreaMap::receive starts its fade and pushes SCENE_SHOP.
#include "rt.h"
#ifdef RC_SHOPDIRECT_TEST
static int shop_enabled(void);
static int shop_open(void);
static void shop_show(void);
#elif defined(__EMSCRIPTEN__)
#include <emscripten.h>
EM_JS(int, shop_enabled, (), { return !!Module['yo2ShopOverlay'] && typeof Module['onYo2ShopOpen'] === 'function'; });
EM_JS(int, shop_open, (), { return !!Module['yo2ShopOverlayOpen']; });
EM_JS(void, shop_show, (), { Module['onYo2ShopOpen'](); });
#else
static int shop_enabled(void) { return 0; }
static int shop_open(void) { return 0; }
static void shop_show(void) {}
#endif
void o_009fb8c0(CPU *c);
void o_009cd5c0(CPU *c);
static uint32_t moving, latched, player;
static float door_x, door_y;

void rc_shopdirect_scene(int to) { if (to != 12) latched = player = 0; }

void f_009cd5c0(CPU *c) {
    RC_LOCALS;
    uint32_t self = c->ecx;
    if (self == player && shop_open()) {
        c->ret_to = RD32(c->esp); c->esp += 8; return;
    }
    uint32_t previous = moving;
    moving = self;
    o_009cd5c0(c);
    moving = previous;
    if (self == player && shop_open()) {
        CPU t = *c; t.ecx = self;
        rc_call(&t, 0x009cac00, 0, NULL); // stop: discard the walk that entered the door
    }
    // The foot probe can briefly report no exit at the mat's edge. Require a real step away as well.
    float dx = rc_rdf32(m + self + 0x70) - door_x, dy = rc_rdf32(m + self + 0x74) - door_y;
    if (latched == self && RD32(self + 0x658) == 0xffffffffu && dx * dx + dy * dy >= 48 * 48) latched = 0;
}

void f_009fb8c0(CPU *c) {
    RC_LOCALS;
    uint32_t self = c->ecx, msg = RD32(c->esp + 4), mgr = RD32(0x1271790);
    if (shop_enabled() && moving && mgr && RD32(mgr + 0x7c) == 12 && RD32(msg + 4) == 0x1d) {
        uint32_t map = RD32(self + 0x274), exit = RD32(msg + 0x10);
        if (map < 10 && exit < 4 && RD32(0xd2d4d0 + map * 0x1a4 + 0x104 + exit * 16) == 11) {
            player = moving;
            if (latched != moving && RD32(self + 0x270) == 3) {
                latched = moving;
                door_x = rc_rdf32(m + moving + 0x70);
                door_y = rc_rdf32(m + moving + 0x74);
                shop_show();
            }
            c->eax = 0; c->ret_to = RD32(c->esp); c->esp += 8; return;
        }
    }
    o_009fb8c0(c);
}
