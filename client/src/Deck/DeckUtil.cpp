// yo2DeckUtil.cpp (0x00920b00..0x00934720) except the two big window builders (DeckUtilBuild.cpp).
#include "DeckUtil.h"

#include <cstdio>
#include <new>

#include "DeckTables.h"

namespace dk {

// ---------------------------------------------------------------- this TU's static objects
// DeckTables.h's three tables (languages / country codes / digits), as compiled into yo2DeckUtil.cpp:
//   @yo2 0x00933c10 init-all stub (languages)   (System: 0x933c30) languages init   (System: 0x933f90) its atexit
//   @yo2 0x00933fb0 languages destructor (8)
//   @yo2 0x00933fe0 init-all stub (countries)   (System: 0x934000) countries init   (System: 0x934320) its atexit
//   @yo2 0x00934340 countries destructor (7)
//   @yo2 0x00934370 init-all stub (digits)      (System: 0x934390) digits init      (System: 0x934720) its atexit
// The last part of yo2DeckParts.cpp's copy falls in this address range (the TU boundary is 0x009211a0):
//   (System: 0x920d50) countries atexit   @yo2 0x00920d70 countries destructor (7)
//   @yo2 0x00920da0 init-all stub (digits)   (System: 0x920dc0) digits init   (System: 0x921150) its atexit
//   @yo2 0x00921170 digits destructor (20)
//
// Two empty statics from a shared header (their destructor, 0x004231e0, is a bare ret): a function-local one
// (guard bit 1 of DAT_012d3501) and a namespace-scope one, both registered with atexit.
namespace {
struct EmptyStatic {
    ~EmptyStatic() {}
};
// @yo2 0x00933bc0 guarded local static + atexit
[[maybe_unused]] EmptyStatic& localEmpty() {
    static EmptyStatic s;
    return s;
}
// @yo2 0x00933bf0 atexit of the namespace-scope one
EmptyStatic s_empty;
}   // namespace

// ---------------------------------------------------------------- pure helpers

// @yo2 0x00933590
int32_t structureFrameOfType(uint32_t type) {
    switch (type) {
    case 1: case 6: case 7: case 8: case 9: case 11: return 1;   // effect, toon, spirit, union, gemini, token-effect
    case 2: case 3: return 3;                                     // fusion
    case 4: case 5: return 2;                                     // ritual
    case 13: return 4;                                            // spell
    case 14: return 5;                                            // trap
    default: return 0;                                            // normal, token
    }
}

static bool sjisLead(uint8_t c) { return (c >= 0x81 && c <= 0x9f) || (c >= 0xe0 && c <= 0xfc); }

size_t pathStem(const VcString& path, VcString* out) {
    size_t n = path.size(), slash = 0, dot = 0;
    const char* s = path.c_str();
    for (size_t i = 0; i < n;) {
        uint8_t c = (uint8_t)s[i];
        if (sjisLead(c)) {   // isleadbyte (the C runtime's, code page 932)
            i += 2;
            continue;
        }
        if (c == '.') dot = i;
        else if (c == '/' || c == '\\') slash = i;
        i++;
    }
    if (!slash || !dot) return 0;
    // fix: the exe takes (dot - slash - 1) even when the last dot is before the last slash; clamp to empty
    size_t len = dot > slash ? dot - slash - 1 : 0;
    VcString stem(s + slash + 1, len);
    *out = stem;
    return slash + 1;
}

void structureIconSrc(uint32_t kind, int32_t out[4]) {
    out[0] = kind <= 3 ? 16 + 32 * (int32_t)kind : 16;
    out[1] = 0;
    out[2] = 32;
    out[3] = 16;
}

int32_t inputValueNext(int32_t i) { return (i + 1) & 3; }
int32_t inputValuePrev(int32_t i) { return (i + 3) & 3; }

// ---------------------------------------------------------------- CDeckCardPicture (islands)

// @yo2 0x00921d50
void CDeckCardPicture::construct() {
    vtbl = 0;   // TODO(System) 0x00bef5e0
    sprite = nullptr;
    cardId = 0;
    loaded = shown = 0;
    a = b = 0;
    f18 = 2.0f;
    w = h = 256.0f;
    scale = 1.0f;
}

// @yo2 0x00922190
void CDeckCardPicture::setPos(int32_t px, int32_t py, int32_t pz) {
    if (!sprite) return;
    ElemFields* f = fields(sprite);
    f->x = (float)px, f->y = (float)py, f->z = (float)pz;
}

// @yo2 0x009221c0
void CDeckCardPicture::setColor(float r, float g, float bl, float al) {
    if (!sprite) return;
    float* c = fields(sprite)->color;
    c[0] = r, c[1] = g, c[2] = bl, c[3] = al;
}

// @yo2 0x00922210
void CDeckCardPicture::setSrc(const int32_t rect[4]) {
    if (!sprite) return;
    for (int i = 0; i < 4; i++) fields(sprite)->src[i] = rect[i];
}

// @yo2 0x00922260
void CDeckCardPicture::getSrc(int32_t rect[4]) const {
    if (!sprite) return;
    for (int i = 0; i < 4; i++) rect[i] = fields(sprite)->src[i];
}

// @yo2 0x009222b0
void CDeckCardPicture::setSize(int32_t pw, int32_t ph) {
    if (!sprite) return;
    fields(sprite)->w = pw, fields(sprite)->h = ph;
}

// @yo2 0x009223d0 getSprite (inline in the header)

// ---------------------------------------------------------------- CDeckCardLoader (islands)
// Each forwards to one picture: index checks are the caller's, like the exe's.

// @yo2 0x00922a20
bool CDeckCardLoader::request(int32_t prio, int32_t i) {
    CDeckCardPicture& p = pic[i];
    if (!p.loaded) {
        cardPictureLoad(&p, this, prio);
        p.loaded = 1;
    } else if (p.shown) {
        return false;
    }
    cardPictureShow(&p, true);
    return true;
}

// @yo2 0x00922ab0
void CDeckCardLoader::release(int32_t i) {
    if (pic[i].loaded && pic[i].shown) cardPictureShow(&pic[i], false);
}

// @yo2 0x00922af0
void CDeckCardLoader::hideAll() {
    for (CDeckCardPicture& p : pic) cardPictureShow(&p, false);
}

// @yo2 0x00922b20
void CDeckCardLoader::setPos(int32_t x, int32_t y, int32_t z, int32_t i) { pic[i].setPos(x, y, z); }
// @yo2 0x00922b60
void CDeckCardLoader::setColor(float r, float g, float b, float a, int32_t i) { pic[i].setColor(r, g, b, a); }
// @yo2 0x00922ba0
void CDeckCardLoader::setSrc(const int32_t rect[4], int32_t i) { pic[i].setSrc(rect); }
// @yo2 0x00922bf0
void CDeckCardLoader::getSrc(int32_t rect[4], int32_t i) const { pic[i].getSrc(rect); }
// @yo2 0x00922c20
void CDeckCardLoader::setSize(int32_t w, int32_t h, int32_t i) { pic[i].setSize(w, h); }
// @yo2 0x00922c50
void CDeckCardLoader::setBlend(int32_t mode, int32_t i) { cardPictureSetBlend(&pic[i], mode); }
// @yo2 0x00922c80
void CDeckCardLoader::setScale(int32_t a, int32_t b, int32_t c, int32_t i) { cardPictureSetScale(&pic[i], a, b, c); }

// ---------------------------------------------------------------- CWindowModelInputValue
// (its constructor, destructor and the 0x009232c0 click handler are System-labelled; the builder is in
// DeckUtilBuild.cpp)

// @yo2 0x00927330
void CWindowModelInputValue::setSize(float w, float h) {
    mw = w;
    mh = h;
    layout();
}

// @yo2 0x00927360 vf 9: follow the model's position, then the frame at full opacity
void CWindowModelInputValue::layout() {
    ElemFields* f = fields(this);
    f->x = mx;
    f->y = my;
    f->z = mz;
    modelIsTop(this);   // its result is unused in the exe
    ctlSetAlpha(frame.get(), 1.0f);
}

// @yo2 0x009273b0
void CWindowModelInputValue::refreshList() {
    listboxRefresh(list.get());
    layout();
}

// @yo2 0x009273e0
void CWindowModelInputValue::addRow(const uint16_t* text) {
    listboxAdd(list.get(), text);
    layout();
}

// @yo2 0x00927420
void CWindowModelInputValue::setEnabled(bool on) {
    ctlSetEnabled(frame.get(), on);
    ctlSetEnabled(text1.get(), on);
    ctlSetEnabled(text2.get(), on);
    ctlSetEnabled(input[0].get(), on);
    ctlSetEnabled(input[1].get(), on);
    ctlSetEnabled(sw[0].get(), on);
    ctlSetEnabled(sw[1].get(), on);
    listboxSetEnabled(list.get(), on);
}

void* CWindowModelInputValue::tabTarget(int32_t i) const {
    switch (i) {
    case 0: return input[0].task;
    case 1: return input[1].task;
    case 2: return sw[0].task;
    default: return sw[1].task;
    }
}

static int32_t tabIndex(const CWindowModelInputValue* m, const void* colleague) {
    for (int32_t i = 0; i < 4; i++)
        if (colleague == colleagueOf(m->tabTarget(i))) return i;
    return -1;
}

// @yo2 0x009274f0 mediator slot 2 (Tab): input 1 -> input 2 -> switch 1 -> switch 2 -> input 1
void CWindowModelInputValue::focusNext(const void* colleague) {
    int32_t i = tabIndex(this, colleague);
    if (i >= 0) focusSet(tabTarget(inputValueNext(i)));
}

// @yo2 0x00927650 mediator slot 3 (Shift+Tab)
void CWindowModelInputValue::focusPrev(const void* colleague) {
    int32_t i = tabIndex(this, colleague);
    if (i >= 0) focusSet(tabTarget(inputValuePrev(i)));
}

// ---------------------------------------------------------------- CWindowTaskStructureIcon

// @yo2 0x009277e0
CWindowTaskStructureIcon* structureIconNew(void* parent, void* mediator) {
    auto* p = static_cast<CWindowTaskStructureIcon*>(::operator new(sizeof(CWindowTaskStructureIcon)));
    p->construct();
    p->mediator = mediator;
    return static_cast<CWindowTaskStructureIcon*>(taskCreate(p, parent, 10000));
}

// @yo2 0x009278a0
void CWindowTaskStructureIcon::construct() {
    ctlBaseInit(this);
    new (&icon) TaskPtr<CSpriteElm>();
    new (&badge) TaskPtr<CSpriteElm>();
    icon.setUser(this);
    badge.setUser(this);
    x1 = y1 = w1 = h1 = x2 = y2 = w2 = h2 = z = 0;
    alpha = 1.0f;
    kind = 0;
    ready = 0;
    enabled = 1;
    isNew = 0;
    taskSetTaskName(this, "CWindowTaskStructureIcon");
}

// @yo2 0x00927ac0 deleting destructor (destruct + operator delete): no body of its own
// @yo2 0x00927af0
void CWindowTaskStructureIcon::destruct() {
    badge.~TaskPtr();
    icon.~TaskPtr();
    ctlBaseDestroy(this);
}

// @yo2 0x00927aa0 typeId (inline in the header)
// @yo2 0x00927c10 onMain (inline)
// @yo2 0x00928db0 hitTest (inline)
// @yo2 0x00928dd0 onInput (inline)

// @yo2 0x00927b70 vf 4
bool CWindowTaskStructureIcon::init() {
    x1 = y1 = z = x2 = y2 = 0;
    kind = 0;
    ready = 0;
    isNew = 0;
    w1 = w2 = 32.0f;
    h1 = h2 = 16.0f;
    alpha = 1.0f;
    enabled = 1;
    fields(this)->dirty = 1;
    place();
    return true;
}

// @yo2 0x00927c30 vf 13
void CWindowTaskStructureIcon::place() {
    if (icon.task) {
        ElemFields* f = fields(icon.get());
        f->x = x1, f->y = y1, f->z = z;
    }
    if (badge.task) {
        ElemFields* f = fields(badge.get());
        f->x = x2, f->y = y2, f->z = z;
    }
}

static CSpriteElm* iconSprite(CWindowTaskStructureIcon* self, TaskPtr<CSpriteElm>& p, const VcString& path,
                              const char* name, const int32_t src[4], const char* failed) {
    p.set(spriteCreate(self, 10000, path));
    DK_ASSERT(p.task, failed);
    CSpriteElm* s = p.get();
    taskSetInstName(s, name);
    ElemFields* f = fields(s);
    f->color[3] = self->alpha;
    for (int i = 0; i < 4; i++) f->src[i] = src[i];
    elemSetBlend(s, 2);
    f->dirty = 1;
    return s;
}

// @yo2 0x00927d40 the icon (its kind's 32x16 cell) and the 16x16 "new" badge, both from icon_deck_01.png
void CWindowTaskStructureIcon::create(uint32_t k) {
    kind = k;
    VcString path("data/deck/icon_deck_01.png");
    int32_t src[4];
    structureIconSrc(kind, src);
    iconSprite(this, icon, path, "picIcon", src, "Icon create failed");
    static const int32_t badgeSrc[4] = {0, 0, 16, 16};
    iconSprite(this, badge, path, "picNewIcon", badgeSrc, "NewIcon create failed");
}

// @yo2 0x00928c60
void CWindowTaskStructureIcon::destroySprites() {
    fields(icon.get())->dirty = 0;
    taskDestroy(icon.get());
    fields(badge.get())->dirty = 0;
    taskDestroy(badge.get());
}

// @yo2 0x00928ce0 the badge follows isNew (hidden ones also skip hit tests)
void CWindowTaskStructureIcon::setNew(bool on) {
    isNew = on;
    CSpriteElm* s = badge.get();
    if (on) {
        fields(s)->taskFlags &= ~TF_NOHIT;
        elemShow(s, isNew, true);
    } else {
        elemShow(s, false, true);
        fields(s)->taskFlags |= TF_NOHIT;
    }
}

// @yo2 0x00928d70 vf 19
void CWindowTaskStructureIcon::onClick() { mediatorSelect(mediator, base + 0x340); }

// @yo2 0x009322b0
void CWindowTaskStructureIcon::setBadgeSize(float w, float h) {
    w2 = w, h2 = h;
    place();
}

// @yo2 0x009322e0
void CWindowTaskStructureIcon::setZ(float v) {
    z = v;
    place();
}

// @yo2 0x00928df0 (island) incremental-link stub that jumps to CWindowTaskControll's 0x005dec20 (inherited slot)

// ---------------------------------------------------------------- CWindowModelFileList

// @yo2 0x00928e10
CWindowModelFileList* fileListNew(void* parent, float x, float y, int32_t mode) {
    auto* p = static_cast<CWindowModelFileList*>(::operator new(sizeof(CWindowModelFileList)));
    p->construct();
    p->setup(parent, x, y, mode);
    return static_cast<CWindowModelFileList*>(taskCreate(p, parent, 10000));
}

// @yo2 0x00928ef0 position and size per mode: 696 wide; 144 high (decks, other) or 296 (packs)
void CWindowModelFileList::setup(void*, float x, float y, int32_t m) {
    mx = x;
    mode = m;
    my = y;
    mw = 696.0f;
    if (m == FILELIST_PACKS) mh = 296.0f;
    else if (m == FILELIST_DECKS || m == FILELIST_OTHER) mh = 144.0f;
}

// @yo2 0x00928f60
void CWindowModelFileList::construct() {
    modelBaseInit(this);
    new (&frame) TaskPtr<CWindowTaskFrameBottomThick>();
    new (&list) TaskPtr<CWindowTaskListbox>();
    for (auto& d : deco) new (&d) TaskPtr<CSpriteElm>();
    new (&field) TaskPtr<CWindowTaskTextField>();
    for (auto& s : sw) new (&s) TaskPtr<CWindowTaskTextSwitch>();
    new (&title) TaskPtr<CWindowTaskText>();
    frame.setUser(this);
    list.setUser(this);
    for (auto& d : deco) d.setUser(this);
    field.setUser(this);
    for (auto& s : sw) s.setUser(this);
    title.setUser(this);
    new (&icons) VcVector<CWindowTaskStructureIcon*>();
    sel1 = sel2 = -1;
    new (&s4e8) VcWString();
    new (&s4f8) VcWString();
    new (&v508) VcVector<uint32_t>();
    new (&s518) VcWString();
    fade = 0.8f;
    mode = FILELIST_DECKS;
}

// @yo2 0x009296b0 deleting destructor (destruct + operator delete): no body of its own
// @yo2 0x009296e0
void CWindowModelFileList::destruct() {
    s518.~VcWString();
    v508.~VcVector();
    s4f8.~VcWString();
    s4e8.~VcWString();
    vectorFreeIcons(&icons);   // the icons are tasks: the tree frees them, only the array goes
    title.~TaskPtr();
    for (int i = 3; i >= 0; i--) sw[i].~TaskPtr();
    field.~TaskPtr();
    for (int i = 17; i >= 0; i--) deco[i].~TaskPtr();
    list.~TaskPtr();
    frame.~TaskPtr();
    modelBaseDestroy(this);
}

// @yo2 0x00929550 onMain (inline)

// @yo2 0x00929570 vf 21
void CWindowModelFileList::moveTo(float x, float y) {
    mx = x, my = y;
    fields(this)->x = x;
    fields(this)->y = y;
    place();
}

// @yo2 0x00929600 vf 8
void CWindowModelFileList::relayout() { place(); }

// @yo2 0x00929620 vf 10: the depth its children draw at
int32_t CWindowModelFileList::heightPlus6() const { return (int32_t)(mz + 6.0f); }

// @yo2 0x00929650 mediator slot 1
void CWindowModelFileList::onColleague1(void*) { modelOnClose(this); }
// @yo2 0x00929670 onColleague2 (inline, empty)
// @yo2 0x00929690 onColleague3 (inline, empty)

// @yo2 0x00932340 vf 9
void CWindowModelFileList::place() {
    ElemFields* f = fields(this);
    f->x = mx, f->y = my, f->z = mz;
}

// @yo2 0x00932370
void CWindowModelFileList::addRow(const uint16_t* text) {
    listboxAdd(list.get(), text);
    place();
}

// @yo2 0x009323b0
void CWindowModelFileList::removeRow(int32_t row) {
    listboxRemove(list.get(), row);
    place();
}

// @yo2 0x009323f0
void CWindowModelFileList::clearRows() {
    listboxClear(list.get());
    place();
}

// @yo2 0x00932420
int32_t CWindowModelFileList::rowCount() { return listboxCount(list.get()); }

// @yo2 0x00932450
void CWindowModelFileList::refreshList() {
    listboxRefresh(list.get());
    place();
}

namespace {
struct DeckFileCtx {
    CWindowModelFileList* self;
};
void addDeckFile(void* c, const char* name) {
    auto* ctx = static_cast<DeckFileCtx*>(c);
    VcString path(name), stem;
    pathStem(path, &stem);
    if (!fileStat(name)) return;
    uint16_t w[0x100] = {};
    mbToWide(stem.c_str(), w, 0x100);
    w[0xff] = 0;   // fix: mbstowcs doesn't terminate a full buffer
    ctx->self->addRow(w);
}
}   // namespace

// @yo2 0x00932480 one row per <deck dir>\*.ydc, named by its stem
void CWindowModelFileList::listDeckFiles() {
    VcString pattern(deckDir());
    pattern += "*";
    pattern += ".ydc";
    DeckFileCtx ctx{this};
    dirForEach(pattern.c_str(), addDeckFile, &ctx);
}

// @yo2 0x00932890 (the string member function; the scan itself is pathStem)
size_t deckFileStem(VcString* s) { return pathStem(VcString(*s), s); }

// @yo2 0x00932a50 the pack list: in pack mode each row gets an indent code and a structure icon whose kind says
// booster/structure deck and whether its image is in data\cardpack; rows start at y 40, 16 apart, 8 visible.
void CWindowModelFileList::fillPacks(const PackCatalogue* cat) {
    fileMgrSetDir("data\\cardpack");
    int32_t y = 0x28;
    for (size_t i = 0; i < cat->packs.size(); i++, y += 0x10) {
        const PackEntry& e = cat->packs[i];
        VcString text;
        if (mode == FILELIST_PACKS) {
            text = "@>64/";   // listbox control code: indent the text past the icon
            text += e.copyName();
            CWindowTaskStructureIcon* ic = structureIconNew(this, &mediatorVtbl);
            uint32_t kind = 0;
            if (e.type == 1) kind = fileMgrExists(cat->packs[i].image) ? 1 : 0;
            else if (e.type == 4) kind = fileMgrExists(cat->packs[i].image) ? 3 : 2;
            ic->create(kind);
            ic->x1 = 24.0f;
            ic->y1 = (float)y;
            ic->place();
            ic->z = 31.0f;
            ic->place();
            ic->x2 = 8.0f;
            ic->y2 = (float)y;
            ic->place();
            if (y < 0xa8) {
                fields(ic)->taskFlags &= ~TF_NOHIT;
                elemShow(ic, true, true);
            } else {
                elemShow(ic, false, true);
                fields(ic)->taskFlags |= TF_NOHIT;
            }
            ic->setNew(packIsNew(cat, e.id));
            vectorInsertIcons(&icons, icons.size(), 1, ic);
        } else {
            text = e.copyName();
        }
        uint16_t w[0x100] = {};
        mbToWide(text.c_str(), w, 0x100);
        w[0xff] = 0;   // fix: as above
        addRow(w);
    }
}

// @yo2 0x00932f90 PackEntry::copyName (inline in the header)

// @yo2 0x00933110 show the 8 icons of the rows in view, hide the rest
void CWindowModelFileList::layoutIcons() {
    int32_t top = listboxScrollTop(list.get());
    int32_t y = 0x28;
    for (size_t r = 0; r < icons.size(); r++) {
        CWindowTaskStructureIcon* ic = icons[r];
        if (!fileRowVisible((int32_t)r, top)) {
            elemShow(ic, false, true);
            fields(ic)->taskFlags |= TF_NOHIT;
            continue;
        }
        fields(ic)->taskFlags &= ~TF_NOHIT;
        elemShow(ic, true, true);
        ic->x1 = 24.0f;
        ic->y1 = (float)y;
        ic->place();
        ic->x2 = 8.0f;
        ic->y2 = (float)y;
        ic->place();
        y += 0x10;
    }
}

// @yo2 0x00933240
void CWindowModelFileList::setFieldText(const char* s) {
    uint16_t w[0x400] = {};
    mbToWide(s, w, 0x400);
    w[0x3ff] = 0;   // fix: as above
    textFieldSetText(field.get(), w);
}

// @yo2 0x009332b0
void CWindowModelFileList::setEnabled(bool on) {
    ctlSetEnabled(frame.get(), on);
    listboxSetEnabled(list.get(), on);
    for (auto& s : sw) ctlSetEnabled(s.get(), on);
}

// @yo2 0x00933350
void CWindowModelFileList::setListAlpha(float a) { ctlSetAlpha(list.get(), a); }

// @yo2 0x00933380 mediator slot 0: a pick in the list (pack mode tells the owner, deck mode re-lays the icons) or
// one of the four switches (text ids 4041 / 4007 / 4002 / 4003)
void CWindowModelFileList::onColleague(const void* sender) {
    modelOnClose(this);
    if (!owner) return;
    if (sender == colleagueOf(list.task)) {
        CWindowTaskListbox* lb = list.get();
        if (listboxMode(lb) == 1) mediatorNotify(owner, this, 5, listboxCursor(lb));
        else if (listboxMode(lb) == 2) layoutIcons();
    }
    static const int32_t ids[4] = {0xfc9, 0xfa7, 0xfa2, 0xfa3};
    for (int i = 0; i < 4; i++)
        if (sender == colleagueOf(sw[i].task)) {
            mediatorNotify(owner, this, 0, ids[i]);
            return;
        }
}

// ---------------------------------------------------------------- inlined helpers of other classes

// @yo2 0x00932230 taskAddFlags (inline in the header)

// @yo2 0x00932250
void modelSetZ(void* model, float z) {
    memcpy(static_cast<uint8_t*>(model) + 0x37c, &z, 4);
    fields(model)->z = z;
}

// @yo2 0x00932280
void modelSetPos2(void* model, float x, float y) {
    memcpy(static_cast<uint8_t*>(model) + 0x390, &x, 4);
    memcpy(static_cast<uint8_t*>(model) + 0x394, &y, 4);
    fields(model)->x = x, fields(model)->y = y;
}

// @yo2 0x00932310
void textSetFromTask(TaskPtr<CWindowTaskText>* p, int32_t v) { textSetAlign(p->get(), v); }

// @yo2 0x00933630
bool textPtrEmpty(const TaskPtr<CWindowTaskText>* p) { return p->task == nullptr; }

// @yo2 0x00933660
bool textFieldPtrEmpty(const TaskPtr<CWindowTaskTextField>* p) { return p->task == nullptr; }

// @yo2 0x009338c0
void vectorFreeIcons(VcVector<CWindowTaskStructureIcon*>* v) { v->clear(); }

// @yo2 0x00933900 destroy a range of icon pointers: nothing to do

// @yo2 0x00933920 vector<CWindowTaskStructureIcon*>::insert(pos, n, val)
void vectorInsertIcons(VcVector<CWindowTaskStructureIcon*>* v, size_t pos, size_t n,
                       CWindowTaskStructureIcon* const& val) {
    CWindowTaskStructureIcon* x = val;   // val may live in the vector
    size_t old = v->size();
    if (pos > old) pos = old;   // fix: the exe trusts the iterator
    for (size_t i = 0; i < n; i++) v->push_back(x);
    for (size_t i = old; i-- > pos;) (*v)[i + n] = (*v)[i];
    for (size_t i = 0; i < n; i++) (*v)[pos + i] = x;
}

}   // namespace dk
