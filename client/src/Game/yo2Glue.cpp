// yo2Glue.cpp: the names other folders gave to Game functions before Game had them, forwarded to the real ones.
// Each forwarder carries the exe address it stands for. When a caller switches to the real header, delete its line.
// The duel's ones are only reached through its own layout stand-ins of our classes (same offsets, cast back here).
#include <new>

#include "Deck/KabanWindow.h"
#include "Game/yo2CardListView.h"
#include "Game/yo2GameManager.h"
#include "Game/yo2HelpText.h"
#include "Net/NetUi.h"
#include "System/vc6.h"
#include "duel/SceneDialogs.h"

// src/Deck (KabanWindow.h; KabanWindowList.h's are in yo2GlueDeckList.cpp: the two headers clash)
namespace dk {
// the trunk's filter lists: a yes/no dialog with the "not found" / "unknown" rows; `model` is what create returned
// 0x00a1e710
void* listCardTypeCreate(void* parent) { return ::CWindowModelListCardType::create(static_cast<CTask*>(parent), 1, false, true); }
// 0x00a1dd10
void* listCardAttrCreate(void* parent) { return ::CWindowModelListCardAttr::create(static_cast<CTask*>(parent), 1, false, true); }
// 0x00a1f100
void* listCardIconCreate(void* parent) { return ::CWindowModelListCardIcon::create(static_cast<CTask*>(parent), 1, false, true); }
// 0x00a1fbc0
void* listCardStarCreate(void* parent) { return ::CWindowModelListCardStar::create(static_cast<CTask*>(parent), 1, false, true); }
// 0x00a20680
void* listCardForbiCreate(void* parent) { return ::CWindowModelListCardForbi::create(static_cast<CTask*>(parent), 1, false, true); }
// 0x00a18ca0
void listboxFillTypes(void* model) { static_cast<::CWindowModelListCardType*>(model)->list_->addAll(); }
// 0x00a17540
void listboxFillAttrs(void* model) { static_cast<::CWindowModelListCardAttr*>(model)->list_->addAll(); }
// 0x00a1a3e0
void listboxFillIcons(void* model) { static_cast<::CWindowModelListCardIcon*>(model)->list_->addAll(); }
// 0x00a1b1d0
void listboxAddStar(void* model, int32_t level) { static_cast<::CWindowModelListCardStar*>(model)->list_->add(level); }
// 0x00a1c8f0
void listboxAddForbi(void* model, int32_t limit) { static_cast<::CWindowModelListCardForbi*>(model)->list_->add(limit); }
}   // namespace dk

// src/Net (NetConnectLobby.cpp): Net's `rank` is the lobby kind
// 0x00a58770
void appSetWorldForRank(int32_t rank) { g_gameMng->setLobbyRankFor(rank); }
// 0x00a58740 with the previous rank
void appRestoreWorld() { g_gameMng->setLobbyRank(g_gameMng->prevLobbyRank_); }

// In the game build (i686) src/duel/SceneExeCalls.cpp / DuelExeCalls.cpp call the exe's own copies instead.
#if !(defined(_WIN32) && defined(__i386__))
// src/duel (SceneDialogs3.cpp): CUSummonDialogSp's balloon is a HelpText in place
namespace ds {
// 0x00a5c410
void balloonConstruct(void* b) { new (b) HelpText; }
// 0x00a5c6d0
void balloonDestruct(void* b) { static_cast<HelpText*>(b)->~HelpText(); }
// 0x00a5c500 (the priority, not a width)
void balloonSetWidth(void* b, int32_t w) { static_cast<HelpText*>(b)->setPriority(w); }
// 0x00a5c530
void balloonSetText(void* b, const vc6::wstring& s) { static_cast<HelpText*>(b)->setText(s); }
// 0x00a5c6a0
void balloonHide(void* b) { static_cast<HelpText*>(b)->hide(); }

// src/duel (SceneCommon.h / SceneDialogs.h): its list classes are layout stand-ins of ours
// 0x00a18320
void CWindowTaskListboxCardType::addType(int32_t t) { reinterpret_cast<::CWindowTaskListboxCardType*>(this)->add(t); }
// 0x00a16be0
void CWindowTaskListboxCardAttr::addAttr(int32_t a) { reinterpret_cast<::CWindowTaskListboxCardAttr*>(this)->add(a); }
// 0x00a22540
void CWindowTaskListboxDuelCmd::clearCmds() { reinterpret_cast<::CWindowTaskListboxDuelCmd*>(this)->clearValues(); }
// 0x00a22270
void CWindowTaskListboxDuelCmd::addCmd(int32_t c) { reinterpret_cast<::CWindowTaskListboxDuelCmd*>(this)->add(c); }
// 0x00a1e8f0
bool listCardTypeInit(CWindowModelListCardType* d) {
    return reinterpret_cast<::CWindowModelListCardType*>(d)->::CWindowModelListCardType::onInit();
}
// 0x00a1def0
bool listCardAttrInit(CWindowModelListCardAttr* d) {
    return reinterpret_cast<::CWindowModelListCardAttr*>(d)->::CWindowModelListCardAttr::onInit();
}
// 0x00a22dd0
bool CWindowModelListDuelCmd::baseInit() {
    return reinterpret_cast<::CWindowModelListDuelCmd*>(this)->::CWindowModelListDuelCmd::onInit();
}
}   // namespace ds

// src/duel (EngineCmd5.cpp): 0x00a58630 CGameMng::modeIsLobby (no null check in the exe either)
bool soundEnabled() { return g_gameMng->modeIsLobby(); }
#endif
