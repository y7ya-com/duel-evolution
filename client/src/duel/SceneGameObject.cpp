// CGameObject and its object set (yo2GameObject.cpp, 0x007bf870..0x007c1010). The exe keeps a
// std::set<CGameObject*> (DAT_012a995c, a red-black tree; its template functions are this file's 0x007bff40..0x007c0f70)
// and a scratch std::vector<CGameObject*> (DAT_012a9944) the per-frame passes sort into.
#include "SceneGameObject.h"

#include <algorithm>
#include <set>
#include <vector>

namespace ds {

namespace {
// @yo2 0x007bfec0 the set's static initializer
// @yo2 0x007bfef0 its atexit registration
std::set<CGameObject*>& objects() {   // DAT_012a995c
    static std::set<CGameObject*> s;
    return s;
}
// @yo2 0x007bf870 the scratch vector's static initializer
// @yo2 0x007bf8a0 its atexit registration
std::vector<CGameObject*>& scratch() {   // DAT_012a9944
    static std::vector<CGameObject*> v;
    return v;
}

// The per-frame pass: the active objects reached by `mask`, sorted by order_ (the exe's qsort, comparator 0x007bfd10;
// approximated: std::stable_sort, the exe's qsort may order equal keys differently), then slot 2 or slot 3.
template <class F>
void pass(uint32_t mask, F call) {
    std::vector<CGameObject*>& v = scratch();
    v.clear();
    for (CGameObject* o : objects())
        if (o->active_ && (o->groups_ & mask)) v.push_back(o);
    std::stable_sort(v.begin(), v.end(), [](CGameObject* a, CGameObject* b) { return a->order_ < b->order_; });
    for (CGameObject* o : v) call(o);
}
}   // namespace

// @yo2 0x007bf910 CGameObject::CGameObject
CGameObject::CGameObject(uint32_t groups) : groups_(groups) { objects().insert(this); }

// @yo2 0x007bfa50 CGameObject::~CGameObject
// @yo2 0x007bfa20 CGameObject scalar deleting destructor
CGameObject::~CGameObject() { objects().erase(this); }

// @yo2 0x00751cd0 slot 1 (emitted with yo2AffectIcon.cpp)
bool CGameObject::isActive() const { return active_ != 0; }
// @yo2 0x0076eca0 slot 2 (empty)
void CGameObject::update() {}
// @yo2 0x007bfa00 slot 3 (empty)
void CGameObject::draw() {}

// @yo2 0x007bfbb0
void CGameObject::updateAll(uint32_t mask) {
    pass(mask, [](CGameObject* o) { o->update(); });
}
// @yo2 0x007bfd40
void CGameObject::drawAll(uint32_t mask) {
    pass(mask, [](CGameObject* o) { o->draw(); });
}

}   // namespace ds
