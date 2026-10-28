#include "yo2Task.h"

#include <cstdarg>
#include <cstdint>
#include <cstdio>

#include "yo2Debug.h"
#include "yo2TaskPtr.h"

// @yo2 0x00627af0 static init: g_tmInit
// @yo2 0x00627b40 static init: atexit(~g_tmInit)
// @yo2 0x00627ba0 static init: g_tmMain
// @yo2 0x00627bf0 static init: atexit(~g_tmMain)
// @yo2 0x00627c50 static init: g_tmDestroy
// @yo2 0x00627cf0 static init: atexit(~g_tmDestroy)
CTmDestroy g_tmDestroy;
CTmMain g_tmMain;
CTmInit g_tmInit;

int CTask::s_liveTasks;
// @yo2 0x00627e10 static init: s_deleteQueue
// @yo2 0x00627e40 static init: atexit(~s_deleteQueue)
vc6::vector<CTask*> CTask::s_deleteQueue;
// @yo2 0x00627d50 static init: s_mainOrder
// @yo2 0x00627d80 static init: atexit(~s_mainOrder)
vc6::vector<CTask*> CTask::s_mainOrder;

static const char* nameOf(const CTask* t) { return t->instName().c_str(); }

// @yo2 0x00629280 CTask::CTask
CTask::CTask(bool embedded) : embedded_(embedded), magic_(MAGIC_ALIVE) {
    setTaskName("CTask");
    setInstName("noname");
}

// @yo2 0x00629530 CTask::~CTask
// @yo2 0x00629500 CTask deleting destructor
CTask::~CTask() {
    magic_ = MAGIC_DEAD;
    alive_ = false;
}

// @yo2 0x00629110 CTask::createRoot: a parentless task at priority 0
CTask* CTask::createRoot() {
    CTask* t = new CTask(false);
    t->alive_ = true;
    t->priority_ = 0;
    ++s_liveTasks;
    if (t->receive(&g_tmInit) == TR_DESTROY) {
        t->destroy(__FILE__, __LINE__);
        return nullptr;
    }
    return t;
}

// @yo2 0x00629080 CTask::newChild: a plain CTask under `parent`
CTask* CTask::newChild(CTask* parent, uint32_t priority) {
    CTask* t = new CTask(false);
    return t->create(parent, priority);
}

// @yo2 0x006296a0 CTask::create: attach under `parent` and send TM_INIT. Null if the task refused (and died).
CTask* CTask::create(CTask* parent, uint32_t priority) {
    YO2_ASSERT(parent_ == nullptr, "もう親がいる");  // already has a parent
    alive_ = true;
    priority_ = priority;
    if (parent == nullptr)
        YO2_ASSERT(false, "ParentがNULL");
    else
        changeParent(parent, priority);
    if (receive(&g_tmInit) == TR_DESTROY) {
        destroy(__FILE__, __LINE__);
        return nullptr;
    }
    ++s_liveTasks;
    return this;
}

// @yo2 0x00627eb0 CTask::Call: receive(), then the children for broadcasts
// @yo2 0x00629260 CTask::notify (CTaskUser slot 0) forwards to Call
bool CTask::call(CTaskMessage* msg) {
    YO2_ASSERT(msg->tag == TM_DESTROYED || (alive_ && isValid(this)), "error CTask::Call(tag=%d) not valid %p(%s)",
               msg->tag, this, nameOf(this));
    if (isLocked(~0u) && msg->tag == TM_MAIN)
        return true;
    if (skipMain_ && msg->tag == TM_MAIN)
        skipMain_ = false;
    switch (receive(msg)) {
    case TR_DESTROY:
        destroy(__FILE__, __LINE__);
        return true;
    case TR_DONE:
        return true;
    case TR_ABORT:
        return false;
    }
    if (!msg->broadcast)
        return true;
    YO2_ASSERT(alive_ && isValid(this), "error CTask::Call(%d)2 not valid %p(%s)", msg->tag, this, nameOf(this));
    return callChild(msg);
}

// @yo2 0x00628210 CTask::CallChild: stops at the first child whose call() returns false
bool CTask::callChild(CTaskMessage* msg) {
    YO2_ASSERT(alive_ && isValid(this), "error CTask::CallChild(%d) not valid %p(%s)", msg->tag, this, nameOf(this));
    auto check = [&](CTask* c) {
        YO2_ASSERT(c->alive_ && isValid(c), "error CTask(%p(%s))::CallChild(%d) not valid child(%p(%s))", this,
                   nameOf(this), msg->tag, c, nameOf(c));
    };
    if (msg->reverse == 0) {
        for (auto it = children_.begin(); it != children_.end();) {
            CTask* c = *it++;  // advance first: the child may unlink itself
            check(c);
            if (!c->call(msg))
                return false;
        }
    } else {
        for (auto it = children_.end(); it != children_.begin();) {
            CTask* c = *--it;
            check(c);
            if (!c->call(msg))
                return false;
        }
    }
    return true;
}

// @yo2 0x006286b0 CTask::Destroy: TM_DESTROY to self, children first, tell CTaskPtrs and the parent, then queue
void CTask::destroy(const char* file, int line) {
    YO2_ASSERT(alive_ && isValid(this), "error CTask::Destroy(%p(%s)) not alive\nCall from %s(L%d)", this,
               nameOf(this), file, line);
    receive(&g_tmDestroy);
    while (!children_.empty())
        children_.front()->destroy(__FILE__, __LINE__);  // each one unlinks itself through TM_DESTROYED
    for (auto it = users_.begin(); it != users_.end();) {
        CTaskPtrBase* p = *it++;
        p->onTaskDestroyed();
    }
    if (parent_) {
        CTmDestroyed m(this);
        parent_->call(&m);
    }
    alive_ = false;
    if (!embedded_)
        s_deleteQueue.push_back(this);
    --s_liveTasks;
}

