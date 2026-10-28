#include "yo2ChangeAvatar.h"

#include <cstdio>
#include <cstring>
#include <string>

#include "Game/yo2PlayerBin.h"
#include "System/yo2Debug.h"
#include "changeAvatarExt.h"

struct CWindowDialogAvatarSwitch::Layout {
    YO2_AT(CWindowDialogAvatarSwitch, categories_, 0x400);
    YO2_AT(CWindowDialogAvatarSwitch, categoryTexts_, 0x49c);
    YO2_AT(CWindowDialogAvatarSwitch, items_, 0x538);
    YO2_AT(CWindowDialogAvatarSwitch, itemTexts_, 0x5e0);
    YO2_AT(CWindowDialogAvatarSwitch, buttons_, 0x688);
    YO2_AT(CWindowDialogAvatarSwitch, buttonTexts_, 0x6a0);
    YO2_AT(CWindowDialogAvatarSwitch, next_, 0x6b8);
    YO2_AT(CWindowDialogAvatarSwitch, prev_, 0x6c4);
    YO2_AT(CWindowDialogAvatarSwitch, frameLine_, 0x6d0);
    YO2_AT(CWindowDialogAvatarSwitch, linkLine_, 0x6dc);
    YO2_AT(CWindowDialogAvatarSwitch, category_, 0x6e8);
    YO2_AT(CWindowDialogAvatarSwitch, value_, 0x6ec);
    YO2_AT(CWindowDialogAvatarSwitch, itemValues_, 0x6f0);
    YO2_AT(CWindowDialogAvatarSwitch, page_, 0x728);
    YO2_AT(CWindowDialogAvatarSwitch, pageCount_, 0x72c);
    YO2_AT(CWindowDialogAvatarSwitch, waDict_, 0x730);
    YO2_AT(CWindowDialogAvatarSwitch, avatar_, 0x734);
    YO2_AT(CWindowDialogAvatarSwitch, bin_, 0x748);
    YO2_AT(CWindowDialogAvatarSwitch, world_, 0x9d0);
};
struct CChangeAvatarPack::Layout {
    YO2_AT(CChangeAvatarPack, layer_, 0x70);
    YO2_AT(CChangeAvatarPack, base_, 0x74);
    YO2_AT(CChangeAvatarPack, state_, 0x80);
    YO2_AT(CChangeAvatarPack, unk88_, 0x88);
    YO2_AT(CChangeAvatarPack, avatars_, 0x8c);
    YO2_AT(CChangeAvatarPack, bin_, 0xb4);
    YO2_AT(CChangeAvatarPack, waistUpArg_, 0x33c);
    YO2_AT(CChangeAvatarPack, waistUp_, 0x340);
    YO2_AT(CChangeAvatarPack, window_, 0x34c);
    YO2_AT(CChangeAvatarPack, world_, 0x358);
};

