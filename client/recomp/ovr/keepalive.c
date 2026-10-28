// A connection's "dead" test (FUN_0068d080, fastcall: the connection -> true when connected and nothing has arrived
// for over 120 s; FUN_0069cca0 then closes it and the game leaves for the title). Every connection sends 0x0005 every
// 60 s (FUN_0068cff0) and the server answers each, so it only fires when the game loop stalls: on the web, a hidden
// tab, whose setTimeout wake-ups the browser throttles to about one a minute. There a dead connection already shows
// as the WebSocket's close or error (net_ws.cpp: every game socket closed), so on the web this never reports one; an
// AFK player stays connected. Natively (TCP, no such signal for a half-open link) the original 120 s check stays.
#include "rt.h"
#include "rc_funcs.h"

void o_0068d080(CPU *restrict c);

void f_0068d080(CPU *restrict c) {
#ifdef __EMSCRIPTEN__
    RC_LOCALS;
    c->eax = 0;
    c->ret_to = RD32(c->esp), c->esp += 4;   // fastcall, no stack arguments: a plain ret
#else
    o_0068d080(c);
#endif
}
