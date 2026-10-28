#include <dsound.h>

#include <SDL.h>

#include "platform.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <emscripten/threading.h>
#include <pthread.h>
#include <unistd.h>
#endif

#include <cmath>
#include <cstdlib>
#include <cstring>

#ifdef __EMSCRIPTEN__
// web: the ring the AudioWorklet plays (web_mixer below); indices are wrapping frame counters, the size a power of two
static const int WEB_FRAMES = 1 << 15, WEB_CHUNK = 256;   // ring: 0.68 s at 48 kHz
static const double WEB_AHEAD = 0.15;                       // seconds kept buffered
struct WebRing { int32_t write, read, running, stop, underruns, pad[3]; float data[2 * WEB_FRAMES]; };   // web/sfx.js
#endif

static const bool trace = getenv("YO2_SOUND_TRACE");   // YO2_SOUND_TRACE=1: log device open/close and every Play

static float gain(LONG hundredthsDb) { return hundredthsDb <= DSBVOLUME_MIN ? 0.f : powf(10.f, hundredthsDb / 2000.f); }

// ---------------------------------------------------------------- buffer

IDirectSoundBuffer::~IDirectSoundBuffer() {
    std::lock_guard<std::recursive_mutex> l(ds->lock);
    for (size_t i = 0; i < ds->buffers.size(); i++)
        if (ds->buffers[i] == this) ds->buffers.erase(ds->buffers.begin() + i);
    ds->Release();
}

static DWORD frameBytes(const IDirectSoundBuffer* b) { return b->fmt.nBlockAlign ? b->fmt.nBlockAlign : 1; }

HRESULT IDirectSoundBuffer::GetCurrentPosition(DWORD* play, DWORD* write) {
    std::lock_guard<std::recursive_mutex> l(ds->lock);
    ds->catchUp();
    DWORD p = primary ? 0 : (DWORD)pos * frameBytes(this);
    if (play) *play = p;
    // DirectSound keeps the write cursor a little ahead of the play cursor while playing (~10 ms here)
    DWORD ahead = playing && !data.empty() ? (fmt.nAvgBytesPerSec / 100 / frameBytes(this)) * frameBytes(this) : 0;
    if (write) *write = data.empty() ? 0 : (DWORD)((p + ahead) % data.size());
    return DS_OK;
}

HRESULT IDirectSoundBuffer::GetFormat(WAVEFORMATEX* f, DWORD size, DWORD* written) {
    if (f && size >= sizeof fmt) *f = fmt;
    if (written) *written = sizeof fmt;
    return DS_OK;
}

HRESULT IDirectSoundBuffer::GetVolume(LONG* v) { return v ? (*v = primary ? ds->masterVolume : volume, DS_OK) : DSERR_INVALIDPARAM; }
HRESULT IDirectSoundBuffer::GetPan(LONG* p) { return p ? (*p = pan, DS_OK) : DSERR_INVALIDPARAM; }

HRESULT IDirectSoundBuffer::GetFrequency(DWORD* f) {
    if (!f) return DSERR_INVALIDPARAM;
    *f = freq ? freq : fmt.nSamplesPerSec;
    return DS_OK;
}

HRESULT IDirectSoundBuffer::GetStatus(DWORD* s) {
    if (!s) return DSERR_INVALIDPARAM;
    std::lock_guard<std::recursive_mutex> l(ds->lock);
    ds->catchUp();
    *s = (playing ? DSBSTATUS_PLAYING : 0) | (playing && looping ? DSBSTATUS_LOOPING : 0);
    return DS_OK;
}

HRESULT IDirectSoundBuffer::Lock(DWORD off, DWORD bytes, void** p1, DWORD* n1, void** p2, DWORD* n2, DWORD flags) {
    if (primary || data.empty() || !p1 || !n1) return DSERR_INVALIDCALL;
    DWORD size = (DWORD)data.size();
    if (flags & DSBLOCK_FROMWRITECURSOR) GetCurrentPosition(nullptr, &off);
    if (flags & DSBLOCK_ENTIREBUFFER) bytes = size;
    if (off >= size || bytes > size) return DSERR_INVALIDPARAM;
    *p1 = data.data() + off;
    *n1 = bytes < size - off ? bytes : size - off;
    if (p2) *p2 = bytes > *n1 ? data.data() : nullptr;
    if (n2) *n2 = bytes - *n1;
    return DS_OK;
}

