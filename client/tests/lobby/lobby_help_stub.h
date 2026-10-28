// A stand-in CWindowTaskHelp for tests/lobby (yo2LobbyExtern.h's windowHelp* seams): a control with a
// CWindowTaskText child that records its position, size, z, back colour, text and text id.
#pragma once
#include <string>

#include "Lobby/yo2LobbyExtern.h"
#include "System/window/yo2WindowControls.h"

struct FakeHelp : CWindowTaskControll {
    CTaskPtr<CWindowTaskText> text_;
    float x = 0, y = 0, w = 0, h = 0, z = -1;
    float back[4] = {};
    std::u16string text;
    int32_t textId = -1;
    void layout() override {}
    bool hitTest(float, float) override { return false; }
    void setText(const WChar* s) override { text = s; }
    void setTextId(int32_t id) override {
        textId = id;
        CWindowTaskControll::setTextId(id);
    }
};
inline FakeHelp* help(CWindowTaskControll* c) { return dynamic_cast<FakeHelp*>(c); }
CWindowTaskControll* windowHelpCreate(CTask* parent, IWindowTaskMediator* m) {
    auto* h = new FakeHelp;
    h->setMediator(m);
    h->create(parent, 10000);
    h->text_.setUser(h);
    h->text_.set(CWindowTaskText::create(h, nullptr));
    return h;
}
CWindowTaskText* windowHelpText(CWindowTaskControll* c) { return help(c)->text_.get(); }
void windowHelpSetBackColor(CWindowTaskControll* c, float r, float g, float b, float a) {
    FakeHelp* h = help(c);
    h->back[0] = r, h->back[1] = g, h->back[2] = b, h->back[3] = a;
}
void windowHelpSetPosition(CWindowTaskControll* c, float x, float y) {
    help(c)->x = x, help(c)->y = y;
    c->pos_.x = x, c->pos_.y = y;
}
void windowHelpSetSize(CWindowTaskControll* c, float w, float h) { help(c)->w = w, help(c)->h = h; }
void windowHelpSetZ(CWindowTaskControll* c, float z) { help(c)->z = z; }
