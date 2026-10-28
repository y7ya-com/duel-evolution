#include "Game/Avatar/yo2ChibiAvatarElm.h"

#include <cmath>
#include <cstdlib>

#include "System/yo2Debug.h"

// The motion table (0x00d0a410).
const CChibiAvatarElm::MotionInfo CChibiAvatarElm::kMotions[MOTIONS] = {
    {100, true, true, STAND},       // n: standing
    {200, true, true, WALK},        // w: walking
    {300, false, false, STAND},     // g
    {150, true, false, STAND},      // t: the idle turn
    {600, false, false, DUEL_LOOP}, // d01_01
    {500, false, true, DUEL_LOOP},  // d01_02
    {700, false, false, STAND},     // d01_03
};

// @yo2 0x009c7dd0 static init: CChibiAvatarElm::kPlayerMotionFiles
// @yo2 0x009c8850 static init: atexit(~kPlayerMotionFiles)
// One SWF dump per motion and facing: facings 5..7 reuse 3..1 (drawn mirrored).
const vc6::string CChibiAvatarElm::kPlayerMotionFiles[ENGINES] = {
    "data/Avatar/chibi/cm_n01.txt", "data/Avatar/chibi/cm_n02.txt", "data/Avatar/chibi/cm_n03.txt",
    "data/Avatar/chibi/cm_n04.txt", "data/Avatar/chibi/cm_n05.txt", "data/Avatar/chibi/cm_n04.txt",
    "data/Avatar/chibi/cm_n03.txt", "data/Avatar/chibi/cm_n02.txt",
    "data/Avatar/chibi/cm_w01.txt", "data/Avatar/chibi/cm_w02.txt", "data/Avatar/chibi/cm_w03.txt",
    "data/Avatar/chibi/cm_w04.txt", "data/Avatar/chibi/cm_w05.txt", "data/Avatar/chibi/cm_w04.txt",
    "data/Avatar/chibi/cm_w03.txt", "data/Avatar/chibi/cm_w02.txt",
    "data/Avatar/chibi/cm_g01.txt", "data/Avatar/chibi/cm_g02.txt", "data/Avatar/chibi/cm_g03.txt",
    "data/Avatar/chibi/cm_g04.txt", "data/Avatar/chibi/cm_g05.txt", "data/Avatar/chibi/cm_g04.txt",
    "data/Avatar/chibi/cm_g03.txt", "data/Avatar/chibi/cm_g02.txt",
    "data/Avatar/chibi/cm_t01.txt", "data/Avatar/chibi/cm_t02.txt", "data/Avatar/chibi/cm_t03.txt",
    "data/Avatar/chibi/cm_t04.txt", "data/Avatar/chibi/cm_t05.txt", "data/Avatar/chibi/cm_t04.txt",
    "data/Avatar/chibi/cm_t03.txt", "data/Avatar/chibi/cm_t02.txt",
    "data/Avatar/chibi/cm_d01_01.txt", "data/Avatar/chibi/cm_d01_01.txt", "data/Avatar/chibi/cm_d01_01.txt",
    "data/Avatar/chibi/cm_d01_01.txt", "data/Avatar/chibi/cm_d01_01.txt", "data/Avatar/chibi/cm_d01_01.txt",
    "data/Avatar/chibi/cm_d01_01.txt", "data/Avatar/chibi/cm_d01_01.txt",
    "data/Avatar/chibi/cm_d01_02.txt", "data/Avatar/chibi/cm_d01_02.txt", "data/Avatar/chibi/cm_d01_02.txt",
    "data/Avatar/chibi/cm_d01_02.txt", "data/Avatar/chibi/cm_d01_02.txt", "data/Avatar/chibi/cm_d01_02.txt",
    "data/Avatar/chibi/cm_d01_02.txt", "data/Avatar/chibi/cm_d01_02.txt",
    "data/Avatar/chibi/cm_d01_03.txt", "data/Avatar/chibi/cm_d01_03.txt", "data/Avatar/chibi/cm_d01_03.txt",
    "data/Avatar/chibi/cm_d01_03.txt", "data/Avatar/chibi/cm_d01_03.txt", "data/Avatar/chibi/cm_d01_03.txt",
    "data/Avatar/chibi/cm_d01_03.txt", "data/Avatar/chibi/cm_d01_03.txt",
};

