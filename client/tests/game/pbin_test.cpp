// yo2PlayerBin.cpp: CPbinDictionary (data/common/yo2PbinMap.dat) and the GameFile line reader it loads through.
#include <cstring>

#include "Game/yo2PlayerBin.h"
#include "Net/NetAccount.h"
#include "game_test.h"

static void lineReader() {
    fixtureFiles()["f"] = "ab\r\nc\nd\r\n\r\nlast";
    GameFile f;
    char buf[8];
    CHECK(f.readLine(buf, sizeof buf) == 3);   // nothing read yet
    CHECK(f.read("f") == 0);
    CHECK(f.readLine(buf, sizeof buf) == 0 && !std::strcmp(buf, "ab"));
    CHECK(f.readLine(buf, sizeof buf) == 0 && !std::strcmp(buf, "c\nd"));   // a lone LF stays in the line
    CHECK(f.readLine(buf, sizeof buf) == 0 && !std::strcmp(buf, ""));
    CHECK(f.readLine(buf, sizeof buf) == 0 && !std::strcmp(buf, "last"));   // no CR LF at the end
    CHECK(f.readLine(buf, sizeof buf) == 1);
    fixtureFiles()["g"] = "0123456789\r\n";
    CHECK(f.read("g") == 0);
    CHECK(f.readLine(buf, 4) == 2 && !std::strcmp(buf, "012"));   // size-1 bytes, then the rest
    CHECK(f.readLine(buf, sizeof buf) == 2 && !std::strcmp(buf, "3456789"));   // fills buf: CR LF not seen yet
    CHECK(f.readLine(buf, sizeof buf) == 0 && !std::strcmp(buf, ""));
    CHECK(f.read("missing") != 0 && f.readLine(buf, sizeof buf) == 3);
}

static void loadFixture() {
    std::string s = "// comment\r\n\r\n";
    s += "5,7,1,2,3,3257,label,9\r\n";
    s += "6,8,0,10,7600,9100,,1\r\n";   // strtok skips the empty label: 1 lands in column 6, so series stays 0
    for (int i = 0; i < 1100; i++) s += "1,1,1,1,1,1,x,1\r\n";   // more than 1024 lines: the rest is ignored
    fixtureFiles()["data/common/yo2PbinMap.dat"] = s;
    CPbinDictionary d;
    CHECK(d.load());
    PbinInfo e;
    CHECK(d.getInfo(0, &e) && e.pbin == 5 && e.number == 7 && e.initial == 1 && e.kind == 2 && e.slot == 3 &&
          e.nameText == 3257 && e.series == 9);
    CHECK(d.getInfo(1, &e) && e.kind == 10 && e.slot == 7600 && e.nameText == 9100 && e.series == 0);
    CHECK(d.getInfo(1023, &e) && e.pbin == 1);
    CHECK(d.initial(0) == 1 && d.kind(0) == 2 && d.slot(0) == 3 && d.nameText(0) == 3257 && d.series(0) == 9);
    fixtureFiles().erase("data/common/yo2PbinMap.dat");
    CHECK(!d.load());
}

static void collect() {
    CPbinDictionary d;
    // kind 1 slot 6 (clothes): series 1 (common), 2 (DM), 3 (GX); one of another slot
    int rows[][7] = {{0, 0, 1, 1, 6, 10, 1}, {1, 1, 1, 1, 6, 11, 2}, {2, 2, 1, 1, 6, 12, 3}, {3, 3, 1, 1, 5, 13, 2},
                     {4, 4, 1, 1, 6, 14, 2}};
    for (int i = 0; i < 5; i++) std::memcpy(&d.info_[i], rows[i], sizeof rows[i]);
    CPlayerBinData owned{};
    owned.pbin[0] = 0x0f;   // owns 0..3, not 4
    PbinList dm;
    CHECK(d.collect(owned, 0, 4, 1, 6, 2, &dm));
    CHECK(dm.size() == 2 && dm[0].pbin == 0 && dm[1].pbin == 1);   // common + DM, owned, slot 6
    PbinList none;
    CHECK(!d.collect(owned, 3, 4, 1, 6, 3, &none) && none.empty());
    PbinList gx;
    gx.push_back(d.info_[3]);
    CHECK(d.collect(owned, 1, 1, 1, 6, 3, &gx) && gx.size() == 1);   // appends; true because out isn't empty
}

static void realData() {
    if (!mergeDat()) {
        std::printf("pbin_test: real yo2PbinMap.dat skipped (no YO2_MERGE_DAT)\n");
        return;
    }
    gameSetFileProvider(mergeProvider);
    CTask* root = CTask::createRoot();
    CPbinDictionary* d = CPbinDictionary::create(root);   // TM_INIT -> onInit -> load
    CHECK(d);
    PbinInfo e;
    CHECK(d->getInfo(0, &e) && e.pbin == 0 && e.initial == 1 && e.kind == 1 && e.slot == 1 && e.nameText == 3257 &&
          e.series == 1);
    CHECK(d->getInfo(112, &e) && e.slot == 6 && e.nameText == 3310 && e.series == 2);   // Domino uniform: DM
    CHECK(d->getInfo(225, &e) && e.kind == 10 && e.slot == 7601 && e.nameText == 9150);   // the "developer" title
    int initial = 0;
    for (uint32_t i = 0; i < CPbinDictionary::COUNT; i++) {
        CHECK(d->getInfo(i, &e) && e.pbin == (int32_t)i);   // the file lists PBIN 0..1023 in order
        initial += e.initial;
    }
    CHECK(initial == 55);
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    gameSetFileProvider(fixtureProvider);
    std::printf("pbin_test: real yo2PbinMap.dat ok (1024 entries, 55 owned from the start)\n");
}

int main() {
    gameSetFileProvider(fixtureProvider);
    lineReader();
    loadFixture();
    collect();
    realData();
    std::printf("pbin_test ok\n");
}
