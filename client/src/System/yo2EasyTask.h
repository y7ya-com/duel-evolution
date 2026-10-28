// CEasyTask: a CTask whose framework messages arrive as virtual calls instead of a receive() switch.
#pragma once
#include "yo2Task.h"

class CEasyTask : public CTask {
public:
    // @yo2 0x0064b350 CEasyTask::CEasyTask
    CEasyTask() = default;
    // @yo2 0x005e33c0 CEasyTask deleting destructor
    // @yo2 0x005e32e0 CEasyTask::~CEasyTask
    // @yo2 0x005e3420 CEasyTask::~CEasyTask (CWindowTaskDebug's copy)
    ~CEasyTask() override = default;

    int32_t receive(CTaskMessage* msg) override;
    // @yo2 0x005e3300 CEasyTask::onInit (shared `return true`)
    virtual bool onInit() { return true; }
    // @yo2 0x005e3320 CEasyTask::onMain (shared `return true`)
    virtual bool onMain() { return true; }
    // @yo2 0x005e3340 CEasyTask::onDestroy (shared empty)
    virtual void onDestroy() {}
    // @yo2 0x005e3360 CEasyTask::onTaskDestroyed (shared empty)
    virtual void onTaskDestroyed(CTmDestroyed*) {}
    // @yo2 0x005e3380 CEasyTask::onCapUtil (shared empty)
    virtual void onCapUtil(CTmCapUtil*) {}
    // @yo2 0x005e33a0 CEasyTask::onDispStatus (shared empty)
    virtual void onDispStatus(CTmDispStatus*) {}
};
YO2_SIZEOF(CEasyTask, 0x70);
