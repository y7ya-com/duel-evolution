// yo2CardListView.cpp: the card list windows of the deck editor and the duel (card attribute / type / icon / star /
// limit lists, card info items). So far: the small card-property icons, each a CWindowTaskImage showing one cell
// of an icon strip for a value, hidden when the value is out of range; and the card info item, one row of a card
// list (name, attribute, type, icon, level, limit, ATK / DEF), laid out by a CCardInfoLayout.
#pragma once
#include "System/window/yo2WindowDialogs.h"
#include "System/window/yo2WindowImage.h"
#include "System/yo2Math.h"

// Attribute (1..9), monster type (1..21), spell/trap icon (1..7): 16 x 16 cells of their strips.
class CWindowTaskImageCardAttr : public CWindowTaskImage {
public:
    static CWindowTaskImageCardAttr* create(CTask* parent, IWindowTaskMediator* mediator, int32_t value);
    CWindowTaskImageCardAttr();
    ~CWindowTaskImageCardAttr() override;
    bool onInit() override;
    void setValue(int32_t value);
    int32_t value_ = 0;   // 0x3a8
    uint32_t unk3ac_ = 0;
};
YO2_SIZEOF(CWindowTaskImageCardAttr, 0x3b0);

class CWindowTaskImageCardType : public CWindowTaskImage {
public:
    static CWindowTaskImageCardType* create(CTask* parent, IWindowTaskMediator* mediator, int32_t value);
    CWindowTaskImageCardType();
    ~CWindowTaskImageCardType() override;
    bool onInit() override;
    void setValue(int32_t value);
    int32_t value_ = 0;   // 0x3a8
    uint32_t unk3ac_ = 0;
};
YO2_SIZEOF(CWindowTaskImageCardType, 0x3b0);

class CWindowTaskImageCardIcon : public CWindowTaskImage {
public:
    static CWindowTaskImageCardIcon* create(CTask* parent, IWindowTaskMediator* mediator, int32_t value);
    CWindowTaskImageCardIcon();
    ~CWindowTaskImageCardIcon() override;
    bool onInit() override;
    void setValue(int32_t value);
    int32_t value_ = 0;   // 0x3a8
    uint32_t unk3ac_ = 0;
};
YO2_SIZEOF(CWindowTaskImageCardIcon, 0x3b0);

// The deck limit (0..3, or 0..4 with `extended`); value 0 shows the cell left of the strip.
class CWindowTaskImageCardForbi : public CWindowTaskImage {
public:
    static CWindowTaskImageCardForbi* create(CTask* parent, IWindowTaskMediator* mediator, int32_t value);
    CWindowTaskImageCardForbi();
    ~CWindowTaskImageCardForbi() override;
    bool onInit() override;
    void setValue(int32_t value, bool extended);
    int32_t value_ = 0;   // 0x3a8
    uint32_t unk3ac_ = 0;
};
YO2_SIZEOF(CWindowTaskImageCardForbi, 0x3b0);

// The level number (1..12) as a 14 x 14 digit.
class CWindowTaskImageCardStarLv : public CWindowTaskImage {
public:
    static CWindowTaskImageCardStarLv* create(CTask* parent, IWindowTaskMediator* mediator, int32_t value);
    CWindowTaskImageCardStarLv();
    ~CWindowTaskImageCardStarLv() override;
    bool onInit() override;
    void setValue(int32_t value);
    int32_t value_ = 0;   // 0x3a8
    uint32_t unk3ac_ = 0;
};
YO2_SIZEOF(CWindowTaskImageCardStarLv, 0x3b0);

// A star with the level number beside it (1..12).
class CWindowTaskImageCardStar : public CWindowTaskImage {
public:
    static CWindowTaskImageCardStar* create(CTask* parent, IWindowTaskMediator* mediator, int32_t value);
    CWindowTaskImageCardStar();
    ~CWindowTaskImageCardStar() override;
    bool onInit() override;
    void setValue(int32_t value);
    int32_t value_ = 0;                              // 0x3a8
    CWindowTaskImageCardStarLv* level_ = nullptr;    // 0x3ac
};
YO2_SIZEOF(CWindowTaskImageCardStar, 0x3b0);

