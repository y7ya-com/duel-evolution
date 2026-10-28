#include "Game/yo2CardListView.h"

#include <cstdio>
#include <string>

#include "duel/CardDB.h"
#include "duel/DuelText.h"

namespace {
// Shared by the icons' setValue: show cell `cell` (size x size) of the strip, or hide the icon.
void showCell(CWindowTaskImage* img, bool show, int32_t cell, int32_t size) {
    if (!show) {
        img->setDisp(false, true);
        windowSetLock(img, 2);
        return;
    }
    windowClearLock(img, 2);
    img->setDisp(true, true);
    img->w_ = img->h_ = static_cast<float>(size);
    img->setPart(cell * size - size, 0, size, size);
}

template <class T>
T* createIcon(T* c, CTask* parent, IWindowTaskMediator* mediator, const char* texture, int32_t value) {
    c->mediator_ = mediator;
    c->texture_ = texture;
    c->value_ = value;
    return dynamic_cast<T*>(c->CTask::create(parent, 0));
}
}  // namespace

// --- attribute --------------------------------------------------------------------------------------------------
// @yo2 0x00a0dcc0 CWindowTaskImageCardAttr::create (the constructor inlined)
CWindowTaskImageCardAttr* CWindowTaskImageCardAttr::create(CTask* parent, IWindowTaskMediator* mediator, int32_t value) {
    return createIcon(new CWindowTaskImageCardAttr, parent, mediator, "data/common/icon/icon_zokusei_01.png", value);
}
CWindowTaskImageCardAttr::CWindowTaskImageCardAttr() { setTaskName("CWindowTaskImageCardAttr"); }
// @yo2 0x00a0df60 CWindowTaskImageCardAttr::~CWindowTaskImageCardAttr
// @yo2 0x00a0df30 CWindowTaskImageCardAttr deleting destructor
CWindowTaskImageCardAttr::~CWindowTaskImageCardAttr() = default;
// @yo2 0x00a0e020 CWindowTaskImageCardAttr::onInit
bool CWindowTaskImageCardAttr::onInit() {
    CWindowTaskImage::onInit();
    setValue(value_);
    return true;
}
// @yo2 0x00a0e050 CWindowTaskImageCardAttr::setValue (1..9)
void CWindowTaskImageCardAttr::setValue(int32_t value) {
    value_ = value;
    showCell(this, value > 0 && value < 10, value, 16);
}

// --- monster type -----------------------------------------------------------------------------------------------
// @yo2 0x00a0e110 CWindowTaskImageCardType::create
CWindowTaskImageCardType* CWindowTaskImageCardType::create(CTask* parent, IWindowTaskMediator* mediator, int32_t value) {
    return createIcon(new CWindowTaskImageCardType, parent, mediator, "data/common/icon/icon_syuzoku_01.png", value);
}
CWindowTaskImageCardType::CWindowTaskImageCardType() { setTaskName("CWindowTaskImageCardType"); }
// @yo2 0x00a0e3b0 CWindowTaskImageCardType::~CWindowTaskImageCardType
// @yo2 0x00a0e380 CWindowTaskImageCardType deleting destructor
CWindowTaskImageCardType::~CWindowTaskImageCardType() = default;
// @yo2 0x00a0e470 CWindowTaskImageCardType::onInit
bool CWindowTaskImageCardType::onInit() {
    CWindowTaskImage::onInit();
    setValue(value_);
    return true;
}
// @yo2 0x00a0e4a0 CWindowTaskImageCardType::setValue (1..21)
void CWindowTaskImageCardType::setValue(int32_t value) {
    value_ = value;
    showCell(this, value > 0 && value < 22, value, 16);
}

// --- spell / trap icon ------------------------------------------------------------------------------------------
// @yo2 0x00a0e560 CWindowTaskImageCardIcon::create
CWindowTaskImageCardIcon* CWindowTaskImageCardIcon::create(CTask* parent, IWindowTaskMediator* mediator, int32_t value) {
    return createIcon(new CWindowTaskImageCardIcon, parent, mediator, "data/common/icon/icon_mahouwana_01.png", value);
}
CWindowTaskImageCardIcon::CWindowTaskImageCardIcon() { setTaskName("CWindowTaskImageCardIcon"); }
// @yo2 0x00a0e800 CWindowTaskImageCardIcon::~CWindowTaskImageCardIcon
// @yo2 0x00a0e7d0 CWindowTaskImageCardIcon deleting destructor
CWindowTaskImageCardIcon::~CWindowTaskImageCardIcon() = default;
// @yo2 0x00a0e8c0 CWindowTaskImageCardIcon::onInit
bool CWindowTaskImageCardIcon::onInit() {
    CWindowTaskImage::onInit();
    setValue(value_);
    return true;
}
// @yo2 0x00a0e8f0 CWindowTaskImageCardIcon::setValue (1..7)
void CWindowTaskImageCardIcon::setValue(int32_t value) {
    value_ = value;
    showCell(this, value > 0 && value < 8, value, 16);
}