namespace {
constexpr uint32_t LOCK_HIDDEN = 2;   // CTask lock bit: no TM_MAIN while hidden
constexpr float Z_LINE = 1011, Z_BUTTON = 1012, Z_TEXT = 1013, Z_ARROW = 1014;
constexpr char kDir[] = "data/Scene/AvatarChange/";

// The categories, top to bottom: the button's y, its picture (abmake_btn_01_c0<look>.png), its label, and the
// avatar byte (= CWaistUpAvatar part slot) its items set.
struct Category {
    int32_t y, look, text, slot;
};
constexpr Category kCategories[CWindowDialogAvatarSwitch::CATEGORIES] = {
    {63, 1, 0xca6, CAvatarData::SEX},         {108, 1, 0xc82, 14 /* hair colour */},
    {153, 1, 0xc97, CAvatarData::FRONT_HAIR}, {198, 1, 0xca5, CAvatarData::BACK_HAIR},
    {243, 2, 0xc83, 15 /* eye colour */},     {288, 2, 0xc9f, CAvatarData::EYES},
    {333, 2, 0xc9e, CAvatarData::NOSE},       {378, 2, 0xca0, CAvatarData::MOUTH},
    {423, 3, 0xc81, 13 /* skin */},           {468, 4, 0xca3, CAvatarData::CLOTHES},
    {513, 4, 0xc99, CAvatarData::ACCESSORY},  {558, 4, 0xc9a, CAvatarData::ACCESSORY2},
    {603, 4, 0xcad, CAvatarData::DUEL_DISK},
};
// What a category's item page lists: fixed texts, a numbered text, or the PBINs the player owns for the slot
// (PBIN numbers from + 256 * sex up to the dictionary's count; some lists depend on the world).
enum ListKind { FIXED, NUMBERED, PBIN };
struct ItemList {
    ListKind kind;
    int32_t count;          // FIXED / NUMBERED
    int32_t texts[7];       // FIXED (NUMBERED: texts[0] + the number)
    int32_t from, waSlot;   // PBIN
    bool perWorld;          // PBIN: the dictionary count is asked for the window's world
};
constexpr int32_t kColours[7] = {0xcb2, 0xcb3, 0xcb4, 0xcb5, 0xcb6, 0xcb7, 0xcb8};
constexpr ItemList kLists[CWindowDialogAvatarSwitch::CATEGORIES] = {
    {FIXED, 2, {0xca7, 0xca8}, 0, 0, false},
    {FIXED, 7, {kColours[0], kColours[1], kColours[2], kColours[3], kColours[4], kColours[5], kColours[6]}, 0, 0,
     false},
    {PBIN, 0, {}, 0x00, 0xb, false},
    {PBIN, 0, {}, 0x90, 0, false},
    {FIXED, 7, {kColours[0], kColours[1], kColours[2], kColours[3], kColours[4], kColours[5], kColours[6]}, 0, 0,
     false},
    {PBIN, 0, {}, 0x40, 5, false},
    {PBIN, 0, {}, 0x30, 6, false},
    {PBIN, 0, {}, 0x60, 4, false},
    {NUMBERED, 3, {0xc81}, 0, 0, false},
    {PBIN, 0, {}, 0x70, 10, true},
    {PBIN, 0, {}, 0x20, 8, false},
    {PBIN, 0, {}, 0x50, 9, false},
    {PBIN, 0, {}, 0xb0, 0xc, true},
};
constexpr int32_t CATEGORY_CLOTHES = 9, CATEGORY_GLASSES = 11;

// CTask::lockFlags_ is protected; the exe ORs the bit in directly (+0x20).
struct TaskLockAccess : CTask {
    static void lock(CTask* t, uint32_t mask) { t->*(&TaskLockAccess::lockFlags_) |= mask; }
};
void hideControl(CElement* c) {
    c->setDisp(false, true);
    TaskLockAccess::lock(c, LOCK_HIDDEN);
}
void showControl(CElement* c) {
    windowClearLock(c, LOCK_HIDDEN);
    c->setDisp(true, true);
}

CWindowTaskControll* makeSwitch(CWindowDialogAvatarSwitch* w, CTaskPtr<CWindowTaskControll>& to, const char* name) {
    to.setUser(w);
    to.set(pictureSwitchCreate(w, w, w));
    YO2_ASSERT(to.task() != nullptr, "CWindowTaskPictureSwitch NULL error");
    to.get()->setInstName(name);
    return to.get();
}
// One picture of four looks side by side, each w x h (the last two the same).
void setLooks(CWindowTaskControll* s, const char* file, int32_t w, int32_t h) {
    vc6::string path = kDir;
    path += file;
    const PictureRect looks[4] = {{0, 0, w, h}, {w, 0, w, h}, {2 * w, 0, w, h}, {2 * w, 0, w, h}};
    pictureSwitchSetImage(s, path.c_str(), looks);
}
void placeSwitch(CWindowTaskControll* s, int32_t id, float x, float y) {
    s->unk364_ = static_cast<uint32_t>(id);
    s->z_ = s->pos_.z = Z_BUTTON;
    pictureSwitchSetPos(s, x, y);
}
CWindowTaskText* makeText(CWindowDialogAvatarSwitch* w, CTaskPtr<CWindowTaskText>& to) {
    to.setUser(w);
    to.set(CWindowTaskText::create(w, w));
    return to.get();
}
// A one-line centred label w x h, in front of the buttons; text is either a string table id or a text.
void placeLabel(CWindowTaskText* t, float x, float y, int32_t fontSize, int32_t w, int32_t h, int32_t textId,
                const WChar* text = nullptr) {
    t->setPos(x, y);
    t->setFontSize(fontSize);
    if (text)
        t->setText(text);
    else
        t->setTextId(textId);
    t->posZ_ = t->pos_.z = Z_TEXT;
    t->setAlign(CWindowTaskText::CENTRE);
    t->setArea(w, h);
    t->setPageLines(1);
}
CElement* makeLine(CWindowDialogAvatarSwitch* w, CTaskPtr<CSpriteElm>& to, const char* file, const char* name,
                   float x, float y) {
    to.setUser(w);
    vc6::string path = kDir;
    path += file;
    windowSpriteCreate(to, w, 0, path);
    YO2_ASSERT(to.task() != nullptr, "CSpriteElm NULL error");
    CElement* e = windowElement(to);
    e->setInstName(name);
    e->setDrawMode(CElement::BLEND);
    e->pos_ = Vec3{x, y, Z_LINE};
    return e;
}
}  // namespace

