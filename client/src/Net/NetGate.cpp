#include "NetGate.h"

#include <cstring>

// @yo2 0x0069a650 0x2005 client version
void CNetGate::sendVersion() {
    ygClear(&out);
    ygBegin(&out, 0x2005);
    ygPutBytes(&out, "Ver.080912.00", 13);
    ygEnd(&out);
    send();
    flag(GATE_REQ_VERSION) = 1;
}

// @yo2 0x0069a4b0 gate message handler
int32_t CNetGate::onRecv() {
    YgPacket* p = in();
    if (!p) return YG_BAD_ARGS;
    switch (p->id) {
    case 0x2002: {
        uint32_t refused = 1;
        ygBeginRead(p);
        ygGet32(p, &refused);
        if (refused) {
            disconnect();
            result = YG_VERSION_ERROR;
            return YG_OK;
        }
        ygEndRead(p);
        listing = 1;
        servers.clear();
        break;
    }
    case 0x2003:
        parseServerList();
        break;
    case 0x2004:
        flag(GATE_REQ_VERSION) = 2;
        listing = 0;
        break;
    }
    return YG_OK;
}

// @yo2 0x0069a870 append a blank entry
CServerInfo& CNetGate::newEntry() {
    CServerInfo e{};
    e.id = e.kind = -1;
    e.lang = e.rank = e.area = -1;
    servers.push_back(e);
    return servers.back();
}

// @yo2 0x0069a6a0 0x2003: 48-byte records until the body runs out (several 0x2003 accumulate)
void CNetGate::parseServerList() {
    YgPacket* p = in();
    ygBeginRead(p);
    while (ygReadPos(p) != -1) {
        uint32_t id, kind;
        char name[17], ip[16];
        uint16_t port, players, extra;
        uint8_t lang, rank, area;
        ygGet32(p, &id);
        ygGet32(p, &kind);
        ygGetBytes(p, name, 16);
        ygGetBytes(p, ip, 15);
        ygGet16(p, &port);
        ygGet16(p, &players);
        ygGet8(p, &lang);
        ygGet8(p, &rank);
        ygGet8(p, &area);
        ygGet16(p, &extra);
        CServerInfo& e = newEntry();
        e.id = (int32_t)id;
        e.kind = (int32_t)kind;
        strcpy(e.name, name);
        strcpy(e.ip, ip);
        e.port = port;
        e.players = players;
        e.lang = (int8_t)lang;
        e.rank = (int8_t)rank;
        e.area = (int8_t)area;
        e.extra = extra;
    }
    ygEndRead(p);
}

// @yo2 0x0068ec70
const CServerList* CNetGate::list() const { return listing ? nullptr : &servers; }

// @yo2 0x0068ec30 the first account server (kind 1)
const CServerInfo* findAccountServer(const CServerList& l) {
    for (const CServerInfo& e : l)
        if (e.kind == SERVER_ACCOUNT) return &e;
    return nullptr;
}

// @yo2 0x0069a620
int32_t CNetGate::takeResult() {
    int32_t r = result;
    result = 0;
    return r;
}
