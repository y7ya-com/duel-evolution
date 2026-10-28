// yo2ChibiAvatarElm.cpp: the part-name rules (checked against every chibi PNG in merge.dat), engines per motion and
// facing, the motion queue, walking (smoothing, walls, exits), texture requests, the foot probes.
#include <cmath>
#include <set>

#include "Game/Avatar/yo2ChibiAvatarElm.h"
#include "avatar_stubs.h"
#include "game_test.h"

static int engineCount(CChibiAvatarElm* e) {
    int n = 0;
    for (auto& p : e->engines_) n += dynamic_cast<CSwfEngine*>(p.task()) != nullptr;
    return n;
}

static void tables() {
    CHECK(CChibiAvatarElm::motionIndex(0, 0) == 0 && CChibiAvatarElm::motionIndex(6, 7) == 55);
    CHECK(CChibiAvatarElm::motionIndex(9, 3) == 3);   // unknown motion: standing
    // facings: 0 = +y, then turning through -x (2), -y (4), +x (6)
    CHECK(CChibiAvatarElm::dirFromVector({0, 1, 0}) == 0 && CChibiAvatarElm::dirFromVector({-1, 0, 0}) == 2);
    CHECK(CChibiAvatarElm::dirFromVector({0, -1, 0}) == 4 && CChibiAvatarElm::dirFromVector({1, 0, 0}) == 6);
    CHECK(CChibiAvatarElm::dirFromVector({1, 1, 0}) == 7 && CChibiAvatarElm::dirFromVector({-1, -1, 0}) == 3);
    CHECK(CChibiAvatarElm::kPlayerMotionFiles[13] == "data/Avatar/chibi/cm_w04.txt");   // walk, facing 5 = 3
    CHECK(CChibiAvatarElm::kNpcMotionFiles[8].empty() && CChibiAvatarElm::kNpcMotionFiles[25] == "data/Avatar/chibi/cn_t02.txt");
}

static std::vector<std::string> cmNames() {
    return {"cm_atari_01.png", "cm_h2_01_c01_n01_01.png", "cm_bo_01_c01_n01_01.png", "cm_dc_01_c01_n01_01.png",
            "cm_mo_01_c01_n01_01.png", "cm_ey_01_c01_n01_01.png", "cm_a1_01_c01_n01_01.png",
            "cm_a2_01_c01_n01_01.png", "cm_h1_01_c01_n01_01.png", "cm_dd_01_c01_d01_01.png", "cw_a1_01_c01_x.png"};
}

