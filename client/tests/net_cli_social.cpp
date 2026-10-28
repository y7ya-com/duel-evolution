// Social group verbs for the src/Net test driver, plus stubs for NetLobby_Social.h's hooks (they print what they get).
#include <set>

#include "NetLobby_Social.h"
#include "net_cli.h"

static std::set<int32_t> g_black;

bool lobbyIsBlacklisted(int32_t pid) { return g_black.count(pid) != 0; }
void lobbyAddFriend(int32_t pid, const char* name) { printf("hook addfriend %d %s\n", pid, str(name).c_str()); }
void lobbyTeamChat(uint32_t textId, const char* name) { printf("hook teamchat %u %s\n", textId, name ? str(name).c_str() : "-"); }
void lobbyTeamRefresh() { printf("hook teamrefresh\n"); }
static void printMail(const char* k, const LobbyMail& m) {
    printf("hook %s from=%d fromName=%s to=%d toName=%s sent=%d subject=%s body=%s extra=%s valid=%u read=%u recvd=%d\n", k,
           m.from, str(m.fromName.c_str()).c_str(), m.to, str(m.toName.c_str()).c_str(), m.sent,
           str(m.subject.c_str()).c_str(), str(m.body.c_str(), 600).c_str(), str(m.extra.c_str()).c_str(), m.valid, m.read,
           m.received != 0);
}
void lobbyMailReceived(const LobbyMail& m) { printMail("mail", m); }
void lobbyMailSent(const LobbyMail& m) { printMail("mailsent", m); }
void lobbyMenuMaintenance() { printf("hook maintenance\n"); }
void lobbyMenuEvent(int32_t kind) { printf("hook menuevent %d\n", kind); }
static bool g_inDuel;
bool lobbyInDuel() { return g_inDuel; }
void lobbyEventEffect(LobbyEventEffect e) { printf("hook eventeffect %d\n", (int)e); }

NET_CLI("call", "soc.black") { g_black.insert(atoi(arg.c_str())); });
NET_CLI("call", "soc.induel") { g_inDuel = atoi(arg.c_str()) != 0; });
NET_CLI("call", "soc.rgn") { lobby.rgn = (uint8_t)atoi(arg.c_str()); });
NET_CLI("call", "soc.ownpid") { acc.me.players[acc.me.activeSlot].pid = atoi(arg.c_str()); });
NET_CLI("call", "soc.chunk") { lobby.tradeTrunkChunk = (uint8_t)atoi(arg.c_str()); });

NET_CLI("build", "lb.sendmail") {
    (void)arg;
    LobbyMail m{};
    m.to = 100051;
    m.subject = "Reto";
    m.body = "Duelo?";
    lobby.sendMail(m);
});

NET_CLI("dump", "social") {
    (void)arg;
    CNetLobby& l = lobby;
    printf("social reqFriend=%d search=%d pidRes=%d pid=%d sendMail=%d mailList=%d mailCount=%d addBlack=%d delBlack=%d "
           "reqTrade=%d offerReply=%d addCard=%d delCard=%d teamCreate=%d teamCreateEnd=%d teamDisband=%d teamListEnd=%d "
           "inTeam=%u authority=%u joinApplied=%u friendAccepted=%d friendPid=%d friendName=%s newMail=%u maint=%d "
           "maintTime=%d event=%d,%d,%u changed=%d\n",
           l.reqFriendResult, l.friendSearchResult, l.pidByNameResult, l.pidByName, l.sendMailResult, l.mailListResult,
           l.mailCount, l.addBlackResult, l.delBlackResult, l.reqTradeResult, l.tradeOfferReplyResult, l.addCardResult,
           l.deleteCardResult, l.teamCreateResult, l.teamCreateEnd, l.teamDisbandResult, l.teamListEnd, l.inTeam,
           l.myTeamAuthority, l.joinApplied, l.friendAccepted, l.friendPid, str(l.friendName.c_str()).c_str(), l.newMail,
           l.maintSeconds, l.maintTime != 0, l.eventId, l.eventKind, l.eventNew, l.playersChanged);
    printf("trade partner=%d name=%s own=%u,%u,%u other=%u,%u,%u confirm=%u end=%u offered=%u cancelled=%u chunks=%u,%u\n",
           l.tradePartner, str(l.tradePartnerName).c_str(), l.ownMoveCard, l.ownMoveOp, l.ownStatus, l.otherMoveCard,
           l.otherMoveOp, l.otherStatus, l.confirmResult, l.tradeEndOk, l.offered, l.offerCancelled, l.tradeTrunkChunk,
           l.tradeLimitChunk);
    printf("teamname %s\n", str(l.teamName.c_str()).c_str());
    for (const TeamMember& m : l.teamMembers) printf("member %d %s %u\n", m.pid, str(m.name.c_str()).c_str(), m.authority);
    for (const TeamApplication& a : l.joinApplications)
        printf("apply %d %s %d %s\n", a.applicant, str(a.applicantName.c_str()).c_str(), a.leader, str(a.leaderName.c_str()).c_str());
    for (const CFriendApply& f : l.friendOffers) printf("offer %d %s %u\n", f.pid, str(f.name).c_str(), f.level);
    printf("socflags");
    for (int f = 0x3d; f <= 0x63; f++) printf(" %x:%u", f, l.flag(f));
    printf(" 84:%u 85:%u 88:%u\n", l.flag(0x84), l.flag(0x85), l.flag(0x88));
    printf("trunk %s\nlimit %s\n", hex(acc.me.trunk, TRUNK_BYTES).c_str(), hex(acc.me.trunk2, TRUNK_BYTES).c_str());
});
