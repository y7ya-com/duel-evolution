// src/Net's named structs against the generated class headers (include/yo2, phase 0b), on the exe's 32-bit ABI.
// tests/net_test.py compiles this with i686-w64-mingw32-g++ -fsyntax-only. SAME checks the offset, SAMEW also the
// width. A field the generated header doesn't have (or gets wrong) is listed in src/Net/HEADER_ISSUES.md instead.
#include <stddef.h>
#include <stdint.h>

namespace gen {
#include "yo2/System/CNetAccount.h"
#include "yo2/System/CNetGate.h"
#include "yo2/System/CNetLobby.h"
#include "yo2/System/COnlinePlayer.h"
#include "yo2/System/CServerInfo.h"
#include "yo2/Net/CFriendApply.h"
}  // namespace gen

#include "NetLobby.h"

#define SAME(M, f, G, g) static_assert(offsetof(M, f) == offsetof(gen::G, g), #M "::" #f " vs " #G "::" #g)
#define SAMEW(M, f, G, g) SAME(M, f, G, g); static_assert(sizeof(M::f) == sizeof(gen::G::g), #M "::" #f " width")
#define SIZE(M, G) static_assert(sizeof(M) == sizeof(gen::G), "sizeof " #M " vs " #G)

static_assert(sizeof(void*) == 4, "compile this for i686");

SAMEW(CMessageIOBase, port, CMessageIOBase, f_0x14);
SAMEW(CMessageIOBase, notify, CMessageIOBase, f_0x18);
SAME(CMessageIOBase, req, CMessageIOBase, f_0x1c);
SAMEW(CMessageIOBase, byeSent, CMessageIOBase, f_0xe4);
SAME(CMessageIOBase, lastRecv, CMessageIOBase, f_0xe8);
SAME(CMessageIOBase, lastPing, CMessageIOBase, f_0xec);
SAMEW(CMessageIOBase, conn, CMessageIOBase, f_0xf0);

SAMEW(CNetGate, listing, CNetGate, f_0x548);
SAME(CNetGate, result, CNetGate, f_0x54c);
SIZE(CServerInfo, CServerInfo);

SAMEW(CNetAccount, trunkChunk, CNetAccount, f_0x554);
SAMEW(CNetAccount, duelPassPacks, CNetAccount, f_0x1210);
SAMEW(CNetAccount, authFlags, CNetAccount, f_0x1214);
SAMEW(CNetAccount, u1218, CNetAccount, f_0x1218);
SAME(CNetAccount, me, CNetAccount, f_0x121c);
SAME(CNetAccount, bin, CNetAccount, f_0x3264);
SIZE(CNetAccount, CNetAccount);

SAMEW(CMyUser, u04, CMyUser, f_0x4);
SAME(CMyUser, user, CMyUser, f_0x8);
SAME(CMyUser, password, CMyUser, f_0x19);
SAMEW(CMyUser, u2c, CMyUser, f_0x2c);
SAMEW(CMyUser, activeSlot, CMyUser, f_0x6d0);

