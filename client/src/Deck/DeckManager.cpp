#include "DeckManager.h"

#include <cstddef>
#include <cstring>
#include <vector>

#include "System/yo2File.h"
#include "duel/CardDB.h"
#include "duel/EngineInternal.h"

struct CDeckManager::Layout {
    YO2_AT(CDeckManager, deck_, 0x004);
    YO2_AT(CDeckManager, sizes_, 0x5a4);
    YO2_AT(CDeckManager, fileName_, 0x5ac);
    YO2_AT(CDeckManager, dir_, 0x5bc);
    YO2_AT(CDeckManager, count_, 0x5cc);
};
YO2_SIZEOF(CDeckManager, 0x85cc);
static_assert(sizeof(CDeckManager::File) == 0xfa && sizeof(CDeckManager::Deck) == 0x2d0, "deck record sizes");

namespace {
enum { MAIN, SIDE, EXTRA, MISSING };
const uint8_t kMax[4] = {CDeckManager::MAIN_MAX, CDeckManager::SIDE_MAX, CDeckManager::EXTRA_MAX,
                         CDeckManager::MISSING_MAX};

uint8_t& sizeOf(CDeckManager::Sizes& s, int list) {
    return list == MAIN ? s.main : list == SIDE ? s.side : list == EXTRA ? s.extra : s.missing;
}
uint8_t& countOf(CDeckManager::Count& c, int list) {
    return list == MAIN ? c.main : list == SIDE ? c.side : list == EXTRA ? c.extra : c.missing;
}
uint16_t* listOf(CDeckManager::Lists& l, int list) {
    return list == MAIN ? l.main : list == SIDE ? l.side : list == EXTRA ? l.extra : l.missing;
}
// The card box: 3 bytes per card id from +9, the first is the copies owned.
uint8_t boxCopies(const uint8_t* box, uint16_t id) { return box[id * 3 + 9]; }
}  // namespace

// @yo2 0x00905e30 g_deckManager's dynamic initializer
CDeckManager* g_deckManager = new CDeckManager;

// @yo2 0x00906010 CDeckManager::CDeckManager: everything empty, the file is "deck.ydc" (folder unset)
CDeckManager::CDeckManager() {
    clearAll();
    fileName_ = "deck.ydc";
    dir_ = "";
}

// @yo2 0x00906290 CDeckManager::setFileName
void CDeckManager::setFileName(vc6::string name) { fileName_ = name; }
// @yo2 0x00906440 CDeckManager::setDirectory
void CDeckManager::setDirectory(vc6::string dir) { dir_ = dir; }

bool CDeckManager::add(int deck, int list, uint16_t id, const uint8_t* box) {
    Count& c = count_[deck][id];
    uint8_t& size = sizeOf(sizes_[deck], list);
    if (list != MISSING) {
        const uint8_t held = static_cast<uint8_t>(c.main + c.side + c.extra);
        const uint32_t same = deck == 0 ? sameCardCount(id) : sameCardCountB(id);
        const uint32_t limit = static_cast<uint32_t>(engCardLimit(cardPropId(id)));   // compared unsigned, all 32 bits
        if (size >= kMax[list] || held >= boxCopies(box, id) || same >= limit)
            return false;
    } else if (size >= kMax[list]) {
        return false;
    }
    listOf(deck_[deck].lists, list)[size] = id;
    size++;
    countOf(c, list)++;
    return true;
}

// @yo2 0x00907350 CDeckManager::addMain (95 at most)
bool CDeckManager::addMain(uint16_t id, const uint8_t* box) { return add(0, MAIN, id, box); }
// @yo2 0x00907430 CDeckManager::addSide (30 at most)
bool CDeckManager::addSide(uint16_t id, const uint8_t* box) { return add(0, SIDE, id, box); }
// @yo2 0x00907510 CDeckManager::addExtra (30 at most)
bool CDeckManager::addExtra(uint16_t id, const uint8_t* box) { return add(0, EXTRA, id, box); }
// @yo2 0x009075f0 CDeckManager::addMissing (80 at most, no box or limit check)
bool CDeckManager::addMissing(uint16_t id) { return add(0, MISSING, id, nullptr); }
// @yo2 0x00907660 CDeckManager::addMainB
bool CDeckManager::addMainB(uint16_t id, const uint8_t* box) { return add(1, MAIN, id, box); }
// @yo2 0x00907740 CDeckManager::addSideB
bool CDeckManager::addSideB(uint16_t id, const uint8_t* box) { return add(1, SIDE, id, box); }
// @yo2 0x00907820 CDeckManager::addExtraB
bool CDeckManager::addExtraB(uint16_t id, const uint8_t* box) { return add(1, EXTRA, id, box); }
// @yo2 0x00907900 CDeckManager::addMissingB
bool CDeckManager::addMissingB(uint16_t id) { return add(1, MISSING, id, nullptr); }

