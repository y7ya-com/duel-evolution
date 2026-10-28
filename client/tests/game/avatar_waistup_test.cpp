// yo2WaistUpAvatar.cpp: CWADictionary, the waist-up parts tables (data/Avatar/wu/wm_data.csv, ww_data.csv).
#include <cstring>

#include "Game/Avatar/yo2WaistUpAvatar.h"
#include "game_test.h"

int main() {
    gameSetFileProvider(fixtureProvider);
    fixtureFiles()["data/Avatar/wu/wm_data.csv"] = "// parts\r\n\r\n3,9,a1.png,a2.png,a3.png,a4.png,a5.png,a6.png,a7.png,1,2,3,4\r\n"
                                                    "3,5,b.png,,,,,,,5,6,7,8\r\n";
    fixtureFiles()["data/Avatar/wu/ww_data.csv"] = "12,200,x.png\r\n";
    CTask* root = CTask::createRoot();
    CWADictionary::create(root);   // onInit loads
    auto* d = dynamic_cast<CWADictionary*>(root->children().front());
    CHECK(d && d->count_[0] == 2 && d->count_[1] == 1);
    const WaistUpPart& a = d->parts_[0][0];
    CHECK(a.kind == 3 && a.number == 9 && !std::strcmp(a.images[0], "a1.png") && !std::strcmp(a.images[6], "a7.png"));
    CHECK(a.rect[0] == 1 && a.rect[3] == 4);
    const WaistUpPart& b = d->parts_[0][1];   // strtok skips the empty columns: 5..8 land in images 1..4
    CHECK(!std::strcmp(b.images[0], "b.png") && !std::strcmp(b.images[1], "5") && !std::strcmp(b.images[4], "8"));
    CHECK(d->maxNumber_[0][3] == 9 && d->maxNumber_[1][12] == 200 && d->parts_[1][0].number == 200);
    fixtureFiles().clear();

    if (mergeDat()) {
        gameSetFileProvider(mergeProvider);
        CWADictionary real;
        CHECK(real.load() && real.count_[0] > 100 && real.count_[1] > 90);
        const WaistUpPart& p = real.parts_[0][0];
        CHECK(p.kind == 0 && p.number == 144 && !std::strcmp(p.images[0], "wm_h2_01_c01.png"));
        CHECK(p.rect[0] == 0 && p.rect[1] == 160 && p.rect[2] == 768 && p.rect[3] == 160);
        CHECK(!std::strcmp(real.parts_[1][0].images[6], "ww_h2_01_c07.png") && real.maxNumber_[0][0] >= 147);
        std::printf("avatar_waistup_test: real tables %d + %d parts\n", real.count_[0], real.count_[1]);
    }
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    std::printf("avatar_waistup_test ok\n");
}
