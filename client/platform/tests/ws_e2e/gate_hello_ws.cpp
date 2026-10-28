// Web variant of tests/gate_hello.cpp: the same gate handshake through net_ws.cpp (WebSocket -> Boxedwine's
// network-gateway.mjs -> TCP -> run.py), driven by emscripten_set_main_loop because the web build cannot block.
// It goes through Net's own entry points (ygConnectAsync, ygSocketTransport, ygSocketClose) and reads only after
// ygNetPoll posts 0x1401 FD_READ, the way the game does.
//   node gate_hello_ws.js [gateway-url] [host] [port]
//   defaults ws://127.0.0.1:8001/boxedwine-network 127.0.0.1 5730 -> exit 0 if 0x2002 then 0x2003 arrive in order
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <emscripten/emscripten.h>
#include <emscripten/websocket.h>

#include "Net/MessageIO.h"
#include "net/net.h"

static const char* gHost = "127.0.0.1";
static int gPort = 5730;
static double gDeadline;
static YgConn* gConn;
static bool gReadable;
static void onPost(uint32_t msg, uintptr_t sock, intptr_t ev) {
    if (msg == 0x1401 && gConn && (int32_t)sock == gConn->sock && ev == 1) gReadable = true;
}
static YgPacket gOut, gIn;
static int gGot, gLastParam;
static enum { CONNECT, WAIT_OPEN, RECV } gStep = CONNECT;

static void finish(int code, const char* msg) {
    printf("%s\n", msg);
    if (gConn && gConn->sock > 0) ygSocketClose(gConn->sock);
    gConn = nullptr;
    emscripten_websocket_deinitialize();   // under Node an open WebSocket keeps the process alive past exit
    emscripten_force_exit(code);
}

static void tick() {
    char msg[128];
    if (emscripten_get_now() > gDeadline) {
        snprintf(msg, sizeof msg, "FAIL timeout in step %d after %d of 2", (int)gStep, gGot);
        finish(1, msg);
        return;
    }
    ygNetPoll(onPost);
    switch (gStep) {
    case CONNECT:
        gConn = ygConnNew();
        ygConnectAsync(gHost, (uint16_t)gPort, gConn, 0);
        if (gConn->state == YGC_FAILED) { finish(1, "FAIL connect"); return; }
        gStep = WAIT_OPEN;
        return;
    case WAIT_OPEN: {
        if (gConn->state == YGC_CONNECTING) return;
        if (gConn->state != YGC_CONNECTED) { finish(1, "FAIL not open"); return; }
        const char ver[] = "Ver.080912.00";   // no NUL on the wire (fake_client.py VERSION)
        gOut.id = 0x2005;
        gOut.param = 1;
        gOut.len = sizeof ver - 1;
        memcpy(gOut.data, ver, gOut.len);
        if (int r = ygSend(&gOut, ygSocketTransport(gConn->sock))) { snprintf(msg, sizeof msg, "FAIL send %d", r); finish(1, msg); return; }
        gStep = RECV;
        return;
    }
    case RECV: {
        const int want[] = {0x2002, 0x2003};
        if (!gReadable) return;   // no 0x1401 FD_READ yet
        while (gGot < 2) {
            int r = ygRecv(&gIn, ygSocketTransport(gConn->sock));
            if (r == YG_PENDING) { gReadable = false; return; }   // next FD_READ
            if (r != YG_OK) { snprintf(msg, sizeof msg, "FAIL recv %d", r); finish(1, msg); return; }
            printf("rx 0x%04x param=%d len=%d\n", gIn.id, gIn.param, gIn.len);
            if (gGot && gIn.param != gLastParam + 1) {
                snprintf(msg, sizeof msg, "FAIL param %d after %d", gIn.param, gLastParam);
                finish(1, msg);
                return;
            }
            gLastParam = gIn.param;
            if (gIn.id != want[gGot]) { snprintf(msg, sizeof msg, "FAIL expected 0x%04x", want[gGot]); finish(1, msg); return; }
            gGot++;
        }
        finish(0, "OK gate hello over WebSocket: 0x2002 then 0x2003");
        return;
    }
    }
}

int main(int argc, char** argv) {
    if (argc > 1) netSetGateway(argv[1]);
    if (argc > 2) gHost = argv[2];
    if (argc > 3) gPort = atoi(argv[3]);
    gDeadline = emscripten_get_now() + 10000;
    emscripten_set_main_loop(tick, 100, 1);   // fps > 0: setTimeout pacing (Node has no requestAnimationFrame)
    return 0;
}
