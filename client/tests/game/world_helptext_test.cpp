// yo2HelpText.cpp: HelpText handles and the global HelpTextMng ordering.
#include "Game/yo2HelpText.h"
#include "game_test.h"

static std::u16string cur() { return std::u16string(g_helpTextMng->current()); }

int main() {
    CHECK(g_helpTextMng && g_helpTextMng->items().empty() && cur().empty());
    {
        HelpText a, b, c;
        CHECK(a.id_ == 0 && b.id_ == 1 && c.id_ == 2 && a.priority_ == -1 && a.text_.empty());
        CHECK(g_helpTextMng->items().size() == 3 && cur().empty());   // all hidden
        a.setText(u"menu");
        b.setText(u"deck");
        c.setText(u"chat");
        CHECK(a.text_ == u"menu" && cur().empty());
        a.setPriority(1);
        CHECK(cur() == u"menu" && a.priority_ == 1);
        b.setPriority(5);
        CHECK(cur() == u"deck");
        c.setPriority(5);   // same priority: the newer entry (higher id) wins
        CHECK(cur() == u"chat");
        const auto& it = g_helpTextMng->items();
        CHECK(it[0].id == 2 && it[1].id == 1 && it[2].id == 0 && it[0].owner == &c);
        c.hide();
        CHECK(cur() == u"deck" && c.priority_ == 5 && it.back().id == 2 && it.back().priority == -1);
        b.setText(u"deck2");
        CHECK(cur() == u"deck2");
        g_helpTextMng->setText(99, u"x");          // unknown id: ignored
        g_helpTextMng->setPriority(99, 100);
        CHECK(cur() == u"deck2");
        {
            HelpText d;
            CHECK(d.id_ == 3);
            d.setText(u"top");
            d.setPriority(9);
            CHECK(cur() == u"top");
        }
        CHECK(cur() == u"deck2" && g_helpTextMng->items().size() == 3);   // d removed itself
        b.setPriority(-3);
        a.setPriority(-1);
        CHECK(cur().empty());   // the highest priority is negative
        g_helpTextMng->setMenubar(nullptr);
    }
    CHECK(g_helpTextMng->items().empty());
    HelpText e;
    CHECK(e.id_ == 4);   // ids are never reused
    std::printf("world_helptext_test ok\n");
}
