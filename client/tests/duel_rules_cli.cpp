// Test driver for src/duel/EngineRules2.cpp / EngineRules3.cpp, run by tests/duel_rules_test.py: random boards, every
// rule query against its decompiled original (ref_XXXXXX, rebuilt by the test).
//   duel_rules_cli <card data dir> <boards>   "ok <name> <calls> <non-zero>" per function, "bad ..." on a mismatch
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <random>
#include <vector>

#include <sys/mman.h>
#include <sys/wait.h>
#include <unistd.h>

#include "duel/EngineInternal.h"

__attribute__((weak)) DuelEngine g_eng;   // the engine files may define it
extern "C" {
unsigned char* g_mem = reinterpret_cast<unsigned char*>(&g_eng);
}

uint64_t stubHashv(const long* v, int n) {
    uint64_t h = 0x9e3779b97f4a7c15ull;
    for (int i = 0; i < n; i++) {
        h ^= (uint64_t)v[i] + 0x632be59bd9b4e019ull + (h << 6) + (h >> 2);
        h *= 0xff51afd7ed558ccdull;
        h ^= h >> 33;
    }
    return h;
}
long HB(const void* p, size_t n) {
    uint64_t h = 1469598103934665603ull;
    for (size_t i = 0; i < n; i++) h = (h ^ ((const uint8_t*)p)[i]) * 1099511628211ull;
    return (long)(h >> 1);
}

struct Case {
    const char* name;
    uint32_t addr;
    const char* kinds[8];
    int n;
    long (*mine)(const long* v, void* const* p);
    long (*ref)(const long* v, void* const* p);
};
#include "duel_rules_cases.inc"

static std::mt19937 rng(12345);
static int rnd(int n) { return (int)(rng() % (uint32_t)n); }
static std::vector<int> s_cards;    // real card ids
static std::vector<int> s_board;    // cards on the current board

static int s_focus[8];   // a few of the functions' own constants, frequent on this board
static int pickCard0();
// 0xf57 copies the race and 0x14fc the stats of the monster they are linked to; two of them linked to each other
// recurse forever in the exe too (engRaceEx, engStats), so the random boards leave them out
static int pickCard() {
    int c;
    do c = pickCard0();
    while (c == 0xf57 || c == 0x14fc);
    return c;
}
static int pickCard0() {
    if (rnd(5) < 2) return s_focus[rnd(8)];
    if (rnd(2)) return kConsts[rnd((int)(sizeof kConsts / sizeof *kConsts))];
    return s_cards[rnd((int)s_cards.size())];
}
static uint32_t word(int card, uint32_t owner) { return (uint32_t)card | owner << 14 | (uint32_t)rnd(256) << 23; }

