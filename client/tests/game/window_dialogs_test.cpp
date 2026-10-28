// src/System/window/yo2WindowDialogs.cpp: the thin text window, the yes/no and OK dialogs, CDialogCallback.
#include <cmath>

#include "Game/yo2TgtAvaListDlg.h"
#include "System/window/yo2WindowDialogs.h"
#include "System/yo2StringDB.h"
#include "System/yo2ZSort.h"
#include "game_test.h"
#include "window_stubs.h"

struct FakeText : CStringDB {
    vc6::string get(uint32_t i) const override { return i == 10 ? "Yes" : i == 11 ? "No" : i == 12 ? "OK" : "?"; }
};

static void updateTree(CElement* e) {   // what TM_MAIN does to the matrices, parents first
    e->updateMatrix();
    for (CTask* c : e->children())
        if (auto* ce = dynamic_cast<CElement*>(c))
            updateTree(ce);
}

static bool approx(float a, float b) { return std::fabs(a - b) < 1e-4f; }
static std::u16string shown(CWindowTaskTextField* tf) { return std::u16string(elmOf(tf->text_.get())->text); }

int main() {
    CZSortSet layers;
    g_zsortSet = &layers;
    FakeText text;
    g_stringDB = &text;
    CWindowTaskFactory::create();
    CElement* root = CElement::createRoot();

    // CDialogCallback: message 0 keeps the value, 1-4 copy a text
    CDialogCallback cb;
    CHECK(cb.message_ == -1 && cb.result_ == -1);
    cb.onResult(nullptr, CALLBACK_MESSAGE_TYPE(0), 4001);
    CHECK(cb.result_ == 4001 && cb.message_ == 0);
    cb.onResult(nullptr, CALLBACK_MESSAGE_TYPE(3), reinterpret_cast<intptr_t>(u"name"));
    CHECK(cb.texts_[2] == u"name" && cb.result_ == 4001 && cb.message_ == 3);
    cb.onResult(nullptr, CALLBACK_MESSAGE_TYPE(5), 7);
    CHECK(cb.message_ == 5 && cb.result_ == 4001);

    // the thin window: text field 8 pixels inside the frame, black text on a see-through white panel, modal
    CWindowModelThin* thin = CWindowModelThin::create(root, 10, 20, 1);
    CHECK(thin && thin->taskName() == "枠の細いウィンドウ" && thin->modal_ && thin->style_ == 1);
    CHECK(thin->frame_->instName() == "CWindowModelThinのフレーム");
    CHECK(thin->textField_->instName() == "CWindowModelThinのテキストフィールド");
    CHECK(thin->frame_->w_ == 336 && thin->frame_->h_ == 144 && thin->frame_->color_[3] == 0.7f);
    CHECK(thin->textField_->w_ == 320 && thin->textField_->h_ == 128 && thin->textField_->x_ == 8);
    CHECK(thin->textField_->back_->color_[3] == 0.7f);
    CHECK(thin->openAnim_.kind == 2 && thin->openAnim_.cx == 178 && thin->openAnim_.cy == 92);
    CHECK(thin->openAnim_.stepW == 11 && thin->openAnim_.stepH == 4 && thin->openAnim_.frames == 15);
    CHECK(thin->pos_.x == 10 && thin->pos_.y == 20 && thin->maxZ() == int32_t(thin->z_ + 5));
    thin->setText(u"hello");
    CHECK(shown(thin->textField_.get()) != u"hello");   // kept until the next layout
    thin->onControlCommand(nullptr);
    CHECK(shown(thin->textField_.get()) == u"hello");
    thin->setPanelAlpha(0.25f);
    CHECK(thin->frame_->color_[3] == 0.25f && thin->textField_->back_->color_[3] == 0.25f);

    // yes / no: the parts exist before the task does; focus starts on 『いいえ』
    CWindowModelDialogYesNo* yn = CWindowModelDialogYesNo::create(root, 0, 0, 10, 11, 1);
    CHECK(yn && yn->taskName() == "『はい』『いいえ』ダイアログ" && yn->kind_ == 1 && yn->modal_);
    CHECK(yn->yes_->instName() == "CWindowModelDialogYesNoの『はい』ボタン" && yn->no_ && yn->no_->focused_ == 1);
    CHECK(yn->yesTextId_ == 10 && yn->noTextId_ == 11 && yn->bandH_ == 32 && yn->result() == -1);
    yn->layout();   // the first layout placed the buttons with their old height; now they are 80 x 24
    CHECK(approx(yn->yes_->x_, 44) && approx(yn->yes_->y_, 112) && approx(yn->no_->x_, 212));
    CHECK(yn->yes_->w_ == 80 && yn->yes_->h_ == 24 && yn->yes_->z_ == 1);
    CHECK(yn->frame_->w_ == 336 && yn->frame_->bottomH_ == 32 && yn->textField_->h_ == 96);
    yn->onControlEvent(yn->yes_);
    CHECK(yn->result() == CDialogCallback::YES);
    yn->resetResult();
    yn->onControlEvent(yn->no_);
    CHECK(yn->result() == CDialogCallback::NO);
    updateTree(yn);   // focus bands come from the controls' world z (window z + 1)
    yn->mediatorSlot2(yn->no_);
    CHECK(yn->yes_->focused_ == 1 && yn->no_->focused_ == 0);
    yn->mediatorSlot3(yn->yes_);
    CHECK(yn->no_->focused_ == 1);
    yn->setText(u"Delete?");
    CHECK(shown(yn->textField_) == u"Delete?");
    yn->setTextAlign(2);
    CHECK(elmOf(yn->textField_->text_.get())->align == 2);

    // OK: built in onInit, the button centred on the band in front of the frame
    CWindowModelDialogOk* ok = CWindowModelDialogOk::create(root, 5, 6, 12, 1);
    CHECK(ok && ok->taskName() == "『OK』ダイアログ" && ok->kind_ == 2 && ok->okTextId_ == 12 && ok->modal_);
    CHECK(ok->ok_->focused_ == 1 && ok->result() == -1 && ok->frame_->bottomH_ == 32);
    CHECK(approx(ok->ok_->x_, (336 - ok->ok_->w_) * 0.5f) && ok->ok_->z_ == 2);
    ok->onControlEvent(ok->ok_);
    CHECK(ok->result() == CDialogCallback::YES);
    ok->resetResult();
    ok->onControlEvent(nullptr);
    CHECK(ok->result() == -1);

    // the error dialog: OK text 4002, centred, topmost, over an invisible screen-sized shield; holds CTRL_ERROR
    CWindowModelDialogError* err = CWindowModelDialogError::create(root);
    CHECK(err && err->taskName() == "エラー用ダイアログ" && err->okTextId_ == 4002 && err->style_ == 0);
    CHECK(err->topmost_ && g_windowFactory->topWindow() == err && g_gameCtrl.now() == CTRL_ERROR);
    CWindowTaskBackPlane* shield = err->shield_.get();
    CHECK(shield->w_ == 1024 && shield->h_ == 768 && shield->color_[3] == 0);
    CHECK(err->x_ == 344 && err->y_ == 312 && shield->x_ == -344 && shield->y_ == -312);
    err->destroy(__FILE__, __LINE__);
    CHECK(g_gameCtrl.now() != CTRL_ERROR);

    // the list window: icon bar, frame under it, list inside, × at the right
    CWindowModelList* lw = CWindowModelList::create(root, 100, 50);
    CHECK(lw && lw->taskName() == "単純なリストのウィンドウ" && lw->modal_ && lw->w_ == 248 && lw->h_ == 128);
    CHECK(lw->bar_->instName() == "CWindowModelListの" && lw->bar_->w_ == 248);
    CHECK(lw->frame_->w_ == 248 && lw->frame_->h_ == 104 && lw->frame_->y_ == 24);
    CHECK(lw->list_->w_ == 232 && lw->list_->h_ == 96 && lw->list_->x_ == 8 && lw->list_->y_ == 24);
    CHECK(lw->hide_->x_ == 229 && lw->hide_->z_ == 1 && lw->pos_.x == 100 && lw->maxZ() == int32_t(lw->z_ + 6));
    lw->addItem(u"one");
    lw->addItem(u"two");
    CHECK(lw->list_->itemCount() == 2);
    lw->clear();
    CHECK(lw->list_->itemCount() == 0);
    lw->onControlEvent(lw->list_.get());
    CHECK(!lw->closeRequested_);
    lw->onControlEvent(lw->hide_.get());
    CHECK(lw->closeRequested_);
    lw->w_ = 300;
    lw->layout();
    CHECK(lw->list_->w_ == 284 && lw->hide_->x_ == 281 && lw->bar_->w_ == 300);
    lw->setPos(7, 9);
    CHECK(lw->x_ == 7 && lw->pos_.y == 9);

    // the decorator passes everything to inner_, and has defaults without one
    auto* dec = new CWindowModelDialogDecorator;
    dec->z_ = 51003.7f;
    CHECK(dec->result() == 0 && !dec->textField() && dec->onMain() && dec->maxZ() == 51003);
    dec->layout();
    dec->setText(u"x");
    ok->resetResult();
    dec->inner_ = ok;
    CHECK(dec->textField() == ok->textField_ && dec->maxZ() == ok->maxZ() && dec->result() == -1);
    dec->setText(u"inner");
    CHECK(shown(ok->textField_) == u"inner");
    dec->onControlEvent(ok->ok_);
    CHECK(dec->result() == CDialogCallback::YES);
    dec->resetResult();
    CHECK(ok->result() == -1);
    dec->setBandHeight(40);
    CHECK(ok->bandH_ == 40 && ok->frame_->bottomH_ == 40);
    dec->setTextAlign(3);
    CHECK(elmOf(ok->textField_->text_.get())->align == 3);
    CHECK(dynamic_cast<CWindowModelDialogDecorator*>(dec->CTask::create(root, 0)));

    g_windowFactory->destroyAllWindows();
    CHECK(g_windowFactory->windows_.empty() && g_windowFactory->controls_.empty());
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    g_stringDB = nullptr;
    std::printf("window_dialogs_test ok\n");
}
