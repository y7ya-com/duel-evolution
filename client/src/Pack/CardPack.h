// yo2CardPack.h: the card pack catalogue (one record per pack id, loaded once from the PACK_*.bin tables) and the
// per-pack helpers the shop, the pack check scene and the deck editor use (card lists from <id>.iid / <id>.ydc,
// completion against the player's card box).
//
// TODO(System): the exe keeps the records in an MSVC6 std::map<int, PackRecord> (DAT_012ae620, nil node DAT_0128bc70)
// whose strings are MSVC6 std::string (16 bytes). Here they are std::map / std::string stand-ins; the record's field
// order is the exe's (offsets noted), and the layout can be pinned once src/System's vc6::string is merged.
#pragma once
#include <cstdint>
#include <map>
#include <string>
#include <vector>

enum PackType : int32_t {
    PACK_BOOSTER = 0,
    PACK_DECK = 1,       // structure deck: the cards are <id>.ydc
    PACK_PRIZE = 2,      // 9001 TP3, 9002 Startup Present: not sold
    PACK_STARTER = 4,    // starter deck: also <id>.ydc
};

// @yo2 0x00845670 PackRecord::PackRecord (the member initialisers)
// @yo2 0x006c7670 PackRecord copy constructor (the implicit one; CNetLobby's 0x4800 list copies records with it)
// @yo2 0x006c39b0 PackRecord::~PackRecord (the implicit one: the six strings)
struct PackRecord {        // 0x6c, ctor FUN_00845670; CCardPack (FUN_0084d8a0) is the same layout
    int32_t id = 0;        // 0x00
    int32_t type = 0;      // 0x04 PackType
    std::string image;     // 0x08 cover PNG
    std::string name;      // 0x18
    std::string desc;      // 0x28
    std::string text3;     // 0x38
    std::string iid;       // 0x48 "<id>.iid": the booster's card pool (u16 LE ids, 0 = padding)
    std::string ydc;       // 0x58 the deck's cards (types 1 and 4)
    int32_t pbinBit = 0;   // 0x68 PBIN bit of the deck right (types 1 and 4)

    bool isDeck() const { return type == PACK_DECK || type == PACK_STARTER; }
};

// The exe's MSVC6 map<int, PackRecord> (nil node DAT_0128bc70); the pieces std::map does here, some instantiated in
// the Net translation units:
// @yo2 0x006c3e90 map<int, PackRecord>::insert (unique key)
// @yo2 0x006c5f20 _Tree::_Insert (link a node, rebalance)
// @yo2 0x006c6230 _Tree::_Lrotate
// @yo2 0x006c62b0 _Tree::_Rrotate
// @yo2 0x006c6330 _Tree::_Buynode (0x80 bytes: links, key, value, colour)
// @yo2 0x006c7040 construct(pair<const int, PackRecord>*, const pair&)
// @yo2 0x00847080 pair<iterator, bool>::pair (insert's result)
// @yo2 0x0084fa00 _Tree::iterator::operator++
using PackTable = std::map<int32_t, PackRecord>;
extern PackTable* g_packTable;    // DAT_012ae620

void packTableCreate();           // FUN_0084d550 (static initializer of the TU)
void packTableDestroy();          // FUN_0084d760
void packTableLoad();             // FUN_0084e690
void packTableFill(PackTable& t); // FUN_0084e7c0: packs 1..0xc0 of the catalogue
PackRecord& packRecord(int32_t id);   // FUN_0084dc10: asserts "no pack" once when the id is unknown

// yo2CardPack.h inline getters, one copy per .cpp in the exe
std::string packImage(int32_t id);    // FUN_008453b0
std::string packDesc(int32_t id);     // FUN_00846640
std::string packName(int32_t id);     // FUN_008581b0

struct CCardPack : PackRecord {
    explicit CCardPack(int32_t id);   // FUN_0084d8a0
    uint32_t size() const;            // FUN_0084dfc0: slots in the .iid (zeros included)
    uint32_t ownedCount() const;      // FUN_0084e0b0: slots whose card is in the player's box
    float completion() const;         // FUN_0084e1e0: ownedCount / size
    void cards(std::vector<uint16_t>& out) const;   // FUN_0084e340: appends the non-zero ids (.ydc for decks)
};

// The line of a pack in CWindowPackSelect's list: "@>64/<name>@>600/@2<pct> %@0"
std::string packCompletionLine(int32_t id);
void packSelectAddLine(void* noBackList, int32_t id);   // FUN_0085a840 (CWindowPackSelect)