static void randomBoard() {
    memset(&g_eng, 0, sizeof g_eng);
    s_board.clear();
    for (int& f : s_focus) f = kConsts[rnd((int)(sizeof kConsts / sizeof *kConsts))];
    int node = 1;
    auto chainOn = [&](uint16_t& head, int count, uint32_t j, int s) {
        uint16_t prev = 0;
        for (int i = 0; i < count && node < 255; i++, node++) {
            EngNode& n = g_eng.node[node];
            int r = rnd(4);
            n.key = r == 0 ? (uint16_t)(rnd(2) | rnd(11) << 8) : r == 1 ? (uint16_t)(j | s << 8) : (uint16_t)pickCard();
            n.kind = (uint8_t)(rnd(16) | rnd(4) << 4);
            if (n.kind == 0) n.kind = 5;
            n.b3 = (uint8_t)rnd(4);
            n.value = (uint16_t)(rnd(3) ? rnd(3) : rnd(0x200));
            n.stamp = (uint16_t)rnd(8);
            if (prev) g_eng.node[prev].next = (uint16_t)node;
            else head = (uint16_t)node;
            prev = (uint16_t)node;
        }
    };
    for (uint32_t j = 0; j < 2; j++) {
        EngPlayer& p = g_eng.pl[j];
        p.lp = 8000 - rnd(8000);
        p.handCount = rnd(7);
        p.deckCount = rnd(20);
        p.graveCount = rnd(10);
        p.extraCount = rnd(5);
        p.banishCount = rnd(5);
        for (uint32_t i = 0; i < p.handCount; i++) p.hand[i] = word(pickCard(), j);
        for (uint32_t i = 0; i < p.deckCount; i++) p.deck[i] = word(pickCard(), j);
        for (uint32_t i = 0; i < p.graveCount; i++) p.grave[i] = word(pickCard(), j);
        for (uint32_t i = 0; i < p.extraCount; i++) p.extra[i] = word(pickCard(), j);
        for (uint32_t i = 0; i < p.banishCount; i++) p.banish[i] = word(pickCard(), j);
        for (int s = 0; s < 12; s++) {
            EngSlot& sl = p.slot[s];
            if (s < 11 && rnd(10) < 7) {
                int c = pickCard();
                sl.card = word(c, rnd(5) ? j : 1 - j);
                s_board.push_back(c);
                sl.def = (uint16_t)rnd(2);
                sl.faceUp = (uint16_t)(rnd(4) ? 1 : 0);
                static const uint32_t bits[] = {1, 2, 4, 8, 0x40, 0x100, 0x800, 0x1000, 0x2000, 0x40000, 0x200000};
                for (uint32_t b : bits)
                    if (rnd(6) == 0) sl.flags |= b;
                sl.value = rnd(3) ? rnd(4) : (uint32_t)pickCard();
                sl.turn = (uint16_t)rnd(4);
            }
            chainOn(sl.head, rnd(4), j, s);
        }
    }
    // slot values that name a card on the board (declared cards, protected cards ...)
    for (uint32_t j = 0; j < 2; j++)
        for (int s = 0; s < 11; s++)
            if (g_eng.pl[j].slot[s].card && !s_board.empty() && rnd(3) == 0)
                g_eng.pl[j].slot[s].value = (uint32_t)s_board[rnd((int)s_board.size())];
    for (int u = 0; u < 512; u++) {
        g_eng.uid[u].card = (uint16_t)(rnd(3) ? 0 : pickCard());
        if (rnd(8) == 0) chainOn(g_eng.uid[u].head, 1 + rnd(2), rnd(2), rnd(11));
    }
    static const int fields[] = {0, 0x10f4, 0x150b, 0x1ba7};
    g_eng.fieldSpell = rnd(2) ? fields[rnd(4)] : pickCard();
    g_eng.turnPlayer = rnd(2);
    g_eng.viewer = rnd(2);
    g_eng.turn = rnd(10);
    g_eng.phase = rnd(8);
    g_eng.vcc338 = rnd(4) == 0;
    g_eng.vcca64 = rnd(6) == 0 ? 8 : rnd(10);
    g_eng.vc8744 = rnd(8) == 0 ? (rnd(2) ? 1 : 0xffffffff) : 0;
    g_eng.vc8750 = rnd(10) == 0;
    g_eng.vca4a0 = rnd(4) == 0 ? (uint32_t)rng() : 0;
    g_eng.flags = (uint32_t)rng() & (uint32_t)rng();
    g_eng.chainCount = rnd(4);
    for (int i = 1; i <= g_eng.chainCount; i++) {
        EngChain& c = g_eng.chain[i];
        c.w0 = (uint16_t)pickCard();
        c.bits = (uint16_t)(rnd(2) | rnd(11) << 1);
        c.w6 = (uint16_t)rnd(4);
        for (int k = 0; k < 20; k++) c.rest[k] = (uint8_t)rnd(30);
    }
    // the scalars the battle / summon helpers read: small random values
    for (uint32_t a = 0x012cc2c8; a < 0x012cc4a8; a += 4)
        if (a != 0x012cc2cc && rnd(3) == 0) *engAt(a) = rnd(4);
    g_netDuel->logFlags = rnd(3) == 0 ? ND_REPLAY : 0;
    static const uint16_t scenes[] = {0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd7, 0x10};
    g_netDuel->logScene = scenes[rnd(7)];
}

// integer argument pools by parameter name ("i:<name>")
static long pick(const char* kind) {
    std::string k = kind + 2;
    if (k == "j" || k == "p" || k == "tj" || k == "lj" || k == "owner" || k == "a" || k == "sj" || k == "aj")
        return rnd(10) ? rnd(2) : rnd(4);
    if (k == "s" || k == "t" || k == "ss" || k == "as" || k == "ts" || k == "slot" || k == "b") return rnd(11);
    if (k == "tslot") return rnd(16);
    if (k == "card" || k == "id" || k == "c") {
        return rnd(3) ? (s_board.empty() ? pickCard() : s_board[rnd((int)s_board.size())]) : pickCard();
    }
    if (k == "uid") return rnd(4) ? rnd(0x200) : -1;
    if (k == "key") return rnd(3) ? (rnd(2) | rnd(11) << 8) : pickCard();
    if (k == "race") return rnd(0x18);
    if (k == "attr") return rnd(9);
    if (k == "icon") return rnd(7);
    if (k == "zone" || k == "lzone" || k == "from" || k == "to") return rnd(17);
    if (k == "i" || k == "index" || k == "n" || k == "count") return rnd(12);
    if (k == "head") return rnd(3) ? g_eng.pl[rnd(2)].slot[rnd(11)].head : rnd(256);
    if (k == "def" || k == "faceUp" || k == "once" || k == "full" || k == "useCard" || k == "active") return rnd(2);
    if (k == "kind" || k == "type") return rnd(16);
    if (k == "value") return rnd(3) ? rnd(4) : rnd(0x200);
    if (k == "skip") return rnd(12) - 1;
    if (k == "minStamp" || k == "skipStamp" || k == "stamp") return rnd(10);
    if (k == "lv" || k == "level") return rnd(13);
    if (k == "atk") return rnd(4000);
    if (k == "mask" || k == "flags") return (long)(rng() & rng());
    if (k == "k") return rnd(23);   // counter kinds: the exe's table (0x00beb748) has 23
    return rnd(6) == 0 ? -1 : rnd(4);
}

