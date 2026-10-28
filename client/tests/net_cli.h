// Shared pieces of the src/Net test driver (net_cli.cpp + one tests/net_cli_<group>.cpp per message group).
// A group file registers its own verbs, so groups never edit net_cli.cpp:
//   NET_CLI("build", "lb.label") { lobby.someBuilder(...); });   -> "net_cli build" prints "<label> <wire hex>"
//   NET_CLI("call", "lb.name") { ... arg ... });                  -> script line "call lb.name" or "call lb.name=<arg>"
//   NET_CLI("dump", "social") { printf(...); });                  -> script line "dump social"
#pragma once
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <map>
#include <string>
#include <utility>
#include <vector>

#include "NetGate.h"
#include "NetLobby.h"
#include "NetUsb.h"
#include "UsbDuelpass/ygoUsbKey.h"

extern CNetGate gate;
extern CNetAccount acc;
extern CNetLobby lobby;
extern std::vector<uint8_t> g_out;   // everything sent since the last build/call

inline std::string hex(const uint8_t* b, size_t n) {
    std::string s;
    char t[3];
    for (size_t i = 0; i < n; i++) { snprintf(t, 3, "%02x", b[i]); s += t; }
    return s;
}
inline std::vector<uint8_t> unhex(const std::string& s) {
    std::vector<uint8_t> v;
    for (size_t i = 0; i + 1 < s.size(); i += 2) v.push_back((uint8_t)strtoul(s.substr(i, 2).c_str(), nullptr, 16));
    return v;
}
// dumps are split on whitespace: spaces in strings print as '_'
inline std::string str(const char* s, size_t n = 64) {
    std::string r(s, strnlen(s, n));
    for (char& c : r) if (c == ' ') c = '_';
    return r;
}
void dumpPlayer(const char* k, const CPlayerInfo& p);

using NetCliFn = std::function<void(const std::string& arg)>;
struct NetCliReg {
    static std::vector<std::pair<std::string, NetCliFn>>& list(const std::string& kind) {
        static std::map<std::string, std::vector<std::pair<std::string, NetCliFn>>> m;
        return m[kind];
    }
    static const NetCliFn* find(const std::string& kind, const std::string& name) {
        for (auto& e : list(kind)) if (e.first == name) return &e.second;
        return nullptr;
    }
    NetCliReg(const char* kind, const char* name, NetCliFn f) { list(kind).emplace_back(name, std::move(f)); }
};
#define NET_CLI_CAT2(a, b) a##b
#define NET_CLI_CAT(a, b) NET_CLI_CAT2(a, b)
#define NET_CLI(kind, name) static NetCliReg NET_CLI_CAT(netCliReg_, __COUNTER__)(kind, name, []([[maybe_unused]] const std::string& arg)
