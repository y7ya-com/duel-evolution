// yo2DuelScene.cpp's globals and the match bookkeeping (SceneDuelScene.cpp).
#pragma once
#include "SceneCommon.h"

namespace ds {

#if YO2_IN_EXE
#define g_duelStamp YO2_EXE_VAR(uint32_t, 0x012a9074)
#define g_duelV78 YO2_EXE_VAR(int32_t, 0x012a9078)
#define g_duelStartTime YO2_EXE_VAR(int32_t, 0x012a9080)
#define g_matchGames YO2_EXE_VAR(uint8_t, 0x012a9088)
#define g_matchGame YO2_EXE_ARR(uint8_t, 0x012a908b)
#define g_matchEndMode YO2_EXE_VAR(int32_t, 0x012a9090)
#define g_fieldSpell YO2_EXE_VAR(int32_t, 0x012a9098)
#define g_duelV90a8 YO2_EXE_VAR(int32_t, 0x012a90a8)
#define g_sideJudge YO2_EXE_ARR(int32_t, 0x012a90bc)
#define g_matchResult YO2_EXE_VAR(int32_t, 0x00cd82d0)
#else
extern uint32_t g_duelStamp;        // DAT_012a9074 the system tick the duel started at (FUN_006071f0)
extern int32_t g_duelV78;           // DAT_012a9078
extern int32_t g_duelStartTime;     // DAT_012a9080 time(0) at the start
extern uint8_t g_matchGames;        // DAT_012a9088 games started in this match (1..3)
extern uint8_t g_matchGame[4];      // DAT_012a908b: [n] = result of game n (1-based: 1 won, 2 lost, 3 draw)
extern int32_t g_matchEndMode;      // DAT_012a9090 5 = the match ended by its own rule (keep the last result)
extern int32_t g_fieldSpell;        // DAT_012a9098 the field spell shown (picks the BGM)
extern int32_t g_duelV90a8;         // DAT_012a90a8
extern int32_t g_sideJudge[2];      // DAT_012a90bc
extern int32_t g_matchResult;       // DAT_00cd82d0: 1 won, 2 lost, 3 draw (-1 = none yet)
#endif

void duelSetV90a8(int32_t v);                  // FUN_00794a70
void matchRecordGame(int32_t result);          // FUN_00794a90
void matchSetEndMode(int32_t v);               // FUN_00794bd0
void duelPickBgm();                            // FUN_00794cd0
int32_t duelStart(int32_t mode);               // FUN_00794d90
void duelSideJudge(int32_t j, int32_t v);      // FUN_00794ec0
void duelJudgeLp();                            // FUN_00794f10
uint32_t fieldBgm(int32_t kind);               // FUN_00794f10's switch
bool sceneAnyBusy();                           // FUN_00790610
void sceneSet1968(int32_t v);                  // FUN_00790690
void sceneClear1974();                         // FUN_007906c0
uint32_t duelStartStamp();                     // FUN_007906e0
void sceneRefreshField();                      // FUN_00790740
void sceneMakeDuelList(uint32_t a, uint32_t b);   // FUN_00790e50
void ndMatchRecordGame(int32_t result);        // FUN_00790590
void ndMatchSetEndMode(int32_t v);             // FUN_007905d0
void ndJudgeLp();                              // FUN_007905f0

}   // namespace ds
