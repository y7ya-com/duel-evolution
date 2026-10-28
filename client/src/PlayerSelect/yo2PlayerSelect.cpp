#include "yo2PlayerSelect.h"

#include <cstdio>

#include "Net/NetAccount.h"
#include "System/yo2Debug.h"
#include "playerSelectExt.h"
#include "yo2PlayerSelectEntry.h"

struct CWindowPlayerSelect::Layout {
    YO2_AT(CWindowPlayerSelect, user_, 0x400);
    YO2_AT(CWindowPlayerSelect, selected_, 0x404);
    YO2_AT(CWindowPlayerSelect, unk408_, 0x408);
    YO2_AT(CWindowPlayerSelect, avatars_, 0x42c);
    YO2_AT(CWindowPlayerSelect, rows_, 0x45c);
    YO2_AT(CWindowPlayerSelect, deletes_, 0x48c);
    YO2_AT(CWindowPlayerSelect, levels_, 0x4bc);
    YO2_AT(CWindowPlayerSelect, back_, 0x4ec);
    YO2_AT(CWindowPlayerSelect, avatarMade_, 0x4f8);
};

namespace {
enum : int32_t { TXT_HELP = 0xc22, TXT_NO_DATA = 0xc24, TXT_DELETE = 0xfa7 };
enum : uint32_t { SE_ENTER = 0x10000001, SE_BACK = 0x10000002 };
constexpr uint32_t LOCK_BUSY = 1;

struct TaskLockAccess : CTask {
    static uint32_t& flags(CTask* t) { return t->*(&TaskLockAccess::lockFlags_); }
};
void hideControl(CElement* c) {   // CWindowTaskText::hide (0x005d5700) on any control
    c->setDisp(false, true);
    TaskLockAccess::flags(c) |= 2;
}
void showControl(CElement* c) {   // CWindowTaskText::show (0x005d56d0)
    windowClearLock(c, 2);
    c->setDisp(true, true);
}
// A button: minimum size, z 2, top left (x, y), size (w, h).
void placeSwitch(CWindowTaskTextSwitch* s, float x, float y, float w, float h) {
    s->minW_ = w;
    s->unk5b4_ = h;
    s->layout();
    s->z_ = s->pos_.z = 2;
    s->x_ = s->pos_.x = x;   // CWindowTaskSwitch::setPos (0x005e99d0)
    s->y_ = s->pos_.y = y;
    s->w_ = w;               // CWindowTaskSwitch::setSize (0x005e9a00)
    s->h_ = h;
    s->layout();
}
}  // namespace

// @yo2 0x0080c920 CWindowTaskTextSwitch::setCaptionAlign (inlined copy)
void textSwitchSetCaptionAlign(CWindowTaskTextSwitch* s, int32_t align) {
    s->caption_.get()->text_.get()->setAlign(align);
    s->caption_.get()->shadow_.get()->setAlign(align);
}

// @yo2 0x00809d80 CWindowPlayerSelect::New (the constructor is inlined into it)
CWindowPlayerSelect* CWindowPlayerSelect::create(CTask* parent, CMyUser* user, float x, float y) {
    auto* w = new CWindowPlayerSelect;
    w->x_ = x;
    w->user_ = user;
    w->y_ = y;
    return dynamic_cast<CWindowPlayerSelect*>(w->CTask::create(parent, 10000));
}

CWindowPlayerSelect::CWindowPlayerSelect() {
    for (auto* p : {&avatars_[0], &avatars_[1], &avatars_[2], &avatars_[3]})
        p->setUser(this);
    for (int i = 0; i < SLOTS; i++) {
        rows_[i].setUser(this);
        deletes_[i].setUser(this);
    }
    back_.setUser(this);
}

// @yo2 0x0080a070 CWindowPlayerSelect::~CWindowPlayerSelect
// @yo2 0x0080a040 CWindowPlayerSelect deleting destructor
CWindowPlayerSelect::~CWindowPlayerSelect() = default;

