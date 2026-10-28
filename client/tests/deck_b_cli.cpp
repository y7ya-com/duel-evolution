// Test driver for src/Deck part B (trade scene + trade window), run by tests/deck_b_test.py.
//   deck_b_cli script < steps
// Steps (one per line):
//   start                      a fresh scene in state 1 on a connected lobby
//   ans <off>                  lobby request byte <off> := 2 (the lobby parser saw the answer)
//   result <k> <v>             the lobby's result slot k (+0x7e0 + 4k)
//   tb <field> <v>             a TradeBlock field: otherMove otherMoveKind otherStatus myStatus confirm tradeEnd
//   trunk <id> <n> / limit <id> <n>   the player's trunk and not-tradeable copies
//   state <n>                  force the scene state (what the window's "Ready" button does: 0x7117 then 10)
//   step | update              CTradeScene::step / update
//   dlg <left|yesno|end> <id>  the dialog's pressed button (0 = none)
//   drag add <card> <x> <y> | drag del <index> <x> <y>   a released drag
//   win <addmine|addother|delmine|delother|swap|clear|layout|ready> [n]   CWindowTaskTrade calls
//   dump                       "scene ...", "win ...", "tx <hex>" (sent since the last dump), "ui ..." lines as they happen
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "Deck/TpEntry.h"
#include "Deck/TradeEntry.h"

// ---------------------------------------------------------------- transport + Net hooks
static std::vector<uint8_t> g_out;
static int rd(void*, uint8_t*, int) { return -1; }
static int wr(void*, const uint8_t* b, int n) { g_out.insert(g_out.end(), b, b + n); return n; }
YgTransport ygSocketTransport(int32_t) { return {nullptr, rd, wr}; }
void ygSocketClose(int32_t) {}
int32_t ygConnectAsync(const char*, uint16_t, YgConn* c, uint32_t) { c->sock = 7; c->state = YGC_CONNECTED; return 0; }
int32_t ygSocketSelect(int32_t, uint32_t) { return 0; }

// ---------------------------------------------------------------- System / UI stubs
uint8_t g_playerTrunk[CARD_MAX + 1], g_playerLimit[CARD_MAX + 1];
static std::map<std::string, int32_t> g_answer;   // dialog -> button
static bool g_cancel, g_released;
static int32_t g_mx, g_my;
static int g_nextTask = 1;
static std::vector<CWindowTaskTradeCard*> g_cards;

#define UI(...) printf("ui " __VA_ARGS__)
void uiSetInputEnabled(bool on) { UI("input %d\n", on); }
void uiDeckWindowsEnabled(bool) {}
void uiTradeLock(bool) {}
void uiKabanRefresh(bool) {}
void uiKabanRefreshAll() {}
void uiReadyLamp(int which, bool on) { UI("lamp %d %d\n", which, on); }
static CTradeScene* g_scene;
void uiTradeOkDialog(int text) { UI("okdialog %x\n", text); g_scene->leftDialog.task = (void*)(intptr_t)g_nextTask++; }
void uiTradeYesNoDialog(int y, int n) { UI("yesno %d %x\n", y, n); g_scene->yesNo.task = (void*)(intptr_t)g_nextTask++; }
void uiTradeEndDialog(int text) { UI("enddialog %x\n", text); g_scene->endDialog.task = (void*)(intptr_t)g_nextTask++; }
void uiKabanLoad(CardBox* b) { UI("kabanload %d/%d %d/%d\n", b->count(1), b->limit(1), b->count(0xcb8), b->limit(0xcb8)); }
void uiSceneChangeSound() {}
void tradeApplyToDecks(CardBox*) { UI("applydecks\n"); }
void tradeLeaveScene() { UI("leave\n"); }
void uiTradeWindowOpen(const char* partner) { UI("open %s\n", partner); }
void uiSound(uint32_t) {}
void uiDialogClose(TaskPtrSlot* d, int line) { UI("close %x\n", line); d->task = nullptr; }
static TaskPtrSlot* g_tpConfirm;
int32_t uiDialogAnswer(TaskPtrSlot* d) {
    if (d == g_tpConfirm) return g_answer["tp"];
    const char* k = d == &g_scene->leftDialog ? "left" : d == &g_scene->yesNo ? "yesno" : "end";
    return g_answer[k];
}
bool uiCancelKey() { return g_cancel; }
bool uiMouseReleased() { return g_released; }
void uiMousePos(int32_t* x, int32_t* y) { *x = g_mx; *y = g_my; }
bool uiCloseButton(int32_t msg) { return msg == 0x13; }
void kabanOffer(int32_t card, int n) { UI("offer %d %d\n", card, n); }
void kabanReturn(int32_t card, int n) { UI("return %d %d\n", card, n); }
void kabanDragEnd() {}
void kabanRightClick() {}
void kabanShowPage(int page) { UI("page %d\n", page); }
CWindowTaskTradeCard* uiNewTradeCard(CWindowTaskTrade*) {
    auto* c = new CWindowTaskTradeCard();
    c->init();
    g_cards.push_back(c);
    return c;
}
void uiDeleteTask(void* task, int line) {
    for (auto*& c : g_cards)
        if (c == task) {
            delete c;
            c = nullptr;
            return;
        }
    (void)line;
}
void uiRedraw(void*) {}
void* uiCardSprite(CWindowTaskTradeCard*, const std::string& path) { UI("sprite %s\n", path.c_str()); return (void*)1; }
void uiSpriteVisible(void*, bool) {}
bool uiCursorOver(CWindowTaskTradeCard*) { return true; }
void uiDetailView(int32_t card) { UI("detail %d\n", card); }
std::string cardImageName(int32_t card) { return "c" + std::to_string(card) + ".png"; }

