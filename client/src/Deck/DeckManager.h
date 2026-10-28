// DeckManager.cpp (the exe's yo2DeckManager.cpp, 0x00904d70..0x00908670, labelled System): the deck file object and
// the deck-rule check buffer.
//
// CDeckManager (DAT_012b28c4) holds two decks: A, the player's own (deck.ydc in its folder, edited in the deck editor
// and taken into duels), and B, another deck loaded for viewing (loadOther). Each deck is the 0xfa-byte file record
// (main 80, side 15, extra 30 card ids) plus the working lists the editor fills (main up to 95, side 30, extra 30, and
// the cards the player doesn't own enough of, "missing", 80), and per card id four copy counters (main, side, extra,
// missing). Cards are added against the player's card box (DAT_012714b4: 3 bytes per id from +9, the first is copies).
//
// Every method is virtual, in the exe's vtable order (no destructor slot), because the rest of the game calls them
// through the vtable (e.g. Deck's deckObjCount: vf 0x38..0x44).
#pragma once
#include <cstdint>

#include "System/vc6.h"

class CDeckManager final {   // no destructor in its vtable; nothing derives from it
public:
    enum : int32_t { FILE_MAIN = 80, FILE_SIDE = 15, FILE_EXTRA = 30 };
    enum : int32_t { MAIN_MAX = 95, SIDE_MAX = 30, EXTRA_MAX = 30, MISSING_MAX = 80, CARD_IDS = 0x1000 };

    struct File {   // deck.ydc
        uint16_t main[FILE_MAIN];
        uint16_t side[FILE_SIDE];
        uint16_t extra[FILE_EXTRA];
    };
    struct Lists {
        uint16_t main[MAIN_MAX];
        uint16_t side[SIDE_MAX];
        uint16_t extra[EXTRA_MAX];
        uint16_t missing[MISSING_MAX];
    };
    struct Deck {
        File file;
        Lists lists;
    };
    struct Count {   // one card id's copies in each list
        uint8_t main, side, extra, missing;
    };
    struct Sizes {
        uint8_t main, side, extra, missing;
    };

    CDeckManager();

