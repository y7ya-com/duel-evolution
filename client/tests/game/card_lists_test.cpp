// yo2CardListView.cpp: the choice lists (card / attribute / type / icon / level / limit / duel command), on the real
// card tables: rows made per stripe row, filled from the first line shown, the rest hidden.
#include <cstdlib>

#include "Game/yo2CardListView.h"
#include "System/yo2StringDB.h"
#include "System/yo2ZSort.h"
#include "duel/CardDB.h"
#include "duel/DuelText.h"
#include "game_test.h"
#include "window_stubs.h"

struct FakeText : CStringDB {
    vc6::string get(uint32_t i) const override { return i == 4020 ? "not found" : i == 0x1013 ? "summon" : "?"; }
};

static std::u16string textOf(CWindowTaskText* t) { return std::u16string(elmOf(t)->text); }

int main() {
    const char* bin = std::getenv("YO2_CARD_BIN");
    std::string dir = bin ? std::string(bin) : std::string(getenv("HOME") ? getenv("HOME") : ".") + "/Documents/GitHub/duel-evolution-restore/extraction/recovery/out_2008/CHG/merge/data/bin#";
    if (!cardDbLoad(dir.c_str()) || !textLoad(dir.c_str(), 'e')) {
        std::printf("card_lists_test: no card tables at %s, skipped\n", dir.c_str());
        return 0;
    }
    CZSortSet layers;
    g_zsortSet = &layers;
    FakeText text;
    g_stringDB = &text;
    CWindowTaskFactory::create();
    CElement* root = CElement::createRoot();

    // attributes in an OK dialog 256 x 192: the list fills the dialog less its margins and button band
    auto* attr = CWindowModelListCardAttr::create(root, 2, false, false);
    CHECK(attr && attr->inner_ && attr->w_ == 256 && attr->h_ == 192 && attr->inner_->w_ == 256);
    CWindowTaskListboxCardAttr* al = attr->list_.get();
    CHECK(al->instName() == "CWindowModelListCardAttr::m_attrList" && al->x_ == 8 && al->posZ_ == 2);
    CHECK(al->w_ == 240 && al->h_ == int32_t(192 - attr->inner_->bandH_ - 16));
    al->addAll();
    CHECK(al->values_.size() == 9 && al->values_[0] == 1 && al->values_[8] == 9);
    al->scrollToLine(0);
    int32_t rows = al->stripe_->rowCount_;
    // rows are only ever added (the first layout ran at the default 256 px); those past the stripe or the values hide
    CHECK(rows > 0 && al->rows_.size() >= size_t(rows));
    for (size_t i = 0; i < al->rows_.size(); i++)
        CHECK(al->rows_[i]->disp_ == (i < 9 && int32_t(i) < rows) && al->rows_[i]->isLocked(2) != al->rows_[i]->disp_);
    CWindowTaskViewItemCardAttr* r0 = al->rows_[0];
    CHECK(r0->instName() == "CWindowTaskListboxCardAttr::item" && r0->value_ == 1 && r0->z_ == 2 && r0->disp_);
    CHECK(r0->img_->instName() == "CWindowTaskViewItemCardAttr::img");
    CHECK(dynamic_cast<CWindowTaskImageCardAttr*>(r0->img_.get())->value_ == 1);
    CHECK(textOf(r0->text_.get()) == std::u16string(windowWiden(textAttr(1))) && !textOf(r0->text_.get()).empty());
    if (rows > 1)
        CHECK(al->rows_[1]->y_ == 16 && al->rows_[1]->value_ == 2);

    // types: the list puts itself at z 3; spell/trap icons 256 x 144
    auto* type = CWindowModelListCardType::create(root, 1, true, false);
    CWindowTaskListboxCardType* tl = type->list_.get();
    tl->addAll();
    tl->scrollToLine(0);
    CHECK(tl->values_.size() == 21 && tl->posZ_ == 3 && tl->multi_);
    auto* icon = CWindowModelListCardIcon::create(root, 2, false, false);
    CHECK(icon->h_ == 144);
    icon->list_->addAll();
    CHECK(icon->list_->values_.size() == 7);

    // limits: the extended strip (value 4 shows)
    auto* forbi = CWindowModelListCardForbi::create(root, 2, false, false);
    CWindowTaskListboxCardForbi* fl = forbi->list_.get();
    for (int32_t i = 1; i < 5; i++)
        fl->add(i);
    fl->scrollToLine(0);
    CHECK(fl->rows_.size() > 3 && fl->rows_[3]->value_ == 4 && fl->rows_[3]->img_->disp_);

    // the card list: the two extra rows first, then every card
    auto* cards = CWindowModelListCard::create(root, 1, false, true);
    CHECK(cards->w_ == 512 && cards->h_ == 240);
    auto* cl = static_cast<CWindowTaskListboxCard*>(cards->list_.get());
    CHECK(cl->values_.size() == 2 && cl->values_[0] == CWindowTaskCardInfoItem::NOT_FOUND);
    cl->addAll();
    CHECK(cl->values_.size() == 2 + 0xc8b);
    cl->scrollToLine(0);
    CHECK(!cl->rows_.empty() && cl->rows_[0]->card_ == CWindowTaskCardInfoItem::NOT_FOUND);
    CHECK(textOf(cl->rows_[0]->name_.get()) == u"not found" && cl->rows_[0]->columns_ == &cl->layout_);
    CHECK(cl->rows_.size() > 2 && cl->rows_[2]->card_ == 0);

    // the duel's command menu: no scroll bar
    auto* cmd = CWindowModelListDuelCmd::create(root, 100, 50, 0);
    CHECK(cmd && cmd->x_ == 100 && cmd->w_ == 256 && cmd->h_ == 240);
    CWindowTaskListboxDuelCmd* dl = cmd->list_.get();
    CHECK(!dl->scroll_->disp_ && dl->scroll_->isLocked(2) && dl->w_ == 240 && dl->h_ == 224);
    dl->add(0);
    dl->add(19);
    dl->scrollToLine(0);
    CHECK(textOf(dl->rows_[0]->text_.get()) == u"summon" && dl->rows_[1]->value_ == 19);
    dl->clearValues();
    CHECK(dl->values_.empty());
    CHECK(DuelCmdKind::text(19) == windowText(0x1990) && DuelCmdKind::text(5) == windowText(0x1017));

    g_windowFactory->destroyAllWindows();
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    g_stringDB = nullptr;
    std::printf("card_lists_test ok\n");
}
