// net_cli verbs and app / UI stubs for the Net tasks (NetGateTask.cpp, ...).
#include "NetTasks.h"
#include "ConnectLobby/yo2ConnectLobbyScene.h"
#include "net_cli.h"

#include <string>
#include "System/yo2Task.h"

CNetGate* appNetGate() { return &gate; }
CNetAccount* appNetAccount() { return &acc; }
CNetLobby* appNetLobby() { return &lobby; }
uint32_t appWindowHandle() { return 0x1234; }
void appPlaySound(uint32_t id, int32_t arg) { printf("sound %08x %d\n", id, arg); }

static int32_t g_dialogResult;
CTask* uiCreateSpriteElm(CTask* parent, uint32_t priority) { return CTask::newChild(parent, priority); }
CTask* uiOpenDialogOk(CTask* layer, float x, float y, int32_t id, int32_t textId) {
    printf("dialog open %g %g %x text=%x\n", x, y, id, textId);
    g_dialogResult = -1;
    return CTask::newChild(layer, 0);
}
int32_t uiDialogResult(CTask*) { return g_dialogResult; }
CTask* uiOpenDialogOkCode(CTask* layer, float x, float y, int32_t id, int32_t textId, int32_t code) {
    printf("dialog open %g %g %x text=%x code=%d\n", x, y, id, textId, code);
    g_dialogResult = -1;
    return CTask::newChild(layer, 0);
}
CTask* uiOpenYesNo(CTask* layer, float x, float y, int32_t textId) {
    printf("yesno open %g %g text=%x\n", x, y, textId);
    g_dialogResult = -1;
    return CTask::newChild(layer, 0);
}
static int32_t g_inputResult = -1;
static std::string g_inputText;
CTask* uiOpenInput(CTask* layer, float x, float y, int32_t mode, int32_t textId) {
    printf("input open %g %g mode=%d text=%x\n", x, y, mode, textId);
    g_inputResult = -1;
    return CTask::newChild(layer, 0);
}
int32_t uiInputResult(CTask*) { return g_inputResult; }
void uiInputClear(CTask*) { g_inputResult = -1; }
std::string uiInputText(CTask*) { return g_inputText; }

static std::string g_loginUser, g_loginPassword;
std::string appLoginUser() { return g_loginUser; }
std::string appLoginPassword() { return g_loginPassword; }
void appSetLogin(const std::string& u, const std::string& p) { g_loginUser = u; g_loginPassword = p; }

static CTask* g_root;
static CTask* root() { return g_root ? g_root : (g_root = CTask::createRoot()); }
CTask* netCliRoot() { return root(); }
template <class T> static T* lastChild(CTask* under = nullptr) {   // depth-first: the last T below
    T* found = nullptr;
    for (CTask* c : (under ? under : root())->children()) {
        if (auto* t = dynamic_cast<T*>(c)) found = t;
        if (T* d = lastChild<T>(c)) found = d;
    }
    return found;
}

NET_CLI("call", "tasks.frame") {
    root()->call(&g_tmMain);
    CTask::flushDeleted();
    if (CNetGateTask* t = lastChild<CNetGateTask>())
        printf("gtask state=%d done=%u error=%x\n", t->state, t->done, t->errorText);
    if (auto* t = lastChild<CNetAccountTaskReqDuellpass150>()) printf("dptask state=%d\n", t->state);
    if (CNetAccountTask* t = lastChild<CNetAccountTask>())
        printf("atask state=%d busy=%d next=%d error=%x result=%d slot=%d\n", t->state, t->busy, t->next,
               t->errorTextId, t->lastResult, t->slot);
    if (auto* t = lastChild<CCheckDisconnectTask>())
        printf("cdtask state=%d text=%x delay=%d hb=%d,%d\n", t->state, t->textId, t->delay, t->heartBeat->state,
               t->heartBeat->which);
    if (auto* t = lastChild<CConnectLobby>())
        printf("cltask mode=%d result=%d code=%d,%d\n", t->mode, t->result, t->connectCode, t->resultCode);
    if (auto* t = lastChild<CConnectLobbyScene>()) printf("clscene state=%d\n", t->state);
    if (CNetLobbyTask* t = lastChild<CNetLobbyTask>())
        printf("ltask state=%d busy=%d result=%d trade=%d\n", t->state, t->busy, t->result, t->tradeResult);
});
NET_CLI("call", "tasks.dialog") { g_dialogResult = atoi(arg.c_str()); });
NET_CLI("call", "tasks.connstate") { gate.conn->state = atoi(arg.c_str()); });
NET_CLI("call", "gtask.spawn") {
    CNetGateTask::spawn(root(), root());
    CNetGateTask* t = lastChild<CNetGateTask>();
    printf("gtask spawned state=%d elm=%s\n", t->state, t->elm.get()->instName().c_str());
});

