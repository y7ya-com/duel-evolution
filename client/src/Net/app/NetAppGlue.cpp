// What CApp and CSystemConfigManager (src/System/yo2App.cpp, yo2SystemConfig.cpp; on phase2-system) call in Net,
// Pack and Lobby: the five connections' factories, CApp's socket dispatch, and the start-up loaders. In the exe CApp
// calls these classes directly; System declares them as free functions so it doesn't need the Net headers.
#include <cstring>

#include "Lobby/yo2FriendBase.h"
#include "Net/NetAccount.h"
#include "Net/NetDownload.h"
#include "Net/NetGate.h"
#include "Net/NetLobby.h"
#include "Net/NetLobby_Rooms.h"
#include "Net/NetLobby_Social.h"
#include "Net/NetTasks.h"
#include "Net/NetUi.h"
#include "Net/NetUsb.h"
#include "Pack/CardPack.h"
#include "Pack/pack_externs.h"
#include "Sound/ygNetWin32.h"
#include "System/yo2Element.h"
#include "duel/NetDuel.h"

#if __has_include("System/yo2App.h")
#include "System/yo2App.h"
#include "System/yo2SystemConfig.h"
std::string appGateServer() { return systemConfig()->gateServer().c_str(); }
int32_t appGatePort() { return systemConfig()->gatePort(); }
#else   // the same declarations, until phase2-system's headers are merged
void yo2SoundInit();
bool yo2DiskSpaceAtLeast(uint64_t bytes);
CNetGate* yo2NewNetGate();
CNetAccount* yo2NewNetAccount();
CNetLobby* yo2NewNetLobby();
CNetDuel* yo2NewNetDuel();
CNetUsb* yo2NewNetUsb();
CFBlistManager* yo2NewFBlistManager();
void yo2Delete(CNetGate*);
void yo2Delete(CNetAccount*);
void yo2Delete(CNetLobby*);
void yo2Delete(CNetDuel*);
void yo2Delete(CNetUsb*);
void yo2Delete(CFBlistManager*);
CMessageIOBase* yo2NetIo(CNetGate*);
CMessageIOBase* yo2NetIo(CNetAccount*);
CMessageIOBase* yo2NetIo(CNetLobby*);
CMessageIOBase* yo2NetIo(CNetDuel*);
CMessageIOBase* yo2NetIo(CNetUsb*);
bool yo2NetIsSocket(CMessageIOBase* io, uintptr_t socket);
int32_t yo2NetRecv(CMessageIOBase* io);
void yo2NetOnReceive(CMessageIOBase* io);
bool yo2NetByeSent(CMessageIOBase* io);
void yo2NetDisconnect(CMessageIOBase* io);
CTask* yo2NewCheckDisconnectTask(CTask* parent, CElement* layer);
void yo2LoadPackText(int32_t language);
void yo2LoadPackInfo();
#endif

// 0x0068b3e0 (CApp::CApp): WinSock and the message cipher's key
void yo2SoundInit() {
#if defined(_WIN32)
    ygNetStartup();
#endif   // elsewhere platform/net needs no start-up, and the cipher starts with that key (Net/ygpacket.cpp)
}
// 0x0069f820
bool yo2DiskSpaceAtLeast(uint64_t bytes) { return netHasFreeSpace(bytes); }
// 0x00840a90 / 0x0084e690 (CSystemConfigManager::applyLanguage)
void yo2LoadPackText(int32_t language) { packInfoLoad(language); }
void yo2LoadPackInfo() { packTableLoad(); }

// CApp's five connections, in its order (+0xc64 .. +0xc74). CApp's receive goes through the exe's vtable slot 2,
// each class's onRecv; the lobby's handler reads the account connection as well.
static CNetGate* s_gate;
static CNetAccount* s_account;
static CNetLobby* s_lobby;
static CNetDuel* s_duel;
static CNetUsb* s_usb;

template <class T>
static T* make(T*& slot, void (T::*ctor)()) {
    T* p = new T;
    (p->*ctor)();
    return slot = p;
}
// 0x0069a210 / 0x0068e040 / 0x006aa2e0 / 0x00691050 / 0x006d59b0, each after operator new
CNetGate* yo2NewNetGate() { return make(s_gate, &CNetGate::init); }
CNetAccount* yo2NewNetAccount() { return make(s_account, &CNetAccount::init); }
CNetLobby* yo2NewNetLobby() { return make(s_lobby, &CNetLobby::init); }
CNetDuel* yo2NewNetDuel() { return make(s_duel, &CNetDuel::construct); }
CNetUsb* yo2NewNetUsb() { return make(s_usb, &CNetUsb::init); }
// 0x0085dac0
static CFBlistManager* s_fb;
CFBlistManager* yo2NewFBlistManager() { return s_fb = new CFBlistManager; }

