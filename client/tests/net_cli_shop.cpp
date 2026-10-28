// Shop-group verbs for the src/Net test driver (see net_cli.h), plus stand-ins for the NetLobby_Shop.h hooks.
#include <map>

#include "NetLobby_Shop.h"
#include "net_cli.h"

#pragma GCC diagnostic ignored "-Wunused-parameter"   // NET_CLI lambdas that ignore arg

// ---- hook stand-ins: tables the test fills with "call shop.<x>=..." and reads back with "dump shop"
static std::map<uint16_t, uint8_t> g_owned;                                  // cardDbOwned
static std::map<uint32_t, std::pair<int32_t, std::vector<uint16_t>>> g_packs;   // cardPackCards
static int g_syncs;
static std::vector<std::pair<int, uint16_t>> g_newItems;
static std::vector<NpcInfo> g_npcs;
static std::map<int32_t, std::vector<int32_t>> g_limits, g_unreleased;
static int32_t g_limitCount, g_unreleasedCount;

uint8_t cardDbOwned(uint16_t card) { return g_owned.count(card) ? g_owned[card] : 0; }
void cardDbSyncTrunk(const CMyUser&) { g_syncs++; printf("hook storetrunk\n"); }
bool cardPackCards(uint32_t pack, std::vector<uint16_t>* cards, int32_t* pbinBase) {
    auto it = g_packs.find(pack);
    if (it == g_packs.end()) return false;
    *pbinBase = it->second.first;
    *cards = it->second.second;
    return true;
}
void newItemListAdd(NewItemList list, uint16_t id) { g_newItems.push_back({list, id}); }
void npcInfoClear() { g_npcs.clear(); }
void npcInfoAdd(const NpcInfo& n) { g_npcs.push_back(n); }
void limitationSet(int32_t i, int32_t a, int32_t b, uint8_t c) { g_limits[i] = {a, b, c}; }
void limitationCount(int32_t n) { g_limitCount = n; }
void unreleasedSet(int32_t i, int32_t a, int32_t b) { g_unreleased[i] = {a, b}; }
void unreleasedCount(int32_t n) { g_unreleasedCount = n; }

static std::vector<long> nums(const std::string& s) {   // "1:2,3" -> {1, 2, 3}
    std::vector<long> v;
    for (const char* p = s.c_str(); *p;) {
        char* e;
        v.push_back(strtol(p, &e, 0));
        p = *e ? e + 1 : e;
    }
    return v;
}

// ---- builders
NET_CLI("build", "lb.itemget") { acc.bin.npcBin[5 * 4 + 3] = 0; lobby.itemGet(acc, 1, 5); });
NET_CLI("build", "lb.itemget4") { lobby.itemGet(acc, 4, 5);
    printf("itemget4.result %08x %u\n", acc.bin.item(5), lobby.flag(LB_REQ_ITEMGET)); });
NET_CLI("build", "lb.shopresult_clears") { ShopPurchase x{}; lobby.purchased = {x}; lobby.reqShopResult();
    printf("shopresult_clears.result %zu\n", lobby.purchased.size()); });

// ---- setters: shop.owned=<card>:<n>, shop.pack=<id>:<pbinBase>:<card>,<card>..., shop.flag=<bit>,
// shop.trunk=<card>:<n>, shop.dptries=<n>, shop.entries=<n>
NET_CLI("call", "shop.owned") { auto v = nums(arg); g_owned[(uint16_t)v[0]] = (uint8_t)v[1]; });
NET_CLI("call", "shop.pack") { auto v = nums(arg);
    g_packs[(uint32_t)v[0]] = {(int32_t)v[1], std::vector<uint16_t>(v.begin() + 2, v.end())}; });
NET_CLI("call", "shop.flag") { acc.bin.setFlag((uint32_t)atol(arg.c_str()), true); });
NET_CLI("call", "shop.trunk") { auto v = nums(arg); acc.me.trunk[v[0] - 1] = (uint8_t)v[1]; });
NET_CLI("call", "shop.dptries") { lobby.dpAuthTries = atoi(arg.c_str()); });

