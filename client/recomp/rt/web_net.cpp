// platform/net's WebSocket gateway (net_ws.cpp, Boxedwine framing) for WSOCK32 on the web. The WebSocket and its
// callbacks live on the browser's main thread, so every call runs there: directly from the guest's main thread,
// proxied (synchronously) from a guest worker thread such as the exe's connect thread.
#ifdef __EMSCRIPTEN__
#include <emscripten/proxying.h>
#include <emscripten/threading.h>

#include <cstdlib>

#include "net.h"

template <class F> static void onMain(F f) {
    if (emscripten_is_main_runtime_thread()) { f(); return; }
    emscripten_proxy_sync(emscripten_proxy_get_system_queue(), emscripten_main_runtime_thread_id(),
                          [](void* p) { (*(F*)p)(); }, &f);
}

extern "C" {
void* rc_web_sock_open(const char* host, int port) {
    NetSocket* s = nullptr;
    onMain([&] {
        static bool set;
        if (!set) {
            const char* gw = getenv("YO2_GATEWAY");
            netSetGateway(gw ? gw : "wss://original.ygoevolution.com/net");
            set = true;
        }
        s = netConnect(host, port);
    });
    return s;
}
int rc_web_sock_status(void* s) { int st = 0; onMain([&] { st = netStatus((NetSocket*)s); }); return st; }   // NetStatus
int rc_web_sock_recv(void* s, uint8_t* buf, int len) {
    int k = 0;
    onMain([&] { YgTransport t = netTransport((NetSocket*)s); k = t.recv(t.ctx, buf, len); });
    return k;
}
int rc_web_sock_send(void* s, const uint8_t* buf, int len) {
    int k = 0;
    onMain([&] { YgTransport t = netTransport((NetSocket*)s); k = t.send(t.ctx, buf, len); });
    return k;
}
int rc_web_sock_event(void* s) { int e = 0; onMain([&] { e = netEvent((NetSocket*)s); }); return e; }
void rc_web_sock_close(void* s) { onMain([&] { netClose((NetSocket*)s); }); }
}
#endif
