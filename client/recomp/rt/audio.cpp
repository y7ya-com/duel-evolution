// Background audio slots: the game's own background audio (data/etc/bgm.txt, ids 0x20000000 + n) never plays from
// Sound.dat; request n selects slot n, which plays the player's files for it, or nothing (the default). Sound
// effects (ids 0x10000000 + n) are untouched: they keep the recompiled DirectSound path. The 46 slots and where the
// game asks for each: recomp/audio-slots.md. Settings: rt/audioui.c (native folders) and web/audiopage.js.
//
// The game's sound manager (yaneSDK CBGMLoader) routes background ids through four internals, each reached from one
// place, overridden here (all cdecl):
//   0x00688380 play(uint *id, int *fadeFrames, 0)   <- 0x00686560 play(id, fade) for id>>28 == 2
//   0x00688590 isBackground(uint *id)               <- 0x006866a0 stop(id, fade): picks the background branch
//   0x00688460 stop(uint *id, int *fadeFrames)       <- 0x006866a0
//   0x006884f0 stopAll(int *fadeFrames)              <- 0x00686780 stopAll(fade) (the effects half stays)
// The real background player is never started, so its state (0x127dfe4..) stays idle; nothing outside the player
// polls it (the per-frame update 0x006863a0 and the volume setter 0x006863d0 only touch the player).
//
// Web: web/audio.js decides and plays (only the browser decodes mp3/ogg/m4a); requests go there as they are.
// Native: the same rules here, for rt/audioslots.h (fed by rt/audioui.c), decoded by AudioToolbox (mp3, m4a/aac,
// wav, aiff, flac) on macOS or SDL_LoadWAV elsewhere, mixed on its own SDL device. Empty slots: "winning", "pinch"
// and the field spells keep the duel's own audio; the summon jingles keep what plays.
// YO2_SOUND=0 turns this off too; YO2_SOUND_TRACE=1 logs every request; YO2_AUDIO_DUMP=<file> (native) writes the
// mixed output there (f32 stereo, 44.1 kHz) for headless checks.
extern "C" {
#include "audioslots.h"
#include "rt.h"
}
#include <stdlib.h>

enum { PLAY = 1, STOP = 2, STOP_ALL = 3 };
static const bool trace = getenv("YO2_SOUND_TRACE");
static const bool off = getenv("YO2_SOUND") && *getenv("YO2_SOUND") == '0';

#ifdef __EMSCRIPTEN__
#include <emscripten.h>

static void request(int slot, int action, int fade) {
    if (trace) rc_log("audio: game %s %d", action == PLAY ? "play" : action == STOP ? "stop" : "stop all", slot);
    if (!off)
        MAIN_THREAD_ASYNC_EM_ASM({ var a = Module['yo2Audio']; if (a && a['_game']) a['_game']($0, $1, $2); }, slot, action, fade);
}
#else
#include <SDL.h>
#include <pthread.h>
#include <stdio.h>
#include <string.h>
#include <algorithm>
#include <mutex>
#include <random>
#include <string>
#include <vector>
#ifdef __APPLE__
#include <AudioToolbox/AudioToolbox.h>
#endif