// --- deck limit -------------------------------------------------------------------------------------------------
// @yo2 0x00a0e9b0 CWindowTaskImageCardForbi::create
CWindowTaskImageCardForbi* CWindowTaskImageCardForbi::create(CTask* parent, IWindowTaskMediator* mediator, int32_t value) {
    return createIcon(new CWindowTaskImageCardForbi, parent, mediator, "data/common/icon/icon_seigen_01.png", value);
}
CWindowTaskImageCardForbi::CWindowTaskImageCardForbi() { setTaskName("CWindowTaskImageCardForbi"); }
// @yo2 0x00a0ec50 CWindowTaskImageCardForbi::~CWindowTaskImageCardForbi
// @yo2 0x00a0ec20 CWindowTaskImageCardForbi deleting destructor
CWindowTaskImageCardForbi::~CWindowTaskImageCardForbi() = default;
// @yo2 0x00a0ed10 CWindowTaskImageCardForbi::onInit
bool CWindowTaskImageCardForbi::onInit() {
    CWindowTaskImage::onInit();
    setValue(value_, false);
    return true;
}
// @yo2 0x00a0ed40 CWindowTaskImageCardForbi::setValue (0..3, 0..4 extended)
void CWindowTaskImageCardForbi::setValue(int32_t value, bool extended) {
    value_ = value;
    showCell(this, value >= 0 && value < (extended ? 5 : 4), value, 16);
}

// --- level digit ------------------------------------------------------------------------------------------------
// @yo2 0x00a0ee10 CWindowTaskImageCardStarLv::create
CWindowTaskImageCardStarLv* CWindowTaskImageCardStarLv::create(CTask* parent, IWindowTaskMediator* mediator,
                                                               int32_t value) {
    return createIcon(new CWindowTaskImageCardStarLv, parent, mediator, "data/common/icon/font_k_star.png", value);
}
CWindowTaskImageCardStarLv::CWindowTaskImageCardStarLv() { setTaskName("CWindowTaskImageCardStarLv"); }
// @yo2 0x00a0f0b0 CWindowTaskImageCardStarLv::~CWindowTaskImageCardStarLv
// @yo2 0x00a0f080 CWindowTaskImageCardStarLv deleting destructor
CWindowTaskImageCardStarLv::~CWindowTaskImageCardStarLv() = default;
// @yo2 0x00a0f170 CWindowTaskImageCardStarLv::onInit
bool CWindowTaskImageCardStarLv::onInit() {
    CWindowTaskImage::onInit();
    setValue(value_);
    return true;
}
// @yo2 0x00a0f1a0 CWindowTaskImageCardStarLv::setValue (1..12, 14 x 14 digits)
void CWindowTaskImageCardStarLv::setValue(int32_t value) {
    value_ = value;
    showCell(this, value > 0 && value < 13, value, 14);
}

// --- star + level -----------------------------------------------------------------------------------------------
// @yo2 0x00a0f260 CWindowTaskImageCardStar::create
CWindowTaskImageCardStar* CWindowTaskImageCardStar::create(CTask* parent, IWindowTaskMediator* mediator, int32_t value) {
    return createIcon(new CWindowTaskImageCardStar, parent, mediator, "data/common/icon/icon_star_01.png", value);
}
CWindowTaskImageCardStar::CWindowTaskImageCardStar() { setTaskName("CWindowTaskImageCardStar"); }
// @yo2 0x00a0f500 CWindowTaskImageCardStar::~CWindowTaskImageCardStar
// @yo2 0x00a0f4d0 CWindowTaskImageCardStar deleting destructor
CWindowTaskImageCardStar::~CWindowTaskImageCardStar() = default;
// @yo2 0x00a0f5c0 CWindowTaskImageCardStar::onInit: the level digit as a child ("CBgCommon::m_starlv", sic)
bool CWindowTaskImageCardStar::onInit() {
    CWindowTaskImage::onInit();
    level_ = CWindowTaskImageCardStarLv::create(this, mediator_, value_);
    YO2_ASSERT(level_, "error CWindowTaskImageCardStar::CWindowTaskImageCardStarLv::Create()");
    level_->setInstName("CBgCommon::m_starlv");
    setValue(value_);
    return true;
}
// @yo2 0x00a0f820 CWindowTaskImageCardStar::setValue: the star (19 x 16) with the digit 18 pixels to its right
void CWindowTaskImageCardStar::setValue(int32_t value) {
    value_ = value;
    if (value <= 0 || value >= 13) {
        setDisp(false, true);
        windowSetLock(this, 2);
        return;
    }
    windowClearLock(this, 2);
    setDisp(true, true);
    level_->setValue(value);
    level_->x_ = 18;
    level_->y_ = 0;
    w_ = 19;
    h_ = 16;
    setPart(0, 0, 19, 16);
}

// --- CCardInfoLayout ---------------------------------------------------------------------------------------------

namespace {
vc6::wstring wideOf(const char* s) {
    std::u16string w;
    for (; *s; s++)
        w += static_cast<char16_t>(static_cast<uint8_t>(*s));
    return vc6::wstring(w);
}

vc6::wstring statText(int32_t card, int32_t raw) {
    int32_t kind = cardKind(card);
    if (kind >= 12 && kind <= 14)
        return vc6::wstring(u"-");
    if (raw == 0xffff)
        return vc6::wstring(u"????");
    char buf[16];
    std::snprintf(buf, sizeof buf, "%4d", raw);   // the exe's swprintf(L"%4d")
    return wideOf(buf);
}
}  // namespace

// @yo2 0x00a143b0 CCardInfoLayout::position
Vec3 CCardInfoLayout::position(int32_t column) const {
    float x = 0;
    switch (column) {
    case ATTR: x = 256; break;
    case TYPE: x = 272; break;
    case ICON: x = 288; break;
    case STAR: x = 304; break;
    case LIMIT: x = 336; break;
    case ATK: x = 352; break;
    case SEP: x = 392; break;
    case DEF: x = 400; break;
    }
    return {x, 0, 0};
}

// @yo2 0x00a14670 CCardInfoLayout::has
bool CCardInfoLayout::has(int32_t) const { return true; }

// @yo2 0x00a13f90 CCardInfoLayout::atkText
vc6::wstring CCardInfoLayout::atkText(int32_t card) const { return statText(card, cardAtkRaw(card)); }