// @yo2 0x009c88c0 static init: CChibiAvatarElm::kNpcMotionFiles
// @yo2 0x009c9340 static init: atexit(~kNpcMotionFiles)
const vc6::string CChibiAvatarElm::kNpcMotionFiles[ENGINES] = {
    "data/Avatar/chibi/cn_n01.txt", "data/Avatar/chibi/cn_n02.txt", "data/Avatar/chibi/cn_n03.txt",
    "data/Avatar/chibi/cn_n04.txt", "data/Avatar/chibi/cn_n05.txt", "data/Avatar/chibi/cn_n04.txt",
    "data/Avatar/chibi/cn_n03.txt", "data/Avatar/chibi/cn_n02.txt",
    "", "", "",
    "", "", "",
    "", "",
    "", "", "",
    "", "", "",
    "", "",
    "data/Avatar/chibi/cn_t01.txt", "data/Avatar/chibi/cn_t02.txt", "data/Avatar/chibi/cn_t03.txt",
    "data/Avatar/chibi/cn_t04.txt", "data/Avatar/chibi/cn_t05.txt", "data/Avatar/chibi/cn_t04.txt",
    "data/Avatar/chibi/cn_t03.txt", "data/Avatar/chibi/cn_t02.txt",
    "", "", "",
    "", "", "",
    "", "",
    "", "", "",
    "", "", "",
    "", "",
    "", "", "",
    "", "", "",
    "", "",
};

// @yo2 0x009c93b0 static init: the 56 player motion records (here pointers, filled by loadMotions)
// @yo2 0x009c93e0 static init: atexit(their destructors)
SwfMotion* CChibiAvatarElm::s_playerMotions[ENGINES];
// @yo2 0x009c96b0 static init: the 56 NPC motion records
// @yo2 0x009c96e0 static init: atexit(their destructors)
SwfMotion* CChibiAvatarElm::s_npcMotions[ENGINES];

// CTask::lockFlags_ is protected and System has no setter yet: reach it through a pointer to member.
// TODO(System): a public lock/unlock on CTask.
struct TaskLockAccess : CTask {
    static uint32_t& flags(CTask* t) { return t->*(&TaskLockAccess::lockFlags_); }
};

// D3DXVec3Transform, keeping x and y.
static Vec3 transformXY(const Vec3& p, const Mat4& m) {
    return {p.x * m.m[0][0] + p.y * m.m[1][0] + p.z * m.m[2][0] + m.m[3][0],
            p.x * m.m[0][1] + p.y * m.m[1][1] + p.z * m.m[2][1] + m.m[3][1], 0.0f};
}

// @yo2 0x009c9730 CChibiAvatarElm::loadMotions: parse every motion file once (the NPC table has gaps)
void CChibiAvatarElm::loadMotions() {
    static bool loaded = false;
    if (loaded)
        return;
    loaded = true;
    for (int i = 0; i < ENGINES; i++) {
        s_playerMotions[i] = swfLoadMotion(kPlayerMotionFiles[i].c_str());
        if (!kNpcMotionFiles[i].empty())
            s_npcMotions[i] = swfLoadMotion(kNpcMotionFiles[i].c_str());
    }
}

// @yo2 0x009c9810 CChibiAvatarElm::create (priority 10000)
CChibiAvatarElm* CChibiAvatarElm::create(CTask* parent) {
    return dynamic_cast<CChibiAvatarElm*>((new CChibiAvatarElm)->CTask::create(parent, 10000));
}

// @yo2 0x009cc110 CChibiAvatarElm::motionIndex: the engine of `motion` facing `dir`
int32_t CChibiAvatarElm::motionIndex(int32_t motion, int32_t dir) {
    YO2_ASSERT(dir >= 0 && dir <= 7, "0～7");
    int32_t base = motion >= 0 && motion < MOTIONS ? motion * DIRS : 0;
    return base + dir;
}

// @yo2 0x009cb320 CChibiAvatarElm::dirFromVector: the facing 0..7 of a step (0 = toward +y, turning through -x)
int32_t CChibiAvatarElm::dirFromVector(const Vec3& v) {
    float a = std::atan2(v.x, v.y) * -1.2732395f + 0.5f;   // * -4/pi
    if (a < 0.0f)
        a += 8.0f;
    return static_cast<int32_t>(a);
}

// @yo2 0x009cb360 CChibiAvatarElm::CChibiAvatarElm
CChibiAvatarElm::CChibiAvatarElm() {
    idleTimer_ = std::rand() % 30 + 60;
    for (auto& e : engines_)
        e.setUser(this);
    lockTask_.setUser(this);
    msgTarget_.setUser(this);
    field_.setUser(this);
    setTaskName("CChibiAvatarElm");
}

