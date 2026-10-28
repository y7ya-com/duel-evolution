// CFindMenu (the exe's src\Lobby\yo2playerListDlg.cpp).
#include "Lobby/yo2FindMenu.h"

#include "Lobby/yo2LobbyExtern.h"
#include "Net/NetUi.h"
#include "System/window/yo2UGDialogBase.h"

namespace {
constexpr float kScreenW = 1024, kScreenH = 768;   // 0x00be963c / 0x00be9640
constexpr float kOpenX = 230;
}  // namespace

// @yo2 0x0088d230 CFindMenu::create (priority 10000)
CFindMenu* CFindMenu::create(CTask* parent) {
    return dynamic_cast<CFindMenu*>((new CFindMenu)->CTask::create(parent, 10000));
}

CFindMenu::CFindMenu() = default;

// @yo2 0x0088d460 CFindMenu deleting destructor
// @yo2 0x0088d490 CFindMenu::~CFindMenu (the two CTaskPtrs, then CWindowTaskModel)
CFindMenu::~CFindMenu() = default;

// @yo2 0x0088d510 CFindMenu::onInit: built hidden, never ticked until open(), always in front
bool CFindMenu::onInit() {
    build();
    setDisp(false, true);
    choice_ = 0;
    lockFlags_ |= 2;
    toggleB_ = false;
    toggleA_ = false;
    setTopmost(true);
    return true;
}

// @yo2 0x0088d580 CFindMenu::build: 256 x 100 at the mouse (z 10), a frame and an active list box at 0.9, the
// items itemMask_ asks for
void CFindMenu::build() {
    h_ = 100;
    w_ = 256;
    int32_t mx = 0, my = 0;
    windowMouseGetXY(&mx, &my);
    pos_.z = 10;
    pos_.x = static_cast<float>(mx);
    pos_.y = static_cast<float>(my);
    frame_.setUser(this);
    frame_.set(CWindowTaskFrameThin::create(this, this, 1));
    YO2_ASSERT(frame_.task(), "生成失敗(CWindowTaskFrameThin)");
    frame_.get()->setInstName("CWindowTaskFrameThin m_frame");
    frame_->setAlpha(0.9f);
    list_.setUser(this);
    list_.set(CWindowTaskActiveListbox::create(this, this, false));
    YO2_ASSERT(list_.task(), "生成失敗(CWindowTaskActiveListbox)");
    list_.get()->setInstName("CWindowTaskActiveListbox m_list");
    list_->setAlpha(0.9f);
    itemCount_ = 0;
    struct Item {
        uint32_t bit;
        uint32_t textId;
        int32_t choice;
    };
    static const Item kItems[] = {{ITEM_1, 0x1437, PICK_1},       {ITEM_2, 0x1436, PICK_2}, {ITEM_A, 0x143e, 7},
                                  {ITEM_B, 0x143f, 8},            {ITEM_3, 0x143a, PICK_3}, {ITEM_4, 0x144e, PICK_4},
                                  {ITEM_0, 0x143b, PICK_0}};
    for (const Item& it : kItems)
        if (itemMask_ & it.bit) {
            list_->addItem(windowText(it.textId).c_str());
            items_[itemCount_++] = it.choice;
        }
    list_->setAlpha(0.7f);
    armed_ = false;
    modal_ = true;
    lobbyMouseFlush();
    bringToFront();
    layout();
}

// @yo2 0x0088e830 CFindMenu::open: at x 230 and the mouse's height, kept on the 1024 x 768 screen (the exe clamps the
// mouse's x too, then doesn't use it)
void CFindMenu::open() {
    int32_t mx = 0, my = 0;
    armed_ = false;
    windowMouseGetXY(&mx, &my);
    if (mx < 0) mx = 0;
    if (static_cast<float>(mx) + w_ > kScreenW) mx = static_cast<int32_t>(kScreenW - w_);
    if (my < 0) my = 0;
    if (static_cast<float>(my) + h_ > kScreenH) my = static_cast<int32_t>(kScreenH - h_);
    x_ = pos_.x = kOpenX;
    y_ = pos_.y = static_cast<float>(my);
    bringToFront();
    lockFlags_ &= ~2u;
    setDisp(true, true);
    bringToFront();
}