// @yo2 0x00a14110 CCardInfoLayout::defText
vc6::wstring CCardInfoLayout::defText(int32_t card) const { return statText(card, cardDefRaw(card)); }

// @yo2 0x00a14290 CCardInfoLayout::sepText
vc6::wstring CCardInfoLayout::sepText() const { return vc6::wstring(u"/"); }

// --- CWindowTaskCardInfoItem -------------------------------------------------------------------------------------

// @yo2 0x00a0fc80 CWindowTaskCardInfoItem::~CWindowTaskCardInfoItem
// @yo2 0x00a0fbb0 CWindowTaskCardInfoItem deleting destructor
CWindowTaskCardInfoItem::~CWindowTaskCardInfoItem() = default;

namespace {
// A text column: made, named, its look set, then placed at the layout's position plus the item's offset.
void textColumn(CWindowTaskCardInfoItem* item, CTaskPtr<CWindowTaskText>& to, const char* name, int32_t align,
                int32_t w, int32_t column, const vc6::wstring& text) {
    to.set(CWindowTaskText::create(item, item->mediator_));
    YO2_ASSERT(to.task(), "error CWindowTaskCardInfoItem::CWindowTaskText::Create()");
    CWindowTaskText* t = to.get();
    t->setInstName(name);
    t->setAlign(align);
    t->setArea(w, 16);
    t->setText(text.c_str());
    Vec3 p = item->columns_->position(column);
    t->setPageLines(1);
    t->setPos(p.x + item->x_, p.y + item->y_);
}

template <class T>
void iconColumn(CWindowTaskCardInfoItem* item, CTaskPtr<T>& to, const char* name, const char* error, int32_t column,
                int32_t value) {
    to.set(T::create(item, item->mediator_, value));
    YO2_ASSERT(to.task(), "%s", error);
    T* c = to.get();
    c->setInstName(name);
    Vec3 p = item->columns_->position(column);
    c->x_ = p.x + item->x_;
    c->y_ = p.y + item->y_;
}
}  // namespace

// @yo2 0x00a0fd90 CWindowTaskCardInfoItem::onInit: the columns the layout asks for, for card_
bool CWindowTaskCardInfoItem::onInit() {
    attr_.setUser(this), type_.setUser(this), icon_.setUser(this), star_.setUser(this), name_.setUser(this);
    atk_.setUser(this), def_.setUser(this), limit_.setUser(this), sep_.setUser(this);
    w_ = 512;
    h_ = 16;
    x_ = y_ = 0;
    z_ = 0;
    inheritTransform_ = true;
    setDrawMode(2);
    int32_t card = cardPropId(card_);
    cardKind(card);
    const CCardInfoLayout* l = columns_;
    if (l->has(CCardInfoLayout::NAME)) {
        textColumn(this, name_, "CWindowTaskCardInfoItem::m_name", CWindowTaskText::LEFT, 256, CCardInfoLayout::NAME,
                   windowWiden(textCardName(card)));   // TODO(System): Shift-JIS widening (0x005977b0)
        name_->setKeepNewlines(false);
    }
    if (l->has(CCardInfoLayout::ATTR))
        iconColumn(this, attr_, "CWindowTaskCardInfoItem::m_attr",
                   "error CWindowTaskCardInfoItem::CWindowTaskImageCardAttr::Create()", CCardInfoLayout::ATTR, cardAttr(card));
    if (l->has(CCardInfoLayout::TYPE))
        iconColumn(this, type_, "CWindowTaskCardInfoItem::m_type",
                   "error CWindowTaskCardInfoItem::CWindowTaskImageCardType::Create()", CCardInfoLayout::TYPE, cardRace(card));
    if (l->has(CCardInfoLayout::ICON))
        iconColumn(this, icon_, "CWindowTaskCardInfoItem::m_icon",
                   "error CWindowTaskCardInfoItem::CWindowTaskImageCardIcon::Create()", CCardInfoLayout::ICON, cardIcon(card));
    if (l->has(CCardInfoLayout::STAR))
        iconColumn(this, star_, "CWindowTaskCardInfoItem::m_star",
                   "error CWindowTaskCardInfoItem::CWindowTaskImageCardStar::Create()", CCardInfoLayout::STAR, cardLevel(card));
    if (l->has(CCardInfoLayout::LIMIT))
        iconColumn(this, limit_, "CWindowTaskCardInfoItem::m_forbi",
                   "error CWindowTaskCardInfoItem::CWindowTaskImageCardForbi::Create()", CCardInfoLayout::LIMIT, cardLimit(card));
    if (l->has(CCardInfoLayout::ATK))
        textColumn(this, atk_, "CWindowTaskCardInfoItem::m_atk", CWindowTaskText::RIGHT, 40, CCardInfoLayout::ATK,
                   l->atkText(card));
    if (l->has(CCardInfoLayout::DEF))
        textColumn(this, def_, "CWindowTaskCardInfoItem::m_def", CWindowTaskText::RIGHT, 40, CCardInfoLayout::DEF,
                   l->defText(card));
    if (l->has(CCardInfoLayout::SEP))
        textColumn(this, sep_, "CWindowTaskCardInfoItem::m_sep", CWindowTaskText::CENTRE, 16, CCardInfoLayout::SEP,
                   l->sepText());
    layout();
    return true;
}

// @yo2 0x00a0fb70 CWindowTaskCardInfoItem::onMain
bool CWindowTaskCardInfoItem::onMain() {
    layout();
    return true;
}

// @yo2 0x00a13ef0 CWindowTaskCardInfoItem::layout
void CWindowTaskCardInfoItem::layout() { pos_ = {x_, y_, z_}; }

