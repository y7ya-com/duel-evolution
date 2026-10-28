// Stand-ins for tests/lobby: window_stubs.h (sprites, text elements, the mouse) plus the Lobby seams
// (yo2LobbyExtern.h) and the Net / CUGDialogBase hooks the windows call. Include once per test executable.
#pragma once
#include <string>
#include <vector>

#include "Lobby/yo2LobbyExtern.h"
#include "Net/NetUi.h"
#include "System/window/yo2UGDialogBase.h"
#include "System/yo2StringDB.h"
#include "System/yo2ZSort.h"
#include "lobby_window_stubs.h"

void windowMouseGetXY(int32_t* x, int32_t* y) { *x = g_mouseX, *y = g_mouseY; }
int g_flushes;
void lobbyMouseFlush() { g_flushes++; }
std::vector<uint32_t> g_sounds;
void appPlaySound(uint32_t id, int32_t) { g_sounds.push_back(id); }

// texts: "T<id in hex>"
struct FakeText : CStringDB {
    vc6::string get(uint32_t i) const override {
        char b[16];
        std::snprintf(b, sizeof b, "T%x", i);
        return b;
    }
};

inline void updateTree(CElement* e) {   // what TM_MAIN does to the matrices, parents first
    e->updateMatrix();
    for (CTask* c : e->children())
        if (auto* ce = dynamic_cast<CElement*>(c)) updateTree(ce);
}

// The window system and a root element, as the game sets them up.
struct LobbyWorld {
    CZSortSet layers;
    FakeText text;
    CElement* root;
    LobbyWorld() {
        g_zsortSet = &layers;
        g_stringDB = &text;
        CWindowTaskFactory::create();
        root = CElement::createRoot();
    }
    ~LobbyWorld() {
        g_windowFactory->destroyAllWindows();
        root->destroy(__FILE__, __LINE__);
        CTask::flushDeleted();
        g_stringDB = nullptr;
    }
};
