// What CTgtAvaListDlg calls in classes other owners rewrite (in tests: tests/game/gameb_tgtava_test.cpp).
// "inline at 0xADDR": the exe has no function of its own for it; that function does it in place.
#pragma once
#include <cstdint>
#include <vector>

class CChibiAvatar;
class CChibiAvatarMng;
class CElement;
class CSceneTask;

// TODO(Game A): CChibiAvatarMng: the avatars at world x, y (FUN_009d3190) and the element they are drawn under
// (+0x78, a CTaskPtr<CElement>).
void chibiMngCollectAt(CChibiAvatarMng* mng, int32_t wx, int32_t wy, std::vector<CChibiAvatar*>* out);
CElement* chibiMngLayer(CChibiAvatarMng* mng);   // inline at 0x00ad9e80
// TODO(Game A): CNpcChibiAvatar: the "being looked at" mark (FUN_009d8d60) and its NPC id (+0xf4).
void npcAvatarSetMarked(CChibiAvatar* npc, bool on);
int32_t npcAvatarId(CChibiAvatar* npc);   // inline at 0x00ada5b0
// TODO(Game A): when the scene is the area map (CAreaMapScene), the player's own avatar (FUN_009fb100 -> FUN_009c44a0); else null.
CChibiAvatar* areaMapMyAvatar(CSceneTask* scene);
// TODO(Lobby): a pick opens the player's info (FUN_0085f890 + FUN_0089a920 on its pid) or talks to the NPC
// (FUN_0085f8c0(id, -1, -1) + FUN_0089f790).
void playerInfoOpen(uint32_t pid);
void npcTalkOpen(int32_t npcId);   // 0x0085f8c0 + 0x0089f790
// TODO(yaneSDK): CMouseEx vslot 15 of the app's mouse (CApp + 0x148): the right button went down.
bool appMouseRightPushed();   // inline at 0x00ada5b0
