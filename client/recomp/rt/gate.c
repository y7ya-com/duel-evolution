// The My Room doors with a one-room server (YOLaucher's YO2_SINGLE_LOBBY): straight into that room, no pickers.
#include "rc.h"

void f_00adaed0(CPU *c);
void f_0082f2e0(CPU *c);
void f_0069de40(CPU *c);
void f_0069de80(CPU *c);
void f_0082da70(CPU *c);

// Calls a guest function whose arguments are already pushed; false = a non-local return is unwinding past us.
static int call(CPU *c, void (*f)(CPU *), uint32_t ret) {
    RC_LOCALS;
    PUSH(ret);
    f(c);
    return c->ret_to == ret;
}

// The gate list's only lobby that is not a My Room (type 3, b2 != 12), or 0 when there are none or several. The list
// is CNetGate's (DAT_012711ac->+0xc64) vector at +0x534 (8-byte smart_ptrs, the entry at +4), as FUN_0082e170 walks it;
// +0x548 = a list being received, nothing to read.
static uint32_t single_room(CPU *c) {
    RC_LOCALS;
    uint32_t net = RD32(0x12711ac), gate = net ? RD32(net + 0xc64) : 0, room = 0;
    if (!gate || RD8(gate + 0x548)) return 0;
    for (uint32_t it = RD32(gate + 0x534 + 8), end = RD32(gate + 0x534 + 0xc); it != end; it += 8) {
        uint32_t e = RD32(it + 4);
        if (!e || RD32(e + 8) != 3 || RD8(e + 0x33) == 12) continue;
        if (room) return 0;
        room = e;
    }
    return room;
}

// 0x0082c9c0 CMyRoom2MapTask::open(door), thiscall, ret 4: a door (0xd blue, 0xe red) was walked through. The original
// asks CConnectLobby (this+0xe0) for a fresh gate list and opens the language list; FUN_0082d750 then shows the
// door's rooms (filtered by LV: only Beginners' Rooms at LV 0-1, "Room not available" at the blue door) and on a pick
// sets +0x80 room no., +0x7c kind, +0x84, and +0x74 = 2, which My Room (FUN_00829b20) turns into GoToMap.
// Here, when the list the client already holds has exactly one lobby, that pick happens at once, from either door. The
// lobby connect (FUN_0069deb0 -> FUN_006abe10) looks the room up in that same list; no fresh one is needed.
void f_0082c9c0(CPU *c) {
    RC_LOCALS;
    uint32_t self = c->ecx, door = RD32(c->esp + 4), room;
    c->ecx = 0x12bc618;
    PUSH(1);
    if (!call(c, f_00adaed0, 0x82c9cf)) return;
    if (c->eax & 0xff) {
        WR32(self + 0x7c, door);
        if ((room = single_room(c))) {
            WR32(self + 0x78, RD8(room + 0x32));   // language
            WR32(self + 0x7c, RD8(room + 0x33));   // kind
            WR32(self + 0x80, RD8(room + 0x34));   // room no.
            WR8(self + 0x84, 1);
            WR32(self + 0x74, 2);
            WR32(self + 0x70, 0);
        } else {
            c->ecx = self + 0xe0;
            if (!call(c, f_0082f2e0, 0x82c9ec)) return;
            c->ecx = c->eax;
            if (!call(c, f_0069de40, 0x82c9f3)) return;
            c->ecx = self + 0xe0;
            if (!call(c, f_0082f2e0, 0x82c9fa)) return;
            c->ecx = c->eax;
            if (!call(c, f_0069de80, 0x82ca01)) return;
            c->ecx = self;
            if (!call(c, f_0082da70, 0x82ca08)) return;
            WR32(self + 0x74, 0);
            WR32(self + 0x70, 1);
        }
        c->eax = (c->eax & ~0xffu) | 1;
    }
    c->ret_to = POP();
    c->esp += 4;
}