HRESULT IDirectSoundBuffer::Play(DWORD, DWORD, DWORD flags) {
    if (trace) SDL_Log("dsound: Play %u bytes, %u Hz, %u ch%s", (unsigned)data.size(), (unsigned)fmt.nSamplesPerSec,
                       (unsigned)fmt.nChannels, flags & DSBPLAY_LOOPING ? ", looping" : "");
    std::lock_guard<std::recursive_mutex> l(ds->lock);
    playing = true;
    looping = flags & DSBPLAY_LOOPING;
    return DS_OK;
}

HRESULT IDirectSoundBuffer::SetCurrentPosition(DWORD p) {
    if (primary) return DSERR_INVALIDCALL;
    std::lock_guard<std::recursive_mutex> l(ds->lock);
    if (p >= data.size()) return DSERR_INVALIDPARAM;
    pos = p / frameBytes(this);
    return DS_OK;
}

HRESULT IDirectSoundBuffer::SetFormat(const WAVEFORMATEX* f) { return primary && f ? DS_OK : DSERR_INVALIDCALL; }

HRESULT IDirectSoundBuffer::SetVolume(LONG v) {
    if (v < DSBVOLUME_MIN || v > DSBVOLUME_MAX) return DSERR_INVALIDPARAM;
    std::lock_guard<std::recursive_mutex> l(ds->lock);
    (primary ? ds->masterVolume : volume) = v;
    return DS_OK;
}

HRESULT IDirectSoundBuffer::SetPan(LONG p) {
    if (p < DSBPAN_LEFT || p > DSBPAN_RIGHT) return DSERR_INVALIDPARAM;
    std::lock_guard<std::recursive_mutex> l(ds->lock);
    pan = p;
    return DS_OK;
}

HRESULT IDirectSoundBuffer::SetFrequency(DWORD f) {
    if (f && (f < 100 || f > 200000)) return DSERR_INVALIDPARAM;
    std::lock_guard<std::recursive_mutex> l(ds->lock);
    freq = f;
    return DS_OK;
}

HRESULT IDirectSoundBuffer::Stop() {
    std::lock_guard<std::recursive_mutex> l(ds->lock);
    playing = false;   // the position stays where it stopped, as in DirectSound
    return DS_OK;
}

// ---------------------------------------------------------------- device

HRESULT IDirectSound::CreateSoundBuffer(const DSBUFFERDESC* d, IDirectSoundBuffer** out, void*) {
    if (!d || !out) return DSERR_INVALIDPARAM;
    IDirectSoundBuffer* b;
    if (d->dwFlags & DSBCAPS_PRIMARYBUFFER) {
        b = new IDirectSoundBuffer;
        b->primary = true;
        b->fmt = WAVEFORMATEX{1, 2, (uint32_t)rate, (uint32_t)rate * 4, 4, 16, 0};
    } else {
        const WAVEFORMATEX* f = d->lpwfxFormat;
        if (!f || f->wFormatTag != 1 || (f->nChannels != 1 && f->nChannels != 2) ||
            (f->wBitsPerSample != 8 && f->wBitsPerSample != 16) || !f->nSamplesPerSec)
            return DSERR_BADFORMAT;   // the game hands DirectSound PCM only (ACM/MP3 are decoded before)
        if (d->dwBufferBytes < 4 || d->dwBufferBytes > 0x0fffffff) return DSERR_INVALIDPARAM;
        b = new IDirectSoundBuffer;
        b->fmt = *f;
        b->fmt.nBlockAlign = (uint16_t)(f->nChannels * f->wBitsPerSample / 8);
        b->fmt.nAvgBytesPerSec = f->nSamplesPerSec * b->fmt.nBlockAlign;
        b->data.assign(d->dwBufferBytes / b->fmt.nBlockAlign * b->fmt.nBlockAlign,
                       f->wBitsPerSample == 8 ? 0x80 : 0);   // silence
    }
    b->ds = this;
    AddRef();   // a buffer keeps its device alive
    std::lock_guard<std::recursive_mutex> l(lock);
    buffers.push_back(b);
    *out = b;
    return DS_OK;
}

IDirectSound::~IDirectSound() {
    if (trace) SDL_Log("dsound: device released%s", device || web ? ", closing audio" : "");
    if (device) SDL_CloseAudioDevice(device);
#ifdef __EMSCRIPTEN__
    if (web) __atomic_store_n(&((WebRing*)web)->stop, 1, __ATOMIC_SEQ_CST);   // ponytail: the ring itself leaks
#endif
}

