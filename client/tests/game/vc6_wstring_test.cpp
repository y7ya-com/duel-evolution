// vc6::wstring (src/System/vc6.h): the exe's 16-byte std::wstring, refcount byte before the data.
#include "System/vc6.h"
#include "game_test.h"

int main() {
    vc6::wstring e;
    CHECK(e.empty() && e.size() == 0 && e.c_str()[0] == 0);
    vc6::wstring a(u"はい");
    CHECK(a.size() == 2 && a == u"はい" && a.c_str()[2] == 0);
    const uint8_t* raw = reinterpret_cast<const uint8_t*>(a.c_str());
    CHECK(raw[-1] == 0);   // the refcount byte VC6 code reads: one owner
    vc6::wstring b = a;
    CHECK(b == u"はい" && b.c_str() != a.c_str());   // value copy, not shared
    b = u"";
    CHECK(b.empty() && a == u"はい");
    b.assign(u"abc", 2);
    a.swap(b);
    CHECK(a == u"ab" && b == u"はい");
    std::u16string_view v = a;
    CHECK(v.size() == 2);
    std::printf("vc6_wstring_test ok\n");
}
