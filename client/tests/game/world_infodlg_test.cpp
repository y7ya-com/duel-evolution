// yo2InfoDlgCommon.cpp: CInfoDlgCommon's creation (message sources, flags, task tree) and its dialog.
#include "Game/yo2InfoDlgCommon.h"
#include "System/yo2StringDB.h"
#include "System/yo2ZSort.h"
#include "game_test.h"
#include "window_stubs.h"

struct FakeText : CStringDB {
    vc6::string get(uint32_t i) const override { return i == 4100 ? "Save the deck?" : "?"; }
};

int main() {
    gameSetFileProvider(fixtureProvider);
    FakeText text;
    delete g_stringDB;
    g_stringDB = &text;
    fixtureFiles()["data/x/rule.txt"] = std::string("line one\nline two\0junk", 22);
    CZSortSet layers;
    g_zsortSet = &layers;
    CWindowTaskFactory::create();
    CTask* root = CTask::createRoot();
    CTask* owner = CTask::newChild(root, 5);

    CInfoDlgCommon* a = CInfoDlgCommon::createText(root, owner, 2, 4100, 0x1000);
    CHECK(a && a->parent() == root && a->priority() == 10000 && a->taskName() == "CInfoDlgCommon");
    CHECK(a->owner_ == owner && a->kind_ == 2 && a->arg_ == 0 && a->message_ == "Save the deck?");
    CHECK(a->flags_ == (0x1000 | CInfoDlgCommon::SIMPLE));
    auto* ad = dynamic_cast<CWindowModelDialogOk*>(a->dialog_.get());   // onInit ran in create
    CHECK(ad && ad->okTextId_ == 2 && ad->w_ == 272 && ad->h_ == 120 && ad->parent() == owner);

    CInfoDlgCommon* b = CInfoDlgCommon::create(root, owner, 1, "hello", 0);
    CHECK(b->message_ == "hello" && b->flags_ == CInfoDlgCommon::SIMPLE && b->kind_ == 1);

    CInfoDlgCommon* c = CInfoDlgCommon::createFile(root, owner, 3, "data/x/rule.txt", 0x2000);
    CHECK(c->message_ == "line one\nline two" && c->flags_ == (0x2000 | CInfoDlgCommon::SIMPLE));

    CInfoDlgCommon* d = CInfoDlgCommon::createText(root, owner, 4, 77, 4100, 0);
    CHECK(d->arg_ == 77 && d->kind_ == 4 && d->message_ == "Save the deck?" && d->flags_ == CInfoDlgCommon::WITH_ARG);
    auto* dd = dynamic_cast<CWindowModelDialogYesNo*>(d->dialog_.get());
    CHECK(dd && dd->yesTextId_ == 4 && dd->noTextId_ == 77);

    CInfoDlgCommon* e = CInfoDlgCommon::create(root, owner, 5, 8, "hi", 0x4000);
    CHECK(e->arg_ == 8 && e->message_ == "hi" && e->flags_ == (0x4000 | CInfoDlgCommon::WITH_ARG));

    CInfoDlgCommon* f = CInfoDlgCommon::createFile(root, owner, 6, 9, "data/x/missing.txt", 0);
    CHECK(f->arg_ == 9 && f->message_.empty() && f->flags_ == CInfoDlgCommon::WITH_ARG && f->owner_ == owner);

    CHECK(root->children().size() == 7 && owner->children().size() == 6);

    // the dialog: yes/no (WITH_ARG), 544 x 400 at the left, message aligned 1; closed when answered
    CInfoDlgCommon* y = CInfoDlgCommon::createText(root, owner, 10, 11, 4100, 0x2000 | 0x100 | 1);
    auto* yn = dynamic_cast<CWindowModelDialogYesNo*>(y->dialog_.get());
    CHECK(yn && yn->instName() == "CInfoDlgCommon::m_dialogOk" && yn->parent() == owner);
    CHECK(yn->yesTextId_ == 10 && yn->noTextId_ == 11 && yn->w_ == 544 && yn->h_ == 400 && yn->x_ == 64);
    CHECK(elmOf(yn->textField_->text_.get())->align == 1);
    CHECK(std::u16string(elmOf(yn->textField_->text_.get())->text) == u"Save the deck?");
    CHECK(y->onMain() && yn->alive());
    yn->onControlEvent(yn->no_);
    CHECK(y->onMain() && !yn->alive());   // answered: the dialog goes, the task stays
    CHECK(y->onMain());

    // OK (SIMPLE), 480 x 272, centred on the screen
    CInfoDlgCommon* k = CInfoDlgCommon::createText(root, owner, 12, 4100, 0);
    auto* okd = dynamic_cast<CWindowModelDialogOk*>(k->dialog_.get());
    CHECK(okd && okd->okTextId_ == 12 && okd->w_ == 480 && okd->h_ == 272);
    CHECK(okd->x_ == 272 && okd->y_ == 248);
    okd->onControlEvent(okd->ok_);
    CHECK(k->onMain() && !okd->alive());
    g_windowFactory->destroyAllWindows();
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    std::printf("world_infodlg_test ok\n");
}