NET_CLI("dump", "shop") {
    CNetLobby& l = lobby;
    printf("shop packGot=%d packOpened=%d usbPackGot=%d packOpenCount=%d dpAuthTries=%d tpVictoryCard=%u "
           "mileageResult=%d packOpenResult=%d presentPackResult=%d dpAuthResult=%d usbDpAuthResult=%d sdGet=%d "
           "tpCardGet=%d startup=%d npcInfoCount=%d shopResult=%d purchaseResult=%d dpCard=%u dpExtra=%u dpGain=%d "
           "dpPack=%u tourDuelStart=%u markCount=%d usbB=%u usbCard=%u,%u,%u usbNew=%u,%u,%u usbGain=%u "
           "npcPresentType=%d dp=%u mp0=%u syncs=%d\n",
           l.packGot, l.packOpened, l.usbPackGot, l.packOpenCount, l.dpAuthTries, l.tpVictoryCard, l.mileageResult,
           l.packOpenResult, l.presentPackResult, l.dpAuthResult, l.usbDpAuthResult, l.sdGetResult,
           l.tpCardGetResult, l.startupPresentResult, l.npcInfoCount, l.shopResult, l.purchaseResult, l.dpCard,
           l.dpExtra, l.dpGain, l.dpPack, l.tourDuelStart, l.markCount, l.usbB, l.usbCard[0], l.usbCard[1],
           l.usbCard[2], l.usbNew[0], l.usbNew[1], l.usbNew[2], l.usbGain, l.npcPresentType, acc.me.u2c,
           acc.me.players[0].mp, g_syncs);
    printf("shopflags");
    for (int f = 0x4b; f <= 0x83; f++) printf(" %x:%u", f, l.flag(f));
    printf("\ntrunk");
    for (int i = 0; i < TRUNK_BYTES; i++) if (acc.me.trunk[i]) printf(" %d:%u", i + 1, acc.me.trunk[i]);
    printf("\npbin");
    for (int b = 0; b < 1024; b++) if (acc.bin.flag(b)) printf(" %x", b);
    printf("\npack");
    for (int i = 0; i < 80; i++) if (l.packCard[i] != -1) printf(" %d:%d:%u", i, l.packCard[i], l.packNew[i]);
    const CChampsData& t = l.champs;
    printf("\nchamps serial=%d name=%s day=%d u74=%u u78=%u max=%d entries=%d rounds=%d champion=%s u9c=%d "
           "runnerUp=%s lottery=%u phase=%d phaseState=%u roundPhase=%d roundState=%u lotResult=%u round=%d "
           "subtitle=%u timer=%d alive=%d audience=%d state=%d udc=%d\n",
           t.serial, str(t.name).c_str(), t.day, t.u74, t.u78, t.maxPlayers, t.entries, t.rounds,
           str(t.champion).c_str(), t.u9c, str(t.runnerUp).c_str(), t.lotteryState, t.phase, t.phaseState,
           t.roundPhase, t.roundState, t.lotResult, t.round, t.subtitle, t.timer, t.alive, t.audience, t.state, t.udc);
    for (int i = 0; i < 0x49; i++) {
        const TourPage& pg = l.tourPage[i];
        bool any = pg.count;
        for (const TourSlot& s : pg.slot) any |= s.pid || s.side;
        if (!any) continue;
        printf("page %d %u", i, pg.count);
        for (const TourSlot& s : pg.slot) printf(" %d:%u:%u:%u", s.pid, s.side, s.result, s.wins);
        printf("\n");
    }
    for (int i = 0; i < 0x200; i++) {
        const CChampsEntryList& e = l.tourEntry[i];
        if (e.pid || e.wins || e.status)
            printf("entry %d pid=%d name=%s wins=%u status=%u country=%s avatar=%s\n", i, e.pid, str(e.name).c_str(),
                   e.wins, e.status, str(e.country).c_str(), hex(e.avatar[0].bytes_, 16).c_str());
    }
    for (int i = 0; i < 100 && l.mileageItem[i]; i++)
        printf("mileage %d %u %u %u %u\n", i, l.mileageItem[i], l.mileageA[i], l.mileageB[i], l.mileageC[i]);
    for (const ShopItem& s : l.shopItems)
        printf("item %u %u %u %u %u,%u,%u,%u\n", s.itemId, s.type, s.param, s.cost, s.b[0], s.b[1], s.b[2], s.b[3]);
    for (const ShopPurchase& s : l.purchased)
        printf("bought %u %u %d %u %u,%u,%u\n", s.itemId, s.type, s.card, s.isNew, s.b[0], s.b[1], s.b[2]);
    for (const Mark5310& m : l.marks) printf("mark %d %04x\n", m.pid, m.ab);
    for (const NpcInfo& n : g_npcs)
        printf("npc %d %s %s %u %d %d %d %d %d %d\n", n.id, str(n.name).c_str(), hex(n.parts, 16).c_str(), n.b26,
               n.u28, n.u30, n.threshold, n.spot, n.u3c, n.prev);
    for (auto& e : g_limits) printf("limit %d %d %d %d\n", e.first, e.second[0], e.second[1], e.second[2]);
    for (auto& e : g_unreleased) printf("unrel %d %d %d\n", e.first, e.second[0], e.second[1]);
    printf("limitcount %d %d\n", g_limitCount, g_unreleasedCount);
    for (auto& e : g_newItems) printf("newitem %x %u\n", e.first, e.second);
    printf("deck %s %s\n", hex(l.deckPbin, 0x80).c_str(), hex(l.deckNpcBin, 0x200).c_str());
});