// @yo2 0x009cb6a0 CChibiAvatarElm::~CChibiAvatarElm
// @yo2 0x009cb670 CChibiAvatarElm deleting destructor
CChibiAvatarElm::~CChibiAvatarElm() = default;

// @yo2 0x009cb900 CChibiAvatarElm::receive (a CTmCapUtil is looked at and ignored)
int32_t CChibiAvatarElm::receive(CTaskMessage* msg) {
    return CElement::receive(msg);
}

// @yo2 0x009cb950 CChibiAvatarElm::onInit: the locked "LockTask" child for the idle engines; starts cleared, off
bool CChibiAvatarElm::onInit() {
    inheritTransform_ = true;
    lockTask_.set(CElement::newChild(this, 10000));
    CElement* lock = dynamic_cast<CElement*>(lockTask_.task());
    if (!lock)
        return false;
    lock->setTaskName("LockTask");
    TaskLockAccess::flags(lock) |= 1;
    clear();
    disable();
    return true;
}

// @yo2 0x009cc010 CChibiAvatarElm::onDestroy (empty)
void CChibiAvatarElm::onDestroy() {}

// @yo2 0x009cbed0 CChibiAvatarElm::onMain: the queued motion takes over (at once if it outranks the current one,
// otherwise when the current one loops or its engine finished); standing long enough plays the idle turn; one
// movement step; z follows y
bool CChibiAvatarElm::onMain() {
    updateMatrix();
    if (!disabled_) {
        if (kMotions[nextMotion_].priority >= kMotions[motion_].priority || kMotions[motion_].loops ||
            engines_[engineIdx_].get()->finished())
            setMotion(nextMotion_);
        if (motion_ == STAND && --idleTimer_ < 0) {
            requestMotion(IDLE_TURN);
            idleTimer_ = std::rand() % 60 + 60;
        }
        if (moveMode_ == MOVE_VELOCITY)
            moveStep(velocity_);
        else if (moveMode_ == MOVE_TO)
            walkStep(target_);
    }
    pos_.z = pos_.y * 10.0f;
    return true;
}

// @yo2 0x009cc030 CChibiAvatarElm::resetMove: standing still, facing 0, no engine chosen, off
void CChibiAvatarElm::resetMove() {
    target_ = {};
    disabled_ = 1;
    dir_ = 0;
    motion_ = STAND;
    nextMotion_ = STAND;
    velocity_ = {};
    engineIdx_ = NO_ENGINE;
    moveMode_ = MOVE_NONE;
    savedMode_ = MOVE_NONE;
    targetDir_ = 0;
    dirChanged_ = false;
    step_ = {};
    exit_ = -1;
    idleTimer_ = 0;
}

// @yo2 0x009c98d0 CChibiAvatarElm::clear: no parts, no engines
void CChibiAvatarElm::clear() {
    kind_ = PLAYER;
    npcKind_ = 0;
    motionFiles_ = nullptr;
    for (auto& e : engines_)
        if (dynamic_cast<CSwfEngine*>(e.task()))
            e.get()->destroy(__FILE__, __LINE__);
    createIdx_ = 0;
    resetMove();
}

// @yo2 0x009c9970 CChibiAvatarElm::enable: running, opaque, standing
void CChibiAvatarElm::enable() {
    lockFlags_ &= ~0x10u;
    color_[0] = color_[1] = color_[2] = color_[3] = 1.0f;
    resetMove();
    setMotion(STAND);
    disabled_ = 0;
}

// @yo2 0x009c99e0 CChibiAvatarElm::disable: no updates (TM_MAIN locked)
void CChibiAvatarElm::disable() {
    disabled_ = 1;
    lockFlags_ |= 0x10;
}

// @yo2 0x009caaf0 CChibiAvatarElm::setAvatar: the parts only (applied when engines are created)
void CChibiAvatarElm::setAvatar(const uint8_t bytes[CAvatarData::SIZE]) {
    avatar_.set(bytes);
}

// @yo2 0x009c9a30 CChibiAvatarElm::setPlayerParts(CAvatarData): start over as a player wearing `data`
void CChibiAvatarElm::setPlayerParts(const CAvatarData& data) {
    setPlayerParts(data.bytes_);
}

// @yo2 0x009c9aa0 CChibiAvatarElm::setPlayerParts(bytes)
void CChibiAvatarElm::setPlayerParts(const uint8_t bytes[CAvatarData::SIZE]) {
    clear();
    kind_ = PLAYER;
    motionFiles_ = kPlayerMotionFiles;
    avatar_.set(bytes);
    resetMove();
}

