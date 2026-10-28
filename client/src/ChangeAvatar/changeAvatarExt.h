// What src/ChangeAvatar calls in other folders that main doesn't have yet (tests/misc doubles them). Each says the
// exe function or field it stands for; names shared with loginExt.h / titleExt.h / playerSelectExt.h keep their
// signatures.
#pragma once
#include <cstdint>

#include "System/vc6.h"

class CTask;
class CElement;
class CEasyTask;
class CAvatarData;
class CPbinDictionary;
class CWADictionary;
class CWindowTaskControll;
class IWindowTaskMediator;
struct CPlayerInfo;
struct CPlayerBinData;

// ---- src/System ----
CEasyTask* bgCommonNew(CTask* parent, CElement* layer, int32_t bg, int32_t arg);   // CBgCommon::New 0xa0a030
bool soundPlay(uint32_t id, int32_t fadeFrames);                                    // 0x686560
enum : uint32_t { SE_CHECK = 0x10000000, SE_ENTER = 0x10000001, SE_BACK = 0x10000002 };
// CScreenFader (src/duel), the scene manager's: to black / from black
void screenFaderFadeOut(CElement* fader, int32_t frames, int32_t z);   // 0x7dcb00
void screenFaderFadeIn(CElement* fader, int32_t frames, int32_t z);    // 0x7dcc20
// The player data folder manager (DAT_012714c4; playerSelectExt.h): its avatar bytes (+0xc8..+0xd7) and vf0 (save).
struct CPlayerDataManager;
CPlayerDataManager* playerData();                                          // 0x00814f40 (inline) DAT_012714c4
void playerDataSetAvatar(CPlayerDataManager* p, const uint8_t bytes[16]);  // +0xc8 = the 16 avatar bytes
bool playerDataSave(CPlayerDataManager* p);                                // vf0

// CWindowTaskPictureSwitch (0x3d8 bytes, src\System\CWindowTask.cpp): a button drawn from pictures, four looks
// (normal, hover, pressed, disabled), which can stay lit ("selected", +0x3c0).
struct PictureRect {
    int32_t u, v, w, h;   // the look's rectangle in the texture
};
CWindowTaskControll* pictureSwitchCreate(CTask* parent, CTask* owner, IWindowTaskMediator* mediator);   // 0x005baf10
void pictureSwitchSetImage(CWindowTaskControll* s, const char* path, const PictureRect looks[4]);   // vf20 0x005bbf30
void pictureSwitchSetImages(CWindowTaskControll* s, const char* normal, const char* hover, const char* pressed,
                            const char* disabled);                                                  // vf19 0x005bc590
void pictureSwitchSetPos(CWindowTaskControll* s, float x, float y);   // 0x005fc4d0: +0x3a8 / +0x3ac and pos_
float pictureSwitchY(CWindowTaskControll* s);                         // +0x3ac
float pictureSwitchHeight(CWindowTaskControll* s);                    // +0x3b4 (the first look's height)
void pictureSwitchSetSelected(CWindowTaskControll* s, bool on);       // +0x3c0

// ---- src/Game ----
// CGameMng (g_gameMng, DAT_012bb6b0; Game/yo2GameManager.h)
int32_t gameWorldState();                    // +0x70: 1 while the player is in the world (the change came from the menu)
int32_t gameWorldId();                       // +0x448: the avatar's world (0 the DM one, 1 GX)
int32_t gameWorldPrevLobbyRank();            // +0x44c
void gameWorldSetLobbyRank(int32_t rank);    // 0x00a58740 CGameMng::setLobbyRank (+0x44c = +0x448, +0x448 = rank)
void gameWorldEnterMyRoom();                 // +0x75 = 1: the world connects to My Room next
CWADictionary* gameWorldWaDictionary();      // 0x00a586b0 (+0x43c)
CPbinDictionary* gameWorldPbinDictionary();  // CGameMng::pbinDictionary (+0x45c)
void avatarValidate(CAvatarData* data, int world, bool checkSeries);   // 0x00a58cc0
void avatarCopyLooks(const CAvatarData& from, CAvatarData* to);       // 0x00a58ec0
// CWADictionary 0x009e2c10: how many parts a slot has for a sex (+0x1dfd8 table [sex][13]; world is not read)
int32_t waDictionaryCount(CWADictionary* d, int32_t sex, int32_t slot, int32_t world);
// CPlayerBinData 0x00ad6c40 (on a temporary): a PBIN's name, the string table's text of its nameText, as L"%s"
vc6::wstring playerBinName(uint32_t pbin);
// CWaistUpAvatar (0x009e2c40 ...; playerSelectExt.h): the big avatar picture
CElement* waistUpAvatarNew(CTask* parent, CTask* owner, int32_t kind, const CAvatarData* data, int32_t a, int32_t b,
                           int32_t c);                                  // 0x009e2c40
void waistUpAvatarSetBreathing(CElement* w, bool on);                   // 0x009ebd70
void waistUpAvatarSetScale(CElement* w, float s);                       // 0x009ebc80
void waistUpAvatarSetPos(CElement* w, float x, float y);                // 0x009eb7b0
bool waistUpAvatarChangePart(CElement* w, int32_t slot, int32_t value); // 0x009eaa20 (false: not allowed)
void waistUpAvatarGetData(CElement* w, CAvatarData* out);               // 0x009ec0e0: its avatar (+0x1bb4)

// ---- src/Net ----
// The app's account (CApp +0xc68): the logged-in character (me.player(me.activeSlot), 0x006a5bc0; null past slot 3)
// and the account's PBIN bits (+0x3264).
CPlayerInfo* accountActivePlayer();
CPlayerBinData* accountPlayerBin();