static void partRules() {
    CAvatarData d;
    d.setDefault(CAvatarData::MALE_GX);
    uint8_t* b = d.bytes_;
    b[CAvatarData::FRONT_HAIR] = 10;   // afro 1 (11th front hair)
    b[14] = 2;                         // hair colour 3
    b[CAvatarData::ACCESSORY] = 0x23;
    b[CAvatarData::EYES] = 0x45;       // eyes 6: always colour 1
    b[15] = 4;
    b[CAvatarData::MOUTH] = 0x61;
    b[13] = 1;
    b[CAvatarData::BACK_HAIR] = 0x92;
    b[CAvatarData::ACCESSORY2] = 'S';
    g_lobbyWorld = 1;
    auto n = cmNames();
    CChibiAvatarElm::applyMaleParts(n, d);
    std::vector<std::string> want = {
        "cm_atari_01.png", "cm_h2_11_c03_n01_01.png", "cm_bo_01_c02_n01_01.png", "cm_ac_01_c01_n01_01.png",
        "cm_mo_02_c01_n01_01.png", "cm_ey_06_c01_n01_01.png", "cm_a1_03_c01_n01_01.png", "cm_a2_02_c03_n01_01.png",
        "cm_h1_11_c03_n01_01.png", "cm_ad_01_c01_d01_01.png", "cw_a1_03_c01_x.png"};   // first match: any "a1_01_c01"
    CHECK(n == want);
    b[CAvatarData::CLOTHES] = 'x';   // hood: no hair
    b[CAvatarData::FRONT_HAIR] = 6;  // bald
    g_lobbyWorld = 0;
    n = cmNames();
    CChibiAvatarElm::applyMaleParts(n, d);
    CHECK(n[8] == "cm_h1_99_c01_n01_01.png" && n[1] == "cm_h1_50_c01_n01_01.png" && n[9] == "cm_dd_01_c01_d01_01.png");
    CHECK(n[3] == "cm_dc_99_c01_n01_01.png");   // the hood's own clothes picture
    // clothes numbers -> pictures
    struct { int clothes; bool female; const char* want; } dc[] = {
        {0x70, false, "dc_01_c01"}, {0x73, false, "dc_01_c04"}, {0x74, false, "dc_02_c01"}, {0x77, false, "dc_03_c01"},
        {0x7c, false, "dc_98_c01"}, {0x7d, false, ""},          {0x80, false, "ac_01_c01"}, {0x85, false, "ac_06_c01"},
        {0x70, true, "dc_01_c01"},  {0x71, true, "dc_02_c01"},  {0x73, true, "dc_02_c03"},  {0x74, true, "dc_03_c01"},
        {0x77, true, "dc_98_c01"},  {0x78, true, ""},           {0x6e, false, ""},
    };
    for (auto& c : dc) {
        std::vector<std::string> one = {"cm_dc_01_c01_n01_01.png"};
        CAvatarData x;
        x.setDefault(c.female ? CAvatarData::FEMALE_DM : CAvatarData::MALE_DM);
        x.bytes_[CAvatarData::CLOTHES] = static_cast<uint8_t>(c.clothes);
        (c.female ? CChibiAvatarElm::applyFemaleParts : CChibiAvatarElm::applyMaleParts)(one, x);
        std::string w = *c.want ? std::string(c.female ? "cw_" : "cm_") + c.want + "_n01_01.png"
                                : std::string(c.female ? "cw_" : "cm_") + "dc_01_c01_n01_01.png";
        CHECK(one[0] == w);
    }
    // female: cm -> cw, ponytail back hair, afro 4 -> 10, glasses 'U'
    CAvatarData f;
    f.setDefault(CAvatarData::FEMALE_DM);
    f.bytes_[CAvatarData::FRONT_HAIR] = 8;   // 9th: ponytail
    f.bytes_[CAvatarData::ACCESSORY2] = 'U';
    n = cmNames();
    CChibiAvatarElm::applyFemaleParts(n, f);
    CHECK(n[1] == "cw_h2_09_c01_n01_01.png" && n[8] == "cw_h1_09_c01_n01_01.png" && n[7] == "cw_a2_02_c05_n01_01.png");
    CHECK(n[6] == "cw_a1_00_c01_n01_01.png" && n[10] == "cw_a1_00_c01_x.png" && n[0] == "cw_atari_01.png");
    f.bytes_[CAvatarData::FRONT_HAIR] = 9;   // afro 4
    n = cmNames();
    CChibiAvatarElm::applyFemaleParts(n, f);
    CHECK(n[1] == "cw_h2_10_c01_n01_01.png");
}

