// Checks src/duel/DuelText.cpp (the duel's text formatting, FUN_00745e50..FUN_00746230) on literal strings.
#include "duel/CardDB.h"
#include "duel/DuelText.h"

#include <cstdio>
#include <cstring>
#include <string>

static int fails;
#define CHECK(c) do { if (!(c)) { printf("FAIL %s:%d %s\n", __FILE__, __LINE__, #c); fails++; } } while (0)

int main(int argc, char** argv) {
    char b[256];
    textCopy(b, "abc");
    CHECK(!strcmp(b, "abc"));
    textAppend(b, "de");
    CHECK(!strcmp(b, "abcde"));
    textFormatS(b, "x %s y", "MID");
    CHECK(!strcmp(b, "x MID y"));
    textFormatS(b, "no marker", "MID");
    CHECK(!strcmp(b, "no marker"));
    textFormatD(b, "LP %d left", 8000);
    CHECK(!strcmp(b, "LP 8000 left"));
    textFormatD(b, "%d", 0);
    CHECK(!strcmp(b, "0"));
    b[0] = 0;
    textAppendInt(b, -5);   // the exe's digit arithmetic: '0' + (-5) with no sign
    CHECK(b[0] == '0' - 5 && b[1] == 0);
    textStripColor(b, "@3Summon@0 this @9x@");
    CHECK(!strcmp(b, "Summon this x@"));
    CHECK(!strcmp(textById(5), ""));      // nothing loaded: ids read as empty
    CHECK(!strcmp(textRace(0), "") && !strcmp(textAttr(0), ""));
    char16_t w[256];
    static const char16_t fmt[] = u"Pay %d LP?", fmt2[] = u"@3Draw@0 %s", arg[] = u"X";
    wtextFormatD(w, (const char*)fmt, -1500);
    CHECK(std::u16string(w) == u"Pay -1500 LP?");
    wtextFormatS(w, (const char*)fmt2, (const char*)arg);
    CHECK(std::u16string(w) == u"@3Draw@0 X");
    wtextStripMarks(w, (const char*)w);
    CHECK(std::u16string(w) == u"Draw X");
    static const char16_t tail[] = u"end@";
    wtextStripMarks(w, (const char*)tail);
    CHECK(std::u16string(w) == u"end");
    wtextCopy(w, (const char*)arg);
    CHECK(std::u16string(w) == u"X");
    if (argc > 1) {   // the shipped DLG/CARD text (UTF-16LE): DLG entry 2 and a card name
        CHECK(textLoad(argv[1], 'E') && cardDbLoad(argv[1]));
        wtextCopy(w, 2);
        CHECK(std::u16string(w).rfind(u"@3Summoning@0 this @3monster", 0) == 0);
        wtextCopy(w, textCardName(4007));   // internal id 4007 = Blue-Eyes White Dragon
        CHECK(std::u16string(w) == u"Blue-Eyes White Dragon");
    }
    printf(fails ? "text: %d failures\n" : "ok: text formatting\n", fails);
    return fails != 0;
}
