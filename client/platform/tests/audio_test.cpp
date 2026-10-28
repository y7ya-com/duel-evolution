// DirectSound-subset mixer checks, without an audio device: build buffers, call the mixer, look at the samples.
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "dsound.h"

static int failures;

static void check(bool ok, const char* what) {
    printf("%s %s\n", ok ? "ok  " : "FAIL", what);
    if (!ok) failures++;
}

static IDirectSoundBuffer* buffer(IDirectSound* ds, int channels, int bits, int rate, int frames, int value) {
    WAVEFORMATEX f{1, (uint16_t)channels, (uint32_t)rate, 0, 0, (uint16_t)bits, 0};
    DSBUFFERDESC d{sizeof d, DSBCAPS_CTRLVOLUME | DSBCAPS_CTRLPAN | DSBCAPS_CTRLFREQUENCY,
                   (DWORD)(frames * channels * bits / 8), 0, &f};
    IDirectSoundBuffer* b = nullptr;
    ds->CreateSoundBuffer(&d, &b, nullptr);
    void *p1, *p2;
    DWORD n1, n2;
    b->Lock(0, 0, &p1, &n1, &p2, &n2, DSBLOCK_ENTIREBUFFER);
    for (DWORD i = 0; i < n1; i += bits / 8) {
        if (bits == 16) memcpy((uint8_t*)p1 + i, &value, 2);
        else ((uint8_t*)p1)[i] = (uint8_t)value;
    }
    b->Unlock(p1, n1, p2, n2);
    return b;
}

int main() {
    IDirectSound* ds = new IDirectSound(44100);
    int16_t out[2 * 512];

    IDirectSoundBuffer* a = buffer(ds, 1, 16, 22050, 1000, 1000);
    a->Play(0, 0, 0);
    ds->mix(out, 256);
    check(out[0] == 1000 && out[1] == 1000 && out[511] == 1000, "mono 22 kHz plays on both channels at 44.1 kHz");
    DWORD play, write;
    a->GetCurrentPosition(&play, &write);
    check(play == 128 * 2, "22 kHz buffer advanced 128 frames for 256 output frames");
    check(write > play, "write cursor runs ahead while playing");

    a->SetVolume(-2000);   // -20 dB = x0.1
    ds->mix(out, 4);
    check(out[0] == 100, "SetVolume(-2000) is -20 dB");
    a->SetVolume(0);
    a->SetPan(DSBPAN_LEFT);
    ds->mix(out, 4);
    check(out[0] == 1000 && out[1] == 0, "full-left pan silences the right channel");
    a->SetPan(0);

    // a one-shot runs out: silence after, status no longer playing, position rewound
    // (~130 of 1000 source frames played so far; 4 x 512 output frames at half speed = 1024 more)
    for (int i = 0; i < 4; i++) ds->mix(out, 512);
    DWORD status;
    a->GetStatus(&status);
    a->GetCurrentPosition(&play, nullptr);
    check(!(status & DSBSTATUS_PLAYING) && play == 0, "one-shot stops at the end and rewinds");
    check(out[1023] == 0, "silence after the end");

    // looping keeps going and wraps
    a->Play(0, 0, DSBPLAY_LOOPING);
    for (int i = 0; i < 10; i++) ds->mix(out, 512);
    a->GetStatus(&status);
    check((status & DSBSTATUS_PLAYING) && (status & DSBSTATUS_LOOPING) && out[1023] == 1000, "looping wraps");
    a->Stop();

    // 8-bit unsigned stereo, two buffers summed, clamped
    IDirectSoundBuffer* b = buffer(ds, 2, 8, 44100, 1000, 0xff);   // +127 -> 32512
    IDirectSoundBuffer* c = buffer(ds, 2, 8, 44100, 1000, 0xff);
    b->Play(0, 0, 0);
    ds->mix(out, 4);
    check(out[0] == 32512, "8-bit unsigned 0xff -> +32512");
    c->Play(0, 0, 0);
    ds->mix(out, 4);
    check(out[0] == 32767, "two loud buffers clamp at 32767");
    b->Stop();
    c->Stop();

    // SetFrequency doubles the speed
    a->SetCurrentPosition(0);
    a->SetFrequency(44100);
    a->Play(0, 0, 0);
    ds->mix(out, 100);
    a->GetCurrentPosition(&play, nullptr);
    check(play == 100 * 2, "SetFrequency(44100) on a 22 kHz buffer: 1 source frame per output frame");
    a->Stop();

    // Lock across the end of the ring returns two regions
    void *p1, *p2;
    DWORD n1, n2;
    check(a->Lock(1900, 300, &p1, &n1, &p2, &n2, 0) == DS_OK && n1 == 100 && n2 == 200 && p2, "Lock wraps around");

    check(ds->CreateSoundBuffer(nullptr, &b, nullptr) != DS_OK, "NULL desc refused");
    WAVEFORMATEX adpcm{2, 1, 22050, 0, 0, 4, 0};
    DSBUFFERDESC d{sizeof d, 0, 1000, 0, &adpcm};
    IDirectSoundBuffer* bad = nullptr;
    check(ds->CreateSoundBuffer(&d, &bad, nullptr) == DSERR_BADFORMAT, "non-PCM refused");

    a->Release();
    b->Release();
    c->Release();
    ds->Release();
    printf(failures ? "FAILED %d\n" : "PASS\n", failures);
    return failures ? 1 : 0;
}
