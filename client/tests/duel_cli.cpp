// Test driver for src/duel, run by tests/duel_test.py.
//   duel_cli build            every CNetDuel builder once: "<label> <wire hex>" per line
//   duel_cli script < steps   "rx <wire hex>" (feed + handle every complete message), "dump", "set <k>=<v>"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <iostream>
#include <string>
#include <vector>

#include "duel/NetDuel.h"

static DuelCardList s_deckList;   // g_eng.deckList in the full build
DuelCardList& g_deckList = s_deckList;
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

static CNetDuel* nd;

static std::string hex(const void* p, size_t n) {
    std::string s;
    char t[3];
    for (size_t i = 0; i < n; i++) { snprintf(t, 3, "%02x", ((const uint8_t*)p)[i]); s += t; }
    return s;
}
static std::vector<uint8_t> unhex(const std::string& s) {
    std::vector<uint8_t> v;
    for (size_t i = 0; i + 1 < s.size(); i += 2) v.push_back((uint8_t)strtoul(s.substr(i, 2).c_str(), nullptr, 16));
    return v;
}

static void open() {
    nd->ensureConn();
    if (!nd->conn->pkt) ygConnAllocPacket(nd->conn);
    nd->conn->sock = 7;
    nd->conn->state = YGC_CONNECTED;
}

static void build() {
    static DuelDeckMsg deck;
    deck.mainCount = 3;
    deck.extraCount = 2;
    deck.main[0] = 1, deck.main[1] = 0x0102, deck.main[2] = 0xfffe;
    deck.extra[0] = 10, deck.extra[1] = 11;
    static uint8_t key[0x20];
    for (int i = 0; i < 0x20; i++) key[i] = (uint8_t)i;
    struct B { const char* label; std::function<void()> f; };
    std::vector<B> bs = {
        {"key", [] { nd->sendKey(key); }},
        {"booked", [] { nd->sendBookedCheck(1001); }},
        {"prepare", [] { nd->sendPrepare(); }},
        {"gotojanken", [] { nd->sendGotoJanken(); }},
        {"hand", [] { nd->sendJankenHand(2); }},
        {"gotoselectfirst", [] { nd->sendGotoSelectFirst(); }},
        {"selectfirst", [] { nd->sendSelectFirst(1); }},
        {"gotoduelstart", [] { nd->sendGotoDuelStart(); }},
        {"phase", [] { nd->sendPhase(4); }},
        {"move", [] { nd->sendMove(0, 0xb, 2, 4); }},
        {"move_none", [] { nd->sendMove(0, 3, 0, 0xffffffff); }},
        {"pass", [] { nd->sendPass(); }},
        {"debugcard", [] { nd->sendDebugCard(1, 2, 3, 4, 5); }},
        {"debug", [] { nd->sendDebug(6, 7, 8, 9); }},
        {"ready", [] { nd->sendDuelReady(1); }},
        {"number", [] { nd->sendNumber(0xfffffffe); }},
        {"cardvalue", [] { nd->sendCardValue(4007, 3); }},
        {"choice", [] { nd->sendChoice(5); }},
        {"watch", [] { nd->sendWatch(); nd->state &= ~ND_SPECTATOR; }},
        {"watchping", [] { nd->watch = 0; nd->watchKeepAlive(); }},
        {"watchping_again", [] { nd->watchKeepAlive(); }},
        {"watch6703", [] { nd->sendWatch6703(); }},
        {"6495", [] { nd->send6495(9); }},
        {"deck", [] { nd->sendDeck(&deck); }},
        {"deck_spectator", [] { nd->state |= ND_SPECTATOR; nd->sendDeck(&deck); nd->state &= ~ND_SPECTATOR; }},
        {"janken_replay", [] { nd->logFlags |= ND_REPLAY; nd->sendGotoJanken(); nd->logFlags = 0; }},
        {"empty", [] { nd->sendEmpty(0x6351); }},
        {"searchack", [] { nd->sendSearchAck(1); }},
    };
    for (const B& b : bs) {
        nd->conn->sendSeq = 0;
        g_out.clear();
        b.f();
        printf("%s %s\n", b.label, hex(g_out.data(), g_out.size()).c_str());
    }
}