SAMEW(CPlayerInfo, valid, CPlayerInfo, f_0x4);
SAME(CPlayerInfo, pid, CPlayerInfo, f_0xc);
SAME(CPlayerInfo, name, CPlayerInfo, f_0x10);
SAMEW(CPlayerInfo, level, CPlayerInfo, f_0xa4);
SAMEW(CPlayerInfo, u0a8, CPlayerInfo, f_0xa8);
SAMEW(CPlayerInfo, mp, CPlayerInfo, f_0xac);
SAME(CPlayerInfo, w0b0, CPlayerInfo, f_0xb0);
SAMEW(CPlayerInfo, u0d0, CPlayerInfo, f_0xd0);
SAME(CPlayerInfo, w0d4, CPlayerInfo, f_0xd4);
SAME(CPlayerInfo, u0d8, CPlayerInfo, f_0xd8);
SAME(CPlayerInfo, w0e0, CPlayerInfo, f_0xe0);
SAME(CPlayerInfo, u0ec, CPlayerInfo, f_0xec);
SAME(CPlayerInfo, w104, CPlayerInfo, f_0x104);
SAMEW(CPlayerInfo, u10c, CPlayerInfo, f_0x10c);
SAMEW(CPlayerInfo, w110, CPlayerInfo, f_0x110);
SAMEW(CPlayerInfo, titleId, CPlayerInfo, f_0x112);
SAMEW(CPlayerInfo, w114, CPlayerInfo, f_0x114);
SAMEW(CPlayerInfo, w116, CPlayerInfo, f_0x116);
SAMEW(CPlayerInfo, b118, CPlayerInfo, f_0x118);
SAMEW(CPlayerInfo, b119, CPlayerInfo, f_0x119);
SAME(CPlayerInfo, u11c, CPlayerInfo, f_0x11c);
SAME(CPlayerInfo, country, CPlayerInfo, f_0x12c);
SAMEW(CPlayerInfo, state, CPlayerInfo, f_0x130);
SAMEW(CPlayerInfo, block, CPlayerInfo, f_0x131);
SAME(CPlayerInfo, avatar, CPlayerInfo, f_0x134);
SAME(CPlayerInfo, x, CPlayerInfo, f_0x15c);
SAME(CPlayerInfo, dir, CPlayerInfo, f_0x160);
SAMEW(CPlayerInfo, teamId, CPlayerInfo, f_0x17c);
SAME(CPlayerInfo, teamName, CPlayerInfo, f_0x180);
SAME(CPlayerInfo, teamCode, CPlayerInfo, f_0x190);
SAMEW(CPlayerInfo, teamCodeNum, CPlayerInfo, f_0x1a4);
SIZE(CPlayerInfo, CPlayerInfo);
SIZE(CAvatarData, CAvatarData);
SIZE(COnlinePlayer, COnlinePlayer);

SAMEW(CNetLobby, playersChanged, CNetLobby, f_0x9b8);
// Rooms
SAMEW(CNetLobby, roomsChanged, CNetLobby, f_0x9d0);
SAME(CNetLobby, rival, CNetLobby, f_0x9f4);
SAME(CNetLobby, info, CNetLobby, f_0xba0);
SAME(CNetLobby, avatarX, CNetLobby, f_0xd68);
SAME(CNetLobby, avatarY, CNetLobby, f_0xd6c);
SAME(CNetLobby, matching, CNetLobby, f_0x13b0);
static_assert(sizeof(CNetLobby::rival) == sizeof(gen::COnlinePlayer), "rival is a COnlinePlayer");
static_assert(sizeof(CNetLobby::matching) == sizeof(gen::CNetLobby::f_0x13b0), "matching: 100 x 0x14");
// Social
SAMEW(CNetLobby, newMail, CNetLobby, f_0x1ba4);
SAME(CNetLobby, _vtbl1bb4, CNetLobby, f_0x1bb4);
SAMEW(CNetLobby, ownMoveCard, CNetLobby, f_0x1bce);
SAMEW(CNetLobby, ownMoveOp, CNetLobby, f_0x1bd0);
SAMEW(CNetLobby, ownStatus, CNetLobby, f_0x1bd1);
SAMEW(CNetLobby, otherMoveCard, CNetLobby, f_0x1bd2);
SAMEW(CNetLobby, otherMoveOp, CNetLobby, f_0x1bd4);
SAMEW(CNetLobby, otherStatus, CNetLobby, f_0x1bd5);
SAMEW(CNetLobby, offered, CNetLobby, f_0x1bd8);
SAMEW(CNetLobby, offerCancelled, CNetLobby, f_0x1bda);
SAMEW(CNetLobby, tradeTrunkChunk, CNetLobby, f_0x1bdc);
SAMEW(CNetLobby, tradeLimitChunk, CNetLobby, f_0x2896);
SIZE(CFriendApply, CFriendApply);

// Shop
SAME(CNetLobby, champs, CNetLobby, f_0x35fc);
SAME(CNetLobby, tourPage, CNetLobby, f_0x36dc);
SAME(CNetLobby, tourEntry, CNetLobby, f_0x4b64);
SIZE(CChampsEntryList, CChampsEntryList);
SAME(CChampsEntryList, pid, CChampsEntryList, f_0x4);
SAME(CChampsEntryList, name, CChampsEntryList, f_0x8);
SAMEW(CChampsEntryList, wins, CChampsEntryList, f_0x19);
SAMEW(CChampsEntryList, status, CChampsEntryList, f_0x1a);
SAME(CChampsEntryList, country, CChampsEntryList, f_0x1b);
SAME(CChampsEntryList, avatar, CChampsEntryList, f_0x20);
static_assert(offsetof(CNetLobby, npcPresentType) + 4 == sizeof(gen::CNetLobby), "CNetLobby ends at 0xdbd8");