// TP scene hooks
static std::vector<int32_t> g_tpCards;
static uint32_t g_tpRank;
static std::map<uint32_t, bool> g_pbin;
int32_t tpWindowCount() { return (int32_t)g_tpCards.size(); }
void tpWindowAdd(int32_t card) { g_tpCards.push_back(card); }
void tpWindowRemove(int32_t index) { g_tpCards.erase(g_tpCards.begin() + index); }
void tpWindowReset(int32_t) {}
void tpWindowRedraw() {}
void tpWindowEnable(bool) {}
void tpWindowCards(uint16_t* out) { for (size_t i = 0; i < g_tpCards.size() && i < 4; i++) out[i] = (uint16_t)g_tpCards[i]; }
void tpWindowPage(int) {}
uint32_t playerTpRank() { return g_tpRank; }
bool pbinTest(uint32_t bit) { return g_pbin[bit]; }
void pbinSet(uint32_t bit, bool on) { g_pbin[bit] = on; UI("pbin %x %d\n", bit, on); }
void uiOkLamp() {}
void uiSceneReturn() { UI("return\n"); }
static CTpScene tp;

// ---------------------------------------------------------------- driver
static CNetLobby lobby;
static CWindowTaskTrade window;
static CTradeScene scene;
static CardBox box;
static CardDrag drag;
static uint8_t dragging;

static std::string hex(const std::vector<uint8_t>& b) {
    std::string s;
    char t[3];
    for (uint8_t x : b) { snprintf(t, 3, "%02x", x); s += t; }
    return s;
}

static void row(const char* name, TradeCards& v) {
    printf(" %s=", name);
    for (size_t i = 0; i < v.size(); i++) printf("%s%d@%g,%g,%g%s", i ? ";" : "", v[i]->card, v[i]->x, v[i]->y, v[i]->z,
                                                  v[i]->last ? "L" : "");
}

static void dump() {
    TradeBlock* t = lobbyTrade(&lobby);
    printf("scene state=%u busy=%d left=%d completed=%d closing=%d shown=%d other=%d\n", scene.state, scene.busy,
           scene.partnerLeft, scene.completed, scene.closing, scene.shownCount, t->otherStatus);
    printf("win counts=%d,%d ready=%d", window.otherCount, window.mineCount, window.ready);
    row("other", window.other);
    row("mine", window.mine);
    printf("\n");
    printf("tx %s\n", hex(g_out).c_str());
    g_out.clear();
    printf("req");
    for (int off = 0x4e; off <= 0x63; off++) printf(" %d", lobby.flag(off));
    printf("\n");
}

static void start() {
    lobby.ensureConn();
    if (!lobby.conn->pkt) ygConnAllocPacket(lobby.conn);
    lobby.conn->sock = 7;
    lobby.conn->state = YGC_CONNECTED;
    lobby.conn->sendSeq = 0;
    scene = CTradeScene{};
    scene.construct();
    scene.lobby = &lobby;
    scene.box = &box;
    scene.state = TS_START;
    g_scene = &scene;
    g_tradeWindow = &window;
    g_cardDrag = &drag;
    g_kabanDragging = &dragging;
    TradeBlock* t = lobbyTrade(&lobby);
    memset(t, 0, sizeof *t);
    strcpy(t->partnerName, "Kaiba");
    for (int k = 0; k < 0x70; k++) {
        int32_t v = -150;
        memcpy(lobbyResultSlot(&lobby, k), &v, 4);
    }
}

