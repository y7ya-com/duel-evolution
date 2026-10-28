// Included into every engine file of tests/duel_rules_test.py's build: the stubs that stand in for engine functions
// not translated yet (the test's -D routes eng_XXXXXX calls here). Deterministic in their arguments.
#pragma once
#include <cstddef>
#include <cstdint>

uint64_t stubHashv(const long* v, int n);
template <class... A> uint64_t stubHash(A... a) {
    const long v[] = {(long)a...};
    return stubHashv(v, (int)sizeof...(a));
}
long HB(const void* p, size_t n);   // a hash of n bytes (so equal records hash equally)

int stub_7033d0(long j, long s);
int stub_702c90(long j, long s);
int stub_703fa0(long j, long s);
int stub_7040c0(long j, long s, long a);
int stub_702bd0(long j, long s);
int stub_6f9870(long c);
int stub_703f70(long j, long s);
int stub_71f380(const void* l, long k);
int stub_71e6a0(const void* l);
void stub_6fae10(long j, long s, void* o);