// The deleting destructors: the base's body (0x0068cc40) disconnects, then the members go.
template <class T>
static void drop(T* p, T*& slot) {
    if (!p) return;
    p->destroy();
    delete p;
    if (slot == p) slot = nullptr;
}
void yo2Delete(CNetGate* p) { drop(p, s_gate); }
void yo2Delete(CNetAccount* p) { drop(p, s_account); }
void yo2Delete(CNetLobby* p) { drop(p, s_lobby); }
void yo2Delete(CNetDuel* p) { drop(p, s_duel); }
void yo2Delete(CNetUsb* p) { drop(p, s_usb); }
void yo2Delete(CFBlistManager* p) {
    delete p;
    if (s_fb == p) s_fb = nullptr;
}

CMessageIOBase* yo2NetIo(CNetGate* p) { return p; }
CMessageIOBase* yo2NetIo(CNetAccount* p) { return p; }
CMessageIOBase* yo2NetIo(CNetLobby* p) { return p; }
CMessageIOBase* yo2NetIo(CNetDuel* p) { return p; }
CMessageIOBase* yo2NetIo(CNetUsb* p) { return p; }

bool yo2NetIsSocket(CMessageIOBase* io, uintptr_t socket) { return io && io->isSocket((int32_t)socket); }   // 0x0068cfb0
int32_t yo2NetRecv(CMessageIOBase* io) { return io->recv(); }      // 0x0068cec0
bool yo2NetByeSent(CMessageIOBase* io) { return io->byeSent != 0; }
void yo2NetDisconnect(CMessageIOBase* io) { io->disconnect(); }    // 0x0068cdf0
// the vtable slot 2 call
void yo2NetOnReceive(CMessageIOBase* io) {
    if (io == s_gate) s_gate->onRecv();
    else if (io == s_account) s_account->onRecv();
    else if (io == s_lobby && s_account) s_lobby->onRecv(*s_account);
    else if (io == s_duel) s_duel->onRecv();
    else if (io == s_usb) s_usb->onRecv();
}

// 0x0069bd80
CTask* yo2NewCheckDisconnectTask(CTask* parent, CElement* layer) { return CCheckDisconnectTask::spawn(parent, layer); }

// --- what the Net tasks reach through NetUi.h / NetLobby_*.h, on the real objects (tests/net_cli* fake them) ---------
// CApp's members (+0xc64 .. +0xc70)
CNetGate* appNetGate() { return s_gate; }
CNetAccount* appNetAccount() { return s_account; }
CNetLobby* appNetLobby() { return s_lobby; }
CNetDuel* appNetDuel() { return s_duel; }

// the duel connection (src/duel/NetDuel.h)
CMessageIOBase& duelIo(CNetDuel* d) { return *d; }
int32_t duelConnect(CNetDuel* d, CNetGate* gate, const char* host, uint16_t port) {   // 0x00691190
    return d->connect(gate != nullptr, host, port, 0);
}
void duelSendBookedCheck(CNetDuel* d, uint32_t pid) { d->sendBookedCheck(pid); }   // 0x006917b0
void duelSendWatch(CNetDuel* d) { d->sendWatch(); }                                 // 0x006926d0
void duelSendPrepare(CNetDuel* d) { d->sendPrepare(); }                             // 0x00691880
bool duelAnswered(CNetDuel* d, int n) { return d->answered(n); }                    // 0x00693190
bool duelBooked(CNetDuel* d) { return d->flags & 1; }
uint8_t& duelSvrCode(CNetDuel* d) { return d->svrCode; }
uint8_t duelState(CNetDuel* d) { return d->state; }
int32_t duelLast(CNetDuel* d) { return d->last; }

// CApp's friend / black list (src/Lobby/yo2FriendBase.h)
bool lobbyIsBlacklisted(int32_t pid) { return s_fb && s_fb->blacks.contains((uint32_t)pid); }   // 0x0085d1a0
void lobbyAddFriend(int32_t pid, const char* name) {   // 0x0085d1d0 (it sorts and saves, 0x0085cf70)
    if (s_fb) s_fb->friends.addMember((uint32_t)pid, name);
}
int lobbyFriendCount() { return s_fb ? s_fb->friends.count : 0; }
uint32_t lobbyFriendId(int i) { return s_fb ? s_fb->friendPid(i) : 0; }   // 0x0085e1a0
