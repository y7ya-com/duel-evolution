// What the Social lobby handlers (NetLobby_Social.cpp) need from other subsystems. Each hook stands for code outside
// Net that the exe calls at that point; the game (Lobby/, Game/, System/) supplies them, tests stub them.
#pragma once
#include <cstdint>
#include <string>

struct CMyUser;
struct LobbyMail;

// Friend / black list object at *(DAT_012711ac + 0xc50) (Lobby/).
bool lobbyIsBlacklisted(int32_t pid);                    // FUN_0085d1a0
void lobbyAddFriend(int32_t pid, const char* name);      // FUN_0085d1d0 + FUN_0085cf70 (add, save); no-op without the list
// System text 0x14cc..0x14cf (team join / banish / leave / disband) into chat channel 5: the text table at
// DAT_01271840 (vtable +4), formatted "@3%s" with name (null for disband), then FUN_00a564b0 / FUN_005f4190.
void lobbyTeamChat(uint32_t textId, const char* name);
// TEAM_UPDATE: re-reads the player list in the current scene (CAreaMapScene: FUN_009fb0d0, CMyRoomScene:
// FUN_00825180, both then FUN_009d3820), chosen by *(DAT_01271790 + 0x7c) == 0xc / 10.
void lobbyTeamRefresh();
// Mailboxes at DAT_012ad2e8: +4 received (vtable +0x18 add, +8 refresh), +0x40 sent (same slots).
void lobbyMailReceived(const LobbyMail& m);
void lobbyMailSent(const LobbyMail& m);
// Menu bar (FUN_00a564e0 opens the CWindowModelMenu): maintenance icon FUN_00a7fb70(0), event icon FUN_00a800a0(kind).
void lobbyMenuMaintenance();
void lobbyMenuEvent(int32_t kind);
bool lobbyInDuel();                                      // (*DAT_0127188c)->vtable[0xd8 / 4]()
// What an EVENTINFO kind turns on: DAT_012bb6b0 + 0x4e9 / + 0x4ea flags, FUN_00a5a9c0, FUN_00a5a9e0.
enum LobbyEventEffect { EVENT_FLAG_4E9, EVENT_FLAG_4EA, EVENT_CALL_A5A9C0, EVENT_CALL_A5A9E0 };
void lobbyEventEffect(LobbyEventEffect e);

struct CPlayerInfo;
std::string playerNameString(const CPlayerInfo& p);     // FUN_006bcc30 (also what REQMATCH 0x6cc420 uses)

// FUN_006adf50: the text filter applied to chat and mail text; in this build it only copies (lang is ignored).
void lobbyTextFilter(int32_t lang, const char* in, char* out);

enum : int {   // lobby request bytes the Social handlers answer (the rest are in NetLobby.h)
    LB_REQ_FRIENDNOTICE = 0x3e, LB_REQ_FRIENDOFFER = 0x3f, LB_REQ_FRIENDSEARCH = 0x40, LB_REQ_SENDMAIL = 0x42,
    LB_REQ_SHORTMAIL = 0x45, LB_REQ_MAINTENANCE = 0x48, LB_REQ_EVENTINFO = 0x49, LB_REQ_TRADEOFFER = 0x51,
    LB_REQ_OWNMOVE = 0x58, LB_REQ_OTHERMOVE = 0x59, LB_REQ_ALLREADY = 0x5b, LB_REQ_TRADEEND = 0x5d,
    LB_REQ_TRADETRUNK = 0x5f, LB_REQ_ARRIVECARD = 0x60, LB_REQ_TRADELIMIT = 0x62, LB_REQ_CHANGESTATUS = 0x63,
};