// ---------------------------------------------------------------------------------------- CWindowDialogAvatarSwitch

// @yo2 0x008a88f0 CWindowDialogAvatarSwitch::New (the constructor is inlined into it): the avatar to dress, the
// player's PBIN bits (only the bits are copied: 0x00ad68a0), the world, then into the tree
CWindowDialogAvatarSwitch* CWindowDialogAvatarSwitch::create(CTask* parent, const CAvatarData* avatar,
                                                             const CPlayerBinData* bin, int32_t world, float x,
                                                             float y) {
    auto* w = new CWindowDialogAvatarSwitch;
    w->x_ = x;
    w->y_ = y;
    YO2_ASSERT(bin != nullptr, "PBinData EMPTY!");
    w->avatar_.set(avatar->bytes_);
    std::memcpy(w->bin_.pbin, bin->pbin, sizeof w->bin_.pbin);
    w->world_ = world;
    return dynamic_cast<CWindowDialogAvatarSwitch*>(w->CTask::create(parent, 10000));
}

CWindowDialogAvatarSwitch::CWindowDialogAvatarSwitch() = default;

// @yo2 0x008a8d20 CWindowDialogAvatarSwitch::~CWindowDialogAvatarSwitch
// @yo2 0x008a8cf0 CWindowDialogAvatarSwitch deleting destructor
CWindowDialogAvatarSwitch::~CWindowDialogAvatarSwitch() = default;

