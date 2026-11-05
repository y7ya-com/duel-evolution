// Web backend: Boxedwine's network-gateway.mjs protocol (one WebSocket, sockets multiplexed by a uint32 id).
//   text   {"type":"open","id":N,"host":"127.0.0.1","port":5730}  -> {"type":"open","id":N,"status":0}
//   text   {"type":"close","id":N}                                <-> {"type":"close","id":N} / {"type":"error",...}
//   binary [1][id u32 BE][payload]                                 both directions, TCP stream bytes
// Module.yo2NetRx / yo2NetRead count the bytes received and read (web/stall.js: what piled up during a long frame);
// Module.yo2NetIO(1 = sent | 0 = received) times the server's replies (web/stall.js).
// Resume (the server's seamless-deploys plan, stage 3, agreed with it): the URL carries ?sid=<32 hex, random per page>.
// When the WebSocket drops, the sockets on it stay open to the game (sends are kept, nothing reads as closed) while it
// is reopened with &resume=1 (0.5, 1, 2, 4, 8 s apart, for up to 40 s); its first frame is
//   {"type":"resume","sid":S,"socks":[{"id":N,"rx":B},...]}  B = payload bytes received on socket N
// and the server answers {"type":"resumed","socks":[{"id":N,"rx":B},...]} (B = bytes it received from us; a socket
// not listed is gone) and resends what we missed; we resend what it missed, from each socket's unacked bytes. Anything
// else (ok:false, an old gateway, no answer in 5 s, 40 s gone) closes every socket and the game recovers its own way.
// Both sides send {"type":"ack","id":N,"rx":B} (at most once a second) so the other can drop what it no longer needs.
#include "net.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <emscripten/em_asm.h>
#include <emscripten/emscripten.h>
#include <emscripten/websocket.h>
#include <map>
#include <string>
#include <vector>

struct NetSocket {
    uint32_t id;
    NetStatus status;
    std::vector<uint8_t> rx;
    size_t rxPos = 0;
    uint64_t rxTotal = 0, rxAcked = 0;   // payload bytes received; the last count we acked
    std::vector<uint8_t> tx;             // sent bytes the server hasn't acked (resent after a resume)
    uint64_t txBase = 0;                 // stream offset of tx[0]
    bool lost = false;                   // tx outgrew TX_MAX: this socket can't be resumed
};
static const size_t TX_MAX = 256 * 1024;

static std::string gGatewayUrl = "ws://127.0.0.1:8001/boxedwine-network";
static EMSCRIPTEN_WEBSOCKET_T gWs = 0;
static bool gWsOpen = false;
static std::vector<std::string> gPending;   // control messages queued until the WebSocket opens
static std::map<uint32_t, NetSocket*> gSockets;
static uint32_t gNextId = 1;
static char gSid[33];                  // this page's resume id
static bool gResuming = false;         // the WebSocket dropped and we're reconnecting
static bool gResumeSent = false;       // the reopened WebSocket got our resume; waiting for "resumed"
static double gResumeStart, gNextTry, gAnswerBy, gLastAck;
static int gTries;

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
    if (gWsOpen && !gResuming) emscripten_websocket_send_utf8_text(gWs, s.c_str());
    else gPending.push_back(s);
}

static bool ensureWsUrl(bool resume);

static void dropWs() {
    gWsOpen = false;
    if (gWs > 0) {
        emscripten_websocket_close(gWs, 1000, "");
        emscripten_websocket_delete(gWs);
        gWs = 0;
    }
}

// No resume: every socket on the WebSocket is gone, and the next netConnect opens a fresh one
static void closeAll() {
    EM_ASM({ Module.onYo2ShopClose?.(); });
    dropWs();
    gPending.clear();
    gResuming = gResumeSent = false;
    for (auto& kv : gSockets) kv.second->status = NET_CLOSED;
}

static void sendFrame(NetSocket* s, const uint8_t* buf, size_t len) {
    std::vector<uint8_t> f(5 + len);
    f[0] = 1;
    f[1] = s->id >> 24; f[2] = s->id >> 16; f[3] = s->id >> 8; f[4] = s->id;
    memcpy(f.data() + 5, buf, len);
    emscripten_websocket_send_binary(gWs, f.data(), (uint32_t)f.size());
}

// The WebSocket dropped: keep the open sockets for a resume (one still opening can't be resumed), or give up.
static void lostWs() {
    EM_ASM({ Module.onYo2ShopClose?.(); });
    if (gResuming) { dropWs(); gResumeSent = false; return; }   // a reopen attempt failed: the next try is due
    bool any = false;
    for (auto& kv : gSockets) {
        if (kv.second->status == NET_CONNECTING) kv.second->status = NET_CLOSED;
        any |= kv.second->status == NET_OPEN;
    }
    if (!any || !gSid[0]) { closeAll(); return; }
    dropWs();
    gResuming = true, gResumeSent = false, gTries = 0;
    gResumeStart = gNextTry = emscripten_get_now() + 500;
    EM_ASM({ console.log("net: the gateway WebSocket dropped: resuming"); });
}

