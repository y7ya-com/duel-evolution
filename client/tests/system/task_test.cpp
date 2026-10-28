// src/System task framework: CTask tree, message delivery, destroy/delete queue, CTaskPtr.
#include <cassert>
#include <cstdio>
#include <string>
#include <vector>

#include "System/yo2Lang.h"  // compile check for the header tables
#include "System/yo2TaskPtr.h"

static std::string g_log;

struct Probe : CTask {
    char id;
    int32_t onMain = TR_HANDLED;
    explicit Probe(char id) : id(id) {}
    int32_t receive(CTaskMessage* m) override {
        if (m->tag == TM_MAIN)
            g_log += id;
        if (m->tag == TM_DESTROY)
            g_log += std::string("~") + id;
        int32_t r = CTask::receive(m);
        return m->tag == TM_MAIN ? onMain : r;
    }
};

struct Owner : CTask {
    std::vector<CTask*> died;
    CTaskPtr<Probe> ptr;
    Owner() { ptr.setUser(this); }
    int32_t receive(CTaskMessage* m) override {
        if (m->tag == TM_DESTROYED)
            died.push_back(static_cast<CTmDestroyed*>(m)->sender);
        return CTask::receive(m);
    }
};

static Probe* child(CTask* parent, char id, uint32_t pri) {
    auto* p = new Probe(id);
    return static_cast<Probe*>(p->create(parent, pri));
}

int main() {
    CTask* root = CTask::createRoot();
    assert(root && root->alive() && root->instName() == "noname" && root->taskName() == "CTask");
    int live0 = CTask::liveCount();

    // children sorted by priority, equal priorities keep insertion order
    Probe* b = child(root, 'b', 20);
    Probe* a = child(root, 'a', 10);
    Probe* c = child(root, 'c', 20);
    Probe* a1 = child(a, 'x', 0);
    assert(CTask::liveCount() == live0 + 4);
    assert(a1->depth() == root->depth() + 2 && a1->parent() == a);
    assert(a->indexInParent() == 0 && b->indexInParent() == 1 && c->indexInParent() == 2);

    // TM_MAIN broadcast: depth-first, in priority order; reverse walks the children last to first
    g_log.clear();
    assert(root->call(&g_tmMain));
    assert(g_log == "axbc");
    CTmMain rev;
    rev.reverse = 1;
    g_log.clear();
    root->call(&rev);
    assert(g_log == "cbax");

    // TR_DONE keeps a broadcast from a task's children; TR_ABORT stops the rest of the walk
    a->onMain = TR_DONE;
    g_log.clear();
    root->call(&g_tmMain);
    assert(g_log == "abc");
    a->onMain = TR_HANDLED;
    b->onMain = TR_ABORT;
    g_log.clear();
    assert(!root->call(&g_tmMain));
    assert(g_log == "axb");
    b->onMain = TR_HANDLED;

    // TM_SKIP_MAIN is a one-shot flag, cleared by the next TM_MAIN
    CTaskMessage skip(TM_SKIP_MAIN);
    a->call(&skip);
    g_log.clear();
    root->call(&g_tmMain);
    assert(g_log == "axbc");

    // changeParent moves the task, re-sorts it and fixes its depth
    a1->changeParent(root, 15);
    assert(a1->depth() == root->depth() + 1 && a->children().empty());
    g_log.clear();
    root->call(&g_tmMain);
    assert(g_log == "axbc");

    // CTaskPtr: the owner hears TM_DESTROYED and the pointer goes null
    auto* owner = static_cast<Owner*>((new Owner)->create(root, 99));
    owner->ptr.set(b);
    assert(owner->ptr.get() == b);
    g_log.clear();
    b->destroy(__FILE__, __LINE__);
    assert(g_log == "~b");
    assert(!owner->ptr && owner->died.size() == 1 && owner->died[0] == b);
    assert(!b->alive() && CTask::isValid(b));  // destroyed but not freed until flushDeleted()
    assert(root->children().size() == 4);    // a, a1, c, owner

    // destroying a subtree destroys the children first
    Probe* d = child(c, 'd', 0);
    g_log.clear();
    c->destroy(__FILE__, __LINE__);
    assert(g_log == "~c~d");
    CTask::flushDeleted();
    assert(CTask::liveCount() == live0 + 3);

    // isValid rejects null, the debug-heap fill patterns and dead magic
    assert(!CTask::isValid(nullptr));
    assert(!CTask::isValid(reinterpret_cast<CTask*>(uintptr_t(0xfefefefe))));
    (void)d;

    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    assert(CTask::liveCount() == 0);
    std::puts("task_test ok");
}