// Every PNG every engine asks for exists, for every part a player can own in the PBIN map (one part changed at a
// time from each default) and for every NPC look.
static void realData() {
    if (!mergeDat()) {
        std::printf("avatar_elm_test: real chibi PNGs skipped (no YO2_MERGE_DAT)\n");
        return;
    }
    gameSetFileProvider(mergeProvider);
    CChibiAvatarElm::loadMotions();
    CChibiAvatarElm::loadMotions();   // once
    CHECK(swfLoads() == 56 + 16);
    CHECK(swfMotionPngs(CChibiAvatarElm::s_playerMotions[0]).size() == 10);
    std::map<std::string, bool> exists;
    auto check = [&](CChibiAvatarElm& e, const char* what, int arg) {
        int missing = 0;
        for (int i = 0; i < CChibiAvatarElm::ENGINES; i++)
            for (const std::string& n : e.partPngs(i)) {
                auto it = exists.find(n);
                if (it == exists.end())
                    it = exists.emplace(n, vfsFind(mergeDat(), ("data/avatar/chibi/" + n).c_str()) != nullptr).first;
                if (!it->second && missing++ < 3)
                    std::printf("  missing %s (%s %d)\n", n.c_str(), what, arg);
            }
        return missing;
    };
    // the PBIN map: kind 1/2 (male/female parts), slot, number
    std::string map;
    CHECK(gameReadFile("data/common/yo2PbinMap.dat", &map));
    struct Part { int kind, slot, number; };
    std::vector<Part> parts;
    size_t at = 0;
    while (at < map.size()) {
        size_t end = map.find('\n', at);
        std::string line = map.substr(at, end - at);
        at = end == std::string::npos ? map.size() : end + 1;
        int c[8] = {};
        const char* p = line.c_str();
        for (int i = 0; i < 8 && p; i++) {
            c[i] = std::atoi(p);
            p = std::strchr(p, ',');
            if (p) p++;
        }
        if ((c[3] == 1 || c[3] == 2) && c[4] >= 1 && c[4] <= 9 && c[4] != 8)   // disks (8) aren't drawn on chibis
            parts.push_back({c[3], c[4], c[1]});
    }
    CHECK(parts.size() > 100);
    int bad = 0, avatars = 0;
    for (int world = 0; world < 2; world++)
        for (int type = 0; type < 4; type++) {
            g_lobbyWorld = world;
            CAvatarData base;
            base.setDefault(type);
            for (int k = -1; k < (int)parts.size(); k++) {
                CAvatarData d = base;
                if (k >= 0) {
                    if (parts[k].kind != base.bytes_[0] + 1) continue;
                    d.bytes_[parts[k].slot] = static_cast<uint8_t>(parts[k].number);
                }
                CChibiAvatarElm e;
                e.setPlayerParts(d.bytes_);
                bad += check(e, "part", k);
                avatars++;
            }
            // body colours (byte 13: 3 drawn), hair and eye colours (14, 15: 7 drawn)
            for (int byte = 13; byte <= 15; byte++)
                for (int color = 1; color < (byte == 13 ? 3 : 7); color++) {
                    CAvatarData d = base;
                    d.bytes_[byte] = static_cast<uint8_t>(color);
                    CChibiAvatarElm e;
                    e.setPlayerParts(d.bytes_);
                    bad += check(e, "colour byte", byte * 10 + color);
                    avatars++;
                }
        }
    for (int kind = 0; kind <= 18; kind++) {
        CChibiAvatarElm e;
        e.setNpcParts(kind);
        bad += check(e, "npc", kind);
    }
    std::printf("avatar_elm_test: %d avatars + 19 NPC looks, %zu distinct PNGs, %d missing\n", avatars,
                exists.size(), bad);
    CHECK(bad == 0);
    gameSetFileProvider(fixtureProvider);
}

