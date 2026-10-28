// yo2PackInfo: the card pack catalogue's raw tables, data/cardpack/PACK_*.bin, kept whole in memory (nine yaneSDK
// CFile globals in the exe; byte buffers here) and indexed by catalogue slot 1..0xc0. PACK_Prop is a u32 per slot;
// the other tables are a string blob plus an index of offsets into it. Names, descriptions and the sort text come in
// one file per language (PACK_Name_J.bin, ...), read again whenever the language changes.
#include <cstdint>
#include <string>
#include <vector>

#include "pack_externs.h"

namespace {
// The nine globals. Each one's __xc entry calls its constructor (`mov ecx, &global; jmp CFile::CFile`) and registers
// its destructor (`mov ecx, &global; jmp CFile::~CFile`) with atexit; a std::vector needs neither written out.
//   @yo2 0x00840610 @yo2 0x00840630 @yo2 0x00840650 @yo2 0x00840670   PACK_Name_?  (DAT_012ad590)
std::vector<uint8_t> s_name;
//   @yo2 0x00840690 @yo2 0x008406b0 @yo2 0x008406d0 @yo2 0x008406f0   PACK_Indx_?  (DAT_012ad550): name, desc offsets
std::vector<uint8_t> s_indx;
//   @yo2 0x00840710 @yo2 0x00840730 @yo2 0x00840750 @yo2 0x00840770   PACK_Desc_?  (DAT_012ad510)
std::vector<uint8_t> s_desc;
//   @yo2 0x00840790 @yo2 0x008407b0 @yo2 0x008407d0 @yo2 0x008407f0   PACK_SIndx_? (DAT_012ad4d0): sort-text offsets
std::vector<uint8_t> s_sindx;
//   @yo2 0x00840810 @yo2 0x00840830 @yo2 0x00840850 @yo2 0x00840870   PACK_Sort_?  (DAT_012ad490)
std::vector<uint8_t> s_sort;
//   @yo2 0x00840890 @yo2 0x008408b0 @yo2 0x008408d0 @yo2 0x008408f0   PACK_Img     (DAT_012ad450)
std::vector<uint8_t> s_img;
//   @yo2 0x00840910 @yo2 0x00840930 @yo2 0x00840950 @yo2 0x00840970   PACK_Indx2   (DAT_012ad410): image, ydc offsets
std::vector<uint8_t> s_indx2;
//   @yo2 0x00840990 @yo2 0x008409b0 @yo2 0x008409d0 @yo2 0x008409f0   PACK_Ydc     (DAT_012ad3d0)
std::vector<uint8_t> s_ydc;
//   @yo2 0x00840a10 @yo2 0x00840a30 @yo2 0x00840a50 @yo2 0x00840a70   PACK_Prop    (DAT_012ad390)
std::vector<uint8_t> s_prop;

uint32_t word(const std::vector<uint8_t>& b, size_t at) {   // CFile::GetMemory + offset; the exe doesn't bound it
    if (at + 4 > b.size()) return 0;
    return b[at] | b[at + 1] << 8 | b[at + 2] << 16 | (uint32_t)b[at + 3] << 24;
}
const char* text(const std::vector<uint8_t>& blob, uint32_t at) {
    return at < blob.size() ? reinterpret_cast<const char*>(blob.data() + at) : "";   // fix: the exe reads past it
}
}   // namespace

// @yo2 0x00840a90 read the language-independent tables, then (language >= 0) the five tables of that language
void packInfoLoad(int32_t language) {
    static const char kLetter[] = {'J', 'E', 'G', 'F', 'I', 'S', 'K'};   // 0 Japanese .. 6 Korean
    yaneReadFile("data/cardpack/PACK_Prop.bin", s_prop);
    yaneReadFile("data/cardpack/PACK_Img.bin", s_img);
    yaneReadFile("data/cardpack/PACK_Indx2.bin", s_indx2);
    yaneReadFile("data/cardpack/PACK_Ydc.bin", s_ydc);
    if (language < 0) return;
    static const char* const kTable[] = {"data/cardpack/PACK_Name_", "data/cardpack/PACK_Indx_", "data/cardpack/PACK_Desc_",
                                         "data/cardpack/PACK_SIndx_", "data/cardpack/PACK_Sort_"};
    std::vector<uint8_t>* const to[] = {&s_name, &s_indx, &s_desc, &s_sindx, &s_sort};
    for (int i = 0; i < 5; i++) {
        std::string path = kTable[i];
        if (language <= 6) path += kLetter[language];   // any other language: no letter
        yaneReadFile(path + ".bin", *to[i]);
    }
}

// @yo2 0x00841000
const char* packInfoName(int i) { return text(s_name, word(s_indx, (size_t)i * 8)); }
// @yo2 0x00841040
const char* packInfoDesc(int i) { return text(s_desc, word(s_indx, (size_t)i * 8 + 4)); }
// @yo2 0x00841080 the sort text (PACK_Sort)
const char* packInfoText3(int i) { return text(s_sort, word(s_sindx, (size_t)i * 4)); }
// @yo2 0x008410c0
const char* packInfoImage(int i) { return text(s_img, word(s_indx2, (size_t)i * 8)); }
// @yo2 0x00841100
const char* packInfoYdc(int i) { return text(s_ydc, word(s_indx2, (size_t)i * 8 + 4)); }

// @yo2 0x00841170 the slot's PACK_Prop word
static uint32_t prop(int i) { return word(s_prop, (size_t)i * 4); }
// @yo2 0x00841140 bits 0..14
int32_t packInfoId(int i) { return (int32_t)(prop(i) << 17) >> 17; }
// @yo2 0x008411a0 bits 15..18
int32_t packInfoType(int i) { return (int32_t)(prop(i) << 13) >> 28; }
// @yo2 0x008411d0 bits 19..31 (signed)
int32_t packInfoBit(int i) { return (int32_t)prop(i) >> 19; }
