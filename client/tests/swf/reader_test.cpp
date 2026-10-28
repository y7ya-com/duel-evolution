// SwfReader on every Flash dump in merge.dat (paths on stdin, one per line), plus its line helpers.
// Exactness against the exe is harness/difftest/cases_swf.py; this checks the big dumps the emulator is too slow for,
// under ASan/UBSan, and that the trees hold what the dumps say.
#include <cassert>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <iterator>
#include <string>
#include <vector>

#include "Swf/yo2SwfReader.h"

// System's file hook (merge.dat in the game): loose files here
bool yo2LoadFile(const char* name, std::vector<uint8_t>& out) {
    std::ifstream f(name, std::ios::binary);
    out.assign(std::istreambuf_iterator<char>(f), {});
    return bool(f);
}

static size_t count(const std::string& text, const char* what) {
    size_t n = 0;
    for (size_t at = text.find(what); at != std::string::npos; at = text.find(what, at + 1)) n++;
    return n;
}

int main() {
    vc6::string v;
    assert(SwfReader::getValue("  Depth => 12,", v, "Depth") && v == "12");
    assert(SwfReader::getValue("\tpng => a.png,", v, "png") && v == "a.png");
    assert(!SwfReader::getValue("  FontID => 7,", v, "ID"));
    int32_t depth = 1;
    assert(SwfReader::countNest("x->new(", depth) && depth == 2);
    assert(SwfReader::countNest("x->new()", depth) && depth == 2);
    assert(!SwfReader::countNest("),", --depth) && depth == 0);

    size_t files = 0, chars = 0, tags = 0;
    for (std::string path; std::getline(std::cin, path); files++) {
        std::ifstream f(path, std::ios::binary);
        std::string text(std::istreambuf_iterator<char>(f), {});
        SwfVec<vc6::string> png;
        CSwfCharaDictionary dict;
        CSwfCtrlTagTable timeline;
        SwfReader::load(path.c_str(), &png, &dict, &timeline);
        SwfVec<vc6::string> pngOnly = SwfReader::loadPngTable(path.c_str());
        assert(pngOnly.size() == png.size());
        for (size_t i = 0; i < png.size(); i++) assert(pngOnly[i] == std::string_view(png[i]));
        // every png line and every top-level character made it in (sprites' timelines hold the nested control tags)
        assert(png.size() == count(text, "png => "));
        assert(dict.chars.size() == count(text, "SWF::Element::Tag::Define"));
        size_t frames = 0;
        for (CSwfCtrlTag* t : timeline.tags) frames += t->type == SWF_CTRL_SHOW_FRAME;
        for (CSwfDefTag* c : dict.chars)
            if (c->type == SWF_DEF_SPRITE)
                for (CSwfCtrlTag* t : static_cast<CSwfDefTag_DefineSprite*>(c)->timeline.tags)
                    frames += t->type == SWF_CTRL_SHOW_FRAME;
        assert(frames == count(text, "Tag::ShowFrame->new("));
        chars += dict.chars.size();
        tags += timeline.tags.size();
    }
    std::printf("swf reader: %zu dumps, %zu characters, %zu root tags\n", files, chars, tags);
}
