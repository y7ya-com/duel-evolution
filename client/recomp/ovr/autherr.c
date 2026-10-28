// The account task's error text for a 0x3004 result (FUN_006a6eb0, cdecl: result -> string id). Every id it returns
// has text in the shipped tables except 0x11b7 (result -255, 0xffffff01), which shows an EMPTY OK box; it becomes
// 0x1198, the one the task prints with the code ("A transmission error has occurred." / "[-255]"). Every result is
// also logged (stderr: the browser console on the web), so a refusal names its code.
#include "rt.h"
#include "rc_funcs.h"

void o_006a6eb0(CPU *restrict c);

void f_006a6eb0(CPU *restrict c) {
    int32_t result = (int32_t)RD32m(c->esp + 4);
    o_006a6eb0(c);
    if (c->eax == 0x11b7) c->eax = 0x1198;
    rc_log("login refused: 0x3004 result %d -> text %#x", result, c->eax);
}
