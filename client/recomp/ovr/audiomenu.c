// The Main Menu's "Audio" entry (opens the player's audio settings, rt/audioui.c). It reuses entry 6: the exe creates
// fourteen entries (CMainMenu, src/Game/yo2MenuMain.cpp) but no scene ever shows entry 6 (caption 0x1407), and a
// click on it only sets selected_, which nobody reads. Wherever a scene shows Edit Deck (entry 0: My Room, the
// lobby, ...) Audio is shown too; arrange() puts it between D-Mail and Duel Log. RC_NOAUDIOMENU=1 leaves the menu as is.
// The same override never shows the DUELPASS entry (PvP is free: ovr/nodp.c), unless RC_DP=1.
#include <stdlib.h>
#include "rt.h"

uint32_t rc_halloc(uint32_t n, int zero);

void o_00a666f0(CPU *c);
void o_00a67270(CPU *c);
void rc_audio_ui_open(void);

enum { AUDIO_ENTRY = 6, DUELPASS_ENTRY = 8 };

int rc_dp_removed(void);

static int enabled(void) {
    static int on = -1;
    if (on < 0) on = !(getenv("RC_NOAUDIOMENU") && atoi(getenv("RC_NOAUDIOMENU")));
    return on;
}

// "Audio" as the WChar string CWindowTaskTextSwitch::setText takes, in guest memory (kept: the caption may hold it)
static uint32_t caption(void) {
    static uint32_t s;
    if (!s) {
        RC_LOCALS;
        static const char t[] = "Audio";
        s = rc_halloc(sizeof t * 2, 1);
        for (unsigned i = 0; i < sizeof t; i++) WR16(s + 2 * i, (uint8_t)t[i]);
    }
    return s;
}

// 0x00a666f0 CMainMenu::showEntry(i), thiscall, ret 4
void f_00a666f0(CPU *c) {
    RC_LOCALS;
    uint32_t self = c->ecx, i = RD32(c->esp + 4);
    o_00a666f0(c);
    int audio = i == 0 && enabled(), nodp = i == DUELPASS_ENTRY && rc_dp_removed();
    if (!audio && !nodp) return;
    uint32_t ret_to = c->ret_to, eax = c->eax;
    if (audio) {
        uint32_t e = RD32(self + 0x3b0 + 4 * AUDIO_ENTRY), s = caption();
        c->ecx = e;
        rc_call(c, RD32(RD32(e) + 0x44), 1, &s);   // vf 17 setText(const WChar*)
        WR8(self + 0x42e + AUDIO_ENTRY, 1);         // shown_
    }
    if (nodp) WR8(self + 0x42e + DUELPASS_ENTRY, 0);
    c->ecx = self;
    rc_call(c, 0x00a66750, 0, NULL);            // arrange()
    c->ret_to = ret_to;
    c->eax = eax;
}

// 0x00a67270 CMainMenu::onControlEvent(sender), thiscall on the mediator (menu + 0x340), ret 4. The Audio entry
// closes the menu as its x button does (the original, with the x as sender), then opens the settings.
void f_00a67270(CPU *c) {
    RC_LOCALS;
    uint32_t self = c->ecx, sender = RD32(c->esp + 4), e = RD32(self + 0x70 + 4 * AUDIO_ENTRY);
    if (!enabled() || !e || sender != e + 0x340 || !RD8(self + 0xec) /* active_ */ || !RD32(self + 0xac)) {
        o_00a67270(c);
        return;
    }
    WR32(c->esp + 4, RD32(self + 0xac) + 0x340);   // close_ (CWindowTaskIconHide) as the sender
    o_00a67270(c);
    rc_audio_ui_open();
}
