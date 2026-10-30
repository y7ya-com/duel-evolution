// ovr/fuzzy.h, the trunk search's fuzzy match: normalising, words, the effect text, the ranking.
//   make fuzzy_test && build/fuzzy_test
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include "../ovr/fuzzy.h"

static size_t u16(const char *s, uint16_t *out) {   // ASCII -> UTF-16
    size_t n = 0;
    while (s[n]) out[n] = (uint8_t)s[n], n++;
    out[n] = 0;
    return n;
}
static FzQuery query(const char *s) {
    uint16_t w[128];
    FzQuery q;
    fz_query(&q, w, u16(s, w));
    return q;
}
static const char *norm(const char *s) {
    static char out[256];
    uint16_t w[256];
    fz_norm(w, u16(s, w), out, sizeof out);
    return out;
}

int main(void) {
    // 1. normalising: case, punctuation and spaces don't count
    assert(!strcmp(norm("Blue-Eyes White Dragon"), "blueeyeswhitedragon"));
    char bewd[64];
    strcpy(bewd, norm("Blue-Eyes White Dragon"));
    for (const char *s = "blueeyes\0blue-eyes\0Blue Eyes\0"; *s; s += strlen(s) + 1) {
        FzQuery q = query(s);
        assert(fz_name_rank(&q, bewd) == 0);
    }
    FzQuery dm = query("dark magician");
    assert(fz_name_rank(&dm, norm("Dark Magician")) == 0);
    assert(fz_name_rank(&dm, norm("Dark Magician Girl")) == 0);
    // 2. words: all of them in the name, in any order
    FzQuery md = query("magician dark");
    assert(fz_name_rank(&md, norm("Dark Magician")) == 1);
    assert(fz_name_rank(&md, norm("Magician of Black Chaos")) == -1);
    FzQuery eyes = query("eyes");
    assert(fz_name_rank(&eyes, bewd) == 1);
    // 3. the effect text when the name doesn't match: every word
    FzQuery gy = query("graveyard special summon");
    assert(fz_name_rank(&gy, norm("Mystic Tomato")) == -1);
    assert(fz_text_hit(&gy, norm("When this card is destroyed by battle and sent to the Graveyard, you can Special Summon 1 DARK monster")));
    assert(!fz_text_hit(&gy, norm("Destroy 1 Spell or Trap Card on the field.")));
    FzQuery none = query("  - ");
    assert(fz_name_rank(&none, bewd) == -1 && !fz_text_hit(&none, bewd));   // no words: nothing
    // 4. ranking: starts-with, then name, then text; alphabetical within
    FzHit h[] = {{2, "mystic tomato", 0}, {1, "black luster soldier", 1}, {0, "dark magician girl", 2},
                 {0, "dark magician", 3}, {1, "amazoness swordsman", 4}};
    qsort(h, 5, sizeof h[0], fz_cmp);
    const char *order[] = {"dark magician", "dark magician girl", "amazoness swordsman", "black luster soldier", "mystic tomato"};
    for (int i = 0; i < 5; i++) assert(!strcmp(h[i].key, order[i]));
    uint16_t w[64];
    char key[64];
    fz_key(w, u16("Blue-Eyes White Dragon", w), key, sizeof key);
    assert(!strcmp(key, "blue-eyes white dragon"));
    puts("fuzzy_test: ok");
    return 0;
}
