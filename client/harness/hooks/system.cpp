// Small src/System functions rewritten here as differential-test subjects (move them into src/System when it has an
// owner; the yo2_ exports stay as the adapters).
#include "../yo2hook.h"

struct Pod12 { uint32_t a, b, c; };

// @yo2 0x00587b80 std::uninitialized_copy for a 12-byte POD (MSVC 6 placement new skips a null destination)
YO2_HOOK Pod12* __stdcall yo2_587b80(const Pod12* first, const Pod12* last, Pod12* dest) {
    for (; first != last; ++first, ++dest)
        if (dest) *dest = *first;
    return dest;
}

// A list of 0x4c-byte entries with a float rect at +0x24, count at +0x50, entries from +0x60. Owner class unknown yet.
struct HitEntry {
    uint8_t head[0x24];
    float x, y, w, h;
    uint8_t tail[0x4c - 0x34];
};
static_assert(sizeof(HitEntry) == 0x4c, "layout");

// @yo2 0x0059b110 first entry whose rect contains the point (edges inclusive), or null
YO2_HOOK HitEntry* __cdecl yo2_59b110(uint8_t* list, int px, int py) {
    int n = *(int*)(list + 0x50);
    HitEntry* e = (HitEntry*)(list + 0x60);
    float fx = (float)px, fy = (float)py;
    for (int i = 0; i < n; i++, e++)
        if (e->x <= fx && e->y <= fy && fx <= e->w + e->x && fy <= e->h + e->y) return e;
    return nullptr;
}
