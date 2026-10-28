// Three inline members of CWindowLogin (src/login, the ID/password window) that the linker kept in cautionEntry.obj.
// CWindowLogin is a CWindowModelDialogOk (System's window framework, not in this branch), so they are written
// against a view of what they touch: the vtable up to slot 9 and three fields. Fold them into CWindowLogin when
// src/login and the window framework land; the view only describes the 32-bit layout.
// Not ported (they construct/destroy the whole window, so they belong with that class): CWindowLogin::New
// (0x7fdac0), its destructor (0x7fdde0) and deleting destructor (0x7fddb0).
#pragma once
#include <cstdint>

class CWindowLoginView {
public:
    // slots 0..8 as far as these members are concerned; slot 9 is CWindowTaskModel's re-layout (CWindowLogin's
    // override is 0x802130), which every one of them ends with.
    virtual void slot0();
    virtual void slot1();
    virtual void slot2();
    virtual void slot3();
    virtual void slot4();
    virtual void slot5();
    virtual void slot6();
    virtual void slot7();
    virtual void slot8();
    virtual void relayout();

    bool onMain();                 // vtable slot 5
    void resetDepth();             // vtable slot 8
    void setButtonMode(int32_t m); // vtable slot 21 (CWindowModelDialogWithBtns_vf21)

private:
    float& depth() { return field<float>(0x78); }          // CElement::pos_.z
    float& homeDepth() { return field<float>(0x34c); }     // the window's resting z
    int32_t& buttonMode() { return field<int32_t>(0x3a0); }
    template <class T>
    T& field(int off) { return *reinterpret_cast<T*>(reinterpret_cast<char*>(this) + off); }
};