static CNetAccountTask* atask() { return lastChild<CNetAccountTask>(); }
NET_CLI("call", "tasks.input") {   // "<result>,<text>"
    g_inputResult = atoi(arg.c_str());
    size_t c = arg.find(',');
    g_inputText = c == std::string::npos ? "" : arg.substr(c + 1);
});
NET_CLI("call", "atask.spawn") { printf("atask spawned %d\n", CNetAccountTask::spawn(root(), root()) != nullptr); });
NET_CLI("call", "atask.login") {   // "<user>,<password>"
    size_t c = arg.find(',');
    printf("accepted %d\n", atask()->login(arg.substr(0, c), arg.substr(c + 1)));
});
NET_CLI("call", "atask.create") { printf("accepted %d\n", atask()->createCharacter(atoi(arg.c_str()))); });
NET_CLI("call", "atask.delete") { printf("accepted %d\n", atask()->deleteCharacter(atoi(arg.c_str()))); });
NET_CLI("call", "atask.pbin") { printf("accepted %d\n", atask()->requestPbin(atoi(arg.c_str()))); });
NET_CLI("call", "atask.trunk") { printf("accepted %d\n", atask()->requestTrunk()); });
NET_CLI("call", "atask.list") { printf("accepted %d\n", atask()->requestPlayerList()); });
NET_CLI("call", "atask.bye") { printf("accepted %d\n", atask()->bye()); });
NET_CLI("call", "atask.errortext") { printf("errortext %x\n", CNetAccountTask::errorText(atoi(arg.c_str()))); });
NET_CLI("call", "dptask.spawn") { CNetAccountTaskReqDuellpass150::spawn(root()); });

// CNetLobbyTask. The duel connection is a stand-in (phase2-duel's CNetDuel isn't on this branch): it prints what
// the task asks of it, and the test sets its answers.
struct CNetDuel : CMessageIOBase {
    bool booked = true;
    uint8_t svrCode = 0, state = 0;
    int32_t last = -1;
    uint32_t answers = 0;   // bit n = answered(n) is true once
};
static CNetDuel g_duel;
CNetDuel* appNetDuel() { return &g_duel; }
uint8_t appLanguage() { return 5; }
std::vector<uint32_t> appPSelectDeck() { return {0x1234, 0x5678}; }
static int32_t g_clothType = 1, g_myRoomArea = -1;
int32_t appClothType() { return g_clothType; }
int32_t appMyRoomArea() { return g_myRoomArea; }
CMessageIOBase& duelIo(CNetDuel* d) { return *d; }
int32_t duelConnect(CNetDuel* d, CNetGate*, const char* host, uint16_t port) {
    printf("duel connect %s %u\n", host, port);
    d->conn->state = YGC_CONNECTED;
    return 0;
}
void duelSendBookedCheck(CNetDuel*, uint32_t pid) { printf("duel bookedcheck %u\n", pid); }
void duelSendWatch(CNetDuel*) { printf("duel watch\n"); }
void duelSendMyDeck(CNetDuel*) { printf("duel deck\n"); }
void duelSendPrepare(CNetDuel*) { printf("duel prepare\n"); }
bool duelAnswered(CNetDuel* d, int n) {
    bool r = d->answers >> n & 1;
    d->answers &= ~(1u << n);
    return r;
}
bool duelBooked(CNetDuel* d) { return d->booked; }
uint8_t& duelSvrCode(CNetDuel* d) { return d->svrCode; }
uint8_t duelState(CNetDuel* d) { return d->state; }
int32_t duelLast(CNetDuel* d) { return d->last; }

