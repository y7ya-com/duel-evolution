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
//   Dropped mid-session: a lobby socket the server cut (CApp +0xc54 set, +0xc58 1; CApp::dispatchSocket, also what a
//   web gateway close or a deploy's 4012 close becomes) opened the "connection lost" box (CCheckDisconnectTask), whose
//   OK went to the title. Now, in an area or My Room, the game reconnects instead (cut while joining a room or My Room,
//   that join's own failure path recovers, through the My Room retry): in an area the world joins the same
//   room again (CConnectLobby, as a door does) and its block request is pointed at the area the player was in, so they
//   land back there (at one of its arrival spots); in My Room it rejoins My Room. A reconnect that fails goes on
//   through the My Room retry, and once My Room is back (a server restart), to the area again (3 tries). The box is
//   the fallback: after 15 failed My Room tries in a row (about 3 minutes: a server update refuses new connections
//   for up to 2), or a 4th drop within 2 minutes.
// The web page sees the state as window.yo2Net = {reconnecting, attempt} (attempt: failures in a row).
#include "rt.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

enum { ENTER_MYROOM = 1, WAIT_MYROOM = 2, WAIT_LOBBY = 6, ENTER_AREA = 8, IN_MYROOM = 3, IN_AREA = 9, BUSY_DONE = 2, BUSY_FAILED = 3,
       BLOCK_FULL = -502, MAX_FAILS = 15, MAX_DROPS = 3, DROP_WINDOW_US = 120000000 };
#define APP 0x12711acu     // CApp*
#define WORLD 0x12bc8d0u   // CWorldMng*

void o_00a01740(CPU *c);
void o_0069c460(CPU *c);
void o_006d3d50(CPU *c);
void o_00add7b0(CPU *c);

static int rejoin_block = -1;   // the block (area index) the reconnect's enter-block asks for, -1 none
static int rejoin_map = -1;     // the map (area) the reconnect's ENTER_AREA loads, -1 none
static int rejoining;           // a reconnect left IN_AREA / IN_MYROOM; back in one of them = done
static struct { uint32_t room[3]; int block, map, tries; } area_rejoin = {{0}, -1, -1, 0};   // an area to get back to

// Joins the room again (CConnectLobby, as a door does) aiming at the area of area_rejoin; the world then goes
// WAIT_LOBBY -> ENTER_AREA, or back to ENTER_MYROOM (and the My Room retry) if the join fails.
static void join_area(CPU *c, uint32_t world) {
    CPU t = *c;
    rejoin_block = area_rejoin.block, rejoin_map = area_rejoin.map;
    area_rejoin.tries++;
    rc_log("lobby: rejoining room %u-%u-%u, block %d (try %d)", area_rejoin.room[0], area_rejoin.room[1],
           area_rejoin.room[2], rejoin_block, area_rejoin.tries);
    t.ecx = RD32m(world + 0x8c);
    rc_call(&t, 0x0069de40, 0, NULL);   // CConnectLobby::reset
    t = *c;
    t.ecx = RD32m(world + 0x8c);
    rc_call(&t, 0x0069deb0, 3, area_rejoin.room);   // CConnectLobby::connectLobby(language, kind, room)
    WR32m(world + 0x74, ENTER_AREA), WR32m(world + 0x78, 1), WR32m(world + 0x70, WAIT_LOBBY);
}

// The connection-lost box opens next frame (CCheckDisconnectTask reads CApp +0xc54 / +0xc58).
static void give_up(void) {
    uint32_t app = RD32m(APP);
    if (app) rc_mem[app + 0xc54] = 1, WR32m(app + 0xc58, 1);
}

static int reconnecting;

static void net_state(int on, int attempt) {
    reconnecting = on;
#ifdef __EMSCRIPTEN__
    MAIN_THREAD_ASYNC_EM_ASM({ globalThis.yo2Net = ({reconnecting: !!$0, attempt: $1}); }, on, attempt);
#else
    (void)attempt;
#endif
}

// From CWorldMng::waitMyRoom (ovr/freemode.c's f_00adcda0) each frame: true while a retry is pending (nothing else to do
// this frame).
int rc_myroom_retry(uint32_t self) {
    static int fails;
    static uint64_t until;   // rc_now_us of the next try, 0 none pending
    uint32_t task = RD32m(self + 0x80), busy = task ? RD32m(task + 0x88) : 0;
    if (fails >= MAX_FAILS && busy != BUSY_DONE) return 1;   // given up: the box is up (until a join succeeds, after a
                                                              // sign-in from the title)
    if (until) {
        if (rc_now_us() < until) return 1;
        until = 0;
        rc_log("lobby: My Room connect, try %d", fails + 1);
        WR32m(self + 0x70, ENTER_MYROOM);
        return 1;
    }
    if (busy == BUSY_DONE && (reconnecting || fails)) fails = 0, net_state(0, 0);
    if (busy != BUSY_FAILED) return 0;
    uint32_t s = fails < 4 ? 1u << fails : 15;
    fails++;
    net_state(1, fails);
    if (fails >= MAX_FAILS) {
        rc_log("lobby: My Room connect failed [%d] %d times: the connection-lost box", (int)RD32m(task + 0x8c), fails);
        give_up();
        return 1;
    }
    rc_log("lobby: My Room connect failed [%d], retrying in %u s", (int)RD32m(task + 0x8c), s);
    until = rc_now_us() + (uint64_t)s * 1000000;
    return 1;
}

