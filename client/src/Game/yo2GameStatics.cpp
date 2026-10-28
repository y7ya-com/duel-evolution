// The compiler-made static initialisers of the src\Game objects in 0x9bd1c0..0xa5ffff. Every object file that
// includes the shared headers gets the same few; they are written once here and the copies are listed (as for
// System/yo2Lang.h and src/Deck/DeckUtil.cpp).
#include "System/yo2Lang.h"

namespace {
// Two empty statics from a shared header (their destructor, 0x004231e0, is a bare ret): a function-local one guarded
// by bit 1 of DAT_012d3501, and a namespace-scope one; both registered with atexit.
struct EmptyStatic {
    ~EmptyStatic() {}
};

// guarded local static + atexit (35 copies):
//   @yo2 0x009bd1c0 @yo2 0x009c19f0 @yo2 0x009c3090 @yo2 0x009c6e30
//   @yo2 0x009d01f0 @yo2 0x009d5a40 @yo2 0x009d63b0 @yo2 0x009dab40
//   @yo2 0x009dc410 @yo2 0x009dccc0 @yo2 0x009dcd10 @yo2 0x009e11c0
//   @yo2 0x009f94e0 @yo2 0x009f9600 @yo2 0x009f96e0 @yo2 0x009f97c0
//   @yo2 0x009f98a0 @yo2 0x009f9980 @yo2 0x009f9a60 @yo2 0x009f9b40
//   @yo2 0x009f9c20 @yo2 0x00a04650 @yo2 0x00a05d50 @yo2 0x00a065c0
//   @yo2 0x00a268f0 @yo2 0x00a2d550 @yo2 0x00a34ba0 @yo2 0x00a4fbe0
//   @yo2 0x00a538d0 @yo2 0x00a5c3c0 @yo2 0x00a5e120 @yo2 0x009bece0
//   @yo2 0x00a08db0 @yo2 0x00a0cd40 @yo2 0x00a4c550
[[maybe_unused]] EmptyStatic& localEmpty() {
    static EmptyStatic s;
    return s;
}

// atexit of the namespace-scope one (35 copies):
//   @yo2 0x009bd1f0 @yo2 0x009c1a20 @yo2 0x009c30c0 @yo2 0x009c6e60
//   @yo2 0x009d0220 @yo2 0x009d5a70 @yo2 0x009d63e0 @yo2 0x009dab70
//   @yo2 0x009dc440 @yo2 0x009dccf0 @yo2 0x009dcd40 @yo2 0x009e11f0
//   @yo2 0x009f9510 @yo2 0x009f9630 @yo2 0x009f9710 @yo2 0x009f97f0
//   @yo2 0x009f98d0 @yo2 0x009f99b0 @yo2 0x009f9a90 @yo2 0x009f9b70
//   @yo2 0x009f9c50 @yo2 0x00a04680 @yo2 0x00a05d80 @yo2 0x00a065f0
//   @yo2 0x00a26920 @yo2 0x00a2d580 @yo2 0x00a34bd0 @yo2 0x00a4fc10
//   @yo2 0x00a53900 @yo2 0x00a5c3f0 @yo2 0x00a5e150 @yo2 0x009bed10
//   @yo2 0x00a08de0 @yo2 0x00a0cd70 @yo2 0x00a4c580
EmptyStatic s_empty;
}  // namespace

// yo2Lang.h's four tables, per object: the entry stub that runs a table's initialiser and then registers its atexit
// (the initialisers and the atexit registrations are listed in System/yo2Lang.h) (60 copies):
//   @yo2 0x009bd210 @yo2 0x009bd5e0 @yo2 0x009bd970 @yo2 0x009bdd70
//   @yo2 0x009c30e0 @yo2 0x009c34b0 @yo2 0x009c3840 @yo2 0x009c3c40
//   @yo2 0x009c6e80 @yo2 0x009c7250 @yo2 0x009c75e0 @yo2 0x009c79e0
//   @yo2 0x009d0240 @yo2 0x009d0610 @yo2 0x009d09a0 @yo2 0x009d0da0
//   @yo2 0x009d6400 @yo2 0x009d67d0 @yo2 0x009d6b60 @yo2 0x009d6f60
//   @yo2 0x009dcd60 @yo2 0x009dd130 @yo2 0x009dd4c0 @yo2 0x009dd8c0
//   @yo2 0x009e1210 @yo2 0x009e15e0 @yo2 0x009e1970 @yo2 0x009e1d70
//   @yo2 0x009f9c70 @yo2 0x009fa040 @yo2 0x009fa3d0 @yo2 0x009fa7d0
//   @yo2 0x00a06610 @yo2 0x00a069e0 @yo2 0x00a06d70 @yo2 0x00a07170
//   @yo2 0x00a26940 @yo2 0x00a26d10 @yo2 0x00a270a0 @yo2 0x00a274a0
//   @yo2 0x00a2d5a0 @yo2 0x00a2d970 @yo2 0x00a2dd00 @yo2 0x00a2e100
//   @yo2 0x00a34bf0 @yo2 0x00a34fc0 @yo2 0x00a35350 @yo2 0x00a35750
//   @yo2 0x00a53920 @yo2 0x00a53cf0 @yo2 0x00a54080 @yo2 0x00a54480
//   @yo2 0x00a08e00 @yo2 0x00a091d0 @yo2 0x00a09560 @yo2 0x00a09960
//   @yo2 0x00a0cd90 @yo2 0x00a0d160 @yo2 0x00a0d4f0 @yo2 0x00a0d8f0
