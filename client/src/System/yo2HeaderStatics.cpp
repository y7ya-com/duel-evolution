// Compiler/header boilerplate copied into every object file (the work order's "hdr" rows), across every folder: the
// stubs that set up a shared header's statics in each file, and the scalar deleting destructors the compiler writes
// for each class with a virtual destructor. Markers only: the code is the declarations themselves.
//
// The shared header behind most of them defines System/yo2Lang.h's four string tables (their initializers and atexit
// stubs proper are marked there) and one empty object with a destructor, guarded by bit 0 of DAT_012d3501 and
// registered with atexit (its destructor is the thunk at 0x00410564, a bare ret at 0x004231e0): g_headerStatic below.
// Shapes:
//   "init stub: X"                 call table X's initializer, then jmp to its atexit registration
//   "guarded atexit registration"  test and set the guard bit, then jmp to the plain registration
//   "atexit registration"          atexit(0x00410564)
//   "jmp initializer stub -> A"    a file static's initializer entry: jmp to A
//   "atexit(F) registration"       a file static's destructor F registered with atexit
//   "C scalar deleting destructor" ~C(), then operator delete when bit 0 of the flag is set
// Other sessions mark some of these next to their own code (src/Misc/HeaderStatics.cpp and others); this file has
// the rest.
#include "yo2Lang.h"

namespace {
struct HeaderStatic {
    ~HeaderStatic() {}
};
}  // namespace
[[maybe_unused]] static HeaderStatic g_headerStatic;

