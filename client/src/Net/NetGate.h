// CNetGate: the gate connection (5730). Sends the client version, receives the server list.
//   -> 0x2005 "Ver.080912.00"
//   <- 0x2002 u32 result (0 = version accepted), 0x2003 x N (48-byte CServerInfo records), 0x2004 end of list
#pragma once
#include <vector>

#include "MessageIO.h"

enum ServerKind : int32_t { SERVER_ACCOUNT = 1, SERVER_LOBBY = 3 };

struct CServerInfo {
    uint32_t _vtbl;     // 0x00
    int32_t id;         // 0x04
    int32_t kind;       // 0x08 ServerKind
    char name[17];      // 0x0c
    char ip[17];        // 0x1d dotted IPv4 (15 on the wire + NUL)
    uint16_t port;      // 0x2e
    uint16_t players;   // 0x30 shown as "%s (%4d/1000)" in the room list
    int8_t lang;        // 0x32 b1: 0-7 language, 6 = world (YOLaucher puerta.py)
    int8_t rank;        // 0x33 b2: room type; 12 = My Room
    int8_t area;        // 0x34 b3: room / area number
    uint16_t extra;     // 0x36

    const char* address() const { return ip; }   // @yo2 0x0068ec10
};
YO2_AT(CServerInfo, name, 0x0c);
YO2_AT(CServerInfo, ip, 0x1d);
YO2_AT(CServerInfo, port, 0x2e);
YO2_AT(CServerInfo, lang, 0x32);
YO2_AT(CServerInfo, extra, 0x36);
static_assert(sizeof(CServerInfo) == 0x38, "CServerInfo size");

using CServerList = std::vector<CServerInfo>;

enum : int {
    GATE_REQ_VERSION = 0x1c,   // 1 = 0x2005 sent, 2 = list complete
};

struct CNetGate : CMessageIOBase {
    uint8_t _534[0x14];        // 0x534 portable: the exe keeps the list here (a vector of yaneSDK smart_ptr); see servers
    uint8_t listing;           // 0x548 between 0x2002 and 0x2004: the list is incomplete, list() returns null
    int32_t result;            // 0x54c YG_VERSION_ERROR after a refused version
    CServerList servers;        // past the exe's 0x550 bytes

    void init();                         // FUN_0069a210 the constructor's body (members: C++'s)
    void sendVersion();                  // FUN_0069a650
    int32_t onRecv();                    // FUN_0069a4b0
    void parseServerList();              // FUN_0069a6a0
    CServerInfo& newEntry();             // FUN_0069a870
    const CServerList* list() const;      // FUN_0068ec70
    int32_t takeResult();                // FUN_0069a620: result, then cleared
};
YO2_AT(CNetGate, listing, 0x548);
YO2_AT(CNetGate, result, 0x54c);

const CServerInfo* findAccountServer(const CServerList& l);   // FUN_0068ec30
