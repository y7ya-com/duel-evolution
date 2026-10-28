// CIME.cpp's code-page helpers. The game is ANSI (CP932/CP1252/CP949... by language); text is drawn from UTF-16.
#pragma once
#include <cstdint>
#include <string>
#include <string_view>

extern uint32_t g_textCodePage;  // DAT_0127035c, set by CSystemConfigManager::applyLanguage

void yo2SetTextCodePage(uint32_t codePage);
std::u16string yo2Widen(std::string_view s);
void yo2WidenInto(const char* s, char16_t* out, int cap);

// MultiByteToWideChar for one code page (platform: an embedded CP932/CP949 table; tests: ASCII). Defined by the
// build that links System.
std::u16string yo2CodePageToUtf16(uint32_t codePage, std::string_view s);
// WideCharToMultiByte for one code page (the text code declares it too: yo2TextElm.h).
std::string yo2Utf16ToCodePage(uint32_t codePage, std::u16string_view s);

namespace vc6 {
class string;
class wstring;
}  // namespace vc6

// One double-byte character, lead byte in the high half (a single byte is 0x00xx, which converts to 0 as in the
// exe).
char16_t yo2WidenChar(uint16_t dbcs);
// MultiByteToWideChar / WideCharToMultiByte through a 1024-character buffer; the converted length plus one (the
// API's count with the NUL), 0 on failure (the output is then empty).
int32_t yo2WidenTo(const vc6::string& s, vc6::wstring& out);
int32_t yo2NarrowTo(const vc6::wstring& s, vc6::string& out);
void yo2NarrowInto(const char16_t* s, char* out, int cap);
// _ismbblead under the text code page: CP932 0x81-0x9f/0xe0-0xfc, the other double-byte pages 0x81-0xfe.
bool yo2IsLeadByte(uint8_t c);
// Whether byte `i` of `s` begins a double-byte character (false for single bytes and for trail bytes).
bool yo2IsLeadByteAt(const char* s, uint32_t i);
// sprintf into a static buffer (valid until the next call) / into the caller's.
const char* yo2Sprintf(const char* fmt, ...);
void yo2SprintfInto(char* out, size_t cap, const char* fmt, ...);