// @yo2 0x009c9af0 CChibiAvatarElm::setNpcParts: start over as NPC look `npcKind`
void CChibiAvatarElm::setNpcParts(int32_t npcKind) {
    clear();
    kind_ = NPC;
    motionFiles_ = kNpcMotionFiles;
    npcKind_ = npcKind;
    resetMove();
}

// @yo2 0x009c9bb0 CChibiAvatarElm::createParts: build up to `max` missing engines (greetings excepted: made on
// demand); returns how many indices are left to look at
int32_t CChibiAvatarElm::createParts(int32_t max) {
    int32_t made = 0;
    for (; createIdx_ < ENGINES; createIdx_++) {
        int32_t i = createIdx_;
        if ((i < 16 || i > 23) && !dynamic_cast<CSwfEngine*>(engines_[i].task()) && !motionFiles_[i].empty()) {
            if (made >= max)
                break;
            made++;
            engines_[i].set(createEngine(i));
        }
    }
    return ENGINES - createIdx_;
}

// @yo2 0x009c9b40 CChibiAvatarElm::createAllParts
void CChibiAvatarElm::createAllParts() {
    for (int32_t i = 0; i < ENGINES; i++)
        if (!dynamic_cast<CSwfEngine*>(engines_[i].task()))
            engines_[i].set(createEngine(i));
}

// The PNG list of engine `index` for this elm's parts.
std::vector<std::string> CChibiAvatarElm::partPngs(int32_t index) const {
    const SwfMotion* m = (kind_ == PLAYER ? s_playerMotions : s_npcMotions)[index];
    std::vector<std::string> names = m ? swfMotionPngs(m) : std::vector<std::string>();
    applyParts(names);
    return names;
}

// The folder of the motion files ("data/Avatar/chibi/"): the PNGs are loaded from there.
static std::string motionFolder(const vc6::string* files) {
    std::string first = files[0].c_str();
    return first.substr(0, first.rfind('/') + 1);
}

// @yo2 0x009c9ca0 CChibiAvatarElm::requestTextures: every PNG of every engine, async at priority 1
void CChibiAvatarElm::requestTextures() {
    std::string dir = motionFolder(motionFiles_);
    for (int32_t i = 0; i < ENGINES; i++)
        for (const std::string& n : partPngs(i))
            textureRequest((dir + n).c_str(), 1, true);
}

// @yo2 0x009ca1c0 CChibiAvatarElm::releaseTextures
void CChibiAvatarElm::releaseTextures() {
    std::string dir = motionFolder(motionFiles_);
    for (int32_t i = 0; i < ENGINES; i++)
        for (const std::string& n : partPngs(i))
            textureRelease((dir + n).c_str());
}

// @yo2 0x009ca6c0 CChibiAvatarElm::texturesLoaded: false while any PNG's texture-manager flag is up. The exe asks
// by bare name while the requests carry the folder, so this finds nothing and says true; kept as it is.
bool CChibiAvatarElm::texturesLoaded() const {
    for (int32_t i = 0; i < ENGINES; i++)
        for (const std::string& n : partPngs(i))
            if (textureLoaded(n.c_str()))
                return false;
    return true;
}

// @yo2 0x009cedc0 CChibiAvatarElm::replaceFirst: in every name, the first `from` becomes `to`
void CChibiAvatarElm::replaceFirst(std::vector<std::string>& names, const std::string& from, const std::string& to) {
    for (std::string& n : names) {
        size_t at = from.empty() ? 0 : n.find(from);
        if (at != std::string::npos)
            n.replace(at, from.size(), to);
    }
}

// @yo2 0x009ccfc0 CChibiAvatarElm::applyParts: players by sex from the (validated) avatar; NPCs swap "d01" for
// their look's code
void CChibiAvatarElm::applyParts(std::vector<std::string>& names) const {
    if (kind_ == PLAYER) {
        CAvatarData d;
        d.set(avatar_.bytes_);
        avatarValidate(&d, g_lobbyWorld, true);
        if (avatar_.bytes_[CAvatarData::SEX] == 0)
            applyMaleParts(names, d);
        else if (avatar_.bytes_[CAvatarData::SEX] == 1)
            applyFemaleParts(names, d);
        return;
    }
    if (kind_ != NPC)
        return;
    const char* code = "d01";
    switch (npcKind_) {
    case 3: case 4: code = "d04"; break;
    case 5: code = "d06"; break;
    case 6: case 18: code = "a01"; break;
    case 8: code = "a03"; break;
    case 9: code = "a04"; break;
    case 10: code = "d07"; break;
    case 11: code = "a05"; break;
    case 12: code = "d08"; break;
    case 13: code = "a06"; break;
    case 14: code = "d09"; break;
    case 15: code = "a07"; break;
    case 16: code = "d10"; break;
    case 17: code = "a08"; break;
    }
    replaceFirst(names, "d01", code);
}

