// The static initialisers (the CRT's __xc entries) and atexit stubs of src/Net, src/Pack and src/Lobby's translation
// units, 0x689500..0x6e0cef and 0x840000..0x8a796f. Each entry calls one global's constructor and registers its
// destructor with atexit; in C++ that is the global's definition, so this file only lists them next to what they build.

// Every one of these translation units includes a header with an empty function-local static (src/Deck/DeckUtil.cpp
// has its copies): each TU's entry tests the one shared guard (bit 1 of DAT_012d3501), sets it, and jumps to the
// atexit stub after it, which registers 0x004231e0 (a bare ret) as the destructor. One definition stands for all.
namespace {
struct EmptyStatic {
    ~EmptyStatic() {}
};
// The entry: test and set the guard (37 copies):
//  @yo2 0x0068b390 @yo2 0x0068bc20 @yo2 0x0068d0c0 @yo2 0x006900d0
//  @yo2 0x006931c0 @yo2 0x00699290 @yo2 0x0069ae00 @yo2 0x0069ce00
//  @yo2 0x0069f7d0 @yo2 0x006a0890 @yo2 0x006a7a50 @yo2 0x006a9360
//  @yo2 0x006b06d0 @yo2 0x006b1d00 @yo2 0x006b3200 @yo2 0x006b4180
//  @yo2 0x006b56c0 @yo2 0x006b6ed0 @yo2 0x006c7ba0 @yo2 0x006c94d0
//  @yo2 0x006ca9c0 @yo2 0x006cf110 @yo2 0x006d0560 @yo2 0x006d4a30
//  @yo2 0x006d62e0 @yo2 0x00841200 @yo2 0x00842b20 @yo2 0x00847340
//  @yo2 0x0084c560 @yo2 0x0084c5b0 @yo2 0x0084fb50 @yo2 0x008599c0
//  @yo2 0x0085b4e0 @yo2 0x0085e7d0 @yo2 0x00883bf0 @yo2 0x008873e0
//  @yo2 0x008a2970
// ... then register its destructor (37 copies):
//  @yo2 0x0068b3c0 @yo2 0x0068bc50 @yo2 0x0068d0f0 @yo2 0x00690100
//  @yo2 0x006931f0 @yo2 0x006992c0 @yo2 0x0069ae30 @yo2 0x0069ce30
//  @yo2 0x0069f800 @yo2 0x006a08c0 @yo2 0x006a7a80 @yo2 0x006a9390
//  @yo2 0x006b0700 @yo2 0x006b1d30 @yo2 0x006b3230 @yo2 0x006b41b0
//  @yo2 0x006b56f0 @yo2 0x006b6f00 @yo2 0x006c7bd0 @yo2 0x006c9500
//  @yo2 0x006ca9f0 @yo2 0x006cf140 @yo2 0x006d0590 @yo2 0x006d4a60
//  @yo2 0x006d6310 @yo2 0x00841230 @yo2 0x00842b50 @yo2 0x00847370
//  @yo2 0x0084c590 @yo2 0x0084c5e0 @yo2 0x0084fb80 @yo2 0x008599f0
//  @yo2 0x0085b510 @yo2 0x0085e800 @yo2 0x00883c20 @yo2 0x00887410
//  @yo2 0x008a29a0
[[maybe_unused]] EmptyStatic& localEmpty() {
    static EmptyStatic s;
    return s;
}
}   // namespace

