// The My Room doors: with a one-room server (YOLaucher's YO2_SINGLE_LOBBY) straight into that room, no pickers;
// otherwise straight to the door's room list, in the language the server's rooms use (no language picker).
#include "rc.h"
#include "rt.h"

void f_00adaed0(CPU *c);
void f_0082f2e0(CPU *c);
void f_0069de40(CPU *c);
void f_0069de80(CPU *c);
void f_0082da70(CPU *c);
void o_0082d750(CPU *c);

static int auto_lang;   // the door hid the language list: it is picked once the fresh gate list is in

// The door's list window (FUN_0082eff0 on this+0xa4: the language list, then the room list), or 0.
static uint32_t list_window(CPU *c, uint32_t self) {
    CPU t = *c;
    t.ecx = self + 0xa4;
    return rc_call(&t, 0x82eff0, 0, NULL);
}

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
            uint32_t win = list_window(c, self);
            if (win) WR32(win + 0x20, RD32(win + 0x20) | 2);   // the language list stays hidden
            auto_lang = win != 0;
        }
        c->eax = (c->eax & ~0xffu) | 1;
    }
    c->ret_to = POP();
    c->esp += 4;
}

// The language list's row for the first lobby's language (not a My Room: type 3, b2 != 12) in the fresh gate list, or
// -1. The rows are this+0xb4..+0xb8 (int32 languages, as FUN_0082da70 fills them; FUN_0082d9f0 reads row -> language).
// ponytail: the first lobby's language; a server with rooms in several languages (YO2_ROOM_PER_LANG) gets that one,
// pick by the client's own language if that ever matters.
static int lang_row(CPU *c, uint32_t self) {
    RC_LOCALS;
    uint32_t net = RD32(0x12711ac), gate = net ? RD32(net + 0xc64) : 0;
    if (!gate || RD8(gate + 0x548)) return -1;
    for (uint32_t it = RD32(gate + 0x534 + 8), end = RD32(gate + 0x534 + 0xc); it != end; it += 8) {
        uint32_t e = RD32(it + 4);
        if (!e || RD32(e + 8) != 3 || RD8(e + 0x33) == 12) continue;
        uint32_t rows = RD32(self + 0xb4), n = (RD32(self + 0xb8) - rows) / 4;
        for (uint32_t i = 0; i < n; i++)
            if (RD32(rows + 4 * i) == RD8(e + 0x32)) return (int)i;
    }
    return -1;
}

// 0x0082d750 the door's picker step (fastcall, this). State 2 = the gate list is in and the language list waits for a
// pick (window +0x3cc, -1 = none): the pick is made here, so the original goes on (FUN_0082d9f0) to the door's room
// list in the same frame. No lobby in the list: the language list is shown as it was.
void f_0082d750(CPU *c) {
    RC_LOCALS;
    uint32_t self = c->ecx, win;
    if (auto_lang && RD32(self + 0x70) == 2 && (win = list_window(c, self)) && RD32(win + 0x3cc) == 0xffffffffu) {
        int row = lang_row(c, self);
        if (row >= 0) WR32(win + 0x3cc, (uint32_t)row);
        else WR32(win + 0x20, RD32(win + 0x20) & ~2u);
        auto_lang = 0;
    }
    if (RD32(self + 0x70) == 0) auto_lang = 0;   // closed or cancelled before the list came
    o_0082d750(c);
}
