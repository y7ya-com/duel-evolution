// yo2rc: the recompiled yo2.exe. Boots from the original CRT entry point (static initializers, then WinMain).
//   YO2_GAME=<folder with merge.dat ...> YO2_WRITE=<overlay folder> build/yo2rc [command line]
#include <stdio.h>
#include <stdlib.h>
#include <sys/stat.h>

#include "win.h"

void rc_debrand(void);

int main(int argc, char **argv) {
    const char *exe = getenv("YO2_EXE");
    rc_nospeed = getenv("RC_NOSPEED") != NULL;
    rc_game_dir = getenv("YO2_GAME");
    rc_write_dir = getenv("YO2_WRITE");
    if (!exe) exe = "../game/yo2.exe";   // the game folder below (YO2_EXE overrides)
    // not the Boxedwine container itself: macOS stops a new binary there on an "access other apps' data" prompt
    if (!rc_game_dir) rc_game_dir = "../game";   // run/game: an APFS clone (cp -cR) of the Boxedwine copy
    if (!rc_write_dir) rc_write_dir = "rc-overlay";
    mkdir(rc_write_dir, 0755);
    rc_init(exe);
    CPU *c = rc_new_thread_cpu(0x400000);
    c->thread->id = 0x80;
    rc_set_cur(c);
    rc_k32_init(c, argc > 1 ? argv[1] : "");
    rc_ovr_init();
    rc_log("yo2rc: entry %08x, game %s, overlay %s", rc_entry, rc_game_dir, rc_write_dir);
    rc_debrand();   // rt/debrand.cpp: no KONAMI marks, copyright lines or QUIT/DELETE/WEBSITE on the start screens
    rc_call(c, rc_entry, 0, NULL);
    if (c->ret_to != RC_RETURN_MAGIC)   // a ret popped an address no live frame expects: unwound out of everything
    {
        rc_log("yo2rc: entry left non-locally, ret_to %08x esp %08x eax %u", c->ret_to, c->esp, c->eax);
        for (uint32_t a = c->esp - 0x200; a < c->esp + 0x100; a += 4)   // the dead frames: code addresses in them
            if (RD32m(a) - 0x401000u < 0x900000u) rc_log("  [%08x] %08x", a, RD32m(a));
    }
    else
        rc_log("yo2rc: entry returned %u", c->eax);
    return (int)c->eax;
}
