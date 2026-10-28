#include "comobj.h"

#include <array>
#include <utility>

namespace {
// rc_host_fn keys on the function pointer, so each trapping slot needs its own function that knows its name
const char* trap_names[512];
int trap_n;
template <int K> void named_trap(CPU* c) { rc_trap(c, RD32m(c->esp), trap_names[K]); }
template <int... K> constexpr std::array<RcFn, sizeof...(K)> mk(std::integer_sequence<int, K...>) {
    return {named_trap<K>...};
}
RcFn named(const char* name) {
    static const auto fns = mk(std::make_integer_sequence<int, 512>{});
    trap_names[trap_n] = name;
    return fns[trap_n++];
}
}  // namespace

uint32_t rc_vtable(std::initializer_list<RcSlot> slots) {
    uint32_t vt = rc_palloc(4 * (uint32_t)slots.size()), i = 0;
    for (const RcSlot& s : slots) WR32m(vt + 4 * i++, rc_host_fn(s.fn ? s.fn : named(s.name)));
    return vt;
}
