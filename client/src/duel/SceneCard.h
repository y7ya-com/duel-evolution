// CCard (yo2Card, 0x007579e0..0x00758990): one card sprite on the duel mat. It glides between mat positions
// ("codes": player | zone << 1 | index << 6 | face-up << 14 | defense << 15), turning and flipping on the way;
// CCardLoader keeps the two shared card sheet sets alive while any card exists. See SceneCard.cpp.
#pragma once
#include "SceneGameObject.h"
#include "SceneSprite.h"

namespace ds {

// The mat position code a card is placed by (u16 at CCard+0x24).
inline uint32_t codePlayer(uint16_t c) { return c & 1u; }
inline uint32_t codeZone(uint16_t c) { return c >> 1 & 0x1fu; }
inline uint32_t codeIndex(uint16_t c) { return c >> 6 & 0xffu; }
enum : uint32_t { ZONE_HAND = 0xb, CODE_FACEUP = 0x4000, CODE_DEFENSE = 0x8000 };

struct CardPlane {        // CCardPlane, 0xc: {vtbl, two words}
    uint32_t vtbl;
    uint32_t a, b;
};
YO2_SIZEOF(CardPlane, 0xc);

class CCard : public CGameObject {   // 0x80, vtable 0x00bebbc0; group 1, order_ = 0x100 (the select dialogs: 0x701)
public:
    explicit CCard(uint8_t alloc = 0xff);   // FUN_007579e0
    ~CCard() override;                       // FUN_00758100
    void update() override;                  // FUN_00758540 slot 2 (step())
    void draw() override;                    // FUN_00758990 slot 3
    virtual void setCard(int32_t id);        // FUN_007584d0 slot 4
    virtual bool hit(int32_t mx, int32_t my) const;   // FUN_007588b0 slot 5
    int32_t step();                          // FUN_00758540: one frame of the move; returns the tick wraps
    void drawStats();                        // FUN_00759430 ATK / DEF under (over) a monster, then the badges
    void drawMarks();                        // FUN_0075a030 equip / changed race and attribute
    void drawCounterRoom();                  // FUN_0075ac50
    void drawLock();                         // FUN_0075b120
    void drawCounters();                     // FUN_0075b5c0
    void pin(int32_t px, int32_t py);        // FUN_0076a100
    void useNumberSheet(int32_t i);          // number = sheet i of duel/font/number.txt (inline in the exe)

    int32_t cardId = 0;   // 0x10 slot 4
    int32_t anim;         // 0x14 0x100 = settled, else counts up by 0x20 while moving
    int32_t flash;        // 0x18 an effect, timed by flashLevel (down 0x10 a frame): 1 blink, 2 shake, 3 / 4 the
                          //      counter / lock badge pops, 5 the card turns over, 6 / 7 a counter pops
    int32_t flashLevel;   // 0x1c
    uint8_t drawNow;      // 0x20 the select dialogs draw it for one call
    uint8_t upright;      // 0x21 never turned to its owner (rotation 0)
    uint8_t pinned;       // 0x22 its position is set by hand, not from the code
    uint8_t _23;
    uint16_t code;        // 0x24 mat position
    uint16_t prevCode;    // 0x26 where the current move started
    int32_t tx, ty;       // 0x28 target (screen centre)
    int32_t fx, fy;       // 0x30 where the move started
    int32_t x, y;         // 0x38 current
    int32_t rot;          // 0x40 0..0x1ff (0x80 per quarter turn)
    int32_t scale;        // 0x44 16.16
    int32_t flip;         // 0x48 0 = its back .. 0x100 = its face
    int32_t atk;          // 0x4c cardAtk (FUN_0073c040), shown on the mat
    int32_t def;          // 0x50 cardDef (FUN_0073c080)
    int32_t v54;          // 0x54 the counter kind flash 6 / 7 animates
    int32_t tick;         // 0x58 0..0xbf
    CardPlane plane;      // 0x5c
    CNumber number;       // 0x68 duel/font/number.txt
    int32_t z;            // 0x78 draw depth (the owner window's maxZ)
    uint32_t v7c;         // 0x7c