static std::string fmt(const char* f, int a) { return yo2Format(f, a); }
static std::string fmt(const char* f, int a, int b) { return yo2Format(f, a, b); }

// The duel clothes (Domino, 0x6f..) or academy clothes (0x7f..) picture; empty for numbers with none.
static std::string clothesPart(int32_t clothes, bool female) {
    if (clothes >= 0x7f) {
        int n = clothes - 0x7f;
        return fmt("ac_%02d_c01", n == 0 ? 1 : n);
    }
    uint32_t k = static_cast<uint32_t>(clothes - 0x6f);
    if (!female) {
        if (k < 5) return fmt("dc_01_c%02d", k == 0 ? 1 : static_cast<int>(k));
        if (k < 8) return fmt("dc_02_c%02d", clothes - 0x73);
        static const char* const rest[] = {"dc_03_c01", "dc_99_c01", "dc_04_c01", "dc_05_c01", "dc_06_c01",
                                           "dc_98_c01"};
        return k <= 13 ? rest[k - 8] : std::string();
    }
    if (k <= 1) return "dc_01_c01";
    if (k < 5) return fmt("dc_02_c%02d", clothes - 0x70);
    static const char* const rest[] = {"dc_03_c01", "dc_99_c01", "dc_04_c01", "dc_98_c01"};
    return k <= 8 ? rest[k - 5] : std::string();
}

// @yo2 0x009cde20 CChibiAvatarElm::applyMaleParts: the default part names in a cm_* PNG list -> `d`'s parts
// (front hair with colour, accessory, eyes with colour, mouth, body colour, clothes, back hair, glasses); the
// GX world swaps the duel disk; two clothes ('x', '|') and the bald hair cover the head
void CChibiAvatarElm::applyMaleParts(std::vector<std::string>& names, const CAvatarData& d) {
    const uint8_t* b = d.bytes_;
    int hair = b[CAvatarData::FRONT_HAIR] + 1, hairColor = b[14] + 1;
    bool bald = false;
    int afro = 0;
    switch (hair) {
    case 7: bald = true; hairColor = 1; break;
    case 11: afro = 1; break;
    case 12: afro = 2; break;
    case 13: afro = 3; break;
    case 14: afro = 4; break;
    }
    int clothes = b[CAvatarData::CLOTHES];
    bool hood = clothes == 'x' || clothes == '|';
    int frontHair = hair, frontColor = hairColor;
    if (hood) {
        frontHair = clothes == 'x' ? 99 : 98;
        frontColor = 1;
    }
    replaceFirst(names, "h1_01_c01", fmt("h1_%02d_c%02d", frontHair, frontColor));
    replaceFirst(names, "a1_01_c01", fmt("a1_%02d_c01", b[CAvatarData::ACCESSORY] - 0x20));
    int eyes = b[CAvatarData::EYES] - 0x3f, eyeColor = b[15] + 1;
    if (eyes == 0) eyes = 1;
    if (eyes == 3 || eyes == 4 || eyes == 6) eyeColor = 1;
    replaceFirst(names, "ey_01_c01", fmt("ey_%02d_c%02d", eyes, eyeColor));
    int mouth = b[CAvatarData::MOUTH] - 0x5f;
    replaceFirst(names, "mo_01", fmt("mo_%02d", mouth == 0 ? 1 : mouth));
    replaceFirst(names, "bo_01_c01", fmt("bo_01_c%02d", b[13] + 1));
    std::string dc = clothesPart(clothes, false);
    if (!dc.empty())
        replaceFirst(names, "dc_01_c01", dc);
    int back = b[CAvatarData::BACK_HAIR] - 0x8f;
    std::string h2 = fmt("h2_%02d_c%02d", back == 0 ? 1 : back, hairColor);
    if (bald)
        h2 = "h1_50_c01";
    else if (afro)
        h2 = fmt("h2_%02d_c%02d", afro + 10, hairColor);
    if (hood)
        h2 = "h1_50_c01";
    replaceFirst(names, "h2_01_c01", h2);
    if (g_lobbyWorld == 1)
        replaceFirst(names, "dd_01_c01", "ad_01_c01");
    const char* a2 = "a2_00_c01";
    switch (b[CAvatarData::ACCESSORY2]) {
    case 'P': a2 = "a2_01_c01"; break;
    case 'Q': a2 = "a2_02_c01"; break;
    case 'R': a2 = "a2_02_c02"; break;
    case 'S': a2 = "a2_02_c03"; break;
    case 'T': a2 = "a2_03_c01"; break;
    }
    replaceFirst(names, "a2_01_c01", a2);
}

