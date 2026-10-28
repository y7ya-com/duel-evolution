// What yo2WorldManager.cpp calls in classes other owners rewrite: the smallest interface each needs, declared here
// and implemented by that owner (in tests: tests/game/world_mng_test.cpp). Nothing here is defined by src/Game.
//
// The Net / scene / Gunsling / Tournament tasks aren't on main yet, so CWorldMng holds them as CTaskPtr<CTask> (the
// same 12 bytes as the exe's CTaskPtr<CNetLobbyTask> etc.) and reaches them through these functions.
// TODO(Net, MyRoom, Game, Gunsling, Tournament, duel): switch to the real classes when they land.
// "inline at 0xADDR": the exe has no function of its own for it; that function does it in place.
#pragma once
#include <cstdint>

class CTask;
class CElement;
class CSceneTask;
struct CNetLobby;

// --- Net (phase2-net: src/Net/NetTasks.h) -----------------------------------------------------------------------
CNetLobby* appNetLobby();                                  // inline at 0x00a8dd80: *(DAT_012711ac + 0xc6c)
CTask* netLobbyTaskSpawn(CTask* parent);                   // CNetLobbyTask::spawn, FUN_006d14e0
bool netLobbyTaskConnectMyRoom(CTask* t);                  // CNetLobbyTask::connectMyRoom, FUN_006d3a50
int32_t netLobbyTaskBusy(CTask* t);                        // inline at 0x00adcda0: CNetLobbyTask::busy (+0x88): 2 done, 3 failed
int32_t netLobbyTaskResult(CTask* t);                      // inline at 0x00adcda0: CNetLobbyTask::result (+0x8c)
CNetLobby* netLobbyTaskLobby(CTask* t);                    // inline at 0x00add920: CNetLobbyTask::lobby (+0x7c)
void netLobbyTaskSendMove(CTask* t, uint32_t pid, uint16_t x, uint16_t y, uint8_t dir, uint8_t b);   // FUN_006d46b0
void netLobbyTaskSend5310(CTask* t, uint32_t pid, uint8_t a, uint8_t b);   // FUN_006d46f0
CTask* connectLobbySpawn(CTask* parent, uint32_t priority);   // CConnectLobby::spawn, FUN_0069dd80
void connectLobbyReset(CTask* t);                          // CConnectLobby::reset, FUN_0069de40
bool connectLobbyGate(CTask* t);                           // CConnectLobby::connectGate, FUN_0069de80
bool connectLobbyLobby(CTask* t, int32_t rgn, int32_t rank, int32_t area);   // connectLobby, FUN_0069deb0
int32_t connectLobbyResult(CTask* t);                      // inline at 0x00add4b0: CConnectLobby::result (+0x70): 2 done, 3 / 4 failed
int32_t randomLobbyArea(uint8_t lang, uint8_t rank);       // FUN_0069df00: -1 if none is listed

// --- Game (the other Game share) -----------------------------------------------------------------------------
uint32_t gameMyPid();                // FUN_00a54ac0: the player's pid (the account's current slot)
int32_t& gameCurrentMap();           // inline at 0x00a8dea0: *(DAT_012bb6b0 + 0x98): the world map the player is on

// --- scenes (CSceneMng::scene() dynamic-cast to the scene's class by the callee) -----------------------------
// CMyRoomScene (MyRoom): a move the player picked (+0xd8 set: rgn +0x12c, rank +0x130, area +0x134), FUN_008250a0.
bool myRoomTakeMove(CSceneTask* s, int32_t* rgn, int32_t* rank, int32_t* area);
void myRoomClearRequests(CSceneTask* s);   // FUN_008250f0
// +0xd9..+0xde: "go to a lobby of rank 0xf / 0x10 / 0x11 / 0x14 / 10 / 8" requests (see CWorldMng::Exit), +0xdf quit.
const uint8_t* myRoomExits(CSceneTask* s);   // inline at 0x00add200
// CAreaMapScene (Game/AreaMap): +0x2d0 back to My Room, +0x2d1..+0x2d6 the same requests as My Room's, +0x2d7 quit.
const uint8_t* areaMapExits(CSceneTask* s);   // inline at 0x00add920
void areaMapReset(CSceneTask* s);          // FUN_009fb080
// CTournamentScene (Tournament): +0x27c quit, +0x27d back to My Room.
const uint8_t* tournamentExits(CSceneTask* s);   // inline at 0x00ae10c0

// --- Gunsling / Tournament: the event managers (each one keeps a global instance) ---------------------------------
CTask* gunsMngSpawn(CTask* parent, uint32_t priority);   // FUN_00996310
void gunsMngStart(CTask* t, int32_t kind);                // FUN_009964e0
CTask* gunsMngInstance();                                 // inline at 0x00adfc50: DAT_012b4af8
int32_t gunsMngState(CTask* t);                           // inline at 0x00adfc50: +0x70: 6 = finished
bool gunsMngFailed(CTask* t);                             // inline at 0x00adfc50: +0x78
CTask* tourMngSpawn(CTask* parent, uint32_t priority);    // FUN_0099ad00
void tourMngStart(CTask* t, int32_t kind);                // FUN_0099aed0
CTask* tourMngInstance();                                 // inline at 0x00ae10c0: DAT_012b4e48
int32_t tourMngState(CTask* t);                           // inline at 0x00ae10c0: +0x9c: 6 = finished
bool tourMngFailed(CTask* t);                             // inline at 0x00ae10c0: +0xa4

// --- duel: CScreenFader (CSceneMng::fader()) ----------------------------------------------------------------------
void screenFaderFadeOut(CElement* fader, int32_t frames, int32_t arg);   // FUN_007dcb00
void screenFaderHide(CElement* fader);                                   // FUN_007dcda0
