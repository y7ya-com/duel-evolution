#include "yo2KabanManager.h"

#include <algorithm>
#include <cstring>
#include <vector>

#include "yo2File.h"

CKabanManager* g_kabanManager;

// @yo2 0x006138c0 CKabanManager::CKabanManager
CKabanManager::CKabanManager() : fileName_("kaban.bin"), dir_("") {}

// @yo2 0x00613820 CKabanManager::~CKabanManager
CKabanManager::~CKabanManager() = default;

// @yo2 0x006136e0 CKabanManager::Create
void CKabanManager::create() { g_kabanManager = new CKabanManager; }

vc6::string CKabanManager::path() const {
    vc6::string p = dir_;
    p += "\\";
    p += std::string_view(fileName_);
    return p;
}

// @yo2 0x00613ac0 CKabanManager::save
bool CKabanManager::save() { return yo2SaveFile(path().c_str(), entries_, sizeof entries_); }

// @yo2 0x00613c30 CKabanManager::load: the entries (a short file leaves the rest zero), then the totals
bool CKabanManager::load() {
    std::vector<uint8_t> data;
    if (!yo2LoadFile(path().c_str(), data))
        return false;
    flagTotal_ = countTotal_ = 0;
    std::memset(entries_, 0, sizeof entries_);
    size_t n = std::min<size_t>(data.size() / sizeof(Entry), CARDS);
    std::memcpy(entries_, data.data(), n * sizeof(Entry));
    for (size_t i = 0; i < n; ++i) {
        flagTotal_ += entries_[i].flag;
        countTotal_ += entries_[i].count;
    }
    return true;
}

struct CKabanManager::Layout {
    YO2_AT(CKabanManager, flagTotal_, 0x0004);
    YO2_AT(CKabanManager, entries_, 0x000c);
    YO2_AT(CKabanManager, fileName_, 0x300c);
    YO2_AT(CKabanManager, dir_, 0x301c);
};