// @yo2 0x00a13f40 CWindowTaskCardInfoItem::handleMessage: a left click goes to the window
bool CWindowTaskCardInfoItem::handleMessage(WindowMsg m) {
    if (m.msg == 0x201)
        mediator_->onControlCommand(this);
    return true;
}

// @yo2 0x00a12f40 CWindowTaskCardInfoItem::setNameWidth
void CWindowTaskCardInfoItem::setNameWidth(float w) { name_->setArea(static_cast<int32_t>(w), 16); }

// @yo2 0x00a12f80 CWindowTaskCardInfoItem::setCard: the columns for another card, or text 4020 / 4021 alone
void CWindowTaskCardInfoItem::setCard(int32_t index) {
    card_ = index;
    if (index == NOT_FOUND || index == UNKNOWN) {
        name_->setTextId(index == NOT_FOUND ? 4020 : 4021);
        attr_->setValue(-1);
        type_->setValue(-1);
        icon_->setValue(-1);
        star_->setValue(-1);
        limit_->setValue(-1, false);
        atk_->setText(u"");
        def_->setText(u"");
        sep_->setText(u"");
        return;
    }
    int32_t card = cardPropId(index);
    cardKind(card);
    const CCardInfoLayout* l = columns_;
    if (l->has(CCardInfoLayout::NAME))   // the exe passes the Shift-JIS name as UTF-16 here (garbled); widened
        name_->setText(windowWiden(textCardName(card)).c_str());
    if (l->has(CCardInfoLayout::ATTR))
        attr_->setValue(cardAttr(card));
    if (l->has(CCardInfoLayout::TYPE))
        type_->setValue(cardRace(card));
    if (l->has(CCardInfoLayout::ICON))
        icon_->setValue(cardIcon(card));
    if (l->has(CCardInfoLayout::STAR))
        star_->setValue(cardLevel(card));
    if (l->has(CCardInfoLayout::LIMIT))
        limit_->setValue(cardLimit(card) + 1, false);   // the engine's wrapper (0x00716c10); sic: one more than onInit
    if (l->has(CCardInfoLayout::ATK))
        atk_->setText(l->atkText(card).c_str());
    if (l->has(CCardInfoLayout::DEF))
        def_->setText(l->defText(card).c_str());
    if (l->has(CCardInfoLayout::SEP))
        sep_->setText(l->sepText().c_str());
}

// @yo2 0x00a0f900 CWindowTaskCardInfoItem::create (the constructor inlined)
CWindowTaskCardInfoItem* CWindowTaskCardInfoItem::create(CTask* parent, IWindowTaskMediator* mediator, int32_t card,
                                                         const CCardInfoLayout* columns) {
    auto* t = new CWindowTaskCardInfoItem;
    t->card_ = card;
    t->mediator_ = mediator;
    t->columns_ = columns;
    return dynamic_cast<CWindowTaskCardInfoItem*>(t->CTask::create(parent, 0));
}

// --- the duel command icon ----------------------------------------------------------------------------------------
// @yo2 0x00a21140 CWindowTaskImageDuelCmd::create
CWindowTaskImageDuelCmd* CWindowTaskImageDuelCmd::create(CTask* parent, IWindowTaskMediator* mediator, int32_t value) {
    return createIcon(new CWindowTaskImageDuelCmd, parent, mediator, "data/common/icon/duelcmd_icon_01.png", value);
}
CWindowTaskImageDuelCmd::CWindowTaskImageDuelCmd() { setTaskName("CWindowTaskImageDuelCmd"); }
// @yo2 0x00a213e0 CWindowTaskImageDuelCmd::~CWindowTaskImageDuelCmd
// @yo2 0x00a213b0 CWindowTaskImageDuelCmd deleting destructor
CWindowTaskImageDuelCmd::~CWindowTaskImageDuelCmd() = default;
// @yo2 0x00a214a0 CWindowTaskImageDuelCmd::onInit
bool CWindowTaskImageDuelCmd::onInit() {
    CWindowTaskImage::onInit();
    setValue(value_);
    return true;
}
// @yo2 0x00a214d0 CWindowTaskImageDuelCmd::setValue (0..20)
void CWindowTaskImageDuelCmd::setValue(int32_t value) {
    value_ = value;
    showCell(this, value >= 0 && value < 21, value + 1, 16);
}

// =====================================================================================================================
// the choice lists

// @yo2 0x00a16030 CWindowTaskViewImgAndTextItem::~CWindowTaskViewImgAndTextItem
// @yo2 0x00a15fe0 CWindowTaskViewImgAndTextItem deleting destructor
CWindowTaskViewImgAndTextItem::~CWindowTaskViewImgAndTextItem() = default;

// @yo2 0x00a15450 CWindowTaskViewImgAndTextItem::onInit: the image at (x, y), the text 24 px right of it
bool CWindowTaskViewImgAndTextItem::onInit() {
    img_.setUser(this);
    text_.setUser(this);
    w_ = 256;
    h_ = 16;
    x_ = y_ = 0;
    z_ = 0;
    inheritTransform_ = true;
    setDrawMode(2);
    img_.set(createImage());
    img_->x_ = x_;
    img_->y_ = y_;
    text_.set(CWindowTaskText::create(this, mediator_));
    YO2_ASSERT(text_.task(), "error CWindowTaskViewImgAndTextItem::CWindowTaskText::Create()");
    CWindowTaskText* t = text_.get();
    t->setInstName("CWindowTaskViewImgAndTextItem::m_text");
    t->setAlign(CWindowTaskText::LEFT);
    t->setArea(static_cast<int32_t>(w_ - 16), static_cast<int32_t>(h_));
    t->setText(text().c_str());
    t->setPos(x_ + 24, y_);
    t->setPageLines(1);
    layout();
    return true;
}

