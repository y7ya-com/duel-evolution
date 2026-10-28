// yo2HelpText.cpp: the one-line help shown in the menu bar. UI parts own a HelpText each and give it a text and a
// priority; the global HelpTextMng keeps all of them sorted, and the menu bar shows the text of the highest
// priority (nothing while the highest is negative, i.e. hidden).
#pragma once
#include <cstdint>
#include <string>
#include <vector>

#include "System/vc6.h"

class HelpText;

struct HelpTextItem {
    int32_t priority;   // 0x00 < 0: hidden
    int32_t id;         // 0x04
    vc6::wstring text;   // 0x08
    HelpText* owner;    // 0x18
};
YO2_SIZEOF(HelpTextItem, 0x1c);

class HelpTextMng {
public:
    HelpTextMng() = default;
    HelpTextMng(const HelpTextMng&) = delete;
    HelpTextMng& operator=(const HelpTextMng&) = delete;
    ~HelpTextMng();
    int32_t add(int32_t priority, const vc6::wstring& text, HelpText* owner);
    void setPriority(int32_t id, int32_t priority);
    void setText(int32_t id, const vc6::wstring& text);
    void remove(int32_t id);
    vc6::wstring current() const;
    // @yo2 0x00a5c960 HelpTextMng::setMenubar (empty)
    void setMenubar(void* /*menubar*/) {}
    const std::vector<HelpTextItem>& items() const { return *items_; }

private:
    void sort();

    int32_t nextId_ = 0;   // 0x00
    // 0x04 MSVC6 std::vector<HelpTextItem>: a std::vector behind the `first` slot (footprint only, like vc6::map)
    [[maybe_unused]] uint8_t alloc_ = 0;
    std::vector<HelpTextItem>* items_ = new std::vector<HelpTextItem>;
    [[maybe_unused]] uint32_t last_ = 0, end_ = 0;
};
YO2_SIZEOF(HelpTextMng, 0x14);

extern HelpTextMng* g_helpTextMng;   // DAT_012bb7d0, made at static-init time

// What a UI part owns: one entry in g_helpTextMng, hidden (priority -1) and empty until set.
class HelpText {
public:
    HelpText();
    ~HelpText();
    HelpText(const HelpText&) = delete;
    HelpText& operator=(const HelpText&) = delete;
    void setPriority(int32_t priority);
    void setText(const vc6::wstring& text);
    void hide();

    int32_t unk0_ = 0;       // 0x00 never read here
    int32_t priority_ = -1;  // 0x04 the last priority set (hide() leaves it)
    int32_t id_ = -1;        // 0x08 the entry in g_helpTextMng
    vc6::wstring text_;       // 0x0c
};
YO2_AT(HelpText, priority_, 0x04);
YO2_AT(HelpText, id_, 0x08);
YO2_AT(HelpText, text_, 0x0c);
YO2_SIZEOF(HelpText, 0x1c);
