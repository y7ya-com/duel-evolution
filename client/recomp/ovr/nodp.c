// PvP is free: no DUELPASS points (DP) anywhere (owner's decision, 2026-10-28). The client's only DP gates are
// `balance < (room type != 3 ? 3 : 1)` (unsigned) on the selected character's balance, account+0x1248:
// FUN_00863ec0 (3 sites: accepting / creating a duel or match, error -612) and FUN_00863750 (state 2: the own room is
// deleted after a duel). The only writers that take the balance from the server are 0x4101 PSELECTRESULT and
// 0x4140 PLAYERDATAUPDATE, so after either one the balance is pinned high: no gate can trip, whatever the server
// sends. (0x4903 / 0x8102 / 0x8204 add to it; from 0x7fffffff that stays above 3 unsigned.) The balance is shown only
// by the DUELPASS windows, which only the Main Menu's DUELPASS entry opens: audiomenu.c hides that entry.
// RC_DP=1 keeps the original behaviour.
#include <stdlib.h>
#include "rt.h"

void o_006b7ef0(CPU *c);
void o_006bc270(CPU *c);

int rc_dp_removed(void) {
    static int on = -1;
    if (on < 0) on = !(getenv("RC_DP") && atoi(getenv("RC_DP")));
    return on;
}

static void pin_balance(void) {
    RC_LOCALS;
    uint32_t net = RD32(0x12711ac), acc = net ? RD32(net + 0xc68) : 0;   // account - 0x121c, as the gates read it
    if (acc && acc != (uint32_t)-0x121c) WR32(acc + 0x1248, 0x7fffffff);
}

// 0x006b7ef0 0x4101 PSELECTRESULT handler (sets account+0x1248 from the message)
void f_006b7ef0(CPU *c) {
    o_006b7ef0(c);
    if (rc_dp_removed()) pin_balance();
}

// 0x006bc270 0x4140 PLAYERDATAUPDATE handler (the same)
void f_006bc270(CPU *c) {
    o_006bc270(c);
    if (rc_dp_removed()) pin_balance();
}
