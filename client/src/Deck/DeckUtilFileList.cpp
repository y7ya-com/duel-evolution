// CWindowModelFileList::init (0x009299f0, vf 4): builds the deck-file / card-pack list window of the deck editor.
//   a CWindowTaskFrameBottomThick behind everything ("FileListframe"), the listbox ("FileListlistbox"),
//   an 18-tile nine-slice of window_base_01_c01.png (three 3-tile bands: title, list, field), a text field,
//   four switches along the bottom (new / delete / yes / no) and the title text, then per mode (FILELIST_*) the
//   pieces that mode doesn't use are hidden and the title picks its message.
// The exe writes most child fields inline; those writes are the externs in DeckUtil.h ("inline" in their notes).
#include <cstring>

#include "DeckUtil.h"

namespace dk {

// deco[i], in creation order. Rows: 0 (title top), 8 (title body, 3x high), 32 (list top) / 168, 176, 184 (the
// field band). Columns: left 8 px, middle stretched, right 8 px.
const FileListTile kFileListTiles[18] = {
    {"LT1", 0x18, 0x00, 0, 0, false},   {"Top1", 0x20, 0x00, 1, 0, false},   {"RT1", 0x28, 0x00, 2, 0, false},
    {"LT2", 0x18, 0x08, 0, 8, true},    {"Top2", 0x20, 0x08, 1, 8, true},    {"RT2", 0x28, 0x08, 2, 8, true},
    {"LT3", 0x48, 0x00, 0, 32, false},  {"Top3", 0x38, 0x00, 1, 32, false},  {"RT3", 0x50, 0x00, 2, 32, false},
    {"LT", 0x48, 0x08, 0, 168, false},  {"Top", 0x38, 0x10, 1, 168, false},  {"RT", 0x50, 0x08, 2, 168, false},
    {"LC", 0x18, 0x08, 0, 176, false},  {"Center", 0x20, 0x08, 1, 176, false}, {"RC", 0x28, 0x08, 2, 176, false},
    {"LB", 0x48, 0x00, 0, 184, false},  {"Bottom", 0x38, 0x00, 1, 184, false}, {"RB", 0x50, 0x00, 2, 184, false},
};

namespace {

// the switches: instance name, message id of their label
struct SwitchSpec {
    const char* name;
    int32_t text;
};
const SwitchSpec kSwitches[4] = {
    {"FileListnewSwitch", 0xfc9}, {"FileListdeleteSwitch", 0xfa7}, {"FileListyesSwitch", 0xfa2},
    {"FileListnoSwitch", 0xfa3},
};

// CWindowTaskControll inlines (also emitted in yo2DeckParts.cpp, where they are marked: 0x0091f8f0 / 0x0091f930)
void markDirty(void* e) { fields(e)->dirty = 1; }
void ctlDepth(void* ctl, float z) {
    std::memcpy(static_cast<uint8_t*>(ctl) + 0x34c, &z, 4);
    fields(ctl)->z = z;
}
// CSpriteElm +0x88 / +0x8c are float scales here (the exe stores 3.0f and (w - 16) / 8 as floats)
void spriteScaleX(void* s, float v) { std::memcpy(static_cast<uint8_t*>(s) + 0x88, &v, 4); }
void spriteScaleY(void* s, float v) { std::memcpy(static_cast<uint8_t*>(s) + 0x8c, &v, 4); }
void hidePart(void* e) {   // show(0, notify) + TF_NOHIT
    if (!e) return;
    elemShow(e, false, true);
    taskAddFlags(e, TF_NOHIT);
}

}   // namespace

// @yo2 0x009299f0 vf 4
uint32_t CWindowModelFileList::init() {
    ElemFields* me = fields(this);
    me->x = mx, me->y = my, me->z = mz;
    void* med = base + 0x340;   // this as the IWindowTaskMediator its children report to

    frame.set(frameThickCreate(this, med, 1));
    DK_ASSERT(frame.task, "frame create failed");
    taskSetInstName(frame.get(), "FileListframe");
    frameThickPlace(frame.get(), 0.0f, 32.0f, mw, mh + 32.0f, 32.0f);
    frameSetZ(frame.get(), 30.0f);
    ctlSetAlpha(frame.get(), 1.0f);

    list.set(listboxCreate(this, med, 0));
    DK_ASSERT(list.task, "listbox create failed");
    taskSetInstName(list.get(), "FileListlistbox");
    listboxPlace(list.get(), 8, 40, 680, 128);
    ctlSetAlpha(list.get(), 1.0f);
    listboxSetZ(list.get(), 30.0f);
    if (mode == FILELIST_PACKS) listboxSetTextAlign(list.get(), 0);
    listboxSetMarks(list.get(), false);

    const VcString skin = skinPath("window_base_01_c01.png");
    for (int i = 0; i < 18; i++) {
        deco[i].set(spriteCreate(this, 10000, skin));
        DK_ASSERT(deco[i].task, "tile create failed");   // "<name> create failed" per tile in the exe
        taskSetInstName(deco[i].get(), kFileListTiles[i].name);
        elemSetBlend(deco[i].get(), 0);
        markDirty(deco[i].get());
    }

    field.set(textFieldCreate(this, med));
    DK_ASSERT(!textFieldPtrEmpty(&field), "textfield create failed");
    taskSetInstName(field.get(), "FileListtextfield");
    modelSetPos2(field.get(), 8.0f, 192.0f);
    ctlSetSize(field.get(), 680.0f, 128.0f);
    ctlSetColor(field.get(), 1.0f, 1.0f, 1.0f, 1.0f);
    ctlSetZ(field.get(), 30.0f);
    ctlSetTextAlign(field.get(), 0);

    for (int i = 0; i < 4; i++) {
        sw[i].set(textSwitchCreate(this, med));
        DK_ASSERT(sw[i].task, "switch create failed");   // "newSwitch create failed" ... in the exe
        taskSetInstName(sw[i].get(), kSwitches[i].name);
        ctlSetText(sw[i].get(), msgText(kSwitches[i].text).c_str());
        ctlSetMediator(sw[i].get(), med);
    }

    title.set(textCreate(this, med));
    DK_ASSERT(!textPtrEmpty(&title), "Title create failed");
    taskSetInstName(title.get(), "Title");
    textSetPos(title.get(), 0.0f, 0.0f);
    modelSetZ(title.get(), 33.0f);
    textSetFont(title.get(), nullptr);   // DAT_00d4509c
    textSetFontSize(title.get(), 24);
    textSetColor(title.get(), 1.0f, 1.0f, 1.0f, 1.0f);
    textResetClip(title.get());
    markDirty(title.get());
    ctlHide(title.get());

    // the nine-slice
    for (int i = 0; i < 18; i++) {
        const FileListTile& t = kFileListTiles[i];
        ElemFields* s = fields(deco[i].get());
        if (!s) continue;
        s->x = t.col == 0 ? 0.0f : t.col == 1 ? 8.0f : mw - 8.0f;
        s->y = (float)t.y;
        s->z = 31.0f;
        s->color[3] = fade;
        s->src[0] = t.sx, s->src[1] = t.sy, s->src[2] = 8, s->src[3] = 8;
        if (t.col == 1) spriteScaleX(s, (mw - 16.0f) * 0.125f);
        if (t.tall) spriteScaleY(s, 3.0f);
    }

    // the switches share the bottom row: four quarter-width cells under the window, centred on their default size
    float y = 0;
    for (int i = 0; i < 4; i++) {
        float rx, ry, w, h;
        switchGetRect(sw[i].get(), &rx, &ry, &w, &h);
        float cell = mw * 0.25f;
        float x = (cell - w) * 0.5f + mw * 0.25f * (float)i;
        if (i == 0) y = (24.0f - h) * 0.5f + mh + 32.0f;   // the exe measures only the first switch's height
        switchSetPos(sw[i].get(), x, y);
        switchSetSize(sw[i].get(), 80.0f, 24.0f);
        ctlDepth(sw[i].get(), 32.0f);
    }

    // per mode: hide what it doesn't use, then centre the title
    int32_t msg = -1;
    switch (mode) {
    case FILELIST_DECKS:   // load: no field band, no "new"
        for (int i = 9; i < 18; i++) hidePart(deco[i].get());
        hidePart(field.get());
        ctlHide(sw[0].get());
        msg = 0x17ce;
        break;
    case FILELIST_PACKS:   // recipe: no "new" / "delete"
        ctlHide(sw[0].get());
        ctlHide(sw[1].get());
        msg = 0x17d0;
        break;
    case FILELIST_OTHER:
        for (int i = 9; i < 18; i++) hidePart(deco[i].get());
        hidePart(field.get());
        msg = 0x17cf;
        break;
    }
    if (msg >= 0) {
        ctlSetText(title.get(), msgText(msg).c_str());
        float x = mw * 0.5f - (float)textWidth(title.get()) * 0.5f - 8.0f;
        textSetPos(title.get(), x, 8.0f);
        ctlShow(title.get());
    }

    modelSetKeyHandler(this, &sel1);
    ctlSetEnabled(this, true);   // FUN_0091f910: +0x350 = 1
    place();                     // vf 9
    return 1;
}

// The CWindowTaskControll inlines, as free functions (the exe's single copies are marked on
// CWindowTaskStructureIcon::setBadgeSize / setZ in DeckUtil.cpp).
void ctlSetSize(void* ctl, float w, float h) {
    std::memcpy(static_cast<uint8_t*>(ctl) + 0x398, &w, 4);
    std::memcpy(static_cast<uint8_t*>(ctl) + 0x39c, &h, 4);
    ctlLayout(ctl);
}
void ctlSetZ(void* ctl, float z) {
    std::memcpy(static_cast<uint8_t*>(ctl) + 0x3a0, &z, 4);
    ctlLayout(ctl);
}

}   // namespace dk