// @yo2 0x008a8fd0 CWindowDialogAvatarSwitch::onInit: 336 x 550 (its frame hidden); the category buttons with their
// labels, a page of hidden item buttons, the page arrows, the two lines, OK / Back (Back only in the world), all at
// fixed screen positions
bool CWindowDialogAvatarSwitch::onInit() {
    CWindowTaskModel::onInit();
    callback_ = nullptr;
    w_ = 336;
    h_ = 550;
    category_ = value_ = -1;
    page_ = pageCount_ = 0;
    frame_ = CWindowTaskFrameBottomThick::create(this, this, 1);
    frame_->setVisible(false);
    textField_ = CWindowTaskTextField::create(this, this);
    YO2_ASSERT(textField_ != nullptr, "CWindowTaskTextField NULL error");
    textField_->setInstName("テキスト名前部分");
    hideControl(textField_);
    waDict_ = gameWorldWaDictionary();

    static const char* const kLooks[] = {"abmake_btn_01_c01.png", "abmake_btn_01_c02.png", "abmake_btn_01_c03.png",
                                         "abmake_btn_01_c04.png"};
    for (int32_t i = 0; i < CATEGORIES; i++) {
        const Category& c = kCategories[i];
        CWindowTaskControll* s = makeSwitch(this, categories_[i], "アバター変更スイッチ");
        s->inheritTransform_ = true;
        YO2_ASSERT(c.look >= 1 && c.look <= 4, "FileName Error.");
        setLooks(s, kLooks[c.look - 1], 324, 44);
        placeSwitch(s, i, 350, static_cast<float>(c.y));
        placeLabel(makeText(this, categoryTexts_[i]), 358, static_cast<float>(c.y + 6), 32, 308, 32, c.text);
    }
    for (int32_t i = 0; i < ITEMS; i++) {
        CWindowTaskControll* s = makeSwitch(this, items_[i], "サブボタン（アイテムボタン）");
        setLooks(s, "abmake_btn_02_01.png", 254, 34);
        placeSwitch(s, i + RESULT_ITEM, 722, static_cast<float>(i * 40 + 89));
        hideControl(s);
        CWindowTaskText* t = makeText(this, itemTexts_[i]);
        placeLabel(t, 730, static_cast<float>(i * 40 + 94), 24, 238, 24, 0, u"????????");
        hideControl(t);
    }

    next_.setUser(this);
    next_.set(pictureSwitchCreate(this, this, this));
    next_.get()->setInstName("もどるボタン");
    pictureSwitchSetImages(next_.get(), "data/shop/shop_arrow_04_c01.png", "data/shop/shop_arrow_05_c01.png",
                           "data/shop/shop_arrow_06_c01.png", "data/shop/shop_arrow_06_c01.png");
    next_.get()->pos_ = Vec3{982, 332, Z_ARROW};
    next_.get()->setDisp(false, true);
    prev_.setUser(this);
    prev_.set(pictureSwitchCreate(this, this, this));
    windowNameTask(prev_.task(), "もどるボタン");
    pictureSwitchSetImages(prev_.get(), "data/shop/shop_arrow_10_c01.png", "data/shop/shop_arrow_11_c01.png",
                           "data/shop/shop_arrow_12_c01.png", "data/shop/shop_arrow_12_c01.png");
    prev_.get()->pos_ = Vec3{688, 326, Z_ARROW};
    prev_.get()->setDisp(false, true);

    makeLine(this, frameLine_, "abmake_win_01.png", "囲み線", 703, 60);
    makeLine(this, linkLine_, "abmake_line_01.png", "つなぎの線", 672, 69);

    const struct { float x; int32_t text; } kButtons[2] = {{684, 0xfae}, {852, 0xfa5}};
    for (int32_t i = 0; i < 2; i++) {
        CWindowTaskControll* s = makeSwitch(this, buttons_[i], "決定/戻るボタン");
        setLooks(s, "abmake_btn_03_01.png", 162, 42);
        placeSwitch(s, i, kButtons[i].x, 683);
        placeLabel(makeText(this, buttonTexts_[i]), kButtons[i].x, 692, 24, 146, 24, kButtons[i].text);
    }
    if (gameWorldState() != 1) {   // the first dressing (from the character select) can't be given up
        hideControl(buttons_[1].get());
        hideControl(buttonTexts_[1].get());
    }

    setBandHeight(500);
    useOwnCallback();
    layout();
    modal_ = true;
    return true;
}

// @yo2 0x008a8ca0 CWindowDialogAvatarSwitch::setBandHeight
void CWindowDialogAvatarSwitch::setBandHeight(float h) {
    bandH_ = h;
    layout();
}

// @yo2 0x008a8cd0 CWindowDialogAvatarSwitch::applyZ (layout puts z_ into pos_.z)
void CWindowDialogAvatarSwitch::applyZ() { layout(); }

