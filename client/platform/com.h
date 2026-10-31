// AddRef/Release with COM semantics (an object starts at 1 and deletes itself at 0), for the D3D8 and DirectSound
// subsets. Not COM: no QueryInterface, no vtable compatibility.
#pragma once
#include <cstdint>

class ComObject;
// called just before an object deletes itself, whoever's Release it was: recomp/rt/d3d8.cpp drops its guest shells
// there (a texture still bound by SetTexture dies on the device's Release, not the game's)
inline void (*com_deleted)(ComObject*) = nullptr;

class ComObject {
public:
    virtual uint32_t AddRef() { return ++refs_; }
    virtual uint32_t Release() {
        uint32_t r = --refs_;
        if (!r) {
            if (com_deleted) com_deleted(this);
            delete this;
        }
        return r;
    }
protected:
    virtual ~ComObject() = default;
    uint32_t refs_ = 1;
};