static void dump() {
    printf("nd flags=%u input=%u svr=%u state=%u watch=%u first=%u jankenX=%u b67c=%u scoreX=%u last=%d clockWho=%u "
           "req=%u,%u,%u,%u,%u,%u,%u jseen=%u,%u,%u search=%d/%u\n",
           nd->flags, nd->input, nd->svrCode, nd->state, nd->watch, nd->first, nd->jankenX, nd->b67c, nd->scoreX,
           nd->last, nd->clockWho, nd->flag(0x1c), nd->flag(0x1d), nd->flag(0x1e), nd->flag(0x1f), nd->flag(0x20),
           nd->flag(0x21), nd->flag(0x22), nd->jseen[0], nd->jseen[1], nd->jseen[2], nd->searchCount, nd->searchTotal);
    for (const DuelSide& s : nd->side)
        printf("side id=%d name=%s b15=%u deck=%d,%d janken=%u lp=%d s=%s|%s|%s score=%u,%u,%u,%u country=%s clock=%d,%u,%d "
               "v=%u,%u\n", s.id, s.name, s.b15, s.deckMain, s.deckExtra, s.janken, s.lp, s.parts[0], s.parts[1], s.parts[2],
               s.score[0], s.score[1], s.score[2], s.score[3], s.country, s.clock.secs, s.clock.paused, s.clock.secs2,
               s.v8c, s.v90);
    printf("global %d %u %d\n", nd->global.secs, nd->global.paused, nd->global.secs2);
    for (int i = 0; i <= nd->last; i++) {
        const DuelCommand& c = nd->queue[i];
        printf("cmd %u %u", c.type, c.b);
        for (uint32_t v : c.p) printf(" %u", v);
        printf("\n");
    }
    for (int p = 0; p < 2; p++) {
        const ComidBlock& c = nd->comid[p];
        printf("comid%d field", p);
        for (int z = 0; z < 16; z++) printf(" %u/%u", c.field[z], c.reason[z]);
        printf(" tail %s hand", hex(c.tail, 10).c_str());
        for (int i = 0; i < 80; i++) if (c.hand[i]) printf(" %d:%u", i, c.hand[i]);
        printf(" list %s\n", hex(c.list, 80).c_str());
    }
    for (const DuelCardList* l : {&g_fusionList, &g_deckList}) {
        printf("list b=%u mode=%u x=%u n=%u y=%u", l->b, l->mode, l->x, l->count, l->y);
        for (uint32_t i = 0; i < l->count && i < 8; i++) printf(" %08x", l->card[i]);
        printf("\n");
    }
    for (int i = 0; i < nd->searchCount; i++) printf("search %u %u\n", nd->search[i][0], nd->search[i][1]);
}

int main(int argc, char** argv) {
    nd = (CNetDuel*)calloc(1, sizeof(CNetDuel));
    nd->construct();
    open();
    g_netDuel = nd;
    if (argc > 1 && !strcmp(argv[1], "build")) {
        build();
        return 0;
    }
    if (argc > 1 && !strcmp(argv[1], "hexpairs")) {
        uint16_t out[64] = {};
        ndHexPairs(argv[2], out);
        for (size_t i = 0; i < (strlen(argv[2]) + 7) / 8 * 2; i++) printf("%04x ", out[i]);
        printf("\n");
        return 0;
    }
    std::string cmd, a;
    while (std::cin >> cmd) {
        if (cmd == "rx") {
            std::cin >> a;
            std::vector<uint8_t> w = unhex(a);
            g_in.insert(g_in.end(), w.begin(), w.end());
            g_out.clear();
            for (;;) {
                int32_t r = nd->recv();
                if (r == YG_PENDING) break;
                printf("rx %04x %d\n", nd->conn->pkt->id, r);
                if (r != YG_OK) break;
                nd->onRecv();
            }
            if (!g_out.empty()) printf("tx %s\n", hex(g_out.data(), g_out.size()).c_str());
        } else if (cmd == "dump") {
            dump();
        } else if (cmd == "pop") {
            nd->popCommand();
        } else if (cmd == "set") {
            std::cin >> a;
            auto eq = a.find('=');
            std::string k = a.substr(0, eq);
            long v = strtol(a.c_str() + eq + 1, nullptr, 0);
            if (k == "mode") g_duelMode = (int)v;
            else if (k == "turn") g_turnPlayer = (uint32_t)v;
            else if (k == "scene") g_sceneId = (uint8_t)v;
            else if (k == "state") nd->state = (uint8_t)v;
        } else if (cmd == "clock") {
            int who, p;
            std::cin >> who >> p;
            printf("clock %d %d\n", who == 3 ? nd->globalSecs(p) : nd->sideSecs((uint32_t)who), nd->sideSecs2(who));
        } else if (cmd == "answered") {
            int n;
            std::cin >> n;
            printf("answered %d %d\n", n, nd->answered(n));
        }
    }
}