static EM_BOOL onOpen(int, const EmscriptenWebSocketOpenEvent*, void*) {
    gWsOpen = true;
    if (gResuming) {   // the resume goes first; queued control messages wait for "resumed"
        std::string m = std::string("{\"type\":\"resume\",\"sid\":\"") + gSid + "\",\"socks\":[";
        bool first = true;
        for (auto& kv : gSockets) {
            if (kv.second->status != NET_OPEN) continue;
            m += (first ? "" : ",") + std::string("{\"id\":") + std::to_string(kv.first) + ",\"rx\":" +
                 std::to_string(kv.second->rxTotal) + "}";
            first = false;
        }
        m += "]}";
        emscripten_websocket_send_utf8_text(gWs, m.c_str());
        gResumeSent = true;
        gAnswerBy = emscripten_get_now() + 5000;
        return EM_TRUE;
    }
    for (auto& s : gPending) emscripten_websocket_send_utf8_text(gWs, s.c_str());
    gPending.clear();
    return EM_TRUE;
}

// {"type":"resumed","socks":[{"id":N,"rx":B},...]}: resend each listed socket's bytes past B, close the rest.
static void resumed(const char* js) {
    for (auto& kv : gSockets) {
        NetSocket* s = kv.second;
        if (s->status != NET_OPEN) continue;
        std::string key = "{\"id\":" + std::to_string(kv.first) + ",";
        const char* p = strstr(js, key.c_str());
        long rx = -1;
        if (!p || !jsonInt(p, "rx", &rx) || s->lost || (uint64_t)rx < s->txBase || (uint64_t)rx > s->txBase + s->tx.size()) {
            s->status = NET_CLOSED;
            continue;
        }
        s->tx.erase(s->tx.begin(), s->tx.begin() + (size_t)((uint64_t)rx - s->txBase));
        s->txBase = (uint64_t)rx;
        for (size_t o = 0; o < s->tx.size(); o += 16384) sendFrame(s, s->tx.data() + o, std::min<size_t>(16384, s->tx.size() - o));
    }
    gResuming = gResumeSent = false;
    for (auto& m : gPending) emscripten_websocket_send_utf8_text(gWs, m.c_str());
    gPending.clear();
    EM_ASM({ console.log("net: resumed"); });
}

// Each frame (from netStatus / netEvent): the resume's timers, and our acks.
static void tick() {
    double now = emscripten_get_now();
    if (gResuming) {
        if (now - gResumeStart > 40000) {
            EM_ASM({ console.log("net: resume gave up after 40 s"); });
            closeAll();
        } else if (gResumeSent && now > gAnswerBy) {
            EM_ASM({ console.log("net: no resume answer in 5 s"); });
            closeAll();
        } else if (gWs <= 0 && now >= gNextTry) {
            static const int kBackoff[] = {500, 1000, 2000, 4000, 8000};
            gNextTry = now + kBackoff[gTries < 4 ? gTries : 4];
            gTries++;
            ensureWsUrl(true);
        }
        return;
    }
    if (!gWsOpen || now - gLastAck < 1000) return;
    gLastAck = now;
    for (auto& kv : gSockets) {
        NetSocket* s = kv.second;
        if (s->status != NET_OPEN || s->rxTotal == s->rxAcked) continue;
        s->rxAcked = s->rxTotal;
        sendText("{\"type\":\"ack\",\"id\":" + std::to_string(kv.first) + ",\"rx\":" + std::to_string(s->rxTotal) + "}");
    }
}