bool CDeckManager::remove(int list, uint16_t id) {
    uint16_t* l = listOf(deck_[0].lists, list);
    uint8_t& size = sizeOf(sizes_[0], list);
    for (int i = 0; i < size; i++) {
        if (l[i] != id)
            continue;
        size--;
        for (; i < size; i++)
            l[i] = l[i + 1];
        l[i] = 0;
        countOf(count_[0][id], list)--;
        return true;
    }
    return false;
}

// @yo2 0x00907970 CDeckManager::removeMain
bool CDeckManager::removeMain(uint16_t id, const uint8_t*) { return remove(MAIN, id); }
// @yo2 0x00907a30 CDeckManager::removeSide
bool CDeckManager::removeSide(uint16_t id, const uint8_t*) { return remove(SIDE, id); }
// @yo2 0x00907af0 CDeckManager::removeExtra
bool CDeckManager::removeExtra(uint16_t id, const uint8_t*) { return remove(EXTRA, id); }
// @yo2 0x00907bb0 CDeckManager::removeMissing
bool CDeckManager::removeMissing(uint16_t id, const uint8_t*) { return remove(MISSING, id); }

// The inline accessors (DeckManager.h), in vtable order:
// @yo2 0x009065f0 CDeckManager::mainSize
// @yo2 0x00906610 CDeckManager::sideSize
// @yo2 0x00906630 CDeckManager::extraSize
// @yo2 0x00906650 CDeckManager::missingSize
// @yo2 0x00906670 CDeckManager::mainSizeB
// @yo2 0x00906690 CDeckManager::sideSizeB
// @yo2 0x009066b0 CDeckManager::extraSizeB
// @yo2 0x009066d0 CDeckManager::missingSizeB
// @yo2 0x00906730 CDeckManager::setMainCopies
// @yo2 0x00906760 CDeckManager::mainCopies
// @yo2 0x00906790 CDeckManager::mainList
// @yo2 0x009067b0 CDeckManager::addMainCopies
// @yo2 0x009067f0 CDeckManager::subMainCopies (not below 0)
// @yo2 0x00906840 CDeckManager::setSideCopies
// @yo2 0x00906870 CDeckManager::sideCopies
// @yo2 0x009068a0 CDeckManager::sideList
// @yo2 0x009068c0 CDeckManager::addSideCopies
// @yo2 0x00906900 CDeckManager::subSideCopies
// @yo2 0x00906950 CDeckManager::setExtraCopies
// @yo2 0x00906980 CDeckManager::extraCopies
// @yo2 0x009069b0 CDeckManager::extraList
// @yo2 0x009069d0 CDeckManager::addExtraCopies
// @yo2 0x00906a10 CDeckManager::subExtraCopies
// @yo2 0x00906a60 CDeckManager::setMissingCopies
// @yo2 0x00906a90 CDeckManager::missingCopies
// @yo2 0x00906ac0 CDeckManager::missingList
// @yo2 0x00906ae0 CDeckManager::addMissingCopies
// @yo2 0x00906b20 CDeckManager::subMissingCopies
// @yo2 0x00906b70 CDeckManager::mainListB
// @yo2 0x00906b90 CDeckManager::sideListB
// @yo2 0x00906bb0 CDeckManager::extraListB
// @yo2 0x00906bd0 CDeckManager::missingListB

// @yo2 0x00907c70 CDeckManager::sameCardCount (deck A; the list sizes are re-asked through the vtable every step)
uint8_t CDeckManager::sameCardCount(uint16_t id) {
    const int prop = cardPropId(id);
    uint8_t n = 0;
    const uint16_t* lists[3] = {mainList(), sideList(), extraList()};
    for (int i = 0; i < mainSize(); i++)
        n += engSameCard(cardPropId(lists[0][i]), prop) != 0;
    for (int i = 0; i < sideSize(); i++)
        n += engSameCard(cardPropId(lists[1][i]), prop) != 0;
    for (int i = 0; i < extraSize(); i++)
        n += engSameCard(cardPropId(lists[2][i]), prop) != 0;
    return n;
}

// @yo2 0x00907df0 CDeckManager::sameCardCountB
uint8_t CDeckManager::sameCardCountB(uint16_t id) {
    const int prop = cardPropId(id);
    uint8_t n = 0;
    const uint16_t* lists[3] = {mainListB(), sideListB(), extraListB()};
    for (int i = 0; i < mainSizeB(); i++)
        n += engSameCard(cardPropId(lists[0][i]), prop) != 0;
    for (int i = 0; i < sideSizeB(); i++)
        n += engSameCard(cardPropId(lists[1][i]), prop) != 0;
    for (int i = 0; i < extraSizeB(); i++)
        n += engSameCard(cardPropId(lists[2][i]), prop) != 0;
    return n;
}

// @yo2 0x009066f0 CDeckManager::copies
uint8_t CDeckManager::copies(uint16_t id) const {
    const Count& c = count_[0][id];
    return static_cast<uint8_t>(c.main + c.extra + c.side);   // the exe adds whole registers; only the low byte is set
}

