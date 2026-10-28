// Web backend: Boxedwine's network-gateway.mjs protocol (one WebSocket, sockets multiplexed by a uint32 id).
//   text   {"type":"open","id":N,"host":"127.0.0.1","port":5730}  -> {"type":"open","id":N,"status":0}
//   text   {"type":"close","id":N}                                <-> {"type":"close","id":N} / {"type":"error",...}
//   binary [1][id u32 BE][payload]                                 both directions, TCP stream bytes
#include "net.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <emscripten/websocket.h>
#include <map>
#include <string>
#include <vector>

struct NetSocket {
    uint32_t id;
    NetStatus status;
    std::vector<uint8_t> rx;
    size_t rxPos = 0;
};

static std::string gGatewayUrl = "ws://127.0.0.1:8001/boxedwine-network";
static EMSCRIPTEN_WEBSOCKET_T gWs = 0;
static bool gWsOpen = false;
static std::vector<std::string> gPending;   // control messages queued until the WebSocket opens
static std::map<uint32_t, NetSocket*> gSockets;
static uint32_t gNextId = 1;

void netSetGateway(const char* url) { gGatewayUrl = url; }

// ponytail: key lookup on the gateway's own JSON.stringify output (no spaces), not a JSON parser
static bool jsonInt(const char* js, const char* key, long* out) {
    std::string k = std::string("\"") + key + "\":";
    const char* p = strstr(js, k.c_str());
    if (!p) return false;
    *out = strtol(p + k.size(), nullptr, 10);
    return true;
}

static void sendText(const std::string& s) {
    if (gWsOpen) emscripten_websocket_send_utf8_text(gWs, s.c_str());
    else gPending.push_back(s);
}

// The gateway WebSocket died: every socket on it is gone, and the next netConnect opens a fresh one
static void closeAll() {
    gWsOpen = false;
    gPending.clear();
    if (gWs > 0) {
        emscripten_websocket_close(gWs, 1000, "");
        emscripten_websocket_delete(gWs);
        gWs = 0;
    }
    for (auto& kv : gSockets) kv.second->status = NET_CLOSED;
}

static EM_BOOL onOpen(int, const EmscriptenWebSocketOpenEvent*, void*) {
    gWsOpen = true;
    for (auto& s : gPending) emscripten_websocket_send_utf8_text(gWs, s.c_str());
    gPending.clear();
    return EM_TRUE;
}

static EM_BOOL onMessage(int, const EmscriptenWebSocketMessageEvent* e, void*) {
    if (!e->isText) {
        if (e->numBytes < 5 || e->data[0] != 1) return EM_TRUE;   // type 2 = UDP, unused
        uint32_t id = (uint32_t)e->data[1] << 24 | e->data[2] << 16 | e->data[3] << 8 | e->data[4];
        auto it = gSockets.find(id);
        if (it != gSockets.end()) it->second->rx.insert(it->second->rx.end(), e->data + 5, e->data + e->numBytes);
        return EM_TRUE;
    }
    const char* js = (const char*)e->data;
    long id = 0, status = 0;
    if (!jsonInt(js, "id", &id)) return EM_TRUE;
    auto it = gSockets.find((uint32_t)id);
    if (it == gSockets.end()) return EM_TRUE;
    NetSocket* s = it->second;
    if (strstr(js, "\"type\":\"open\"")) {
        jsonInt(js, "status", &status);
        s->status = status == 0 ? NET_OPEN : NET_CLOSED;
    } else if (strstr(js, "\"type\":\"close\"") || strstr(js, "\"type\":\"error\"") ||
               strstr(js, "\"type\":\"shutdown\"")) {
        s->status = NET_CLOSED;   // buffered bytes stay readable; recv reports 0 once they are drained
    }
    return EM_TRUE;
}

static EM_BOOL onClose(int, const EmscriptenWebSocketCloseEvent*, void*) { closeAll(); return EM_TRUE; }
static EM_BOOL onError(int, const EmscriptenWebSocketErrorEvent*, void*) { closeAll(); return EM_TRUE; }

static bool ensureWs() {
    if (gWs > 0) return true;
    EmscriptenWebSocketCreateAttributes attr;
    emscripten_websocket_init_create_attributes(&attr);
    attr.url = gGatewayUrl.c_str();
    gWs = emscripten_websocket_new(&attr);
    if (gWs <= 0) return false;
    emscripten_websocket_set_onopen_callback(gWs, nullptr, onOpen);
    emscripten_websocket_set_onmessage_callback(gWs, nullptr, onMessage);
    emscripten_websocket_set_onclose_callback(gWs, nullptr, onClose);
    emscripten_websocket_set_onerror_callback(gWs, nullptr, onError);
    return true;
}

NetSocket* netConnect(const char* host, int port) {
    if (!ensureWs()) return nullptr;
    NetSocket* s = new NetSocket{gNextId++, NET_CONNECTING};
    gSockets[s->id] = s;
    char msg[320];
    snprintf(msg, sizeof msg, "{\"type\":\"open\",\"id\":%u,\"host\":\"%.200s\",\"port\":%d}", s->id, host, port);
    sendText(msg);
    return s;
}

NetStatus netStatus(NetSocket* s) { return s->status; }

static int recvCb(void* ctx, uint8_t* buf, int len) {
    NetSocket* s = (NetSocket*)ctx;
    size_t avail = s->rx.size() - s->rxPos;
    if (avail == 0) return s->status == NET_CLOSED ? 0 : -1;
    int n = (int)(avail < (size_t)len ? avail : (size_t)len);
    memcpy(buf, s->rx.data() + s->rxPos, n);
    s->rxPos += n;
    if (s->rxPos == s->rx.size()) { s->rx.clear(); s->rxPos = 0; }
    return n;
}

static int sendCb(void* ctx, const uint8_t* buf, int len) {
    NetSocket* s = (NetSocket*)ctx;
    if (s->status != NET_OPEN || !gWsOpen) return -2;
    std::vector<uint8_t> f(5 + len);
    f[0] = 1;
    f[1] = s->id >> 24; f[2] = s->id >> 16; f[3] = s->id >> 8; f[4] = s->id;
    memcpy(f.data() + 5, buf, len);
    return emscripten_websocket_send_binary(gWs, f.data(), (uint32_t)f.size()) == EMSCRIPTEN_RESULT_SUCCESS ? len : -2;
}

int netEvent(NetSocket* s) {
    if (s->rx.size() > s->rxPos) return 1;
    return s->status == NET_CLOSED ? 0x20 : 0;
}

YgTransport netTransport(NetSocket* s) { return YgTransport{s, recvCb, sendCb}; }

void netClose(NetSocket* s) {
    if (!s) return;
    // always: after a server-side "shutdown" the gateway still holds a half-open TCP socket until it gets "close"
    if (gWs > 0) sendText("{\"type\":\"close\",\"id\":" + std::to_string(s->id) + "}");
    gSockets.erase(s->id);
    delete s;
}
