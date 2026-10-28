// yo2SpriteElm.cpp: elements that draw a CD3DSprite. CSharedSpriteElm points at a sprite (its own or someone
// else's); CSpriteElm owns one, loaded from a texture name when the task is created. The element's rect_ is the
// source rectangle in the image, drawn under the element's world matrix.
#pragma once
#include "CD3DSprite.h"
#include "yo2Element.h"

// The exe's "maybe owned" pointer: {bool owns; T* p}.
template <class T>
struct OwnedPtr {
    bool owns = false;
    T* p = nullptr;
    OwnedPtr() = default;
    OwnedPtr(const OwnedPtr&) = delete;
    OwnedPtr& operator=(const OwnedPtr&) = delete;
    // @yo2 0x0061f8c0 OwnedPtr<CD3DSprite>::~OwnedPtr
    ~OwnedPtr() { reset(nullptr, false); }
    void reset(T* q, bool own) {
        if (q == p)
            return;
        if (owns && p)
            delete p;
        p = q;
        owns = own;
    }
};

class CSharedSpriteElm : public CElement {
public:
    CSharedSpriteElm();
    ~CSharedSpriteElm() override;
    static CSharedSpriteElm* newChild(CTask* parent, uint32_t priority);

    int32_t receive(CTaskMessage* msg) override;
    void draw(int32_t arg) override;

    void setSprite(CD3DSprite* s, bool own) { sprite_.reset(s, own); }
    CD3DSprite* sprite() const { return sprite_.p; }
    Vec3 imageSize() const;
    Vec3 textureSize() const;
    bool hitTest(int32_t x, int32_t y) const;

protected:
    OwnedPtr<CD3DSprite> sprite_;  // 0x340

public:
    float origin_[2] = {};  // 0x348 "Origin"

protected:
    uint32_t unk350_ = 0;          // 0x350
    uint32_t unk354_;              // 0x354
    struct Layout;
};
YO2_SIZEOF(CSharedSpriteElm, 0x358);

class CSpriteElm : public CSharedSpriteElm {
public:
    CSpriteElm();
    ~CSpriteElm() override;
    static CSpriteElm* newChild(CTask* parent, uint32_t priority);
    static CSpriteElm* newChild(CTask* parent, uint32_t priority, const vc6::string& texture);

    bool onInit() override;
    void setTexture(const vc6::string& name);
    void createTexture(const vc6::string& name, UINT w, UINT h);
    CD3DSprite& ownSprite() { return own_; }

protected:
    vc6::string texName_;  // 0x358
    CD3DSprite own_;       // 0x368

private:
    [[maybe_unused]] uint32_t unk5084_ = 0;  // 0x5084
    struct Layout;
};
YO2_SIZEOF(CSpriteElm, 0x5088);
