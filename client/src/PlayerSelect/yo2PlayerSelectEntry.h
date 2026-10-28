// yo2PlayerSelectEntry.cpp: CPlayerSelectScene, the character select. Asks for the DUELPASS packs, then runs the
// window: picking an empty slot creates a character (then the avatar change), picking a character loads it (its card
// box from the account's trunk, its deck file, or a starter deck built from the box, its PBIN, its avatars checked
// against it) and goes on to My Room; Delete deletes and re-reads the list; Back hangs up and returns to the title.
#pragma once
#include <cstdint>

#include "System/yo2Scene.h"

class CWindowPlayerSelect;
class CNetAccountTask;
class CNetAccountTaskReqDuellpass150;
class CDeckManager;
struct CCardBox;
struct CPlayerDataManager;
class CAvatarData;
struct CPlayerBinData;

class CPlayerSelectScene : public CSceneTask {
public:
    enum State : int32_t {
        START, DUELPASS, WAIT_DUELPASS, SHOW, WAIT_INPUT, TRUNK, WAIT_TRUNK, PBIN, WAIT_PBIN,
        WAIT_CREATE = 0xb, WAIT_DELETE, LIST, WAIT_LIST, WAIT_HANGUP, LEAVE, DONE = 0x12,
    };

    static CSceneTask* New(CTask* parent, CElement* layer) { return spawn<CPlayerSelectScene>(parent, layer); }
    static CPlayerSelectScene* instance() { return s_instance; }   // DAT_012ac480, while it runs
    CPlayerSelectScene();
    ~CPlayerSelectScene() override;
    int32_t receive(CTaskMessage* msg) override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;

    int32_t state_ = START;                                // 0x80 State
    CTaskPtr<CTask> bg_;                                   // 0x84 CTaskPtr<CBgCommon>
    int32_t slot_ = 0;                                     // 0x90 the row the player picked
    bool newCharacter_ = false;                            // 0x94 go to the avatar change, not My Room
    CTaskPtr<CWindowPlayerSelect> window_;                 // 0x98
    CTaskPtr<CNetAccountTask> account_;                    // 0xa4
    CTaskPtr<CNetAccountTaskReqDuellpass150> duelpass_;    // 0xb0
    CTaskPtr<CTask> lobby_;                                // 0xbc CTaskPtr<CNetLobbyTask>: must be empty on leaving
    CCardBox* box_ = nullptr;                              // 0xc8 DAT_012714b4
    CDeckManager* deck_ = nullptr;                         // 0xcc DAT_012b28c4
    uint8_t unkd0_[8] = {};                                // 0xd0 an object with vtable 0x00beb27c (unused here)

private:
    void select();                // 0x008156a0
    void loadCardsAndDeck();      // WAIT_TRUNK's work
    void buildStarterDeck();
    static CPlayerSelectScene* s_instance;
    struct Layout;
};
YO2_SIZEOF(CPlayerSelectScene, 0xd8);

// Is every part of the avatar one the PBIN allows (byte 0 the sex, bytes 1-8 parts it must own, 9 an optional one,
// 13-15 under 7)? 0x00815970, a static helper of this file.
bool avatarIsOwned(const CAvatarData* avatar, const CPlayerBinData* bin);

// The inline members of two System classes compiled into this file.
CPlayerDataManager* playerData();                                          // 0x00814f40
vc6::string playerDataDeckFile(const CPlayerDataManager* p);               // 0x00815110 (+0x38)
void playerDataSetDeckFile(CPlayerDataManager* p, vc6::string file);       // 0x00814f60
void cardBoxClear(CCardBox* box);                                          // 0x00815320
void cardBoxAdd(CCardBox* box, uint16_t id, uint8_t n);                    // 0x00815290 (copies cap at 255)
void cardBoxSetDir(CCardBox* box, vc6::string dir);                        // 0x00815350 (+0x301c)
uint8_t cardBoxCopies(const CCardBox* box, uint16_t id);
