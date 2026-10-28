// yo2NationFlag.cpp: CNationFlag's flag table lookups, the texture and atlas cell it picks, and the real atlases.
#include <cstring>
#include <set>
#include <string>

#include "Game/Avatar/yo2NationFlag.h"
#include "avatar_stubs.h"
#include "game_test.h"

static void table() {
    CHECK(CNationFlag::kFlagCount == 148);
    std::set<std::string> codes;
    for (int i = 0; i < CNationFlag::kFlagCount; i++) {
        const CNationFlag::Entry& e = CNationFlag::kFlags[i];
        CHECK(e.id == i + 1);
        CHECK(codes.insert(e.code).second || (e.id == 118 && !std::strcmp(e.code, "ER")));   // ER twice (ids 78, 118)
        CHECK(e.smallRect[2] == 22 && e.smallRect[3] == 15 && e.bigRect[2] == 42 && e.bigRect[3] == 28);
    }
    CHECK(CNationFlag::isKnown("JP") && CNationFlag::isKnown("ES") && CNationFlag::isKnown("NPCG"));
    CHECK(!CNationFlag::isKnown("XX") && !CNationFlag::isKnown("") && !CNationFlag::isKnown("jp"));
    CHECK(!CNationFlag::isKnown("J"));   // whole-string compare, not a prefix
}

static void setNation() {
    CTask* root = CTask::createRoot();
    CNationFlag* f = CNationFlag::create(root, 5);
    CHECK(f && f->taskName() == "CNationFlag" && f->priority() == 5 && f->parent() == root);
    CHECK(f->drawMode_ == CElement::BLEND);   // onInit ran (TM_INIT from create)
    spriteLog().textures.clear();

    CHECK(f->setNation("AT", CNationFlag::BIG));
    CHECK(spriteLog().textures.back() == "data/avatar/flag/flag_4228_01.png");
    CHECK(f->rect_[0] == 0 && f->rect_[1] == 56 && f->rect_[2] == 42 && f->rect_[3] == 28);
    CHECK(f->setNation("JP", CNationFlag::SMALL));
    CHECK(spriteLog().textures.back() == "data/avatar/flag/flag_2215_01.png");
    CHECK(f->rect_[0] == 176 && f->rect_[1] == 60 && f->rect_[2] == 22 && f->rect_[3] == 15);
    CHECK(f->setNation("JP", CNationFlag::BIG) && spriteLog().textures.back() == "data/avatar/flag/flag_4228_03.png");
    CHECK(f->rect_[0] == 126 && f->rect_[1] == 140);

    CHECK(f->setNation("ER", CNationFlag::BIG) && f->rect_[0] == 84 && f->rect_[1] == 140);   // the first ER row wins
    CHECK(spriteLog().textures.back() == "data/avatar/flag/flag_4228_02.png");
    CHECK(f->setNation("JP", CNationFlag::BIG));

    size_t n = spriteLog().textures.size();
    CHECK(!f->setNation("ZZ", CNationFlag::BIG));   // unknown: nothing loaded, rect kept
    CHECK(f->setNation("AL", 2));                   // unknown size: true, nothing loaded
    CHECK(spriteLog().textures.size() == n && f->rect_[0] == 126 && f->rect_[1] == 140);

    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
}

// Every cell lies inside its real atlas.
static void realData() {
    if (!mergeDat()) {
        std::printf("avatar_nationflag_test: real flag atlases skipped (no YO2_MERGE_DAT)\n");
        return;
    }
    gameSetFileProvider(mergeProvider);
    CTask* root = CTask::createRoot();
    CNationFlag* f = CNationFlag::create(root, 0);
    std::set<std::string> files;
    for (int i = 0; i < CNationFlag::kFlagCount; i++) {
        const CNationFlag::Entry& e = CNationFlag::kFlags[i];
        for (int size = 0; size < 2; size++) {
            f->rect_[2] = f->rect_[3] = 0;
            CHECK(f->setNation(e.code, size));
            files.insert(spriteLog().textures.back());
            // setTexture saw the atlas size before setNation put the cell in: recompute it from the file
            const int32_t* r = size == CNationFlag::BIG ? e.bigRect : e.smallRect;
            CSpriteElm probe;
            probe.setTexture(spriteLog().textures.back().c_str());
            CHECK(probe.rect_[2] >= r[0] + r[2] && probe.rect_[3] >= r[1] + r[3]);
        }
    }
    CHECK(files.size() == 4);   // one small atlas, three big ones
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    gameSetFileProvider(fixtureProvider);
    std::printf("avatar_nationflag_test: all 148 flags inside the real atlases\n");
}

int main() {
    gameSetFileProvider(fixtureProvider);
    table();
    setNation();
    realData();
    std::printf("avatar_nationflag_test ok\n");
}
