#include "yo2TagConverter.h"

#include <cstring>

#include "yo2Widen.h"

namespace {
const char kDefaultFace[] = "\x82l\x82r \x83S\x83V\x83" "b\x83N";  // ＭＳ ゴシック in Shift-JIS
bool isDigit(char16_t c) { return c >= u'0' && c <= u'9'; }
}  // namespace

// @yo2 0x006039e0 CharRecord::CharRecord
CharRecord defaultCharRecord() {
    CharRecord r{};
    r.font.height = 16;
    r.font.weight = 400;
    r.font.charSet = 0x80;  // SHIFTJIS_CHARSET
    std::memcpy(r.font.faceName, kDefaultFace, sizeof kDefaultFace);
    r.color = 0xffffff;
    return r;
}

// @yo2 0x00603ad0 append the records
// @yo2 0x00603a80 CharRecord::operator=
// @yo2 0x00604ea0 vector<CharRecord>::size
// @yo2 0x00604ee0 vector<CharRecord>::insert(pos, n, value)
// @yo2 0x00605270 uninitialized_copy<CharRecord*>
// @yo2 0x006052c0 uninitialized_fill_n<CharRecord*>
// @yo2 0x00605300 fill<CharRecord*>
// @yo2 0x00605340 copy_backward<CharRecord*>
// @yo2 0x00605390 construct<CharRecord>
void appendRecords(vc6::vector<CharRecord>& out, const vc6::vector<CharRecord>& in) {
    for (const CharRecord& r : in)
        out.push_back(r);
}

// @yo2 0x00603d90 append a narrow string's characters (each byte widened on its own)
void appendText(vc6::vector<CharRecord>& out, const vc6::string& text) {
    CharRecord r = defaultCharRecord();
    for (size_t i = 0; i < text.size(); ++i) {
        r.code = static_cast<uint16_t>(yo2WidenChar(text.c_str()[i]));
        out.push_back(r);
    }
}

// @yo2 0x00604040 append a wide string's characters
void appendText(vc6::vector<CharRecord>& out, const vc6::wstring& text) {
    CharRecord r = defaultCharRecord();
    for (size_t i = 0; i < text.size(); ++i) {
        r.code = text[i];
        out.push_back(r);
    }
}

// ---- AtConverter ----

// @yo2 0x00604cb0 AtConverter::reset: every style the default font, white
void AtConverter::reset() {
    CharRecord d = defaultCharRecord();
    for (int i = 0; i < STYLES; ++i) {
        fonts_[i] = d.font;
        colors_[i] = d.color;
    }
}

// @yo2 0x00604c20 AtConverter::setHeight
void AtConverter::setHeight(uint32_t style, int32_t height) {
    if (style < STYLES)
        fonts_[style].height = height;
}

// @yo2 0x00604c50 AtConverter::setWeight
void AtConverter::setWeight(uint32_t style, int32_t weight) {
    if (style < STYLES)
        fonts_[style].weight = weight;
}

// @yo2 0x00604c80 AtConverter::setColor
void AtConverter::setColor(uint32_t style, uint32_t rgb) {
    if (style < STYLES)
        colors_[style] = rgb;
}

// @yo2 0x00604410 AtConverter::convert
int32_t AtConverter::convert(const vc6::wstring& text, vc6::vector<CharRecord>& out) {
    auto at = [&](size_t i) -> char16_t { return i < text.size() ? text[i] : 0; };
    vc6::vector<CharRecord> recs;
    CharRecord r = defaultCharRecord();
    r.font = fonts_[0];
    r.color = colors_[0];
    for (size_t i = 0; i < text.size(); ++i) {
        if (text[i] != u'@') {
            r.code = text[i];
            recs.push_back(r);
            continue;
        }
        size_t j = i + 1;
        char16_t c = at(j);
        if (isDigit(c)) {
            r.font = fonts_[c - u'0'];
            r.color = colors_[c - u'0'];
        } else if (c == u'@') {
            r.code = u'@';
            recs.push_back(r);
        } else if (c == u'>') {
            // "@>123/": a pen-position record; the '/' is optional
            int32_t x = 0, digits = 0;
            for (size_t k = i + 2; k < text.size(); ++k) {
                if (!isDigit(text[k])) {
                    j += digits + 1;
                    if (at(j) != u'/')
                        --j;
                    break;
                }
                x = x * 10 + (text[k] - u'0');
                ++digits;
            }
            r.code = u'@';
            r.value = x;
            r.type = 1;
            recs.push_back(r);
            r.value = 0;
            r.code = 0xffff;
            r.type = 0;
        } else {
            r.code = u'@';
            recs.push_back(r);
            r.code = c;
            recs.push_back(r);
        }
        i = j;
    }
    appendRecords(out, recs);
    return 0;
}

struct AtConverter::Layout {
    YO2_AT(AtConverter, fonts_, 0x004);
    YO2_AT(AtConverter, colors_, 0x25c);
};

// @yo2 0x00604d80 ColorConverter::convert
int32_t ColorConverter::convert(const vc6::wstring& text, vc6::vector<CharRecord>& out) {
    CharRecord r = defaultCharRecord();
    r.color = color;
    for (size_t i = 0; i < text.size(); ++i) {
        r.code = text[i];
        out.push_back(r);
    }
    return 0;
}

void applyWindowTagStyles(AtConverter& c) {
    c.reset();
    c.setColor(0, 0x000000);
    c.setColor(1, 0xff0000);
    c.setWeight(1, 9000);
    c.setHeight(1, 18);
    c.setColor(2, 0x2222ff);
    c.setColor(3, 0x009f00);
    c.setColor(4, 0x6f6f00);
    c.setColor(5, 0xff00ff);
    c.setColor(6, 0x00ffff);
    c.setColor(7, 0xff9933);
    c.setColor(9, 0xffffff);
}
