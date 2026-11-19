// The Main Menu's "Audio" entry (opens the player's audio settings, rt/audioui.c). It reuses entry 6: the exe creates
// fourteen entries (CMainMenu, src/Game/yo2MenuMain.cpp) but no scene ever shows entry 6 (caption 0x1407), and a
// click on it only sets selected_, which nobody reads. Wherever a scene shows Edit Deck (entry 0: My Room, the
// lobby, ...) Audio is shown too; arrange() puts it between D-Mail and Duel Log. RC_NOAUDIOMENU=1 leaves the menu as is.
// The same override never shows the DUELPASS entry (PvP is free: ovr/nodp.c), unless RC_DP=1: on the web its slot is
// "Settings" instead (web/settingspage.js: the card pictures), shown with Edit Deck like Audio, after Duel Log.
// RC_NOSETTINGSMENU=1 leaves it hidden.
#include <stdlib.h>
#include "rt.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

uint32_t rc_halloc(uint32_t n, int zero);

void o_00a666f0(CPU *c);
void o_00a67270(CPU *c);
void o_00a668b0(CPU *c);
void rc_audio_ui_open(void);

enum { AUDIO_ENTRY = 6, DUELPASS_ENTRY = 8, SETTINGS_ENTRY = DUELPASS_ENTRY };

int rc_dp_removed(void);

static int enabled(void) {
    static int on = -1;
    if (on < 0) on = !(getenv("RC_NOAUDIOMENU") && atoi(getenv("RC_NOAUDIOMENU")));
    return on;
}

static int settings(void) {   // the Settings page is the web page's (the card pictures are lazyfs's)
#ifdef __EMSCRIPTEN__
    static int on = -1;
    if (on < 0) on = rc_dp_removed() && !(getenv("RC_NOSETTINGSMENU") && atoi(getenv("RC_NOSETTINGSMENU")));
    return on;
#else
    return 0;
#endif
}

static void settings_open(void) {
#ifdef __EMSCRIPTEN__
    MAIN_THREAD_EM_ASM({ if (Module.rcSettingsUI) Module.rcSettingsUI.open(); });
#endif
}

// t as the WChar string CWindowTaskTextSwitch::setText takes, in guest memory (kept: the caption may hold it)
static uint32_t wstr(const char *t) {
    RC_LOCALS;
    unsigned n = 0;
    while (t[n]) n++;
    uint32_t s = rc_halloc((n + 1) * 2, 1);
    for (unsigned i = 0; i < n; i++) WR16(s + 2 * i, (uint8_t)t[i]);
    return s;
}

// entry i of the menu at self: its caption, shown_
static void own_entry(CPU *c, uint32_t self, int i, uint32_t text, int shown) {
    RC_LOCALS;
    uint32_t e = RD32(self + 0x3b0 + 4 * i);
    c->ecx = e;
    rc_call(c, RD32(RD32(e) + 0x44), 1, &text);   // vf 17 setText(const WChar*)
    WR8(self + 0x42e + i, shown);
}

// 0x00a666f0 CMainMenu::showEntry(i), thiscall, ret 4
void f_00a666f0(CPU *c) {
    RC_LOCALS;
    uint32_t self = c->ecx, i = RD32(c->esp + 4);
    o_00a666f0(c);
    static uint32_t audio_text, settings_text;
    int audio = i == 0 && enabled(), nodp = i == DUELPASS_ENTRY && rc_dp_removed(), own = (i == 0 || nodp) && settings();
    if (!audio && !nodp && !own) return;
    uint32_t ret_to = c->ret_to, eax = c->eax;
    if (audio) own_entry(c, self, AUDIO_ENTRY, audio_text ? audio_text : (audio_text = wstr("Audio")), 1);
    if (nodp) WR8(self + 0x42e + DUELPASS_ENTRY, 0);
    if (own) {   // Settings: with Edit Deck, wherever a scene shows either; never greyed out by the DUELPASS config switch
        own_entry(c, self, SETTINGS_ENTRY, settings_text ? settings_text : (settings_text = wstr("Settings")), RD8(self + 0x42e));
        WR8(RD32(self + 0x3b0 + 4 * SETTINGS_ENTRY) + 0x350, 1);   // enabled_
    }
    c->ecx = self;
    rc_call(c, 0x00a66750, 0, NULL);            // arrange()
    c->ret_to = ret_to;
    c->eax = eax;
}

// 0x00a668b0 CMainMenu::setEntriesEnabled(on), thiscall, ret 4: the config's switched-off entries go off again, the
// DUELPASS slot with them; Settings follows `on` alone
void f_00a668b0(CPU *c) {
    RC_LOCALS;
    uint32_t self = c->ecx, on = RD8(c->esp + 4);
    o_00a668b0(c);
    uint32_t e = RD32(self + 0x3b0 + 4 * SETTINGS_ENTRY);
    if (settings() && e) WR8(e + 0x350, on);   // enabled_
}

// 0x00a67270 CMainMenu::onControlEvent(sender), thiscall on the mediator (menu + 0x340), ret 4. The Audio and Settings
// entries close the menu as its x button does (the original, with the x as sender), then open their page.
void f_00a67270(CPU *c) {
    RC_LOCALS;
    uint32_t self = c->ecx, sender = RD32(c->esp + 4), a = RD32(self + 0x70 + 4 * AUDIO_ENTRY), s = RD32(self + 0x70 + 4 * SETTINGS_ENTRY);
    int audio = enabled() && a && sender == a + 0x340, own = settings() && s && sender == s + 0x340;
    if ((!audio && !own) || !RD8(self + 0xec) /* active_ */ || !RD32(self + 0xac)) {
        o_00a67270(c);
        return;
    }
    WR32(c->esp + 4, RD32(self + 0xac) + 0x340);   // close_ (CWindowTaskIconHide) as the sender
    o_00a67270(c);
    if (audio) rc_audio_ui_open();
    else settings_open();
}
