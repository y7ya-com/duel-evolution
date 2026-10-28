// Test stand-ins for the other owners' classes the Avatar files call (src/Game/Avatar/yo2AvatarExtern.h).
// Include once per avatar test: run.py links every src/Game/Avatar source into each of them.
#pragma once
#include <string>
#include <vector>

#include "game_test.h"

#include "Game/Avatar/yo2AvatarExtern.h"
#include "Game/yo2GameData.h"
#include "System/yo2File.h"

// CSpriteElm: setTexture records the path and, when the file can be read (gameReadFile), takes the size from the
// PNG header the way the real one takes it from the loaded texture.
struct SpriteLog {
    std::vector<std::string> textures;   // every setTexture path, in order
};
inline SpriteLog& spriteLog() {
    static SpriteLog l;
    return l;
}
CSpriteElm::CSpriteElm() : spriteBody_() {}
CSpriteElm::~CSpriteElm() = default;
bool CSpriteElm::onInit() { return true; }
void CSpriteElm::setTexture(const vc6::string& path) {
    spriteLog().textures.push_back(path.c_str());
    std::string png;
    if (gameReadFile(path.c_str(), &png) && png.size() >= 24 && png.compare(1, 3, "PNG") == 0) {
        auto be32 = [&](size_t o) {
            return (int32_t)((uint8_t)png[o] << 24 | (uint8_t)png[o + 1] << 16 | (uint8_t)png[o + 2] << 8 |
                             (uint8_t)png[o + 3]);
        };
        rect_[2] = be32(16);
        rect_[3] = be32(20);
    }
}

// CTextureManager: files are "loaded" by textureRequest (decoded with stb_image from gameReadFile, or taken from
// textureFixtures()); a test can hold loading back with textureHold().
#include <chrono>
#include <map>
#include <mutex>
#include <thread>

#if defined(__clang__)
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Weverything"
#elif defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wall"
#pragma GCC diagnostic ignored "-Wextra"
#endif
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#include "third_party/stb_image.h"
#if defined(__clang__)
#pragma clang diagnostic pop
#elif defined(__GNUC__)
#pragma GCC diagnostic pop
#endif

struct TextureLog {
    std::mutex m;
    std::map<std::string, ArgbImage> fixtures;   // path -> image, checked before the file provider
    std::map<std::string, ArgbImage> loaded;
    std::map<std::string, int> requests, releases;
    bool hold = false;                           // requested files stay "loading"
    int lastPriority = -1;
    bool lastAsync = false;
};
inline TextureLog& textures() {
    static TextureLog t;
    return t;
}
inline bool decodePng(const std::string& png, ArgbImage* out) {
    int w, h, n;
    unsigned char* p = stbi_load_from_memory(reinterpret_cast<const unsigned char*>(png.data()), (int)png.size(), &w,
                                             &h, &n, 4);
    if (!p)
        return false;
    out->resize(w, h);
    for (int i = 0; i < w * h; i++)
        out->pixels[i] = (uint32_t)p[i * 4 + 3] << 24 | p[i * 4] << 16 | p[i * 4 + 1] << 8 | p[i * 4 + 2];
    stbi_image_free(p);
    return true;
}
void textureRequest(const vc6::string& path, int32_t priority, bool async) {
    std::lock_guard<std::mutex> g(textures().m);
    textures().requests[path.c_str()]++;
    textures().lastPriority = priority;
    textures().lastAsync = async;
}
bool textureLoaded(const vc6::string& path) {
    TextureLog& t = textures();
    std::lock_guard<std::mutex> g(t.m);
    if (t.hold || !t.requests.count(path.c_str()))
        return false;
    if (!t.loaded.count(path.c_str())) {
        ArgbImage img;
        auto f = t.fixtures.find(path.c_str());
        std::string png;
        if (f != t.fixtures.end())
            img = f->second;
        else if (!gameReadFile(path.c_str(), &png) || !decodePng(png, &img))
            return true;   // a missing file counts as loaded (and textureImage gives nullptr), like a failed load
        t.loaded[path.c_str()] = img;
    }
    return true;
}
const ArgbImage* textureImage(const vc6::string& path) {
    std::lock_guard<std::mutex> g(textures().m);
    auto it = textures().loaded.find(path.c_str());
    return it == textures().loaded.end() ? nullptr : &it->second;
}
void textureRelease(const vc6::string& path) {
    std::lock_guard<std::mutex> g(textures().m);
    textures().releases[path.c_str()]++;
}

