// yo2ShopVec.h: ShopLineVec, the confirmation window's vector<wstring> (its POD vectors are difftested:
// harness/difftest/cases/shop.py).
#include <cstdio>
#include <cstdlib>

#include "shop/yo2ShopVec.h"

#define CHECK(c)                                                                    \
    do {                                                                            \
        if (!(c)) {                                                                 \
            std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #c); \
            std::exit(1);                                                           \
        }                                                                           \
    } while (0)

int main() {
    ShopLineVec v;
    CHECK(v.size() == 0);
    v.clear();   // clear on an empty vector (no storage yet) is fine
    v.push_back(u"Blue-Eyes  x1  300MP");
    v.push_back(u"");
    v.push_back(u"Pack A  x3  900MP");
    CHECK(v.size() == 3 && v[0] == u"Blue-Eyes  x1  300MP" && v[1].empty() && v[2] == u"Pack A  x3  900MP");
    v.clear();
    CHECK(v.size() == 0);
    v.push_back(u"again");
    CHECK(v.size() == 1 && v[0] == u"again");
    std::puts("shopvec: ok");
}
