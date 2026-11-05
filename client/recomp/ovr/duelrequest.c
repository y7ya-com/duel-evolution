// CNetLobby_OfferRoom::onMain waits in state 3 for LB_REQ_MATCH == 2 forever if a
// lobby response is lost (e.g. reconnect/deploy). The HTML popup is the engine's
// task, so its deadline belongs here, for both HTML and native UI. Never resend
// 0x4300: after 45 s, cancel once (0x4304), then feed the normal -616 result path.
// +0xac is the unused tail word of this 0xb0-byte task (NetLobbyRequests.h).
#include "rt.h"
void o_006b69f0(CPU *c);

void f_006b69f0(CPU *c) {
    uint32_t self = c->ecx, lobby = RD32m(self + 0x7c);
    uint32_t now = (uint32_t)(rc_now_us() / 1000), start = RD32m(self + 0xac);
    if (RD32m(self + 0x80) != 3) {
        WR32m(self + 0xac, 0);
    } else if (lobby && rc_mem[lobby + 0x2c] != 2) {
        if (!start) WR32m(self + 0xac, now ? now : 1);
        else if ((uint32_t)(now - start) >= 45000) {
            CPU t = *c;
            t.ecx = lobby;
            rc_call(&t, 0x006cc9e0, 0, NULL); // cancelReqMatch; no wait for its acknowledgement
            WR32m(lobby + 0x820, (uint32_t)-616);
            rc_mem[lobby + 0x2c] = 2;
            WR32m(self + 0xac, 0);
            rc_log("duel request: local timeout, cancelled once");
        }
    }
    o_006b69f0(c);
}