static void motions() {
    CTask* root = CTask::createRoot();
    CChibiAvatarElm* e = CChibiAvatarElm::create(root);
    CHECK(e->inheritTransform_ && e->disabled_ && e->lockTask_.task() && e->lockTask_->taskName() == "LockTask");
    CHECK(e->lockTask_->isLocked(1) && e->isLocked(0x10));
    CAvatarData d;
    e->setPlayerParts(d.bytes_);
    e->enable();
    CHECK(!e->disabled_ && !e->isLocked(0x10) && e->engineIdx_ == 0 && engineCount(e) == 1);
    CSwfEngine* stand0 = e->engines_[0].get();
    CHECK(stand0->parent() == e && swfEngines()[stand0].playing && swfEngines()[stand0].loop);
    CHECK(stand0->instName() == "m_pMotEngine[0]" && swfEngines()[stand0].root->pos_.y == -116.0f);

    e->setDirection(6);   // mirrored facing: engine 6 shown flipped, engine 0 parked
    CSwfEngine* stand6 = e->engines_[6].get();
    CHECK(stand6->parent() == e && stand6->scale_.x == -1.0f && stand0->parent() == e->lockTask_.task());
    CHECK(swfEngines()[stand6].continuedFrom == stand0 && e->dirChanged_);
    e->setDirection(9);   // out of range: 0
    CHECK(e->dir_ == 0 && e->engines_[0]->scale_.x == 1.0f);

    // queue: a duel intro (600) runs to its end, then its loop; a request while looping takes over at once
    e->setMotion(CChibiAvatarElm::DUEL_IN);
    CHECK(e->nextMotion_ == CChibiAvatarElm::DUEL_LOOP && e->engineIdx_ == 32);
    testFrame(root);
    CHECK(e->motion_ == CChibiAvatarElm::DUEL_IN);   // 500 < 600, not looping, not finished
    e->setDirection(2);
    CHECK(e->dir_ == 0);                             // no turning during it
    swfEngines()[e->engines_[32].get()].finished = true;
    testFrame(root);
    CHECK(e->motion_ == CChibiAvatarElm::DUEL_LOOP && e->engineIdx_ == 40);
    e->requestMotion(CChibiAvatarElm::DUEL_OUT);
    testFrame(root);
    CHECK(e->motion_ == CChibiAvatarElm::DUEL_OUT && e->nextMotion_ == CChibiAvatarElm::STAND);
    e->requestMotion(CChibiAvatarElm::WALK);   // 200 >= 100 (the queued stand): queues walk's follow-up, walk
    CHECK(e->nextMotion_ == CChibiAvatarElm::WALK);
    e->requestMotion(CChibiAvatarElm::STAND);  // lower than the queued walk: unchanged
    CHECK(e->nextMotion_ == CChibiAvatarElm::WALK);

    // standing long enough plays the idle turn
    e->setMotion(CChibiAvatarElm::STAND);
    e->idleTimer_ = 1;
    testFrame(root);
    testFrame(root);   // timer runs out: the turn is queued (standing loops, so it takes it)
    CHECK(e->nextMotion_ == CChibiAvatarElm::IDLE_TURN && e->idleTimer_ >= 60 && e->idleTimer_ < 120);
    testFrame(root);
    CHECK(e->motion_ == CChibiAvatarElm::IDLE_TURN);

    // createParts: one engine a call, greetings (16..23) skipped, then the count of what's left
    e->clear();
    e->setPlayerParts(d.bytes_);
    CHECK(engineCount(e) == 0 && e->createParts(3) == 53 && engineCount(e) == 3);
    while (e->createParts(5) > 0) {}
    CHECK(engineCount(e) == 48 && !e->engines_[16].task() && !e->engines_[23].task() && e->engines_[24].task());
    e->createAllParts();
    CHECK(engineCount(e) == 56);
    e->setNpcParts(4);
    e->createAllParts();
    CHECK(engineCount(e) == 16 && e->npcKind_ == 4);   // the NPC table has stand and turn only
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
}

