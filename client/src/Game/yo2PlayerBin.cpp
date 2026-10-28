#include "Game/yo2PlayerBin.h"

#include <cstdlib>
#include <cstring>
#include <string>

#include "Game/yo2GameData.h"
#include "Net/NetAccount.h"
#include "System/window/yo2WindowTask.h"
#include "System/yo2Debug.h"

// @yo2 0x00ad5130 CPbinDictionary::create (new + CTask::create at priority 10000)
CPbinDictionary* CPbinDictionary::create(CTask* parent) {
    return dynamic_cast<CPbinDictionary*>((new CPbinDictionary)->CTask::create(parent, 10000));
}

// @yo2 0x00ad5250 CPbinDictionary::~CPbinDictionary
// @yo2 0x00ad5220 CPbinDictionary deleting destructor
CPbinDictionary::~CPbinDictionary() = default;

// @yo2 0x00ad5270 CPbinDictionary::onInit
bool CPbinDictionary::onInit() {
    if (load())
        return true;
    YO2_ASSERT(false, "PBIN_DATA MakeError!");
    return false;
}

// @yo2 0x00ad53d0 CPbinDictionary::load: data/common/yo2PbinMap.dat, one PbinInfo per non-empty, non-// line
bool CPbinDictionary::load() {
    GameFile file;
    if (file.read("data/common/yo2PbinMap.dat") != 0)
        return false;
    int32_t n = 0;
    do {
        char line[0x400];
        int32_t r = file.readLine(line, sizeof line);
        if (r == 1)
            break;
        if (r != 0)
            return false;
        if (line[0] == '\0' || (line[0] == '/' && line[1] == '/'))
            continue;
        PbinInfo& e = info_[n];
        int col = 0;
        for (char* tok = std::strtok(line, ",\n"); tok; tok = std::strtok(nullptr, ",\n"), col++) {
            switch (col) {
            case 0: e.pbin = std::atoi(tok); break;
            case 1: e.number = std::atoi(tok); break;
            case 2: e.initial = std::atoi(tok); break;
            case 3: e.kind = std::atoi(tok); break;
            case 4: e.slot = std::atoi(tok); break;
            case 5: e.nameText = std::atoi(tok); break;
            case 7: e.series = std::atoi(tok); break;   // column 6 is the Japanese label
            }
        }
        YO2_ASSERT(n <= 0x3ff, "PBIN OVER ERROR!");   // can't fire: the loop stops at COUNT lines
        n++;
    } while (n < COUNT);
    yo2Trace("PBIN辞書生成。総数=[%d]個\n", n);
    return true;
}

// @yo2 0x00ad5920 CPbinDictionary::getInfo
bool CPbinDictionary::getInfo(uint32_t pbin, PbinInfo* out) const {
    YO2_ASSERT(pbin <= 0x3ff, "GetPbinDetailInfo() PBIN NUM ERROR");
    *out = info_[pbin];
    return true;
}

// @yo2 0x00ad5ab0 CPbinDictionary::collect: the owned PBINs in [from, to] of one kind and slot, for one series
// (common items, series 1, always match), appended to out; true if out is not empty afterwards
bool CPbinDictionary::collect(const CPlayerBinData& owned, uint32_t from, uint32_t to, int32_t kind, int32_t slot,
                              int32_t series, PbinList* out) const {
    YO2_ASSERT(from <= 0x3ff, "GetPbinDetailInfo2() PBIN ERROR(A)");
    YO2_ASSERT(to <= 0x3ff, "GetPbinDetailInfo2() PBIN ERROR(B)");
    YO2_ASSERT(from <= to, "GetPbinDetailInfo2() PBIN ERROR(C)");
    for (uint32_t i = from; i <= to; i++) {
        const PbinInfo& e = info_[i];
        if (owned.flag(i) && e.kind == kind && e.slot == slot && (e.series == series || e.series == 1))
            out->push_back(e);
    }
    return !out->empty();
}

// @yo2 0x00ad5eb0 CPbinDictionary::initial
int32_t CPbinDictionary::initial(uint32_t pbin) const {
    YO2_ASSERT(pbin <= 0x3ff, "GetPbinDetailInfo() PBIN ERROR");
    return info_[pbin].initial;
}

// @yo2 0x00ad6020 CPbinDictionary::kind
int32_t CPbinDictionary::kind(uint32_t pbin) const {
    YO2_ASSERT(pbin <= 0x3ff, "GetPbinDetailInfo() PBIN ERROR");
    return info_[pbin].kind;
}

// @yo2 0x00ad6190 CPbinDictionary::slot
int32_t CPbinDictionary::slot(uint32_t pbin) const {
    YO2_ASSERT(pbin <= 0x3ff, "GetPbinDetailInfo() PBIN ERROR");
    return info_[pbin].slot;
}

// @yo2 0x00ad6300 CPbinDictionary::nameText
int32_t CPbinDictionary::nameText(uint32_t pbin) const {
    YO2_ASSERT(pbin <= 0x3ff, "GetPbinDetailInfo() PBIN ERROR");
    return info_[pbin].nameText;
}

// @yo2 0x00ad6470 CPbinDictionary::series
int32_t CPbinDictionary::series(uint32_t pbin) const {
    YO2_ASSERT(pbin <= 0x3ff, "GetPbinDetailInfo() PBIN ERROR");
    return info_[pbin].series;
}

// @yo2 0x00ad65e0 CPbinDictionary::displayName
bool CPbinDictionary::displayName(uint32_t pbin, vc6::wstring* out) const {
    PbinInfo info = {};
    getInfo(pbin, &info);
    static const uint32_t kSlotText[9] = {0xc97, 0xc99, 0xc9e, 0xc9f, 0xca0, 0xca3, 0xca5, 0xcad, 0xc9a};
    if ((info.kind != 1 && info.kind != 2) || info.slot < 1 || info.slot > 9) {
        *out = u"-----";
        return false;
    }
    vc6::wstring gender = windowText(info.kind == 1 ? 0xca7 : 0xca8);
    vc6::wstring name = windowText(static_cast<uint32_t>(info.nameText));
    vc6::wstring slot = windowText(kSlotText[info.slot - 1]);
    std::u16string s{std::u16string_view(slot)};
    s += u" - ";
    s += std::u16string_view(name);
    s += u"(";
    s += std::u16string_view(gender);
    s += u")";
    *out = std::u16string_view(s);
    return true;
}
