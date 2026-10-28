// End-to-end driver for the duel engine, run by tests/duel_e2e_test.py: the whole src/duel engine plus CNetDuel, with
// the scene (DUEL_VIEW) replaced by a recorder that never keeps the engine waiting. One command per stdin line; every
// reply ends with a line "." so the test can read it as a block.
//   init <first> <seed> <lp> <main0,..> <extra0,..> <main1,..> <extra1,..>   card_prop indexes ("-" = empty)
//   rx <wire hex>     feed framed server messages to CNetDuel (handled as they complete)
//   run               engine frames until the 0x6202 queue is drained and no command is running
//   dump              the board: per player LP and every pile / zone as uids
//   views             the DUEL_VIEW calls recorded since the last "views"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

#include "duel/EngineInternal.h"

static std::vector<uint8_t> g_in, g_out;
static size_t g_pos;
static int rd(void*, uint8_t* b, int n) {
    if (g_pos >= g_in.size()) return -1;
    int k = (int)std::min<size_t>(n, g_in.size() - g_pos);
    memcpy(b, g_in.data() + g_pos, k);
    g_pos += k;
    return k;
}
static int wr(void*, const uint8_t* b, int n) { g_out.insert(g_out.end(), b, b + n); return n; }
YgTransport ygSocketTransport(int32_t) { return {nullptr, rd, wr}; }
void ygSocketClose(int32_t) {}
int32_t ygConnectAsync(const char*, uint16_t, YgConn* c, uint32_t) { c->sock = 7; c->state = YGC_CONNECTED; return 0; }
int32_t ygSocketSelect(int32_t, uint32_t) { return 0; }

// ---- the scene, headless
static std::vector<std::string> g_views;
void duelView(int view, uintptr_t a, uintptr_t b, uintptr_t c) {
    char t[96];
    snprintf(t, sizeof t, "view %x %lx %lx %lx", view, (unsigned long)a, view == 0x32 && a == 1 ? 0ul : (unsigned long)b,
             (unsigned long)c);
    g_views.push_back(t);
}
int duelViewBusy(int) { return 0; }
bool soundEnabled() { return false; }
void duelPlayBgm(int, int, int) {}
int eng_754340(...) { return 0; }   // scene: battle select (DAT_012a6790 + 0x14 = 3)
namespace ds {   // scene: the match tally (SceneDuelScene.cpp)
void ndMatchRecordGame(int32_t) {}
void ndMatchSetEndMode(int32_t) {}
}
int eng_722690(...) { fprintf(stderr, "tag-scene dispatch 0x722690 not written\n"); abort(); }
int eng_72ca70(...) { fprintf(stderr, "tag-scene dispatch 0x72ca70 not written\n"); abort(); }

static CNetDuel* nd;

static std::vector<uint8_t> unhex(const std::string& s) {
    std::vector<uint8_t> v;
    for (size_t i = 0; i + 1 < s.size(); i += 2) v.push_back((uint8_t)strtoul(s.substr(i, 2).c_str(), nullptr, 16));
    return v;
}
static std::vector<uint16_t> ids(const std::string& s) {
    std::vector<uint16_t> v;
    if (s == "-") return v;
    for (size_t i = 0; i < s.size();) {
        size_t j = s.find(',', i);
        if (j == std::string::npos) j = s.size();
        v.push_back((uint16_t)strtoul(s.substr(i, j - i).c_str(), nullptr, 0));
        i = j + 1;
    }
    return v;
}

// a deck record as FUN_00704d10 reads it: u32 main count, u32, u32 extra count, u16 main[95] @0xc, u16 extra @0xca
static void deckRecord(uint32_t at, const std::vector<uint16_t>& main, const std::vector<uint16_t>& extra) {
    uint8_t* r = engAt<uint8_t>(at);
    memset(r, 0, 0x108);
    uint32_t n = (uint32_t)main.size(), e = (uint32_t)extra.size();
    memcpy(r, &n, 4);
    memcpy(r + 8, &e, 4);
    for (size_t i = 0; i < main.size() && i < 95; i++) memcpy(r + 0xc + i * 2, &main[i], 2);
    for (size_t i = 0; i < extra.size() && i < 31; i++) memcpy(r + 0xca + i * 2, &extra[i], 2);
}