int main(int argc, char** argv) {
    setvbuf(stdout, nullptr, _IOLBF, 0);
    if (argc < 2 || strcmp(argv[1], "script") != 0) return 2;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd;
        in >> cmd;
        if (cmd == "start") start();
        else if (cmd == "ans") { int off; in >> std::hex >> off; lobby.flag(off) = 2; }
        else if (cmd == "result") {
            int k;
            int32_t v;
            in >> std::hex >> k >> std::dec >> v;
            memcpy(lobbyResultSlot(&lobby, k), &v, 4);
        } else if (cmd == "tb") {
            std::string f;
            int v;
            in >> f >> v;
            TradeBlock* t = lobbyTrade(&lobby);
            if (f == "otherMove") t->otherMove = (int16_t)v;
            else if (f == "otherMoveKind") t->otherMoveKind = (uint8_t)v;
            else if (f == "otherStatus") t->otherStatus = (uint8_t)v;
            else if (f == "myStatus") t->myStatus = (uint8_t)v;
            else if (f == "confirm") t->confirm = (uint8_t)v;
            else if (f == "tradeEnd") t->tradeEnd = (uint8_t)v;
        } else if (cmd == "trunk" || cmd == "limit") {
            int id, n;
            in >> id >> n;
            (cmd == "trunk" ? g_playerTrunk : g_playerLimit)[id] = (uint8_t)n;
        } else if (cmd == "state") in >> scene.state;
        else if (cmd == "step") scene.step();
        else if (cmd == "update") { scene.update(); g_released = g_cancel = false; }
        else if (cmd == "dlg") { std::string k; int v; in >> k >> v; g_answer[k] = v; }
        else if (cmd == "cancel") g_cancel = true;
        else if (cmd == "close") scene.onMessage(0x13);
        else if (cmd == "drag") {
            std::string kind;
            int v;
            in >> kind >> v >> g_mx >> g_my;
            drag = CardDrag{};
            drag.phase = 1;
            if (kind == "add") { drag.from = 2; drag.card = v; dragging = 1; }
            else { drag.from = 1; drag.source = 4; drag.index = v; drag.card = window.mine[(size_t)v]->card; }
            g_released = true;
        } else if (cmd == "win") {
            std::string op;
            int n = 0;
            in >> op >> n;
            if (op == "addmine") window.addMine((uint32_t)n);
            else if (op == "addother") window.addOther((uint32_t)n);
            else if (op == "delmine") window.removeMine((uint32_t)n);
            else if (op == "delother") window.removeOther((uint32_t)n);
            else if (op == "swap") window.swapRows();
            else if (op == "clear") window.clear();
            else if (op == "layout") window.layout();
            else if (op == "ready") window.setReady(n != 0);
            else if (op == "count") printf("count %d\n", window.countMine(n));
            else if (op == "ids") {
                int32_t o[10], m[10];
                for (int i = 0; i < 10; i++) o[i] = m[i] = -1;
                window.ids(o, m);
                printf("ids");
                for (int i = 0; i < 10; i++) printf(" %d", o[i]);
                printf(" |");
                for (int i = 0; i < 10; i++) printf(" %d", m[i]);
                printf("\n");
            }
        } else if (cmd == "tp") {   // tp <max> <rank> <pbin240> <pbin242>: a TP scene on the same lobby, no dialog
            int mx, r, a, b;
            in >> mx >> r >> a >> b;
            tp = CTpScene{};
            tp.maxCards = mx;
            g_tpRank = (uint32_t)r;
            g_pbin[0x240] = a, g_pbin[0x242] = b;
            g_tpCards.clear();
            g_tpLobby = &lobby;
            g_out.clear();
        } else if (cmd == "tpconfirm") { tp.busy = 1; tp.confirm.task = (void*)1; g_tpConfirm = &tp.confirm; }
        else if (cmd == "tpupdate") {
            tp.update();
            g_released = g_cancel = false;
        } else if (cmd == "tpdump") {
            printf("tp busy=%d cards=", tp.busy);
            for (int32_t c : g_tpCards) printf("%d,", c);
            printf(" pbin=%d,%d\ntx %s\n", (int)g_pbin[0x240], (int)g_pbin[0x242], hex(g_out).c_str());
            g_out.clear();
        } else if (cmd == "dump") dump();
    }
    return 0;
}