extern "C" {
static int predMonster(int c) { return cardIsMonster(c); }
static int predSpell(int c) { return cardIsSpell(c); }
static int predTrap(int c) { return cardIsTrap(c); }
static int predOdd(int c) { return c & 1; }
}
static int (*const kPreds[])(int) = {predMonster, predSpell, predTrap, predOdd};

// a word of the board: a slot's card, or an entry of a pile (inside or just past its count)
static uint32_t* boardWord() {
    EngPlayer& p = g_eng.pl[rnd(2)];
    switch (rnd(6)) {
    case 0: return &p.slot[rnd(11)].card;
    case 1: return &p.hand[rnd((int)p.handCount + 1)];
    case 2: return &p.deck[rnd((int)p.deckCount + 1)];
    case 3: return &p.grave[rnd((int)p.graveCount + 1)];
    case 4: return &p.banish[rnd((int)p.banishCount + 1)];
    default: return &p.extra[rnd((int)p.extraCount + 1)];
    }
}

// one function on every board (the board of index b is the same for every function)
static int runCase(const Case& k, int boards, bool trace, volatile int* where) {
    static DuelEngine before, mineAfter;
    long calls = 0, hits = 0, bad = 0;
    for (int b = 0; b < boards; b++) {
        rng.seed(1000003u * (uint32_t)b + 17);
        randomBoard();
        before = g_eng;
        where[0] = b;
        if (trace) fprintf(stderr, "board %d %s\n", b, k.name);
            for (int rep = 0; rep < 60; rep++) {
                long v[8] = {};
                void* pm[8] = {};
                void* pr[8] = {};
                // separate buffers for each side (link records, output and input structures)
                static uint32_t bm[8][16], br[8][16];
                for (int i = 0; i < k.n; i++) {
                    const char* kd = k.kinds[i];
                    if (kd[0] == 'i' && kd[1] == ':') {
                        v[i] = pick(kd);
                    } else if (!strcmp(kd, "pred")) {
                        pm[i] = pr[i] = (void*)kPreds[rnd(4)];
                    } else if (!strcmp(kd, "wordptr")) {
                        pm[i] = pr[i] = boardWord();
                    } else if (!strcmp(kd, "slotptr")) {
                        pm[i] = pr[i] = &g_eng.pl[rnd(2)].slot[rnd(12)];
                    } else if (!strcmp(kd, "nodeptr")) {
                        pm[i] = pr[i] = &g_eng.node[rnd(256)];
                    } else if (!strcmp(kd, "link")) {
                        uint16_t* lm = (uint16_t*)bm[i];
                        for (int q = 0; q < 14; q++) lm[q] = (uint16_t)rng();
                        lm[0] = (uint16_t)(rnd(5) ? pickCard() : 0);
                        lm[1] = (uint16_t)(rnd(2) | rnd(16) << 1 | (rnd(4) == 0) << 14 | (rng() & 0x8fc0));
                        if (rnd(2)) lm[2] = (uint16_t)(cardUid(g_eng.pl[lm[1] & 1].slot[(lm[1] >> 1 & 0x1f) % 11].card) << 6);
                        memcpy(br[i], bm[i], sizeof bm[i]);
                        pm[i] = bm[i];
                        pr[i] = br[i];
                    } else {   // stats, stats_in, outbuf
                        for (int q = 0; q < 16; q++) bm[i][q] = !strcmp(kd, "stats_in") ? (uint32_t)rnd(3000) : 0;
                        if (!strcmp(kd, "stats_in")) bm[i][0] = (uint32_t)pickCard();
                        memcpy(br[i], bm[i], sizeof bm[i]);
                        pm[i] = bm[i];
                        pr[i] = br[i];
                    }
                }
                // (j, zone, index) arguments: a field slot zone + index <= 10, or an entry of the pile (or one past it)
                int zi = -1, ii = -1, ji = -1;
                for (int i = 0; i < k.n; i++) {
                    if (!strcmp(k.kinds[i], "i:zone")) zi = i;
                    if (!strcmp(k.kinds[i], "i:index")) ii = i;
                    if (!strcmp(k.kinds[i], "i:j")) ji = i;
                }
                if (zi >= 0 && ii >= 0) {
                    uint32_t pj = ji >= 0 ? (uint32_t)v[ji] & 1 : 0;
                    const EngPlayer& pl = g_eng.pl[pj];
                    long z = v[zi] = rnd(16);
                    uint32_t cnt = z == Z_HAND ? pl.handCount : z == Z_EXTRA ? pl.extraCount : z == Z_DECK ? pl.deckCount
                                 : z == Z_GRAVE ? pl.graveCount : pl.banishCount;
                    v[ii] = z <= 10 ? (rnd(4) ? 0 : rnd((int)(11 - z))) : rnd((int)cnt + 1);
                }
                const char* only = getenv("YO2_ONLY");
                bool tr = only && !strcmp(only, k.name) && rep < 3;
                if (only && strcmp(only, k.name)) continue;
                g_eng = before;
                g_trace = tr;
                if (tr) fprintf(stderr, "-- mine b%d rep%d\n", b, rep);
                long a = k.mine(v, pm);
                if (tr) fprintf(stderr, "-- ref -> mine %ld\n", a);
                mineAfter = g_eng;
                g_eng = before;
                long r = k.ref(v, pr);
                if (tr) fprintf(stderr, "-- ref %ld\n", r);
                g_trace = false;
                calls++;
                if (a) hits++;
                bool memSame = memcmp(&mineAfter, &g_eng, sizeof g_eng) == 0;
                for (int i = 0; i < k.n; i++)
                    if (pm[i] == bm[i] && memcmp(bm[i], br[i], sizeof bm[i])) memSame = false;
                if ((a != r || !memSame) && bad++ < 4) {
                    printf("bad %s 0x%06x board %d args", k.name, k.addr, b);
                    for (int i = 0; i < k.n; i++) printf(" %ld", v[i]);
                    printf(" mine=%ld ref=%ld", a, r);
                    if (memcmp(&mineAfter, &g_eng, sizeof g_eng)) {
                        const uint8_t* x = (const uint8_t*)&mineAfter;
                        const uint8_t* y = (const uint8_t*)&g_eng;
                        size_t o = 0;
                        while (x[o] == y[o]) o++;
                        printf(" (engine state differs first at 0x%08zx: mine %02x ref %02x)", ENG_BASE + o, x[o], y[o]);
                    } else if (!memSame) {
                        printf(" (an output buffer differs)");
                    }
                    printf("\n");
                }
            }
        g_eng = before;
    }
    if (!bad) printf("ok %s %ld %ld\n", k.name, calls, hits);
    return bad ? 1 : 0;
}

