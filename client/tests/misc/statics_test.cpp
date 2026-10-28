// src/Misc/HeaderStatics.cpp: the shared header's tables every file's initializer stubs build.
// sources: Misc/HeaderStatics.cpp
#include <cstdio>
#include <cstring>

#include "System/yo2Lang.h"

#define CHECK(c) \
    do { if (!(c)) { std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #c); return 1; } } while (0)

int main() {
    CHECK(std::strcmp(kLanguageNames[0].c_str(), "Japanese") == 0 && std::strcmp(kLanguageNames[7].c_str(), "Korean") == 0);
    CHECK(std::strcmp(kLanguageCodes[6].c_str(), "KOR") == 0);
    CHECK(std::strcmp(kNumberNames[7].c_str(), "8") == 0);
    CHECK(std::strcmp(kLetterNames[0].c_str(), "A") == 0 && std::strcmp(kLetterNames[7].c_str(), "H") == 0);
    std::puts("statics ok");
    return 0;
}