// @yo2 0x008ade90 CWindowDialogAvatarSwitch::layout: the frame and the (hidden) text field to the window's size;
// both fully opaque while the window is in front, 80% behind
void CWindowDialogAvatarSwitch::layout() {
    pos_ = Vec3{x_, y_, z_};
    CWindowTaskFrameBottomThick* f = frame_;
    f->x_ = f->y_ = 0;
    f->pos_.x = f->pos_.y = 0;
    f->w_ = w_;
    f->h_ = h_;
    f->layout();
    f->bottomH_ = bandH_;
    f->layout();
    f->z_ = 0;
    f->pos_.z = 0;
    CWindowTaskTextField* t = textField_;
    t->x_ = t->y_ = 8;
    t->pos_.x = t->pos_.y = 8;
    t->w_ = w_ - 16.0f;
    t->h_ = (h_ - 16.0f) - bandH_;
    t->layout();
    t->posZ_ = 1;
    t->layout();
    const float alpha = isTop() ? 1.0f : 0.8f;
    t->back_.get()->setColor(1, 1, 1, alpha);
    frame_->setAlpha(alpha);
}

// @yo2 0x008ada50 CWindowDialogAvatarSwitch::onControlEvent: the arrows turn the page; a category shows its items
// (the link line moves to it); an item becomes the chosen value; each press goes to the callback (see Result)
void CWindowDialogAvatarSwitch::onControlEvent(CWindowTaskControll* sender) {
    bringToFront();
    if (!callback_)
        return;
    if (sender == next_.task()) {
        if (page_ < pageCount_) {
            page_++;
            refresh();
        }
        return;
    }
    if (sender == prev_.task()) {
        if (page_ != 0) {
            page_--;
            refresh();
        }
        return;
    }
    for (int32_t i = 0; i < CATEGORIES; i++) {
        if (sender != categories_[i].task())
            continue;
        soundPlay(SE_CHECK, 0);
        if (category_ != i) {
            page_ = 0;
            CWindowTaskControll* s = categories_[i].get();
            const float y = pictureSwitchY(s), h = pictureSwitchHeight(s);
            CElement* link = windowElement(linkLine_);
            link->pos_ = Vec3{link->pos_.x, h * 0.5f + y - 16.0f, z_};
            pictureSwitchSetSelected(s, true);
            if (category_ != -1)
                pictureSwitchSetSelected(categories_[category_].get(), false);
            category_ = i;
            value_ = -1;
            for (auto& item : items_)
                pictureSwitchSetSelected(item.get(), false);
            refresh();
        }
        callback_->call(this, CALLBACK_MESSAGE_TYPE(0), i);
    }
    for (int32_t i = 0; i < ITEMS; i++) {
        if (sender != items_[i].task())
            continue;
        for (auto& item : items_)
            pictureSwitchSetSelected(item.get(), false);
        value_ = itemValues_[i];
        soundPlay(SE_ENTER, 0);
        pictureSwitchSetSelected(items_[i].get(), true);
        callback_->call(this, CALLBACK_MESSAGE_TYPE(0), i + RESULT_ITEM);
    }
    for (int32_t i = 0; i < 2; i++) {
        if (sender != buttons_[i].task())
            continue;
        soundPlay(i == 1 ? SE_BACK : SE_ENTER, 0);
        callback_->call(this, CALLBACK_MESSAGE_TYPE(0), i + RESULT_OK);
    }
}

