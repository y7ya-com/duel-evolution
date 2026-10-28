// WINMM: time, multimedia timers, and "no device" for joystick / MIDI / mixer / MCI.
#include <stdlib.h>
#include <unistd.h>

#include "win.h"

IMP(WINMM, timeGetTime) { RET(0, rc_ticks_ms()); }
IMP(WINMM, timeBeginPeriod) { RET(1, 0); }
IMP(WINMM, timeEndPeriod) { RET(1, 0); }
IMP(WINMM, timeGetDevCaps) { WR32m(ARG(0), 1); WR32m(ARG(0) + 4, 1000000); RET(2, 0); }

// timeSetEvent: like Windows, the callback runs on its own thread (a guest CPU of its own). A one-shot timer frees
// its slot when it has fired: the exe's FUN_00536ba0 re-arms a fresh one-shot from inside every callback, so slots
// held until timeKillEvent ran out after 63 ticks (and leaked a thread and a 1 MB guest stack each). IDs only grow,
// so a kill of a stale ID can't hit the timer that reused its slot.
typedef struct { uint32_t delay, cb, user, periodic, id; volatile int dead, self_killed; CPU *c; pthread_t th; } MmTimer;
#define MAX_MMT 64
static MmTimer *mmt[MAX_MMT];
static uint32_t mm_next_id = 1;
static pthread_mutex_t mmu = PTHREAD_MUTEX_INITIALIZER;
static void mm_free(MmTimer *t) { rc_free_thread_stack(t->c); free(t->c->thread); free(t->c); free(t); }
static void *mm_thread(void *p) {
    MmTimer *t = p;
    rc_set_cur(t->c);
    rc_thread_busy(1);
    uint32_t next = rc_ticks_ms() + t->delay;
    do {
        int32_t wait = (int32_t)(next - rc_ticks_ms());
        if (wait > 0) {
            if (rc_fastforward) { rc_thread_busy(-1); rc_vwait((uint32_t)wait); rc_thread_busy(1); }
            else usleep((useconds_t)rc_real_us((uint32_t)wait));
        }
        if (t->dead) break;
        uint32_t args[5] = {t->id, 0, t->user, 0, 0};   // TIMECALLBACK(uTimerID, uMsg, dwUser, dw1, dw2): stdcall
        rc_call(t->c, t->cb, 5, args);
        next += t->delay ? t->delay : 1;
    } while (t->periodic && !t->dead);
    rc_thread_busy(-1);
    pthread_mutex_lock(&mmu);
    int mine = 0;   // still in the table (fired, not killed), or killed from its own callback: nobody joins us
    for (int i = 1; i < MAX_MMT; i++)
        if (mmt[i] == t) { mmt[i] = NULL; mine = 1; }
    mine |= t->self_killed;
    pthread_mutex_unlock(&mmu);
    if (mine) { pthread_detach(pthread_self()); mm_free(t); }
    return NULL;
}
IMP(WINMM, timeSetEvent) {
    if (ARG(4) & 0x10) {   // TIME_CALLBACK_EVENT_SET / PULSE: not used by the game
        rc_log("timeSetEvent with event flags %x: unsupported", ARG(4));
        RET(5, 0);
    }
    pthread_mutex_lock(&mmu);
    for (uint32_t i = 1; i < MAX_MMT; i++)
        if (!mmt[i]) {
            MmTimer *t = calloc(1, sizeof *t);
            *t = (MmTimer){ARG(0), ARG(2), ARG(3), ARG(4) & 1, mm_next_id++, 0, 0, rc_new_thread_cpu(0x40000), 0};
            t->c->thread->id = 0x1000 + i;
            mmt[i] = t;
            pthread_create(&t->th, NULL, mm_thread, t);
            pthread_mutex_unlock(&mmu);
            RET(5, t->id);
        }
    pthread_mutex_unlock(&mmu);
    RET(5, 0);
}
IMP(WINMM, timeKillEvent) {
    MmTimer *t = NULL;
    pthread_mutex_lock(&mmu);
    for (int i = 1; i < MAX_MMT; i++)
        if (mmt[i] && mmt[i]->id == ARG(0)) { t = mmt[i]; mmt[i] = NULL; }
    if (t) {
        t->dead = 1;
        t->self_killed = pthread_equal(pthread_self(), t->th);
    }
    pthread_mutex_unlock(&mmu);
    if (!t) RET(1, 97);   // MMSYSERR_INVALPARAM (also: a one-shot that already fired)
    if (!t->self_killed) {   // as Windows: no callback runs after timeKillEvent returns
        pthread_join(t->th, NULL);
        mm_free(t);
    }
    RET(1, 0);
}

// no joystick, MIDI or mixer devices; MCI fails
#define NODEV 6   // MMSYSERR_NODRIVER
IMP(WINMM, joyGetNumDevs) { RET(0, 0); }
IMP(WINMM, joyGetDevCapsA) { RET(3, NODEV); }
IMP(WINMM, joyGetPos) { RET(2, 167); }   // JOYERR_UNPLUGGED
IMP(WINMM, joyGetPosEx) { RET(2, 167); }
IMP(WINMM, midiInGetNumDevs) { RET(0, 0); }
IMP(WINMM, midiInOpen) { RET(5, NODEV); }
IMP(WINMM, midiInClose) { RET(1, 0); }
IMP(WINMM, midiInReset) { RET(1, 0); }
IMP(WINMM, midiInStart) { RET(1, 0); }
IMP(WINMM, midiInStop) { RET(1, 0); }
IMP(WINMM, midiOutOpen) { RET(5, NODEV); }
IMP(WINMM, midiOutClose) { RET(1, 0); }
IMP(WINMM, mixerGetNumDevs) { RET(0, 0); }
IMP(WINMM, mixerOpen) { RET(5, NODEV); }
IMP(WINMM, mixerClose) { RET(1, 0); }
IMP(WINMM, mixerGetDevCapsA) { RET(3, NODEV); }
IMP(WINMM, mixerGetLineInfoA) { RET(3, NODEV); }
IMP(WINMM, mixerGetLineControlsA) { RET(3, NODEV); }
IMP(WINMM, mixerGetControlDetailsA) { RET(3, NODEV); }
IMP(WINMM, mixerSetControlDetails) { RET(3, NODEV); }
IMP(WINMM, mciSendCommandA) { RET(4, 263); }   // MCIERR_INVALID_DEVICE_NAME
