// The static initialisers of the object files in 0x00a60000..0x00b3ffff (game-b's range). Every game source includes
// two shared headers that leave the same dynamic initialisers in each object:
//  - yo2Lang.h's four string tables (kLanguageNames, kLanguageCodes, kNumberNames, kLetterNames): per table a CRT
//    init stub `call init; jmp atexit-registration`. The init and atexit bodies are listed in System/yo2Lang.h; the
//    one inline definition there stands for every copy.
//  - a guarded empty static (bit 0 of DAT_012d3501, destructor thunk 0x00410564 -> the bare ret at 0x004231e0): the
//    guard stub and its atexit registration.
// The stubs carry no logic of their own; the C++ definitions below (and yo2Lang.h's) are what replace them.
#include "System/yo2Lang.h"

namespace {
struct GuardedHeaderStatic {
    GuardedHeaderStatic() = default;
    ~GuardedHeaderStatic() {}
};
}   // namespace

// Per object file: the guard stub and its atexit registration, then the four yo2Lang.h init stubs.
// yo2Menu.cpp (0x00a607c0..):
//   @yo2 0x00a607c0 @yo2 0x00a607f0
//   @yo2 0x00a60810 @yo2 0x00a60be0 @yo2 0x00a60f70 @yo2 0x00a61370
// yo2PlayerBin.cpp (0x00ad3990..):
//   @yo2 0x00ad3990 @yo2 0x00ad39c0
//   @yo2 0x00ad4200 @yo2 0x00ad45d0 @yo2 0x00ad4960 @yo2 0x00ad4d60
// the object after it (0x00ad6dc0..0x00ad7f10: CPlayerBinData / CNetLobby inlines):
//   @yo2 0x00ad6dc0 @yo2 0x00ad6df0
//   @yo2 0x00ad6e10 @yo2 0x00ad71e0 @yo2 0x00ad7570 @yo2 0x00ad7970
// yo2TgtAvaListDlg.cpp (0x00ad7f40..):
//   @yo2 0x00ad7f40 @yo2 0x00ad7f70
//   @yo2 0x00ad7f90 @yo2 0x00ad8360 @yo2 0x00ad86f0 @yo2 0x00ad8af0
// GameCtrl's object (0x00adad90..0x00adaf50; the guard only):
//   @yo2 0x00adad90 @yo2 0x00adadc0
// yo2WorldManager.cpp (0x00adaf70..):
//   @yo2 0x00adaf70 @yo2 0x00adafa0
//   @yo2 0x00adafc0 @yo2 0x00adb390 @yo2 0x00adb720 @yo2 0x00adbb20
// the shop helpers' object (0x00ae2180..0x00ae4860):
//   @yo2 0x00ae2180 @yo2 0x00ae21b0
//   @yo2 0x00ae21d0 @yo2 0x00ae25a0 @yo2 0x00ae2930 @yo2 0x00ae2d30
// yo2shopEntry.cpp (0x00ae38e0..):
//   @yo2 0x00ae38e0 @yo2 0x00ae3910
//   @yo2 0x00ae3930 @yo2 0x00ae3d00 @yo2 0x00ae4090 @yo2 0x00ae4490
// yo2TeamFlag.cpp (0x00b039d0..; two guarded statics):
//   @yo2 0x00b039d0 @yo2 0x00b03a00 @yo2 0x00b03a20 @yo2 0x00b03a50
//   @yo2 0x00b03a70 @yo2 0x00b03e40 @yo2 0x00b041d0 @yo2 0x00b045d0
[[maybe_unused]] static GuardedHeaderStatic s_guarded;