// @yo2 0x0080a2e0 CWindowPlayerSelect::onInit: 480 x 272 with a 208 band, the help text, Back, four rows (button,
// level, Delete), the rows filled in, the first character selected; every character's waist-up avatar, hidden but the
// selected one's
bool CWindowPlayerSelect::onInit() {
    CWindowTaskModel::onInit();
    w_ = 480;
    callback_ = nullptr;
    h_ = 272;
    frame_ = CWindowTaskFrameBottomThick::create(this, this, 1);
    frame_->setInstName("青いプレイヤ選択ウインドウ");
    frame_->layout();
    textField_ = CWindowTaskTextField::create(this, this);
    textField_->setInstName("説明の文字列");
    textField_->setText(windowText(TXT_HELP).c_str());
    selected_ = -1;

    back_.set(CWindowTaskTextSwitch::create(this, this));
    back_.get()->setInstName("選択スイッチ");
    placeSwitch(back_.get(), 376, 240, 88, 24);
    back_.get()->setText(windowText(RESULT_BACK).c_str());

    for (int i = 0; i < SLOTS; i++) {
        const float y = static_cast<float>(i * 40 + 72);
        rows_[i].set(CWindowTaskTextSwitch::create(this, this));
        CWindowTaskTextSwitch* row = rows_[i].get();
        row->setInstName("プレイヤ選択ボタン");
        placeSwitch(row, 16, y, 344, 32);
        row->checked_ = false;
        textSwitchSetCaptionAlign(row, CWindowTaskText::LEFT);

        levels_[i].setUser(this);
        levels_[i].set(CWindowTaskText::create(this, this));
        YO2_ASSERT(levels_[i].task() != nullptr, "PLAYER NAME INIT ERROR!");
        CWindowTaskText* level = levels_[i].get();
        level->setInstName("プレイヤ選択ボタンのLV表示文字");
        level->posZ_ = level->pos_.z = static_cast<float>(row->z() + 3.0f);
        level->x_ = 288;
        level->y_ = y + 8;
        level->pos_ = Vec3{288, y + 8, level->posZ_};
        level->setArea(0x80, 0x10);
        level->setAlign(CWindowTaskText::LEFT);
        level->setPageLines(1);
        level->setDisp(true, true);

        deletes_[i].set(CWindowTaskTextSwitch::create(this, this));
        CWindowTaskTextSwitch* del = deletes_[i].get();
        del->setInstName("削除ボタン");
        placeSwitch(del, 376, y, 80, 32);
        del->checked_ = false;
        textSwitchSetCaptionAlign(del, CWindowTaskText::CENTRE);
        del->setText(windowText(TXT_DELETE).c_str());
    }
    refresh();

    for (int i = 0; i < SLOTS; i++)
        if (selected_ == -1 && player(i)->valid)
            selected_ = i;
    const int32_t world = gameWorldId(), other = world == 0;
    for (int i = 0; i < SLOTS; i++) {
        CPlayerInfo* p = player(i);
        if (!p->valid)
            continue;
        CAvatarData* shown = &p->avatar[world];
        avatarValidate(shown, world, true);
        avatarCopyLooks(*shown, &p->avatar[other]);
    }
    for (int i = 0; i < SLOTS; i++) {
        CPlayerInfo* p = player(i);
        if (!p->valid)
            continue;
        avatars_[i].set(waistUpAvatarNew(CPlayerSelectScene::instance(), this, 1, &p->avatar[world], 0, 0, 1));
        char name[32];
        std::snprintf(name, sizeof name, "ＷＵアバター[%d]", i);
        avatars_[i].get()->setInstName(name);
        waistUpAvatarSetVisible(avatars_[i].get(), false);
        waistUpAvatarSetBreathing(avatars_[i].get(), true);
        waistUpAvatarSetScale(avatars_[i].get(), 50);
        waistUpAvatarSetPos(avatars_[i].get(), 200, 0);
        avatarMade_[i] = true;
    }
    if (selected_ >= 0) {
        waistUpAvatarSetVisible(avatars_[selected_].get(), true);
        waistUpAvatarGreet(avatars_[selected_].get());
    }
    setBandHeight(208);
    useOwnCallback();
    layout();
    modal_ = true;
    return true;
}

// @yo2 0x0080c970 CWindowPlayerSelect::player
CPlayerInfo* CWindowPlayerSelect::player(int32_t slot) const {
    return slot > 3 ? nullptr : &user_->players[slot];
}

// @yo2 0x0080c9b0 CWindowPlayerSelect::refresh: a row per slot, its name and level, or "no data" without Delete
// (and without its avatar); Delete hidden when the launcher forbids deleting
void CWindowPlayerSelect::refresh() {
    for (int i = 0; i < SLOTS; i++) {
        CPlayerInfo* p = player(i);
        if (!p->valid) {   // "データなし[%s]"
            rows_[i].get()->setTextId(TXT_NO_DATA);
            hideControl(levels_[i].get());
            hideControl(deletes_[i].get());
            deletes_[i].get()->enabled_ = false;
            if (avatarMade_[i])
                waistUpAvatarSetVisible(avatars_[i].get(), false);
            continue;
        }
        rows_[i].get()->setText(windowWiden(p->name).c_str());   // (the exe widens through 0x005977b0)
        char lv[16];
        std::snprintf(lv, sizeof lv, "Lv%02d", p->level);
        levels_[i].get()->setTextA(lv);
        showControl(levels_[i].get());
        const bool canDelete = !systemConfigPlayerDeleteLocked();   // else "■プレイヤ削除禁止"
        if (canDelete)
            showControl(deletes_[i].get());
        else
            hideControl(deletes_[i].get());
        deletes_[i].get()->enabled_ = canDelete;
    }
}

