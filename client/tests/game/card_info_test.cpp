// yo2CardListView.cpp: CCardInfoLayout and CWindowTaskCardInfoItem (one card's row), on the real card tables.
#include <cstdlib>

#include "Game/yo2CardListView.h"
#include "System/yo2StringDB.h"
#include "System/yo2ZSort.h"
#include "duel/CardDB.h"
#include "duel/DuelText.h"
#include "game_test.h"
#include "window_stubs.h"

struct Win : CWindowTaskModel {
    std::vector<CWindowTaskControll*> commands;
    void layout() override {}
    int32_t maxZ() const override { return 0; }
    void onControlEvent(CWindowTaskControll*) override {}
    void onControlCommand(CWindowTaskControll* c) override { commands.push_back(c); }
};

// a layout without the icons, to check the item asks
struct TextOnly : CCardInfoLayout {
    bool has(int32_t c) const override { return c == NAME || c == ATK || c == DEF || c == SEP; }
};

struct FakeText : CStringDB {
    vc6::string get(uint32_t i) const override { return i == 4020 ? "not found" : "?"; }
};

static std::u16string textOf(CWindowTaskText* t) { return std::u16string(elmOf(t)->text); }

int main() {
    const char* bin = std::getenv("YO2_CARD_BIN");
    std::string dir = bin ? std::string(bin) : std::string(getenv("HOME") ? getenv("HOME") : ".") + "/Documents/GitHub/duel-evolution-restore/extraction/recovery/out_2008/CHG/merge/data/bin#";
    if (!cardDbLoad(dir.c_str()) || !textLoad(dir.c_str(), 'e')) {
        std::printf("card_info_test: no card tables at %s, skipped\n", dir.c_str());
        return 0;
    }
    CZSortSet layers;
    g_zsortSet = &layers;
    FakeText text;
    g_stringDB = &text;
    CWindowTaskFactory::create();
    CElement* root = CElement::createRoot();
    auto* w = new Win;
    w->CTask::create(root, 0);

    // find a normal monster and a spell in the table
    int monster = -1, spell = -1;
    for (int i = 1; i < 4000 && (monster < 0 || spell < 0); i++) {
        int id = cardPropId(i);
        if (!id)
            continue;
        if (monster < 0 && cardAttr(id) > 0 && cardAttr(id) < 8 && cardAtkRaw(id) != 0xffff && cardLevel(id) > 0)
            monster = i;
        if (spell < 0 && cardIsSpell(id))
            spell = i;
    }
    CHECK(monster > 0 && spell > 0);

    CCardInfoLayout layout;
    CHECK(layout.position(CCardInfoLayout::ATTR).x == 256 && layout.position(CCardInfoLayout::DEF).x == 400);
    CHECK(layout.position(CCardInfoLayout::NAME).x == 0 && layout.sepText() == u"/");
    int mid = cardPropId(monster);
    char buf[8];
    std::snprintf(buf, sizeof buf, "%4d", cardAtkRaw(mid));
    std::u16string atk;
    for (const char* p = buf; *p; p++)
        atk += char16_t(*p);
    CHECK(std::u16string(layout.atkText(mid)) == atk && layout.atkText(cardPropId(spell)) == u"-");

    auto* item = new CWindowTaskCardInfoItem;
    item->card_ = monster;
    item->columns_ = &layout;
    item->mediator_ = w;
    CHECK(item->CTask::create(w, 0));
    CHECK(item->w_ == 512 && item->h_ == 16 && item->kind() == 0x1c);
    CWindowTaskText* name = item->name_.get();
    CHECK(name->instName() == "CWindowTaskCardInfoItem::m_name" && !elmOf(name)->keepNewlines);
    CHECK(textOf(name).size() == std::strlen(textCardName(mid)) && !textOf(name).empty());
    CHECK(item->attr_->value_ == cardAttr(mid) && item->attr_->x_ == 256 && item->star_->value_ == cardLevel(mid));
    CHECK(item->limit_->value_ == cardLimit(mid) && item->limit_->instName() == "CWindowTaskCardInfoItem::m_forbi");
    CHECK(textOf(item->atk_.get()) == atk && textOf(item->sep_.get()) == u"/" && item->def_->x_ == 400);

    item->setCard(spell);
    CHECK(textOf(item->atk_.get()) == u"-" && item->icon_->value_ == cardIcon(cardPropId(spell)));
    CHECK(item->limit_->value_ == cardLimit(cardPropId(spell)) + 1);
    item->setCard(CWindowTaskCardInfoItem::NOT_FOUND);
    CHECK(textOf(name) == u"not found");
    CHECK(item->attr_->value_ == -1 && textOf(item->sep_.get()).empty() && item->card_ == CWindowTaskCardInfoItem::NOT_FOUND);
    item->setNameWidth(300.7f);

    WindowMsg m{};
    m.msg = 0x201;
    item->handleMessage(m);
    CHECK(w->commands.size() == 1 && w->commands[0] == item);

    TextOnly textOnly;
    auto* bare = new CWindowTaskCardInfoItem;
    bare->card_ = monster;
    bare->columns_ = &textOnly;
    bare->mediator_ = w;
    bare->CTask::create(w, 0);
    CHECK(bare->name_.task() && !bare->attr_.task() && !bare->limit_.task() && bare->sep_.task());

    g_windowFactory->destroyAllWindows();
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    g_stringDB = nullptr;
    std::printf("card_info_test ok\n");
}