// @yo2 0x0088e960 CFindMenu::close: hidden and frozen; the owner hears it as a control event from this menu
void CFindMenu::close() {
    setDisp(false, true);
    lockFlags_ |= 2;
    mediator_->onControlEvent(asSender());
}

// The exe passes its IWindowTaskColleague part (this + 0x398) as the sender; the owner only compares it.
CWindowTaskControll* CFindMenu::asSender() {
    return static_cast<CWindowTaskControll*>(static_cast<void*>(static_cast<IWindowTaskColleague*>(this)));
}

// @yo2 0x0088eb10 CFindMenu::pick0
// @yo2 0x0088e9b0 CFindMenu::pick1
// @yo2 0x0088e9e0 CFindMenu::pick2
// @yo2 0x0088eab0 CFindMenu::pick3
// @yo2 0x0088eae0 CFindMenu::pick4
// @yo2 0x0088ea10 CFindMenu::toggleA: 5 when it goes on, 7 when off
// @yo2 0x0088ea60 CFindMenu::toggleB: 6 / 8
void CFindMenu::pick(int32_t item) {
    switch (item) {
    case PICK_0: case PICK_1: case PICK_2: case PICK_3: case PICK_4:
        choice_ = item;
        break;
    case 7:
        toggleA_ = !toggleA_;
        choice_ = toggleA_ ? TOGGLE_A_ON : TOGGLE_A_OFF;
        break;
    case 8:
        toggleB_ = !toggleB_;
        choice_ = toggleB_ ? TOGGLE_B_ON : TOGGLE_B_OFF;
        break;
    default:
        return;   // the exe's jump table does nothing for 5 and 6
    }
    picked_ = true;
    close();
}

// @yo2 0x0088eb40 CFindMenu::onMain: a clicked row picks; once the button has been up, a click outside closes
bool CFindMenu::onMain() {
    int32_t mx = 0, my = 0;
    int32_t w = static_cast<int32_t>(w_), h = static_cast<int32_t>(h_);
    windowMouseGetXY(&mx, &my);
    Vec3 at = frame_->worldTranslation();
    if (!windowMouseLeftPushed() && isVisible(true)) armed_ = true;
    int32_t row = list_->clicked_;
    if (row >= 0) {
        list_->clicked_ = -1;
        appPlaySound(0x10000001, 0);
        pick(items_[row]);
    }
    float fx = static_cast<float>(mx), fy = static_cast<float>(my);
    bool inside = at.x < fx && at.y < fy && fx < static_cast<float>(w) + at.x && fy < static_cast<float>(h) + at.y;
    if (!inside && windowMouseLeftPushed() && armed_) {
        list_->clicked_ = -1;
        armed_ = false;
        close();
    }
    return true;
}

// @yo2 0x0088eda0 CFindMenu::layout: the frame around the rows (16 pixels each, one more for the margins), the list
// 8 pixels inside it
void CFindMenu::layout() {
    pos_ = {x_, y_, z_};
    CWindowTaskFrameThin* f = frame_.get();
    f->x_ = f->y_ = 0;
    f->pos_.x = f->pos_.y = 0;
    CWindowTaskActiveListbox* l = list_.get();
    l->x_ = l->y_ = 8;
    l->pos_.x = l->pos_.y = 8;
    h_ = static_cast<float>((l->itemCount() + 1) * 16);
    f->w_ = w_;
    f->h_ = h_;
    f->layout();
    float lw = w_ - 16.0f;
    l->h_ = static_cast<int32_t>(h_ - 16.0f);
    if (static_cast<float>(l->w_) != lw) {
        l->w_ = static_cast<int32_t>(lw);
        l->recountLines();
    }
    l->layout();
    f->z_ = 0;
    f->pos_.z = 0;
    l->posZ_ = 0;
    l->pos_.z = 0;
}