// @yo2 0x00628b40 CTask::Delete
void CTask::deleteTask(CTask* task) {
    YO2_ASSERT(isValid(task), "error CTask::Delete(%p(%s))", task, task ? nameOf(task) : "");
    delete task;
}

// @yo2 0x006291f0 CTask::flushDeleted: free everything destroy() queued
void CTask::flushDeleted() {
    for (CTask* t : s_deleteQueue)
        deleteTask(t);
    s_deleteQueue.clear();
}

// @yo2 0x00628cf0 CTask::destroyChildren
void CTask::destroyChildren() {
    while (!children_.empty())
        children_.front()->destroy(__FILE__, __LINE__);
}

// @yo2 0x00628d30 CTask::indexInParent (0 when parentless or not found)
int CTask::indexInParent() const {
    if (!parent_)
        return 0;
    int i = 0;
    for (CTask* c : parent_->children_) {
        if (c == this)
            return i;
        ++i;
    }
    return 0;
}

// @yo2 0x00628da0 CTask::ChangeParent
void CTask::changeParent(CTask* parent, uint32_t priority) {
    YO2_ASSERT(isValid(parent), "ChangeParent 0x%p bad parent", parent);
    if (parent_)
        parent_->children_.remove(this);
    parent_ = parent;
    priority_ = priority;
    parent->insertChild(this);
    depth_ = parent->depth_ + 1;
}

// @yo2 0x00629d80 CTask::insertChild: after every child of lower or equal priority
void CTask::insertChild(CTask* child) {
    auto it = children_.begin();
    while (it != children_.end() && (*it)->priority_ <= child->priority_)
        ++it;
    children_.insert(it, child);
}

// @yo2 0x006299a0 CTask::Receive: the framework messages every task handles
int32_t CTask::receive(CTaskMessage* msg) {
    YO2_ASSERT(msg->tag == TM_DESTROYED || (alive_ && isValid(this)), "error CTask::Receive(%d) not valid %p(%s)",
               msg->tag, this, nameOf(this));
    if (hook_)
        hook_(this, msg);
    switch (msg->tag) {
    case TM_MAIN:
        pushMainOrder();
        break;
    case TM_DESTROYED:
        children_.remove(static_cast<CTmDestroyed*>(msg)->sender);
        break;
    case TM_SKIP_MAIN:
        skipMain_ = true;
        break;
    case TM_DISP_STATUS: {
        auto* s = static_cast<CTmDispStatus*>(msg);
        s->print("---- CTask ----\n");
        s->print("ulPri      = %d\n", priority_);
        s->print("ulLockFlag = %x\n", lockFlags_);
        if (parent_)
            s->print("pParent    = %s[%p]\n", parent_->taskName().c_str(), parent_);
        s->print("Child Num  = %d\n", static_cast<int>(children_.size()));
        s->print("User Num   = %d\n", static_cast<int>(users_.size()));
        break;
    }
    default:
        return TR_UNHANDLED;
    }
    return TR_HANDLED;
}

// @yo2 0x0062a420 CTask::isValid: not null, not a debug-heap fill pattern, magic intact
bool CTask::isValid(const CTask* t) {
    auto p = reinterpret_cast<uintptr_t>(t);
    return p != 0 && p != 0xcdcdcdcd && p != 0xfefefefe && p != 0xbaadf00d && t->magic_ == MAGIC_ALIVE;
}

// @yo2 0x0062a4b0 TmMainOrder push_back: the order tasks received TM_MAIN this frame
void CTask::pushMainOrder() { s_mainOrder.push_back(this); }

// @yo2 0x0062a460 TmMainOrder clear
void CTask::clearMainOrder() { s_mainOrder.clear(); }

// @yo2 0x0062a710 TmMainOrder dump
void CTask::dumpMainOrder() {
    yo2Trace("===== TmMainOrder =====\n");
    yo2Trace("  no : InsName : TaskName : Addr\n");
    int i = 0;
    for (CTask* t : s_mainOrder) {
        if (!isValid(t))
            yo2Trace("%4d: 0x%p **** dead ****\n", i, t);
        else
            yo2Trace("%4d: %s\t : %s\t : 0x%p\n", i, t->instName().c_str(), t->taskName().c_str(), t);
        ++i;
    }
}

// @yo2 0x0062a170 CTask::dumpTree: ASCII tree of the subtree, one task per line
void CTask::dumpTree(const vc6::string& prefix) const {
    if (prefix.empty()) {
        yo2Trace("[ %s : %s : 0x%08x ]\n", instName().c_str(), taskName().c_str(), this);
    } else {
        vc6::string head(std::string_view(prefix).substr(0, prefix.size() - 1));
        yo2Trace("%s+->[ %s : %s : 0x%08x ]\n", head.c_str(), instName().c_str(), taskName().c_str(), this);
    }
    for (CTask* c : children_) {
        vc6::string sub = prefix;
        sub += c == children_.back() ? "   " : "  |";
        c->dumpTree(sub);
    }
}

// @yo2 0x0060f8b0 CTmDispStatus::print (both sinks are empty in the shipped exe)
void CTmDispStatus::print(const char* fmt, ...) {
    char buf[0x400];
    va_list ap;
    va_start(ap, fmt);
    std::vsnprintf(buf, sizeof buf, fmt, ap);
    va_end(ap);
    if (mode == 1)
        yo2Trace("%s", buf);
}