// @yo2 0x00a15fa0 CWindowTaskViewImgAndTextItem::onMain
bool CWindowTaskViewImgAndTextItem::onMain() {
    layout();
    return true;
}

// @yo2 0x00a15c40 CWindowTaskViewImgAndTextItem::layout
void CWindowTaskViewImgAndTextItem::layout() {
    pos_ = {x_, y_, z_};
    text_->setArea(static_cast<int32_t>(w_ - 16), static_cast<int32_t>(h_));
}

// @yo2 0x00a15cd0 CWindowTaskViewImgAndTextItem::handleMessage
bool CWindowTaskViewImgAndTextItem::handleMessage(WindowMsg m) {
    if (m.msg == 0x201)
        mediator_->onControlCommand(this);
    return true;
}

// --- the row of a kind ----------------------------------------------------------------------------------------------
// @yo2 0x00a15d20 CWindowTaskViewItemCardAttr::create (both constructors inlined)
// @yo2 0x00a17570 CWindowTaskViewItemCardType::create
// @yo2 0x00a18cd0 CWindowTaskViewItemCardIcon::create
// @yo2 0x00a1a410 CWindowTaskViewItemCardStar::create
// @yo2 0x00a1bb30 CWindowTaskViewItemCardForbi::create
// @yo2 0x00a21590 CWindowTaskViewItemDuelCmd::create
template <class Kind>
CWindowTaskViewItem<Kind>* CWindowTaskViewItem<Kind>::create(CTask* parent, IWindowTaskMediator* mediator,
                                                             int32_t value) {
    auto* t = new CWindowTaskViewItem;
    t->mediator_ = mediator;
    t->value_ = value;
    return dynamic_cast<CWindowTaskViewItem*>(t->CTask::create(parent, 0));
}

template <class Kind>
CWindowTaskViewItem<Kind>::CWindowTaskViewItem() {
    setTaskName((std::string("CWindowTaskViewItem") + Kind::NAME).c_str());
}

// @yo2 0x00a160e0 CWindowTaskViewItemCardAttr::~CWindowTaskViewItemCardAttr
// @yo2 0x00a160b0 CWindowTaskViewItemCardAttr deleting destructor
// @yo2 0x00a17820 CWindowTaskViewItemCardType::~CWindowTaskViewItemCardType
// @yo2 0x00a177f0 CWindowTaskViewItemCardType deleting destructor
// @yo2 0x00a18f80 CWindowTaskViewItemCardIcon::~CWindowTaskViewItemCardIcon
// @yo2 0x00a18f50 CWindowTaskViewItemCardIcon deleting destructor
// @yo2 0x00a1a6c0 CWindowTaskViewItemCardStar::~CWindowTaskViewItemCardStar
// @yo2 0x00a1a690 CWindowTaskViewItemCardStar deleting destructor
// @yo2 0x00a1bde0 CWindowTaskViewItemCardForbi::~CWindowTaskViewItemCardForbi
// @yo2 0x00a1bdb0 CWindowTaskViewItemCardForbi deleting destructor
// @yo2 0x00a21840 CWindowTaskViewItemDuelCmd::~CWindowTaskViewItemDuelCmd
// @yo2 0x00a21810 CWindowTaskViewItemDuelCmd deleting destructor
template <class Kind>
CWindowTaskViewItem<Kind>::~CWindowTaskViewItem() = default;

// @yo2 0x00a16460 CWindowTaskViewItemCardAttr::createImage
// @yo2 0x00a17ba0 CWindowTaskViewItemCardType::createImage
// @yo2 0x00a19300 CWindowTaskViewItemCardIcon::createImage
// @yo2 0x00a1aa40 CWindowTaskViewItemCardStar::createImage
// @yo2 0x00a1c160 CWindowTaskViewItemCardForbi::createImage
// @yo2 0x00a21bc0 CWindowTaskViewItemDuelCmd::createImage
template <class Kind>
CWindowTaskImage* CWindowTaskViewItem<Kind>::createImage() {
    const std::string item = std::string("CWindowTaskViewItem") + Kind::NAME;
    auto* img = Kind::Img::create(this, mediator_, value_);
    YO2_ASSERT(img, "error %s::CWindowTaskImage%s::Create()", item.c_str(), Kind::NAME);
    img->setInstName((item + "::img").c_str());
    return img;
}

// @yo2 0x00a16690 CWindowTaskViewItemCardAttr::text
// @yo2 0x00a17dd0 CWindowTaskViewItemCardType::text
// @yo2 0x00a19530 CWindowTaskViewItemCardIcon::text
// @yo2 0x00a1ac70 CWindowTaskViewItemCardStar::text
// @yo2 0x00a1c390 CWindowTaskViewItemCardForbi::text
// @yo2 0x00a21df0 CWindowTaskViewItemDuelCmd::text
template <class Kind>
vc6::wstring CWindowTaskViewItem<Kind>::text() {
    return Kind::text(value_);
}

// @yo2 0x00a16160 CWindowTaskViewItemCardAttr::setValue
// @yo2 0x00a178a0 CWindowTaskViewItemCardType::setValue
// @yo2 0x00a19000 CWindowTaskViewItemCardIcon::setValue
// @yo2 0x00a1a740 CWindowTaskViewItemCardStar::setValue
// @yo2 0x00a1be60 CWindowTaskViewItemCardForbi::setValue
// @yo2 0x00a218c0 CWindowTaskViewItemDuelCmd::setValue
template <class Kind>
void CWindowTaskViewItem<Kind>::setValue(int32_t value) {
    value_ = value;
    Kind::show(dynamic_cast<typename Kind::Img*>(img_.get()), value);
    text_->setText(text().c_str());
}