namespace {
// bgm.txt's 46 lines; the ids match web/audio.js (the player's folders are named after them)
const RcAudioSlot kSlots[] = {
    {"title", "Title", "The title screen"}, {"deck_editor", "Deck editor", "Editing decks, trades and gifts"},
    {"card_pack", "Card packs", "Opening card packs"}, {"login", "Login", "Logging in and the notice pages"},
    {"my_room", "My Room", "Your room and its menus"}, {"yugi_area", "Yugi area", "The Yugi area map and its shops"},
    {"gx_area", "GX area", "The Duel Academy map and its shops"}, {"event_lobby", "Event lobby", "Event lobbies"},
    {"tournament_lobby", "Tournament lobby", "Tournament lobbies"}, {"event", "Event", "Events"},
    {"janken", "Rock-paper-scissors", "Deciding who goes first"},
    {"duel_1", "Duel 1", "A duel"}, {"duel_2", "Duel 2", "A duel"}, {"duel_3", "Duel 3", "A duel"},
    {"duel_4", "Duel 4", "A duel"}, {"duel_5", "Duel 5", "A duel"}, {"duel_6", "Duel 6", "A duel"},
    {"duel_7", "Duel 7", "A duel"}, {"duel_8", "Duel 8", "A duel"},
    {"duel_tournament_1", "Tournament duel 1", "Tournament and event duels"},
    {"duel_tournament_2", "Tournament duel 2", "Tournament and event duels"},
    {"ritual", "Ritual summon", "A short jingle"}, {"summon_1", "Summon 1", "A short jingle"},
    {"summon_2", "Summon 2", "A short jingle"},
    {"duel_winning", "Winning", "When you lead by 3000 LP or more"},
    {"duel_pinch", "Pinch", "When you trail by 3000 LP or more"},
    {"duel_draw", "Draw", "After a drawn duel"}, {"duel_lose", "Lose", "After a duel you lost"},
    {"duel_win", "Win", "After a duel you won"}, {"updater", "Updater", "While the game checks for updates"},
    {"field_yami", "Yami", "Field spell"}, {"field_umi", "Umi", "Field spell"},
    {"field_mountain", "Mountain", "Field spell"}, {"field_sogen", "Sogen", "Field spell"},
    {"field_forest", "Forest", "Field spell"}, {"field_wasteland", "Wasteland", "Field spell"},
    {"field_fusion_gate", "Fusion Gate", "Field spell"}, {"field_gaia_power", "Gaia Power", "Field spell"},
    {"field_umiiruka", "Umiiruka", "Field spell"}, {"field_luminous_spark", "Luminous Spark", "Field spell"},
    {"field_mystic_plasma_zone", "Mystic Plasma Zone", "Field spell"},
    {"field_rising_air_current", "Rising Air Current", "Field spell"},
    {"field_molten_destruction", "Molten Destruction", "Field spell"},
    {"field_chorus_of_sanctuary", "Chorus of Sanctuary", "Field spell"},
    {"field_skyscraper", "Skyscraper", "Field spell"}, {"field_other", "Other field spells", "Any field spell not listed"},
};
const int NSLOTS = sizeof kSlots / sizeof kSlots[0];
bool duel_base(int s) { return s >= 10 && s <= 20; }
bool jingle(int s) { return s >= 21 && s <= 23; }
bool duel_layer(int s) { return s == 24 || s == 25 || (s >= 30 && s <= 45); }

struct Cfg { std::vector<std::string> files; bool shuffle = false, loop = true; float volume = 1; };
std::recursive_mutex mu;   // settings come from the main thread, requests from guest threads
Cfg cfg[NSLOTS];
int game = -1, duelBase = -1, preview = -1, playing = -1;   // the game's slot, ..., what the mixer plays

bool has(int s) { return s >= 0 && s < NSLOTS && !cfg[s].files.empty(); }
int resolve(int s) { return has(s) ? s : duel_layer(s) && has(duelBase) ? duelBase : -1; }
int find(const char* id) {
    for (int i = 0; i < NSLOTS; i++)
        if (!strcmp(id, kSlots[i].id)) return i;
    return -1;
}

// ---- mixer: a voice plays one decoded file (float stereo at RATE); a new slot fades in while the old one fades
// out. Its playlist (files in play order) advances on the worker thread when a file ends.
const int RATE = 44100;
struct Voice {
    std::vector<float> pcm;
    size_t pos = 0;
    float gain = 0, target = 0, step = 0;
    std::vector<std::string> list;
    size_t item = 0;
    bool loop = false, shuffle = false, ended = false;
    unsigned gen = 0;
};
Voice voices[2];
int active = -1;   // the voice of the slot that plays
unsigned generation;
float masterGain = 1;
SDL_AudioDeviceID dev;
pthread_mutex_t jobMu = PTHREAD_MUTEX_INITIALIZER;
pthread_cond_t jobCv = PTHREAD_COND_INITIALIZER;
bool wake;

void fade_to(Voice& v, float target, double secs) {
    v.target = target;
    v.step = (target - v.gain) / (float)(secs * RATE > 1 ? secs * RATE : 1);
}
void signal_worker() {
    pthread_mutex_lock(&jobMu);
    wake = true;
    pthread_cond_signal(&jobCv);
    pthread_mutex_unlock(&jobMu);
}

void mix(void*, Uint8* out, int len) {
    float* o = (float*)out;
    int frames = len / 8;
    memset(out, 0, len);
    for (Voice& v : voices) {
        if (v.pcm.empty()) continue;
        size_t n = v.pcm.size() / 2;
        bool single = v.list.size() == 1;
        for (int i = 0; i < frames; i++) {
            if (v.gain != v.target) {
                v.gain += v.step;
                if ((v.step > 0) == (v.gain > v.target)) v.gain = v.target;
            }
            o[i * 2] += v.pcm[v.pos * 2] * v.gain * masterGain;
            o[i * 2 + 1] += v.pcm[v.pos * 2 + 1] * v.gain * masterGain;
            if (++v.pos >= n) {
                v.pos = 0;
                if (single && v.loop) continue;   // one file looping: seamless
                v.pcm.clear();                    // the playlist's next file comes from the worker
                v.ended = true;
                signal_worker();
                break;
            }
        }
        if (v.gain <= 0 && v.target <= 0) v.pcm.clear(), v.list.clear();   // faded out
    }
    static FILE* dump = getenv("YO2_AUDIO_DUMP") ? fopen(getenv("YO2_AUDIO_DUMP"), "wb") : nullptr;
    if (dump) fwrite(out, 1, len, dump);
}

std::vector<float> decode(const std::string& path) {
    std::vector<float> pcm;
#ifdef __APPLE__
    CFURLRef url = CFURLCreateFromFileSystemRepresentation(nullptr, (const UInt8*)path.c_str(), path.size(), false);
    ExtAudioFileRef f = nullptr;
    OSStatus err = ExtAudioFileOpenURL(url, &f);
    CFRelease(url);
    if (!err) {
        AudioStreamBasicDescription fmt = {};   // float stereo at our rate: AudioToolbox decodes and resamples
        fmt.mSampleRate = RATE;
        fmt.mFormatID = kAudioFormatLinearPCM;
        fmt.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked;
        fmt.mChannelsPerFrame = 2;
        fmt.mBitsPerChannel = 32;
        fmt.mFramesPerPacket = 1;
        fmt.mBytesPerFrame = fmt.mBytesPerPacket = 8;
        if (!ExtAudioFileSetProperty(f, kExtAudioFileProperty_ClientDataFormat, sizeof fmt, &fmt)) {
            float buf[2 * 8192];
            for (;;) {
                AudioBufferList bl = {1, {{2, sizeof buf, buf}}};
                UInt32 frames = 8192;
                if (ExtAudioFileRead(f, &frames, &bl) || !frames) break;
                pcm.insert(pcm.end(), buf, buf + frames * 2);
            }
        }
        ExtAudioFileDispose(f);
    }
#else
    SDL_AudioSpec spec;
    Uint8* data;
    Uint32 len;
    if (SDL_LoadWAV(path.c_str(), &spec, &data, &len)) {
        SDL_AudioCVT cvt;
        if (SDL_BuildAudioCVT(&cvt, spec.format, spec.channels, spec.freq, AUDIO_F32SYS, 2, RATE) >= 0) {
            std::vector<Uint8> tmp(len * (cvt.len_mult > 0 ? cvt.len_mult : 1));
            memcpy(tmp.data(), data, len);
            cvt.buf = tmp.data();
            cvt.len = (int)len;
            if (!SDL_ConvertAudio(&cvt)) pcm.assign((float*)tmp.data(), (float*)tmp.data() + cvt.len_cvt / 4);
        }
        SDL_FreeWAV(data);
    }
#endif
    if (pcm.empty()) rc_log("audio: cannot decode %s", path.c_str());
    else if (trace) rc_log("audio: %s, %.1f s", path.c_str(), pcm.size() / 2.0 / RATE);
    return pcm;
}

// The worker decodes off the game's thread: a voice waiting for its first or next file gets it. A non-looping
// playlist ends after its last file; a looping one starts over (reshuffled).
void* worker(void*) {
    for (;;) {
        pthread_mutex_lock(&jobMu);
        while (!wake) pthread_cond_wait(&jobCv, &jobMu);
        wake = false;
        pthread_mutex_unlock(&jobMu);
        for (Voice& v : voices) {
            SDL_LockAudioDevice(dev);
            bool want = !v.list.empty() && v.pcm.empty() && v.target > 0;
            if (want && v.ended) {
                v.ended = false;
                if (++v.item >= v.list.size()) {
                    v.item = 0;
                    if (!v.loop) v.list.clear(), want = false;
                    else if (v.shuffle) std::shuffle(v.list.begin(), v.list.end(), std::mt19937(SDL_GetTicks()));
                }
            }
            std::string path = want ? v.list[v.item] : "";
            unsigned gen = v.gen;
            SDL_UnlockAudioDevice(dev);
            if (!want) continue;
            std::vector<float> pcm = decode(path);
            SDL_LockAudioDevice(dev);
            bool skip = pcm.empty() && v.gen == gen && !v.list.empty();
            if (v.gen == gen && !v.list.empty()) {
                if (pcm.empty()) v.ended = true;   // skip a file that won't decode
                else v.pcm.swap(pcm), v.pos = 0;
            }
            SDL_UnlockAudioDevice(dev);
            if (skip) signal_worker();
        }
    }
    return nullptr;
}

bool open_device() {
    if (dev) return true;
    if (!SDL_WasInit(SDL_INIT_AUDIO) && SDL_InitSubSystem(SDL_INIT_AUDIO)) return false;
    SDL_AudioSpec want = {}, have;
    want.freq = RATE;
    want.format = AUDIO_F32SYS;
    want.channels = 2;
    want.samples = 2048;
    want.callback = mix;
    dev = SDL_OpenAudioDevice(nullptr, 0, &want, &have, 0);
    if (!dev) return false;
    pthread_t t;
    pthread_create(&t, nullptr, worker, nullptr);
    pthread_detach(t);
    SDL_PauseAudioDevice(dev, 0);
    return true;
}

void play(int slot, double secs) {   // crossfade from what plays to `slot`'s files (nothing when -1)
    playing = slot;
    if (off || (!dev && slot < 0) || !open_device()) return;
    SDL_LockAudioDevice(dev);
    generation++;
    for (Voice& v : voices) fade_to(v, 0, secs);
    active = -1;
    if (slot >= 0) {
        int k = voices[0].pcm.empty() && voices[0].list.empty() ? 0 : 1;   // a third overlap cuts the older one
        Voice& v = voices[k];
        v = Voice();
        v.list = cfg[slot].files;
        v.loop = cfg[slot].loop;
        v.shuffle = cfg[slot].shuffle;
        if (v.shuffle) std::shuffle(v.list.begin(), v.list.end(), std::mt19937(SDL_GetTicks()));
        v.gen = generation;
        fade_to(v, cfg[slot].volume, secs);
        active = k;
    }
    SDL_UnlockAudioDevice(dev);
    if (slot >= 0) signal_worker();
}
void update(double secs, bool restart = false) {
    int want = preview >= 0 ? preview : resolve(game);
    if (want != playing || restart) play(want, secs);
}
}  // namespace