// The sprite's texture: what the last spriteLoadImage put in, per sprite.
inline std::map<const CSpriteElm*, ArgbImage>& spriteImages() {
    static std::map<const CSpriteElm*, ArgbImage> m;
    return m;
}
inline std::mutex& spriteImagesLock() {
    static std::mutex m;
    return m;
}
void spriteLoadImage(CSpriteElm* sprite, const ArgbImage& src, const int32_t rect[4]) {
    ArgbImage img;
    img.resize(rect[2] - rect[0], rect[3] - rect[1]);
    for (int y = 0; y < img.height; y++)
        for (int x = 0; x < img.width; x++)
            img.at(x, y) = src.at(rect[0] + x, rect[1] + y);
    std::lock_guard<std::mutex> g(spriteImagesLock());
    spriteImages()[sprite] = img;
}

uintptr_t yo2BeginThread(void (*proc)(void*), void* arg) {
    return reinterpret_cast<uintptr_t>(new std::thread(proc, arg));
}
void yo2JoinThread(uintptr_t t) {
    auto* th = reinterpret_cast<std::thread*>(t);
    th->join();
    delete th;
}
void yo2Sleep(uint32_t ms) { std::this_thread::sleep_for(std::chrono::milliseconds(ms)); }

// The studio's draw queues (CElement::onMain enqueues into them) and one frame of the task tree.
#include "System/yo2ZSort.h"
inline CZSortSet& testZSort() {
    static CZSortSet z;
    return z;
}
static const bool g_testZSortSet = (g_zsortSet = &testZSort(), true);
inline void testFrame(CTask* root) {
    root->call(&g_tmMain);
    for (CZSort& q : testZSort().layer) q.clear();
}

// CTextElm: the text lives in a side table.
inline std::map<const CTextElm*, std::u16string>& textElmTexts() {
    static std::map<const CTextElm*, std::u16string> m;
    return m;
}
CTextElm* CTextElm::create(CTask* parent, uint32_t priority) {
    return dynamic_cast<CTextElm*>((new CTextElm)->CTask::create(parent, priority));
}
CTextElm::CTextElm() : textBody_() {}
CTextElm::~CTextElm() { textElmTexts().erase(this); }
void CTextElm::setText(const std::u16string& t) { textElmTexts()[this] = t; }
const std::u16string& CTextElm::text() const { return textElmTexts()[this]; }

// Text: ASCII widened (enough for the tests' names); the colour of a state is state % 10.
std::u16string sjisToUtf16(const std::string& s) { return std::u16string(s.begin(), s.end()); }
int32_t playerStateColor(int32_t state) { return state % 10; }

// CTeamFlag
CTeamFlag* CTeamFlag::create(CTask* parent, uint32_t priority) {
    return dynamic_cast<CTeamFlag*>((new CTeamFlag)->CTask::create(parent, priority));
}
void CTeamFlag::setTeam(int32_t id, int32_t code) {
    spriteLog().textures.push_back("team:" + std::to_string(id) + "/" + std::to_string(code));
}

// Net's player record, as far as the accessors go, and the lobby.
struct CPlayerInfo {
    int32_t pid = 0;
    std::string name, country, teamName;
    uint8_t state = 1;
    uint8_t avatar[2][16] = {};
    uint16_t stars = 0;
    int32_t teamId = 0, teamCode = 0;
};
std::string playerNameString(const CPlayerInfo& p) { return p.name; }
int32_t playerPid(const CPlayerInfo& p) { return p.pid; }
std::string playerCountry(const CPlayerInfo& p) { return p.country; }
uint8_t playerState(const CPlayerInfo& p) { return p.state; }
const uint8_t* playerAvatar(const CPlayerInfo& p, int world) { return p.avatar[world]; }
uint16_t playerStars(const CPlayerInfo& p) { return p.stars; }
int32_t playerTeamId(const CPlayerInfo& p) { return p.teamId; }
std::string playerTeamName(const CPlayerInfo& p) { return p.teamName; }
int32_t playerTeamCode(const CPlayerInfo& p) { return p.teamCode; }
int g_lobbyWorld;
inline std::vector<CPlayerInfo>& lobbyPlayers() {
    static std::vector<CPlayerInfo> v;
    return v;
}
inline uint8_t& testRoomKind() {
    static uint8_t k;
    return k;
}
const CPlayerInfo* lobbyFindPlayer(int32_t pid) {
    for (auto& p : lobbyPlayers())
        if (p.pid == pid) return &p;
    return nullptr;
}
uint8_t lobbyRoomKind() { return testRoomKind(); }

