#include "yo2Widen.h"

#include <cstdarg>
#include <cstdio>
#include <cstring>

#include "vc6ext.h"

uint32_t g_textCodePage = 1252;

void yo2SetTextCodePage(uint32_t codePage) { g_textCodePage = codePage; }

// @yo2 0x005977b0 widen: MultiByteToWideChar(g_textCodePage) into a wide string
std::u16string yo2Widen(std::string_view s) { return yo2CodePageToUtf16(g_textCodePage, s); }

// @yo2 0x006054c0 widenInto: into a fixed buffer of `cap` characters (NUL included), truncating
void yo2WidenInto(const char* s, char16_t* out, int cap) {
    if (cap <= 0)
        return;
    std::u16string w = yo2Widen(s ? s : "");
    size_t n = w.size() < size_t(cap - 1) ? w.size() : size_t(cap - 1);
    w.copy(out, n);
    out[n] = 0;
}

// @yo2 0x00605470 widen one double-byte character
char16_t yo2WidenChar(uint16_t dbcs) {
    const char bytes[2] = {static_cast<char>(dbcs >> 8), static_cast<char>(dbcs & 0xff)};
    std::u16string w = yo2CodePageToUtf16(g_textCodePage, std::string_view(bytes, 2));
    return w.empty() ? 0 : w[0];
}

// @yo2 0x006054f0 widen a string
int32_t yo2WidenTo(const vc6::string& s, vc6::wstring& out) {
    std::u16string w = yo2Widen(s);
    if (w.size() >= 0x400) {
        out = vc6::wstring();
        return 0;
    }
    out = vc6::wstring(std::u16string_view(w));
    return static_cast<int32_t>(w.size() + 1);
}

// @yo2 0x006056b0 narrow into a fixed buffer of `cap` bytes (NUL included), truncating
void yo2NarrowInto(const char16_t* s, char* out, int cap) {
    if (cap <= 0)
        return;
    std::string n = yo2Utf16ToCodePage(g_textCodePage, s ? s : u"");
    size_t len = n.size() < size_t(cap - 1) ? n.size() : size_t(cap - 1);
    std::memcpy(out, n.data(), len);
    out[len] = 0;
}

// @yo2 0x006056f0 narrow a string
int32_t yo2NarrowTo(const vc6::wstring& s, vc6::string& out) {
    std::string n = yo2Utf16ToCodePage(g_textCodePage, s);
    if (n.size() >= 0x400) {
        out = "";
        return 0;
    }
    out = vc6::string(std::string_view(n));
    return static_cast<int32_t>(n.size() + 1);
}

bool yo2IsLeadByte(uint8_t c) {
    switch (g_textCodePage) {
    case 932:
        return (c >= 0x81 && c <= 0x9f) || (c >= 0xe0 && c <= 0xfc);
    case 936:
    case 949:
    case 950:
        return c >= 0x81 && c <= 0xfe;
    default:
        return false;
    }
}

// @yo2 0x006058c0 isLeadByteAt: walk the string a character at a time
bool yo2IsLeadByteAt(const char* s, uint32_t i) {
    size_t n = std::strlen(s);
    for (size_t at = 0; at < n;) {
        bool lead = yo2IsLeadByte(static_cast<uint8_t>(s[at]));
        if (at == i)
            return lead;
        if (lead && at + 1 == i)
            return false;
        at += lead ? 2 : 1;
    }
    return false;
}

// @yo2 0x00605410 sprintf into a static buffer
const char* yo2Sprintf(const char* fmt, ...) {
    static char buf[0x400];  // DAT_0126fb5c
    va_list ap;
    va_start(ap, fmt);
    std::vsnprintf(buf, sizeof buf, fmt, ap);
    va_end(ap);
    return buf;
}

// @yo2 0x00605440 sprintf
void yo2SprintfInto(char* out, size_t cap, const char* fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    std::vsnprintf(out, cap, fmt, ap);
    va_end(ap);
}
