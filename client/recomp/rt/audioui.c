// The player's background audio settings (the game ships none; the Main Menu's Audio entry, ovr/audiomenu.c, opens
// them). They only feed the slot API (audioslots.h), which playback implements; the weak stubs below stand in until
// it is linked.
// Native: one folder per slot, <YO2_WRITE>/audio/<slot>/ (every file in it, sorted by name), and
// <YO2_WRITE>/audio/settings.txt: "master 0.8" and "<slot> volume 0.7 shuffle 1 loop 1" lines. Read when the window is
// up and again on every click of Audio, which also logs where the folders are.
// Web: nothing here but opening the page: web/audiopage.js (the settings page over the canvas) drives Module.yo2Audio
// (web/audio.js: decoding, the player's files in IndexedDB, playback) directly, since only the browser decodes audio.
#include <dirent.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include "audioslots.h"
#include "rt.h"
#include "win.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

// ---------------------------------------------------------------- stand-ins until playback links the real ones
static const RcAudioSlot kSlots[] = {   // a few of playback's 46 (recomp/audio-slots.md), same ids
    {"title", "Title screen", "The title screen"},
    {"my_room", "My Room", "Your room and its menus"},
    {"deck_editor", "Deck editor", "Editing decks, trades and gifts"},
    {"duel_win", "Win", "After a duel you won"},
    {"duel_lose", "Lose", "After a duel you lost"},
};
__attribute__((weak)) int rc_audio_list_slots(const RcAudioSlot **out) {
    *out = kSlots;
    return (int)(sizeof kSlots / sizeof kSlots[0]);
}
__attribute__((weak)) void rc_audio_set(const char *slot, const char *const *paths, int n, int shuffle, int loop,
                                        float volume) {
    rc_log("audio (no playback linked): %s = %d file(s)%s%s, volume %.2f%s%s", slot, n, shuffle ? ", shuffle" : "",
           loop ? ", loop" : "", volume, n ? ", first " : "", n ? paths[0] : "");
}
__attribute__((weak)) void rc_audio_master(float volume) { rc_log("audio (no playback linked): master %.2f", volume); }
__attribute__((weak)) void rc_audio_preview(const char *slot, int play) {
    rc_log("audio (no playback linked): preview %s %s", slot, play ? "on" : "off");
}

// ---------------------------------------------------------------- native: folders + settings.txt
#ifndef __EMSCRIPTEN__
static int by_name(const void *a, const void *b) { return strcmp(*(char *const *)a, *(char *const *)b); }

static void load_native(void) {
    char root[1024], path[1200], line[256];
    snprintf(root, sizeof root, "%s/audio", rc_write_dir);
    mkdir(root, 0755);
    const RcAudioSlot *s;
    int ns = rc_audio_list_slots(&s);
    float vol[64], master = 1;
    int shuffle[64] = {0}, loop[64];
    for (int i = 0; i < ns && i < 64; i++) vol[i] = 1, loop[i] = 1;
    snprintf(path, sizeof path, "%s/settings.txt", root);
    FILE *f = fopen(path, "r");
    if (f) {
        while (fgets(line, sizeof line, f)) {
            char id[64];
            float v, mv;
            int sh, lp;
            if (sscanf(line, "master %f", &mv) == 1) master = mv;
            else if (sscanf(line, "%63s volume %f shuffle %d loop %d", id, &v, &sh, &lp) == 4)
                for (int i = 0; i < ns && i < 64; i++)
                    if (!strcmp(id, s[i].id)) vol[i] = v, shuffle[i] = sh, loop[i] = lp;
        }
        fclose(f);
    }
    rc_audio_master(master);
    for (int i = 0; i < ns && i < 64; i++) {
        char dir[1100], *files[256];
        int n = 0;
        snprintf(dir, sizeof dir, "%s/%s", root, s[i].id);
        mkdir(dir, 0755);   // so the player sees where each slot's files go
        DIR *d = opendir(dir);
        if (d) {
            for (struct dirent *e; (e = readdir(d)) && n < 256;) {
                if (e->d_name[0] == '.') continue;
                snprintf(path, sizeof path, "%s/%s", dir, e->d_name);
                struct stat st;
                if (!stat(path, &st) && S_ISREG(st.st_mode)) files[n++] = strdup(path);
            }
            closedir(d);
        }
        qsort(files, n, sizeof *files, by_name);
        rc_audio_set(s[i].id, (const char *const *)files, n, shuffle[i], loop[i], vol[i]);
        for (int k = 0; k < n; k++) free(files[k]);
    }
}
#endif

void rc_audio_boot(void) {
#ifndef __EMSCRIPTEN__
    load_native();
#endif
}

void rc_audio_ui_open(void) {
#ifdef __EMSCRIPTEN__
    MAIN_THREAD_EM_ASM({ if (Module.rcAudioUI) Module.rcAudioUI.open(); });
#else
    rc_log("Audio: put your files in %s/audio/<slot>/ (and volumes in settings.txt); reloaded now", rc_write_dir);
    load_native();
#endif
}
