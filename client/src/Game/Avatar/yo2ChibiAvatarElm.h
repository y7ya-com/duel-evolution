// yo2ChibiAvatarElm.cpp: CChibiAvatarElm, the drawn chibi. It holds one CSwfEngine per motion x direction (7
// motions x 8 facings = 56), each playing an SWF dump (data/Avatar/chibi/cm_*.txt for players, cn_*.txt for NPCs)
// whose PNG names are rewritten for the avatar's parts; only the engine of the current motion and facing hangs under
// the elm, the others wait under a locked "LockTask" child. It also walks: toward a point, or along a velocity,
// with the field map slowing it, stopping it at walls and reporting exits (CTmAvatarOnExit).
// CChibiAvatarEffect (the fade a CChibiAvatar plays on its elm) lives in the same file.
#pragma once
#include <cstdint>

#include "Game/Avatar/yo2AvatarData.h"
#include "Game/Avatar/yo2AvatarExtern.h"
#include "System/yo2Element.h"
#include "System/yo2TaskPtr.h"

// Sent to the elm's message target when it steps on an exit colour of the hit map.
struct CTmAvatarOnExit : CTaskMessage {
    enum { TAG = 0x1d };
    explicit CTmAvatarOnExit(int32_t exit) : CTaskMessage(TAG), exit(exit) {}
    // @yo2 0x009cde00 CTmAvatarOnExit::~CTmAvatarOnExit
    // @yo2 0x009cddd0 CTmAvatarOnExit deleting destructor
    ~CTmAvatarOnExit() override = default;
    int32_t exit;   // 0x10 0..3
};
YO2_AT(CTmAvatarOnExit, exit, 0x10);

class CChibiAvatarElm : public CElement {
public:
    enum { DIRS = 8, MOTIONS = 7, ENGINES = DIRS * MOTIONS, NO_ENGINE = 0x39 };
    enum Kind : int32_t { PLAYER, NPC };
    enum Motion : int32_t { STAND, WALK, GREET, IDLE_TURN, DUEL_IN, DUEL_LOOP, DUEL_OUT };
    enum Move : int32_t { MOVE_NONE, MOVE_VELOCITY, MOVE_TO };
    // One row of the motion table (0x00d0a410).
    struct MotionInfo {
        int32_t priority;   // a queued motion replaces the current one at once only with priority >= the current's
        bool canTurn;       // setDirection works during it
        bool loops;
        int32_t next;       // what follows it (and what requestMotion queues when it can't interrupt)
    };
    static const MotionInfo kMotions[MOTIONS];
    static const vc6::string kPlayerMotionFiles[ENGINES];   // 0x012b7e50 cm_*.txt (female: "cm" -> "cw" in names)
    static const vc6::string kNpcMotionFiles[ENGINES];      // 0x012b7ad0 cn_*.txt (stand and turn only)
    static SwfMotion* s_playerMotions[ENGINES];             // 0x012b6a30
    static SwfMotion* s_npcMotions[ENGINES];                // 0x012b5990

    static void loadMotions();
    static CChibiAvatarElm* create(CTask* parent);
    static int32_t motionIndex(int32_t motion, int32_t dir);
    static int32_t dirFromVector(const Vec3& v);

    CChibiAvatarElm();
    ~CChibiAvatarElm() override;
    int32_t receive(CTaskMessage* msg) override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;

    void clear();
    void enable();
    void disable();
    void setAvatar(const uint8_t bytes[CAvatarData::SIZE]);
    void setPlayerParts(const CAvatarData& data);
    void setPlayerParts(const uint8_t bytes[CAvatarData::SIZE]);
    void setNpcParts(int32_t npcKind);
    int32_t createParts(int32_t max);
    void createAllParts();
    void requestTextures();
    void releaseTextures();
    bool texturesLoaded() const;

    void walkTo(const Vec3& target, uint8_t dir);
    void setVelocity(const Vec3& v);
    void pause(bool on);
    void stop();
    void warp(const Vec3& pos, uint8_t dir);
    void requestMotion(int32_t motion);
    void setMotion(int32_t motion);
    void setDirection(int32_t dir);
    Vec3 footProbe(int32_t n) const;
    Vec3 footCenter() const;

    void resetMove();
    void switchEngine(int32_t index);
    CSwfEngine* createEngine(int32_t index);
    std::vector<std::string> partPngs(int32_t index) const;
    void applyParts(std::vector<std::string>& names) const;
    static void applyMaleParts(std::vector<std::string>& names, const CAvatarData& d);
    static void applyFemaleParts(std::vector<std::string>& names, const CAvatarData& d);
    static void replaceFirst(std::vector<std::string>& names, const std::string& from, const std::string& to);
    void walkStep(const Vec3& target);
    void moveStep(const Vec3& v);

