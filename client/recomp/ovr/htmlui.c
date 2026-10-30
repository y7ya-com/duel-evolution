// The HTML UI bridge's game side (client/web-shell/htmlui/: bridge.js reads the window tree straight out of memory and
// draws the windows it owns in the DOM; CONTRACT.md).
//
// 1. Draw suppression. CElement::onMain (0x0060f9e0, src/System/yo2Element.cpp) updates the element's matrix, then
//    queues it for drawing if disp_ (+0xc4) is set and hiddenByParent_ (+0xc6) is not. For an element under a window
//    in the hide table, hiddenByParent_ reads 1 for the length of that call: the matrix is still updated, the draw is
//    skipped. Nothing else changes (disp_, hit tests, the factory's message routing), so the game runs exactly as
//    before and input still reaches its controls. An element under a pass entry (nearer than the hidden window) is
//    drawn anyway: engine content inside an HTML window (the waist-up avatar, card art, Flash).
// 2. Module.onYo2Frame?.(tables, HEAPU8) at every Present, on the game's thread, after the frame is shown: the bridge reads
//    the tree and updates the DOM there. tables: the address of HtmlUiTables below, which the bridge writes.
// 3. Owned-mode input the bridge queued (keys, characters, a control's text) is played into the game first, on the
//    same thread: a Win32 message through CWindowTaskFactory::dispatch (0x5e2700: keys and WM_CHAR go to the focused
//    control, as the game's own WndProc sends them), or a control's setText (vtable slot 17, +0x44: a wide string).
//    Mouse input is not queued: the bridge sends real canvas events at the control, as a player's mouse would.
//
// With an empty hide table (native builds, ?HTML_UI=0) onMain costs one load and a compare.
#include "rt.h"
#include "win.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <emscripten/threading.h>
#endif

void o_0060f9e0(CPU *restrict c);

enum { SLOTS = 63, DEPTH = 32, QUEUE = 32, TEXT = 1024 };
enum { Q_DISPATCH = 1, Q_SETTEXT = 2 };
struct HtmlUiTables {          // written by bridge.js (Module.HEAPU32 at the address onYo2Frame gets)
    uint32_t nhide, hide[SLOTS];   // windows the DOM draws (CWindowTaskModel addresses)
    uint32_t npass, pass[SLOTS];   // elements under them the engine keeps drawing
    uint32_t nq;                   // queued input, played at the next Present, then nq = 0
    struct { uint32_t kind, a, b, c; } q[QUEUE];   // DISPATCH: msg, wParam, lParam; SETTEXT: control, text offset, length
    uint16_t text[TEXT];           // the SETTEXT strings (UTF-16)
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

static void play(CPU *c) {
    RC_LOCALS;
    uint32_t n = tab.nq < QUEUE ? tab.nq : QUEUE, fac = RD32(0x126fa8c);   // g_windowFactory
    for (uint32_t i = 0; i < n && fac; i++) {
        CPU t = *c;   // a scratch copy below the current stack
        if (tab.q[i].kind == Q_DISPATCH) {
            uint32_t a[3] = {tab.q[i].a, tab.q[i].b, tab.q[i].c};
            t.ecx = fac;
            rc_call(&t, 0x5e2700, 3, a);
        } else if (tab.q[i].kind == Q_SETTEXT && tab.q[i].a && tab.q[i].b + tab.q[i].c < TEXT) {
            uint32_t ctl = tab.q[i].a, len = tab.q[i].c, buf = rc_halloc(2 * len + 2, 1);
            for (uint32_t k = 0; k < len; k++) WR8(buf + 2 * k, tab.text[tab.q[i].b + k]), WR8(buf + 2 * k + 1, tab.text[tab.q[i].b + k] >> 8);
            t.ecx = ctl;
            rc_call(&t, RD32(RD32(ctl) + 0x44), 1, &buf);
            rc_hfree(buf);
        }
    }
    tab.nq = 0;
}

// ovr/sedefer.c's rc_ovr_frame, at every Present
void rc_htmlui_frame(CPU *c) {
    if (tab.nq) play(c);
#ifdef __EMSCRIPTEN__
    if (emscripten_is_main_runtime_thread())
        EM_ASM({ if (Module.onYo2Frame) Module.onYo2Frame($0, HEAPU8); }, &tab);   // HEAPU8: not on Module in every build
#endif
}
