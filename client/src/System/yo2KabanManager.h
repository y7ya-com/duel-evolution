// yo2KabanManager.cpp: CKabanManager, the per-card "kaban" (card case) record: three bytes for each of the 4096
// card numbers, kept in kaban.bin. The exe makes one at start-up (g_kabanManager); the deck screens read it.
#pragma once
#include <cstdint>

#include "vc6.h"

class CKabanManager final {
public:
    enum { CARDS = 0x1000 };
    struct Entry {
        uint8_t flag;   // 0 for a card number the deck lists show as new
        uint8_t count;
        uint8_t extra;
    };

    CKabanManager();
    ~CKabanManager();
    static void create();

    virtual bool save();
    virtual bool load();
    const Entry& entry(uint32_t card) const { return entries_[card - 1]; }  // card numbers start at 1
    Entry& entry(uint32_t card) { return entries_[card - 1]; }
    uint32_t flagTotal() const { return flagTotal_; }
    uint32_t countTotal() const { return countTotal_; }

private:
    vc6::string path() const;

    uint32_t flagTotal_ = 0;       // 0x0004 sum of every entry's flag (as loaded)
    uint32_t countTotal_ = 0;      // 0x0008 ... and count
    Entry entries_[CARDS] = {};    // 0x000c
    vc6::string fileName_;         // 0x300c "kaban.bin"
    vc6::string dir_;              // 0x301c
    struct Layout;
};
YO2_SIZEOF(CKabanManager, 0x302c);

extern CKabanManager* g_kabanManager;  // DAT_012714b4
