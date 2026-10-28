// yo2ZSort.cpp: draw queues. Every frame each visible CElement adds itself (with its world z) to the queues its
// draw mode selects; flush() sorts a queue by z and calls each element's draw().
#pragma once
#include "vc6.h"

class CElement;

class CZSort {
public:
    enum Order : int32_t { FAR_TO_NEAR = 1, NEAR_TO_FAR = 2 };  // z ascending / z descending
    struct Entry {
        float z;
        CElement* element;
        int32_t arg;  // passed to CElement::draw
    };

    CZSort();
    virtual ~CZSort();
    bool add(CElement* e, float z, int32_t arg);
    void flush();
    void clear();
    void setName(const vc6::string& s) { name_ = s; }
    void setOrder(int32_t order) { order_ = order; }
    size_t size() const { return static_cast<size_t>(entries_.end() - entries_.begin()); }

    static void beginDump();
    static void endDump();

private:
    static void drawEntry(const Entry& e);

    int32_t order_ = FAR_TO_NEAR;  // 0x04
    vc6::vector<Entry> entries_;   // 0x08
    vc6::string name_;             // 0x18
    struct Layout;
};
YO2_SIZEOF(CZSort, 0x28);

// The studio's four layers (CStudio + 0xb7c): BACK, NONE, MIDDLE, FRONT. CElement draws into NONE by default and
// into MIDDLE for its blended draw modes.
struct CZSortSet {
    enum : int { BACK, NONE, MIDDLE, FRONT };
    CZSortSet();
    CZSort layer[4];
};
extern CZSortSet* g_zsortSet;  // set by the studio
