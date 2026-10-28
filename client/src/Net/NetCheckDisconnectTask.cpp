// CCheckDisconnectTask and CCheckHeartBeatTask (the exe's src\Net\yo2CheckDisconnectTask.cpp).
#include "NetTasks.h"

// @yo2 0x0069cb20 create under parent (priority 10000)
CCheckHeartBeatTask* CCheckHeartBeatTask::spawn(CTask* parent) {
    return dynamic_cast<CCheckHeartBeatTask*>((new CCheckHeartBeatTask)->create(parent, 10000));
}

// @yo2 0x0069cbe0 CCheckHeartBeatTask deleting destructor
// @yo2 0x0069cc10
CCheckHeartBeatTask::~CCheckHeartBeatTask() = default;

// @yo2 0x0069cc30
bool CCheckHeartBeatTask::onInit() {
    lobby = appNetLobby();
    duel = appNetDuel();
    acc = appNetAccount();
    which = NONE;
    frames = 0;
    state = WATCHING;
    period = 60;
    return true;
}

// @yo2 0x0069cdd0 watch again
void CCheckHeartBeatTask::reset() {
    state = WATCHING;
    which = NONE;
    frames = 0;
    period = 60;
}

// @yo2 0x0069cca0
bool CCheckHeartBeatTask::onMain() {
    frames++;
    if (state != WATCHING) return true;
    int n = 0;
    for (CMessageIOBase* io : {(CMessageIOBase*)lobby, &duelIo(duel), (CMessageIOBase*)acc}) {
        n++;
        if (io->state() != YGC_CONNECTED) continue;
        io->keepAlive();
        if (n == DUEL) {   // the exe restarts the count while a duel is connected (nothing reads it)
            frames = 0;
            period = 60;
        }
        if (io->timedOut()) {
            io->disconnect();
            state = DOWN;
            which = n;
        }
    }
    return true;
}

CCheckDisconnectTask::CCheckDisconnectTask() { setTaskName("CCheckDisconnectTask"); }

// @yo2 0x0069c0c0 CCheckDisconnectTask deleting destructor
// @yo2 0x0069c0f0 the text, then the CTaskPtr, then CEasyTask
CCheckDisconnectTask::~CCheckDisconnectTask() = default;

// @yo2 0x0069bd80 create under parent (priority 10000) with its own sprite layer under uiParent
CCheckDisconnectTask* CCheckDisconnectTask::spawn(CTask* parent, CTask* uiParent) {
    CCheckDisconnectTask* t = new CCheckDisconnectTask;
    t->elm.setUser(t);
    t->elm.set(uiCreateSpriteElm(uiParent, 10000));
    return dynamic_cast<CCheckDisconnectTask*>(t->create(parent, 10000));
}

// @yo2 0x0069c1b0
bool CCheckDisconnectTask::onInit() {
    CTask* e = elm.get();
    YO2_ASSERT(e, "NULL access");
    e->setInstName("切断エラーダイアログの親エレメント");   // the disconnect box's parent element
    state = WATCH;
    appDisconnect().flag = 0;
    heartBeat = CCheckHeartBeatTask::spawn(this);
    delay = 4;
    return true;
}

// @yo2 0x0069c460
bool CCheckDisconnectTask::onMain() {
    switch (state) {
    case WATCH:
        if (appDisconnect().flag) {
            state = OPEN;
            switch (appDisconnect().reason) {
            case 1: textId = TXT_DISCONNECTED; delay = 4; break;
            case 2: textId = TXT_DISCONNECTED_2; delay = 10; break;
            case 3: textId = TXT_ACCOUNT_DOWN; delay = 4; break;
            default: textId = TXT_DISCONNECTED; break;
            }
        }
        if (heartBeat->state == CCheckHeartBeatTask::DOWN) {
            state = OPEN;
            switch (heartBeat->which) {
            case CCheckHeartBeatTask::LOBBY: textId = TXT_LOBBY_DOWN; delay = 4; break;
            case CCheckHeartBeatTask::DUEL: textId = TXT_DUEL_DOWN; delay = 10; break;
            case CCheckHeartBeatTask::ACCOUNT: textId = TXT_ACCOUNT_DOWN; delay = 4; break;
            }
        }
        break;
    case OPEN:
        dialog = uiOpenDialogOk(elm.get(), 0, 0, INPUT_OK, textId);
        dialog->setInstName("切断エラーダイアログ");   // the disconnect box
        heartBeat->reset();
        state = WAIT;
        break;
    case WAIT:
        if (uiDialogResult(dialog) != -1) state = CLOSE;
        break;
    case CLOSE:
        dialog->destroy(__FILE__, 0x59);
        appMarkDisconnected();
        appFadeOut(10, 0xee4c);
        state = RESET;
        break;
    case RESET:
        appDisconnect() = {};
        state = WATCH;
        break;
    }
    return true;
}