// --- what a card info item shows and where: the default shows every column in one row ----------------------------
class CCardInfoLayout {
public:
    enum Column : int32_t { ATTR = 1, TYPE = 2, ICON = 4, STAR = 8, NAME = 0x10, ATK = 0x20, DEF = 0x40, LIMIT = 0x80,
                            SEP = 0x100 };
    virtual Vec3 position(int32_t column) const;          // slot 0
    virtual bool has(int32_t column) const;               // slot 1
    virtual vc6::wstring atkText(int32_t card) const;     // slot 2 "%4d", "????" unknown, "-" for kinds 12..14
    virtual vc6::wstring defText(int32_t card) const;     // slot 3
    virtual vc6::wstring sepText() const;                 // slot 4 "/"
};

// --- one card's row ------------------------------------------------------------------------------------------------
class CWindowTaskCardInfoItem : public CWindowTaskControll {
public:
    enum : int32_t { NOT_FOUND = 0x100000, UNKNOWN = 0x100001 };   // setCard: text 4020 / 4021 in place of a card
    static CWindowTaskCardInfoItem* create(CTask* parent, IWindowTaskMediator* mediator, int32_t card,
                                           const CCardInfoLayout* columns);
    CWindowTaskCardInfoItem() = default;
    ~CWindowTaskCardInfoItem() override;
    bool onInit() override;
    bool onMain() override;
    // @yo2 0x00a0fb90 CWindowTaskCardInfoItem::kind
    uint32_t kind() const override { return 0x1c; }
    void layout() override;
    bool handleMessage(WindowMsg m) override;
    // @yo2 0x00a13f20 CWindowTaskCardInfoItem::hitTest (never)
    bool hitTest(float, float) override { return false; }

    void setCard(int32_t index);
    void setNameWidth(float w);

    float x_ = 0, y_ = 0;                               // 0x368 offset of the columns
    float w_ = 0, h_ = 0;                               // 0x370 512 x 16 after onInit
    CTaskPtr<CWindowTaskImageCardAttr> attr_;           // 0x378
    CTaskPtr<CWindowTaskImageCardType> type_;           // 0x384
    CTaskPtr<CWindowTaskImageCardIcon> icon_;           // 0x390
    CTaskPtr<CWindowTaskImageCardStar> star_;           // 0x39c
    CTaskPtr<CWindowTaskText> name_;                    // 0x3a8
    CTaskPtr<CWindowTaskText> atk_;                     // 0x3b4
    CTaskPtr<CWindowTaskText> def_;                     // 0x3c0
    CTaskPtr<CWindowTaskImageCardForbi> limit_;         // 0x3cc
    CTaskPtr<CWindowTaskText> sep_;                     // 0x3d8
    int32_t card_ = 0;                                  // 0x3e4 index into the card table (cardPropId)
    const CCardInfoLayout* columns_ = nullptr;          // 0x3e8
    uint32_t unk3ec_ = 0;                               // 0x3ec
};
YO2_AT(CWindowTaskCardInfoItem, x_, 0x368);
YO2_AT(CWindowTaskCardInfoItem, attr_, 0x378);
YO2_AT(CWindowTaskCardInfoItem, name_, 0x3a8);
YO2_AT(CWindowTaskCardInfoItem, sep_, 0x3d8);
YO2_AT(CWindowTaskCardInfoItem, card_, 0x3e4);
YO2_SIZEOF(CWindowTaskCardInfoItem, 0x3f0);

// --- the DuelCmd icon: the duel's command (summon, set, attack ...) 0..20 as a 16 x 16 cell -------------------------
class CWindowTaskImageDuelCmd : public CWindowTaskImage {
public:
    static CWindowTaskImageDuelCmd* create(CTask* parent, IWindowTaskMediator* mediator, int32_t value);
    CWindowTaskImageDuelCmd();
    ~CWindowTaskImageDuelCmd() override;
    bool onInit() override;
    void setValue(int32_t value);
    int32_t value_ = 0;   // 0x3a8
    uint32_t unk3ac_ = 0;
};
YO2_SIZEOF(CWindowTaskImageDuelCmd, 0x3b0);

// =====================================================================================================================
// The choice lists: the deck editor's filters (card, attribute, type, icon, level, limit) and the duel's pick
// dialogs (type, attribute, command). A list box keeps the values; its visible rows are tasks (one per stripe row,
// reused as it scrolls) showing the value at their line. A window model hosts the list in a yes/no or OK dialog.
// The exe has one class per kind with identical code; here one template each, the kind supplying what differs.

