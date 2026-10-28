// CD3DTextureManager's texture request (0x59b550, thiscall: name, out info, ..., async flag): RC_TEXREQ_LOG=1 logs
// each (caller, arguments) shape once, then every request that takes longer than 5 ms, with its name and time.
#include "rt.h"
#include "rc_funcs.h"
#include <stdlib.h>
#include <time.h>

void o_0059b550(CPU *restrict c);

void f_0059b550(CPU *restrict c) {
    static int on = -1;
    if (on < 0) on = getenv("RC_TEXREQ_LOG") != NULL;
    if (!on) { o_0059b550(c); return; }
    uint32_t ret = RD32m(c->esp), a[5];
    for (int i = 0; i < 5; i++) a[i] = RD32m(c->esp + 4 + 4 * i);
    const char *name = a[0] && RD32m(a[0] + 4) ? GS(RD32m(a[0] + 4)) : "?";
    struct timespec t0, t1;
    clock_gettime(CLOCK_MONOTONIC, &t0);
    o_0059b550(c);
    clock_gettime(CLOCK_MONOTONIC, &t1);
    double ms = (t1.tv_sec - t0.tv_sec) * 1e3 + (t1.tv_nsec - t0.tv_nsec) / 1e6;
    static uint32_t seen[256];
    static int ns;
    uint32_t key = ret ^ a[3] << 24 ^ (a[4] & 0xff) << 16;
    int i = 0;
    while (i < ns && seen[i] != key) i++;
    if (i == ns && ns < 256) {
        seen[ns++] = key;
        rc_log("texreq shape: from %08x args %08x %08x %08x %08x %08x  e.g. %s", ret, a[0], a[1], a[2], a[3], a[4], name);
    }
    if (ms > 5) rc_log("texreq %.1f ms from %08x a3 %x a4 %x: %s", ms, ret, a[2], a[3], name);
}