    virtual void setFileName(vc6::string name);                     // slot 0
    virtual void setDirectory(vc6::string dir);                     // slot 1
    // Deck A: add a card the box has a free copy of and the limit list allows; false when it can't.
    virtual bool addMain(uint16_t id, const uint8_t* box);          // slot 2
    virtual bool addSide(uint16_t id, const uint8_t* box);          // slot 3
    virtual bool addExtra(uint16_t id, const uint8_t* box);         // slot 4
    virtual bool addMissing(uint16_t id);                           // slot 5
    // Deck B, the same.
    virtual bool addMainB(uint16_t id, const uint8_t* box);         // slot 6
    virtual bool addSideB(uint16_t id, const uint8_t* box);         // slot 7
    virtual bool addExtraB(uint16_t id, const uint8_t* box);        // slot 8
    virtual bool addMissingB(uint16_t id);                          // slot 9
    // Deck A: remove one copy (the first in the list); false if it isn't there. The second argument (the callers
    // pass the card box, as to the adds) is unused.
    virtual bool removeMain(uint16_t id, const uint8_t* = nullptr);      // slot 10
    virtual bool removeSide(uint16_t id, const uint8_t* = nullptr);      // slot 11
    virtual bool removeExtra(uint16_t id, const uint8_t* = nullptr);     // slot 12
    virtual bool removeMissing(uint16_t id, const uint8_t* = nullptr);   // slot 13
    virtual uint8_t mainSize() const { return sizes_[0].main; }     // slot 14
    virtual uint8_t sideSize() const { return sizes_[0].side; }     // slot 15
    virtual uint8_t extraSize() const { return sizes_[0].extra; }   // slot 16
    virtual uint8_t missingSize() const { return sizes_[0].missing; }   // slot 17
    virtual uint8_t mainSizeB() const { return sizes_[1].main; }    // slot 18
    virtual uint8_t sideSizeB() const { return sizes_[1].side; }    // slot 19
    virtual uint8_t extraSizeB() const { return sizes_[1].extra; }  // slot 20
    virtual uint8_t missingSizeB() const { return sizes_[1].missing; }  // slot 21
    // Copies in main + side + extra of cards that count as the same card as `id` (alternative arts share a name).
    virtual uint8_t sameCardCount(uint16_t id);                     // slot 22
    virtual uint8_t sameCardCountB(uint16_t id);                    // slot 23
    virtual uint8_t copies(uint16_t id) const;                      // slot 24 main + side + extra copies of id (a byte sum)
    // Deck A's per-card counters and lists, one group per list.
    virtual void setMainCopies(uint16_t id, uint8_t n) { count_[0][id].main = n; }           // slot 25
    virtual uint8_t mainCopies(uint16_t id) const { return count_[0][id].main; }             // slot 26
    virtual uint16_t* mainList() { return deck_[0].lists.main; }                             // slot 27
    virtual void addMainCopies(uint16_t id, int8_t n) { count_[0][id].main += n; }           // slot 28
    virtual void subMainCopies(uint16_t id, uint8_t n) { sub(count_[0][id].main, n); }       // slot 29
    virtual void setSideCopies(uint16_t id, uint8_t n) { count_[0][id].side = n; }           // slot 30
    virtual uint8_t sideCopies(uint16_t id) const { return count_[0][id].side; }             // slot 31
    virtual uint16_t* sideList() { return deck_[0].lists.side; }                             // slot 32
    virtual void addSideCopies(uint16_t id, int8_t n) { count_[0][id].side += n; }           // slot 33
    virtual void subSideCopies(uint16_t id, uint8_t n) { sub(count_[0][id].side, n); }       // slot 34
    virtual void setExtraCopies(uint16_t id, uint8_t n) { count_[0][id].extra = n; }         // slot 35
    virtual uint8_t extraCopies(uint16_t id) const { return count_[0][id].extra; }           // slot 36
    virtual uint16_t* extraList() { return deck_[0].lists.extra; }                           // slot 37
    virtual void addExtraCopies(uint16_t id, int8_t n) { count_[0][id].extra += n; }         // slot 38
    virtual void subExtraCopies(uint16_t id, uint8_t n) { sub(count_[0][id].extra, n); }     // slot 39
    virtual void setMissingCopies(uint16_t id, uint8_t n) { count_[0][id].missing = n; }     // slot 40
    virtual uint8_t missingCopies(uint16_t id) const { return count_[0][id].missing; }       // slot 41
    virtual uint16_t* missingList() { return deck_[0].lists.missing; }                       // slot 42
    virtual void addMissingCopies(uint16_t id, int8_t n) { count_[0][id].missing += n; }     // slot 43
    virtual void subMissingCopies(uint16_t id, uint8_t n) { sub(count_[0][id].missing, n); } // slot 44
    virtual uint16_t* mainListB() { return deck_[1].lists.main; }                            // slot 45
    virtual uint16_t* sideListB() { return deck_[1].lists.side; }                            // slot 46
    virtual uint16_t* extraListB() { return deck_[1].lists.extra; }                          // slot 47
    virtual uint16_t* missingListB() { return deck_[1].lists.missing; }                      // slot 48
    virtual bool clear();                                           // slot 49 both decks, every counter (true)
    virtual void reset();                                           // slot 50 the same, no result
    virtual void clearMissing();                                    // slot 51 deck A's missing list and counters
    virtual bool save();                                            // slot 52 deck A's lists -> <dir>\<name>
    virtual bool load();                                            // slot 53 <dir>\<name> -> deck A
    virtual bool loadOther(vc6::string name);                       // slot 54 <dir>\<name> -> deck B; false if a card is missing

    Deck deck_[2];                // 0x004 A, B
    Sizes sizes_[2];              // 0x5a4
    vc6::string fileName_;        // 0x5ac "deck.ydc"
    vc6::string dir_;             // 0x5bc
    Count count_[2][CARD_IDS];    // 0x5cc

private:
    static void sub(uint8_t& v, uint8_t n) { v = v < n ? 0 : static_cast<uint8_t>(v - n); }
    void clearAll();
    bool add(int deck, int list, uint16_t id, const uint8_t* box);
    bool remove(int list, uint16_t id);
    vc6::string path(const vc6::string& name) const;
    void addFromFile(int deck, const uint8_t* box);
    struct Layout;
};

// The rule check a deck is put through before it's sent (the exe keeps it in statics, DAT_012bdf40..0x012be046):
// add every main / side / extra card, then valid(): 40..80 main, at most 15 side and 30 extra.
class CDeckRuleCheck {
public:
    void clear();                  // 0x00904d70
    void addMain(uint16_t id);     // 0x00904dc0
    void addSide(uint16_t id);     // 0x00904df0
    void addExtra(uint16_t id);    // 0x00904e20
    bool valid() const;            // 0x00904e50

    static uint32_t s_main, s_side, s_extra;   // DAT_012bdf40 / 44 / 48
    static uint16_t s_mainIds[80], s_sideIds[15], s_extraIds[30];   // DAT_012bdf4c / 012bdfec / 012be00a
};

// TODO(System): yaneSDK CFile::Write(name, mem, size) (the counterpart of yo2File.h's yo2LoadFile).
bool yo2SaveFile(const char* name, const void* data, uint32_t size);
// TODO(System): the player's card box (DAT_012714b4); null before it's loaded.
const uint8_t* appCardBox();
