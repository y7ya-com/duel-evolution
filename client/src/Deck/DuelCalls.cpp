// What the deck code asks the duel's card database and the duel scene, under the names the deck files declared them
// with, forwarded to the implementations (src/duel). The deck tests build without this file and stub these names.
// No exe code of its own: every target carries its marker.
#include "DeckEntryMain.h"
#include "DeckUtil.h"
#include "DeckWindow.h"
#include "KabanWindowList.h"
#include "duel/CardDB.h"
#include "duel/DuelText.h"
#include "duel/SceneDuelScene.h"

int engCardCategory(int id);   // src/duel/EngineCards1.cpp

namespace dk {

namespace card {
int32_t konamiId(int32_t id) { return cardPropId(id); }          // 0x0073bc50
int32_t kind(int32_t kid) { return cardKind(kid); }              // 0x0073c010
int32_t attribute(int32_t kid) { return cardAttr(kid); }         // 0x0073bf80
int32_t level(int32_t kid) { return cardLevel(kid); }            // 0x0073bfb0
int32_t icon(int32_t kid) { return cardIcon(kid); }              // 0x0073bfe0
int32_t race(int32_t kid) { return cardRace(kid); }              // 0x0073bf20
int32_t atk(int32_t kid) { return cardAtk(kid); }                // 0x0073c040
int32_t def(int32_t kid) { return cardDef(kid); }                // 0x0073c080
int32_t sortKey(int32_t kid) { return cardSortKey(kid); }        // 0x0073bdd0
int32_t group(int32_t kid) { return engCardCategory(kid); }      // 0x00716c30
int32_t limit(int32_t kid) { return cardLimit(kid); }            // 0x00716c10 (FUN_0073c190)
}   // namespace card

uint32_t cardKonamiId(uint32_t card) { return (uint32_t)cardPropId((int)card); }       // 0x0073bc50
int32_t cardLimit(uint32_t konamiId) { return ::cardLimit((int)konamiId); }           // 0x00716c10 (FUN_0073c190)
int32_t cardFrame(uint32_t konamiId) { return cardKind((int)konamiId); }              // 0x0073c010
uint32_t cardInternalId(int32_t index) { return (uint32_t)cardPropId(index); }        // 0x0073bc50
uint32_t cardFrameType(uint32_t id) { return (uint32_t)cardKind((int)id); }           // 0x0073c010
void duelSetMode(int32_t m) { ds::duelStart(m); }                                     // 0x00794d90

}   // namespace dk
