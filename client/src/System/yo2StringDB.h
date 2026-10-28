// yo2StringDB.cpp: the game's text table. data/common/yo2text_?.idx is an array of uint32 offsets into
// yo2text_?.bin, which holds NUL-terminated strings ('?' = the language code). Every UI string is fetched by index.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

#include "vc6.h"

class CStringDB {
public:
    CStringDB() = default;
    virtual ~CStringDB() = default;
    virtual vc6::string get(uint32_t index) const;
    virtual std::u16string getW(uint32_t index) const;
    virtual bool load();
    uint32_t count() const { return static_cast<uint32_t>(idx_.size() / 4); }

private:
    // The exe keeps two yaneSDK CFile objects here (bin at +0x04, idx at +0x44; 0x84 bytes in all). Only reached
    // through g_stringDB, so the layout isn't kept.
    std::vector<uint8_t> bin_;
    std::vector<uint8_t> idx_;
};

extern CStringDB* g_stringDB;  // DAT_01271840
