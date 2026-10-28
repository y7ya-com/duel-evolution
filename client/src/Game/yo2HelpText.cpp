#include "Game/yo2HelpText.h"

#include <algorithm>
#include <cstdlib>

#include "System/yo2Debug.h"

// @yo2 0x00a5c770 g_helpTextMng static init entry stub
// @yo2 0x00a5c790 g_helpTextMng static initialiser (new HelpTextMng)
// @yo2 0x00a5c7e0 the holder's static init entry stub (an empty initialiser, then the atexit)
// @yo2 0x00a5c800 the holder's (empty) static initialiser
// @yo2 0x00a5c820 the holder's atexit registration
// @yo2 0x00a5c840 g_helpTextMng atexit destructor (delete, once: guard bit 1 of DAT_012bb7cc)
static struct HelpTextMngHolder {
    HelpTextMngHolder() { g_helpTextMng = new HelpTextMng; }
    ~HelpTextMngHolder() {
        delete g_helpTextMng;
        g_helpTextMng = nullptr;
    }
} s_helpTextMngHolder;
HelpTextMng* g_helpTextMng;

HelpTextMng::~HelpTextMng() { delete items_; }

// @yo2 0x00a5c980 HelpTextMng::sort: highest priority first, then the newest (highest id)
// std::sort's MSVC6 instances over HelpTextItem (insertion sort, median, partition, copy_backward, item copy/assign):
// @yo2 0x00a5d770 @yo2 0x00a5db60 @yo2 0x00a5dd60 @yo2 0x00a5df60 @yo2 0x00a5e170 @yo2 0x00a5e320 @yo2 0x00a5e4f0
// @yo2 0x00a5e6d0
void HelpTextMng::sort() {
    if (items_->empty())
        return;
    std::sort(items_->begin(), items_->end(), [](const HelpTextItem& a, const HelpTextItem& b) {
        return a.priority > b.priority || (a.priority == b.priority && a.id > b.id);
    });
}

// @yo2 0x00a5c9d0 HelpTextMng::add: a new entry with the next id
// std::vector<HelpTextItem>::insert, uninitialized_copy and ~HelpTextItem (MSVC6 instances):
// @yo2 0x00a5d130 @yo2 0x00a5d5b0 @yo2 0x00a5cae0
int32_t HelpTextMng::add(int32_t priority, const vc6::wstring& text, HelpText* owner) {
    int32_t id = nextId_;
    items_->push_back(HelpTextItem{priority, nextId_, text, owner});
    sort();
    nextId_++;
    return id;
}

// @yo2 0x00a5cd00 HelpTextMng::setPriority (re-sorts even when the id is unknown)
void HelpTextMng::setPriority(int32_t id, int32_t priority) {
    auto it = std::find_if(items_->begin(), items_->end(), [id](const HelpTextItem& e) { return e.id == id; });
    if (it != items_->end())
        it->priority = priority;
    sort();
}

// @yo2 0x00a5cb30 HelpTextMng::setText (unknown ids are ignored)
void HelpTextMng::setText(int32_t id, const vc6::wstring& text) {
    for (HelpTextItem& e : *items_)
        if (e.id == id) {
            e.text = text;
            return;
        }
}

// @yo2 0x00a5cd50 HelpTextMng::remove
void HelpTextMng::remove(int32_t id) {
    auto it = std::find_if(items_->begin(), items_->end(), [id](const HelpTextItem& e) { return e.id == id; });
    if (it == items_->end()) {
        YO2_ASSERT(false, "ヘルプテキストエラー@RemoveText");   // "help text error"
        return;
    }
    items_->erase(it);
    sort();
}

// @yo2 0x00a5cf50 HelpTextMng::current: the text the menu bar shows (empty when nothing is shown)
vc6::wstring HelpTextMng::current() const {
    if (items_->empty() || items_->front().priority < 0)
        return {};
    return items_->front().text;
}

// @yo2 0x00a5c410 HelpText::HelpText: registers a hidden, empty entry
HelpText::HelpText() { id_ = g_helpTextMng->add(-1, vc6::wstring(), this); }

// @yo2 0x00a5c6d0 HelpText::~HelpText
HelpText::~HelpText() { g_helpTextMng->remove(id_); }

// @yo2 0x00a5c500 HelpText::setPriority
void HelpText::setPriority(int32_t priority) {
    priority_ = priority;
    g_helpTextMng->setPriority(id_, priority);
}

// @yo2 0x00a5c530 HelpText::setText
void HelpText::setText(const vc6::wstring& text) {
    text_ = text;
    g_helpTextMng->setText(id_, text_);
}

// @yo2 0x00a5c6a0 HelpText::hide: priority -1 in the manager (priority_ is kept)
void HelpText::hide() { g_helpTextMng->setPriority(id_, -1); }