static CNetLobbyTask* ltask() { return lastChild<CNetLobbyTask>(); }
NET_CLI("call", "ltask.spawn") {
    CNetLobbyTask::spawn(root());
    printf("ltask spawned %s\n", ltask()->taskName().c_str());
});
NET_CLI("call", "ltask.connect") {   // "rgn,rank,area"
    unsigned r = 0, k = 0, a = 0;
    sscanf(arg.c_str(), "%u,%u,%u", &r, &k, &a);
    printf("accepted %d\n", ltask()->connect((uint8_t)r, (uint8_t)k, (uint8_t)a));
});
NET_CLI("call", "ltask.myroom") { printf("accepted %d\n", ltask()->connectMyRoom()); });
NET_CLI("call", "ltask.myroomarea") { g_myRoomArea = atoi(arg.c_str()); });
NET_CLI("call", "ltask.cloth") { g_clothType = atoi(arg.c_str()); });
NET_CLI("call", "ltask.lists") { printf("accepted %d\n", ltask()->reqLists()); });
NET_CLI("call", "ltask.friend") { printf("accepted %d\n", ltask()->reqFriend(atoi(arg.c_str()))); });
NET_CLI("call", "ltask.addblack") { printf("accepted %d\n", ltask()->reqAddBlack(atoi(arg.c_str()))); });
NET_CLI("call", "ltask.pidbyname") { printf("accepted %d\n", ltask()->getPidByName(arg)); });
NET_CLI("call", "ltask.mailcount") { printf("accepted %d\n", ltask()->getMailCount()); });
NET_CLI("call", "ltask.trade") { printf("accepted %d\n", ltask()->reqTrade(atoi(arg.c_str()))); });
NET_CLI("call", "ltask.duel") { printf("accepted %d\n", ltask()->duel()); });
NET_CLI("call", "ltask.watchduel") { printf("accepted %d\n", ltask()->watchDuel()); });
NET_CLI("call", "ltask.duelafterabort") { printf("accepted %d\n", ltask()->duelAfterAbort()); });
NET_CLI("call", "ltask.duelanswer") { g_duel.answers |= 1u << atoi(arg.c_str()); });
NET_CLI("call", "ltask.duelbooked") { g_duel.booked = atoi(arg.c_str()) != 0; });
NET_CLI("call", "ltask.duelcode") { g_duel.svrCode = (uint8_t)atoi(arg.c_str()); });
NET_CLI("call", "ltask.take") { printf("taken %d result=%d\n", ltask()->takeAnswer((int)strtol(arg.c_str(), nullptr, 0)), ltask()->result); });

// CCheckDisconnectTask / CCheckHeartBeatTask
static AppDisconnect g_disconnect;
AppDisconnect& appDisconnect() { return g_disconnect; }
void appMarkDisconnected() { printf("marked disconnected\n"); }
void appFadeOut(int32_t frames, int32_t arg) { printf("fade out %d %x\n", frames, arg); }
NET_CLI("call", "cdtask.spawn") { CCheckDisconnectTask::spawn(root(), root()); });
NET_CLI("call", "cdtask.flag") { g_disconnect = {1, atoi(arg.c_str())}; });   // arg: the reason
NET_CLI("call", "tasks.stale") {   // "lobby" / "account": nothing heard for 200 s; "fresh": both just heard
    int32_t t = (int32_t)time(nullptr);
    if (arg == "fresh") lobby.lastRecv = acc.lastRecv = t;
    else (arg == "lobby" ? (CMessageIOBase&)lobby : (CMessageIOBase&)acc).lastRecv = t - 200;
});

// CConnectLobby
void appSetWorldForRank(int32_t rank) { printf("world for rank %d\n", rank); }
void appRestoreWorld() { printf("world restored\n"); }
void appPrepareDuelDeck() { printf("duel deck prepared\n"); }
NET_CLI("call", "cltask.spawn") { CConnectLobby::spawn(root(), 10000); });
NET_CLI("call", "cltask.gate") { printf("accepted %d\n", lastChild<CConnectLobby>()->connectGate()); });
NET_CLI("call", "cltask.lobby") {   // "rgn,rank,area"
    int r = 0, k = 0, a = 0;
    sscanf(arg.c_str(), "%d,%d,%d", &r, &k, &a);
    printf("accepted %d\n", lastChild<CConnectLobby>()->connectLobby(r, k, a));
});
