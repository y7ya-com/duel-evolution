// CGameObject (yo2GameObject, 0x007bf870..0x007c1010): the base of the duel mat's drawn objects (cards, the battle
// manager, the affect icons...). Every object registers itself in one set; once a frame the scene updates, then
// draws, the active objects of a group mask in order of their sort key.
#pragma once
#include <cstdint>

#include "SceneCommon.h"

namespace ds {

class CGameObject {
public:
    explicit CGameObject(uint32_t groups);   // registers itself
    virtual ~CGameObject();
    virtual bool isActive() const;           // slot 1
    virtual void update();                   // slot 2: once a frame
    virtual void draw();                     // slot 3: once a frame, after every update

    static void updateAll(uint32_t mask);    // the active objects of `mask`, by order_
    static void drawAll(uint32_t mask);

    uint8_t active_ = 1;     // 0x04 takes part in updateAll / drawAll (and hover tests)
    uint8_t pad05_[3] = {};
    uint32_t groups_;        // 0x08 which updateAll / drawAll masks reach it
    int32_t order_ = 0;      // 0x0c sort key (smaller first)
};
YO2_AT(CGameObject, active_, 0x04);
YO2_AT(CGameObject, groups_, 0x08);
YO2_AT(CGameObject, order_, 0x0c);
YO2_SIZEOF(CGameObject, 0x10);

}   // namespace ds
