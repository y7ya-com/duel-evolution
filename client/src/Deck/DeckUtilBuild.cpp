// yo2DeckUtil.cpp: CWindowModelInputValue's builder (0x00923ec0).
#include "DeckUtil.h"

#include <initializer_list>

namespace dk {

namespace {
// a float field the exe writes in place on a child (depth values: CWindowTaskControll +0x34c, CWindowTaskText
// +0x37c, CWindowTaskListbox +0x3bc, each mirrored into CElement +0x78)
void setF(void* obj, uint32_t off, float v) { memcpy(static_cast<uint8_t*>(obj) + off, &v, 4); }
void setB(void* obj, uint32_t off, uint8_t v) { static_cast<uint8_t*>(obj)[off] = v; }
void setB(CWindowTaskInput* in, uint32_t off, uint8_t v) { setB(static_cast<void*>(in), off, v); }

template <class T>
T* attach(TaskPtr<T>& p, T* child, const char* name, const char* failed) {
    p.set(child);
    DK_ASSERT(p.task, failed);
    taskSetInstName(p.get(), name);
    return p.get();
}

void setMsg(void* ctl, int32_t id) {
    VcWString s = msgText(id);
    ctlSetText(ctl, s.c_str());
}

// the label style every text of this dialog shares: no line gap, 16 px, 336x16, white
void label(CWindowTaskText* t, int32_t msg, float x, float y) {
    setMsg(t, msg);
    textSetLineHeight(t, 0);
    textSetFontSize(t, 16);
    textSetPos(t, x, y);
    textSetArea(t, 0x150, 0x10);
    textSetColor(t, 1.0f, 1.0f, 1.0f, 1.0f);
}

void numberInput(CWindowTaskInput* in, float x) {
    inputSetPos(in, x, 16.0f);
    inputSetSize(in, 68.0f, 32.0f);
    const int32_t maxLen = 5;   // at most 5 characters
    memcpy(reinterpret_cast<uint8_t*>(in) + 0x3f0, &maxLen, 4);
    setB(in, 0x3f5, 1);   // digits only
    setB(in, 0x3fd, 1);
}
}   // namespace

// @yo2 0x00923ec0 vf 4: frame, two labels, two inputs, OK/Cancel switches and a listbox, laid out per kind:
//   kind 3 (a name, text 9008) / 2 (one value, text 4024): one wide input, no second label, input or list;
//   kind 0 / 1 (two numbers, texts 4166 / 4167 + 4022): two 5-digit inputs and a two-row list (4020, 4021).
bool CWindowModelInputValue::build() {
    void* med = &mediatorVtbl;
    attach(frame, framePlaneCreate(this, med, style), "Inputframe", "frame create failed");
    attach(text1, textCreate(this, med), "Inputtext1", "text1 create failed");
    attach(text2, textCreate(this, med), "Inputtext2", "text2 create failed");
    attach(input[0], inputCreate(this, med, style), "Inputinput1", "input1 create failed");
    attach(input[1], inputCreate(this, med, style), "Inputinput2", "input2 create failed");
    attach(sw[0], textSwitchCreate(this, med), "Inputswitch1", "switch1 create failed");
    attach(sw[1], textSwitchCreate(this, med), "Inputswitch2", "switch2 create failed");
    attach(list, listboxCreate(this, med, 0), "Inputlistbox", "listbox create failed");

    ElemFields* f = fields(this);
    f->x = mx;
    f->y = my;
    f->z = mz;
    CWindowTaskFramePlane* fr = frame.get();
    setF(fr, 0x3dc, 336.0f);
    setF(fr, 0x3e0, 144.0f);
    ctlLayout(fr);

    if (kind == 3 || kind == 2) {
        label(text1.get(), kind == 3 ? 0x2330 : 0xfb8, 0.0f, 16.0f);
        textSetAlign(text1.get(), 1);
        ctlHide(text2.get());
        inputSetPos(input[0].get(), 8.0f, 56.0f);
        inputSetSize(input[0].get(), 320.0f, 32.0f);
        setB(input[0].get(), 0x3fd, 1);
        ctlHide(input[1].get());
        ctlHide(list.get());
    } else {
        label(text1.get(), kind == 0 ? 0x1046 : 0x1047, 26.0f, 24.0f);
        label(text2.get(), 0xfb6, 160.0f, 24.0f);
        numberInput(input[0].get(), 80.0f);
        numberInput(input[1].get(), 188.0f);
        CWindowTaskListbox* lb = list.get();
        listboxSetPos(lb, 50.0f, 60.0f);
        listboxSetSize(lb, 236.0f, 32.0f);
        ctlSetAlpha(lb, 1.0f);
        ctlShow(lb);
        listboxAdd(lb, msgText(0xfb4).c_str());
        listboxAdd(lb, msgText(0xfb5).c_str());
        listboxRefresh(lb);
    }

    CWindowTaskTextSwitch* ok = sw[0].get();
    switchSetPos(ok, 48.0f, 112.0f);
    switchSetSize(ok, 80.0f, 24.0f);
    setMsg(ok, 0xfa0);
    switchSetFontSize(ok, 15);
    CWindowTaskTextSwitch* cancel = sw[1].get();
    switchSetPos(cancel, 208.0f, 112.0f);
    switchSetSize(cancel, 80.0f, 24.0f);
    setMsg(cancel, 0xfa1);

    // depths: the frame at 1, everything on it at 2
    setF(fr, 0x34c, 1.0f);
    ctlLayout(fr);
    for (auto& in : input) {
        setF(in.get(), 0x34c, 2.0f);
        ctlLayout(in.get());
    }
    for (auto& s : sw) {
        setF(s.get(), 0x34c, 2.0f);
        fields(s.get())->z = 2.0f;
    }
    for (CWindowTaskText* t : {text1.get(), text2.get()}) {
        setF(t, 0x37c, 2.0f);
        fields(t)->z = 2.0f;
    }
    setF(list.get(), 0x3bc, 2.0f);
    fields(list.get())->z = 2.0f;

    modelSetKeyHandler(this, keyHook);
    setSize(336.0f, 144.0f);
    active = 1;
    layout();
    focusSet(input[0].task);
    return true;
}

}   // namespace dk
