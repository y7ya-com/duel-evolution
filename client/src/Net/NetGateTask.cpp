// CNetGateTask (the exe's src\Net\yo2NetGateTask.cpp).
#include <ctime>

#include "NetTasks.h"

static int32_t now() { return (int32_t)time(nullptr); }

CNetGateTask::CNetGateTask() = default;

// @yo2 0x006a8e20 CNetGateTask deleting destructor
// @yo2 0x006a8e50 the two CTaskPtr members go, then CEasyTask
CNetGateTask::~CNetGateTask() = default;

// @yo2 0x006a89d0 create under parent (priority 10000) with its own sprite layer under uiParent
CNetGateTask* CNetGateTask::spawn(CTask* parent, CTask* uiParent) {
    CNetGateTask* t = new CNetGateTask;
    t->elm.setUser(t);
    t->elm.set(uiCreateSpriteElm(uiParent, 10000));
    if (CTask* e = t->elm.get()) e->setInstName("CNetGateTask::m_elm");
    return dynamic_cast<CNetGateTask*>(t->create(parent, 10000));
}

// @yo2 0x006a8ee0
bool CNetGateTask::onInit() {
    gate = appNetGate();
    state = START;
    done = 0;
    dialog.setUser(this);
    return true;
}

// @yo2 0x006a8f20
void CNetGateTask::onDestroy() {
    if (CTask* e = elm.get()) e->destroy(__FILE__, 0x27);
}

// @yo2 0x006a8f70 one step per frame
bool CNetGateTask::onMain() {
    switch (state) {
    case START:
        state = CONNECT;
        done = 0;
        [[fallthrough]];
    case CONNECT:
        gate->ensureConn();
        gate->notify = appWindowHandle();
        if (gate->connect() == YG_OK) {
            state = WAIT_CONNECT;
            startTime = now();
        } else {
            errorText = TXT_NET_CONNECT_FAILED;
            state = ERROR_OPEN;
        }
        break;
    case WAIT_CONNECT: {
        int32_t s = gate->state();
        if (s == YGC_CONNECTED) {
            gate->select(appWindowHandle());
            state = SEND_VERSION;
        } else if (s == YGC_FAILED || now() >= startTime + 600) {
            gate->disconnect();
            errorText = TXT_NET_GATE_TIMEOUT;
            state = ERROR_OPEN;
        }
        break;
    }
    case SEND_VERSION:
        gate->sendVersion();
        state = WAIT_LIST;
        break;
    case WAIT_LIST:
        if (gate->flag(GATE_REQ_VERSION) == 2) {
            gate->flag(GATE_REQ_VERSION) = 0;
            state = BYE;
        }
        if (gate->takeResult() == YG_VERSION_ERROR) {
            errorText = TXT_NET_VERSION_REFUSED;
            state = ERROR_OPEN;
            return true;   // the exe returns -255 here; CEasyTask only tests it for zero
        }
        break;
    case BYE:
        gate->sendBye();
        state = IDLE;
        break;
    case ERROR_OPEN:
        dialog.set(uiOpenDialogOk(elm.get(), 352.0f, 304.0f, 0xfa2, errorText));
        state = ERROR_WAIT;
        break;
    case ERROR_WAIT:
        if (uiDialogResult(dialog.get()) == DIALOG_OK) {
            appPlaySound(SE_CLICK, 0);
            dialog.get()->destroy(__FILE__, 0x9f);
            state = ERROR_DONE;
        }
        break;
    case ERROR_DONE:
        done = 1;
        state = IDLE;
        break;
    }
    return true;
}
