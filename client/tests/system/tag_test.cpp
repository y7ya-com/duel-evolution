// src/System tag converters (AtConverter's @-tags, ColorConverter) and the code-page helpers next to them.
#include <cassert>
#include <cstdio>
#include <cstring>

#include "System/yo2TagConverter.h"
#include "System/yo2Widen.h"

static void convert(ITagConverter& c, const char16_t* s, vc6::vector<CharRecord>& out) {
    out.clear();
    c.convert(vc6::wstring(s), out);
}

int main() {
    AtConverter at;
    applyWindowTagStyles(at);
    assert(at.color(1) == 0xff0000 && at.font(1).height == 18 && at.font(1).weight == 9000 && at.color(8) == 0xffffff);
    assert(at.font(0).height == 16 && at.font(0).charSet == 0x80 && at.color(0) == 0);
    at.setColor(10, 1);  // out of range: ignored

    // style switches, a literal @, an unknown tag kept as two characters
    vc6::vector<CharRecord> r;
    convert(at, u"a@1b@@c@xd", r);
    assert(r.size() == 7);
    assert(r[0].code == 'a' && r[0].color == 0 && r[1].code == 'b' && r[1].color == 0xff0000 && r[1].font.height == 18);
    assert(r[2].code == '@' && r[3].code == 'c' && r[4].code == '@' && r[5].code == 'x' && r[6].code == 'd');

    // "@>120/": a pen record (type 1), the slash eaten; without a slash the next character stays
    convert(at, u"x@>120/y@>7z", r);
    assert(r.size() == 5);
    assert(r[1].code == '@' && r[1].type == 1 && r[1].value == 120 && r[2].code == 'y' && r[2].type == 0);
    assert(r[3].type == 1 && r[3].value == 7 && r[4].code == 'z');

    ColorConverter cc;
    cc.color = 0x123456;
    convert(cc, u"hi", r);
    assert(r.size() == 2 && r[1].code == 'i' && r[1].color == 0x123456);

    vc6::vector<CharRecord> all;
    appendRecords(all, r);
    appendText(all, vc6::string("ok"));
    appendText(all, vc6::wstring(u"!"));
    assert(all.size() == 5 && all[4].code == '!' && all[2].color == 0xffffff);

    // code pages (the stubs convert ASCII one to one)
    vc6::wstring w;
    assert(yo2WidenTo(vc6::string("abc"), w) == 4 && w == u"abc");
    vc6::string n;
    assert(yo2NarrowTo(w, n) == 4 && n == "abc");
    char buf[3];
    yo2NarrowInto(u"abcd", buf, sizeof buf);
    assert(std::strcmp(buf, "ab") == 0);
    yo2SetTextCodePage(932);
    const char sjis[] = "a\x82\xa0" "b";
    assert(!yo2IsLeadByteAt(sjis, 0) && yo2IsLeadByteAt(sjis, 1) && !yo2IsLeadByteAt(sjis, 2) && !yo2IsLeadByteAt(sjis, 3));
    yo2SetTextCodePage(1252);
    assert(!yo2IsLeadByteAt(sjis, 1));
    assert(std::strcmp(yo2Sprintf("%d-%s", 7, "x"), "7-x") == 0);
    yo2SprintfInto(buf, sizeof buf, "%d", 123);
    assert(std::strcmp(buf, "12") == 0);
    std::printf("tag_test ok\n");
    return 0;
}
