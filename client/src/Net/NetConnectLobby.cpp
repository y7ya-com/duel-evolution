// CConnectLobby (the exe's src\Net\yo2ConnectLobby.cpp).
#include <cstdlib>

#include "NetTasks.h"

// @yo2 0x0069df00 GetRandomLobby: a random listed area (0-7) of the lobbies for (lang, rank), -1 if there's none
int32_t randomLobbyArea(uint8_t lang, uint8_t rank) {
    std::vector<const CServerInfo*> found;   // ponytail: std::vector for the exe's vector<CServerInfo*> (0x69f530)
    const CServerList* list = appNetGate()->list();   // the exe reads a null list (still listing) and crashes
    for (int a = 0; list && a < 8; a++)
        for (const CServerInfo& s : *list)
            if (s.kind == 3 && s.lang == lang && s.rank == rank && s.area == a) {
                found.push_back(&s);
                break;
            }
    if (found.empty()) return -1;
    int32_t area = found[(uint32_t)rand() % found.size()]->area;
    yo2Trace("GetRandomLobby(Rgn:%d,Rank:%d)=>Area:%d", lang, rank, area);
    return area;
}

// @yo2 0x0069dd80
void CConnectLobby::spawn(CTask* parent, uint32_t priority) { (new CConnectLobby)->create(parent, priority); }

// @yo2 0x0069e0c0
CConnectLobby::CConnectLobby() { setTaskName("CConnectLobby"); }

// @yo2 0x0069e240 CConnectLobby deleting destructor
// @yo2 0x0069e270 the CTaskPtr, then CEasyTask
CConnectLobby::~CConnectLobby() = default;

// @yo2 0x0069de40
void CConnectLobby::reset() {
    mode = IDLE;
    result = RES_NONE;
    connectCode = 0;
    resultCode = 0;
    rgn = rank = area = -1;
}

// @yo2 0x0069de80 the gate: connect, version, list, bye
bool CConnectLobby::connectGate() {
    if (mode != IDLE) return false;
    mode = GATE_CONNECT;
    result = RES_1;
    return true;
}

// @yo2 0x0069deb0 the lobby (rgn, rank, area) of the gate's list, then block 0
bool CConnectLobby::connectLobby(int32_t r, int32_t k, int32_t a) {
    if (mode != IDLE) return false;
    rgn = r;
    rank = k;
    mode = LOBBY_CONNECT;
    result = RES_1;
    area = a;
    return true;
}

// @yo2 0x0069e310 its own CNetLobbyTask
bool CConnectLobby::onInit() {
    CNetLobbyTask* t = CNetLobbyTask::spawn(this);
    YO2_ASSERT(t, "error Create CConnectLobby::m_pNetLobbyTask");
    lobbyTask.setUser(this);
    lobbyTask.set(t);
    lobbyTask->setInstName("CConnectLobbyのCNetLobbyTask");
    return true;
}

// @yo2 0x0069e760
bool CConnectLobby::onMain() {
    CNetGate* gate = appNetGate();
    switch (mode) {
    case GATE_CONNECT:
        gate->ensureConn();
        gate->notify = appWindowHandle();
        connectCode = gate->connect();
        if (connectCode == 0) {
            mode = GATE_WAIT;
            return true;
        }
        result = RES_GATE_FAILED;
        mode = IDLE;
        break;
    case GATE_WAIT:
        if (int32_t s = gate->state(); s == YGC_FAILED) {
            gate->disconnect();
            connectCode = gate->error();
        } else if (s == YGC_CONNECTED) {
            connectCode = gate->select(appWindowHandle());
            if (connectCode == 0) {
                mode = GATE_VERSION;
                return true;
            }
        } else {
            return true;
        }
        result = RES_GATE_FAILED;
        mode = IDLE;
        break;
    case GATE_VERSION:
        gate->sendVersion();
        mode = GATE_LIST;
        break;
    case GATE_LIST:   // 0x2002 refused, or the whole list (0x2004)
        resultCode = gate->takeResult();
        if (resultCode != 0) {
            result = RES_FAILED;
            mode = IDLE;
        } else if (gate->flag(GATE_REQ_VERSION) == 2) {
            gate->flag(GATE_REQ_VERSION) = 0;
            gate->sendBye();
            result = RES_DONE;
            mode = IDLE;
        }
        break;
    case LOBBY_CONNECT:
        gate->disconnect();
        if (lobbyTask->connect((uint8_t)rgn, (uint8_t)rank, (uint8_t)area)) mode = LOBBY_WAIT;
        break;
    case LOBBY_WAIT:
        if (lobbyTask->busy == CNetLobbyTask::BUSY_IDLE) {
            appSetWorldForRank(rank);
            lobbyTask->enterBlock(0, 0);
            appPrepareDuelDeck();
            mode = LOBBY_BLOCK;
            return true;
        }
        if (lobbyTask->busy != CNetLobbyTask::BUSY_FAILED) return true;
        result = RES_FAILED;
        resultCode = lobbyTask->result;
        mode = IDLE;
        break;
    case LOBBY_BLOCK:
        if (lobbyTask->busy == CNetLobbyTask::BUSY_DONE) {
            result = RES_DONE;
        } else if (lobbyTask->busy == CNetLobbyTask::BUSY_FAILED) {
            appRestoreWorld();
            result = RES_FAILED;
            resultCode = lobbyTask->result;
        } else {
            return true;
        }
        mode = IDLE;
        break;
    }
    return true;
}
