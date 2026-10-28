// No-op stand-ins for the src/Net hooks the lobby parsers call (the Net tests' net_cli*.cpp record them; the Lobby
// tests only link CNetLobby for its data), built into every Lobby test.
#include <string>
#include "Net/NetLobby_Rooms.h"
#include "Net/NetLobby_Shop.h"
#include "Net/NetLobby_Social.h"

uint8_t cardDbOwned(uint16_t) { return 0; }
void cardDbSyncTrunk(const CMyUser&) {}
bool cardPackCards(uint32_t, std::vector<uint16_t>*, int32_t*) { return false; }
void limitationCount(int32_t) {}
void limitationSet(int32_t, int32_t, int32_t, uint8_t) {}
void lobbyAddFriend(int32_t, const char*) {}
void lobbyEventEffect(LobbyEventEffect) {}
int lobbyFriendCount() { return 0; }
uint32_t lobbyFriendId(int) { return 0; }
bool lobbyInDuel() { return false; }
bool lobbyIsBlacklisted(int32_t) { return false; }
void lobbyMailReceived(const LobbyMail&) {}
void lobbyMailSent(const LobbyMail&) {}
void lobbyMenuEvent(int32_t) {}
void lobbyTeamChat(uint32_t, const char*) {}
void lobbyTeamRefresh() {}
std::u16string lobbyWiden(const char*) { return {}; }
void newItemListAdd(NewItemList, uint16_t) {}
void npcInfoAdd(const NpcInfo&) {}
void npcInfoClear() {}
void unreleasedCount(int32_t) {}
void unreleasedSet(int32_t, int32_t, int32_t) {}
void lobbyAutoDuelStarted(int32_t) {}
void lobbyMenuMaintenance() {}
// CNetGate::init's system config (Net/NetUi.h)
std::string appGateServer() { return "127.0.0.1"; }
int32_t appGatePort() { return 5730; }