static float sample(const IDirectSoundBuffer* b, size_t frame, int ch) {
    const uint8_t* p = b->data.data() + frame * b->fmt.nBlockAlign + (b->fmt.nChannels == 2 ? ch : 0) *
                                                                         (b->fmt.wBitsPerSample / 8);
    if (b->fmt.wBitsPerSample == 8) return (p[0] - 128) * 256.f;
    int16_t v;
    memcpy(&v, p, 2);
    return v;
}

void IDirectSound::mix(int16_t* out, int frames) {
    std::vector<float> acc((size_t)frames * 2, 0.f);
    std::lock_guard<std::recursive_mutex> l(lock);
    float master = gain(masterVolume);
    for (IDirectSoundBuffer* b : buffers) {
        if (b->primary || !b->playing || b->data.empty()) continue;
        size_t n = b->data.size() / b->fmt.nBlockAlign;
        double step = (double)(b->freq ? b->freq : b->fmt.nSamplesPerSec) / rate;
        float g = gain(b->volume) * master;
        float gl = g * (b->pan > 0 ? gain(-b->pan) : 1.f), gr = g * (b->pan < 0 ? gain(b->pan) : 1.f);
        for (int i = 0; i < frames; i++) {
            size_t f0 = (size_t)b->pos;
            size_t f1 = f0 + 1 < n ? f0 + 1 : (b->looping ? 0 : f0);
            float t = (float)(b->pos - f0);   // linear interpolation between neighbouring frames
            acc[i * 2] += (sample(b, f0, 0) * (1 - t) + sample(b, f1, 0) * t) * gl;
            acc[i * 2 + 1] += (sample(b, f0, 1) * (1 - t) + sample(b, f1, 1) * t) * gr;
            b->pos += step;
            if (b->pos >= n) {
                if (b->looping) {
                    b->pos = fmod(b->pos, (double)n);
                } else {
                    b->playing = false;   // a one-shot that ran out stops and rewinds
                    b->pos = 0;
                    break;
                }
            }
        }
    }
    for (int i = 0; i < frames * 2; i++) {
        float v = acc[i];
        out[i] = (int16_t)(v > 32767.f ? 32767 : v < -32768.f ? -32768 : lrintf(v));
    }
}

void IDirectSound::catchUp() {
    if (!silent) return;
    uint32_t now = platformTimeMs();
    int frames = (int)((uint64_t)(now - silentAt) * rate / 1000);
    if (frames <= 0) return;
    silentAt = now;
    static int16_t scratch[2 * 4096];
    for (; frames > 0; frames -= 4096) mix(scratch, frames < 4096 ? frames : 4096);
}

#ifdef __EMSCRIPTEN__
// Web: the sound effects play through an AudioWorklet (web/sfx.js) that reads a ring of mixed audio in the wasm heap
// (shared memory); a mixer pthread keeps it WEB_AHEAD ahead. A stall of the page's main thread (a synchronous file
// load) then doesn't touch the output: SDL's Emscripten audio mixed in a ScriptProcessor on the main thread, so a
// stall starved it and the browser replayed stale buffers. On an underrun the worklet fades to silence, never repeats.
// Until the context runs (the page's first gesture, autoplay rules) the mixer runs on the clock into nothing, so
// sounds still end.

static void* web_mixer(void* p) {
    IDirectSound* ds = (IDirectSound*)p;
    WebRing* r = (WebRing*)ds->web;
    const int ahead = (int)(ds->rate * WEB_AHEAD);
    int16_t buf[2 * WEB_CHUNK];
    uint32_t clock = platformTimeMs();
    while (!__atomic_load_n(&r->stop, __ATOMIC_SEQ_CST)) {
        if (!__atomic_load_n(&r->running, __ATOMIC_SEQ_CST)) {   // not playing yet: on the clock, into nothing
            uint32_t now = platformTimeMs();
            int n = (int)((uint64_t)(now - clock) * ds->rate / 1000);
            if (n > 0) {
                clock = now;
                for (; n > 0; n -= WEB_CHUNK) ds->mix(buf, n < WEB_CHUNK ? n : WEB_CHUNK);
            }
            usleep(10000);
            continue;
        }
        clock = platformTimeMs();
        uint32_t w = (uint32_t)__atomic_load_n(&r->write, __ATOMIC_SEQ_CST);
        int avail = (int)(w - (uint32_t)__atomic_load_n(&r->read, __ATOMIC_SEQ_CST));
        if (avail >= ahead) {
            usleep(2000);
            continue;
        }
        int n = ahead - avail < WEB_CHUNK ? ahead - avail : WEB_CHUNK;
        ds->mix(buf, n);
        for (int i = 0; i < n; i++) {
            uint32_t j = (w + (uint32_t)i) & (WEB_FRAMES - 1);
            r->data[j * 2] = buf[i * 2] / 32768.f;
            r->data[j * 2 + 1] = buf[i * 2 + 1] / 32768.f;
        }
        __atomic_store_n(&r->write, (int32_t)(w + (uint32_t)n), __ATOMIC_SEQ_CST);
    }
    return nullptr;
}
#endif

