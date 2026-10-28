// The per-file copies of two shared headers' statics, in 0x7f0000..0x83ffff and 0x8a7970..0x9bd1bf.
//
// Every game source includes a header that defines four string tables (kLanguageNames, kLanguageCodes,
// kNumberNames, kLetterNames: System/yo2Lang.h) and an empty object with a destructor, registered with atexit behind
// bit 0 of DAT_012d3501 (its destructor is the thunk at 0x00410564, a bare ret). Each object file therefore got its
// own initializers. The table initializers and their atexit stubs proper are marked in yo2Lang.h; what is left are the
// stubs Ghidra never made functions of (islands):
//   "init stub: X"                 call X's initializer, then jmp to X's atexit registration
//   "guarded atexit registration"  set the guard bit, then jmp to the plain one
//   "atexit registration"          atexit(0x00410564)
// One inline definition in yo2Lang.h stands for every table copy, and s_headerStatic below for the empty object.
#include "System/yo2Lang.h"

namespace {
struct HeaderStatic {
    ~HeaderStatic() {}
};
[[maybe_unused]] HeaderStatic s_headerStatic;
}  // namespace

// Grouped by the source file whose statics they are (each file's statics follow its code):
// duel/yo2SummonManager.cpp
//   @yo2 0x007f03a0 guarded atexit registration
//   @yo2 0x007f03d0 atexit registration
// logo/logoEntry.cpp
//   @yo2 0x007f0d30 guarded atexit registration
//   @yo2 0x007f0d60 atexit registration
//   @yo2 0x007f0d80 init stub: languages
//   @yo2 0x007f1150 init stub: countries
//   @yo2 0x007f14e0 init stub: digits
//   @yo2 0x007f18e0 init stub: letters
// title/optionDlg.cpp
//   @yo2 0x007f7ce0 guarded atexit registration
//   @yo2 0x007f7d10 atexit registration
//   @yo2 0x007f7d30 init stub: languages
//   @yo2 0x007f8100 init stub: countries
//   @yo2 0x007f8490 init stub: digits
//   @yo2 0x007f8890 init stub: letters
// title/titleEntry.cpp
//   @yo2 0x007fb650 guarded atexit registration
//   @yo2 0x007fb680 atexit registration
// caution/cautionEntry.cpp
//   @yo2 0x007fda70 guarded atexit registration
//   @yo2 0x007fdaa0 atexit registration
// login/loginDialog.cpp
//   @yo2 0x008038d0 guarded atexit registration
//   @yo2 0x00803900 atexit registration
//   @yo2 0x00803920 init stub: languages
//   @yo2 0x00803cf0 init stub: countries
//   @yo2 0x00804080 init stub: digits
//   @yo2 0x00804480 init stub: letters
// login/yo2LoginEntry.cpp
//   @yo2 0x00808e00 guarded atexit registration
//   @yo2 0x00808e30 atexit registration
//   @yo2 0x00808e50 init stub: languages
//   @yo2 0x00809220 init stub: countries
//   @yo2 0x008095b0 init stub: digits
//   @yo2 0x008099b0 init stub: letters
// PlayerSelect/yo2PlayerSelect.cpp
//   @yo2 0x0080f760 guarded atexit registration
//   @yo2 0x0080f790 atexit registration
//   @yo2 0x0080f7b0 init stub: languages
//   @yo2 0x0080fb80 init stub: countries
//   @yo2 0x0080ff10 init stub: digits
//   @yo2 0x00810310 init stub: letters
// PlayerSelect/yo2PlayerSelectEntry.cpp
//   @yo2 0x00815c50 guarded atexit registration
//   @yo2 0x00815c80 atexit registration
//   @yo2 0x00815ca0 init stub: languages
//   @yo2 0x00816070 init stub: countries
//   @yo2 0x00816400 init stub: digits
//   @yo2 0x00816800 init stub: letters
// MyRoom/yo2DuelDiscShelf.cpp
//   @yo2 0x00824060 guarded atexit registration
//   @yo2 0x00824090 atexit registration
//   @yo2 0x008240b0 init stub: languages
//   @yo2 0x00824480 init stub: countries
//   @yo2 0x00824810 init stub: digits
//   @yo2 0x00824c10 init stub: letters
// MyRoom/yo2MyRoom.cpp
//   @yo2 0x0082b980 guarded atexit registration
//   @yo2 0x0082b9b0 atexit registration
//   @yo2 0x0082b9d0 init stub: languages
//   @yo2 0x0082bda0 init stub: countries
//   @yo2 0x0082c130 init stub: digits
//   @yo2 0x0082c530 init stub: letters
// MyRoom/yo2MyRoom2MapTask.cpp
//   @yo2 0x00830160 guarded atexit registration
//   @yo2 0x00830190 atexit registration
// MyRoom/yo2MyRoomTv.cpp
//   @yo2 0x008317c0 guarded atexit registration
//   @yo2 0x008317f0 atexit registration
//   @yo2 0x00831810 init stub: languages
//   @yo2 0x00831be0 init stub: countries
//   @yo2 0x00831f70 init stub: digits
//   @yo2 0x00832370 init stub: letters
//   @yo2 0x00834d40 guarded atexit registration
//   @yo2 0x00834d70 atexit registration
//   @yo2 0x0083f690 guarded atexit registration
//   @yo2 0x0083f6c0 atexit registration
//   @yo2 0x0083f6e0 init stub: languages
//   @yo2 0x0083fab0 init stub: countries
//   @yo2 0x0083fe40 init stub: digits
// ConnectLobby/yo2ConnectLobbyScene.cpp
//   @yo2 0x008a7970 guarded atexit registration
//   @yo2 0x008a79a0 atexit registration
//   @yo2 0x008a79c0 init stub: languages
//   @yo2 0x008a7d90 init stub: countries
//   @yo2 0x008a8120 init stub: digits
//   @yo2 0x008a8520 init stub: letters
// ChangeAvatar/yo2ChangeAvatar.cpp
//   @yo2 0x008b33d0 guarded atexit registration
//   @yo2 0x008b3400 atexit registration
//   @yo2 0x008b3420 init stub: languages
//   @yo2 0x008b37f0 init stub: countries
//   @yo2 0x008b3b80 init stub: digits
//   @yo2 0x008b3f80 init stub: letters
// ChangeAvatar/yo2ChangeAvatarScene.cpp
//   @yo2 0x008b6080 guarded atexit registration
//   @yo2 0x008b60b0 atexit registration
//   @yo2 0x008b60d0 init stub: languages
//   @yo2 0x008b64a0 init stub: countries
//   @yo2 0x008b6830 init stub: digits
//   @yo2 0x008b6c30 init stub: letters
// duel/yo2DuelEndScene.cpp
//   @yo2 0x008bcfa0 guarded atexit registration
//   @yo2 0x008bcfd0 atexit registration
//   @yo2 0x008bcff0 init stub: languages
//   @yo2 0x008bd3c0 init stub: countries
//   @yo2 0x008bd750 init stub: digits
//   @yo2 0x008bdb50 init stub: letters
// duel/yo2DuelGunsStar.cpp
//   @yo2 0x008c0430 guarded atexit registration
//   @yo2 0x008c0460 atexit registration
//   @yo2 0x008c0480 init stub: languages
//   @yo2 0x008c0850 init stub: countries
//   @yo2 0x008c0be0 init stub: digits
//   @yo2 0x008c0fe0 init stub: letters
// duel/yo2ResultScene.cpp
//   @yo2 0x008c4e10 guarded atexit registration
//   @yo2 0x008c4e40 atexit registration
// Result/yo2ResultWindow.cpp
//   @yo2 0x008cccf0 guarded atexit registration
//   @yo2 0x008ccd20 atexit registration
//   @yo2 0x008ccd40 init stub: languages
//   @yo2 0x008cd110 init stub: countries
//   @yo2 0x008cd4a0 init stub: digits
//   @yo2 0x008cd8a0 init stub: letters
// UsbDuelpass/ygoUsbKey.cpp
//   @yo2 0x008cdee0 guarded atexit registration
//   @yo2 0x008cdf10 atexit registration
//   @yo2 0x008cdf30 init stub: languages
//   @yo2 0x008ce300 init stub: countries
//   @yo2 0x008ce690 init stub: digits
//   @yo2 0x008cea90 init stub: letters
// Deck/cardswapEntry.cpp
//   @yo2 0x008d6400 guarded atexit registration
//   @yo2 0x008d6430 atexit registration
//   @yo2 0x008d6450 init stub: languages
//   @yo2 0x008d6820 init stub: countries
//   @yo2 0x008d6bb0 init stub: digits
//   @yo2 0x008d6fb0 init stub: letters
// Deck/deckEntry.cpp
//   @yo2 0x008ebb90 init stub: letters
// Deck/presentEntry.cpp
//   @yo2 0x008f08e0 guarded atexit registration
//   @yo2 0x008f0910 atexit registration
//   @yo2 0x008f0930 init stub: languages
//   @yo2 0x008f0d00 init stub: countries
//   @yo2 0x008f1090 init stub: digits
//   @yo2 0x008f1490 init stub: letters
// Deck/tpEntry.cpp
//   @yo2 0x008f5730 guarded atexit registration
//   @yo2 0x008f5760 atexit registration
//   @yo2 0x008f5780 init stub: languages
//   @yo2 0x008f5b50 init stub: countries
//   @yo2 0x008f5ee0 init stub: digits
//   @yo2 0x008f62e0 init stub: letters
// Deck/tradeEntry.cpp
//   @yo2 0x00903df0 guarded atexit registration
//   @yo2 0x00903e20 atexit registration
//   @yo2 0x00903e40 init stub: languages
//   @yo2 0x00904210 init stub: countries
//   @yo2 0x009045a0 init stub: digits
//   @yo2 0x009049a0 init stub: letters
//   @yo2 0x00904e90 guarded atexit registration
//   @yo2 0x00904ec0 atexit registration
//   @yo2 0x00904ee0 init stub: languages
//   @yo2 0x009052b0 init stub: countries
//   @yo2 0x00905640 init stub: digits
//   @yo2 0x00905a40 init stub: letters
//   @yo2 0x009082a0 guarded atexit registration
//   @yo2 0x009082d0 atexit registration
//   @yo2 0x009082f0 init stub: languages
//   @yo2 0x009086c0 init stub: countries
//   @yo2 0x00908a50 init stub: digits
//   @yo2 0x00908e50 init stub: letters
// Deck/yo2DeckParts.cpp
//   @yo2 0x009211a0 init stub: letters
// Deck/yo2DeckUtil.cpp
//   @yo2 0x00934770 init stub: letters
// Deck/yo2KabanWindow.cpp
//   @yo2 0x0097c930 init stub: letters
// Deck/yo2PresentWindow.cpp
//   @yo2 0x00982450 guarded atexit registration
//   @yo2 0x00982480 atexit registration
//   @yo2 0x009824a0 init stub: languages
//   @yo2 0x00982870 init stub: countries
//   @yo2 0x00982c00 init stub: digits
//   @yo2 0x00983000 init stub: letters
//   @yo2 0x00985350 guarded atexit registration
//   @yo2 0x00985380 atexit registration
//   @yo2 0x00985f50 init stub: languages
//   @yo2 0x00986320 init stub: countries
//   @yo2 0x009866b0 init stub: digits
//   @yo2 0x00986ab0 init stub: letters
// Deck/yo2TpWindow.cpp
//   @yo2 0x0098e240 guarded atexit registration
//   @yo2 0x0098e270 atexit registration
//   @yo2 0x0098e290 init stub: languages
//   @yo2 0x0098e660 init stub: countries
//   @yo2 0x0098e9f0 init stub: digits
//   @yo2 0x0098edf0 init stub: letters
// Deck/yo2TradeWindow.cpp
//   @yo2 0x00995160 guarded atexit registration
//   @yo2 0x00995190 atexit registration
//   @yo2 0x009951b0 guarded atexit registration
//   @yo2 0x009951e0 atexit registration
//   @yo2 0x00995200 guarded atexit registration
//   @yo2 0x00995230 atexit registration
//   @yo2 0x00995250 guarded atexit registration
//   @yo2 0x00995280 atexit registration
//   @yo2 0x009952a0 guarded atexit registration
//   @yo2 0x009952d0 atexit registration
//   @yo2 0x009952f0 guarded atexit registration
//   @yo2 0x00995320 atexit registration
//   @yo2 0x00995340 guarded atexit registration
//   @yo2 0x00995370 atexit registration
//   @yo2 0x00995390 guarded atexit registration
//   @yo2 0x009953c0 atexit registration
//   @yo2 0x009953e0 init stub: languages
//   @yo2 0x009957b0 init stub: countries
//   @yo2 0x00995b40 init stub: digits
//   @yo2 0x00995f40 init stub: letters
// Gunsling/yo2GunslingManager.cpp
//   @yo2 0x00997a70 guarded atexit registration
//   @yo2 0x00997aa0 atexit registration
// Rating/yo2Rating.cpp
//   @yo2 0x00999d80 guarded atexit registration
//   @yo2 0x00999db0 atexit registration
//   @yo2 0x00999dd0 init stub: languages
//   @yo2 0x0099a1a0 init stub: countries
//   @yo2 0x0099a530 init stub: digits
//   @yo2 0x0099a930 init stub: letters
// Tournament/yo2TournamentManager.cpp
//   @yo2 0x0099c3f0 guarded atexit registration
//   @yo2 0x0099c420 atexit registration
//   @yo2 0x0099c440 init stub: languages
//   @yo2 0x0099c810 init stub: countries
//   @yo2 0x0099cba0 init stub: digits
//   @yo2 0x0099cfa0 init stub: letters
// Tournament/yo2TournamentScene.cpp
//   @yo2 0x009bce20 guarded atexit registration
//   @yo2 0x009bce50 atexit registration
