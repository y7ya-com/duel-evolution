// yo2Task.cpp: the task tree every game object lives in.
//
// A CTask has a parent and children kept sorted by priority. Messages (CTaskMessage) are delivered with call():
// the task's receive() runs first, then, for broadcast messages such as TM_MAIN, the children in order. Tasks die in
// two steps: destroy() tears the subtree down and parks the task in a queue, and flushDeleted() frees the queue
// later (once per frame), so pointers held during a frame stay readable. CTaskPtr<T> (yo2TaskPtr.h) is the weak
// pointer other code keeps to a task; it is told when the task is destroyed.
#pragma once
#include <cstdint>

#include "vc6.h"

class CTaskPtrBase;

// Message tags used by the framework itself. Game messages use other values.
enum TaskMsg : int32_t {
    TM_INIT = 1,         // CTmInit: sent by create()
    TM_MAIN = 2,         // CTmMain: the per-frame update, broadcast down the tree
    TM_DESTROY = 3,      // CTmDestroy: sent to a task by its own destroy()
    TM_DESTROYED = 4,    // CTmDestroyed: a child or a CTaskPtr target died (sender in the message)
    TM_CAP_UTIL = 5,     // CTmCapUtil: debug/capture utility commands
    TM_SKIP_MAIN = 6,    // sets the one-shot flag that call() clears on the next TM_MAIN
    TM_DISP_STATUS = 7,  // CTmDispStatus: debug dump
    TM_SET_DISP = 9,     // CTmSetDisp: CElement::setDisp(show, true)
    TM_UPDATE_DISP = 10, // CTmUpdateDispFlg: broadcast; CElements re-read their parent's hidden state
    TM_UPDATE_MATRIX = 11,  // CTmUpdateMatrix: CElement::updateMatrix()
};

// What receive() returns.
enum TaskResult : int32_t {
    TR_UNHANDLED = 0,
    TR_HANDLED = 1,
    TR_DESTROY = 2,  // destroy this task now
    TR_DONE = 3,     // handled; don't pass a broadcast on to the children
    TR_ABORT = 4,    // call() returns false, which stops the parent's broadcast loop too
};

class CTaskMessage {
public:
    explicit CTaskMessage(int32_t tag, bool broadcast = false) : tag(tag), broadcast(broadcast) {}
    // @yo2 0x005bdd70 CTaskMessage deleting destructor
    virtual ~CTaskMessage() = default;

    int32_t tag;          // 0x04 TaskMsg or a game-specific tag
    bool broadcast;       // 0x08 after the receiver, pass it to the children (callChild)
    int32_t reverse = 0;  // 0x0c walk the children last to first
};
YO2_AT(CTaskMessage, tag, 0x04);
YO2_AT(CTaskMessage, broadcast, 0x08);
YO2_AT(CTaskMessage, reverse, 0x0c);
YO2_SIZEOF(CTaskMessage, 0x10);

// @yo2 0x00627b10 CTmInit::CTmInit
// @yo2 0x0060e490 CTmInit deleting destructor
// @yo2 0x0060e4c0 CTmInit::~CTmInit
struct CTmInit : CTaskMessage {
    CTmInit() : CTaskMessage(TM_INIT) {}
};
// @yo2 0x00627bc0 CTmMain::CTmMain
struct CTmMain : CTaskMessage {
    CTmMain() : CTaskMessage(TM_MAIN, true) {}
};
// @yo2 0x00627c70 CTmDestroy::CTmDestroy
// @yo2 0x00627ca0 CTmDestroy deleting destructor
// @yo2 0x00627cd0 CTmDestroy::~CTmDestroy
struct CTmDestroy : CTaskMessage {
    CTmDestroy() : CTaskMessage(TM_DESTROY) {}
};
// @yo2 0x00628af0 CTmDestroyed deleting destructor
// @yo2 0x00628b20 CTmDestroyed::~CTmDestroyed
struct CTmDestroyed : CTaskMessage {
    explicit CTmDestroyed(class CTask* sender) : CTaskMessage(TM_DESTROYED), sender(sender) {}
    class CTask* sender;  // 0x10 the task that died
};
YO2_AT(CTmDestroyed, sender, 0x10);

struct CTmDispStatus : CTaskMessage {
    CTmDispStatus() : CTaskMessage(TM_DISP_STATUS) {}
    void print(const char* fmt, ...);
    int32_t mode = 0;    // 0x10 0 = window, 1 = trace (both compiled out of the shipped exe)
    bool chain = false;  // 0x14 after a subclass's dump, also run its base class's
};
YO2_AT(CTmDispStatus, mode, 0x10);
YO2_AT(CTmDispStatus, chain, 0x14);

struct CTmCapUtil : CTaskMessage {
    enum : int32_t { CYCLE_DRAW_MODE = 9 };
    explicit CTmCapUtil(int32_t code) : CTaskMessage(TM_CAP_UTIL, true), code(code) {}
    int32_t code;  // 0x10
};
YO2_AT(CTmCapUtil, code, 0x10);

struct CTmSetDisp : CTaskMessage {
    explicit CTmSetDisp(bool show) : CTaskMessage(TM_SET_DISP), show(show) {}
    bool show;  // 0x10
};
YO2_AT(CTmSetDisp, show, 0x10);

// @yo2 0x0060e270 CTmUpdateDispFlg deleting destructor
// @yo2 0x0060e2a0 CTmUpdateDispFlg::~CTmUpdateDispFlg
struct CTmUpdateDispFlg : CTaskMessage {
    CTmUpdateDispFlg() : CTaskMessage(TM_UPDATE_DISP, true) {}
};