static void pile(const char* name, const uint32_t* w, uint32_t n) {
    printf(" %s=", name);
    if (!n) printf("-");
    for (uint32_t i = 0; i < n; i++) printf(i ? ",%u" : "%u", cardUid(w[i]));
}

static void dump() {
    for (uint32_t j = 0; j < 2; j++) {
        const EngPlayer& p = g_eng.pl[j];
        printf("p%u lp=%d", j, p.lp);
        pile("hand", p.hand, p.handCount);
        pile("deck", p.deck, p.deckCount);
        pile("grave", p.grave, p.graveCount);
        pile("banish", p.banish, p.banishCount);
        pile("extra", p.extra, p.extraCount);
        for (int k = 0; k < 2; k++) {
            printf(k ? " sz=" : " mz=");
            for (int s = k ? 5 : 0; s < (k ? 11 : 5); s++) {
                const EngSlot& sl = p.slot[s];
                if (s != (k ? 5 : 0)) printf(",");
                if (!cardId(sl.card)) printf("-");
                else printf("%u:%c%c", cardUid(sl.card), sl.faceUp ? 'u' : 'd', sl.def ? 'D' : 'A');
            }
        }
        printf("\n");
    }
    printf("turn=%u tp=%u phase=%u result=%u running=%u queued=%d step=%d last=%d\n", g_eng.turn, g_eng.turnPlayer, g_eng.phase, g_eng.result,
           g_eng.running, g_eng.queued, g_eng.step, nd->last);
}

int main(int argc, char** argv) {
    if (argc < 2 || !cardDbLoad(argv[1]) || !textLoad(argv[1], 'E')) {
        fprintf(stderr, "usage: duel_e2e_cli <data/bin# dir>\n");
        return 2;
    }
    nd = (CNetDuel*)calloc(1, sizeof(CNetDuel));
    nd->construct();
    nd->ensureConn();
    if (!nd->conn->pkt) ygConnAllocPacket(nd->conn);
    nd->conn->sock = 7;
    nd->conn->state = YGC_CONNECTED;
    g_netDuel = nd;
    std::string cmd, a;
    while (std::cin >> cmd) {
        if (cmd == "init") {
            uint32_t first, seed;
            int lp;
            std::string m0, e0, m1, e1;
            std::cin >> first >> seed >> lp >> m0 >> e0 >> m1 >> e1;
            nd->side[0].lp = nd->side[1].lp = lp;
            g_eng.vcc850 = first;   // (past the block engReset clears)
            g_eng.vcc840 = seed;
            deckRecord(0x012cc854, ids(m0), ids(e0));
            deckRecord(0x012cc95c, ids(m1), ids(e1));
            engDuelInit();
            printf("init ok\n");
        } else if (cmd == "rx") {
            std::cin >> a;
            std::vector<uint8_t> w = unhex(a);
            g_in.insert(g_in.end(), w.begin(), w.end());
            for (;;) {
                int32_t r = nd->recv();
                if (r == YG_PENDING) break;
                if (r != YG_OK) {
                    printf("rx error %d\n", r);
                    break;
                }
                nd->onRecv();
            }
        } else if (cmd == "run") {
            int frames = 0;
            while (frames < 200000 && (nd->last >= 0 || g_eng.running || g_eng.queued)) {
                if (engFrame()) break;
                frames++;
            }
            printf("frames %d%s\n", frames, frames >= 200000 ? " STUCK" : "");
        } else if (cmd == "dump") {
            dump();
        } else if (cmd == "views") {
            for (const std::string& v : g_views) printf("%s\n", v.c_str());
            g_views.clear();
        }
        printf(".\n");
        fflush(stdout);
    }
}