static void request(int slot, int action, int fade) {   // the same rules as web/audio.js game()
    std::lock_guard<std::recursive_mutex> l(mu);
    if (trace) rc_log("audio: game %s %d", action == PLAY ? "play" : action == STOP ? "stop" : "stop all", slot);
    if (action == PLAY && jingle(slot) && !has(slot)) return;   // an empty jingle: what plays goes on
    if (action == PLAY && slot == game) return;
    if (action == STOP && slot != game) return;   // stop(id) only stops what plays, as the original
    game = action == PLAY ? slot : -1;
    if (duel_base(game)) duelBase = game;
    update((fade > 15 ? fade : 15) / 60.0);   // the game's fades are 60 fps frames; 0.25 s at least
}

extern "C" int rc_audio_list_slots(const RcAudioSlot** out) {
    *out = kSlots;
    return NSLOTS;
}
extern "C" void rc_audio_set(const char* slot, const char* const* paths, int n, int shuffle, int loop, float volume) {
    std::lock_guard<std::recursive_mutex> l(mu);
    int s = find(slot);
    if (s < 0) return;
    Cfg c;
    c.files.assign(paths, paths + n);
    c.shuffle = shuffle;
    c.loop = loop;
    c.volume = volume;
    bool onlyVolume = c.files == cfg[s].files && c.shuffle == cfg[s].shuffle && c.loop == cfg[s].loop;
    cfg[s] = c;
    if (trace && n) rc_log("audio: slot %s = %d file(s), volume %.2f", slot, n, volume);
    if (onlyVolume) {   // a volume drag: no restart
        if (s == playing && dev) {
            SDL_LockAudioDevice(dev);
            if (active >= 0) fade_to(voices[active], volume, 0.05);
            SDL_UnlockAudioDevice(dev);
        }
        return;
    }
    update(0.5, s == playing);   // restarts the slot if it plays; starts it if it now should
}
extern "C" void rc_audio_master(float volume) {
    if (dev) SDL_LockAudioDevice(dev);
    masterGain = volume;
    if (dev) SDL_UnlockAudioDevice(dev);
}
extern "C" void rc_audio_preview(const char* slot, int on) {
    std::lock_guard<std::recursive_mutex> l(mu);
    int s = find(slot);
    if (on && s >= 0) preview = s;
    else if (!on && preview == s) preview = -1;
    update(0.3);
}
#endif

// 0x00688380(uint *id, int *fadeFrames, 0): play background id; the caller returns this to the game as "playing"
extern "C" void f_00688380(CPU* c) {
    request((int)(RD32m(ARG(0)) & 0x0fffffff), PLAY, (int)RD32m(ARG(1)));
    RETC(0x127dfe4u);   // the original returns the player record's address on success
}
// 0x00688590(uint *id): stop() asks whether the id is background audio (the original looks it up in bgm.txt's table)
extern "C" void f_00688590(CPU* c) { RETC((RD32m(ARG(0)) >> 28) == 2); }
// 0x00688460(uint *id, int *fadeFrames): stop that background id
extern "C" void f_00688460(CPU* c) {
    request((int)(RD32m(ARG(0)) & 0x0fffffff), STOP, (int)RD32m(ARG(1)));
    RETC(1);
}
// 0x006884f0(int *fadeFrames): stop all background audio
extern "C" void f_006884f0(CPU* c) {
    request(-1, STOP_ALL, (int)RD32m(ARG(0)));
    RETC(1);
}
