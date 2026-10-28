// src/Deck/DeckManager.cpp: CDeckManager (the deck file object) and CDeckRuleCheck.
// sources: Deck/DeckManager.cpp System/yo2Debug.cpp
#include <cstdio>
#include <cstring>
#include <map>
#include <string>
#include <vector>

#include "Deck/DeckManager.h"
#include "System/yo2File.h"

#define CHECK(c) \
    do { if (!(c)) { std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #c); std::exit(1); } } while (0)

// ---- doubles: the card database (100 and 101 are two arts of one card), the limit list, files, the card box
int cardPropId(int index) { return index == 101 ? 100 : index; }
std::map<int, int> g_limit;
int engCardLimit(int id) { return g_limit.count(id) ? g_limit[id] : 3; }
int engSameCard(int a, int b) { return a == b; }
std::map<std::string, std::vector<uint8_t>> g_files;
bool yo2LoadFile(const char* name, std::vector<uint8_t>& out) {
    auto it = g_files.find(name);
    if (it == g_files.end()) return false;
    out = it->second;
    return true;
}
bool yo2SaveFile(const char* name, const void* data, size_t size) {
    g_files[name].assign(static_cast<const uint8_t*>(data), static_cast<const uint8_t*>(data) + size);
    return true;
}
uint8_t g_box[9 + 3 * 0x1000];
bool g_haveBox = true;
const uint8_t* appCardBox() { return g_haveBox ? g_box : nullptr; }
void own(uint16_t id, uint8_t n) { g_box[9 + id * 3] = n; }

static std::vector<uint8_t> record(std::vector<uint16_t> main, std::vector<uint16_t> side, std::vector<uint16_t> extra) {
    CDeckManager::File f{};
    for (size_t i = 0; i < main.size(); i++) f.main[i] = main[i];
    for (size_t i = 0; i < side.size(); i++) f.side[i] = side[i];
    for (size_t i = 0; i < extra.size(); i++) f.extra[i] = extra[i];
    const uint8_t* p = reinterpret_cast<const uint8_t*>(&f);
    return std::vector<uint8_t>(p, p + sizeof f);
}

int main() {
    auto* d = new CDeckManager;
    CHECK(d->fileName_ == "deck.ydc" && d->dir_.empty() && d->mainSize() == 0);

    // the box and the limit list
    own(10, 2);
    CHECK(d->addMain(10, g_box) && d->addSide(10, g_box));
    CHECK(!d->addExtra(10, g_box));                 // both owned copies are in use
    CHECK(d->mainCopies(10) == 1 && d->sideCopies(10) == 1 && d->copies(10) == 2);
    own(100, 3);
    own(101, 3);
    g_limit[100] = 2;                               // two copies of the card, any art
    CHECK(d->addMain(100, g_box) && d->addMain(101, g_box));
    CHECK(d->sameCardCount(100) == 2 && !d->addSide(100, g_box));
    CHECK(d->mainSize() == 3 && d->mainList()[2] == 101);

    // remove: the first match goes, the rest shift down, the freed slot is zeroed
    CHECK(d->removeMain(10) && d->mainList()[0] == 100 && d->mainList()[1] == 101 && d->mainList()[2] == 0);
    CHECK(d->mainCopies(10) == 0 && !d->removeMain(10));

    // the list caps
    own(20, 255);
    g_limit[20] = 1000;
    while (d->addMain(20, g_box)) {}
    CHECK(d->mainSize() == CDeckManager::MAIN_MAX);
    for (int i = 0; i < 100; i++) d->addMissing(7);
    CHECK(d->missingSize() == CDeckManager::MISSING_MAX && d->missingCopies(7) == 80);
    d->clearMissing();
    CHECK(d->missingSize() == 0 && d->missingCopies(7) == 0 && d->missingList()[0] == 0);

    // the counters' helpers: subtraction stops at 0
    d->setExtraCopies(5, 3);
    d->subExtraCopies(5, 7);
    CHECK(d->extraCopies(5) == 0);
    d->addExtraCopies(5, 4);
    d->subExtraCopies(5, 1);
    CHECK(d->extraCopies(5) == 3);

    // save: the lists' first 80 / 15 / 30 into the record, written to <dir>\<name>
    CHECK(d->clear() && d->mainSize() == 0);
    d->setDirectory("save\\abc");
    CHECK(d->addMain(10, g_box) && d->addSide(100, g_box) && d->addExtra(20, g_box));
    CHECK(d->save());
    CHECK(g_files["save\\abc\\deck.ydc"] == record({10}, {100}, {20}));

    // load: both decks are emptied, the cards go back in, one the box can't cover goes to missing
    g_files["save\\abc\\deck.ydc"] = record({10, 10, 10, 30}, {}, {20});
    d->addMainB(10, g_box);
    CHECK(d->load());
    CHECK(d->mainSize() == 2 && d->missingSize() == 2 && d->missingList()[0] == 10 && d->missingList()[1] == 30);
    CHECK(d->extraSize() == 1 && d->mainSizeB() == 0);
    g_haveBox = false;
    CHECK(d->load() && d->mainSize() == 0 && d->missingSize() == 0);   // no box: nothing is added at all
    g_haveBox = true;
    CHECK(!d->loadOther("nothere.ydc"));

    // loadOther: into deck B only; false when a card isn't owned
    g_files["save\\abc\\other.ydc"] = record({10, 20}, {20}, {});
    CHECK(d->load());
    CHECK(d->loadOther("other.ydc") && d->mainSizeB() == 2 && d->sideSizeB() == 1 && d->mainSize() == 2);
    CHECK(d->sameCardCountB(20) == 2);
    g_files["save\\abc\\other.ydc"] = record({30}, {}, {});
    CHECK(!d->loadOther("other.ydc") && d->missingSizeB() == 1 && d->missingListB()[0] == 30);
    g_haveBox = false;
    CHECK(!d->loadOther("other.ydc"));
    g_haveBox = true;
    d->reset();
    CHECK(d->extraSize() == 0 && d->missingSizeB() == 0 && d->dir_ == "save\\abc");
    delete d;

    // the rule check: 40..80 main, at most 15 side and 30 extra
    CDeckRuleCheck r;
    r.clear();
    for (int i = 0; i < 39; i++) r.addMain(1);
    CHECK(!r.valid());
    r.addMain(2);
    CHECK(r.valid() && CDeckRuleCheck::s_mainIds[39] == 2);
    for (int i = 0; i < 15; i++) r.addSide(3);
    CHECK(r.valid());
    CDeckRuleCheck::s_side = 16;   // (the exe doesn't bound the arrays; a 16th side card would land in extra's)
    CHECK(!r.valid());
    r.clear();
    for (int i = 0; i < 80; i++) r.addMain(1);
    for (int i = 0; i < 30; i++) r.addExtra(1);
    CHECK(r.valid() && CDeckRuleCheck::s_extra == 30);
    std::puts("deckmanager ok");
    return 0;
}
