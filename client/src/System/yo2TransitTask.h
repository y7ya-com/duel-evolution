// yo2TransitTask.cpp: CTransitTask, a white 256x256 sprite for scene transitions ("sysTransit"). Nothing in the
// shipped exe creates one.
#pragma once
#include "yo2EasyTask.h"
#include "yo2SpriteElm.h"
#include "yo2TaskPtr.h"

class CTransitTask : public CEasyTask {
public:
    static CTransitTask* newChild(CTask* parent);
    ~CTransitTask() override;
    bool onInit() override;
    // @yo2 0x006370a0 CTransitTask::onMain
    bool onMain() override { return true; }
    CSpriteElm* sprite() const { return sprite_.get(); }

private:
    CTaskPtr<CSpriteElm> sprite_;  // 0x70 a sibling under the same parent
    [[maybe_unused]] uint32_t unk7c_ = 0;
    struct Layout;
};
