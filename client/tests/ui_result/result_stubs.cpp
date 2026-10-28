// The other classes of yo2ResultWindow.cpp (labelled duel, not ported): fakes that record their arguments.
#include "Result/yo2ResultWindow.h"
#include "ui_fakes.h"

CWindowTaskControll* resultBaseNew(CTask* parent, IWindowTaskMediator* mediator, int32_t side, int32_t kind) {
    auto* c = new FakeControl;
    c->side = side;
    c->kind = kind;
    c->mediator_ = mediator;
    return dynamic_cast<CWindowTaskControll*>(c->create(parent, 10000));
}

CWindowTaskScrollBase* resultScrollNew(CTask* parent, IWindowTaskMediator* mediator, int32_t max) {
    auto* s = new FakeScroll;
    s->max_ = max;
    s->mediator_ = mediator;
    return dynamic_cast<CWindowTaskScrollBase*>(s->create(parent, 10000));
}