// @yo2 0x009cf060 CChibiAvatarElm::applyFemaleParts: the cm_* names become cw_*, then as for males with the female
// numbering (afros 6..8/10, ponytail 9; hoods 'u', 'w'; more glasses)
void CChibiAvatarElm::applyFemaleParts(std::vector<std::string>& names, const CAvatarData& d) {
    const uint8_t* b = d.bytes_;
    replaceFirst(names, "cm", "cw");
    int hair = b[CAvatarData::FRONT_HAIR] + 1, hairColor = b[14] + 1;
    int clothes = b[CAvatarData::CLOTHES];
    bool hood = clothes == 'u' || clothes == 'w';
    int frontColor = hairColor;
    if (hood) {
        hair = clothes == 'u' ? 99 : 98;
        frontColor = 1;
    }
    std::string h1 = fmt("h1_%02d_c%02d", hair, frontColor);
    bool ponytail = false;
    int afro = 0;
    switch (hair) {
    case 6: afro = 1; break;
    case 7: afro = 2; break;
    case 8: afro = 3; break;
    case 9: ponytail = true; break;
    case 10: afro = 4; break;
    }
    replaceFirst(names, "h1_01_c01", h1);
    int eyes = b[CAvatarData::EYES] - 0x3f;
    replaceFirst(names, "ey_01_c01", fmt("ey_%02d_c%02d", eyes == 0 ? 1 : eyes, b[15] + 1));
    int mouth = b[CAvatarData::MOUTH] - 0x5f;
    replaceFirst(names, "mo_01", fmt("mo_%02d", mouth == 0 ? 1 : mouth));
    replaceFirst(names, "bo_01_c01", fmt("bo_01_c%02d", b[13] + 1));
    std::string dc = clothesPart(clothes, true);
    if (!dc.empty())
        replaceFirst(names, "dc_01_c01", dc);
    int back = b[CAvatarData::BACK_HAIR] - 0x8f;
    std::string h2 = fmt("h2_%02d_c%02d", back == 0 ? 1 : back, hairColor);
    if (ponytail)
        h2 = fmt("h2_09_c%02d", hairColor);
    else if (afro)
        h2 = fmt("h2_%02d_c%02d", (afro == 4 ? 5 : afro) + 5, hairColor);
    if (hood)
        h2 = "h1_50_c01";
    replaceFirst(names, "h2_01_c01", h2);
    if (g_lobbyWorld == 1)
        replaceFirst(names, "dd_01_c01", "ad_01_c01");
    replaceFirst(names, "cw_a1_01_c01", fmt("cw_a1_%02d_c01", b[CAvatarData::ACCESSORY] - 0x20));
    const char* a2 = "a2_00_c01";
    switch (b[CAvatarData::ACCESSORY2]) {
    case 'P': a2 = "a2_01_c01"; break;
    case 'Q': a2 = "a2_02_c01"; break;
    case 'R': a2 = "a2_02_c02"; break;
    case 'S': a2 = "a2_02_c03"; break;
    case 'T': a2 = "a2_02_c04"; break;
    case 'U': a2 = "a2_02_c05"; break;
    case 'V': a2 = "a2_03_c01"; break;
    }
    replaceFirst(names, "a2_01_c01", a2);
}

// @yo2 0x009cca40 CChibiAvatarElm::createEngine: the engine of `index` with this elm's parts, playing and looping,
// offset to the elm's origin; its messages go to msgTarget_. Null for an index with no motion file.
CSwfEngine* CChibiAvatarElm::createEngine(int32_t index) {
    if (motionFiles_[index].empty())
        return nullptr;
    std::vector<std::string> pngs = partPngs(index);
    CSwfEngine* e = CSwfEngine::create(this, 10000);
    if (!e)
        return nullptr;
    e->setInstName(yo2Format("m_pMotEngine[%d]", index));
    e->load(pngs, (kind_ == PLAYER ? s_playerMotions : s_npcMotions)[index]);
    e->play(true);
    e->inheritTransform_ = true;
    e->setLoop(true);
    e->setOwner(this);
    e->setUnk459(true);
    e->root()->pos_ = Vec3{-46.0f, -136.0f, 0.0f} + Vec3{0.0f, 20.0f, 0.0f};
    e->setOwner(msgTarget_.task());
    return e;
}

