#include "yo2NameChecker.h"

#include "yo2SystemConfig.h"

// @yo2 0x00620020 CNameChecker::check: length first, then the words, then the characters (bytes)
int32_t CNameChecker::check(const vc6::string& s) const {
    std::string_view v(s);
    if (maxLength() < v.size())
        return TOO_LONG;
    if (v.size() < minLength())
        return TOO_SHORT;
    for (const std::string& w : words_)
        if (v.find(w) != std::string_view::npos)  // an empty line matches everything, as in the exe
            return BAD_WORD;
    std::string_view bad(badChars_);
    for (char c : v)
        if (bad.find(c) != std::string_view::npos)
            return BAD_CHAR;
    return OK;
}

// @yo2 0x006202d0 CNameChecker::loadWords: one forbidden word per line
void CNameChecker::loadWords(const char* file) {
    std::vector<std::string> lines;
    yo2ReadTextFileLines(file, lines);
    words_.insert(words_.end(), lines.begin(), lines.end());
}