static void walking() {
    CTask* root = CTask::createRoot();
    CChibiAvatarElm* e = CChibiAvatarElm::create(root);
    CTask* target = CTask::newChild(root, 1);
    e->msgTarget_.set(target);
    CAvatarData d;
    e->setPlayerParts(d.bytes_);
    e->enable();
    e->warp({100, 200, 0}, 2);
    CHECK(e->pos_.x == 100 && e->dir_ == 2 && e->moveMode_ == CChibiAvatarElm::MOVE_TO);
    testFrame(root);   // already there
    CHECK(e->moveMode_ == CChibiAvatarElm::MOVE_NONE && e->pos_.z == 2000.0f);

    // velocity +x: the step is smoothed toward 6 (90% kept), turns to face 6, moves once it is over 1.2
    e->setVelocity({5, 0, 0});
    float step = 0, x = 100;
    for (int i = 0; i < 6; i++) {
        testFrame(root);
        step = step * 0.9f + 6.0f * (1.0f - 0.9f);
        if (step > 1.2f) x += step;
        CHECK(std::fabs(e->step_.x - step) < 1e-5f && std::fabs(e->pos_.x - x) < 1e-3f);
    }
    CHECK(e->dir_ == 6 && e->motion_ == CChibiAvatarElm::WALK && e->exit_ == -1);

    // a field map: the ground halves the speed; a wall cuts the step to 3; an exit colour is reported
    fieldStub().maps.insert(target);
    e->field_.set(target);
    fieldStub().height = 0.5f;
    fieldStub().wall = true;
    fieldStub().color = 0xff00ffff;
    e->step_ = {10, 0, 0};
    e->setVelocity({1, 0, 0});
    float before = e->pos_.x;
    testFrame(root);   // step = 10 * 0.9 + 3 * 0.1 = 9.3, cut to 3
    CHECK(std::fabs(e->pos_.x - before - 3.0f) < 1e-4f && e->exit_ == 1 && fieldStub().probes == 1);
    e->collide_ = false;
    fieldStub().color = 0;
    testFrame(root);
    CHECK(fieldStub().probes == 1 && e->exit_ == -1);

    // walkTo: steps toward the target, arrives within 6, faces the given direction, stands
    fieldStub().maps.clear();
    e->step_ = {};
    e->walkTo({e->pos_.x, e->pos_.y + 40, 0}, 4);
    int frames = 0;
    while (e->moveMode_ == CChibiAvatarElm::MOVE_TO && frames < 200) {
        testFrame(root);
        frames++;
    }
    CHECK(frames < 200 && e->dir_ == 4 && e->nextMotion_ == CChibiAvatarElm::STAND);
    // pause / resume
    e->setVelocity({0, 1, 0});
    e->pause(true);
    CHECK(e->moveMode_ == CChibiAvatarElm::MOVE_NONE && e->savedMode_ == CChibiAvatarElm::MOVE_VELOCITY);
    e->pause(false);
    CHECK(e->moveMode_ == CChibiAvatarElm::MOVE_VELOCITY);
    e->stop();
    CHECK(e->velocity_.y == 0 && e->step_.x == 0 && e->motion_ == CChibiAvatarElm::STAND);
    // the greeting can't be walked out of
    e->setMotion(CChibiAvatarElm::GREET);
    float y = e->pos_.y;
    e->moveStep({0, 50, 0});
    CHECK(e->pos_.y == y);

    // foot probes: the 20-pixel circle around (40, 116) of the shown engine's picture
    e->setMotion(CChibiAvatarElm::STAND);
    CElement* r = e->engines_[e->engineIdx_]->root();
    r->world_ = Mat4::translation(1000, 2000, 0);
    Vec3 c = e->footCenter(), p0 = e->footProbe(0), p4 = e->footProbe(4);
    CHECK(c.x == 1040 && c.y == 2116 && c.z == 0);
    CHECK(std::fabs(p0.x - 1060) < 1e-3f && std::fabs(p0.y - 2116) < 1e-3f);
    CHECK(std::fabs(p4.x - 1040) < 1e-3f && std::fabs(p4.y - 2136) < 1e-3f);
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
}

static void textureRequests() {
    CChibiAvatarElm e;
    e.setPlayerParts(CAvatarData().bytes_);
    SwfMotion m{"x", {"cm_mo_01_c01_n01_01.png"}};
    SwfMotion* saved = CChibiAvatarElm::s_playerMotions[0];
    CChibiAvatarElm::s_playerMotions[0] = &m;
    ::textures().requests.clear();
    e.requestTextures();
    CHECK(::textures().requests.size() == 1 && ::textures().requests.count("data/Avatar/chibi/cm_mo_01_c01_n01_01.png"));
    CHECK(::textures().lastPriority == 1 && ::textures().lastAsync);
    CHECK(e.texturesLoaded());   // asks by bare name: nothing under it
    ::textures().fixtures["cm_mo_01_c01_n01_01.png"].resize(1, 1);
    ::textures().requests["cm_mo_01_c01_n01_01.png"]++;
    CHECK(!e.texturesLoaded());  // a bare-name entry that is up holds it back
    e.releaseTextures();
    CHECK(::textures().releases["data/Avatar/chibi/cm_mo_01_c01_n01_01.png"] == 1);
    CChibiAvatarElm::s_playerMotions[0] = saved;
}

int main() {
    gameSetFileProvider(fixtureProvider);
    tables();
    partRules();
    textureRequests();
    motions();
    walking();
    realData();
    std::printf("avatar_elm_test ok\n");
}