// @yo2 0x008ae060 CWindowDialogAvatarSwitch::refresh: the item page of the chosen category. Every item and both
// arrows hidden, then the category's choices shown with their texts and the avatar's current one lit. PBIN lists
// are 14 to a page; the glasses list starts with "none", and in the GX world the dorm uniforms wait for the level
// (Ra Yellow at 10, Obelisk Blue at 20).
// @yo2 0x008b2f50 vector<PbinInfo>::_Tidy (inlined copy in this file)
// @yo2 0x008b2fc0 vector<PbinInfo>::insert(it, n, x) (inlined copy in this file: here "none" goes in before collect)
// @yo2 0x008b33b0 destroy<PbinInfo*> (inlined copy in this file; empty for PODs)
void CWindowDialogAvatarSwitch::refresh() {
    const int32_t sex = avatar_.bytes_[CAvatarData::SEX];
    const int32_t sexBase = sex == 1 ? 0x100 : 0;
    const int32_t kind = sex == 0 ? 1 : sex == 1 ? 2 : sex;   // PbinInfo::kind: 1 male part, 2 female part
    const int32_t series = world_ != 0 ? 3 : 2;               // PbinInfo::series: 2 DM, 3 GX (1 both)
    const bool known = category_ >= 0 && category_ < CATEGORIES;
    const ItemList* list = known ? &kLists[category_] : nullptr;
    const int32_t current = known ? avatar_.bytes_[kCategories[category_].slot] : 0;
    int32_t count = 0;
    if (list)
        count = list->kind == PBIN ? waDictionaryCount(waDict_, sex, list->waSlot, list->perWorld ? world_ : 0)
                                   : list->count;

    for (int32_t i = 0; i < ITEMS; i++) {
        hideControl(items_[i].get());
        hideControl(itemTexts_[i].get());
        itemValues_[i] = -1;
    }
    next_.get()->setDisp(false, true);
    prev_.get()->setDisp(false, true);
    if (!list)
        return;

    if (list->kind != PBIN) {
        for (int32_t i = 0; i < ITEMS; i++) {
            if (i >= count)
                continue;
            showControl(items_[i].get());
            showControl(itemTexts_[i].get());
            itemValues_[i] = i;
            if (list->kind == FIXED) {
                itemTexts_[i].get()->setText(windowText(list->texts[i]).c_str());
            } else {   // L"%s%2d"
                char number[16];
                std::snprintf(number, sizeof number, "%2d", i + 1);
                std::u16string s(std::u16string_view(windowText(list->texts[0])));
                for (const char* p = number; *p; p++)
                    s += static_cast<char16_t>(*p);
                itemTexts_[i].get()->setText(s.c_str());
            }
            if (itemValues_[i] == current)
                pictureSwitchSetSelected(items_[i].get(), true);
        }
        return;
    }

    PbinList owned;
    CPbinDictionary* dict = gameWorldPbinDictionary();
    if (category_ == CATEGORY_GLASSES) {
        PbinInfo none;
        dict->getInfo(sexBase + 0x20, &none);
        owned.push_back(none);
    }
    dict->collect(bin_, sexBase + list->from, sexBase + count, kind, kCategories[category_].slot, series, &owned);
    if (category_ == CATEGORY_CLOTHES && world_ == 1) {
        const uint8_t level = accountActivePlayer()->level;
        int32_t ra = kind, obelisk = sexBase;
        if (sex == 0)
            ra = 0x81, obelisk = 0x82;
        else if (sex == 1)
            ra = 0x181, obelisk = 0x182;
        for (size_t i = 0; i < owned.size();) {
            const int32_t pbin = owned[i].pbin;
            if (level < 10 ? pbin == obelisk || pbin == ra : level <= 19 && pbin == obelisk)
                owned.erase(&owned[i]);
            else
                i++;
        }
    }
    pageCount_ = owned.empty() ? 0 : static_cast<uint32_t>((owned.size() - 1) / ITEMS);
    if (page_ < pageCount_)
        next_.get()->setDisp(true, true);
    if (page_ != 0)
        prev_.get()->setDisp(true, true);
    for (uint32_t i = 0; i < ITEMS && page_ * ITEMS + i < owned.size(); i++) {
        const PbinInfo& e = owned[page_ * ITEMS + i];
        showControl(items_[i].get());
        showControl(itemTexts_[i].get());
        itemValues_[i] = e.number;
        itemTexts_[i].get()->setText(playerBinName(static_cast<uint32_t>(e.pbin)).c_str());
        if (itemValues_[i] == current)
            pictureSwitchSetSelected(items_[i].get(), true);
    }
}

