// The outside-Net hooks src/Net calls (src/Net/NetLobby_Rooms.h, _Social.h, _Shop.h), as no-ops for deck_b_cli: the
// part-B tests only drive the trade / TP messages. tests/net_cli_*.cpp has the recording versions Net tests use.
#include <string>

#include "Net/NetLobby.h"
#include "Net/NetLobby_Rooms.h"
#include "Net/NetLobby_Shop.h"
#include "Net/NetLobby_Social.h"
#include "Net/NetUi.h"

uint8_t cardDbOwned(uint16_t) { return 0; }
void cardDbSyncTrunk(const CMyUser&) {}
bool cardPackCards(uint32_t, std::vector<uint16_t>*, int32_t*) { return false; }
void newItemListAdd(NewItemList, uint16_t) {}
void npcInfoClear() {}
CNetLobby* appNetLobby() { return nullptr; }   // NetAvatarAccess lookups; part B never reaches them
std::string appGateServer() { return "127.0.0.1"; }   // CNetGate::init; part B never connects
int32_t appGatePort() { return 0; }
void npcInfoAdd(const NpcInfo&) {}
std::u16string lobbyWiden(const char* s) { return std::u16string(s, s + std::char_traits<char>::length(s)); }
void lobbyAutoDuelStarted(int32_t) {}
int lobbyFriendCount() { return 0; }
uint32_t lobbyFriendId(int) { return 0; }
bool lobbyIsBlacklisted(int32_t) { return false; }
void lobbyAddFriend(int32_t, const char*) {}
void lobbyTeamChat(uint32_t, const char*) {}
void lobbyTeamRefresh() {}
void lobbyMailReceived(const LobbyMail&) {}
void lobbyMailSent(const LobbyMail&) {}
void lobbyMenuMaintenance() {}
void lobbyMenuEvent(int32_t) {}
bool lobbyInDuel() { return false; }
void lobbyEventEffect(LobbyEventEffect) {}