namespace {
// The rows' texts: "not found" / "unknown" (4020 / 4021) for the two extra rows, else the value's name.
vc6::wstring cardValueText(int32_t value, const char* name) {
    if (value == CWindowTaskCardInfoItem::NOT_FOUND)
        return windowText(4020);
    if (value == CWindowTaskCardInfoItem::UNKNOWN)
        return windowText(4021);
    return windowWiden(name);   // TODO(System): Shift-JIS widening (0x005977b0)
}
}  // namespace

vc6::wstring CardAttrKind::text(int32_t v) { return cardValueText(v, v >= 0x100000 ? "" : textAttr(v)); }
vc6::wstring CardTypeKind::text(int32_t v) { return cardValueText(v, v >= 0x100000 ? "" : textRace(v)); }
// the icon's name: FUN_0073bef0 (duel's text table; "" for 0)
vc6::wstring CardIconKind::text(int32_t v) { return cardValueText(v, v == 0 || v >= 0x100000 ? "" : textById(v + 0x23a)); }
vc6::wstring CardStarKind::text(int32_t v) { return cardValueText(v, ""); }
vc6::wstring CardForbiKind::text(int32_t v) { return cardValueText(v, ""); }
// the command's name: text 0x1990 for 19, else 0x1013 + v (0x1012 + v from 5 on: there's no text for 5)
vc6::wstring DuelCmdKind::text(int32_t v) { return windowText(v == 19 ? 0x1990 : v < 5 ? v + 0x1013 : v + 0x1012); }
void CardAttrKind::show(CWindowTaskImageCardAttr* img, int32_t v) { img->setValue(v); }
void CardTypeKind::show(CWindowTaskImageCardType* img, int32_t v) { img->setValue(v); }
void CardIconKind::show(CWindowTaskImageCardIcon* img, int32_t v) { img->setValue(v); }
void CardStarKind::show(CWindowTaskImageCardStar* img, int32_t v) { img->setValue(v); }
void CardForbiKind::show(CWindowTaskImageCardForbi* img, int32_t v) { img->setValue(v, true); }
void DuelCmdKind::show(CWindowTaskImageDuelCmd* img, int32_t v) { img->setValue(v); }

// --- the list box -----------------------------------------------------------------------------------------------------
// @yo2 0x00a14690 CWindowTaskListboxCard::create (the constructor inlined; the mediator set after CTask::create)
// @yo2 0x00a167f0 CWindowTaskListboxCardAttr::create
// @yo2 0x00a17f30 CWindowTaskListboxCardType::create
// @yo2 0x00a19690 CWindowTaskListboxCardIcon::create
// @yo2 0x00a1ade0 CWindowTaskListboxCardStar::create
// @yo2 0x00a1c500 CWindowTaskListboxCardForbi::create
// @yo2 0x00a21e80 CWindowTaskListboxDuelCmd::create
template <class Kind>
typename Kind::List* CWindowTaskListboxT<Kind>::create(CTask* parent, IWindowTaskMediator* mediator, bool multi) {
    auto* l = new typename Kind::List;
    l->multi_ = multi;
    auto* r = dynamic_cast<typename Kind::List*>(l->CTask::create(parent, 10000));
    r->mediator_ = mediator;
    return r;
}

template <class Kind>
CWindowTaskListboxT<Kind>::CWindowTaskListboxT() {
    setTaskName((std::string("CWindowTaskListbox") + Kind::NAME).c_str());
}

// @yo2 0x00a14910 CWindowTaskListboxCard::~CWindowTaskListboxCard
// @yo2 0x00a148e0 CWindowTaskListboxCard deleting destructor
// @yo2 0x00a16a50 CWindowTaskListboxCardAttr::~CWindowTaskListboxCardAttr
// @yo2 0x00a16a20 CWindowTaskListboxCardAttr deleting destructor
// @yo2 0x00a18190 CWindowTaskListboxCardType::~CWindowTaskListboxCardType
// @yo2 0x00a18160 CWindowTaskListboxCardType deleting destructor
// @yo2 0x00a198f0 CWindowTaskListboxCardIcon::~CWindowTaskListboxCardIcon
// @yo2 0x00a198c0 CWindowTaskListboxCardIcon deleting destructor
// @yo2 0x00a1b040 CWindowTaskListboxCardStar::~CWindowTaskListboxCardStar
// @yo2 0x00a1b010 CWindowTaskListboxCardStar deleting destructor
// @yo2 0x00a1c760 CWindowTaskListboxCardForbi::~CWindowTaskListboxCardForbi
// @yo2 0x00a1c730 CWindowTaskListboxCardForbi deleting destructor
// @yo2 0x00a220e0 CWindowTaskListboxDuelCmd::~CWindowTaskListboxDuelCmd
// @yo2 0x00a220b0 CWindowTaskListboxDuelCmd deleting destructor
template <class Kind>
CWindowTaskListboxT<Kind>::~CWindowTaskListboxT() = default;

// @yo2 0x00a14aa0 CWindowTaskListboxCard::add
// @yo2 0x00a16be0 CWindowTaskListboxCardAttr::add
// @yo2 0x00a18320 CWindowTaskListboxCardType::add
// @yo2 0x00a19a80 CWindowTaskListboxCardIcon::add
// @yo2 0x00a1b1d0 CWindowTaskListboxCardStar::add
// @yo2 0x00a1c8f0 CWindowTaskListboxCardForbi::add
// @yo2 0x00a22270 CWindowTaskListboxDuelCmd::add
template <class Kind>
void CWindowTaskListboxT<Kind>::add(int32_t value) {
    values_.push_back(value);
    addRow();
}