// Swf: a motion is the PNG list of its dump ("png => name," lines, read through gameReadFile; no file = no PNGs).
// Engines keep their state in a side table.
#include <set>
struct SwfMotion {
    std::string path;
    std::vector<std::string> pngs;
};
inline int& swfLoads() {
    static int n;
    return n;
}
SwfMotion* swfLoadMotion(const char* txt) {
    swfLoads()++;
    auto* m = new SwfMotion{txt, {}};
    std::string t;
    if (gameReadFile(txt, &t)) {
        size_t at = 0;
        while ((at = t.find("png => ", at)) != std::string::npos) {
            at += 7;
            size_t end = t.find_first_of(",\r\n", at);
            m->pngs.push_back(t.substr(at, end - at));
        }
    }
    return m;
}
void swfFreeMotion(SwfMotion* m) { delete m; }
const std::vector<std::string>& swfMotionPngs(const SwfMotion* m) { return m->pngs; }

struct SwfEngineState {
    std::vector<std::string> pngs;
    const SwfMotion* motion = nullptr;
    bool playing = false, loop = false, finished = false, unk459 = false;
    CTask* owner = nullptr;
    CElement* root = nullptr;
    const CSwfEngine* continuedFrom = nullptr;
};
inline std::map<const CSwfEngine*, SwfEngineState>& swfEngines() {
    static std::map<const CSwfEngine*, SwfEngineState> m;
    return m;
}
CSwfEngine* CSwfEngine::create(CTask* parent, uint32_t priority) {
    auto* e = dynamic_cast<CSwfEngine*>((new CSwfEngine)->CTask::create(parent, priority));
    swfEngines()[e].root = CElement::newChild(e, 1);
    return e;
}
void CSwfEngine::load(const std::vector<std::string>& pngs, const SwfMotion* m) {
    swfEngines()[this].pngs = pngs;
    swfEngines()[this].motion = m;
}
void CSwfEngine::play(bool on) { swfEngines()[this].playing = on; }
void CSwfEngine::continueFrom(const CSwfEngine* from, const vc6::string& clip) {
    CHECK(clip == "this");
    swfEngines()[this].continuedFrom = from;
}
bool CSwfEngine::finished() const { return swfEngines()[this].finished; }
void CSwfEngine::setLoop(bool on) { swfEngines()[this].loop = on; }
void CSwfEngine::setUnk459(bool on) { swfEngines()[this].unk459 = on; }
void CSwfEngine::setOwner(CTask* owner) { swfEngines()[this].owner = owner; }
CElement* CSwfEngine::root() const { return swfEngines()[this].root; }

// The field map: a task registered here counts as one.
struct FieldStub {
    std::set<CTask*> maps;
    float height = 1.0f;
    bool wall = false;
    uint32_t color = 0;
    int probes = 0;
};
inline FieldStub& fieldStub() {
    static FieldStub f;
    return f;
}
bool isFieldMap(CTask* t) { return t && fieldStub().maps.count(t); }
float fieldHeightAt(CTask*, int32_t, int32_t) { return fieldStub().height; }
bool fieldProbeWalls(CTask*, Vec3*, CElement*, uint32_t* color) {
    fieldStub().probes++;
    *color = fieldStub().color;
    return fieldStub().wall;
}

// The avatar check the game manager owns: counted, changes nothing.
inline int& avatarValidations() {
    static int n;
    return n;
}
void avatarValidate(CAvatarData*, int, bool) { avatarValidations()++; }

#include "avatar_pending.h"
