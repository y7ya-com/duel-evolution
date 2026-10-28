#include "DuelText.h"

#include "CardDB.h"

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#if defined(_WIN32) && defined(__i386__)
// In the game the tables are the exe's CBinFile objects (FUN_0073b640 loads them; data at +0x18, a 4-byte header
// skipped when +0x34 is set, FUN_00527d30). No bounds, as in the exe.
#define TEXT_IN_EXE 1
static const uint8_t* binData(uint32_t o) {
    const uint8_t* b = reinterpret_cast<const uint8_t*>(o);
    return reinterpret_cast<const uint8_t*>(*reinterpret_cast<const uint32_t*>(b + 0x18) + (b[0x34] ? 4 : 0));
}
static const char* exeText(uint32_t indx, uint32_t text, size_t k, size_t stride) {
    return reinterpret_cast<const char*>(binData(text) + *reinterpret_cast<const uint32_t*>(binData(indx) + k * stride));
}
#else
static std::vector<uint8_t> s_dlgIndx, s_dlgText, s_cardIndx, s_cardName, s_cardSort;
#endif

static bool readAll(const std::string& path, std::vector<uint8_t>& out) {
    FILE* f = fopen(path.c_str(), "rb");
    if (!f) return false;
    out.clear();
    uint8_t buf[4096];
    for (size_t n; (n = fread(buf, 1, sizeof buf, f)) > 0;) out.insert(out.end(), buf, buf + n);
    fclose(f);
    out.push_back(0);   // terminators past the end (narrow and UTF-16) so a bad offset still reads a string
    out.push_back(0);
    return true;
}

#ifndef TEXT_IN_EXE
bool textLoad(const char* dir, char lang) {
    std::string d = dir, l(1, (char)(lang | 0x20));
    return readAll(d + "/dlg_indx_" + l + ".bin", s_dlgIndx) && readAll(d + "/dlg_text_" + l + ".bin", s_dlgText) &&
           readAll(d + "/card_indx_" + l + ".bin", s_cardIndx) && readAll(d + "/card_name_" + l + ".bin", s_cardName) &&
           readAll(d + "/card_sort_" + l + ".bin", s_cardSort);
}

// offset table entry k (stride bytes) into the text file; out of range = ""
static const char* lookup(const std::vector<uint8_t>& indx, const std::vector<uint8_t>& text, size_t k, size_t stride) {
    if ((k + 1) * stride > indx.size() || text.empty()) return "";
    uint32_t o;
    memcpy(&o, &indx[k * stride], 4);
    return o < text.size() ? (const char*)&text[o] : "";
}
#endif

static const char* resolve(TextRef r) { return (r.v & ~(uintptr_t)0x1ffff) == 0 ? textById((int)r.v) : (const char*)r.v; }

#ifdef TEXT_IN_EXE
// @yo2 0x0073be10
const char* textById(int id) { return exeText(0x012a11c0, 0x012a1180, (size_t)id, 4); }
// @yo2 0x0073bc80
const char* textCardName(int card) { return exeText(0x012a1280, 0x012a12c0, (size_t)cardPropIndex(card), 8); }
// @yo2 0x0073bdd0 a card's place in the name order (CARD_Sort: u16 per prop index)
int cardSortKey(int card) { return *reinterpret_cast<const uint16_t*>(binData(0x012a1200) + cardPropIndex(card) * 2); }
#else
int cardSortKey(int card) {
    size_t k = (size_t)cardPropIndex(card) * 2;
    return k + 2 <= s_cardSort.size() ? s_cardSort[k] | s_cardSort[k + 1] << 8 : 0;
}
const char* textById(int id) { return id < 0 ? "" : lookup(s_dlgIndx, s_dlgText, (size_t)id, 4); }
const char* textCardName(int card) { return lookup(s_cardIndx, s_cardName, (size_t)cardPropIndex(card), 8); }
#endif

// @yo2 0x0073be50
const char* textRace(int race) { return race ? textById(race + 500) : ""; }

// @yo2 0x0073bec0
const char* textAttr(int attr) { return attr ? textById(attr + 0x212) : ""; }

// @yo2 0x00745e50
void textCopy(char* dst, TextRef src) { strcpy(dst, resolve(src)); }

// @yo2 0x00745ea0
void textAppend(char* dst, TextRef src) { strcat(dst, resolve(src)); }

// @yo2 0x00745f10
void textFormatS(char* dst, TextRef fmt, TextRef arg) {
    *dst = 0;
    const char* f = resolve(fmt);
    const char* a = resolve(arg);
    if (!f) return;
    for (; *f; f++) {
        if (f[0] == '%' && f[1] == 's') {
            *dst = 0;
            strcat(dst, a);
            strcat(dst, f + 2);
            return;
        }
        *dst++ = *f;
    }
    *dst = 0;
}

// @yo2 0x00746130
void textFormatD(char* dst, TextRef fmt, int n) {
    *dst = 0;
    const char* f = resolve(fmt);
    for (; *f; f++) {
        if (f[0] == '%' && f[1] == 'd') {
            *dst = 0;
            textAppendInt(dst, n);
            strcat(dst, f + 2);
            return;
        }
        *dst++ = *f;
    }
    *dst = 0;
}

// @yo2 0x007461b0 (negative numbers come out as the exe's digit arithmetic gives them, without a sign)
void textAppendInt(char* dst, int n) {
    char b[16];
    int i = 15;
    b[15] = 0;
    do {
        b[--i] = (char)(n % 10 + '0');
        n /= 10;
    } while (n);
    strcat(dst, b + i);
}

// @yo2 0x00746230
void textStripColor(char* dst, TextRef src) {
    *dst = 0;
    const char* s = resolve(src);
    if (!s) return;
    while (*s) {
        if (s[0] == '@' && s[1] > '/' && s[1] < ':') s += 2;
        else *dst++ = *s++;
    }
    *dst = 0;
}

// ---- UTF-16 (the exe builds these with its wide string class; same results)

static std::u16string wresolve(TextRef r) {
    const char* p = resolve(r);
    std::u16string out;
    for (;; p += 2) {
        char16_t c;
        memcpy(&c, p, 2);
        if (!c) return out;
        out += c;
    }
}

static void wput(char16_t* dst, const std::u16string& s) {
    memcpy(dst, s.c_str(), (s.size() + 1) * sizeof(char16_t));
}

// @yo2 0x00743750
void wtextCopy(char16_t* dst, TextRef src) { wput(dst, wresolve(src)); }

// @yo2 0x007437d0
void wtextFormatS(char16_t* dst, TextRef fmt, TextRef arg) {
    std::u16string f = wresolve(fmt), a = wresolve(arg);
    size_t i = f.find(u"%s");
    if (i != std::u16string::npos) f = f.substr(0, i) + a + f.substr(i + 2);
    wput(dst, f);
}

// @yo2 0x00743ae0
void wtextFormatD(char16_t* dst, TextRef fmt, int n) {
    std::u16string f = wresolve(fmt);
    size_t i = f.find(u"%d");
    if (i != std::u16string::npos) {
        std::string d = std::to_string(n);
        f = f.substr(0, i) + std::u16string(d.begin(), d.end()) + f.substr(i + 2);
    }
    wput(dst, f);
}

// @yo2 0x00744a90
void wtextStripMarks(char16_t* dst, TextRef src) {
    std::u16string s = wresolve(src);
    for (size_t i; !s.empty() && (i = s.find(u'@')) != std::u16string::npos;)
        s = s.substr(0, i) + (i + 2 < s.size() ? s.substr(i + 2) : std::u16string());
    wput(dst, s);
}