// Anything that can own a CTaskPtr: it is told (TM_DESTROYED) when the pointed-to task dies.
class CTaskUser {
public:
    // @yo2 0x006075b0 CTaskUser::notify (empty)
    virtual bool notify(CTaskMessage*) { return false; }
};

class CTask : public CTaskUser {
public:
    using Hook = void (*)(CTask* task, CTaskMessage* msg);

    explicit CTask(bool embedded = false);
    virtual ~CTask();

    static CTask* createRoot();
    static CTask* newChild(CTask* parent, uint32_t priority);
    CTask* create(CTask* parent, uint32_t priority);
    void destroy(const char* file, int line);
    void destroyChildren();
    static void deleteTask(CTask* task);
    static void flushDeleted();

    bool notify(CTaskMessage* msg) override { return call(msg); }
    bool call(CTaskMessage* msg);
    bool callChild(CTaskMessage* msg);
    virtual int32_t receive(CTaskMessage* msg);

    void changeParent(CTask* parent, uint32_t priority);
    void insertChild(CTask* child);
    int indexInParent() const;
    // @yo2 0x00628d70 CTask::isLocked
    bool isLocked(uint32_t mask) const { return (lockFlags_ & mask) != 0; }
    // @yo2 0x00628f80 CTask::setHook
    void setHook(Hook hook) { hook_ = hook; }
    // @yo2 0x00628fa0 CTask::addUser
    void addUser(CTaskPtrBase* user) { users_.push_back(user); }
    // @yo2 0x00629010 CTask::removeUser
    void removeUser(CTaskPtrBase* user) { users_.remove(user); }

    // @yo2 0x0062a130 CTask::taskName
    const vc6::string& taskName() const { return taskName_; }
    // @yo2 0x0062a150 CTask::instName
    const vc6::string& instName() const { return instName_; }
    // @yo2 0x00629e10 CTask::setTaskName
    void setTaskName(const vc6::string& s) { taskName_ = s; }
    // @yo2 0x00629fa0 CTask::setInstName
    void setInstName(const vc6::string& s) { instName_ = s; }

    static bool isValid(const CTask* task);
    void pushMainOrder();
    static void clearMainOrder();
    static void dumpMainOrder();
    void dumpTree(const vc6::string& prefix) const;

    CTask* parent() const { return parent_; }
    const vc6::list<CTask*>& children() const { return children_; }
    bool alive() const { return alive_; }
    void setQueued(bool q) { queued_ = q; }
    uint32_t priority() const { return priority_; }
    uint32_t depth() const { return depth_; }
    static int liveCount() { return s_liveTasks; }

    static constexpr uint32_t MAGIC_ALIVE = 0xabababab;
    static constexpr uint32_t MAGIC_DEAD = 0xfefefefe;

protected:
    bool embedded_;                  // 0x04 not heap-owned by the tree: destroy() doesn't queue it for delete
    bool queued_ = false;            // 0x05 sitting in a CZSort queue this frame
    bool alive_ = false;             // 0x06 between create() and destroy()
    CTask* parent_ = nullptr;        // 0x08
    vc6::list<CTask*> children_;     // 0x0c sorted by priority, ties in insertion order
    uint32_t priority_ = 0;          // 0x18
    uint32_t depth_ = 0;             // 0x1c parent's depth + 1
    uint32_t lockFlags_ = 0;         // 0x20 any bit set: TM_MAIN is not delivered
    bool skipMain_ = false;          // 0x24 TM_SKIP_MAIN; cleared by the next TM_MAIN
    vc6::list<CTaskPtrBase*> users_; // 0x28 CTaskPtrs pointing here
    Hook hook_ = nullptr;            // 0x34 sees every message before receive() handles it
    uint32_t magic_;                 // 0x38 MAGIC_ALIVE from construction to destruction
    vc6::string taskName_;           // 0x3c "TaskName": the class, "CTask" unless a subclass sets it
    vc6::string instName_;           // 0x4c "InsName": this instance, "noname" by default
    uint8_t unk5c_ = 0;              // 0x5c
    uint32_t unk60_ = 0;             // 0x60
    uint32_t unk64_ = 0;             // 0x64
    uint32_t unk68_ = 0;             // 0x68
    uint32_t unk6c_ = 0;             // 0x6c

    static int s_liveTasks;                 // DAT_012718f0

private:
    struct Layout;
    static vc6::vector<CTask*> s_deleteQueue;  // DAT_01271898
    static vc6::vector<CTask*> s_mainOrder;    // DAT_012718b0 "TmMainOrder"
};
struct CTask::Layout {
    YO2_AT(CTask, embedded_, 0x04);
    YO2_AT(CTask, alive_, 0x06);
    YO2_AT(CTask, parent_, 0x08);
    YO2_AT(CTask, children_, 0x0c);
    YO2_AT(CTask, priority_, 0x18);
    YO2_AT(CTask, depth_, 0x1c);
    YO2_AT(CTask, lockFlags_, 0x20);
    YO2_AT(CTask, skipMain_, 0x24);
    YO2_AT(CTask, users_, 0x28);
    YO2_AT(CTask, hook_, 0x34);
    YO2_AT(CTask, magic_, 0x38);
    YO2_AT(CTask, taskName_, 0x3c);
    YO2_AT(CTask, instName_, 0x4c);
    YO2_AT(CTask, unk5c_, 0x5c);
    YO2_AT(CTask, unk6c_, 0x6c);
};
YO2_SIZEOF(CTask, 0x70);

// The framework's shared messages.
extern CTmDestroy g_tmDestroy;  // DAT_012718c0
extern CTmMain g_tmMain;        // DAT_012718d0
extern CTmInit g_tmInit;        // DAT_012718e0