// @yo2 0x009cc2e0 CChibiAvatarElm::switchEngine: show engine `index` (creating it if needed, continuing the old
// one's frame), park the rest under the lock task; facings 5..7 are drawn mirrored
void CChibiAvatarElm::switchEngine(int32_t index) {
    int32_t old = engineIdx_;
    engineIdx_ = index;
    if (index == NO_ENGINE || index == old)
        return;
    CSwfEngine* e = dynamic_cast<CSwfEngine*>(engines_[index].task());
    if (!e) {
        e = createEngine(index);
        engines_[index].set(e);
    }
    // the exe reads engines_[0x39] here when there was no engine (the msgTarget_ slot: never a CSwfEngine)
    CSwfEngine* prev = old < ENGINES ? dynamic_cast<CSwfEngine*>(engines_[old].task()) : nullptr;
    if (prev) {
        e->continueFrom(engines_[old].get(), "this");
        e->setLoop(kMotions[motion_].loops);
    }
    for (int32_t i = 0; i < ENGINES; i++) {
        CSwfEngine* x = dynamic_cast<CSwfEngine*>(engines_[i].task());
        if (!x)
            continue;
        if (i == index) {
            if (prev)
                e->continueFrom(engines_[old].get(), "this");
            x->changeParent(this, priority_);
            x->scale_.x = dir_ >= 5 && dir_ <= 7 ? -1.0f : 1.0f;
        } else {
            x->changeParent(dynamic_cast<CElement*>(lockTask_.task()), priority_);
        }
    }
    if (engineIdx_ != old) {
        CTaskMessage update(TM_UPDATE_MATRIX, true);
        call(&update);
    }
}

// @yo2 0x009cad70 CChibiAvatarElm::requestMotion: queue `motion` (a looping current motion yields to anything; a
// lower-ranked queued motion is replaced by `motion`'s follow-up)
void CChibiAvatarElm::requestMotion(int32_t motion) {
    if (kMotions[motion_].loops) {
        nextMotion_ = motion;
        return;
    }
    if (kMotions[nextMotion_].priority <= kMotions[motion].priority)
        nextMotion_ = kMotions[motion].next;
}

// @yo2 0x009cadf0 CChibiAvatarElm::setMotion: switch now; a non-looping motion queues its follow-up
void CChibiAvatarElm::setMotion(int32_t motion) {
    motion_ = motion;
    switchEngine(motionIndex(motion, dir_));
    nextMotion_ = kMotions[motion].loops ? motion : kMotions[motion].next;
}

// @yo2 0x009cae60 CChibiAvatarElm::setDirection: face `dir` (out of range -> 0) if the motion allows turning
void CChibiAvatarElm::setDirection(int32_t dir) {
    if (dir < 0 || dir > 7)
        dir = 0;
    if (!kMotions[motion_].canTurn)
        return;
    dir_ = dir;
    switchEngine(motionIndex(motion_, dir));
    dirChanged_ = true;
}

// @yo2 0x009cab20 CChibiAvatarElm::walkTo
void CChibiAvatarElm::walkTo(const Vec3& target, uint8_t dir) {
    target_ = target;
    moveMode_ = MOVE_TO;
    targetDir_ = dir;
}

// @yo2 0x009cab70 CChibiAvatarElm::setVelocity
void CChibiAvatarElm::setVelocity(const Vec3& v) {
    velocity_ = v;
    moveMode_ = MOVE_VELOCITY;
}

// @yo2 0x009cabb0 CChibiAvatarElm::pause: stop moving (and stand) / resume the movement paused
void CChibiAvatarElm::pause(bool on) {
    if (!on) {
        moveMode_ = savedMode_;
        return;
    }
    if (moveMode_ != MOVE_NONE)
        savedMode_ = moveMode_;
    moveMode_ = MOVE_NONE;
    setMotion(STAND);
}

// @yo2 0x009cac00 CChibiAvatarElm::stop: no speed, standing
void CChibiAvatarElm::stop() {
    step_ = {};
    setVelocity({});
    setMotion(STAND);
}

// @yo2 0x009cac90 CChibiAvatarElm::warp: stand at `pos` facing `dir`
void CChibiAvatarElm::warp(const Vec3& pos, uint8_t dir) {
    pos_ = pos;
    step_ = {};
    setVelocity({});
    walkTo(pos, dir);
    setDirection(dir);
    setMotion(STAND);
}