// The __xc entries of globals defined elsewhere: each is `call <its initialiser>; jmp <its atexit stub>`, both already
// written where the global is (most are the per-TU copies of yo2Lang.h's string tables).
// its static initialiser: empty (src/Lobby/yo2FriendBase.cpp):
//  @yo2 0x0085e520
// kLanguageCodes static initialiser (src/System/yo2Lang.h):
//  @yo2 0x0068c040 @yo2 0x0068d4e0 @yo2 0x006904f0 @yo2 0x006935e0
//  @yo2 0x006996b0 @yo2 0x0069b220 @yo2 0x0069d220 @yo2 0x006a0cb0
//  @yo2 0x006a7e70 @yo2 0x006a9780 @yo2 0x006b0af0 @yo2 0x006b2120
//  @yo2 0x006b3620 @yo2 0x006b45a0 @yo2 0x006b5ae0 @yo2 0x006b72f0
//  @yo2 0x006c7fc0 @yo2 0x006c98f0 @yo2 0x006cade0 @yo2 0x006cf530
//  @yo2 0x006d0980 @yo2 0x006d4e50 @yo2 0x00841620 @yo2 0x00842f40
//  @yo2 0x00847760 @yo2 0x0084c9d0 @yo2 0x0084ff70 @yo2 0x0085b900
//  @yo2 0x0085ebf0 @yo2 0x00884010 @yo2 0x00887800 @yo2 0x008a6150
// kLanguageNames static initialiser (src/System/yo2Lang.h):
//  @yo2 0x0068bc70 @yo2 0x0068d110 @yo2 0x00690120 @yo2 0x00693210
//  @yo2 0x006992e0 @yo2 0x0069ae50 @yo2 0x0069ce50 @yo2 0x006a08e0
//  @yo2 0x006a7aa0 @yo2 0x006a93b0 @yo2 0x006b0720 @yo2 0x006b1d50
//  @yo2 0x006b3250 @yo2 0x006b41d0 @yo2 0x006b5710 @yo2 0x006b6f20
//  @yo2 0x006c7bf0 @yo2 0x006c9520 @yo2 0x006caa10 @yo2 0x006cf160
//  @yo2 0x006d05b0 @yo2 0x006d4a80 @yo2 0x00841250 @yo2 0x00842b70
//  @yo2 0x00847390 @yo2 0x0084c600 @yo2 0x0084fba0 @yo2 0x0085b530
//  @yo2 0x0085e820 @yo2 0x00883c40 @yo2 0x00887430 @yo2 0x008a5d80
// kLetterNames static initialiser (src/System/yo2Lang.h):
//  @yo2 0x0068c7d0 @yo2 0x0068dc70 @yo2 0x00690c80 @yo2 0x00693d70
//  @yo2 0x00699e40 @yo2 0x0069b9b0 @yo2 0x0069d9b0 @yo2 0x006a1440
//  @yo2 0x006a8600 @yo2 0x006a9f10 @yo2 0x006b1280 @yo2 0x006b28b0
//  @yo2 0x006b3db0 @yo2 0x006b4d30 @yo2 0x006b6270 @yo2 0x006b7a80
//  @yo2 0x006c8750 @yo2 0x006ca080 @yo2 0x006cb570 @yo2 0x006cfcc0
//  @yo2 0x006d1110 @yo2 0x006d55e0 @yo2 0x00840240 @yo2 0x00841db0
//  @yo2 0x008436d0 @yo2 0x00847ef0 @yo2 0x0084d160 @yo2 0x00850700
//  @yo2 0x0085c090 @yo2 0x0085f380 @yo2 0x008847a0 @yo2 0x00887f90
//  @yo2 0x008a68e0
// @yo2 0x006a8690 the rest of 0x006a8620's copy ("B".."H" into 0x0128a280..0x0128a2e0), split off as an island
// kNumberNames static initialiser (src/System/yo2Lang.h):
//  @yo2 0x0068c3d0 @yo2 0x0068d870 @yo2 0x00690880 @yo2 0x00693970
//  @yo2 0x00699a40 @yo2 0x0069b5b0 @yo2 0x0069d5b0 @yo2 0x006a1040
//  @yo2 0x006a8200 @yo2 0x006a9b10 @yo2 0x006b0e80 @yo2 0x006b24b0
//  @yo2 0x006b39b0 @yo2 0x006b4930 @yo2 0x006b5e70 @yo2 0x006b7680
//  @yo2 0x006c8350 @yo2 0x006c9c80 @yo2 0x006cb170 @yo2 0x006cf8c0
//  @yo2 0x006d0d10 @yo2 0x006d51e0 @yo2 0x008419b0 @yo2 0x008432d0
//  @yo2 0x00847af0 @yo2 0x0084cd60 @yo2 0x00850300 @yo2 0x0085bc90
//  @yo2 0x0085ef80 @yo2 0x008843a0 @yo2 0x00887b90 @yo2 0x008a64e0

// The lobby scene's CDeckDuel (DAT_012af274; include/yo2/Net/CDeckDuel.h: a vptr and no data), which CLobbyScene's
// states call (0x00904e50, the deck checks before a duel). Its vptr is all its constructor and destructor set, so it
// becomes a plain global of CLobbyScene's file once that is written (it needs the HUD; see the notes):
// @yo2 0x0085f750 its __xc entry
// @yo2 0x0085f770 CDeckDuel::CDeckDuel
// @yo2 0x0085f7b0 CDeckDuel::~CDeckDuel