static void callback(void* user, Uint8* stream, int len) { ((IDirectSound*)user)->mix((int16_t*)stream, len / 4); }

void IDirectSound::open() {
    if (device || silent) return;
    const char* env = getenv("YO2_SOUND");
    if (env && *env == '0') {   // sound off: mix on the clock into nothing, so the game times exactly as with sound
        silent = true;
        silentAt = platformTimeMs();
        return;
    }
#ifdef __EMSCRIPTEN__
    WebRing* r = (WebRing*)calloc(1, sizeof(WebRing));
    int sr = r ? MAIN_THREAD_EM_ASM_INT({ return Module['yo2Sfx'] ? Module['yo2Sfx'].open($0, $1) : 0; }, r, WEB_FRAMES) : 0;
    pthread_t t;
    if (sr > 0) {
        rate = sr;
        web = r;
        if (!pthread_create(&t, nullptr, web_mixer, this)) {
            pthread_detach(t);
            SDL_Log("dsound: AudioWorklet, %d Hz, %d ms ahead", rate, (int)(WEB_AHEAD * 1000));
            return;
        }
        web = nullptr;
    }
    free(r);
    SDL_Log("dsound: no AudioWorklet; mixing silently on the clock");
    silent = true;
    silentAt = platformTimeMs();
#else
    if (!SDL_WasInit(SDL_INIT_AUDIO)) SDL_InitSubSystem(SDL_INIT_AUDIO);
    SDL_AudioSpec want{}, have{};
    want.freq = 44100;
    want.format = AUDIO_S16SYS;
    want.channels = 2;
    want.samples = 1024;   // ~23 ms
    want.callback = callback;
    want.userdata = this;
    device = SDL_OpenAudioDevice(nullptr, 0, &want, &have, SDL_AUDIO_ALLOW_FREQUENCY_CHANGE);
    if (device) {
        rate = have.freq;
        SDL_Log("dsound: %s audio, %d Hz", SDL_GetCurrentAudioDriver(), rate);
        SDL_PauseAudioDevice(device, 0);
    } else {
        SDL_Log("dsound: no audio device (%s); mixing silently on the clock", SDL_GetError());
        silent = true;
        silentAt = platformTimeMs();
    }
#endif
}

HRESULT IDirectSound::Initialize(LPCGUID) {
    open();
    return DS_OK;
}

HRESULT IDirectSound::QueryInterface(REFIID, void** out) {
    AddRef();
    *out = this;
    return DS_OK;
}

HRESULT IDirectSoundBuffer::QueryInterface(REFIID, void** out) {
    AddRef();
    *out = this;
    return DS_OK;
}

HRESULT IDirectSound::DuplicateSoundBuffer(IDirectSoundBuffer* src, IDirectSoundBuffer** out) {
    if (!src || !out || src->primary) return DSERR_INVALIDPARAM;
    IDirectSoundBuffer* b = new IDirectSoundBuffer;
    b->fmt = src->fmt;
    b->data = src->data;
    b->freq = src->freq;
    b->volume = src->volume;
    b->pan = src->pan;
    b->ds = this;
    AddRef();
    std::lock_guard<std::recursive_mutex> l(lock);
    buffers.push_back(b);
    *out = b;
    return DS_OK;
}

HRESULT DirectSoundCreate(const void*, IDirectSound** out, void*) {
    if (!out) return DSERR_INVALIDPARAM;
    IDirectSound* ds = new IDirectSound(44100);
    ds->open();
    *out = ds;
    return DS_OK;
}
