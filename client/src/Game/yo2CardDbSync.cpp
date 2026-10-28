// The object after yo2PlayerBin.cpp (0x00ad6dc0..0x00ad7f10): the lobby's trunk copied into the card case.
#include "Net/NetLobby_Shop.h"
#include "System/yo2KabanManager.h"

// @yo2 0x00ad7d80 cardDbSyncTrunk: for card i + 1, flag = the last complete trunk, count = trunk2; then saved.
// ponytail: the exe holds the named mutex "Yu-Gi-Oh! Power of Chaos!!" around it (another process can share
// kaban.bin); one process here, so no lock.
void cardDbSyncTrunk(const CMyUser& me) {
    for (uint32_t i = 0; i < TRUNK_BYTES; i++) {
        CKabanManager::Entry& e = g_kabanManager->entry(i + 1);
        e.flag = me.trunk[i];
        e.count = me.trunk2[i];
    }
    g_kabanManager->save();
}
