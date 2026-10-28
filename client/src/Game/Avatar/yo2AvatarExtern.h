// What the Avatar files call in classes other owners rewrite: the smallest interface each needs, declared here and
// implemented by that owner (in tests: tests/game/avatar_stubs.h). Nothing here is defined by src/Game/Avatar.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

#include "System/vc6.h"
#include "System/yo2Element.h"

// TODO(System): CSpriteElm (CSharedSpriteElm + a texture: yo2SpriteElm.cpp). 0x5088 bytes.
class CSpriteElm : public CElement {
public:
    CSpriteElm();                            // 0x0061f450
    ~CSpriteElm() override;                  // 0x0061f610
    bool onInit() override;                  // 0x0061f640 loads the texture named at +0x35c
    void setTexture(const vc6::string& path);   // 0x0061f320: loads it; rect_[2], rect_[3] = its size

    uint8_t spriteBody_[0x5088 - 0x340];     // 0x340 CSharedSpriteElm's and CSpriteElm's fields
};
YO2_SIZEOF(CSpriteElm, 0x5088);

// An A8R8G8B8 image (pitch = width): what the D3D surfaces CAvatarTexMaker composes on hold.
struct ArgbImage {
    int32_t width = 0, height = 0;
    std::vector<uint32_t> pixels;
    void resize(int32_t w, int32_t h) {
        width = w;
        height = h;
        pixels.assign(static_cast<size_t>(w) * h, 0);
    }
    uint32_t& at(int32_t x, int32_t y) { return pixels[static_cast<size_t>(y) * width + x]; }
    uint32_t at(int32_t x, int32_t y) const { return pixels[static_cast<size_t>(y) * width + x]; }
};

// TODO(System): CTextureManager (CTextureManager.cpp, the instance at DAT_0126f99c), keyed by file name.
void textureRequest(const vc6::string& path, int32_t priority, bool async);   // 0x0059b550
bool textureLoaded(const vc6::string& path);             // 0x0059c650 (the entry's flag at +0x78; false if absent)
const ArgbImage* textureImage(const vc6::string& path);  // 0x0059c3f0 + LockRect: nullptr while not loaded
void textureRelease(const vc6::string& path);            // 0x0059c1f0
// TODO(System): the sprite's texture (level 0) becomes `rect` (left, top, right, bottom) of `src`, unscaled
// (D3DXLoadSurfaceFromSurface, D3DX_FILTER_NONE: what falls outside the source is transparent black).
void spriteLoadImage(CSpriteElm* sprite, const ArgbImage& src, const int32_t rect[4]);   // no address: inline D3DX calls in compose

// TODO(platform): a worker thread (_beginthread in the exe). Returns 0 if it can't be started.
uintptr_t yo2BeginThread(void (*proc)(void*), void* arg);   // 0x00b0ac72 _beginthread
void yo2JoinThread(uintptr_t thread);                       // no address: the exe never joins (spins on +0x171)
void yo2Sleep(uint32_t ms);                                 // no address: kernel32 Sleep (IAT 0x012d5d04)

// TODO(System): CTextElm (a text label element), 0x760 bytes. Its text is a UTF-16 MSVC6 wstring at +0x410.
class CTextElm : public CElement {
public:
    static CTextElm* create(CTask* parent, uint32_t priority);   // 0x00634470
    CTextElm();
    ~CTextElm() override;
    void setText(const std::u16string& text);   // 0x00634850
    const std::u16string& text() const;         // the wstring at +0x410 (0x006348e0 returns its address)

    uint8_t textBody_[0x760 - 0x340];
};
YO2_SIZEOF(CTextElm, 0x760);

// TODO(System): Shift-JIS game text -> the UTF-16 a CTextElm shows (0x005977b0).
std::u16string sjisToUtf16(const std::string& sjis);
// TODO(System): the name colour code ("@<n>" markup) for a player's lobby state (0x0088d170).
int32_t playerStateColor(int32_t state);

