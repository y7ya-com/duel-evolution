// yo2DuelScene.cpp (0x007918c0..0x0079fe80), first pieces: the scene's globals, the match bookkeeping (games of a
// best-of-3, the field / BGM pick, the LP-difference judgement) and the scene accessors the engine reaches through
// the NetDuel range (0x00790590..0x00790e50, the engine's view of the scene).
#include <cstdlib>
#include <ctime>

#include "Engine.h"
#include "NetDuel.h"
#include "SceneDuelScene.h"

int ndIsMatch();   // FUN_007904f0 (NetDuelAccess.cpp)

namespace ds {

// ---------------------------------------------------------------- globals of yo2DuelScene.cpp
#if !YO2_IN_EXE
uint8_t* g_duelScene;        // DAT_012a9070
uint8_t g_duelAuto;          // DAT_012a90a4
uint32_t g_duelStamp;
int32_t g_duelV78;
int32_t g_duelStartTime;
uint8_t g_matchGames;
uint8_t g_matchGame[4];
int32_t g_matchEndMode;
int32_t g_fieldSpell;
int32_t g_duelV90a8;
int32_t g_sideJudge[2];
int32_t g_matchResult = -1;
#endif

namespace {
// a file-scope string of the scene's (DAT_012a8d40) with its atexit destructor
// @yo2 0x00794c10 its dynamic initializer
// @yo2 0x00794c40 its atexit registration
[[maybe_unused]] vc6::string s_sceneString;

template <class T>
T& sceneAt(size_t off) {
    return *reinterpret_cast<T*>(g_duelScene + off);
}
struct SceneList {   // vector<entry> {allocator byte, first, last, end}
    uint8_t alloc;
    uint8_t* first;
    uint8_t* last;
    uint8_t* end;
};
YO2_AT(SceneList, first, 4);
// a pointer field (memcpy: 4-aligned in the exe, not 8-aligned on a 64-bit host)
template <class T>
T scenePtr(size_t off) {
    T v;
    std::memcpy(&v, g_duelScene + off, sizeof v);
    return v;
}

// The BGM ids a duel picks from (DAT_00cd82f8: three, DAT_00cd8308: two for the story scenes).
const uint32_t kDuelBgm[3] = {0x20000010, 0x20000011, 0x20000012};
const uint32_t kStoryBgm[2] = {0x20000013, 0x20000014};
}   // namespace

// System / scene callees of these functions.
void debugLog(const char* fmt, ...);                   // TODO(System) FUN_0052c360 (debug builds print it)
void playBgm(uint32_t id, int32_t fade);               // TODO(System) FUN_00686560
void avatarPose(int32_t side, int32_t pose);           // TODO(System) FUN_00a56630 the menu bar's avatar
void duelAvatarPose(int32_t side, int32_t pose);       // TODO(scene1) FUN_007847b0 CDuelAvaTask (not translated yet)
uint32_t systemTick();                                 // TODO(System) FUN_006071f0
bool staticFieldAlive(void* task);  // inline in the exe (in 0x00790740) TODO(scene1) CTaskPtr<CStaticField> dyn. cast
void staticFieldRefresh(void* field);                  // TODO(scene2) FUN_007eb690, through the CTaskPtr FUN_0079dfa0
// TODO(scene1) FUN_007674a0 CWindowDeckList create: under `parent` at (x, y), style, the list's two arguments
CWindowTaskModel* deckListOpen(CTask* parent, int32_t x, int32_t y, int32_t style, uint32_t a, uint32_t b,
                               int32_t c);
bool sceneTaskBusy(void* task);                        // TODO(System) vf01 of the scene's task-list entries

// @yo2 0x007943d0 the cursor jumps onto new dialogs (auto focus, Ctrl+F1)
bool duelAutoFocus() { return g_duelUi[0x434] != 0; }

int32_t duelSceneFrame() { return sceneAt<int32_t>(0x1ec); }

// @yo2 0x00794a70
void duelSetV90a8(int32_t v) { g_duelV90a8 = v; }

// @yo2 0x00794a90 record the result of the current game (1 won, 2 lost, 3 draw). Outside a match, or when the
// match ended by rule, it is the result; in a match the result is decided once one side has 2 more wins than the
// other, or after the third game.
void matchRecordGame(int32_t result) {
    g_matchGame[g_matchGames] = (uint8_t)result;
    if (!ndIsMatch() || g_matchEndMode == 5) {
        g_matchResult = result;
        return;
    }
    int32_t count[4] = {0, 0, 0, 0};
    for (int32_t i = 0; i < g_matchGames; i++) count[g_matchGame[i + 1] & 3]++;
    bool third = g_matchGames == 3;
    switch (count[1] - count[2]) {
    case 0:
        if (third) g_matchResult = 3;
        break;
    case 1:
        if (third) g_matchResult = 1;
        break;
    case 2:
        g_matchResult = 1;
        break;
    case -2:
        g_matchResult = 2;
        break;
    case -1:
        if (third) g_matchResult = 2;
        break;
    }
}

// @yo2 0x00794bd0
void matchSetEndMode(int32_t v) { g_matchEndMode = v; }

// @yo2 0x00794cd0 pick the duel BGM at random (story scenes 7, 9, 10, 15, 16, 17, 20: from the second table)
void duelPickBgm() {
    g_netDuel->bgm = (int32_t)kDuelBgm[(uint32_t)(std::rand() & 0xff) % 3];
    uint8_t s = g_sceneId;
    if (s == 7 || s == 9 || s == 15 || s == 16 || s == 17 || s == 20 || s == 10)
        g_netDuel->bgm = (int32_t)kStoryBgm[std::rand() & 1];
}

// @yo2 0x00794d90 start a duel in `mode` (g_duelMode): the first game of a match resets the tally; the follow-up
// modes 2 / 5 / 9 / 12 continue a match as 1 / 4 / 8 / 11 with the next game
int32_t duelStart(int32_t mode) {
    g_duelMode = mode;
    g_duelStamp = systemTick();
    switch (mode) {
    case 0: case 1: case 3: case 4: case 7: case 8: case 10: case 11:
        duelSetV90a8(0);
        g_matchGame[3] = g_matchGame[2] = g_matchGame[1] = 0;
        g_matchGames = 0;
        ::duelDefaultDeck(1);
        g_matchGames++;
        g_duelV78 = 0;
        g_duelStartTime = (int32_t)std::time(nullptr);
        duelPickBgm();
        return 0;
    case 2: g_duelMode = 1; break;
    case 5: g_duelMode = 4; break;
    case 9: g_duelMode = 8; break;
    case 12: g_duelMode = 0xb; break;
    default: return 0;
    }
    g_matchGames++;
    duelPickBgm();
    return 0;
}

// @yo2 0x00794ec0 side j's judgement: v, or 1 when its avatar record (+0xac4, 0x44 per side) is below 1000
void duelSideJudge(int32_t j, int32_t v) {
    g_sideJudge[j] = sceneAt<int32_t>(0xac4 + j * 0x44) < 1000 ? 1 : v;
}

// @yo2 0x00794f10 the LP verdict: scene+0x130 = 1 when the opponent leads by 3000 or more, 2 when this side does,
// else 0; the side judgements, avatar poses and BGM follow (with no verdict: the field spell's BGM)
void duelJudgeLp() {
    debugLog("BGM start!!\n");   // "音楽スタート！！"
    uint32_t me = g_eng.viewer & 1u;
    int32_t diff = g_eng.pl[~g_eng.viewer & 1u].lp - g_eng.pl[me].lp;
    if (diff > 2999) {
        sceneAt<int32_t>(0x130) = 1;
        duelSideJudge(0, 1);
        duelSideJudge(1, 2);
        playBgm(0x20000019, 0xf);
        avatarPose(0, 1);
        duelAvatarPose(0, 1);
        avatarPose(1, 0);
        duelAvatarPose(1, 0);
        return;
    }
    if (diff < -2999) {
        sceneAt<int32_t>(0x130) = 2;
        duelSideJudge(0, 2);
        duelSideJudge(1, 1);
        playBgm(0x20000018, 0xf);
        avatarPose(0, 0);
        duelAvatarPose(0, 0);
        avatarPose(1, 1);
        duelAvatarPose(1, 1);
        return;
    }
    sceneAt<int32_t>(0x130) = 0;
    duelSideJudge(0, 0);
    duelSideJudge(1, 0);
    avatarPose(0, 0);
    duelAvatarPose(0, 0);
    avatarPose(1, 0);
    duelAvatarPose(1, 0);
    debugLog("field spell changed to [%d]!\n", g_fieldSpell);   // "フィールド魔法！[%d]に変更！"
    playBgm(fieldBgm(g_fieldSpell), g_fieldSpell == 0 ? 0xf : 0);
}

// The BGM of each field spell kind (0x00794f10's switch; kind 0 = the duel's own pick, CNetDuel::bgm).
uint32_t fieldBgm(int32_t kind) {
    static const uint32_t k[15] = {0,          0x20000022, 0x20000023, 0x20000020, 0x20000021,
                                   0x2000001f, 0x2000001e, 0x2000002b, 0x20000025, 0x20000026,
                                   0x2000002a, 0x20000029, 0x20000027, 0x20000028, 0x20000024};
    if (kind == 0) return (uint32_t)g_netDuel->bgm;
    if (kind == 0x16) return 0x2000002c;
    if (kind > 0 && kind < 15) return k[kind];
    return 0x2000002d;
}

// ---------------------------------------------------------------- the engine's view of the scene

// @yo2 0x00790590
void ndMatchRecordGame(int32_t result) { matchRecordGame(result); }
// @yo2 0x007905d0
void ndMatchSetEndMode(int32_t v) { matchSetEndMode(v); }
// @yo2 0x007905f0
void ndJudgeLp() { duelJudgeLp(); }

// @yo2 0x00790610 any task in the scene's list (an MSVC6 vector at +0x197c: first +0x1980, last +0x1984; 0x10 per
// entry, the task at +4) still busy
bool sceneAnyBusy() {
    SceneList l = scenePtr<SceneList>(0x197c);
    uint8_t* it = l.first;
    uint8_t* end = l.last;
    for (; it != end; it += 0x10) {
        void* task;
        std::memcpy(&task, it + 4, sizeof task);
        if (sceneTaskBusy(task)) return true;
    }
    return false;
}

// @yo2 0x00790690 (island)
void sceneSet1968(int32_t v) { sceneAt<int32_t>(0x1968) = v; }

// @yo2 0x007906c0 (island)
void sceneClear1974() { sceneAt<int32_t>(0x1974) = 0; }

// @yo2 0x007906e0 (island) the tick the duel started at
uint32_t duelStartStamp() { return g_duelStamp; }

// @yo2 0x00790740 refresh the static field (scene+0x23c8 CTaskPtr<CStaticField>) when it exists
void sceneRefreshField() {
    void* field = scenePtr<void*>(0x23cc);
    if (staticFieldAlive(field)) staticFieldRefresh(field);
}

// @yo2 0x00790e50 open the duel's deck list window (0x6610 lists) and keep it at scene+0x104
void sceneMakeDuelList(uint32_t a, uint32_t b) {
    CWindowTaskModel* win = deckListOpen(sceneRoot(), 0, 0, 1, a, b, 0);
    YO2_ASSERT(win, "deck list?");   // "デッキ表示？"
    win->setInstName("OnlineDuel Make DuelList");
    auto* p = reinterpret_cast<CTaskPtr<CWindowTaskModel>*>(g_duelScene + 0x104);
    p->set(win);
}

}   // namespace ds
