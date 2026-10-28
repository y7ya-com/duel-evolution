// What a generated stub does when called (stubhit.cpp): the first call of each stub appends one row to the stub-hit
// log (YO2_STUBHITS, default stubhits.tsv): seq, exe address, kind, owner, name, the source that calls it.
//   kind: todo = not written yet; glue = the address IS written, but the caller declares its own stand-in for it
//   (e.g. `void taskSetTaskName(void*, const char*)` for CTask::setTaskName), so a forwarder is missing; noaddr = the
//   declaration carries no exe address.
#pragma once
#include <cstdint>
#include <type_traits>

void yo2StubHit(uint32_t addr, const char* kind, const char* owner, const char* name, const char* caller);

// A stub's return value: zero / nullptr / a value-initialised object; a reference refers to a static zeroed object.
template <class R> R yo2StubRet() {
    if constexpr (std::is_void_v<R>) {
        return;
    } else if constexpr (std::is_reference_v<R>) {
        static auto* zero = new std::remove_reference_t<R>();
        return *zero;
    } else {
        return R();
    }
}