// @yo2 0x00a15420 CWindowTaskListboxCard::addAll (cards 0 .. 0xc8a)
// @yo2 0x00a17540 CWindowTaskListboxCardAttr::addAll (1 .. 9)
// @yo2 0x00a18ca0 CWindowTaskListboxCardType::addAll (1 .. 21)
// @yo2 0x00a1a3e0 CWindowTaskListboxCardIcon::addAll (1 .. 7)
template <class Kind>
void CWindowTaskListboxT<Kind>::addAll() {
    for (int32_t v = Kind::FIRST; v < Kind::END; v++)
        add(v);
}

// @yo2 0x00a22540 CWindowTaskListboxDuelCmd::clearValues
template <class Kind>
void CWindowTaskListboxT<Kind>::clearValues() {
    values_.clear();
    clear();
}

namespace {
CWindowTaskCardInfoItem* makeRow(CWindowTaskListboxT<CardKind>* l, IWindowTaskMediator* m) {
    return CWindowTaskCardInfoItem::create(l, m, 0, &static_cast<CWindowTaskListboxCard*>(l)->layout_);
}
void setRow(CWindowTaskCardInfoItem* row, int32_t v) { row->setCard(v); }
template <class Kind>
CWindowTaskViewItem<Kind>* makeRow(CWindowTaskListboxT<Kind>* l, IWindowTaskMediator* m) {
    return CWindowTaskViewItem<Kind>::create(l, m, 0);
}
template <class Kind>
void setRow(CWindowTaskViewItem<Kind>* row, int32_t v) { row->setValue(v); }
}  // namespace

// @yo2 0x00a14dc0 CWindowTaskListboxCard::scrollToLine: a row task per stripe row, then each shows its line's value
// @yo2 0x00a16f00 CWindowTaskListboxCardAttr::scrollToLine
// @yo2 0x00a18640 CWindowTaskListboxCardType::scrollToLine (then the list's z 3)
// @yo2 0x00a19da0 CWindowTaskListboxCardIcon::scrollToLine
// @yo2 0x00a1b4f0 CWindowTaskListboxCardStar::scrollToLine
// @yo2 0x00a1cc10 CWindowTaskListboxCardForbi::scrollToLine
// @yo2 0x00a22590 CWindowTaskListboxDuelCmd::scrollToLine
template <class Kind>
void CWindowTaskListboxT<Kind>::scrollToLine(int32_t line) {
    CWindowTaskListbox::scrollToLine(line);
    const std::string list = std::string("CWindowTaskListbox") + Kind::NAME;
    while (rows_.size() < size_t(stripe_->rowCount_)) {
        Row* row = makeRow(this, static_cast<IWindowTaskMediator*>(this));
        YO2_ASSERT(row, "error %s::Create()", list.c_str());
        row->setInstName((list + "::item").c_str());
        rows_.push_back(row);
    }
    float y = 0;
    for (size_t i = 0; i < rows_.size(); i++) {
        Row* row = rows_[i];
        row->y_ = y;
        row->x_ = 0;
        if (topItem_ + i < values_.size() && int32_t(i) < stripe_->rowCount_) {
            setRow(row, values_[topItem_ + i]);
            windowClearLock(row, 2);
            row->setDisp(true, true);
            row->z_ = 2;
            y += 16;
        } else {
            row->setDisp(false, true);
            windowSetLock(row, 2);
        }
    }
    if (Kind::LIST_Z) {
        posZ_ = Kind::LIST_Z;
        pos_.z = Kind::LIST_Z;
    }
}

// --- the dialog ---------------------------------------------------------------------------------------------------
// @yo2 0x00a1d250 CWindowModelListCard::create (the constructor inlined)
// @yo2 0x00a1dd10 CWindowModelListCardAttr::create
// @yo2 0x00a1e710 CWindowModelListCardType::create
// @yo2 0x00a1f100 CWindowModelListCardIcon::create
// @yo2 0x00a1fbc0 CWindowModelListCardStar::create
// @yo2 0x00a20680 CWindowModelListCardForbi::create
template <class Kind>
CWindowModelListT<Kind>* CWindowModelListT<Kind>::create(CTask* parent, int32_t kind, bool multi, bool unknownRows) {
    auto* w = new CWindowModelListT;
    w->kind_ = kind;
    w->unknownRows_ = unknownRows;
    w->multi_ = multi;
    return dynamic_cast<CWindowModelListT*>(w->CTask::create(parent, 0));
}

template <class Kind>
CWindowModelListT<Kind>::CWindowModelListT() {
    setTaskName((std::string("CWindowModelList") + Kind::NAME).c_str());
}

// (CardAttr's and CardType's are in the duel's range: 0x0077b090 / 0x0077a980, marked there)
// @yo2 0x00a1d480 CWindowModelListCard::~CWindowModelListCard
// @yo2 0x00a1d430 CWindowModelListCard deleting destructor
// @yo2 0x00a1f330 CWindowModelListCardIcon::~CWindowModelListCardIcon
// @yo2 0x00a1f2e0 CWindowModelListCardIcon deleting destructor
// @yo2 0x00a1fdf0 CWindowModelListCardStar::~CWindowModelListCardStar
// @yo2 0x00a1fda0 CWindowModelListCardStar deleting destructor
// @yo2 0x00a208b0 CWindowModelListCardForbi::~CWindowModelListCardForbi
// @yo2 0x00a20860 CWindowModelListCardForbi deleting destructor
template <class Kind>
CWindowModelListT<Kind>::~CWindowModelListT() = default;