// ------------------------------------------------------------------------------------------------ CChangeAvatarPack

namespace {
// Without avatars: one random face in both, the DM world's clothes and disk in the first, GX's in the second.
constexpr struct { uint8_t clothes, disk; } kStarterDress[2] = {{0x70, 0xb0}, {0x80, 0xb8}};
// Without PBIN bits: what a new male player owns.
constexpr uint32_t kStarterPbins[] = {0,    1,    2,    3,    4,    5,    0x20, 0x30, 0x31, 0x40,
                                      0x41, 0x42, 0x43, 0x60, 0x61, 0x62, 0x70, 0x71, 0x72, 0x73,
                                      0x80, 0x81, 0x82, 0x90, 0x91, 0x92, 0x93, 0xb0, 0xb8};
}  // namespace

// @yo2 0x008b07d0 CChangeAvatarPack::New (the constructor is inlined into it): the two avatars (made up when null),
// the PBIN bits (a beginner's when null), then into the tree
CChangeAvatarPack* CChangeAvatarPack::create(CTask* parent, CElement* layer, const CAvatarData* const avatars[2],
                                             const CPlayerBinData* bin, int32_t waistUpArg, int32_t world) {
    auto* p = new CChangeAvatarPack;
    YO2_ASSERT(p != nullptr, "CChangeAvatarPack=NULL error");
    p->layer_ = layer;
    p->world_ = world;
    if (!avatars) {
        CAvatarData looks;
        randomize(&looks);
        for (int i = 0; i < 2; i++) {
            looks.bytes_[CAvatarData::CLOTHES] = kStarterDress[i].clothes;
            looks.bytes_[CAvatarData::DUEL_DISK] = kStarterDress[i].disk;
            p->avatars_[i].set(looks.bytes_);
        }
    } else {
        for (int i = 0; i < 2; i++)
            p->avatars_[i].set(avatars[i]->bytes_);
    }
    if (!bin) {
        CPlayerBinData starter{};
        for (uint32_t f : kStarterPbins)
            starter.setFlag(f, true);
        std::memcpy(p->bin_.pbin, starter.pbin, sizeof p->bin_.pbin);   // 0x00ad68a0: the bits only
    } else {
        std::memcpy(p->bin_.pbin, bin->pbin, sizeof p->bin_.pbin);
    }
    p->waistUpArg_ = waistUpArg;
    return dynamic_cast<CChangeAvatarPack*>(p->CTask::create(parent, 10000));
}

// @yo2 0x008b2cf0 CTaskPtr<CWindowDialogAvatarSwitch>::CTaskPtr (window_'s, inlined copy in this file)
CChangeAvatarPack::CChangeAvatarPack() {
    setTaskName("CChangeAvatarPack");
    base_.setUser(this);
}

// @yo2 0x008b0e80 CChangeAvatarPack::~CChangeAvatarPack
// @yo2 0x008b0e30 CChangeAvatarPack deleting destructor
CChangeAvatarPack::~CChangeAvatarPack() = default;

// @yo2 0x008b0f50 CChangeAvatarPack::Receive (just CEasyTask's)
int32_t CChangeAvatarPack::receive(CTaskMessage* msg) { return CEasyTask::receive(msg); }

