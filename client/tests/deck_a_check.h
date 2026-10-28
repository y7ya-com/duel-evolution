// What the part-A test files share: the CHECK macro (counts checks, aborts on the failing expression) and the part
// registry tests/deck_a_cli.cpp dispatches on. A part's test file registers itself with
//   static DeckAPart reg("kaban", selftest, cmd);   // cmd may be null
// so the CLI links with any subset of src/Deck part A (a helper can build and test its own part alone).
#pragma once
#include <cstdio>
#include <cstdlib>

#define CHECK(n, cond)                                                                \
    do {                                                                              \
        (n)++;                                                                        \
        if (!(cond)) {                                                                \
            fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #cond); \
            abort();                                                                  \
        }                                                                             \
    } while (0)

struct DeckAPart {
    const char* name;
    int (*selftest)();                 // returns the number of checks run
    int (*cmd)(int argc, char** argv); // "deck_a_cli <name> args..."; returns the exit code
    DeckAPart* next;
    DeckAPart(const char* n, int (*s)(), int (*c)(int, char**)) : name(n), selftest(s), cmd(c), next(head()) {
        head() = this;
    }
    static DeckAPart*& head() {
        static DeckAPart* h = nullptr;
        return h;
    }
};
