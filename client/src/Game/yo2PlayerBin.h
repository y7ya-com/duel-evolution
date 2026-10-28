// yo2PlayerBin.cpp: the PBIN dictionary. Every collectable thing (avatar parts, clothes, duel disks, titles) has a
// PBIN number 0..1023: a bit in the player's CPlayerBinData (src/Net) says whether the player owns it, and
// data/common/yo2PbinMap.dat (one CSV line per PBIN) says what it is.
#pragma once
#include <cstdint>

#include "System/vc6.h"
#include "System/yo2EasyTask.h"

struct CPlayerBinData;   // src/Net/NetAccount.h: the player's PBIN bits

// One line of yo2PbinMap.dat: "pbin,number,initial,kind,slot,nameText,<Japanese label>,series"
struct PbinInfo {
    int32_t pbin;       // 0x00 column 0
    int32_t number;     // 0x04 column 1: the part's number within its slot
    int32_t initial;    // 0x08 column 2: 1 = every new player owns it
    int32_t kind;       // 0x0c column 3: 1 male avatar part, ..., 10 title
    int32_t slot;       // 0x10 column 4: hair, eyes, clothes... (for titles: the title's text id)
    int32_t nameText;   // 0x14 column 5: text id of its name (column 6, a Japanese label, is not read)
    int32_t series;     // 0x18 column 7: 0 none, 1 common, 2 DM, 3 GX
};
YO2_SIZEOF(PbinInfo, 0x1c);

// The PbinInfo vector the exe fills in collect(): MSVC6 std::vector<PbinInfo>.
using PbinList = vc6::vector<PbinInfo>;

class CPbinDictionary : public CEasyTask {
public:
    enum { COUNT = 0x400 };

    static CPbinDictionary* create(CTask* parent);
    ~CPbinDictionary() override;

    bool onInit() override;
    // @yo2 0x00ad5200 CPbinDictionary::onDestroy (empty)
    void onDestroy() override {}

    bool load();
    bool getInfo(uint32_t pbin, PbinInfo* out) const;
    bool collect(const CPlayerBinData& owned, uint32_t from, uint32_t to, int32_t kind, int32_t slot, int32_t series,
                 PbinList* out) const;
    int32_t initial(uint32_t pbin) const;
    int32_t kind(uint32_t pbin) const;
    int32_t slot(uint32_t pbin) const;
    int32_t nameText(uint32_t pbin) const;
    int32_t series(uint32_t pbin) const;
    // An avatar part's name as the shop and the item windows show it: "<slot> - <name>(<male / female>)" (texts
    // 0xc97.. for the slot, nameText, 0xca7 / 0xca8); "-----" and false for anything that isn't a male or female part.
    // (The exe swprintfs into the caller's buffer; here it is a string.)
    bool displayName(uint32_t pbin, vc6::wstring* out) const;

    PbinInfo info_[COUNT] = {};   // 0x70
};
YO2_AT(CPbinDictionary, info_, 0x70);
YO2_SIZEOF(CPbinDictionary, 0x7070);
