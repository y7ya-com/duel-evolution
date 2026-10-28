// CNetAccountTask (the exe's src\Net\yo2NetAccountTask.cpp).
#include <cstring>
#include <ctime>

#include "NetTasks.h"

static int32_t now() { return (int32_t)time(nullptr); }

CNetAccountTask::CNetAccountTask() = default;

// @yo2 0x006a1b00 CNetAccountTask deleting destructor
// @yo2 0x006a1b70 the seven CTaskPtr members go, then CEasyTask
CNetAccountTask::~CNetAccountTask() = default;

// @yo2 0x006a1810 create under parent (priority 10000) with its own sprite layer under uiParent
CNetAccountTask* CNetAccountTask::spawn(CTask* parent, CTask* uiParent) {
    CNetAccountTask* t = new CNetAccountTask;
    t->elm.setUser(t);
    t->elm.set(uiCreateSpriteElm(uiParent, 10000));
    return dynamic_cast<CNetAccountTask*>(t->create(parent, 10000));
}

// @yo2 0x006a1c60
bool CNetAccountTask::onInit() {
    acc = appNetAccount();
    gate = appNetGate();
    state = START;
    lastResult = 0;
    _a8 = 0;
    for (CTaskPtr<CTask>* p : {&delInput, &delConfirm, &okBox, &doneBox, &nameInput, &errorBox}) p->setUser(this);
    errorTextId = 0;
    lastActive = now();
    return true;
}

// @yo2 0x006a1d30
void CNetAccountTask::onDestroy() {
    if (CTask* e = elm.get()) e->destroy(__FILE__, 0x6b);
}

// @yo2 0x006a6eb0 the string shown for a server error code
int32_t CNetAccountTask::errorText(int32_t code) {
    switch (code) {
    case -270: return 0xbcf;
    case -269: return 0xbd0;
    case -267: return 0x11bc;
    case -266: return 0x11bb;
    case -263: return 0x11ba;
    case -262: return 0x11b9;
    case -261: case -260: return 0x11b8;
    case -255: return 0x11b7;
    case -246: return 0x11e7;
    case -245: return 0x11be;
    case -244: return 0x11b5;
    case -242: return 0x11b4;
    case -241: return 0x11bd;
    case -240: return 0xc23;
    case -200: return 0xc36;
    default: return TXT_ACC_UNKNOWN_ERROR;
    }
}

void CNetAccountTask::fail(int32_t text) {
    errorTextId = text;
    state = ERROR_OPEN;
    acc->disconnect();
}

// The requests: only while idle; go straight to `target` when connected, else reconnect first.
bool CNetAccountTask::request(int32_t target, bool needSlot, int32_t s) {
    if (busy != BUSY_IDLE) return false;
    busy = BUSY_WORKING;
    next = NONE;
    if (needSlot) {
        YO2_ASSERT(s >= 0 && s <= 3, "Delete PlayerIndex Error!");   // "Create PlayerIndex Error!" for create / PBIN
        slot = s;
    }
    if (acc->state() == YGC_CONNECTED) {
        state = target;
    } else {
        state = CONNECT;
        next = target;
    }
    return true;
}

// @yo2 0x006a66e0
bool CNetAccountTask::deleteCharacter(int32_t s) { return request(DEL_PROMPT, true, s); }
// @yo2 0x006a68f0
bool CNetAccountTask::createCharacter(int32_t s) { return request(NEW_PROMPT, true, s); }
// @yo2 0x006a6ca0
bool CNetAccountTask::requestPbin(int32_t s) { return request(PBIN, true, s); }
// @yo2 0x006a6c10
bool CNetAccountTask::requestTrunk() { return request(TRUNK, false, 0); }
// @yo2 0x006a6b80
bool CNetAccountTask::requestPlayerList() { return request(PLAYERLIST, false, 0); }

// @yo2 0x006a6b00
bool CNetAccountTask::bye() {
    if (busy != BUSY_IDLE) return false;
    next = NONE;
    busy = BUSY_WORKING;
    state = BYE;
    return true;
}

// @yo2 0x006a6b40
bool CNetAccountTask::hangUp() {
    if (busy != BUSY_IDLE) return false;
    next = NONE;
    busy = BUSY_WORKING;
    state = HANGUP;
    return true;
}

// @yo2 0x006a61c0 remember the typed login and connect
bool CNetAccountTask::login(const std::string& user, const std::string& password) {
    if (busy != BUSY_IDLE) return false;
    busy = BUSY_WORKING;
    next = NONE;
    appSetLogin(user, password);
    state = CONNECT;
    return true;
}