    int32_t moveTo(const uint16_t* newCode);    // FUN_00758210: start a move to a code; returns the index carry
    void snap();                            // FUN_007583d0: jump to the code's place at once
    // @yo2 0x00758490
    void setZ(int32_t v) { z = v; }
    // @yo2 0x00758520
    void getCode(uint16_t* out) const { *out = code; }
};
YO2_AT(CCard, cardId, 0x10);
YO2_AT(CCard, drawNow, 0x20);
YO2_AT(CCard, code, 0x24);
YO2_AT(CCard, tx, 0x28);
YO2_AT(CCard, x, 0x38);
YO2_AT(CCard, rot, 0x40);
YO2_AT(CCard, atk, 0x4c);
YO2_AT(CCard, tick, 0x58);
YO2_AT(CCard, plane, 0x5c);
YO2_AT(CCard, number, 0x68);
YO2_AT(CCard, z, 0x78);
YO2_SIZEOF(CCard, 0x80);

// TODO(scene2) FUN_007bea20: the screen centre of a mat position (x in EAX, y in EDX)
void matPos(uint32_t player, uint32_t zone, uint32_t index, int32_t* x, int32_t* y);

// The rotation a card at `code` shows: 0x80 per quarter turn; the opponent's cards are turned 0x100, defense adds
// 0x80 (FUN_00758540 / FUN_007583d0 inline it).
int32_t cardRotation(uint16_t code, bool upright, uint32_t viewer);

// Shared card statics (CCard's and CCardLoader's), defined in SceneCard.cpp.
#if YO2_IN_EXE
#define g_cardRefs YO2_EXE_VAR(int32_t, 0x012a6824)
#define g_cardPlane YO2_EXE_VAR(void*, 0x012a6828)
#define g_cardSheet YO2_EXE_VAR(PlaneLoader*, 0x012a682c)
#define g_cardHover YO2_EXE_VAR(CCard*, 0x012a6830)
#define g_cardHoverSet YO2_EXE_VAR(uint8_t, 0x012a6834)
#define g_numberRefs YO2_EXE_VAR(int32_t, 0x012aa6d0)
#define g_numberSheet YO2_EXE_VAR(PlaneLoader*, 0x012aa6d4)
#define g_loaderRefs YO2_EXE_VAR(int32_t, 0x012a6b74)
#define g_cardListMini YO2_EXE_VAR(PlaneLoader*, 0x012a6b78)
#define g_cardListBig YO2_EXE_VAR(PlaneLoader*, 0x012a6b7c)
#define g_cardW YO2_EXE_VAR(int32_t, 0x012a6b84)
#define g_miniW YO2_EXE_VAR(int32_t, 0x012a6b88)
#define g_miniH YO2_EXE_VAR(int32_t, 0x012a6b8c)
#define g_sinTable YO2_EXE_ARR(int32_t, 0x0126ca10)
#define g_appTick YO2_EXE_VAR(uint32_t, 0x012711a4)
#else
extern int32_t g_cardRefs;               // DAT_012a6824: live CCards
extern void* g_cardPlane;                // DAT_012a6828: the shared CCardPlane-backed loader (0xc)
extern PlaneLoader* g_cardSheet;         // DAT_012a682c: duel/card/card.txt
extern CCard* g_cardHover;               // DAT_012a6830: the card under the mouse (select dialogs)
extern uint8_t g_cardHoverSet;           // DAT_012a6834: FUN_007579c0 sets it
extern int32_t g_numberRefs;             // DAT_012aa6d0: live CNumbers
extern PlaneLoader* g_numberSheet;       // DAT_012aa6d4: duel/font/number.txt
extern int32_t g_loaderRefs;             // DAT_012a6b74: live CCardLoaders
extern PlaneLoader* g_cardListBig;       // DAT_012a6b7c: data/card/list_card.txt
extern PlaneLoader* g_cardListMini;      // DAT_012a6b78: data/mini/list_card.txt
// TODO(System) the card sheet metrics FUN_007540c0 fills: big card width, mini card width / height
extern int32_t g_cardW;                  // DAT_012a6b84
extern int32_t g_miniW;                  // DAT_012a6b88
extern int32_t g_miniH;                  // DAT_012a6b8c
extern int32_t g_sinTable[0x200];        // TODO(System) DAT_0126ca10: cos in 16.16, 0x200 steps per turn ([k - 0x80] = sin)
extern uint32_t g_appTick;               // TODO(System) DAT_012711a4: the app's frame counter
#endif

void cardHoverMark();                    // FUN_007579c0
CSpriteElmOlder* cardSprite(CCard* c);               // FUN_007582f0
void cardPlaneDelete(CardPlane* p, uint8_t flags);   // FUN_00757ff0
void numberDestruct(CNumber* n);                      // FUN_00758020
void numberDelete(CNumber* n, uint8_t flags);
// CNumber's constructor / destructor share duel/font/number.txt (inline in their owners)
void numberAcquire();
void numberRelease();         // FUN_00758060
void cardLoaderAcquire();                // FUN_00757d40 CCardLoader::CCardLoader (shared part)
void cardLoaderRelease();                // FUN_00757f60 CCardLoader::~CCardLoader (shared part)

}   // namespace ds
