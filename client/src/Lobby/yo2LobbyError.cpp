// The lobby's error messages (the exe's src\Lobby\yo2LobbyError.cpp; the state itself is in yo2LobbyError.h).
#include "yo2LobbyError.h"

#include "System/yo2StringDB.h"

namespace {
struct ErrorText {
    int32_t code;
    int32_t textId;
    bool withCode;   // "%s(%d)"
};
// Everything not listed: string 0x1194 with the code.
const ErrorText kErrors[] = {
    {-0x288, 0x1ba2, false}, {-0x287, 0x1b96, false}, {-0x285, 0x11d6, false}, {-0x284, 0x11d5, false},
    {-0x283, 0x11d4, false}, {-0x282, 0x11d3, false}, {-0x281, 0x11d2, false}, {-0x280, 0x11d1, false},
    {-0x276, 0x11ce, false}, {-0x26c, 0x11d0, false}, {-0x26a, 0x11cf, false}, {-0x268, 0x11ce, false},
    {-0x266, 0x11cd, false}, {-0x262, 0x11cb, false}, {-0x260, 0x11ca, false}, {-0x25e, 0x11c9, false},
    {-0x25c, 0x11c9, true},  {-0x25a, 0x11c9, true},  {-600, 0x11e0, false},   {-0x1fe, 0x11c6, false},
    {-0x1f9, 0x11f2, false}, {-0x1f8, 0x11c7, false}, {-0x1f7, 0x11c5, true},  {-0x1f6, 0x11c5, true},
    {-0x1f5, 0x11c5, true},  {-0x1f1, 0x11c5, true},  {-0x1f0, 0x11c5, true},  {-0x1ef, 0x11ec, true},
    {-0x1ee, 0x11ec, true},  {-0x1ed, 0x11ec, true},  {-0x1ec, 0x11c1, true},  {-0x191, 0x11c1, true},
    {-0x10b, 0x11bc, false}, {-0x10a, 0x11bb, false}, {-0x107, 0x11ba, false}, {-0x106, 0x11b9, false},
    {-0x105, 0x11b8, false},
};
}  // namespace

vc6::string lobbyErrorMessage(int32_t code, vc6::string* url) {
    char buf[260];
    if (code == -0x264) {   // -612: and where to go about it
        *url = lobbyErrorUrl();
        std::snprintf(buf, sizeof buf, "%s\n\n%s", g_stringDB->get(0x11cc).c_str(), url->c_str());
        return buf;
    }
    for (const ErrorText& e : kErrors)
        if (e.code == code) {
            if (!e.withCode) return g_stringDB->get(e.textId);
            std::snprintf(buf, sizeof buf, "%s(%d)", g_stringDB->get(e.textId).c_str(), code);
            return buf;
        }
    std::snprintf(buf, sizeof buf, "%s(%d)", g_stringDB->get(0x1194).c_str(), code);
    return buf;
}
