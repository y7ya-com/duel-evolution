// The Duel Log tab. The server (server/src/duel/duelText.ts) sends a plain-English line for each duel event as a
// lobby chat line (0x4402) on channel 9. The stock chat pump (CChatWindow vf05, 0x00a770a0) routes channels 0-5 to its
// tabs and drops any other, so an older client never shows them. Here:
// - the chat window gets a 7th tab, "Duel Log", visible only on the duel screen (scene 0x1c) and its result (0x20),
//   emptied when a new duel starts, and laid out second: All Chat | Duel Log | Proximity Chat | TRADE | Team;
// - the chat list's pop (CNetLobby, 0x006af100) hands channel-9 lines to that tab and turns them into a channel the
//   pump drops.
#include <string.h>
#include "rt.h"

uint32_t rc_halloc(uint32_t n, int zero);
int rc_scene_now(void);   // scene.c
void o_00a770a0(CPU *c);
void o_006af100(CPU *c);

#define DUEL_LOG_CHANNEL 9
#define DROP_CHANNEL 99           // not 0-5: the pump frees the line and shows nothing
#define TAB 6                     // the stock window has tabs 0-5
#define SCENE_DUEL 0x1c
#define SCENE_RESULT 0x20
// CWindowModelChatWindow (src/System/window/yo2WindowChat.h): tabs_ a VC6 vector of Tab (0x1c: visible u8, list,
// tab) with _First at +0x3e4 and _Last at +0x3e8; CWindowTaskTab x_ +0x3bc, w_ +0x3c4; CElement pos_ +0x70
#define TABS_FIRST 0x3e4
#define TABS_LAST 0x3e8
#define TAB_SIZE 0x1c
#define CTL_X 0x3bc
#define CTL_W 0x3c4
#define ELM_POS 0x70

static uint32_t chat;    // the CChatWindow whose pump runs (the game manager's one)
static int shown = -1;   // the Duel Log tab's visibility as last set

static uint32_t call(CPU *c, uint32_t self, uint32_t fn, int n, uint32_t a0, uint32_t a1) {
    CPU t = *c;
    uint32_t args[2] = {a0, a1};
    t.ecx = self;
    return rc_call(&t, fn, n, args);
}

static uint32_t ntabs(uint32_t w) { return (RD32m(w + TABS_LAST) - RD32m(w + TABS_FIRST)) / TAB_SIZE; }
static uint32_t tab_at(uint32_t w, uint32_t i) { return RD32m(w + TABS_FIRST) + i * TAB_SIZE; }

static uint16_t rd16(uint32_t a) { uint16_t v; memcpy(&v, G(a), 2); return v; }
static float rdf(uint32_t a) { uint32_t v = RD32m(a); float f; memcpy(&f, &v, 4); return f; }
static void wrf(uint32_t a, float f) { uint32_t v; memcpy(&v, &f, 4); WR32m(a, v); }

static void make_tab(CPU *c, uint32_t w) {
    static const char name[] = "Duel Log";
    uint32_t s = rc_halloc(2 * sizeof name, 1);
    for (unsigned i = 0; i < sizeof name; i++) { uint16_t ch = (uint8_t)name[i]; memcpy(G(s + 2 * i), &ch, 2); }
    call(c, w, 0x005f3e30, 0, 0, 0);          // addTab
    call(c, w, 0x005f46d0, 2, TAB, s);        // setTabText (copies the text)
    call(c, w, 0x005f4a80, 2, TAB, 100);      // setMaxLines
    call(c, w, 0x005f4800, 2, TAB, 0);        // setTabVisible: off until a duel
    shown = 0;
}

// the tab row as layout() places it (from x 8, each next at w - 8), with the Duel Log second
static void order_tabs(uint32_t w) {
    static const uint32_t order[] = {0, TAB, 1, 2, 3, 4, 5};
    float x = 8;
    for (unsigned k = 0; k < sizeof order / sizeof *order; k++) {
        uint32_t t = tab_at(w, order[k]), ctl = RD32m(t + 8);
        if (!(RD32m(t) & 0xff) || !ctl) continue;
        wrf(ctl + CTL_X, x);
        wrf(ctl + ELM_POS, x);
        x += rdf(ctl + CTL_W) - 8;
    }
}

// CChatWindow vf05: the per-frame chat pump
void f_00a770a0(CPU *c) {
    uint32_t w = c->ecx;
    chat = w;
    if (ntabs(w) == TAB) make_tab(c, w);
    if (ntabs(w) > TAB) {
        int scene = rc_scene_now() & 0xff, on = scene == SCENE_DUEL || scene == SCENE_RESULT;
        if (on != shown) {
            if (on && scene == SCENE_DUEL) call(c, w, 0x005f4510, 1, TAB, 0);   // clearTab: a new duel
            call(c, w, 0x005f4800, 2, TAB, on);
            shown = on;
        }
    }
    o_00a770a0(c);
    if (ntabs(w) > TAB && shown) order_tabs(w);
}

// CNetLobby: pop the oldest chat line into out (channel, pid, name wstring at +8, line wstring at +0x18: _Ptr +0x1c,
// _Len +0x20). The line is "@0" + name + ":" + text; the server's name is empty.
void f_006af100(CPU *c) {
    uint32_t out = ARG(0);
    o_006af100(c);
    if (RD32m(out) != DUEL_LOG_CHANNEL) return;
    WR32m(out, DROP_CHANNEL);
    uint32_t p = RD32m(out + 0x1c), n = RD32m(out + 0x20);
    if (!p || !chat || ntabs(chat) <= TAB) return;
    uint32_t i = 0;
    while (i < n && rd16(p + 2 * i) != ':') i++;
    if (i >= n) i = (uint32_t)-1;   // no ':': the whole line
    call(c, chat, 0x005f4190, 2, TAB, p + 2 * (i + 1));   // addLine (copies the text)
}
