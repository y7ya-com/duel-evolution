#pragma once
#include <string>
#include <vector>

#include "System/yo2Element.h"
#include "title/titleExt.h"

extern std::vector<std::string> g_log;
void logf(const char* fmt, ...);
std::string elmName(const CTask* t);

struct FakeDialog : CElement {
    int32_t result = 0;
};
extern CTask* g_world;          // null: no world UI yet
extern int32_t g_language;
extern CElement* g_swf;
extern bool g_swfFinished;
extern const CTaskPtrBase* g_destroyedPtr;
extern FakeDialog* g_lastDialog;
extern CElement* g_lastOption;
extern CNetLobby* g_lobby;
// world windows
extern CElement *g_menu, *g_chat, *g_place, *g_duelConfig;
extern CTask* g_duelAva;

struct SwfEvent : CTaskMessage {
    SwfEvent(const char* n, bool c) : CTaskMessage(0x13), name(n), clicked(c) {}
    std::string name;
    bool clicked;
};
