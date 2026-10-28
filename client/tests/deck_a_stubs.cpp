// Stub bodies for src/Deck/deck_a_externs.h and DeckCommon.h (the System / yaneSDK calls part A makes), for
// tests/deck_a_cli.cpp. Weak, so a part's own test file may override one. They record just enough state for the
// pure-logic checks: element positions/visibility in a small table, created tasks in a list.
#include <cstdio>
#include <cstdlib>
#include <map>
#include <string>
#include <utility>

#include "Deck/deck_a_externs.h"

#define DK_STUB __attribute__((weak))

namespace dk {

int g_assertCount = 0;   // tests read it: every assertBox call
struct ElemState {
    float x = 0, y = 0, a = 1;
    bool vis = true;
    int32_t prio = 0;
};
std::map<const void*, ElemState>& elems() {
    static std::map<const void*, ElemState> m;
    return m;
}

DK_STUB bool assertBox(bool*, const char* msg, const char* file, int line) {
    g_assertCount++;
    if (getenv("DECK_A_VERBOSE")) fprintf(stderr, "assert %s(%d) %s\n", file, line, msg);
    return true;   // "ignore": carry on, like pressing OK
}
DK_STUB void fatalExit(int code) { exit(code); }
DK_STUB void vectorXran() {
    fprintf(stderr, "invalid vector<T> subscript\n");
    abort();
}
DK_STUB bool taskAlive(const void* t) { return t != nullptr; }
DK_STUB void taskAddUser(void*, void*) {}
DK_STUB void taskRemoveUser(void*, void*) {}

DK_STUB void* taskCreate(void* t, void*, int32_t) { return t; }
DK_STUB void taskDestroy(void*) {}
std::map<const void*, std::string>& taskNames() {   // what taskSetInstName recorded (tests read it back)
    static std::map<const void*, std::string> m;
    return m;
}
DK_STUB void taskSetInstName(void* t, const char* n) { taskNames()[t] = n ? n : ""; }
DK_STUB void taskSetTaskName(void*, const char*) {}
DK_STUB const char* taskInstName(const void* t) {
    auto it = taskNames().find(t);
    return it == taskNames().end() ? "" : it->second.c_str();
}

DK_STUB void elemSetPos(void* e, float x, float y) { elems()[e].x = x, elems()[e].y = y; }
DK_STUB void elemGetPos(const void* e, float* x, float* y) {
    auto& s = elems()[e];
    if (x) *x = s.x;
    if (y) *y = s.y;
}
DK_STUB void elemSetVisible(void* e, bool on) { elems()[e].vis = on; }
DK_STUB bool elemVisible(const void* e) { return elems()[e].vis; }
DK_STUB void elemSetAlpha(void* e, float a) { elems()[e].a = a; }
DK_STUB void elemSetPrio(void* e, int32_t p) { elems()[e].prio = p; }

DK_STUB uint32_t frameTick() { return 0; }
DK_STUB int32_t language() { return 1; }

}   // namespace dk