// @yo2 0x0080d160 CWindowPlayerSelect::onMain: the row under the mouse becomes the selection and shows its avatar
// (greeting when it changes); the developers' keys play motions and faces on it
bool CWindowPlayerSelect::onMain() {
    layout();
    int32_t mx, my;
    windowMouse(&mx, &my);
    const int32_t was = selected_;
    for (int i = 0; i < SLOTS; i++)
        if (rows_[i].get()->hitTest(static_cast<float>(mx), static_cast<float>(my)) ||
            deletes_[i].get()->hitTest(static_cast<float>(mx), static_cast<float>(my)))
            selected_ = i;
    if (selected_ != was) {
        CPlayerInfo* p = selected_ < SLOTS ? player(selected_) : nullptr;
        if (p && p->valid) {
            waistUpAvatarSetVisible(avatars_[selected_].get(), true);
            waistUpAvatarGreet(avatars_[selected_].get());
        }
    }
    for (int i = 0; i < SLOTS; i++)
        if (i != selected_ && avatarMade_[i])
            waistUpAvatarSetVisible(avatars_[i].get(), false);
    if (selected_ < 0)
        return true;
    CElement* a = avatars_[selected_].get();
    // DIK_1..DIK_5 (DIK_5 twice: the sixth motion is unreachable): motions; D N P S C: faces
    static const struct { int32_t key, motion; } motions[] = {
        {2, 100}, {3, 800}, {4, 1500}, {5, 2500}, {6, 3500}, {6, 4500}};
    for (const auto& m : motions)
        if (keyPushed(m.key)) {
            waistUpAvatarPlay(a, m.motion, 30);
            return true;
        }
    static const struct { int32_t key, face; } faces[] = {{0x20, 2}, {0x31, 0}, {0x19, 1}, {0x1f, 4}, {0x2e, 3}};
    for (const auto& f : faces)
        if (keyPushed(f.key)) {
            waistUpAvatarSetFace(a, f.face);
            return true;
        }
    return true;
}

// @yo2 0x0080d6e0 CWindowPlayerSelect::setBusy: lock bit 1 on the window and every row and Delete button
bool CWindowPlayerSelect::setBusy(bool on) {
    auto set = [on](CTask* t) {
        if (on)
            TaskLockAccess::flags(t) |= LOCK_BUSY;
        else
            TaskLockAccess::flags(t) &= ~LOCK_BUSY;
    };
    set(this);
    set(back_.get());
    for (int i = 0; i < SLOTS; i++) {
        set(rows_[i].get());
        set(deletes_[i].get());
    }
    layout();
    return true;
}

// @yo2 0x0080d7f0 CWindowPlayerSelect::onControlEvent: a row reports its slot, Delete 4 + its slot, Back 0xfa5
void CWindowPlayerSelect::onControlEvent(CWindowTaskControll* sender) {
    bringToFront();
    if (!callback_)
        return;
    for (int i = 0; i < SLOTS; i++) {
        if (sender == rows_[i].task()) {   // "プレイヤ[%d]押された"
            soundPlay(SE_ENTER, 0);
            callback_->call(this, CALLBACK_MESSAGE_TYPE(0), i);
        }
        if (sender == deletes_[i].task()) {   // "削除ボタン[%d]押された"
            soundPlay(SE_ENTER, 0);
            callback_->call(this, CALLBACK_MESSAGE_TYPE(0), RESULT_DELETE + i);
        }
    }
    if (sender == back_.task()) {
        soundPlay(SE_BACK, 0);
        callback_->call(this, CALLBACK_MESSAGE_TYPE(0), RESULT_BACK);
    }
}

// @yo2 0x0080a020 CWindowPlayerSelect::applyZ (re-layout only)
void CWindowPlayerSelect::applyZ() { layout(); }

// @yo2 0x0080d980 CWindowPlayerSelect::layout: the body as every dialog's, the help text 1 in front
void CWindowPlayerSelect::layout() {
    pos_ = Vec3{x_, y_, z_};
    layoutBody();
    textField_->posZ_ = 1;
    textField_->layout();
}
