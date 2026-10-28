// Message and card-name text used by the duel (0x0073bc80..0x0073bec0, 0x00745e50..0x00746230; labelled System,
// only the duel and deck code use them). A text reference is a DLG_Text id when below 0x20000, else a pointer.
// FUN_0073b640 loads data/bin#/{CARD_Name,CARD_Indx,CARD_Desc,CARD_Sort,DLG_Indx,DLG_Text}_<lang>.bin; the
// DLG_Indx entries are u32 offsets into DLG_Text, CARD_Indx entries are 8 bytes (name offset first) per prop index.
#pragma once
#include <cstdint>
#include <type_traits>

// a DLG_Text id or a string, as the exe passes them in one register
struct TextRef {
    uintptr_t v;
    template <class T, class = typename std::enable_if<std::is_integral<T>::value>::type>
    TextRef(T id) : v((uintptr_t)id) {}
    TextRef(const char* s) : v((uintptr_t)s) {}
};

void yo2LoadCardText(int32_t language);         // FUN_0073b640 (System calls it): language 0..6 = J E G F I S K
bool textLoad(const char* binDir, char lang);   // the per-language half of FUN_0073b640 (lowercase file names)
const char* textById(int id);                  // FUN_0073be10
const char* textCardName(int card);            // FUN_0073bc80
const char* textRace(int race);                // FUN_0073be50
const char* textAttr(int attr);                // FUN_0073bec0
int cardSortKey(int card);                     // FUN_0073bdd0 CARD_Sort: the name order
void textCopy(char* dst, TextRef src);         // FUN_00745e50
void textAppend(char* dst, TextRef src);       // FUN_00745ea0
void textFormatS(char* dst, TextRef fmt, TextRef arg);   // FUN_00745f10 first %s
void textFormatD(char* dst, TextRef fmt, int n);         // FUN_00746130 first %d
void textAppendInt(char* dst, int n);                    // FUN_007461b0
void textStripColor(char* dst, TextRef src);             // FUN_00746230 drops @<digit> colour codes

// the UTF-16 versions the dialogs use (the shipped text files are UTF-16LE)
void wtextCopy(char16_t* dst, TextRef src);                    // FUN_00743750
void wtextFormatS(char16_t* dst, TextRef fmt, TextRef arg);    // FUN_007437d0 first %s
void wtextFormatD(char16_t* dst, TextRef fmt, int n);          // FUN_00743ae0 first %d
void wtextStripMarks(char16_t* dst, TextRef src);              // FUN_00744a90 drops every '@' and the unit after it
