#include "yo2TaskPtr.h"

// @yo2 0x00634200 CTaskPtrBase::~CTaskPtrBase
// @yo2 0x006341d0 CTaskPtrBase deleting destructor
CTaskPtrBase::~CTaskPtrBase() {
    if (task_)
        task_->removeUser(this);
}

// @yo2 0x006343a0 CTaskPtrBase::onTaskDestroyed: go null, then tell the user which task died
void CTaskPtrBase::onTaskDestroyed() {
    CTmDestroyed m(task_);
    task_ = nullptr;
    user_->notify(&m);
}

// @yo2 0x00634230 CTaskPtr::SetUser: once, or again with the same user
void CTaskPtrBase::setUser(CTaskUser* user) {
    YO2_ASSERT(user_ == nullptr || user_ == user, "error CTaskPtr::SetUser()");
    user_ = user;
}