void CDeckManager::clearAll() {
    std::memset(deck_, 0, sizeof deck_);
    std::memset(sizes_, 0, sizeof sizes_);
    std::memset(count_, 0, sizeof count_);
}

// @yo2 0x00906bf0 CDeckManager::clear
bool CDeckManager::clear() {
    clearAll();
    return true;
}

// @yo2 0x00906cc0 CDeckManager::reset
void CDeckManager::reset() { clearAll(); }

// @yo2 0x00906d90 CDeckManager::clearMissing
void CDeckManager::clearMissing() {
    std::memset(deck_[0].lists.missing, 0, sizeof deck_[0].lists.missing);
    sizes_[0].missing = 0;
    for (Count& c : count_[0])
        c.missing = 0;
}

vc6::string CDeckManager::path(const vc6::string& name) const {
    vc6::string p = dir_;
    p += "\\";
    p += name;
    return p;
}

// @yo2 0x00906dd0 CDeckManager::save: the first 80 / 15 / 30 cards of deck A's lists into the record, then the file
bool CDeckManager::save() {
    File& f = deck_[0].file;
    std::memset(&f, 0, sizeof f);
    std::memcpy(f.main, deck_[0].lists.main, sizeof f.main);
    std::memcpy(f.side, deck_[0].lists.side, sizeof f.side);
    std::memcpy(f.extra, deck_[0].lists.extra, sizeof f.extra);
    return yo2SaveFile(path(fileName_).c_str(), &f, sizeof f);
}

// Each card of a deck's record goes back into its list; one that can't (or, with no box, any) goes to missing.
void CDeckManager::addFromFile(int deck, const uint8_t* box) {
    const File& f = deck_[deck].file;
    for (uint16_t id : f.main)
        if (id && box && !(deck == 0 ? addMain(id, box) : addMainB(id, box)))
            deck == 0 ? addMissing(id) : addMissingB(id);
    for (uint16_t id : f.side)
        if (id && box && !(deck == 0 ? addSide(id, box) : addSideB(id, box)))
            deck == 0 ? addMissing(id) : addMissingB(id);
    for (uint16_t id : f.extra)
        if (id && box && !(deck == 0 ? addExtra(id, box) : addExtraB(id, box)))
            deck == 0 ? addMissing(id) : addMissingB(id);
}

// @yo2 0x00907f80 CDeckManager::load: both decks are cleared first; with no card box loaded the lists stay empty
bool CDeckManager::load() {
    std::vector<uint8_t> data;
    if (!yo2LoadFile(path(fileName_).c_str(), data))
        return false;
    clearAll();
    std::memcpy(&deck_[0].file, data.data(), data.size() < sizeof(File) ? data.size() : sizeof(File));
    addFromFile(0, appCardBox());
    return true;
}

// @yo2 0x00906fb0 CDeckManager::loadOther: into deck B; false if it can't be read, there's no card box, or a card of
// it isn't owned
bool CDeckManager::loadOther(vc6::string name) {
    std::vector<uint8_t> data;
    if (!yo2LoadFile(path(name).c_str(), data))
        return false;
    std::memset(&deck_[1], 0, sizeof deck_[1]);
    sizes_[1] = Sizes{};
    std::memset(count_[1], 0, sizeof count_[1]);
    std::memcpy(&deck_[1].file, data.data(), data.size() < sizeof(File) ? data.size() : sizeof(File));
    const uint8_t* box = appCardBox();
    if (!box)
        return false;
    addFromFile(1, box);
    return missingSizeB() == 0;
}

// ---------------------------------------------------------------- CDeckRuleCheck
uint32_t CDeckRuleCheck::s_main, CDeckRuleCheck::s_side, CDeckRuleCheck::s_extra;
uint16_t CDeckRuleCheck::s_mainIds[80], CDeckRuleCheck::s_sideIds[15], CDeckRuleCheck::s_extraIds[30];

// @yo2 0x00904d70 CDeckRuleCheck::clear
void CDeckRuleCheck::clear() {
    s_main = s_side = s_extra = 0;
    std::memset(s_mainIds, 0, sizeof s_mainIds);
    std::memset(s_sideIds, 0, sizeof s_sideIds);
    std::memset(s_extraIds, 0, sizeof s_extraIds);
}
// @yo2 0x00904dc0 CDeckRuleCheck::addMain (no bounds check, as in the exe)
void CDeckRuleCheck::addMain(uint16_t id) { s_mainIds[s_main++] = id; }
// @yo2 0x00904df0 CDeckRuleCheck::addSide
void CDeckRuleCheck::addSide(uint16_t id) { s_sideIds[s_side++] = id; }
// @yo2 0x00904e20 CDeckRuleCheck::addExtra
void CDeckRuleCheck::addExtra(uint16_t id) { s_extraIds[s_extra++] = id; }
// @yo2 0x00904e50 CDeckRuleCheck::valid
bool CDeckRuleCheck::valid() const { return s_main >= 40 && s_main <= 80 && s_side <= 15 && s_extra <= 30; }