// @yo2 0x008b0f70 CChangeAvatarPack::onInit: its base element, the avatar being dressed checked against the PBIN
// map, its waist-up picture (half size, breathing, at 200, 0) and the dressing window
bool CChangeAvatarPack::onInit() {
    base_.set(CElement::newChild(layer_, 10000));
    YO2_ASSERT(base_.task() != nullptr, "error CChangeAvatarPack::m_pBaseElm::Create()");
    base_.get()->setInstName("CChangeAvatarPack::m_pBaseElm");
    layer_ = nullptr;
    avatarValidate(&avatars_[world_], world_, true);

    waistUp_.setUser(this);
    waistUp_.set(waistUpAvatarNew(this, base_.get(), 0, &avatars_[world_], waistUpArg_, 1, 1));
    YO2_ASSERT(waistUp_.task() != nullptr, "m_pWAAVatar NULL error");
    CElement* picture = waistUp_.get();
    picture->setInstName("WUアップアバター");
    waistUpAvatarSetScale(picture, 50);
    waistUpAvatarSetBreathing(picture, true);
    waistUpAvatarSetPos(picture, 200, 0);

    window_.setUser(this);
    window_.set(CWindowDialogAvatarSwitch::create(base_.get(), &avatars_[world_], &bin_, world_, 344, 109));
    YO2_ASSERT(window_.task() != nullptr, "m_setwindow NULL error");
    CWindowDialogAvatarSwitch* w = window_.get();
    w->setInstName("WUアップアバター着替え用ウインドウ");
    w->x_ = w->pos_.x = 0;   // CWindowTaskModel::setPos (0x0064d340): its controls sit at screen positions
    w->y_ = w->pos_.y = 0;
    state_ = START;
    return true;
}

// @yo2 0x008b1b30 CChangeAvatarPack::onMain: each window press. An item goes on the picture and is read back (a sex
// change also resets the other world's avatar to that sex's default); OK copies the looks to the other world.
bool CChangeAvatarPack::onMain() {
    if (state_ == START) {
        window_.get()->resetResult();
        state_ = RUNNING;
        return true;
    }
    if (state_ != RUNNING)
        return true;
    CWindowDialogAvatarSwitch* w = window_.get();
    const int32_t r = w->result();
    if (r == -1)
        return true;
    // "CChangeAvatarPack::[%d]ボタン押された"
    if (r < CWindowDialogAvatarSwitch::RESULT_ITEM) {   // a category: the window has its page up already
        w->resetResult();
        return true;
    }
    CAvatarData& dressed = avatars_[world_];
    CAvatarData& other = avatars_[world_ == 0];
    if (r >= CWindowDialogAvatarSwitch::RESULT_OK) {
        if (r == CWindowDialogAvatarSwitch::RESULT_OK) {   // "完了ボタン押され！"
            waistUpAvatarGetData(waistUp_.get(), &dressed);
            avatarCopyLooks(dressed, &other);
            state_ = DONE;
        } else if (r == CWindowDialogAvatarSwitch::RESULT_BACK) {   // "戻るボタン押され！"
            state_ = CANCELLED;
        }
        w->resetResult();
        return true;
    }
    const bool known = w->category_ >= 0 && w->category_ < CWindowDialogAvatarSwitch::CATEGORIES;
    const int32_t slot = known ? kCategories[w->category_].slot : -1;
    const int32_t value = known ? w->value_ : -1;
    // "カテゴリ[%d]を[%d]に変更要求"
    if (slot >= 0) {
        waistUpAvatarChangePart(waistUp_.get(), slot, value);   // "変更成功！" / "変更失敗…"
        waistUpAvatarGetData(waistUp_.get(), &dressed);
        w->setAvatar(dressed);
        if (slot == CAvatarData::SEX) {
            CAvatarData fresh;
            if (world_ == 0) {
                fresh.bytes_[CAvatarData::CLOTHES] = 0x80;
                fresh.bytes_[CAvatarData::DUEL_DISK] = 0xb8;
            }
            other.set(fresh.bytes_);
            other.bytes_[CAvatarData::SEX] = static_cast<uint8_t>(value);
        }
    }
    w->resetResult();
    return true;
}

// @yo2 0x008b2c50 CChangeAvatarPack::onDestroy: the picture, then the base element (the window with it)
void CChangeAvatarPack::onDestroy() {
    if (waistUp_.task())
        waistUp_.get()->destroy(__FILE__, 0x5a0);
    if (base_.task())
        base_.get()->destroy(__FILE__, 0x5a1);
}
