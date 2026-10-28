#include "yo2StringDB.h"

#include <cstring>

#include "yo2Debug.h"
#include "yo2File.h"

// @yo2 0x0061f960 static init: g_stringDB = new CStringDB
// @yo2 0x0061fa30 static init: atexit
// @yo2 0x0061fa10 static init: empty
// @yo2 0x0061fb10 CStringDB::CStringDB
// @yo2 0x0061faa0 CStringDB::~CStringDB
CStringDB* g_stringDB = new CStringDB;

// @yo2 0x0061fc40 CStringDB::GetString
vc6::string CStringDB::get(uint32_t index) const {
    YO2_ASSERT(index <= count(), "CStringDB::GetString() index over!");
    uint32_t off;
    std::memcpy(&off, idx_.data() + index * 4, 4);
    return vc6::string(reinterpret_cast<const char*>(bin_.data() + off));
}

// @yo2 0x0061fe50 CStringDB::load
bool CStringDB::load() {
    yo2LoadFile("data/common/yo2text_?.bin", bin_);
    yo2LoadFile("data/common/yo2text_?.idx", idx_);
    return true;
}
