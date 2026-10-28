// Test driver for src/Deck part A, run by tests/deck_a_test.py.
//   deck_a_cli selftest      each linked part's pure-helper checks (layout math, paging, filters): "ok <part> <n>"
//   deck_a_cli <part> ...    a part's own data commands (its DeckAPart cmd, in tests/deck_a_<part>.cpp)
#include <cstring>

#include "deck_a_check.h"

int main(int argc, char** argv) {
    if (argc < 2) {
        fprintf(stderr, "usage: deck_a_cli selftest | <part> args...\n");
        return 2;
    }
    if (!strcmp(argv[1], "selftest")) {
        for (DeckAPart* p = DeckAPart::head(); p; p = p->next) printf("ok %s %d\n", p->name, p->selftest());
        return 0;
    }
    for (DeckAPart* p = DeckAPart::head(); p; p = p->next)
        if (!strcmp(argv[1], p->name) && p->cmd) return p->cmd(argc - 2, argv + 2);
    fprintf(stderr, "unknown command %s\n", argv[1]);
    return 2;
}