    int32_t kind_ = PLAYER;                  // 0x340 Kind
    int32_t npcKind_ = -1;                   // 0x344 which NPC look (picks the "d01" replacement)
    int32_t disabled_ = 1;                   // 0x348 onMain does nothing
    int32_t dir_ = 0;                        // 0x34c 0..7; 5..7 are 3..1 mirrored
    int32_t motion_ = STAND;                 // 0x350
    int32_t nextMotion_ = STAND;             // 0x354
    int32_t engineIdx_ = NO_ENGINE;          // 0x358 the engine under the elm
    CTaskPtr<CSwfEngine> engines_[ENGINES];  // 0x35c
    CTaskPtr<CElement> lockTask_;            // 0x5fc parks the other engines (locked: no TM_MAIN)
    CTaskPtr<CTask> msgTarget_;              // 0x608 gets the engines' messages and CTmAvatarOnExit
    CTaskPtr<CTask> field_;                  // 0x614 the CFieldMap walked on
    bool collide_ = true;                    // 0x620
    int32_t moveMode_ = MOVE_NONE;           // 0x624 Move
    int32_t savedMode_ = MOVE_NONE;          // 0x628 pause()'s
    Vec3 target_;                            // 0x62c MOVE_TO
    uint8_t targetDir_ = 0;                  // 0x638 facing on arrival
    Vec3 velocity_;                          // 0x63c MOVE_VELOCITY
    Vec3 step_;                              // 0x648 this frame's smoothed step
    bool dirChanged_ = false;                // 0x654
    int32_t exit_ = -1;                      // 0x658 the exit stepped on last, -1 none
    int32_t idleTimer_ = 60;                 // 0x65c frames standing until the idle turn
    CAvatarData avatar_;                     // 0x660
    const vc6::string* motionFiles_ = nullptr;   // 0x674 kPlayerMotionFiles / kNpcMotionFiles
    int32_t createIdx_ = 0;                  // 0x678 createParts' cursor
    uint32_t unk67c_ = 0;                    // 0x67c
};
YO2_AT(CChibiAvatarElm, kind_, 0x340);
YO2_AT(CChibiAvatarElm, engineIdx_, 0x358);
YO2_AT(CChibiAvatarElm, engines_, 0x35c);
YO2_AT(CChibiAvatarElm, lockTask_, 0x5fc);
YO2_AT(CChibiAvatarElm, msgTarget_, 0x608);
YO2_AT(CChibiAvatarElm, field_, 0x614);
YO2_AT(CChibiAvatarElm, collide_, 0x620);
YO2_AT(CChibiAvatarElm, target_, 0x62c);
YO2_AT(CChibiAvatarElm, targetDir_, 0x638);
YO2_AT(CChibiAvatarElm, velocity_, 0x63c);
YO2_AT(CChibiAvatarElm, step_, 0x648);
YO2_AT(CChibiAvatarElm, dirChanged_, 0x654);
YO2_AT(CChibiAvatarElm, exit_, 0x658);
YO2_AT(CChibiAvatarElm, avatar_, 0x660);
YO2_AT(CChibiAvatarElm, motionFiles_, 0x674);
YO2_AT(CChibiAvatarElm, createIdx_, 0x678);
YO2_SIZEOF(CChibiAvatarElm, 0x680);

// Fades an avatar's elm in or out over 15 frames (a CTaskUser: told when the elm dies).
class CChibiAvatarEffect : public CTaskUser {
public:
    CChibiAvatarEffect();
    // @yo2 0x009c2bb0 CChibiAvatarEffect::~CChibiAvatarEffect (its CTaskPtr)
    ~CChibiAvatarEffect() = default;
    void fadeIn();
    void fadeOut();
    void update();

    int32_t mode_ = 0;                  // 0x04 1 = fading in, 2 = fading out
    CTaskPtr<CChibiAvatarElm> elm_;     // 0x08
    bool done_ = false;                 // 0x14 the fade has finished
};
YO2_AT(CChibiAvatarEffect, mode_, 0x04);
YO2_AT(CChibiAvatarEffect, elm_, 0x08);
YO2_AT(CChibiAvatarEffect, done_, 0x14);
YO2_SIZEOF(CChibiAvatarEffect, 0x18);