int main(int argc, char** argv) {
    setvbuf(stdout, nullptr, _IOLBF, 0);
    bool trace = getenv("YO2_TRACE") != nullptr;
    if (argc < 3 || !cardDbLoad(argv[1])) {
        fprintf(stderr, "no card data\n");
        return 2;
    }
    for (int id = 3000; id < 0x2000; id++)
        if (cardPropIndex(id)) s_cards.push_back(id);
    static CNetDuel nd;
    g_netDuel = &nd;
    int boards = atoi(argv[2]);
    const int ncases = (int)(sizeof kCases / sizeof *kCases);
    const char* only = getenv("YO2_ONLY");
    // each function runs in a child: a crash (a stray pointer in either version) is reported with its board
    volatile int* where = (volatile int*)mmap(nullptr, 4096, PROT_READ | PROT_WRITE, MAP_SHARED | MAP_ANON, -1, 0);
    int failed = 0;
    for (int c = 0; c < ncases; c++) {
        const Case& k = kCases[c];
        if (only && strcmp(only, k.name)) continue;
        where[0] = -1;
        fflush(stdout);
        pid_t pid = fork();
        if (pid == 0) _exit(runCase(k, boards, trace, where));
        int st = 0;
        waitpid(pid, &st, 0);
        if (WIFEXITED(st) && WEXITSTATUS(st) <= 1) {
            failed += WEXITSTATUS(st);
            continue;
        }
        printf("bad %s 0x%06x board %d crashed (%s %d)\n", k.name, k.addr, where[0],
               WIFSIGNALED(st) ? "signal" : "exit", WIFSIGNALED(st) ? WTERMSIG(st) : WEXITSTATUS(st));
        failed++;
    }
    return failed ? 1 : 0;
}
