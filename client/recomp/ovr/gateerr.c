// The gate task (FUN_006a8f70, thiscall: ecx = the task) fails into state 6 with a text id at +0x8c: 0x1195 (the
// connect failed), 0x119c (no reply: socket error or 600 ticks), 0x119d (result -0x79 while reading the server list).
// Logged once per failure (stderr: the browser console on the web), the same way autherr.c logs 0x3004 refusals.
#include "rt.h"
#include "rc_funcs.h"

void o_006a8f70(CPU *restrict c);

void f_006a8f70(CPU *restrict c) {
    uint32_t task = c->ecx, before = RD32m(task + 0x78);
    o_006a8f70(c);
    if (before != 6 && RD32m(task + 0x78) == 6)
        rc_log("gate failed: state %u -> text %#x", before, RD32m(task + 0x8c));
}