// One row: an image the subclass makes, and a text to its right.
class CWindowTaskViewImgAndTextItem : public CWindowTaskControll {
public:
    ~CWindowTaskViewImgAndTextItem() override;
    bool onInit() override;
    bool onMain() override;
    // @yo2 0x00a15fc0 CWindowTaskViewImgAndTextItem::kind
    uint32_t kind() const override { return 0x1c; }
    void layout() override;
    bool handleMessage(WindowMsg m) override;   // a left click goes to the list
    // @yo2 0x00a15cb0 CWindowTaskViewImgAndTextItem::hitTest (never)
    bool hitTest(float, float) override { return false; }
    virtual CWindowTaskImage* createImage() = 0;   // slot 19
    virtual vc6::wstring text() = 0;               // slot 20 (Shift-JIS in the exe, widened by onInit; wide here)

    float x_ = 0, y_ = 0;              // 0x368
    float w_ = 0, h_ = 0;              // 0x370 256 x 16 after onInit
    CTaskPtr<CWindowTaskImage> img_;   // 0x378
    CTaskPtr<CWindowTaskText> text_;   // 0x384
};
YO2_AT(CWindowTaskViewImgAndTextItem, img_, 0x378);
YO2_AT(CWindowTaskViewImgAndTextItem, text_, 0x384);
YO2_SIZEOF(CWindowTaskViewImgAndTextItem, 0x390);

template <class Kind>
class CWindowTaskViewItem : public CWindowTaskViewImgAndTextItem {
public:
    static CWindowTaskViewItem* create(CTask* parent, IWindowTaskMediator* mediator, int32_t value);
    CWindowTaskViewItem();
    ~CWindowTaskViewItem() override;
    CWindowTaskImage* createImage() override;
    vc6::wstring text() override;
    void setValue(int32_t value);

    int32_t value_ = 0;   // 0x390
    uint32_t unk394_ = 0;
};

// The list box: the values, and the row tasks made so far.
template <class Kind>
class CWindowTaskListboxT : public CWindowTaskListbox {
public:
    using Row = typename Kind::Row;
    static typename Kind::List* create(CTask* parent, IWindowTaskMediator* mediator, bool multi);
    CWindowTaskListboxT();
    ~CWindowTaskListboxT() override;
    void scrollToLine(int32_t line) override;   // the base's, then the rows filled from the first line shown
    void add(int32_t value);
    void addAll();          // Kind::FIRST .. Kind::END - 1
    void clearValues();

    vc6::vector<int32_t> values_;   // 0x400
    vc6::vector<Row*> rows_;        // 0x410
};

// The dialog around the list: inner_ a yes/no (kind 1) or OK (kind 2) dialog, the list in it.
template <class Kind>
class CWindowModelListT : public CWindowModelDialogDecorator {
public:
    using List = typename Kind::List;
    static CWindowModelListT* create(CTask* parent, int32_t kind, bool multi, bool unknownRows);
    CWindowModelListT();
    ~CWindowModelListT() override;
    bool onInit() override;
    void layout() override;

    int32_t kind_ = 0;             // 0x39c 1 yes/no, 2 OK
    CTaskPtr<List> list_;          // 0x3a0
    bool multi_ = false;           // 0x3ac
    bool unknownRows_ = false;     // 0x3ad onInit adds the "not found" and "unknown" rows
};

// The duel's command menu: a thin window with the list and no scroll bar.
struct DuelCmdKind;
class CWindowModelListDuelCmd : public CWindowModelThin {
public:
    static CWindowModelListDuelCmd* create(CTask* parent, float x, float y, int32_t style);
    CWindowModelListDuelCmd();
    ~CWindowModelListDuelCmd() override;
    bool onInit() override;
    void layout() override;

    CTaskPtr<CWindowTaskListboxT<DuelCmdKind>> list_;   // 0x3e8
    uint32_t unk3f4_ = 0;
};

// --- the kinds ------------------------------------------------------------------------------------------------------
class CWindowTaskListboxCard;
struct CardKind {   // the card list: CWindowTaskCardInfoItem rows
    using Row = CWindowTaskCardInfoItem;
    using List = CWindowTaskListboxCard;
    static constexpr const char* NAME = "Card";
    static constexpr const char* MEMBER = "m_cardList";
    static constexpr float W = 512, H = 240, LIST_Z = 0;
    static constexpr int32_t FIRST = 0, END = 0xc8b;   // every card of the table
};
#define YO2_CARD_LIST_KIND(Kind, Image, Name, Member, H_, Z_, First, End)                                      \
    struct Kind {                                                                                            \
        using Row = CWindowTaskViewItem<Kind>;                                                               \
        using List = CWindowTaskListboxT<Kind>;                                                              \
        using Img = Image;                                                                                   \
        static constexpr const char* NAME = Name;                                                            \
        static constexpr const char* MEMBER = Member;                                                        \
        static constexpr float W = 256, H = H_, LIST_Z = Z_;                                                 \
        static constexpr int32_t FIRST = First, END = End;                                                   \
        static vc6::wstring text(int32_t value);                                                             \
        static void show(Image* img, int32_t value);                                                         \
    };
