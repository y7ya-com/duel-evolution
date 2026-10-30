// The HTML UI bridge's game side (client/web-shell/htmlui/: bridge.js reads the window tree straight out of memory and
// draws the windows it owns in the DOM; CONTRACT.md).
//
// 1. Draw suppression. CElement::onMain (0x0060f9e0, src/System/yo2Element.cpp) updates the element's matrix, then
//    queues it for drawing if disp_ (+0xc4) is set and hiddenByParent_ (+0xc6) is not. For an element under a window
//    in the hide table, hiddenByParent_ reads 1 for the length of that call: the matrix is still updated, the draw is
//    skipped. Nothing else changes (disp_, hit tests, the factory's message routing), so the game runs exactly as
//    before and input still reaches its controls. An element under a pass entry (nearer than the hidden window) is
//    drawn anyway: engine content inside an HTML window (the waist-up avatar, card art, Flash).
// 2. Module.onYo2Frame?.(tables, HEAPU8, SLOTS) at every Present, on the game's thread, after the frame is shown: the
//    bridge reads the tree and updates the DOM there. tables: the address of HtmlUiTables below, which the bridge
//    writes. Its first word is SLOTS, set here before the call: a bridge that writes another layout (an older one,
//    63 slots, no third argument) overwrites it, and the tables are then ignored (the engine draws everything). The
//    tables become a hash set once per frame, so a lookup costs the same with 1 entry or 255.
// 3. Owned-mode input the bridge queued (keys, characters, a control's text) is played into the game first, on the
//    same thread: a Win32 message through CWindowTaskFactory::dispatch (0x5e2700: keys and WM_CHAR go to the focused
//    control, as the game's own WndProc sends them), or a control's setText (vtable slot 17, +0x44: a wide string).
//    Mouse input is not queued: the bridge sends real canvas events at the control, as a player's mouse would.
//
// With an empty hide table (native builds, ?HTML_UI=0) onMain costs one load and a compare.
#include <string.h>
#include "rt.h"
#include "win.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <emscripten/threading.h>
#endif

void o_0060f9e0(CPU *restrict c);

enum { SLOTS = 255, DEPTH = 32, QUEUE = 32, TEXT = 1024, HASH = 1024 };
enum { Q_DISPATCH = 1, Q_SETTEXT = 2 };
struct HtmlUiTables {          // written by bridge.js (Module.HEAPU32 at the address onYo2Frame gets)
    uint32_t slots;                // SLOTS, set before every call: the layout's check (see 2. above)
    uint32_t nhide, hide[SLOTS];   // windows the DOM draws (CWindowTaskModel addresses)
    uint32_t npass, pass[SLOTS];   // elements under them the engine keeps drawing
    uint32_t nq;                   // queued input, played at the next Present, then nq = 0
    struct { uint32_t kind, a, b, c; } q[QUEUE];   // DISPATCH: msg, wParam, lParam; SETTEXT: control, text offset, length
    uint16_t text[TEXT];           // the SETTEXT strings (UTF-16)
};
static struct HtmlUiTables tab;

// the tables as one hash set (open addressing, HASH > 2 * SLOTS): address -> 1 hide | 2 pass
static uint32_t hkey[HASH];
static uint8_t hkind[HASH];
static uint32_t slot_of(uint32_t a) { return ((a >> 2) * 2654435761u) >> (32 - 10); }   // HASH = 1 << 10
static void put(uint32_t a, uint8_t k) {
    if (!a) return;
    uint32_t i = slot_of(a);
    while (hkey[i] && hkey[i] != a) i = (i + 1) & (HASH - 1);
    hkey[i] = a;
    hkind[i] |= k;
}
static uint8_t kind(uint32_t a) {
    for (uint32_t i = slot_of(a); hkey[i]; i = (i + 1) & (HASH - 1))
        if (hkey[i] == a) return hkind[i];
    return 0;
}
static void build(void) {
    memset(hkey, 0, sizeof hkey);
    memset(hkind, 0, sizeof hkind);
    uint32_t nh = tab.nhide < SLOTS ? tab.nhide : SLOTS, np = tab.npass < SLOTS ? tab.npass : SLOTS;
    for (uint32_t i = 0; i < nh; i++) put(tab.hide[i], 1);
    for (uint32_t i = 0; i < np; i++) put(tab.pass[i], 2);
}

// the nearest listed ancestor (the element included) decides, a pass over a hide; CTask::parent_ is +0x08
static int suppressed(const uint8_t *m, uint32_t el) {
    for (int d = 0; el && d < DEPTH; d++, el = RD32(el + 8)) {
        uint8_t k = kind(el);
        if (k & 2) return 0;
        if (k & 1) return 1;
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
    if (emscripten_is_main_runtime_thread()) {
        tab.slots = SLOTS;
        EM_ASM({ if (Module.onYo2Frame) Module.onYo2Frame($0, HEAPU8, $1); }, &tab, SLOTS);   // HEAPU8: not on Module in every build
        if (tab.slots != SLOTS) tab.nhide = tab.npass = tab.nq = 0;   // another layout: ignored
        build();
    }
#endif
}
