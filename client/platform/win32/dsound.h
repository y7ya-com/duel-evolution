// The DirectSound subset yaneSDK's CDirectSound / CSound / CStreamSound and mtknLib's streaming use (counted from
// the OpenJoey v2 sources), on SDL2 audio: one software mixer, S16 stereo out. Same names and signatures as
// dsound.h so the port is call for call. Not here: 3D sound, capture, IDirectSoundNotify (one streaming helper
// uses notifications; it can poll GetCurrentPosition instead), DuplicateSoundBuffer.
#pragma once
#include <cstdint>
#include <mutex>
#include <vector>

#include "../com.h"

#include "windows.h"
#include "mmsystem.h"

enum : HRESULT { DS_OK = 0, DSERR_BUFFERLOST = (HRESULT)0x88780096, DSERR_INVALIDPARAM = (HRESULT)0x80070057, DSERR_INVALIDCALL = (HRESULT)0x88780032,
                 DSERR_BADFORMAT = (HRESULT)0x88780064 };
enum : DWORD { DSBCAPS_PRIMARYBUFFER = 0x1, DSBCAPS_STATIC = 0x2, DSBCAPS_CTRLFREQUENCY = 0x20,
               DSBCAPS_CTRLPAN = 0x40, DSBCAPS_CTRLVOLUME = 0x80, DSBCAPS_LOCSOFTWARE = 0x8,
               DSBCAPS_STICKYFOCUS = 0x4000, DSBCAPS_GLOBALFOCUS = 0x8000, DSBCAPS_GETCURRENTPOSITION2 = 0x10000 };
enum : DWORD { DSBFREQUENCY_ORIGINAL = 0, DSBFREQUENCY_MIN = 100, DSBFREQUENCY_MAX = 100000 };
enum : DWORD { DSBPLAY_LOOPING = 1 };
enum : DWORD { DSBSTATUS_PLAYING = 1, DSBSTATUS_BUFFERLOST = 2, DSBSTATUS_LOOPING = 4 };
enum : DWORD { DSBLOCK_FROMWRITECURSOR = 1, DSBLOCK_ENTIREBUFFER = 2 };
enum : DWORD { DSSCL_NORMAL = 1, DSSCL_PRIORITY = 2 };
enum : LONG { DSBVOLUME_MIN = -10000, DSBVOLUME_MAX = 0, DSBPAN_LEFT = -10000, DSBPAN_RIGHT = 10000 };

struct DSBUFFERDESC {
    DWORD dwSize, dwFlags, dwBufferBytes, dwReserved;
    WAVEFORMATEX* lpwfxFormat;   // NULL for the primary buffer
};

class IDirectSound;

class IDirectSoundBuffer : public ComObject {
public:
    HRESULT QueryInterface(REFIID iid, void** out);
    HRESULT GetCurrentPosition(DWORD* play, DWORD* write);
    HRESULT GetFormat(WAVEFORMATEX* fmt, DWORD size, DWORD* written);
    HRESULT GetVolume(LONG* v);
    HRESULT GetPan(LONG* p);
    HRESULT GetFrequency(DWORD* f);
    HRESULT GetStatus(DWORD* status);
    HRESULT Lock(DWORD offset, DWORD bytes, void** p1, DWORD* n1, void** p2, DWORD* n2, DWORD flags);
    HRESULT Unlock(void* /*p1*/, DWORD /*n1*/, void* /*p2*/, DWORD /*n2*/) { return DS_OK; }
    HRESULT Play(DWORD reserved, DWORD priority, DWORD flags);
    HRESULT SetCurrentPosition(DWORD pos);
    HRESULT SetFormat(const WAVEFORMATEX* fmt);   // primary buffer: accepted, the mixer's format stays
    HRESULT SetVolume(LONG v);                    // hundredths of a dB, -10000..0
    HRESULT SetPan(LONG p);                       // -10000 (left) .. 10000 (right)
    HRESULT SetFrequency(DWORD f);                // 0 = the format's own rate
    HRESULT Stop();
    HRESULT Restore() { return DS_OK; }           // never lost

    // implementation (the mixer reads these under ds->lock)
    IDirectSound* ds = nullptr;
    bool primary = false;
    WAVEFORMATEX fmt{};
    std::vector<uint8_t> data;
    double pos = 0;          // play position in frames
    DWORD freq = 0;
    LONG volume = 0, pan = 0;
    bool playing = false, looping = false;
    ~IDirectSoundBuffer() override;
};

class IDirectSound : public ComObject {
public:
    HRESULT Initialize(LPCGUID device);   // CoCreateInstance(CLSID_DirectSound) path: opens the SDL device
    HRESULT QueryInterface(REFIID iid, void** out);
    HRESULT SetCooperativeLevel(HWND /*window*/, DWORD /*level*/) { return DS_OK; }
    HRESULT CreateSoundBuffer(const DSBUFFERDESC* desc, IDirectSoundBuffer** out, void* unkOuter);
    // ponytail: the duplicate copies the samples instead of sharing them; yaneSDK duplicates only after loading
    HRESULT DuplicateSoundBuffer(IDirectSoundBuffer* src, IDirectSoundBuffer** out);

    // implementation
    explicit IDirectSound(int rate) : rate(rate) {}
    void open();                          // the SDL device (Initialize / DirectSoundCreate)
    ~IDirectSound() override;
    void mix(int16_t* out, int frames);   // interleaved stereo; the SDL audio callback calls this
    int rate;
    uint32_t device = 0;                  // SDL_AudioDeviceID, 0 = no device (tests)
    void* web = nullptr;                  // web: the ring the AudioWorklet plays (platform/audio/dsound.cpp)
    // open() found no device (Node, a machine without audio): the mixer runs on the wall clock into nothing, so
    // buffers still reach their end and the game doesn't wait forever on a sound. Tests never open().
    bool silent = false;
    uint32_t silentAt = 0;                // platformTimeMs() mixed up to
    void catchUp();
    LONG masterVolume = 0;                // the primary buffer's SetVolume
    std::recursive_mutex lock;
    std::vector<IDirectSoundBuffer*> buffers;
};

// Opens the default SDL audio device (44.1 kHz, S16 stereo). On a machine without audio it still succeeds and
// stays silent, as the game copes with silence better than with a failed init.
HRESULT DirectSoundCreate(const void* guid, IDirectSound** out, void* unkOuter);

typedef IDirectSound* LPDIRECTSOUND;
typedef IDirectSoundBuffer* LPDIRECTSOUNDBUFFER;
typedef DSBUFFERDESC* LPDSBUFFERDESC;
typedef const DSBUFFERDESC* LPCDSBUFFERDESC;
extern const GUID CLSID_DirectSound, IID_IDirectSound;
