// src/Game/yo2CardDbSync.cpp: cardDbSyncTrunk over a real CKabanManager; the save is recorded.
#include <memory>

#include "Net/NetLobby_Shop.h"
#include "System/yo2File.h"
#include "System/yo2KabanManager.h"
#include "game_test.h"

static int g_saves;
static size_t g_saved;
bool yo2SaveFile(const char*, const void*, size_t size) {
    g_saves++;
    g_saved = size;
    return true;
}

int main() {
    CKabanManager::create();
    auto me = std::make_unique<CMyUser>();
    me->trunk[0] = 3, me->trunk2[0] = 1;
    me->trunk[TRUNK_BYTES - 1] = 2, me->trunk2[TRUNK_BYTES - 1] = 5;
    g_kabanManager->entry(TRUNK_BYTES + 1).flag = 9;   // past the trunk: untouched
    cardDbSyncTrunk(*me);
    CHECK(g_kabanManager->entry(1).flag == 3 && g_kabanManager->entry(1).count == 1);
    CHECK(g_kabanManager->entry(TRUNK_BYTES).flag == 2 && g_kabanManager->entry(TRUNK_BYTES).count == 5);
    CHECK(g_kabanManager->entry(2).flag == 0 && g_kabanManager->entry(TRUNK_BYTES + 1).flag == 9);
    CHECK(g_saves == 1 && g_saved == 0x3000);
    delete g_kabanManager;
    std::puts("gameb_cardsync: ok");
}
