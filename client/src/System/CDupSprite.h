// CDupSprite.cpp: one sprite drawn many times. Each instance is queued separately in the element's first draw
// queue (at its own world z) and drawn with its own position, scale and source rect.
#pragma once
#include "yo2SpriteElm.h"

class CDupSprite : public CSpriteElm {
public:
    struct Instance {
        float x, y;
        float sx, sy;
        float rect[4];  // source rect in the image
        float z;
    };
    static_assert(sizeof(Instance) == 0x24, "VC6 element size");

    static CDupSprite* newChild(CTask* parent, uint32_t priority);
    static CDupSprite* newChild(CTask* parent, uint32_t priority, const vc6::string& texture);
    CDupSprite() { setTaskName("CDupSprite"); }
    ~CDupSprite() override;

    bool onMain() override;
    void draw(int32_t index) override;

    void add(const Instance& i);
    // @yo2 0x00593270 CDupSprite::clear
    void clear() { instances_.clear(); }
    // @yo2 0x005942d0 CDupSprite::instance
    Instance instance(int32_t i) const { return instances_[i]; }
    size_t count() const { return instances_.size(); }
    vc6::vector<Instance>& instances() { return instances_; }

private:
    vc6::vector<Instance> instances_;       // 0x5088
    [[maybe_unused]] int32_t drawn_ = 0;    // 0x5098 reset each frame, never read
    [[maybe_unused]] uint32_t unk509c_ = 0;
    struct Layout;
};
