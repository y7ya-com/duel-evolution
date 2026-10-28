// What Game's Avatar code reads from Net's player records (src/Game/Avatar/yo2AvatarExtern.h, TODO(Net)). Its own file
// so the linker only takes it where nothing else defines these.
#include <string>

#include "Game/Avatar/yo2AvatarExtern.h"
#include "NetLobby.h"
#include "NetUi.h"

int32_t playerPid(const CPlayerInfo& p) { return p.pid; }
std::string playerCountry(const CPlayerInfo& p) { return std::string(p.country, strnlen(p.country, sizeof p.country)); }
uint8_t playerState(const CPlayerInfo& p) { return p.state; }
const uint8_t* playerAvatar(const CPlayerInfo& p, int world) { return p.avatar[world].bytes_; }
uint16_t playerStars(const CPlayerInfo& p) { return p.w116; }
int32_t playerTeamId(const CPlayerInfo& p) { return (int32_t)p.teamId; }
std::string playerTeamName(const CPlayerInfo& p) { return std::string(p.teamName, strnlen(p.teamName, sizeof p.teamName)); }
int32_t playerTeamCode(const CPlayerInfo& p) { return p.teamCodeNum; }

const CPlayerInfo* lobbyFindPlayer(int32_t pid) {
    for (const COnlinePlayer& o : appNetLobby()->players)
        if (o.pid == pid) return &o;
    return nullptr;
}
uint8_t lobbyRoomKind() { return appNetLobby()->rank; }
