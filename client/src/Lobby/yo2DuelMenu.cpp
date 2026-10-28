// CDuelMenuTask (the exe's src\Lobby\yo2LobbyEntry.cpp).
#include "yo2DuelMenu.h"

#include "Game/yo2TgtAvaListDlg.h"
#include "Net/NetLobby.h"
#include "Net/NetUi.h"

// @yo2 0x0087ebe0
CDuelMenuTask* CDuelMenuTask::spawn(CTask* parent, CElement* layer) {
    CDuelMenuTask* t = new CDuelMenuTask;
    t->layer = layer;
    return dynamic_cast<CDuelMenuTask*>(t->create(parent, 10000));
}

CDuelMenuTask::CDuelMenuTask() {
    for (CTaskPtrBase* p : {(CTaskPtrBase*)&baseElm, (CTaskPtrBase*)&total, (CTaskPtrBase*)&autoDuel,
                            (CTaskPtrBase*)&normDuel, (CTaskPtrBase*)&eventDuel})
        p->setUser(this);
    setTaskName("CDuelMenuTask");
}

// @yo2 0x0087ee90 CDuelMenuTask deleting destructor
// @yo2 0x0087ef40 the five CTaskPtrs
CDuelMenuTask::~CDuelMenuTask() = default;

// @yo2 0x0087f920 the window's position (an inline setter): its x_ / y_ and the element's
static void place(CWindowTaskModel* w, float x, float y) {
    w->x_ = x;
    w->y_ = y;
    w->pos_.x = x;
    w->pos_.y = y;
}

// @yo2 0x0087f010 the event lobbies (rank 7, 9, 10, 15, 16, 17, 20) get the gunsling entry, the rest the duel menu
bool CDuelMenuTask::onInit() {
    baseElm.set(CElement::newChild(layer, 10000));
    if (!baseElm.task()) {
        YO2_ASSERT(false, "CElement タスク生成失敗！？");   // couldn't create the CElement
        return false;
    }
    baseElm->setInstName("CDuelMenuTask::m_pBaseElm");
    layer = nullptr;
    g_gameCtrl.enter(CTRL_DUEL_MENU);
    uint8_t rank = appNetLobby()->rank;
    if (rank == 7 || rank == 9 || rank == 15 || rank == 16 || rank == 17 || rank == 20 || rank == 10) {
        eventDuel.set(windowModelJoinGunslingNew(baseElm.get()));
        YO2_ASSERT(eventDuel.task(), "m_EventDuel タスク作成失敗！？");   // couldn't create m_EventDuel
        state = GUNSLING;
        return true;
    }
    total.set(windowModelDuelNew(baseElm.get()));
    if (!total.task()) {
        YO2_ASSERT(false, "m_TotalDuel タスク生成失敗！？");
        return false;
    }
    total->setInstName("CDuelMenuTask::m_TotalDuel");
    place(total.get(), 266, 276);
    state = TOTAL;
    return true;
}

// Cancel (or the right button) or OK closes the window and ends the menu.
static bool closed(int32_t button) { return button == CDuelMenuTask::BUTTON_CANCEL || windowMouseRightPushed(); }

// @yo2 0x0087f950
bool CDuelMenuTask::onMain() {
    switch (state) {
    case TOTAL: {
        if (!total.task()) break;
        int32_t c = windowModelDuelChoice(total.get());
        if (closed(c)) {
            total->destroy(__FILE__, 0xcc6);
            break;
        }
        if (c == CHOICE_AUTO) {
            total->destroy(__FILE__, 0xcca);
            autoDuel.set(windowModelDuelFindNew(baseElm.get()));
            if (!autoDuel.task()) {
                YO2_ASSERT(false, "m_AutoDuel タスク生成失敗！？");
                return false;
            }
            autoDuel->setInstName("CDuelMenuTask::m_AutoDuel");
            place(autoDuel.get(), 266, 276);
            state = AUTO;
        } else if (c == CHOICE_NORMAL) {
            total->destroy(__FILE__, 0xcd3);
            normDuel.set(windowModelDuelWaitNew(baseElm.get()));
            if (!normDuel.task()) {
                YO2_ASSERT(false, "m_NormDuel タスク生成失敗！？");
                return false;
            }
            normDuel->setInstName("CDuelMenuTask::m_NormDuel");
            place(normDuel.get(), 266, 204);
            state = NORMAL;
        }
        return true;
    }
    case AUTO: {
        if (!autoDuel.task()) return true;
        int32_t r = windowModelDuelFindResult(autoDuel.get());
        if (closed(r)) autoDuel->destroy(__FILE__, 0xce3);
        else if (r == BUTTON_OK) autoDuel->destroy(__FILE__, 0xce7);
        else return true;
        break;
    }
    case NORMAL: {
        if (!normDuel.task()) return true;
        int32_t r = windowModelDuelWaitResult(normDuel.get());
        if (closed(r)) normDuel->destroy(__FILE__, 0xcef);
        else if (r == BUTTON_OK) normDuel->destroy(__FILE__, 0xcf3);
        else return true;
        break;
    }
    case GUNSLING: {
        if (!eventDuel.task()) return true;
        int32_t r = windowModelJoinGunslingResult(eventDuel.get());
        if (closed(r)) eventDuel->destroy(__FILE__, 0xcfb);
        else if (r == BUTTON_OK) eventDuel->destroy(__FILE__, 0xcff);
        else return true;
        break;
    }
    case DONE:
        return false;
    default:
        return true;
    }
    state = DONE;
    return true;
}

// @yo2 0x00880dc0
void CDuelMenuTask::onDestroy() {
    g_gameCtrl.leave(CTRL_DUEL_MENU);
    if (CElement* e = baseElm.task() ? baseElm.get() : nullptr) e->destroy(__FILE__, 0xd10);
}