// guarded atexit registration (130):
//  @yo2 0x00587f60 @yo2 0x0058ce50 @yo2 0x00592f60 @yo2 0x005948a0
//  @yo2 0x00594ce0 @yo2 0x0059a830 @yo2 0x0059af30 @yo2 0x005a0bb0
//  @yo2 0x005de660 @yo2 0x005e1060 @yo2 0x005e37d0 @yo2 0x00602260
//  @yo2 0x00603590 @yo2 0x00603990 @yo2 0x006053c0 @yo2 0x00605940
//  @yo2 0x0060c020 @yo2 0x0060c690 @yo2 0x0060cb50 @yo2 0x0060d4d0
//  @yo2 0x0060d6b0 @yo2 0x00610080 @yo2 0x00610500 @yo2 0x00613670
//  @yo2 0x00613e10 @yo2 0x00613e60 @yo2 0x00613f30 @yo2 0x00615ac0
//  @yo2 0x00618b50 @yo2 0x0061aa20 @yo2 0x0061b100 @yo2 0x0061ead0
//  @yo2 0x0061f8f0 @yo2 0x00620580 @yo2 0x00621a60 @yo2 0x00627a80
//  @yo2 0x0062aa80 @yo2 0x00633960 @yo2 0x00634420 @yo2 0x00635310
//  @yo2 0x00636da0 @yo2 0x00637230 @yo2 0x00638130 @yo2 0x00639570
//  @yo2 0x00665ae0 @yo2 0x0066b8b0 @yo2 0x0066d720 @yo2 0x00672230
//  @yo2 0x00678c90 @yo2 0x00682830 @yo2 0x00685930 @yo2 0x006859a0
//  @yo2 0x00686b20 @yo2 0x00687c60 @yo2 0x00688cb0 @yo2 0x0068b390
//  @yo2 0x0068bc20 @yo2 0x0068d0c0 @yo2 0x006900d0 @yo2 0x006931c0
//  @yo2 0x00699290 @yo2 0x0069ae00 @yo2 0x0069ce00 @yo2 0x0069f7d0
//  @yo2 0x006a0890 @yo2 0x006a7a50 @yo2 0x006a9360 @yo2 0x006b06d0
//  @yo2 0x006b1d00 @yo2 0x006b3200 @yo2 0x006b4180 @yo2 0x006b56c0
//  @yo2 0x006b6ed0 @yo2 0x006c7ba0 @yo2 0x006c94d0 @yo2 0x006ca9c0
//  @yo2 0x006cf110 @yo2 0x006d0560 @yo2 0x006d4a30 @yo2 0x006e2710
//  @yo2 0x0073c3c0 @yo2 0x00747710 @yo2 0x0074b020 @yo2 0x00750c70
//  @yo2 0x007530c0 @yo2 0x00757970 @yo2 0x0075bc90 @yo2 0x0075ff10
//  @yo2 0x0075ff60 @yo2 0x007631f0 @yo2 0x007634f0 @yo2 0x007642e0
//  @yo2 0x0076c010 @yo2 0x0076f390 @yo2 0x007712c0 @yo2 0x00772b20
//  @yo2 0x007851b0 @yo2 0x00786f80 @yo2 0x0078aa40 @yo2 0x0078f360
//  @yo2 0x007a0db0 @yo2 0x007a1080 @yo2 0x007adf70 @yo2 0x007be8f0
//  @yo2 0x007bf630 @yo2 0x007c0fa0 @yo2 0x007c2680 @yo2 0x007cae30
//  @yo2 0x007cd190 @yo2 0x007cddb0 @yo2 0x007cf640 @yo2 0x007d1cd0
//  @yo2 0x007d2c10 @yo2 0x007d5110 @yo2 0x007d9a20 @yo2 0x007db680
//  @yo2 0x007dd2b0 @yo2 0x007ebdd0 @yo2 0x00841200 @yo2 0x00842b20
//  @yo2 0x00847340 @yo2 0x0084c560 @yo2 0x0084c5b0 @yo2 0x0084fb50
//  @yo2 0x008599c0 @yo2 0x0085b4e0 @yo2 0x0085e7d0 @yo2 0x00883bf0
//  @yo2 0x008873e0 @yo2 0x008a2970
// atexit registration (125):
//  @yo2 0x00587f90 @yo2 0x0058ce80 @yo2 0x00592f90 @yo2 0x005948d0
//  @yo2 0x00594d10 @yo2 0x0059a860 @yo2 0x0059af60 @yo2 0x005a0be0
//  @yo2 0x005de690 @yo2 0x005e1090 @yo2 0x005e3800 @yo2 0x00602290
//  @yo2 0x006035c0 @yo2 0x006039c0 @yo2 0x006053f0 @yo2 0x00605970
//  @yo2 0x0060c050 @yo2 0x0060c6c0 @yo2 0x0060cb80 @yo2 0x0060d500
//  @yo2 0x0060d6e0 @yo2 0x006100b0 @yo2 0x00610530 @yo2 0x006136a0
//  @yo2 0x00613e40 @yo2 0x00613e90 @yo2 0x00613f60 @yo2 0x00615af0
//  @yo2 0x00618b80 @yo2 0x0061aa50 @yo2 0x0061b130 @yo2 0x0061eb00
//  @yo2 0x0061f920 @yo2 0x006205b0 @yo2 0x00621a90 @yo2 0x00627ab0
//  @yo2 0x0062aab0 @yo2 0x00633990 @yo2 0x00634450 @yo2 0x00635340
//  @yo2 0x00636dd0 @yo2 0x00637260 @yo2 0x00638160 @yo2 0x006395a0
//  @yo2 0x00665b10 @yo2 0x0066b8e0 @yo2 0x0066d750 @yo2 0x00672260
//  @yo2 0x00678cc0 @yo2 0x00682860 @yo2 0x00688ce0 @yo2 0x0068b3c0
//  @yo2 0x0068bc50 @yo2 0x0068d0f0 @yo2 0x00690100 @yo2 0x006931f0
//  @yo2 0x006992c0 @yo2 0x0069ae30 @yo2 0x0069ce30 @yo2 0x0069f800
//  @yo2 0x006a08c0 @yo2 0x006a7a80 @yo2 0x006a9390 @yo2 0x006b0700
//  @yo2 0x006b1d30 @yo2 0x006b3230 @yo2 0x006b41b0 @yo2 0x006b56f0
//  @yo2 0x006b6f00 @yo2 0x006c7bd0 @yo2 0x006c9500 @yo2 0x006ca9f0
//  @yo2 0x006cf140 @yo2 0x006d0590 @yo2 0x006d4a60 @yo2 0x006e2740
//  @yo2 0x0073c3f0 @yo2 0x00747740 @yo2 0x0074b050 @yo2 0x00750ca0
//  @yo2 0x007530f0 @yo2 0x007579a0 @yo2 0x0075bcc0 @yo2 0x0075ff40
//  @yo2 0x0075ff90 @yo2 0x00763220 @yo2 0x00763520 @yo2 0x00764310
//  @yo2 0x0076c040 @yo2 0x0076f3c0 @yo2 0x007712f0 @yo2 0x00772b50
//  @yo2 0x007851e0 @yo2 0x00786fb0 @yo2 0x0078aa70 @yo2 0x0078f390
//  @yo2 0x007a10b0 @yo2 0x007adfa0 @yo2 0x007be920 @yo2 0x007bf660
//  @yo2 0x007c0fd0 @yo2 0x007c26b0 @yo2 0x007cae60 @yo2 0x007cd1c0
//  @yo2 0x007cdde0 @yo2 0x007cf670 @yo2 0x007d1d00 @yo2 0x007d2c40
//  @yo2 0x007d5140 @yo2 0x007d9a50 @yo2 0x007db6b0 @yo2 0x007dd2e0
//  @yo2 0x007ebe00 @yo2 0x00841230 @yo2 0x00842b50 @yo2 0x00847370
//  @yo2 0x0084c590 @yo2 0x0084c5e0 @yo2 0x0084fb80 @yo2 0x008599f0
//  @yo2 0x0085b510 @yo2 0x0085e800 @yo2 0x00883c20 @yo2 0x00887410
//  @yo2 0x008a29a0
// init stubs (294):
//   @yo2 0x0059b470 init stub: 0x0059b490
//   @yo2 0x005e12e0 init stub: 0x005e1300
//   @yo2 0x006037b0 init stub: 0x006037d0
//   @yo2 0x00605990 init stub: languages
//   @yo2 0x00605d60 init stub: countries
//   @yo2 0x006060f0 init stub: digits
//   @yo2 0x006064f0 init stub: letters
//   @yo2 0x006069a0 init stub: 0x006069c0
//   @yo2 0x00606f80 init stub: 0x00606fa0
//   @yo2 0x006108b0 init stub: 0x006108d0
//   @yo2 0x00613770 init stub: 0x00613790
//   @yo2 0x00615bc0 init stub: 0x00615be0
//   @yo2 0x0061b150 init stub: languages
//   @yo2 0x0061b520 init stub: countries
//   @yo2 0x0061b8b0 init stub: digits
//   @yo2 0x0061bcb0 init stub: letters
//   @yo2 0x0061f9f0 init stub: 0x0061fa10
//   @yo2 0x00620ce0 init stub: 0x00620d00
//   @yo2 0x00621b60 init stub: 0x00621b80
//   @yo2 0x00627ad0 init stub: 0x00627af0
//   @yo2 0x00627b80 init stub: 0x00627ba0
//   @yo2 0x00627c30 init stub: 0x00627c50
//   @yo2 0x00627d30 init stub: 0x00627d50
//   @yo2 0x00627df0 init stub: 0x00627e10
//   @yo2 0x00637330 init stub: 0x00637350
//   @yo2 0x00639c60 init stub: languages
//   @yo2 0x0063a030 init stub: countries
//   @yo2 0x0063a3c0 init stub: digits
//   @yo2 0x0063a7c0 init stub: letters
//   @yo2 0x0064f1a0 init stub: 0x0064f1c0
//   @yo2 0x0068bc70 init stub: languages
//   @yo2 0x0068c040 init stub: countries
//   @yo2 0x0068c3d0 init stub: digits
//   @yo2 0x0068c7d0 init stub: letters
//   @yo2 0x0068d110 init stub: languages
//   @yo2 0x0068d4e0 init stub: countries
//   @yo2 0x0068d870 init stub: digits
//   @yo2 0x0068dc70 init stub: letters
//   @yo2 0x00690120 init stub: languages
//   @yo2 0x006904f0 init stub: countries
//   @yo2 0x00690880 init stub: digits
//   @yo2 0x00690c80 init stub: letters
//   @yo2 0x00693210 init stub: languages
//   @yo2 0x006935e0 init stub: countries
//   @yo2 0x00693970 init stub: digits
//   @yo2 0x00693d70 init stub: letters
//   @yo2 0x006992e0 init stub: languages
//   @yo2 0x006996b0 init stub: countries
//   @yo2 0x00699a40 init stub: digits
//   @yo2 0x00699e40 init stub: letters
//   @yo2 0x0069ae50 init stub: languages
//   @yo2 0x0069b220 init stub: countries
//   @yo2 0x0069b5b0 init stub: digits
//   @yo2 0x0069b9b0 init stub: letters
//   @yo2 0x0069ce50 init stub: languages
//   @yo2 0x0069d220 init stub: countries
//   @yo2 0x0069d5b0 init stub: digits
//   @yo2 0x0069d9b0 init stub: letters
//   @yo2 0x006a08e0 init stub: languages
//   @yo2 0x006a0cb0 init stub: countries
//   @yo2 0x006a1040 init stub: digits
//   @yo2 0x006a1440 init stub: letters
//   @yo2 0x006a7aa0 init stub: languages
//   @yo2 0x006a7e70 init stub: countries
//   @yo2 0x006a8200 init stub: digits
//   @yo2 0x006a8600 init stub: letters
//   @yo2 0x006a93b0 init stub: languages
//   @yo2 0x006a9780 init stub: countries
//   @yo2 0x006a9b10 init stub: digits
//   @yo2 0x006a9f10 init stub: letters
//   @yo2 0x006b0720 init stub: languages
//   @yo2 0x006b0af0 init stub: countries
//   @yo2 0x006b0e80 init stub: digits
//   @yo2 0x006b1280 init stub: letters
//   @yo2 0x006b1d50 init stub: languages
//   @yo2 0x006b2120 init stub: countries
//   @yo2 0x006b24b0 init stub: digits
//   @yo2 0x006b28b0 init stub: letters
//   @yo2 0x006b3250 init stub: languages
//   @yo2 0x006b3620 init stub: countries
//   @yo2 0x006b39b0 init stub: digits
//   @yo2 0x006b3db0 init stub: letters
//   @yo2 0x006b41d0 init stub: languages
//   @yo2 0x006b45a0 init stub: countries
//   @yo2 0x006b4930 init stub: digits
//   @yo2 0x006b4d30 init stub: letters
//   @yo2 0x006b5710 init stub: languages
//   @yo2 0x006b5ae0 init stub: countries
//   @yo2 0x006b5e70 init stub: digits
//   @yo2 0x006b6270 init stub: letters
//   @yo2 0x006b6f20 init stub: languages
//   @yo2 0x006b72f0 init stub: countries
//   @yo2 0x006b7680 init stub: digits
//   @yo2 0x006b7a80 init stub: letters
//   @yo2 0x006c7bf0 init stub: languages
//   @yo2 0x006c7fc0 init stub: countries
//   @yo2 0x006c8350 init stub: digits
//   @yo2 0x006c8750 init stub: letters
//   @yo2 0x006c9520 init stub: languages
//   @yo2 0x006c98f0 init stub: countries
//   @yo2 0x006c9c80 init stub: digits
//   @yo2 0x006ca080 init stub: letters
//   @yo2 0x006caa10 init stub: languages
//   @yo2 0x006cade0 init stub: countries
//   @yo2 0x006cb170 init stub: digits
//   @yo2 0x006cb570 init stub: letters
//   @yo2 0x006cf160 init stub: languages
//   @yo2 0x006cf530 init stub: countries
//   @yo2 0x006cf8c0 init stub: digits
//   @yo2 0x006cfcc0 init stub: letters
//   @yo2 0x006d05b0 init stub: languages
//   @yo2 0x006d0980 init stub: countries
//   @yo2 0x006d0d10 init stub: digits
//   @yo2 0x006d1110 init stub: letters
//   @yo2 0x006d4a80 init stub: languages
//   @yo2 0x006d4e50 init stub: countries
//   @yo2 0x006d51e0 init stub: digits
//   @yo2 0x006d55e0 init stub: letters
//   @yo2 0x0073a150 init stub: languages
//   @yo2 0x0073a520 init stub: countries
//   @yo2 0x0073a8b0 init stub: digits
//   @yo2 0x0073acb0 init stub: letters
//   @yo2 0x0073c410 init stub: languages
//   @yo2 0x0073c7e0 init stub: countries
//   @yo2 0x0073cb70 init stub: digits
//   @yo2 0x0073cf70 init stub: letters
//   @yo2 0x00747760 init stub: languages
//   @yo2 0x00747b30 init stub: countries
//   @yo2 0x00747ec0 init stub: digits
//   @yo2 0x007482c0 init stub: letters
//   @yo2 0x0074b070 init stub: languages
//   @yo2 0x0074b440 init stub: countries
//   @yo2 0x0074b7d0 init stub: digits
//   @yo2 0x0074bbd0 init stub: letters
//   @yo2 0x00750cc0 init stub: languages
//   @yo2 0x00751090 init stub: countries
//   @yo2 0x00751420 init stub: digits
//   @yo2 0x00751820 init stub: letters
//   @yo2 0x00753110 init stub: languages
//   @yo2 0x007534e0 init stub: countries
//   @yo2 0x00753870 init stub: digits
//   @yo2 0x00753c70 init stub: letters
//   @yo2 0x0075bce0 init stub: languages
//   @yo2 0x0075c0b0 init stub: countries
//   @yo2 0x0075c440 init stub: digits
//   @yo2 0x0075c840 init stub: letters
//   @yo2 0x0075ffb0 init stub: languages
//   @yo2 0x00760380 init stub: countries
//   @yo2 0x00760710 init stub: digits
//   @yo2 0x00760b10 init stub: letters
//   @yo2 0x00764330 init stub: languages
//   @yo2 0x00764700 init stub: countries
//   @yo2 0x00764a90 init stub: digits
//   @yo2 0x00764e90 init stub: letters
//   @yo2 0x0076c060 init stub: languages
//   @yo2 0x0076c430 init stub: countries
//   @yo2 0x0076c7c0 init stub: digits
//   @yo2 0x0076cbc0 init stub: letters
//   @yo2 0x0076f3e0 init stub: languages
//   @yo2 0x0076f7b0 init stub: countries
//   @yo2 0x0076fb40 init stub: digits
//   @yo2 0x0076ff40 init stub: letters
//   @yo2 0x00771310 init stub: languages
//   @yo2 0x007716e0 init stub: countries
//   @yo2 0x00771a70 init stub: digits
//   @yo2 0x00771e70 init stub: letters
//   @yo2 0x00772b70 init stub: languages
//   @yo2 0x00772f40 init stub: countries
//   @yo2 0x007732d0 init stub: digits
//   @yo2 0x007736d0 init stub: letters
//   @yo2 0x0077fdf0 init stub: letters
//   @yo2 0x00785200 init stub: languages
//   @yo2 0x007855d0 init stub: countries
//   @yo2 0x00785960 init stub: digits
//   @yo2 0x00785d60 init stub: letters
//   @yo2 0x00786fd0 init stub: languages
//   @yo2 0x007873a0 init stub: countries
//   @yo2 0x00787730 init stub: digits
//   @yo2 0x00787b30 init stub: letters
//   @yo2 0x0078aa90 init stub: languages
//   @yo2 0x0078ae60 init stub: countries
//   @yo2 0x0078b1f0 init stub: digits
//   @yo2 0x0078b5f0 init stub: letters
//   @yo2 0x0078f3b0 init stub: languages
//   @yo2 0x0078f780 init stub: countries
//   @yo2 0x0078fb10 init stub: digits
//   @yo2 0x0078ff10 init stub: letters
//   @yo2 0x007902e0 init stub: 0x00790300
//   @yo2 0x00790390 init stub: 0x007903b0
//   @yo2 0x00790440 init stub: 0x00790460
//   @yo2 0x00794bf0 init stub: 0x00794c10
//   @yo2 0x007a10d0 init stub: languages
//   @yo2 0x007a14a0 init stub: countries
//   @yo2 0x007a1830 init stub: digits
//   @yo2 0x007a1c30 init stub: letters
//   @yo2 0x007adfc0 init stub: languages
//   @yo2 0x007ae390 init stub: countries
//   @yo2 0x007ae720 init stub: digits
//   @yo2 0x007aeb20 init stub: letters
//   @yo2 0x007be940 init stub: 0x007be960
//   @yo2 0x007bf680 init stub: 0x007bf6a0
//   @yo2 0x007bf850 init stub: 0x007bf870
//   @yo2 0x007bfea0 init stub: 0x007bfec0
//   @yo2 0x007c0ff0 init stub: languages
//   @yo2 0x007c13c0 init stub: countries
//   @yo2 0x007c1750 init stub: digits
//   @yo2 0x007c1b50 init stub: letters
//   @yo2 0x007c26d0 init stub: languages
//   @yo2 0x007c2aa0 init stub: countries
//   @yo2 0x007c2e30 init stub: digits
//   @yo2 0x007c3230 init stub: letters
//   @yo2 0x007cde00 init stub: languages
//   @yo2 0x007ce1d0 init stub: countries
//   @yo2 0x007ce560 init stub: digits
//   @yo2 0x007ce960 init stub: letters
//   @yo2 0x007cf690 init stub: languages
//   @yo2 0x007cfa60 init stub: countries
//   @yo2 0x007cfdf0 init stub: digits
//   @yo2 0x007d01f0 init stub: letters
//   @yo2 0x007d2c60 init stub: languages
//   @yo2 0x007d3030 init stub: countries
//   @yo2 0x007d33c0 init stub: digits
//   @yo2 0x007d37c0 init stub: letters
//   @yo2 0x007db6d0 init stub: languages
//   @yo2 0x007dbaa0 init stub: countries
//   @yo2 0x007dbe30 init stub: digits
//   @yo2 0x007dc230 init stub: letters
//   @yo2 0x007dd300 init stub: languages
//   @yo2 0x007dd6d0 init stub: countries
//   @yo2 0x007dda60 init stub: digits
//   @yo2 0x007dde60 init stub: letters
//   @yo2 0x007ebe20 init stub: languages
//   @yo2 0x007ec1f0 init stub: countries
//   @yo2 0x007ec580 init stub: digits
//   @yo2 0x007ec980 init stub: letters
//   @yo2 0x00816bd0 init stub: 0x00816bf0
//   @yo2 0x00816df0 init stub: 0x00816e10
//   @yo2 0x00834710 init stub: 0x00834730
//   @yo2 0x00840240 init stub: letters
//   @yo2 0x00840610 init stub: 0x00840630
//   @yo2 0x00840690 init stub: 0x008406b0
//   @yo2 0x00840710 init stub: 0x00840730
//   @yo2 0x00840790 init stub: 0x008407b0
//   @yo2 0x00840810 init stub: 0x00840830
//   @yo2 0x00840890 init stub: 0x008408b0
//   @yo2 0x00840910 init stub: 0x00840930
//   @yo2 0x00840990 init stub: 0x008409b0
//   @yo2 0x00840a10 init stub: 0x00840a30
//   @yo2 0x00841250 init stub: languages
//   @yo2 0x00841620 init stub: countries
//   @yo2 0x008419b0 init stub: digits
//   @yo2 0x00841db0 init stub: letters
//   @yo2 0x00842b70 init stub: languages
//   @yo2 0x00842f40 init stub: countries
//   @yo2 0x008432d0 init stub: digits
//   @yo2 0x008436d0 init stub: letters
//   @yo2 0x00847390 init stub: languages
//   @yo2 0x00847760 init stub: countries
//   @yo2 0x00847af0 init stub: digits
//   @yo2 0x00847ef0 init stub: letters
//   @yo2 0x0084c600 init stub: languages
//   @yo2 0x0084c9d0 init stub: countries
//   @yo2 0x0084cd60 init stub: digits
//   @yo2 0x0084d160 init stub: letters
//   @yo2 0x0084d6b0 init stub: 0x0084d6d0
//   @yo2 0x0084fba0 init stub: languages
//   @yo2 0x0084ff70 init stub: countries
//   @yo2 0x00850300 init stub: digits
//   @yo2 0x00850700 init stub: letters
//   @yo2 0x0085b530 init stub: languages
//   @yo2 0x0085b900 init stub: countries
//   @yo2 0x0085bc90 init stub: digits
//   @yo2 0x0085c090 init stub: letters
//   @yo2 0x0085e520 init stub: 0x0085e540
//   @yo2 0x0085e820 init stub: languages
//   @yo2 0x0085ebf0 init stub: countries
//   @yo2 0x0085ef80 init stub: digits
//   @yo2 0x0085f380 init stub: letters
//   @yo2 0x0085f750 init stub: 0x0085f770
//   @yo2 0x00883c40 init stub: languages
//   @yo2 0x00884010 init stub: countries
//   @yo2 0x008843a0 init stub: digits
//   @yo2 0x008847a0 init stub: letters
//   @yo2 0x00887430 init stub: languages
//   @yo2 0x00887800 init stub: countries
//   @yo2 0x00887b90 init stub: digits
//   @yo2 0x00887f90 init stub: letters
//   @yo2 0x008a5d80 init stub: languages
//   @yo2 0x008a6150 init stub: countries
//   @yo2 0x008a64e0 init stub: digits
//   @yo2 0x008a68e0 init stub: letters
//   @yo2 0x008c13b0 init stub: 0x008c13d0
//   @yo2 0x00905ec0 init stub: 0x00905ee0
//   @yo2 0x00983480 init stub: 0x009834a0
// jmp initializer stubs (17):
//   @yo2 0x0059b3c0 jmp initializer stub -> 0x0059b3e0
//   @yo2 0x005e10b0 jmp initializer stub -> 0x005e10d0
//   @yo2 0x006035e0 jmp initializer stub -> 0x00603600
//   @yo2 0x006068c0 jmp initializer stub -> 0x006068e0
//   @yo2 0x00606f40 jmp initializer stub -> 0x00606f60
//   @yo2 0x006136c0 jmp initializer stub -> 0x006136e0
//   @yo2 0x00615b10 jmp initializer stub -> 0x00615b30
//   @yo2 0x0061f940 jmp initializer stub -> 0x0061f960
//   @yo2 0x00621ab0 jmp initializer stub -> 0x00621ad0
//   @yo2 0x0062aad0 jmp initializer stub -> 0x0062aaf0
//   @yo2 0x00637280 jmp initializer stub -> 0x006372a0
//   @yo2 0x007d07a0 jmp initializer stub -> 0x007d07c0
//   @yo2 0x00833d20 jmp initializer stub -> 0x00833d40
//   @yo2 0x0084d530 jmp initializer stub -> 0x0084d550
//   @yo2 0x00905e10 jmp initializer stub -> 0x00905e30
//   @yo2 0x009833d0 jmp initializer stub -> 0x009833f0
//   @yo2 0x00adade0 jmp initializer stub -> 0x00adae00
// atexit(F) registrations (23):
//   @yo2 0x00615c00 atexit(0x00615c20) registration
//   @yo2 0x0064f1e0 atexit(0x0064f200) registration
//   @yo2 0x00790330 atexit(0x00790350) registration
//   @yo2 0x007903e0 atexit(0x00790400) registration
//   @yo2 0x00790490 atexit(0x007904b0) registration
//   @yo2 0x007bf6d0 atexit(0x007bf6f0) registration
//   @yo2 0x00816da0 atexit(0x00816dc0) registration
//   @yo2 0x00817170 atexit(0x00817190) registration
//   @yo2 0x00834750 atexit(0x00834770) registration
//   @yo2 0x00840650 atexit(0x00840670) registration
//   @yo2 0x008406d0 atexit(0x008406f0) registration
//   @yo2 0x00840750 atexit(0x00840770) registration
//   @yo2 0x008407d0 atexit(0x008407f0) registration
//   @yo2 0x00840850 atexit(0x00840870) registration
//   @yo2 0x008408d0 atexit(0x008408f0) registration
//   @yo2 0x00840950 atexit(0x00840970) registration
//   @yo2 0x008409d0 atexit(0x008409f0) registration
//   @yo2 0x00840a50 atexit(0x00840a70) registration
//   @yo2 0x0084d6f0 atexit(0x0084d710) registration
//   @yo2 0x0085f790 atexit(0x0085f7b0) registration
//   @yo2 0x008c1400 atexit(0x008c1420) registration
//   @yo2 0x00905f00 atexit(0x00905f20) registration
//   @yo2 0x009834c0 atexit(0x009834e0) registration
// scalar deleting destructors (311):
//   @yo2 0x005a0b80 CD3DTextureManager scalar deleting destructor
//   @yo2 0x005c7910 CWindowTaskProgress scalar deleting destructor
//   @yo2 0x005d0200 CWindowTaskTab scalar deleting destructor
//   @yo2 0x005d3de0 CWindowTaskMenubar scalar deleting destructor
//   @yo2 0x005d5ae0 CWindowTaskCardWindow scalar deleting destructor
//   @yo2 0x005da260 basic_ios@DUchar_traits@D@std@@@std scalar deleting destructor
//   @yo2 0x005da2d0 basic_streambuf@DUchar_traits@D@std@@@std scalar deleting destructor
//   @yo2 0x005da5f0 basic_stringbuf@DUchar_traits@D@std@@Vallocator@D@2@@std scalar deleting destructor
//   @yo2 0x005dad60 bad_cast@std scalar deleting destructor
//   @yo2 0x005db160 ctype@D@std scalar deleting destructor
//   @yo2 0x005e48c0 CWindowModelThinImg scalar deleting destructor
//   @yo2 0x005e5b50 CWindowModelHelp scalar deleting destructor
//   @yo2 0x005e8520 CWindowModelInput1 scalar deleting destructor
//   @yo2 0x005ea6f0 CWindowModelInput2 scalar deleting destructor
//   @yo2 0x005ef7e0 CWindowModelInformation scalar deleting destructor
//   @yo2 0x005f18f0 CWindowModelPictureButton scalar deleting destructor
//   @yo2 0x005f2710 CWindowModelChatWindow scalar deleting destructor
//   @yo2 0x005f5530 CWindowModelCardDetail scalar deleting destructor
//   @yo2 0x005fa7a0 CWindowModelBalloon scalar deleting destructor
//   @yo2 0x006020c0 CCallbackM3@VCInformationCallback@@HPAVCWindowTaskModel@@W4CALLBACK_MESSAGE_TYPE@@H scalar deleting destructor
//   @yo2 0x006020f0 CCallbackM3@VCInformationCallback@@HPAVCWindowTaskModel@@W4CALLBACK_MESSAGE_TYPE@@H scalar deleting destructor
//   @yo2 0x00618b20 CPlayerConfigManager scalar deleting destructor
//   @yo2 0x0062b0e0 CTaskCaptureKey scalar deleting destructor
//   @yo2 0x0062ddf0 CTmBreakPoint scalar deleting destructor
//   @yo2 0x006332e0 CTaskCapture scalar deleting destructor
//   @yo2 0x0063aea0 CMapTestSceneKey@CMapTestScene scalar deleting destructor
//   @yo2 0x0063c360 CPlayerInfo scalar deleting destructor
//   @yo2 0x00649780 CUgajinWndScene scalar deleting destructor
//   @yo2 0x0064b3f0 CWindowMessenger scalar deleting destructor
//   @yo2 0x0064c920 CTakanoEntryScene scalar deleting destructor
//   @yo2 0x0064ec80 CTamaiEntryScene scalar deleting destructor
//   @yo2 0x00651d20 CPlaneLoaderElm scalar deleting destructor
//   @yo2 0x00659020 CNpcViewer scalar deleting destructor
//   @yo2 0x00661760 CMyKey@CEntryScene scalar deleting destructor
//   @yo2 0x00661790 CEntryScene scalar deleting destructor
//   @yo2 0x00664d20 CTmSwfSearchObj scalar deleting destructor
//   @yo2 0x006651a0 CTmSwfMousePoint scalar deleting destructor
//   @yo2 0x006653e0 CTmSwfObjEvent scalar deleting destructor
//   @yo2 0x006656b0 CTmSwfPlay scalar deleting destructor
//   @yo2 0x00665830 CTmSwfSetMember scalar deleting destructor
//   @yo2 0x00665a10 CTmSwfCallMethod scalar deleting destructor
//   @yo2 0x006689c0 CTmSwfGetMember scalar deleting destructor
//   @yo2 0x0066a9b0 CTmSwfGetEngine scalar deleting destructor
//   @yo2 0x0066cb80 CTmSwfRemoveObject2 scalar deleting destructor
//   @yo2 0x0066cc60 CTmSwfSetDisp scalar deleting destructor
//   @yo2 0x006704b0 CSwfEngine scalar deleting destructor
//   @yo2 0x00672200 CSwfEngine scalar deleting destructor
//   @yo2 0x00672640 CSwfObj scalar deleting destructor
//   @yo2 0x00673fb0 CSwfShape scalar deleting destructor
//   @yo2 0x00675430 CSwfSprite scalar deleting destructor
//   @yo2 0x00675880 CTmSwfDirty scalar deleting destructor
//   @yo2 0x00676980 CSwfButton2 scalar deleting destructor
//   @yo2 0x00678160 CSwfText scalar deleting destructor
//   @yo2 0x00685a10 CSclSound scalar deleting destructor
//   @yo2 0x006869a0 CommonSound scalar deleting destructor
//   @yo2 0x00686b90 InternalSound scalar deleting destructor
//   @yo2 0x00687cd0 StreamSound scalar deleting destructor
//   @yo2 0x0068cc10 CMessageIOBase scalar deleting destructor
//   @yo2 0x0068e730 CMyUser scalar deleting destructor
//   @yo2 0x0068e7e0 CNetAccount scalar deleting destructor
//   @yo2 0x0069a370 CServerList scalar deleting destructor
//   @yo2 0x0069a3a0 CNetGate scalar deleting destructor
//   @yo2 0x006aa7a0 COnlinePlayer scalar deleting destructor
//   @yo2 0x006aa850 CLobbyPlayerList scalar deleting destructor
//   @yo2 0x006aa900 CDuelRoomList scalar deleting destructor
//   @yo2 0x006aaad0 CChampsEntryList scalar deleting destructor
//   @yo2 0x006aad80 CChampsData scalar deleting destructor
//   @yo2 0x006aaec0 CBlockList scalar deleting destructor
//   @yo2 0x006aaf60 CNetLobby scalar deleting destructor
//   @yo2 0x006b0670 CNetLobby scalar deleting destructor
//   @yo2 0x006b06a0 CNetLobby scalar deleting destructor
//   @yo2 0x006e26e0 CTaskPtr@VCWindowModelProgress scalar deleting destructor
//   @yo2 0x007468a0 smart_ptr@VCGameObject scalar deleting destructor
//   @yo2 0x007468d0 smart_ptr@VCCard scalar deleting destructor
//   @yo2 0x0075d150 CCardDetailViewDlg scalar deleting destructor
//   @yo2 0x007637e0 CChainEffect scalar deleting destructor
//   @yo2 0x0076e1b0 CDeckObject scalar deleting destructor
//   @yo2 0x0076e320 CExclusionObject scalar deleting destructor
//   @yo2 0x0076ecc0 CExclusionEffect scalar deleting destructor
//   @yo2 0x00770530 CDuelDemoTask scalar deleting destructor
//   @yo2 0x00773d00 CUOkDialog scalar deleting destructor
//   @yo2 0x007742b0 CUYesNoDialog scalar deleting destructor
//   @yo2 0x00774ca0 CUPhaseYesNoDialog scalar deleting destructor
//   @yo2 0x00780720 CDuelAvaTask scalar deleting destructor
//   @yo2 0x00788b70 CFieldChangeEffect scalar deleting destructor
//   @yo2 0x00788be0 CDuelField scalar deleting destructor
//   @yo2 0x0078bbf0 CDuelMsgTask scalar deleting destructor
//   @yo2 0x00792730 CGameObjectManager scalar deleting destructor
//   @yo2 0x00793070 CMouseLayerEx scalar deleting destructor
//   @yo2 0x007931d0 CMyKey@CDuelCursor scalar deleting destructor
//   @yo2 0x00793200 CDuelCursor scalar deleting destructor
//   @yo2 0x007932b0 CSummonManager scalar deleting destructor
//   @yo2 0x007933f0 CChainManager scalar deleting destructor
//   @yo2 0x00793530 CDuelScene scalar deleting destructor
//   @yo2 0x0079e750 smart_ptr@VCUGDialogBase scalar deleting destructor
//   @yo2 0x007a22a0 CSetEffect scalar deleting destructor
//   @yo2 0x007a2b90 CSummonEffect scalar deleting destructor
//   @yo2 0x007a35c0 CSpriteElmOlder scalar deleting destructor
//   @yo2 0x007a35f0 CSpecialSummonEffect scalar deleting destructor
//   @yo2 0x007a3d20 CActivateEffect scalar deleting destructor
//   @yo2 0x007a42c0 CHappenEffect scalar deleting destructor
//   @yo2 0x007a4940 CBreakEffect scalar deleting destructor
//   @yo2 0x007a4ee0 CExplosionEffect scalar deleting destructor
//   @yo2 0x007a5320 CDuelBeginEffect scalar deleting destructor
//   @yo2 0x007a5620 CDuelStartEffect scalar deleting destructor
//   @yo2 0x007a5c60 CDuelEndEffect scalar deleting destructor
//   @yo2 0x007a6750 CFusionEffect scalar deleting destructor
//   @yo2 0x007a7960 CDisableEffect scalar deleting destructor
//   @yo2 0x007a7d90 CShuffleEffect scalar deleting destructor
//   @yo2 0x007a83c0 CExodiaPreEffect scalar deleting destructor
//   @yo2 0x007a8580 CExodiaSubEffect scalar deleting destructor
//   @yo2 0x007a8a60 CExodiaEffect scalar deleting destructor
//   @yo2 0x007aa2b0 CEquipEffect scalar deleting destructor
//   @yo2 0x007aa7f0 CDiceEffect scalar deleting destructor
//   @yo2 0x007ab350 CCoinEffect scalar deleting destructor
//   @yo2 0x007ac5c0 CTurnCountExEffect scalar deleting destructor
//   @yo2 0x007acec0 CVijaEffect scalar deleting destructor
//   @yo2 0x007ad540 CFinalCountEffect scalar deleting destructor
//   @yo2 0x007ada40 CVennominagaEffect scalar deleting destructor
//   @yo2 0x007ade80 CFadeEffect scalar deleting destructor
//   @yo2 0x007af010 CDuelStartEffectTask scalar deleting destructor
//   @yo2 0x007afbf0 CDuelEndEffectTask scalar deleting destructor
//   @yo2 0x007b1060 CExplosionEffectTask scalar deleting destructor
//   @yo2 0x007b1e50 CBreakEffectTask scalar deleting destructor
//   @yo2 0x007b28c0 CActivateEffectTask scalar deleting destructor
//   @yo2 0x007b4a30 CFusionEffectTask scalar deleting destructor
//   @yo2 0x007b7d80 CSummonEffectTask scalar deleting destructor
//   @yo2 0x007b8c90 CSpecialSummonEffectTask scalar deleting destructor
//   @yo2 0x007b9e30 COsirisEffectTask scalar deleting destructor
//   @yo2 0x007bb7c0 COberiEffectTask scalar deleting destructor
//   @yo2 0x007bd150 CRaEffectTask scalar deleting destructor
//   @yo2 0x007c2170 CUGHelpManager scalar deleting destructor
//   @yo2 0x007c3910 CJankenScene scalar deleting destructor
//   @yo2 0x007c3b60 CMyKey@CJankenScene scalar deleting destructor
//   @yo2 0x007cb030 CJankenTimer scalar deleting destructor
//   @yo2 0x007cc9e0 CTimeNumber scalar deleting destructor
//   @yo2 0x007cd710 CMyKey scalar deleting destructor
//   @yo2 0x007cdc90 CMyKeyDlg scalar deleting destructor
//   @yo2 0x007cef30 CLifeCounter scalar deleting destructor
//   @yo2 0x007d3d60 CPhaseName scalar deleting destructor
//   @yo2 0x007d4690 CPhaseCounter scalar deleting destructor
//   @yo2 0x007d9cd0 CYo2ProgressBar scalar deleting destructor
//   @yo2 0x007dce80 CScreenFader scalar deleting destructor
//   @yo2 0x007de760 CStaticField scalar deleting destructor
//   @yo2 0x007ede00 CSacrificeEffect scalar deleting destructor
//   @yo2 0x007edf90 CGameActionObject scalar deleting destructor
//   @yo2 0x007ef3e0 CMaterialEffect scalar deleting destructor
//   @yo2 0x007f1f50 COptionDlg scalar deleting destructor
//   @yo2 0x007fddb0 CWindowLogin scalar deleting destructor
//   @yo2 0x00804a80 CLoginScene scalar deleting destructor
//   @yo2 0x0080a040 CWindowPlayerSelect scalar deleting destructor
//   @yo2 0x00810980 CPlayerSelectScene scalar deleting destructor
//   @yo2 0x00817550 CDuelDiskShelf scalar deleting destructor
//   @yo2 0x0081a690 CDisplayDueldisk scalar deleting destructor
//   @yo2 0x0081c140 CDuelDiskList scalar deleting destructor
//   @yo2 0x00824030 CTaskPtr@VCWindowModelDueldiskRearrenge scalar deleting destructor
//   @yo2 0x00825530 CMyRoomScene scalar deleting destructor
//   @yo2 0x0082ccf0 CMyRoom2MapTask scalar deleting destructor
//   @yo2 0x00830c10 CMyRoomTv scalar deleting destructor
//   @yo2 0x00833140 CSerialize scalar deleting destructor
//   @yo2 0x00834f20 CWindowTaskDMailItem scalar deleting destructor
//   @yo2 0x008373a0 CWindowModelDMail scalar deleting destructor
//   @yo2 0x0083b0f0 CWindowModelDMailSend scalar deleting destructor
//   @yo2 0x0083f590 CTaskPtr@VCWindowTaskMultiInput scalar deleting destructor
//   @yo2 0x00842250 CCardGetDuelpassScene scalar deleting destructor
//   @yo2 0x00843be0 CCardGetPackScene scalar deleting destructor
//   @yo2 0x00848530 CWindowModelReturnButton scalar deleting destructor
//   @yo2 0x00848b60 CCardGetOpener scalar deleting destructor
//   @yo2 0x0084a1c0 CCardGetResultScene scalar deleting destructor
//   @yo2 0x0084ee20 CWindowModelListCardPack scalar deleting destructor
//   @yo2 0x0084fb20 CWindowModelListCardPack scalar deleting destructor
//   @yo2 0x00858c60 CCardPackCheckScene scalar deleting destructor
//   @yo2 0x00859bd0 CWindowPackSelect scalar deleting destructor
//   @yo2 0x00860090 CLobbyScene scalar deleting destructor
//   @yo2 0x00888750 CPlayerListDlg scalar deleting destructor
//   @yo2 0x008a8cf0 CWindowDialogAvatarSwitch scalar deleting destructor
//   @yo2 0x008b0e30 CChangeAvatarPack scalar deleting destructor
//   @yo2 0x008b45a0 CChangeAvaterScene scalar deleting destructor
//   @yo2 0x008b7380 CMatchResultTask scalar deleting destructor
//   @yo2 0x008bafe0 CDuelEndEffect2 scalar deleting destructor
//   @yo2 0x008bb150 CDuelEndScene scalar deleting destructor
//   @yo2 0x008be180 CDuelGunsStarTask scalar deleting destructor
//   @yo2 0x008c18b0 CResultScene scalar deleting destructor
//   @yo2 0x008c5080 CWindowTaskResultBase scalar deleting destructor
//   @yo2 0x008c5c20 CWindowResultScroll scalar deleting destructor
//   @yo2 0x008c67f0 CWindowResultNext scalar deleting destructor
//   @yo2 0x008cf260 CCardSwapScene scalar deleting destructor
//   @yo2 0x008d7a40 CDeckScene scalar deleting destructor
//   @yo2 0x008ec250 CPresentScene scalar deleting destructor
//   @yo2 0x008f1b50 CTpScene scalar deleting destructor
//   @yo2 0x008f6af0 CTradeScene scalar deleting destructor
//   @yo2 0x009094c0 CWindowTaskDeckFigure scalar deleting destructor
//   @yo2 0x009215a0 CDeckMouseOperate scalar deleting destructor
//   @yo2 0x00921800 CCardFileList scalar deleting destructor
//   @yo2 0x00921da0 CDeckCardPicture scalar deleting destructor
//   @yo2 0x009227c0 CDeckCardLoader scalar deleting destructor
//   @yo2 0x00923150 CWindowModelInputValue scalar deleting destructor
//   @yo2 0x009352f0 CWindowTaskDeckNumber scalar deleting destructor
//   @yo2 0x009557a0 CWindowTaskKabanNumber scalar deleting destructor
//   @yo2 0x0097cfa0 CWindowTaskPresentCard scalar deleting destructor
//   @yo2 0x0097dfe0 CWindowTaskPresent scalar deleting destructor
//   @yo2 0x009812f0 CWindowModelPresent scalar deleting destructor
//   @yo2 0x00987120 CWindowTaskTpCard scalar deleting destructor
//   @yo2 0x00988290 CWindowTaskTp scalar deleting destructor
//   @yo2 0x0098d790 CWindowModelTp scalar deleting destructor
//   @yo2 0x00990760 CWindowTaskTrade scalar deleting destructor
//   @yo2 0x00994bb0 CWindowModelTrade scalar deleting destructor
//   @yo2 0x0099b1d0 CTourMng scalar deleting destructor
//   @yo2 0x0099d7a0 CTournamentScene scalar deleting destructor
//   @yo2 0x009a5550 CTourTree scalar deleting destructor
//   @yo2 0x009a6d90 CTourTreePlateBase scalar deleting destructor
//   @yo2 0x009a7450 CTourTreePlate scalar deleting destructor
//   @yo2 0x009aeb40 CTourFinalPlate scalar deleting destructor
//   @yo2 0x009b1c20 CTourInfoPlate scalar deleting destructor
//   @yo2 0x009b6700 CTourConsoleBase scalar deleting destructor
//   @yo2 0x009b6750 CTourConsole scalar deleting destructor
//   @yo2 0x009b9800 CTourConsoleFinal scalar deleting destructor
//   @yo2 0x009be440 CAvatarNetSupport scalar deleting destructor
//   @yo2 0x009beaf0 CTmAvaNetSupport scalar deleting destructor
//   @yo2 0x009c4120 CKey@CChibiAvatarCtrl scalar deleting destructor
//   @yo2 0x009c4730 CChibiAvatarCtrl scalar deleting destructor
//   @yo2 0x009d3d20 CChibiAvatarMng scalar deleting destructor
//   @yo2 0x009d8fc0 CNpcChibiAvatar scalar deleting destructor
//   @yo2 0x009dbc70 CNpcStar scalar deleting destructor
//   @yo2 0x009e3090 CWaistUpAvatar scalar deleting destructor
//   @yo2 0x009eeb30 CWaistUpNpc scalar deleting destructor
//   @yo2 0x009f3b80 CWUFace scalar deleting destructor
//   @yo2 0x009f7f10 CWaistUpScale scalar deleting destructor
//   @yo2 0x009f81d0 CWaistUpNpcScale scalar deleting destructor
//   @yo2 0x009fb490 CAreaMapScene scalar deleting destructor
//   @yo2 0x00a07dd0 CMoveMenuTask scalar deleting destructor
//   @yo2 0x00a09ef0 CBgCommon scalar deleting destructor
//   @yo2 0x00a148e0 CWindowTaskListboxCard scalar deleting destructor
//   @yo2 0x00a15fe0 CWindowTaskViewImgAndTextItem scalar deleting destructor
//   @yo2 0x00a160b0 CWindowTaskViewItemCardAttr scalar deleting destructor
//   @yo2 0x00a16a20 CWindowTaskListboxCardAttr scalar deleting destructor
//   @yo2 0x00a177f0 CWindowTaskViewItemCardType scalar deleting destructor
//   @yo2 0x00a18160 CWindowTaskListboxCardType scalar deleting destructor
//   @yo2 0x00a18f50 CWindowTaskViewItemCardIcon scalar deleting destructor
//   @yo2 0x00a198c0 CWindowTaskListboxCardIcon scalar deleting destructor
//   @yo2 0x00a1a690 CWindowTaskViewItemCardStar scalar deleting destructor
//   @yo2 0x00a1b010 CWindowTaskListboxCardStar scalar deleting destructor
//   @yo2 0x00a1bdb0 CWindowTaskViewItemCardForbi scalar deleting destructor
//   @yo2 0x00a1c730 CWindowTaskListboxCardForbi scalar deleting destructor
//   @yo2 0x00a1d430 CWindowModelListCard scalar deleting destructor
//   @yo2 0x00a1f2e0 CWindowModelListCardIcon scalar deleting destructor
//   @yo2 0x00a1fda0 CWindowModelListCardStar scalar deleting destructor
//   @yo2 0x00a20860 CWindowModelListCardForbi scalar deleting destructor
//   @yo2 0x00a213b0 CWindowTaskImageDuelCmd scalar deleting destructor
//   @yo2 0x00a21810 CWindowTaskViewItemDuelCmd scalar deleting destructor
//   @yo2 0x00a220b0 CWindowTaskListboxDuelCmd scalar deleting destructor
//   @yo2 0x00a27d30 CDMailTask scalar deleting destructor
//   @yo2 0x00a32340 CChampLogTask scalar deleting destructor
//   @yo2 0x00a37010 CWindowTaskFrameDuel scalar deleting destructor
//   @yo2 0x00a38480 CWindowModelDuel scalar deleting destructor
//   @yo2 0x00a3acc0 CWindowTaskInputDuel scalar deleting destructor
//   @yo2 0x00a3c800 CWindowModelDuelWait scalar deleting destructor
//   @yo2 0x00a41220 CWindowModelDuelFind scalar deleting destructor
//   @yo2 0x00a43830 CWindowModelJoinGunsling scalar deleting destructor
//   @yo2 0x00a52300 CFieldMap scalar deleting destructor
//   @yo2 0x00a6a9b0 CWindowModelMove scalar deleting destructor
//   @yo2 0x00a6ba00 CWindowModelSetComment scalar deleting destructor
//   @yo2 0x00a6e570 CWindowModelProfile scalar deleting destructor
//   @yo2 0x00a746e0 CFixedsentenceList scalar deleting destructor
//   @yo2 0x00a75380 CChatWindow scalar deleting destructor
//   @yo2 0x00a79f90 CNoticeIconBase scalar deleting destructor
//   @yo2 0x00a7a030 CNoticeIconMaintenance scalar deleting destructor
//   @yo2 0x00a7ab30 CNoticeIconMail scalar deleting destructor
//   @yo2 0x00a7b350 CNoticeIconFriend scalar deleting destructor
//   @yo2 0x00a7bb70 CNoticeIconDuelroom scalar deleting destructor
//   @yo2 0x00a7c390 CNoticeIconOffer scalar deleting destructor
//   @yo2 0x00a7cbb0 CNoticeIconEvent scalar deleting destructor
//   @yo2 0x00a7d3d0 CNoticeIconTour scalar deleting destructor
//   @yo2 0x00a7dbf0 CNoticeIconTeam scalar deleting destructor
//   @yo2 0x00a7e4a0 CWindowModelMenu scalar deleting destructor
//   @yo2 0x00a80cf0 CWindowModelGoEvent scalar deleting destructor
//   @yo2 0x00a82070 CWindowModelAboutEvent scalar deleting destructor
//   @yo2 0x00a83de0 CWindowModelDuelpassInputCode scalar deleting destructor
//   @yo2 0x00a86cf0 CWindowModelDuelpass150 scalar deleting destructor
//   @yo2 0x00a892b0 CWindowModelDuelpassUSB scalar deleting destructor
//   @yo2 0x00a8c040 CWindowTaskFramePlace scalar deleting destructor
//   @yo2 0x00a8d350 CWindowModelPlace scalar deleting destructor
//   @yo2 0x00a8eec0 CWindowModelBlacklist scalar deleting destructor
//   @yo2 0x00a8f1c0 CWindowModelFriendBlacklist scalar deleting destructor
//   @yo2 0x00a92ce0 CWindowModelBlacklistInput scalar deleting destructor
//   @yo2 0x00a93680 CWindowModelFriendlist scalar deleting destructor
//   @yo2 0x00a958c0 CWindowModelTeamlist scalar deleting destructor
//   @yo2 0x00a9c8d0 CDuelLogTask scalar deleting destructor
//   @yo2 0x00aaa600 CWindowTaskDuellogFrame scalar deleting destructor
//   @yo2 0x00aab950 CWindowModelDuellogTop scalar deleting destructor
//   @yo2 0x00aaf9c0 CWindowModelDuellogList scalar deleting destructor
//   @yo2 0x00ab3230 CSwfMessRecv scalar deleting destructor
//   @yo2 0x00ab3690 CWindowModelDuellogTour scalar deleting destructor
//   @yo2 0x00ab7670 CWindowModelDuellogOperation scalar deleting destructor
//   @yo2 0x00aba420 CWindowModelDuellogSearch scalar deleting destructor
//   @yo2 0x00abca80 CWindowTaskDueldiskRearrengeListbox scalar deleting destructor
//   @yo2 0x00abd660 CWindowTaskDueldiskRearrengeFrame scalar deleting destructor
//   @yo2 0x00abe8c0 CWindowModelDueldiskRearrenge scalar deleting destructor
//   @yo2 0x00ac11a0 CWindowModelFriendEnum scalar deleting destructor
//   @yo2 0x00ac27f0 CWindowModelItemGet scalar deleting destructor
//   @yo2 0x00ac72d0 CChangeTitleTask scalar deleting destructor
//   @yo2 0x00ac8270 CWindowModelTitleConfig scalar deleting destructor
//   @yo2 0x00ad3330 CCallbackM3@VCDuelLogTask@@HPAVCWindowTaskModel@@W4CALLBACK_MESSAGE_TYPE@@H scalar deleting destructor
//   @yo2 0x00adc390 CWorldMng scalar deleting destructor
//   @yo2 0x00ae4a80 CShopNpcProfile scalar deleting destructor
//   @yo2 0x00ae5ef0 CShopWindowBase scalar deleting destructor
//   @yo2 0x00ae5ff0 CShopCategoryWindow scalar deleting destructor
//   @yo2 0x00aeda70 CShopCardWindow scalar deleting destructor
//   @yo2 0x00af1db0 CShopPackWindow scalar deleting destructor
//   @yo2 0x00af7300 CShopAvatarWindow scalar deleting destructor
//   @yo2 0x00afc680 CShopScene scalar deleting destructor
