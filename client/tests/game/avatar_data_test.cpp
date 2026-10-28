// yo2AvatarData.cpp: CAvatarData defaults, set and equals; the default parts checked against the real PBIN map.
#include <cstring>

#include <cstdlib>
#include <map>

#include "Game/Avatar/yo2AvatarData.h"
#include "avatar_stubs.h"
#include "game_test.h"

static void defaults() {
    const uint8_t want[4][16] = {
        {0, 0, 0x20, 0x30, 0x40, 0x60, 0x70, 0x90, 0xb0, 0x20},
        {1, 0, 0x20, 0x30, 0x40, 0x60, 0x70, 0x90, 0xb0, 0x20},
        {0, 0, 0x20, 0x30, 0x40, 0x60, 0x80, 0x90, 0xb8, 0x20},
        {1, 0, 0x20, 0x30, 0x40, 0x60, 0x80, 0x90, 0xb8, 0x20},
    };
    CAvatarData a;   // the constructor picks MALE_DM
    CHECK(a.equals(want[0]));
    for (int t = 0; t < 4; t++) {
        std::memset(a.bytes_, 0xee, sizeof a.bytes_);   // every byte is rewritten, 10..15 included
        a.setDefault(t);
        CHECK(!std::memcmp(a.bytes_, want[t], 16));
    }
}

static void setEquals() {
    uint8_t b[16];
    for (int i = 0; i < 16; i++) b[i] = (uint8_t)(i * 7 + 1);
    CAvatarData a;
    CHECK(!a.equals(b));
    a.set(b);
    CHECK(a.equals(b) && !std::memcmp(a.bytes_, b, 16));
    b[15] ^= 1;   // the last byte counts too
    CHECK(!a.equals(b));
}

// Every default part is a real, initially owned PBIN of its sex, in the slot its byte says.
static void realData() {
    if (!mergeDat()) {
        std::printf("avatar_data_test: real yo2PbinMap.dat skipped (no YO2_MERGE_DAT)\n");
        return;
    }
    // yo2PbinMap.dat read directly (CPbinDictionary's header pulls in src/Net's own CAvatarData stand-in)
    gameSetFileProvider(mergeProvider);
    struct Row { int initial, kind, slot, series; };
    std::map<uint32_t, Row> d;
    GameFile f;
    CHECK(f.read("data/common/yo2PbinMap.dat") == 0);
    char line[0x400];
    while (f.readLine(line, sizeof line) == 0) {
        int c[8] = {};
        char* p = line;
        for (int i = 0; i < 8 && p; i++) {
            c[i] = std::atoi(p);
            p = std::strchr(p, ',');
            if (p) p++;
        }
        if (line[0] >= '0' && line[0] <= '9') d[c[0]] = {c[2], c[3], c[4], c[7]};
    }
    CHECK(d.size() == 1024);
    for (int t = 0; t < 4; t++) {
        CAvatarData a;
        a.setDefault(t);
        int sex = a.bytes_[CAvatarData::SEX];
        for (int slot = 1; slot <= 9; slot++) {
            uint32_t pbin = a.bytes_[slot] + 256 * sex;
            int wantSlot = slot == CAvatarData::ACCESSORY2 ? 2 : slot;   // "none" is the slot-2 entry
            CHECK(d[pbin].kind == 1 + sex && d[pbin].slot == wantSlot && d[pbin].initial == 1);
            if (slot == CAvatarData::CLOTHES || slot == CAvatarData::DUEL_DISK)
                CHECK(d[pbin].series == (t < 2 ? 2 : 3));   // DM / GX
        }
    }
    gameSetFileProvider(fixtureProvider);
    std::printf("avatar_data_test: defaults match the real yo2PbinMap.dat\n");
}

int main() {
    defaults();
    setEquals();
    realData();
    std::printf("avatar_data_test ok\n");
}