// TODO(team): CTeamFlag (a CSpriteElm showing a team's emblem), 0x50a8 bytes.
class CTeamFlag : public CSpriteElm {
public:
    static CTeamFlag* create(CTask* parent, uint32_t priority);   // 0x00b068c0
    void setTeam(int32_t teamId, int32_t teamCode);               // 0x00b06f60
    uint8_t teamBody_[0x50a8 - 0x5088];
};
YO2_SIZEOF(CTeamFlag, 0x50a8);

// TODO(Net): CPlayerInfo (src/Net/NetAccount.h, 0x1a8 bytes). Avatar code reads it only through these.
struct CPlayerInfo;
std::string playerNameString(const CPlayerInfo& p);           // Net: FUN_006bcc30
int32_t playerPid(const CPlayerInfo& p);                      // +0x00c
std::string playerCountry(const CPlayerInfo& p);              // +0x12c (FUN_0088a790)
uint8_t playerState(const CPlayerInfo& p);                    // +0x130
const uint8_t* playerAvatar(const CPlayerInfo& p, int world); // +0x134: CAvatarData[2], the 16 bytes of one
uint16_t playerStars(const CPlayerInfo& p);                   // +0x116
int32_t playerTeamId(const CPlayerInfo& p);                   // +0x17c
std::string playerTeamName(const CPlayerInfo& p);             // +0x180
int32_t playerTeamCode(const CPlayerInfo& p);                 // +0x1a4
// TODO(Net): the world whose avatar slot the lobby shows (Net/NetLobby.h, *(DAT_012bb6b0) + 0x448).
extern int g_lobbyWorld;
// TODO(Net): the lobby's player list and room kind (CGameMng's CNetLobby: players at +0x9a4, kind at +0x9ed).
const CPlayerInfo* lobbyFindPlayer(int32_t pid);
uint8_t lobbyRoomKind();

// TODO(Swf): one parsed SWF dump (data/Avatar/chibi/cm_n01.txt ...): its PNG list plus the shapes/frames the engine
// plays. The exe keeps them as 0x4c-byte records (ctor 0x009c9430 / dtor 0x009c95b0, inline in this block);
// here they are opaque.
struct SwfMotion;
SwfMotion* swfLoadMotion(const char* txtPath);                     // 0x00678ce0
void swfFreeMotion(SwfMotion* motion);
const std::vector<std::string>& swfMotionPngs(const SwfMotion* motion);   // 0x009c9430 (record ctor) its vector<string> at +0x04

// TODO(Swf): CSwfEngine, an element that plays a SwfMotion with a given PNG list.
class CSwfEngine : public CElement {
public:
    static CSwfEngine* create(CTask* parent, uint32_t priority);   // 0x0066db60
    void load(const std::vector<std::string>& pngs, const SwfMotion* motion);   // 0x0066df80 (pngs, +0x10, +0x34, 0)
    void play(bool on);                                             // 0x0066e2f0
    void continueFrom(const CSwfEngine* from, const vc6::string& clip);   // 0x0066f550 on from's player (+0x3dc)
    bool finished() const;                                          // 0x0066db60 (inline field) +0x3f1
    void setLoop(bool on);                                          // 0x0066db60 (inline field) +0x3e4
    void setUnk459(bool on);                                        // 0x0066db60 (inline field) +0x459
    void setOwner(CTask* owner);                                    // 0x0066db60 (inline field) +0x3f8 CTaskPtr<CTask>: gets its messages
    CElement* root() const;                                         // 0x0066db60 (inline field) +0x350 CTaskPtr<CElement>
};

// TODO(Game, yo2FieldMap.cpp): CFieldMap is blocked there; the chibi only needs these, on a CTask that may be one.
bool isFieldMap(CTask* task);   // 0x00a504b0 (CFieldMap::create; the exe dynamic_casts inline)
float fieldHeightAt(CTask* field, int32_t x, int32_t y);                        // 0x00a51e30
bool fieldProbeWalls(CTask* field, Vec3* step, CElement* who, uint32_t* color);  // 0x00a51e70

// Defined in Game/yo2GameManager.cpp (0x00a58cc0; declared there too). Avatar tests replace it with a counter.
class CAvatarData;
void avatarValidate(CAvatarData* data, int world, bool checkSeries);
