// yo2NameChecker.cpp: a typed-name checker (length bounds, forbidden words, forbidden characters) that sits in the
// exe between the scene manager and the studio but that nothing uses: no class derives from it there.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

#include "vc6.h"

class CNameChecker {
public:
    enum Result : int32_t { OK = 0, TOO_SHORT = 1, TOO_LONG = 2, BAD_CHAR = 3, BAD_WORD = 4 };

    virtual ~CNameChecker() = default;
    virtual uint32_t minLength() const = 0;
    virtual uint32_t maxLength() const = 0;

    int32_t check(const vc6::string& s) const;
    void loadWords(const char* file);
    // @yo2 0x006203f0 CNameChecker::setBadChars
    void setBadChars(const vc6::string& chars) { badChars_ = chars; }

private:
    std::vector<std::string> words_;  // 0x18
    vc6::string badChars_;            // 0x28
};