// 0x00a01740 the area map's wait for the lobby task after an exit (fastcall, this): a failure other than a full block
// is the back-to-My-Room request instead of the error box: the avatar's controller stopped and +0x2c0 8, as the
// walk-out exit to My Room does, then +0x2d9 0, +0x2d0 1, +0x270 11 (FUN_00a02da0).
void f_00a01740(CPU *c) {
    uint32_t self = c->ecx, task = RD32m(self + 0xfc);
    int result = task ? (int)RD32m(task + 0x8c) : 0;
    if (task && RD32m(task + 0x88) == BUSY_FAILED && result != BLOCK_FULL) {
        rc_log("lobby: area move failed [%d]: back to My Room", result);
        net_state(1, 0);
        uint32_t ctrl = RD32m(self + 0x294);   // CChibiAvatarCtrl: stopped first, as the walk-out exit does (FUN_009fb8c0)
        if (ctrl) WR32m(ctrl + 0x20, RD32m(ctrl + 0x20) | 1);
        WR32m(self + 0x2c0, 8);
        rc_mem[self + 0x2d9] = 0, rc_mem[self + 0x2d0] = 1;
        WR32m(self + 0x270, 0xb);
        c->ret_to = RD32m(c->esp), c->esp += 4;
        return;
    }
    o_00a01740(c);
}

// 0x0069c460 CCheckDisconnectTask::onMain (fastcall, this): a lobby the server cut, in an area or My Room, reconnects
// instead of opening the box.
int rc_duel_cut(CPU *c);   // ovr/duelreattach.c

void f_0069c460(CPU *c) {
    static uint64_t drops[MAX_DROPS];
    static unsigned ndrops;
    rc_duel_cut(c);   // a duel cut mid-duel re-attaches (and clears the flag) before the box can see it
    uint32_t app = RD32m(APP), world = RD32m(WORLD), state = world ? RD32m(world + 0x70) : 0;
    if (rejoining && state == IN_MYROOM && area_rejoin.block >= 0 && area_rejoin.tries < 3 && RD32m(world + 0x8c)) {
        join_area(c, world);   // the area's room didn't answer (a restart): My Room is back, so the area again
    } else if (rejoining && (state == IN_AREA || state == IN_MYROOM)) {
        rejoining = 0, rejoin_map = rejoin_block = area_rejoin.block = -1;
        rc_log("lobby: reconnected");
        net_state(0, 0);
    }
    int joining = state == WAIT_MYROOM || state == WAIT_LOBBY || state == ENTER_AREA;
    if (app && rc_mem[app + 0xc54] && RD32m(app + 0xc58) == 1 && RD32m(c->ecx + 0x7c) == 0 /* WATCH */ && joining) {
        // cut while joining: the join's own failure path recovers (WAIT_LOBBY -> ENTER_MYROOM, the My Room retry)
        rc_log("lobby: the server cut the lobby while joining: left to the join's retry");
        rc_mem[app + 0xc54] = 0, WR32m(app + 0xc58, 0);
    }
    if (app && rc_mem[app + 0xc54] && RD32m(app + 0xc58) == 1 && RD32m(c->ecx + 0x7c) == 0 /* WATCH */ &&
        (state == IN_AREA || state == IN_MYROOM)) {
        uint64_t now = rc_now_us();
        if (ndrops < MAX_DROPS || now - drops[ndrops % MAX_DROPS] > DROP_WINDOW_US) {
            drops[ndrops++ % MAX_DROPS] = now;
            rc_mem[app + 0xc54] = 0, WR32m(app + 0xc58, 0);
            net_state(1, 0);
            rejoining = 1;
            uint32_t lobby = RD32m(app + 0xc6c), conn = RD32m(world + 0x8c);
            if (state == IN_AREA && lobby && conn) {
                for (int i = 0; i < 3; i++) area_rejoin.room[i] = rc_mem[lobby + 0x9ec + i];
                area_rejoin.block = rc_mem[lobby + 0x9ef];
                area_rejoin.map = (int)RD32m(RD32m(0x12bb6b0) + 0x98);   // CGame +0x98: the map the player is on
                area_rejoin.tries = 0;
                rc_log("lobby: the server cut the lobby");
                join_area(c, world);
            } else {
                rc_log("lobby: the server cut the lobby: rejoining My Room");
                WR32m(world + 0x70, ENTER_MYROOM);
            }
        }
    }
    o_0069c460(c);
}

// 0x006d3d50 CNetLobbyTask::enterBlock(block, change) (thiscall, ret 8): a reconnect's first enter-block (CConnectLobby's,
// block 0) asks for the area the player was in, as an area move does (change 1).
void f_006d3d50(CPU *c) {
    if (rejoin_block >= 0) {
        WR32m(c->esp + 4, (uint32_t)rejoin_block), WR32m(c->esp + 8, 1);
        rejoin_block = -1;
    }
    o_006d3d50(c);
}

// 0x00add7b0 CWorldMng::enterArea (fastcall, this): the map is the lobby's +0x9f0, the area byte of the enter-block
// reply, which a server leaves at 0 for an area change; a reconnect's is the map the player was on.
void f_00add7b0(CPU *c) {
    uint32_t app = RD32m(APP), lobby = app ? RD32m(app + 0xc6c) : 0;
    if (rejoin_map >= 0 && lobby) rc_mem[lobby + 0x9f0] = (uint8_t)rejoin_map;
    rejoin_map = -1;
    o_00add7b0(c);
}
