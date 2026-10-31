// No lobby connect failure ends the game. The 2008 client met any failed lobby connect with its debug error box
// ("connect error [-151] MyRoomLobby", yo2WorldManager.cpp; "connect error [%d] AreaMap", the area map) and exited.
// -151 is the lobby task's connect failure (FUN_006d1840: the socket never came up), which on the web follows a dropped
// browser socket or a gateway blip.
//   My Room: CWorldMng (DAT_012bc8d0) waits in WAIT_MYROOM (+0x70 = 2) on its lobby task (+0x80), whose busy flag
//   (+0x88) reads 3 for one frame after a failure and is idle again the next. That frame starts a wait of 1, 2, 4, 8,
//   then 15 s, after which the manager goes back to ENTER_MYROOM (1) and asks the task again (FUN_006d3a50).
//   Area move: the area map (its task at +0xfc) waits for the enter-block step after an exit. The original keeps the
//   player where they are on a full block (-502) and shows the box on anything else; here anything else takes the
//   player back to My Room (FUN_00a02da0's request), whose join reconnects through the retry above.
// The web page sees the state as window.yo2Net = {reconnecting, attempt} (attempt: failures in a row).
#include "rt.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

enum { ENTER_MYROOM = 1, BUSY_DONE = 2, BUSY_FAILED = 3, BLOCK_FULL = -502 };

void o_00a01740(CPU *c);

static void net_state(int reconnecting, int attempt) {
#ifdef __EMSCRIPTEN__
    MAIN_THREAD_ASYNC_EM_ASM({ globalThis.yo2Net = {reconnecting: !!$0, attempt: $1}; }, reconnecting, attempt);
#else
    (void)reconnecting, (void)attempt;
#endif
}

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
    if (busy == BUSY_DONE && fails) fails = 0, net_state(0, 0);
    if (busy != BUSY_FAILED) return 0;
    uint32_t s = fails < 4 ? 1u << fails : 15;
    fails++;
    rc_log("lobby: My Room connect failed [%d], retrying in %u s", (int)RD32m(task + 0x8c), s);
    net_state(1, fails);
    until = rc_now_us() + (uint64_t)s * 1000000;
    return 1;
}

// 0x00a01740 the area map's wait for the lobby task after an exit (fastcall, this): a failure other than a full block
// is the back-to-My-Room request (+0x2d9 0, +0x2d0 1, +0x270 11, as FUN_00a02da0 sets them) instead of the error box.
void f_00a01740(CPU *c) {
    uint32_t self = c->ecx, task = RD32m(self + 0xfc);
    int result = task ? (int)RD32m(task + 0x8c) : 0;
    if (task && RD32m(task + 0x88) == BUSY_FAILED && result != BLOCK_FULL) {
        rc_log("lobby: area move failed [%d]: back to My Room", result);
        net_state(1, 0);
        rc_mem[self + 0x2d9] = 0, rc_mem[self + 0x2d0] = 1;
        WR32m(self + 0x270, 0xb);
        c->ret_to = RD32m(c->esp), c->esp += 4;
        return;
    }
    o_00a01740(c);
}
