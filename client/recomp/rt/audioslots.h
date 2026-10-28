// Background audio slots: the player's own files per context (title, My Room, lobby, ...); the game ships none.
// Playback (which slot is active, decode, shuffle/loop, mixing beside the SFX) implements these; the settings
// (rt/audioui.c: the Main Menu's Audio page, native settings file, web IndexedDB) only call them.
#pragma once

typedef struct {
    const char *id;     // stable key: "title", "myroom", ...
    const char *name;   // user-facing ("audio", never "music")
    const char *desc;   // where it plays
} RcAudioSlot;

int rc_audio_list_slots(const RcAudioSlot **out);   // the static slot table; returns its length
// The slot's files (host paths), applied live (restarts it if it is the one playing); n = 0 clears it
void rc_audio_set(const char *slot, const char *const *paths, int n, int shuffle, int loop, float volume);
void rc_audio_master(float volume);                // 0..1
void rc_audio_preview(const char *slot, int play);  // play / stop that slot now, whatever the scene

void rc_audio_ui_open(void);   // the Main Menu's Audio entry (rt/audioui.c)
void rc_audio_boot(void);      // native: load <YO2_WRITE>/audio once the window is up (rt/audioui.c)
