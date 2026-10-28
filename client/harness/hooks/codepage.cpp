// System's code-page seams (src/System/yo2Widen.h) for the in-exe DLL: Windows' own conversion, as the exe does.
#include "System/yo2Widen.h"

#include <windows.h>

#include <cstdint>
#include <string>
#include <string_view>

std::u16string yo2CodePageToUtf16(uint32_t codePage, std::string_view s) {
    int n = MultiByteToWideChar(codePage, 0, s.data(), int(s.size()), nullptr, 0);
    std::u16string out(n, u'\0');
    MultiByteToWideChar(codePage, 0, s.data(), int(s.size()), reinterpret_cast<wchar_t*>(out.data()), n);
    return out;
}

std::string yo2Utf16ToCodePage(uint32_t codePage, std::u16string_view s) {
    const wchar_t* w = reinterpret_cast<const wchar_t*>(s.data());
    int n = WideCharToMultiByte(codePage, 0, w, int(s.size()), nullptr, 0, nullptr, nullptr);
    std::string out(n, '\0');
    WideCharToMultiByte(codePage, 0, w, int(s.size()), out.data(), n, nullptr, nullptr);
    return out;
}
