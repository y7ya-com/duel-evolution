// A duel connection the server cut mid-duel re-attaches instead of ending the game's duel. The server keeps the duel
// for 45 s (yo2-server-ts, 9ef2f47 + the count): a new duel connection whose first message is 0x6001 = u32 pid + u32 n
// gets back into the match, and the server resends its 0x6202 commands from the n-th on (n = how many this duel got),
// which ends with the pending prompt, so the board can't miss the opponent's plays. A plain 4-byte 0x6001 (a new
// duel) is unchanged. The client never resends an answer of its own: it answers what comes after the re-attach.
//   Count: CNetDuel::onSetCommand (FUN_00692580) appends each 0x6202; the booked check (FUN_006917b0, 0x6001) starts a
//   duel, so it records the pid and zeroes the count; the client's own bye on the duel connection (FUN_0068cf60) ends it.
//   Cut: CApp::dispatchSocket sets CApp +0xc54, +0xc58 = 2 (duel), which CCheckDisconnectTask (ovr/lobbyretry.c's
//   f_0069c460, which calls rc_duel_cut first) turns into the "disconnected" box. During a duel it is a re-attach
//   instead: the CNetDuel (CApp +0xc70) reconnects to its host / port (+0x04, +0x14, kept from the first connect),
//   then sends the 0x6001 with the count, retrying 1, 2, 4, 8 s apart for up to 40 s. Past that, the box.
#include "rt.h"

#define APP 0x12711acu   // CApp*

void o_006917b0(CPU *c);
void o_0068cf60(CPU *c);

static uint32_t duel_pid, duel_commands;   // the duel's pid; 0x6202s received this duel
static int in_duel;                         // a booked check went out and the duel connection is up
static struct { int on, tries; uint64_t next, deadline; } re;

// From ovr/duelmove.c's f_00692580 (CNetDuel::onSetCommand): one more 0x6202
void rc_duel_command(void) { duel_commands++; }

// 0x006917b0 CNetDuel::sendBookedCheck(pid) (thiscall, ret 4): a new duel
void f_006917b0(CPU *c) {
    duel_pid = RD32m(c->esp + 4), duel_commands = 0, in_duel = 1;
    o_006917b0(c);
}

// 0x0068cf60 CMessageIOBase::sendBye (fastcall, this): the client closing its duel connection ends the duel for us
void f_0068cf60(CPU *c) {
    uint32_t app = RD32m(APP);
    if (app && c->ecx == RD32m(app + 0xc70)) in_duel = 0;
    o_0068cf60(c);
}

static uint32_t call0(CPU *c, uint32_t fn, uint32_t self) {   // a fastcall / thiscall method with no stack argument
    CPU t = *c;
    t.ecx = self;
    return rc_call(&t, fn, 0, NULL);
}

// 0x6001 = u32 pid + u32 count on the new connection (FUN_006917b0's packet, one ygPut32 more)
static void send_reattach(CPU *c, uint32_t duel) {
    uint32_t out = duel + 0xf4;
    CPU t = *c;
    t.esp -= 16;
    uint32_t v = t.esp;   // two guest u32s for ygPut32's pointers
    WR32m(v, duel_pid), WR32m(v + 4, duel_commands);
    uint32_t a1[1] = {out}, a2[2] = {out, 0x6001}, a3[2] = {out, v}, a4[2] = {out, v + 4};
    CPU u = t; rc_call(&u, 0x0068a5a0, 1, a1);   // ygClear
    u = t; rc_call(&u, 0x0068a5f0, 2, a2);       // ygBeginWrite(0x6001)
    u = t; rc_call(&u, 0x0068a930, 2, a3);       // ygPut32(pid)
    u = t; rc_call(&u, 0x0068a930, 2, a4);       // ygPut32(count)
    u = t; rc_call(&u, 0x0068a630, 1, a1);       // ygEndWrite
    call0(c, 0x0068cf30, duel);                  // CMessageIOBase::send
    rc_mem[duel + 0x1c] = 1;                     // ND_REQ_BOOKED sent, as FUN_006917b0
}

// From f_0069c460 each frame, before the box can open: true when the duel cut was taken over (the flag is cleared).
int rc_duel_cut(CPU *c) {
    uint32_t app = RD32m(APP), duel = app ? RD32m(app + 0xc70) : 0;
    if (!duel) return 0;
    uint64_t now = rc_now_us();
    if (app && rc_mem[app + 0xc54] && RD32m(app + 0xc58) == 2) {
        if (!in_duel || !duel_pid) return 0;   // not ours to take: the box
        rc_mem[app + 0xc54] = 0, WR32m(app + 0xc58, 0);
        if (!re.on) {
            re.on = 1, re.tries = 0, re.next = now, re.deadline = now + 40000000ull;
            rc_log("duel: the server cut the duel: re-attaching (%u commands so far)", duel_commands);
        }
    }
    if (!re.on) return 0;
    if (now > re.deadline) {
        re.on = 0, in_duel = 0;
        rc_log("duel: re-attach gave up after 40 s: the disconnected box");
        rc_mem[app + 0xc54] = 1, WR32m(app + 0xc58, 2);
        return 0;
    }
    int32_t st = (int32_t)call0(c, 0x0068ce50, duel);   // CMessageIOBase::state
    if (st == 2) {   // YGC_CONNECTED: select, then the re-attach
        CPU t = *c;
        uint32_t z[1] = {0};
        t.ecx = duel;
        rc_call(&t, 0x0068ce90, 1, z);   // select(this->notify)
        send_reattach(c, duel);
        rc_log("duel: re-attached as pid %u from command %u", duel_pid, duel_commands);
        re.on = 0;
        return 1;
    }
    if (st == 1) return 1;   // YGC_CONNECTING
    if (now >= re.next) {   // idle or failed: (re)connect
        static const unsigned kWait[] = {1, 2, 4, 8};
        call0(c, 0x0068cd00, duel);   // ensureConn
        call0(c, 0x0068cd30, duel);   // connect (host +0x04, port +0x14)
        re.next = now + (uint64_t)kWait[re.tries < 3 ? re.tries : 3] * 1000000;
        rc_log("duel: re-attach connect, try %d", ++re.tries);
    }
    return 1;
}