// @yo2 0x009cd4e0 CChibiAvatarElm::walkStep: arrive within 6 pixels (snap, turn to the target facing, stand),
// otherwise step toward the target
void CChibiAvatarElm::walkStep(const Vec3& target) {
    Vec3 d = target - pos_;
    d.z = 0.0f;
    if (d.length() < 6.0f) {
        pos_ = target;
        pos_.z = pos_.y * 10.0f;
        setDirection(targetDir_);
        dirChanged_ = true;
        moveMode_ = MOVE_NONE;
        requestMotion(STAND);
        return;
    }
    moveStep(d);
}

// @yo2 0x009cd5c0 CChibiAvatarElm::moveStep: a 6-pixel step along `v` scaled by the ground, smoothed (90% of the
// last step), turned to, cut short at walls; tiny steps stand still; exits are reported to msgTarget_
void CChibiAvatarElm::moveStep(const Vec3& in) {
    if (motion_ == GREET)
        return;
    Vec3 v{in.x, in.y, 0.0f};
    v.setLength(6.0f);
    if (isFieldMap(field_.task()))
        v *= fieldHeightAt(field_.get(), static_cast<int32_t>(pos_.x), static_cast<int32_t>(pos_.y));
    const float keep = 0.9f;
    v = step_ * keep + v * (1.0f - keep);
    step_ = v;
    if (v.length() < 0.1f)
        return;
    dirChanged_ = true;
    setDirection(dirFromVector(v));
    uint32_t color = 0;
    if (collide_ && isFieldMap(field_.task()) && fieldProbeWalls(field_.get(), &v, this, &color)) {
        float limit = 6.0f * 0.5f;
        if (v.length() > limit)
            v.setLength(limit);
    }
    if (v.length() > 6.0f * 0.2f)
        pos_ += v;
    else
        v = {};
    if (v.length() > 0.0f)
        requestMotion(WALK);
    else
        setMotion(STAND);
    int32_t exit;
    switch (color) {
    case 0xff0000ff: exit = 0; break;
    case 0xff00ffff: exit = 1; break;
    case 0xff6400ff: exit = 2; break;
    case 0xff0064ff: exit = 3; break;
    default: exit = -1; break;
    }
    if (exit >= 0) {
        CTmAvatarOnExit msg(exit);
        msgTarget_.get()->call(&msg);
    }
    exit_ = exit;
}

// @yo2 0x009caed0 CChibiAvatarElm::footProbe: point `n` (0..15) of the 20-pixel circle around the feet (40, 116)
// of the current engine's picture, in world space
Vec3 CChibiAvatarElm::footProbe(int32_t n) const {
    YO2_ASSERT(n >= 0 && n <= 15, "illegal vtx_no[%d]", n);
    double a = n * static_cast<double>(0.39269909f);
    Vec3 p{static_cast<float>(std::cos(a) * 20.0 + 40.0), static_cast<float>(std::sin(a) * 20.0 + 116.0), 0.0f};
    return transformXY(p, engines_[engineIdx_].get()->root()->world_);
}

// @yo2 0x009cb280 CChibiAvatarElm::footCenter: (40, 116) of the current engine's picture, in world space
Vec3 CChibiAvatarElm::footCenter() const {
    return transformXY({40.0f, 116.0f, 0.0f}, engines_[engineIdx_].get()->root()->world_);
}

// @yo2 0x009d0160 CChibiAvatarEffect::CChibiAvatarEffect
CChibiAvatarEffect::CChibiAvatarEffect() {
    elm_.setUser(this);
}

// @yo2 0x009d0120 CChibiAvatarEffect::fadeIn
void CChibiAvatarEffect::fadeIn() {
    mode_ = 1;
    done_ = false;
}

// @yo2 0x009d0140 CChibiAvatarEffect::fadeOut
void CChibiAvatarEffect::fadeOut() {
    mode_ = 2;
    done_ = false;
}

// @yo2 0x009d0030 CChibiAvatarEffect::update: one frame of the fade: the elm's alpha moves 1/15 toward 1 (in) or
// 0 (out); done_ when it gets there
void CChibiAvatarEffect::update() {
    if (done_)
        return;
    float& alpha = elm_.get()->color_[3];
    const float step = 1.0f / 15.0f;
    if (mode_ == 1) {
        alpha += step;
        if (alpha >= 1.0f) {
            alpha = 1.0f;
            done_ = true;
        }
    } else if (mode_ == 2) {
        alpha -= step;
        if (alpha <= 0.0f) {
            alpha = 0.0f;
            done_ = true;
        }
    }
}
