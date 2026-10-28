// System's code-page seams (src/System/yo2Widen), Latin-1 stand-ins as in tests/game/platform_stubs.cpp: the real
// ones are platform's. Linked into every misc test's archive, so only tests that reach yo2Widen pull them in.
#include <cstdint>
#include <string>
#include <string_view>

std::u16string yo2CodePageToUtf16(uint32_t, std::string_view s) {
    std::u16string out;
    for (char c : s)
        out += char16_t(uint8_t(c));
    return out;
}
std::string yo2Utf16ToCodePage(uint32_t, std::u16string_view s) {
    std::string out;
    for (char16_t c : s)
        out += c < 0x100 ? char(c) : '?';
    return out;
}

// Net's gate seams (src/Net/NetUi.h; the game's are in src/Net/app): never connected here
std::string appGateServer() { return "127.0.0.1"; }
int32_t appGatePort() { return 0; }
