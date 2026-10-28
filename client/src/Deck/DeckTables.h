// Three string tables a shared yo2 header defines at namespace scope, so every translation unit that includes it
// gets its own copy with its own dynamic initializer and atexit destructor. In the exe each part-A source file has
// the same nine little functions for them (deckEntry.cpp: 0x008eb010..0x008ebb90):
//   island  "init all"   calls the three inits below (one per table, through a 32-byte stub)
//   677 B   languages    8 strings ("Japanese".."Korean"), then registers its atexit destructor (12 B stub)
//   634 B   countries    7 three-letter codes, the 0x600c/0x6006 country field
//   715 B   digits       20 strings: "1".."8" and 12 empty ones
//   islands  the three atexit destructors (destroy N strings, 0x10 each)
// Including this header reproduces all of it: the C++ runtime emits exactly those initializers and destructors.
// Each including .cpp marks its own copies' addresses.
#pragma once
#include "DeckCommon.h"

namespace dk {
namespace {

[[maybe_unused]] VcString kLanguageNames[8] = {"Japanese", "English", "German", "Italian",
                                               "French",   "Spanish", "World",  "Korean"};
[[maybe_unused]] VcString kCountryCodes[7] = {"JPN", "ENG", "DEU", "FRA", "ITA", "ESP", "KOR"};
[[maybe_unused]] VcString kDigitNames[20] = {"1", "2", "3", "4", "5", "6", "7", "8"};

}   // namespace
}   // namespace dk