static EM_BOOL onMessage(int, const EmscriptenWebSocketMessageEvent* e, void*) {
    if (!e->isText) {
        if (e->numBytes < 5 || e->data[0] != 1) return EM_TRUE;   // type 2 = UDP, unused
        uint32_t id = (uint32_t)e->data[1] << 24 | e->data[2] << 16 | e->data[3] << 8 | e->data[4];
        auto it = gSockets.find(id);
        if (it == gSockets.end()) return EM_TRUE;
        it->second->rx.insert(it->second->rx.end(), e->data + 5, e->data + e->numBytes);
        it->second->rxTotal += e->numBytes - 5;
        EM_ASM({ Module.yo2NetRx = (Module.yo2NetRx | 0) + $0; if (Module.yo2NetIO) Module.yo2NetIO(0); }, e->numBytes - 5);
        return EM_TRUE;
    }
    const char* js = (const char*)e->data;
    long id = 0, status = 0;
    if (gResumeSent) {   // the answer to our resume
        if (strstr(js, "\"type\":\"resumed\"")) resumed(js);
        else { EM_ASM({ console.log("net: resume refused"); }); closeAll(); }
        return EM_TRUE;
    }
    if (strstr(js, "\"type\":\"ack\"")) {
        long rx = 0;
        auto it = jsonInt(js, "id", &id) && jsonInt(js, "rx", &rx) ? gSockets.find((uint32_t)id) : gSockets.end();
        if (it != gSockets.end() && (uint64_t)rx > it->second->txBase && (uint64_t)rx <= it->second->txBase + it->second->tx.size()) {
            NetSocket* s = it->second;
            s->tx.erase(s->tx.begin(), s->tx.begin() + (size_t)((uint64_t)rx - s->txBase));
            s->txBase = (uint64_t)rx;
        }
        return EM_TRUE;
    }
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

// 4012: the server is updating, and the new instance can't resume (its sockets are in the old one's memory): close
// at once and let the game rejoin its own way (its retries outlast the old instance's 503 "server-update").
static EM_BOOL onClose(int, const EmscriptenWebSocketCloseEvent* e, void*) {
    if (e->code == 4012 && !gResuming) closeAll();
    else lostWs();
    return EM_TRUE;
}
static EM_BOOL onError(int, const EmscriptenWebSocketErrorEvent*, void*) { lostWs(); return EM_TRUE; }

static bool ensureWsUrl(bool resume) {
    if (gWs > 0) return true;
    if (!gSid[0]) EM_ASM({   // 16 random bytes, as hex
        var b = new Uint8Array(16); crypto.getRandomValues(b);
        var h = ""; for (var i = 0; i < 16; i++) h += (b[i] < 16 ? "0" : "") + b[i].toString(16);
        stringToUTF8(h, $0, 33);
    }, gSid);
    std::string url = gGatewayUrl + (gGatewayUrl.find('?') == std::string::npos ? "?" : "&") + "sid=" + gSid +
                      (resume ? "&resume=1" : "");
    EmscriptenWebSocketCreateAttributes attr;
    emscripten_websocket_init_create_attributes(&attr);
    attr.url = url.c_str();
    gWs = emscripten_websocket_new(&attr);
    if (gWs <= 0) return false;
    emscripten_websocket_set_onopen_callback(gWs, nullptr, onOpen);
    emscripten_websocket_set_onmessage_callback(gWs, nullptr, onMessage);
    emscripten_websocket_set_onclose_callback(gWs, nullptr, onClose);
    emscripten_websocket_set_onerror_callback(gWs, nullptr, onError);
    return true;
}
static bool ensureWs() { return gResuming ? true : ensureWsUrl(false); }

NetSocket* netConnect(const char* host, int port) {
    if (!ensureWs()) return nullptr;
    NetSocket* s = new NetSocket{gNextId++, NET_CONNECTING};
    gSockets[s->id] = s;
    char msg[320];
    snprintf(msg, sizeof msg, "{\"type\":\"open\",\"id\":%u,\"host\":\"%.200s\",\"port\":%d}", s->id, host, port);
    sendText(msg);
    return s;
}

NetStatus netStatus(NetSocket* s) { tick(); return s->status; }

static int recvCb(void* ctx, uint8_t* buf, int len) {
    NetSocket* s = (NetSocket*)ctx;
    size_t avail = s->rx.size() - s->rxPos;
    if (avail == 0) return s->status == NET_CLOSED ? 0 : -1;
    int n = (int)(avail < (size_t)len ? avail : (size_t)len);
    memcpy(buf, s->rx.data() + s->rxPos, n);
    s->rxPos += n;
    EM_ASM({ Module.yo2NetRead = (Module.yo2NetRead | 0) + $0; }, n);
    if (s->rxPos == s->rx.size()) { s->rx.clear(); s->rxPos = 0; }
    return n;
}

static int sendCb(void* ctx, const uint8_t* buf, int len) {
    NetSocket* s = (NetSocket*)ctx;
    if (s->status != NET_OPEN || (!gWsOpen && !gResuming)) return -2;
    if (!s->lost) {   // kept until the server acks it: a resume resends it
        s->tx.insert(s->tx.end(), buf, buf + len);
        if (s->tx.size() > TX_MAX) s->lost = true, s->txBase += s->tx.size(), s->tx.clear();
    }
    if (gResuming) return len;   // goes out after "resumed"
    EM_ASM({ if (Module.yo2NetIO) Module.yo2NetIO(1); });
    sendFrame(s, buf, (size_t)len);
    return len;
}

int netEvent(NetSocket* s) {
    tick();
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
