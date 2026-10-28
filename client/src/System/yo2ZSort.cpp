#include "yo2ZSort.h"

#include <algorithm>

#include "CD3DDevice.h"
#include "yo2Debug.h"
#include "yo2Element.h"

CZSortSet* g_zsortSet;

namespace {
bool g_dump;      // DAT_01271b1c
int g_dumpIndex;  // DAT_01271b18
}  // namespace

// @yo2 0x00638180 CZSort::CZSort
CZSort::CZSort() = default;

// @yo2 0x00638220 CZSort::~CZSort: elements still queued are told they no longer are
// @yo2 0x006381f0 CZSort deleting destructor
CZSort::~CZSort() {
    for (const Entry& e : entries_)
        e.element->setQueued(false);
}

// @yo2 0x006382b0 CZSort::add: only visible elements, and only if no ancestor hides them
// @yo2 0x00638c40 vector<Entry>::insert (push_back)
bool CZSort::add(CElement* e, float z, int32_t arg) {
    YO2_ASSERT(e->alive() && CTask::isValid(e), "elm(%p(%s)) is not vaild", e, e->instName().c_str());
    if (!e->isVisible(true) || e->hidesChildren())
        return false;
    entries_.push_back({z, e, arg});
    e->setQueued(true);
    return true;
}

// @yo2 0x00638480 CZSort::flush: sort by z, reset the device's blend state, draw
// @yo2 0x00639040 std::sort<Entry, z ascending>
// @yo2 0x006395c0 std::_Sort<Entry, z ascending>
// @yo2 0x00639840 std::_Sort<Entry, z descending>
// @yo2 0x00639b30 std::_Insertion_sort<Entry, z descending>
// @yo2 0x00639ac0 std::_Unguarded_insert<Entry, z descending>
// ponytail: std::sort, so elements with equal z may draw in a different order than the exe's introsort
void CZSort::flush() {
    Entry* b = entries_.begin();
    Entry* e = entries_.end();
    if (order_ == FAR_TO_NEAR)
        std::sort(b, e, [](const Entry& x, const Entry& y) { return x.z < y.z; });
    else if (order_ == NEAR_TO_FAR)
        std::sort(b, e, [](const Entry& x, const Entry& y) { return x.z > y.z; });
    g_d3d->setMode(0);
    if (g_dump) {
        yo2Trace("---- %s ----\n", name_.c_str());
        yo2Trace("  no:    prim.z   :  InsName  : TaskName : Addr\n");
    }
    for (const Entry& x : entries_)
        drawEntry(x);
}

// @yo2 0x00638600 CZSort::Draw (one entry)
void CZSort::drawEntry(const Entry& x) {
    CElement* e = x.element;
    if (!e->alive() || !CTask::isValid(e))
        return;
    if (g_dump)
        yo2Trace("%4d:%13f: %s\t : %s\t : 0x%p\n", g_dumpIndex, x.z, e->instName().c_str(), e->taskName().c_str(),
                 e);
    ++g_dumpIndex;
    e->draw(x.arg);
    e->setQueued(false);
}

// @yo2 0x00638870 CZSort::clear
void CZSort::clear() {
    for (const Entry& x : entries_)
        x.element->setQueued(false);
    entries_.clear();
}

// @yo2 0x00638bf0 CZSort::beginDump
void CZSort::beginDump() {
    g_dumpIndex = 0;
    g_dump = true;
}

// @yo2 0x00638c20 CZSort::endDump
void CZSort::endDump() { g_dump = false; }

struct CZSort::Layout {
    YO2_AT(CZSort, order_, 0x04);
    YO2_AT(CZSort, entries_, 0x08);
    YO2_AT(CZSort, name_, 0x18);
};

// @yo2 0x00638900 CZSortSet::CZSortSet
CZSortSet::CZSortSet() {
    static const char* const names[4] = {"BACK", "NONE", "MIDDLE", "FRONT"};
    static const int32_t orders[4] = {CZSort::FAR_TO_NEAR, CZSort::NEAR_TO_FAR, CZSort::FAR_TO_NEAR,
                                      CZSort::FAR_TO_NEAR};
    for (int i = 0; i < 4; ++i) {
        layer[i].setName(names[i]);
        layer[i].setOrder(orders[i]);
    }
}
