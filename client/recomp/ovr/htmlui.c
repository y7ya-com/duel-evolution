// The HTML UI bridge's game side (client/web-shell/htmlui/: bridge.js reads the window tree straight out of memory and
// draws the windows it owns in the DOM; CONTRACT.md).
//
// 1. Draw suppression. CElement::onMain (0x0060f9e0, src/System/yo2Element.cpp) updates the element's matrix, then
//    queues it for drawing if disp_ (+0xc4) is set and hiddenByParent_ (+0xc6) is not. For an element under a window
//    in the hide table, hiddenByParent_ reads 1 for the length of that call: the matrix is still updated, the draw is
//    skipped. Nothing else changes (disp_, hit tests, the factory's message routing), so the game runs exactly as
//    before and input still reaches its controls. An element under a pass entry (nearer than the hidden window) is
//    drawn anyway: engine content inside an HTML window (the waist-up avatar, card art, Flash).
// 2. Module.onYo2Frame?.(tables) at every Present, on the game's thread, after the frame is shown: the bridge reads
//    the tree and updates the DOM there. tables: the address of HtmlUiTables below, which the bridge writes.
//
// With an empty hide table (native builds, ?HTML_UI=0) onMain costs one load and a compare.
#include "rt.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

void o_0060f9e0(CPU *restrict c);

enum { SLOTS = 63, DEPTH = 32 };
struct HtmlUiTables {          // written by bridge.js (Module.HEAPU32 at the address onYo2Frame gets)
    uint32_t nhide, hide[SLOTS];   // windows the DOM draws (CWindowTaskModel addresses)
    uint32_t npass, pass[SLOTS];   // elements under them the engine keeps drawing
};
static struct HtmlUiTables tab;

static int in(const uint32_t *v, uint32_t n, uint32_t a) {
    for (uint32_t i = 0; i < n; i++)
        if (v[i] == a) return 1;
    return 0;
}

// the nearest listed ancestor (the element included) decides; CTask::parent_ is +0x08
static int suppressed(const uint8_t *m, uint32_t el) {
    uint32_t nh = tab.nhide < SLOTS ? tab.nhide : SLOTS, np = tab.npass < SLOTS ? tab.npass : SLOTS;
    for (int d = 0; el && d < DEPTH; d++, el = RD32(el + 8)) {
        if (in(tab.pass, np, el)) return 0;
        if (in(tab.hide, nh, el)) return 1;
    }
    return 0;
}

// 0x0060f9e0 CElement::onMain, thiscall, returns true
void f_0060f9e0(CPU *restrict c) {
    RC_LOCALS;
    uint32_t el = c->ecx;
    if (!tab.nhide || !suppressed(m, el)) { o_0060f9e0(c); return; }
    uint8_t h = RD8(el + 0xc6);
    WR8(el + 0xc6, 1);
    o_0060f9e0(c);
    WR8(el + 0xc6, h);
}

// ovr/sedefer.c's rc_ovr_frame, at every Present
void rc_htmlui_frame(void) {
#ifdef __EMSCRIPTEN__
    if (emscripten_is_main_runtime_thread())
        EM_ASM({ if (Module.onYo2Frame) Module.onYo2Frame($0); }, &tab);
#endif
}