YO2_CARD_LIST_KIND(CardAttrKind, CWindowTaskImageCardAttr, "CardAttr", "m_attrList", 192, 0, 1, 10)
YO2_CARD_LIST_KIND(CardTypeKind, CWindowTaskImageCardType, "CardType", "m_typeList", 240, 3, 1, 22)   // its list's z
YO2_CARD_LIST_KIND(CardIconKind, CWindowTaskImageCardIcon, "CardIcon", "m_iconList", 144, 0, 1, 8)
YO2_CARD_LIST_KIND(CardStarKind, CWindowTaskImageCardStar, "CardStar", "m_starList", 240, 0, 1, 1)    // added one by one
YO2_CARD_LIST_KIND(CardForbiKind, CWindowTaskImageCardForbi, "CardForbi", "m_forbiList", 240, 0, 1, 1)
YO2_CARD_LIST_KIND(DuelCmdKind, CWindowTaskImageDuelCmd, "DuelCmd", "m_duelCmdList", 240, 0, 0, 0)
#undef YO2_CARD_LIST_KIND

// The card list box also holds the columns its rows show.
class CWindowTaskListboxCard : public CWindowTaskListboxT<CardKind> {
public:
    CCardInfoLayout layout_;   // 0x420
    uint32_t unk424_ = 0;
};
YO2_AT(CWindowTaskListboxCard, values_, 0x400);
YO2_AT(CWindowTaskListboxCard, rows_, 0x410);
YO2_AT(CWindowTaskListboxCard, layout_, 0x420);
YO2_SIZEOF(CWindowTaskListboxCard, 0x428);

using CWindowTaskViewItemCardAttr = CWindowTaskViewItem<CardAttrKind>;
using CWindowTaskViewItemCardType = CWindowTaskViewItem<CardTypeKind>;
using CWindowTaskViewItemCardIcon = CWindowTaskViewItem<CardIconKind>;
using CWindowTaskViewItemCardStar = CWindowTaskViewItem<CardStarKind>;
using CWindowTaskViewItemCardForbi = CWindowTaskViewItem<CardForbiKind>;
using CWindowTaskViewItemDuelCmd = CWindowTaskViewItem<DuelCmdKind>;
using CWindowTaskListboxCardAttr = CWindowTaskListboxT<CardAttrKind>;
using CWindowTaskListboxCardType = CWindowTaskListboxT<CardTypeKind>;
using CWindowTaskListboxCardIcon = CWindowTaskListboxT<CardIconKind>;
using CWindowTaskListboxCardStar = CWindowTaskListboxT<CardStarKind>;
using CWindowTaskListboxCardForbi = CWindowTaskListboxT<CardForbiKind>;
using CWindowTaskListboxDuelCmd = CWindowTaskListboxT<DuelCmdKind>;
using CWindowModelListCard = CWindowModelListT<CardKind>;
using CWindowModelListCardAttr = CWindowModelListT<CardAttrKind>;
using CWindowModelListCardType = CWindowModelListT<CardTypeKind>;
using CWindowModelListCardIcon = CWindowModelListT<CardIconKind>;
using CWindowModelListCardStar = CWindowModelListT<CardStarKind>;
using CWindowModelListCardForbi = CWindowModelListT<CardForbiKind>;
YO2_SIZEOF(CWindowTaskViewItemCardAttr, 0x398);
YO2_AT(CWindowTaskViewItemCardAttr, value_, 0x390);
YO2_SIZEOF(CWindowTaskListboxCardAttr, 0x420);
YO2_AT(CWindowModelListCardAttr, kind_, 0x39c);
YO2_AT(CWindowModelListCardAttr, list_, 0x3a0);
YO2_AT(CWindowModelListCardAttr, multi_, 0x3ac);
YO2_AT(CWindowModelListCardAttr, unknownRows_, 0x3ad);
YO2_SIZEOF(CWindowModelListCardAttr, 0x3b0);
YO2_AT(CWindowModelListDuelCmd, list_, 0x3e8);
YO2_SIZEOF(CWindowModelListDuelCmd, 0x3f8);
