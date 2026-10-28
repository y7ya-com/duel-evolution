#include "yo2EasyTask.h"

// @yo2 0x0060d520 CEasyTask::Receive: INIT/MAIN returning false destroy the task
int32_t CEasyTask::receive(CTaskMessage* msg) {
    switch (msg->tag) {
    case TM_INIT:
        if (!onInit())
            return TR_DESTROY;
        break;
    case TM_MAIN:
        if (!onMain())
            return TR_DESTROY;
        break;
    case TM_DESTROY:
        onDestroy();
        break;
    case TM_DESTROYED:
        onTaskDestroyed(static_cast<CTmDestroyed*>(msg));
        return CTask::receive(msg);
    case TM_CAP_UTIL:
        onCapUtil(static_cast<CTmCapUtil*>(msg));
        return CTask::receive(msg);
    case TM_DISP_STATUS:
        onDispStatus(static_cast<CTmDispStatus*>(msg));
        if (!static_cast<CTmDispStatus*>(msg)->chain)
            return TR_HANDLED;
        break;
    }
    return CTask::receive(msg);
}
