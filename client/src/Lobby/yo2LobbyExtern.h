// What src/Lobby's player-list windows need from classes nobody has ported to main yet. Each declaration names the
// exe function it stands for; the owners replace them (and the test stubs) when their classes land.
#pragma once
#include <cstddef>
#include <cstdint>

#include "System/vc6.h"

class CTask;
class CWindowTaskControll;
class CWindowTaskModel;
class CElement;
class CWindowTaskText;
class IWindowTaskMediator;
class CFukiDictionary;

// TODO(yaneSDK): CMouseEx::Flush (vslot 20 of CApp + 0x148): take the buttons pressed since the last flush.
void lobbyMouseFlush();

// TODO(System): CWindowTaskHelp, a text on a white back plane (CWindowTask.cpp; phase2-system has one). The Lobby
// windows hold it as a CWindowTaskControll (its base) and reach the rest through these.
CWindowTaskControll* windowHelpCreate(CTask* parent, IWindowTaskMediator* m);   // CWindowTaskHelp::newChild 0x005b17a0
CWindowTaskText* windowHelpText(CWindowTaskControll* help);   // its text (CTaskPtr<CWindowTaskText> +0x378, 0x00599930)
void windowHelpSetBackColor(CWindowTaskControll* help, float r, float g, float b, float a);   // 0x005964a0
void windowHelpSetPosition(CWindowTaskControll* help, float x, float y);   // 0x00596470: +0x384 / +0x388 and pos_
void windowHelpSetSize(CWindowTaskControll* help, float w, float h);       // 0x00598d80: +0x38c / +0x390, layout
void windowHelpSetZ(CWindowTaskControll* help, float z);                   // +0x394 (and pos_.z, which callers set)

// TODO(Game): the game manager (DAT_012bb6b0) and what the NPC windows use of it.
CFukiDictionary* lobbyFukiDictionary();   // CGameMng::fukiDictionary (0x00a586e0)
// The duel conversation's waist-up avatars: CGameMng::duelAva (0x00a56630) -> CDuelAvaTask::waistUp(side)
// (0x00780cd0); side 0 the player, 1 the opponent (an NPC). Null when there's none.
CTask* lobbyWaistUp(int32_t side);
void duelAvaShowNpc(int32_t side, float z, int32_t npc);   // CDuelAvaTask 0x00780ed0
void duelAvaClose(int32_t side);                           // CDuelAvaTask 0x00783160
int32_t duelAvaNpcNameText(int32_t npc);                   // CDuelAvaTask 0x00780320: the name's text id, -1
// CWaistUpAvatar (src\Game, on the duel conversation's avatars), with `w` from lobbyWaistUp.
bool waistUpBalloonOpen(CTask* w);                         // 0x009ee460: its CWindowModelBalloon exists
void waistUpShow(CTask* w, bool on);                       // 0x009eb670
void waistUpReset(CTask* w);                               // 0x009ebe00
void waistUpSetSpeaker(CTask* w, vc6::string name, int32_t a, int32_t frames);   // 0x009ecca0
void waistUpSetListener(CTask* w, vc6::string name);       // 0x0065b0f0 (+0x1c64)
void waistUpSay(CTask* w, int32_t npc, int32_t line);      // 0x009edee0: the NPC's fuki line
void waistUpSayText(CTask* w, vc6::string text, int32_t a);   // 0x009ed420
void waistUpSayPresent(CTask* w, int32_t present, int32_t a, int32_t b);   // 0x009ed740
// TODO(duel): the duel module's bits the NPC menu reads.
void duelSetAvatarParts(int32_t side, const uint8_t parts[16]);   // 0x0079a370
int32_t duelResultLine();                // 0x007918c0: the balloon line for the last duel's result
int32_t lobbyDuelResult();               // DAT_00cd82d0 (1 / 2 after an NPC duel)
void lobbySetDuelNpc(int32_t npc);       // DAT_00cd82dc
bool npcPresentDone(int32_t npc);        // 0x00a56060
void npcRecord(int32_t npc, int32_t* a, int32_t* b, int32_t* c, int32_t* d);   // 0x008c3c30: the player's record
vc6::string npcDeckName(int32_t id);     // 0x008581b0 on DAT_012ae620 (the deck table), id = npc + 10000
// One row of the NPC table (DAT_012bc8d0 + 0xd0 .. 0xd4, 0x44 bytes each).
struct LobbyNpcRow {
    int32_t id;            // 0x00
    char name[17];         // 0x04
    uint8_t parts[16];     // 0x15 the avatar
    uint8_t rest[0x44 - 0x25];
};
static_assert(sizeof(LobbyNpcRow) == 0x44, "LobbyNpcRow");
const LobbyNpcRow* lobbyNpcRows(size_t* count);   // null (and 0) when the table doesn't exist
// TODO(Game): the area map: CSceneMng's scene as a CAreaMapScene -> its chibi manager (0x009fb0d0) -> the NPC's
// chibi (0x009d30b0) -> 0x009d8d60(0). Nothing when the scene isn't the area map.
void lobbyAreaMapNpcRelease(int32_t npc);

// TODO(yaneSDK): CMouseEx::IsPushRButton (vslot 15 of CApp + 0x148).
bool lobbyMouseRightPushed();
// TODO(System): CWindowTaskText::textHeight (0x005af710 -> CTextElm 0x0058b180): the text's height laid out at width.
int32_t windowTextHeight(CWindowTaskText* t, int32_t width);
// TODO(System): the game options object (*DAT_0127188c)'s switch at vtable offset `vtableOffset` (0xc0 .. 0xd0: the
// player menu's room conditions, chat, friend, black list and trade are turned off when it returns true).
bool lobbyGameOption(int32_t vtableOffset);
// TODO(Game): the friend and black lists (CListManager::contains 0x0085d1a0 on the game data, DAT_012711ac + 0xc50,
// + 0x4 / + 0x65f4).
bool lobbyFriendListContains(int32_t pid);
bool lobbyBlackListContains(int32_t pid);
// TODO(Net/System): a title's name (0x0068fc50, the title table at 0x00c98d50).
vc6::string lobbyTitleName(uint16_t title);
// TODO(Game): CNationFlag (src/Game/Avatar has it; its CSpriteElm stand-in can't share a program with the window
// controls' yet): create (0x009d5a90) and setNation (0x009d5e80).
CElement* lobbyNationFlagCreate(CTask* parent, uint32_t priority);
void lobbyNationFlagSet(CElement* flag, const vc6::string& code, int32_t size);
// TODO(duel): CDuelAvaTask 0x00781ec0 (the player menu's close: the conversation's avatar for `side` goes).
void duelAvaHide(int32_t side);
// TODO(Game): the lobby's chat window (CGameMng::chatWindow 0x00a564b0, a CChatWindow) and what the player menu does to
// it: its text (0x005f5030), the cursor (0x005f4af0) and its input control (CTaskPtr +0x3d4).
CWindowTaskModel* lobbyChatWindow();
void chatWindowSetText(CWindowTaskModel* chat, const char16_t* text);
void chatWindowSetCursor(CWindowTaskModel* chat, int32_t pos, int32_t end);
CWindowTaskControll* chatWindowInput(CWindowTaskModel* chat);
