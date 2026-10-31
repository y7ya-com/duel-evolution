// A My Room lobby connect that fails is retried in place. The 2008 client showed its debug error box ("connect error
// [-151] MyRoomLobby", yo2WorldManager.cpp) and exited, ending the game, on any failure: -151 is the lobby task's
// connect failure (FUN_006d1840: the socket to the lobby port never came up), which on the web is a gateway or server
// blip, such as a deploy. CWorldMng (DAT_012bc8d0) waits in WAIT_MYROOM (+0x70 = 2) on its lobby task (+0x80), whose
// busy flag (+0x88) reads 3 for one frame after a failure and is idle again the next. Here that frame starts a wait of
// 1, 2, 4, 8, then 15 s, after which the manager goes back to ENTER_MYROOM (1) and asks the task again (FUN_006d3a50).
#include "rt.h"

enum { WAIT_MYROOM = 2, ENTER_MYROOM = 1, BUSY_FAILED = 3, BUSY_DONE = 2 };

// From CWorldMng::waitMyRoom (ovr/freemode.c's f_00adcda0) each frame: true while a retry is pending (nothing else to do
// this frame).
int rc_myroom_retry(uint32_t self) {
    static int fails;
    static uint64_t until;   // rc_now_us of the next try, 0 none pending
    uint32_t task = RD32m(self + 0x80), busy = task ? RD32m(task + 0x88) : 0;
    if (until) {
        if (rc_now_us() < until) return 1;
        until = 0;
        rc_log("lobby: My Room connect, try %d", fails + 1);
        WR32m(self + 0x70, ENTER_MYROOM);
        return 1;
    }
    if (busy == BUSY_DONE) fails = 0;
    if (busy != BUSY_FAILED) return 0;
    uint32_t s = fails < 4 ? 1u << fails : 15;
    fails++;
    rc_log("lobby: My Room connect failed [%d], retrying in %u s", (int)RD32m(task + 0x8c), s);
    until = rc_now_us() + (uint64_t)s * 1000000;
    return 1;
}