// @yo2 0x00a1d4f0 CWindowModelListCard::onInit: the dialog (yes/no or OK at (344, 312)), the list inside it
// @yo2 0x00a1def0 CWindowModelListCardAttr::onInit
// @yo2 0x00a1e8f0 CWindowModelListCardType::onInit
// @yo2 0x00a1f3a0 CWindowModelListCardIcon::onInit
// @yo2 0x00a1fe60 CWindowModelListCardStar::onInit
// @yo2 0x00a20920 CWindowModelListCardForbi::onInit
template <class Kind>
bool CWindowModelListT<Kind>::onInit() {
    if (kind_ == 1)
        inner_ = CWindowModelDialogYesNo::create(this, 344, 312, 4000, 4001, 1);
    else if (kind_ == 2)
        inner_ = CWindowModelDialogOk::create(this, 344, 312, 4002, 1);
    setSize(Kind::W, Kind::H);
    if (inner_)
        inner_->setSize(Kind::W, Kind::H);
    list_.setUser(this);
    const std::string model = std::string("CWindowModelList") + Kind::NAME;
    list_.set(CWindowTaskListboxT<Kind>::create(inner_, this, multi_));
    YO2_ASSERT(list_.task(), "error %s::CWindowTaskListbox%s::Create()", model.c_str(), Kind::NAME);
    List* l = list_.get();
    l->setInstName((model + "::" + Kind::MEMBER).c_str());
    l->setPos(8, 8);
    l->setSize(inner_->w_ - 16, inner_->h_ - inner_->bandH_ - 16);
    if (!Kind::LIST_Z) {
        l->posZ_ = 2;
        l->pos_.z = 2;
    }
    if (unknownRows_) {
        l->add(CWindowTaskCardInfoItem::NOT_FOUND);
        l->add(CWindowTaskCardInfoItem::UNKNOWN);
    }
    return true;
}

// @yo2 0x00a1dc00 CWindowModelListCard::layout: the dialog's, then the list fitted to it
// @yo2 0x00a1e600 CWindowModelListCardAttr::layout
// @yo2 0x00a1eff0 CWindowModelListCardType::layout
// @yo2 0x00a1fab0 CWindowModelListCardIcon::layout
// @yo2 0x00a20570 CWindowModelListCardStar::layout
// @yo2 0x00a21030 CWindowModelListCardForbi::layout
template <class Kind>
void CWindowModelListT<Kind>::layout() {
    if (inner_)
        inner_->layout();
    if (List* l = dynamic_cast<List*>(list_.task())) {
        l->setSize(inner_->w_ - 16, inner_->h_ - inner_->bandH_ - 16);
        l->layout();
    }
}

// --- the duel's command menu ----------------------------------------------------------------------------------------
// @yo2 0x00a22bd0 CWindowModelListDuelCmd::create (the constructor inlined)
CWindowModelListDuelCmd* CWindowModelListDuelCmd::create(CTask* parent, float x, float y, int32_t style) {
    auto* w = new CWindowModelListDuelCmd;
    w->setup(x, y, style);
    return dynamic_cast<CWindowModelListDuelCmd*>(w->CTask::create(parent, 0));
}

CWindowModelListDuelCmd::CWindowModelListDuelCmd() { setTaskName("CWindowModelListDuelCmd"); }
// (0x0077c6d0, in the duel's range, marked there)
CWindowModelListDuelCmd::~CWindowModelListDuelCmd() = default;

// @yo2 0x00a22dd0 CWindowModelListDuelCmd::onInit: the thin window 256 x 240, the list in it without its scroll bar
bool CWindowModelListDuelCmd::onInit() {
    CWindowModelThin::onInit();
    w_ = 256;
    h_ = 240;
    layout();
    list_.setUser(this);
    list_.set(CWindowTaskListboxDuelCmd::create(this, this, false));
    YO2_ASSERT(list_.task(), "error CWindowModelListDuelCmd::CWindowTaskListboxDuelCmd::Create()");
    CWindowTaskListboxDuelCmd* l = list_.get();
    l->setInstName("CWindowModelListDuelCmd::m_duelCmdList");
    l->setPos(8, 8);
    l->setSize(w_ - 16, h_ - 16);
    l->posZ_ = 2;
    l->pos_.z = 2;
    CWindowTaskScroll* s = l->scroll_.get();
    s->setDisp(false, true);
    windowSetLock(s, 2);
    return true;
}

// @yo2 0x00a23450 CWindowModelListDuelCmd::layout
void CWindowModelListDuelCmd::layout() {
    CWindowModelThin::layout();
    if (auto* l = dynamic_cast<CWindowTaskListboxDuelCmd*>(list_.task())) {
        l->setSize(w_ - 16, h_ - 16);
        l->layout();
    }
}

template class CWindowTaskViewItem<CardAttrKind>;
template class CWindowTaskViewItem<CardTypeKind>;
template class CWindowTaskViewItem<CardIconKind>;
template class CWindowTaskViewItem<CardStarKind>;
template class CWindowTaskViewItem<CardForbiKind>;
template class CWindowTaskViewItem<DuelCmdKind>;
template class CWindowTaskListboxT<CardKind>;
template class CWindowTaskListboxT<CardAttrKind>;
template class CWindowTaskListboxT<CardTypeKind>;
template class CWindowTaskListboxT<CardIconKind>;
template class CWindowTaskListboxT<CardStarKind>;
template class CWindowTaskListboxT<CardForbiKind>;
template class CWindowTaskListboxT<DuelCmdKind>;
template class CWindowModelListT<CardKind>;
template class CWindowModelListT<CardAttrKind>;
template class CWindowModelListT<CardTypeKind>;
template class CWindowModelListT<CardIconKind>;
template class CWindowModelListT<CardStarKind>;
template class CWindowModelListT<CardForbiKind>;