// @yo2 0x006a1d80 one step per frame
bool CNetAccountTask::onMain() {
    switch (state) {
    case START:
        lastResult = 0;
        busy = BUSY_WORKING;
        state = IDLE;
        break;
    case IDLE:
        busy = BUSY_IDLE;
        if (acc->state() == YGC_CONNECTED && now() >= lastActive + 120) acc->disconnect();
        break;
    case CONNECT:
        busy = BUSY_WORKING;
        acc->myUser().setUser(appLoginUser().c_str());
        acc->myUser().setPassword(appLoginPassword().c_str());
        acc->ensureConn();
        acc->notify = appWindowHandle();
        if (acc->connect(gate) == YG_OK) {
            state = WAIT_CONNECT;
            connectStart = now();
        } else {
            fail(TXT_ACC_CONNECT_FAILED);
        }
        break;
    case WAIT_CONNECT: {
        busy = BUSY_WORKING;
        int32_t s = acc->state();
        if (s == YGC_CONNECTED) {
            lastActive = now();
            acc->select(appWindowHandle());
            state = HELLO;
        } else if (s == YGC_FAILED || now() >= connectStart + 600) {
            fail(TXT_ACC_CONNECT_FAILED);
        }
        break;
    }
    case HELLO:
        busy = BUSY_WORKING;
        acc->sendHello();
        state = WAIT_CHALLENGE;
        break;
    case WAIT_CHALLENGE:
        busy = BUSY_WORKING;
        if (acc->takeAnswer(ACC_REQ_HELLO)) state = AUTH;
        break;
    case AUTH:
        busy = BUSY_WORKING;
        acc->sendAuth();
        state = WAIT_AUTH;
        break;
    case WAIT_AUTH:
        busy = BUSY_WORKING;
        if (!acc->takeAnswer(ACC_REQ_AUTH)) break;
        lastResult = acc->authResult;
        if (lastResult == 0) state = PLAYERLIST;
        else fail(errorText(lastResult));
        break;
    case PLAYERLIST:
        busy = BUSY_WORKING;
        acc->reqPlayerList();
        state = WAIT_PLAYERLIST;
        break;
    case WAIT_PLAYERLIST:
        busy = BUSY_WORKING;
        if (!acc->takeAnswer(ACC_REQ_PLAYERLIST)) break;
        state = next != NONE ? next : DONE;
        break;
    case BYE:
        busy = BUSY_WORKING;
        acc->sendBye();
        state = DONE;
        break;
    case HANGUP:
        busy = BUSY_WORKING;
        acc->disconnect();
        state = DONE;
        break;

    // delete a character: password, then yes / no, then 0x3030
    case DEL_PROMPT:
        busy = BUSY_WORKING;
        delInput.set(uiOpenInput(elm.get(), 332.0f, 324.0f, 4, TXT_DELETE_PROMPT));
        state = DEL_WAIT_PROMPT;
        break;
    case DEL_WAIT_PROMPT: {
        busy = BUSY_WORKING;
        int32_t r = uiInputResult(delInput.get());
        if (r == INPUT_OK) {
            appPlaySound(SE_CLICK, 0);
            uiInputClear(delInput.get());
            bool right = uiInputText(delInput.get()) == appLoginPassword();
            delInput.get()->destroy(__FILE__, __LINE__);
            if (right) state = DEL_CONFIRM;
            else {
                errorTextId = TXT_DELETE_BAD_PASSWORD;
                state = ERROR_OPEN;
            }
        } else if (r == INPUT_CANCEL) {
            appPlaySound(SE_CLICK, 0);
            delInput.get()->destroy(__FILE__, __LINE__);
            state = DONE;
        }
        break;
    }
    case DEL_CONFIRM:
        busy = BUSY_WORKING;
        delConfirm.set(uiOpenYesNo(elm.get(), 332.0f, 324.0f, TXT_DELETE_CONFIRM));
        state = DEL_WAIT_CONFIRM;
        break;
    case DEL_WAIT_CONFIRM: {
        busy = BUSY_WORKING;
        int32_t r = uiDialogResult(delConfirm.get());
        if (r == DIALOG_OK || r == DIALOG_NO) {
            appPlaySound(SE_CLICK, 0);
            delConfirm.get()->destroy(__FILE__, __LINE__);
            state = r == DIALOG_OK ? DEL_GO : DONE;
        }
        break;
    }
    case DEL_GO:
        busy = BUSY_WORKING;
        state = DEL_SEND;
        break;
    case DEL_SEND:
        busy = BUSY_WORKING;
        YO2_ASSERT(slot >= 0 && slot <= 3, "Delete PlayerIndex Error!");
        acc->reqDelPlayer((int8_t)slot);
        state = DEL_WAIT;
        break;
    case DEL_WAIT:
        busy = BUSY_WORKING;
        if (acc->takeAnswer(ACC_REQ_DELPLAYER)) state = DEL_DONE_OPEN;
        break;
    case DEL_DONE_OPEN:
        busy = BUSY_WORKING;
        doneBox.set(uiOpenDialogOk(elm.get(), 344.0f, 312.0f, INPUT_OK, TXT_DELETE_DONE));
        state = DEL_DONE_WAIT;
        break;
    case DEL_DONE_WAIT:
        busy = BUSY_WORKING;
        if (uiDialogResult(doneBox.get()) == DIALOG_OK) {
            doneBox.get()->destroy(__FILE__, __LINE__);
            state = DONE;
        }
        break;

    // create a character: name (more than 3 characters), then 0x3020
    case NEW_PROMPT:
        busy = BUSY_WORKING;
        nameInput.set(uiOpenInput(elm.get(), 344.0f, 312.0f, 1, TXT_CREATE_PROMPT));
        state = NEW_WAIT_PROMPT;
        break;
    case NEW_WAIT_PROMPT: {
        busy = BUSY_WORKING;
        int32_t r = uiInputResult(nameInput.get());
        if (r == -1) break;
        if (r == INPUT_CANCEL) {
            nameInput.get()->destroy(__FILE__, 0x1c3);
            state = FAILED;
            break;
        }
        if (r == INPUT_OK) {
            std::string name = uiInputText(nameInput.get());
            if (name.size() > 3) {
                CPlayerInfo* p = acc->myUser().player(slot);
                if (p) {   // fix: the exe copies through a null record for a bad slot
                    strncpy(p->name, name.c_str(), sizeof p->name - 1);
                    p->name[16] = 0;
                }
                uiInputClear(nameInput.get());
                state = NEW_SEND;
                break;
            }
        }
        uiInputClear(nameInput.get());
        break;
    }
    case NEW_SEND:
        busy = BUSY_WORKING;
        nameInput.get()->destroy(__FILE__, __LINE__);
        acc->reqRegPlayer((int8_t)slot);
        state = NEW_WAIT;
        break;
    case NEW_WAIT:
        busy = BUSY_WORKING;
        if (!acc->takeAnswer(ACC_REQ_REGPLAYER)) break;
        lastResult = acc->regResult;
        if (lastResult != 0) {
            errorTextId = errorText(lastResult);
            state = ERROR_OPEN;
        } else {
            state = DONE;
        }
        break;

    case TRUNK:
        busy = BUSY_WORKING;
        acc->reqTrunk((int8_t)slot);
        state = TRUNK_WAIT;
        break;
    case TRUNK_WAIT:
        busy = BUSY_WORKING;
        if (acc->takeAnswer(ACC_REQ_TRUNK)) state = DONE;
        break;
    case PBIN:
        busy = BUSY_WORKING;
        acc->reqPbin((int8_t)slot);
        state = PBIN_WAIT;
        break;
    case PBIN_WAIT:
        busy = BUSY_WORKING;
        if (acc->takeAnswer(ACC_REQ_PBIN)) state = DONE;
        break;

    case ERROR_OPEN:
        busy = BUSY_WORKING;
        errorBox.set(errorTextId == TXT_ACC_UNKNOWN_ERROR
                         ? uiOpenDialogOkCode(elm.get(), 344.0f, 312.0f, INPUT_OK, errorTextId, lastResult)
                         : uiOpenDialogOk(elm.get(), 344.0f, 312.0f, INPUT_OK, errorTextId));
        state = ERROR_WAIT;
        break;
    case ERROR_WAIT:
        busy = BUSY_WORKING;
        if (uiDialogResult(errorBox.get()) == DIALOG_OK) {
            appPlaySound(SE_CLICK, 0);
            errorBox.get()->destroy(__FILE__, __LINE__);
            state = FAILED;
        }
        break;
    case FAILED:
        busy = BUSY_FAILED;
        state = IDLE;
        break;
    case DONE:
        busy = BUSY_DONE;
        state = IDLE;
        break;
    }
    return true;
}

// ---- CNetAccountTaskReqDuellpass150

// @yo2 0x006a7030
void CNetAccountTaskReqDuellpass150::spawn(CTask* parent) { (new CNetAccountTaskReqDuellpass150)->create(parent, 10000); }

// @yo2 0x006a70d0 deleting destructor
// @yo2 0x006a7100
CNetAccountTaskReqDuellpass150::~CNetAccountTaskReqDuellpass150() = default;

// @yo2 0x006a7120
bool CNetAccountTaskReqDuellpass150::onInit() {
    acc = appNetAccount();
    state = START;
    return true;
}

// @yo2 0x006a7150
bool CNetAccountTaskReqDuellpass150::onMain() {
    switch (state) {
    case START:
        state = SEND;
        break;
    case SEND:
        acc->reqDuelPassPurchase();
        state = WAIT;
        break;
    case WAIT:
        if (acc->flag(ACC_REQ_DPPURCHASE) == 2) {
            acc->flag(ACC_REQ_DPPURCHASE) = 0;
            state = DONE;
        }
        break;
    }
    return true;
}
