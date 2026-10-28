// src/Lobby/yo2FriendBase.cpp: CListManager (add / delete / the quicksort / count), CFBlistManager (the two files
// per character, the cursors and getters) against an in-memory "disk".
#include <algorithm>
#include <cstring>
#include <map>
#include <random>
#include <string>
#include <vector>

#include "Lobby/yo2FriendBase.h"
#include "Net/NetAccount.h"
#include "lobby_test.h"

static std::map<std::string, std::vector<uint8_t>> g_disk;
static int g_writes;
vc6::string fblistUserDir() { return "C:\\yo2\\user"; }
bool fblistFileRead(const char* path, std::vector<uint8_t>* data) {
    auto it = g_disk.find(path);
    if (it == g_disk.end()) return false;
    *data = it->second;
    return true;
}
void fblistFileWrite(const char* path, const void* data, uint32_t size) {
    g_writes++;
    g_disk[path].assign((const uint8_t*)data, (const uint8_t*)data + size);
}
static CNetAccount g_acc;
CNetAccount* appNetAccount() { return &g_acc; }
// FUN_006bcc30 (src/Net/NetLobby_Social.cpp): a stand-in so the test doesn't pull the lobby's message code
std::string playerNameString(const CPlayerInfo& p) { return std::string(p.name); }

static bool sortedByName(CListManager& l) {
    for (int i = 0; i + 1 < CListManager::MAX; i++)
        if (std::strcmp(l.entries[i].name, l.entries[i + 1].name) > 0) return false;
    return true;
}

int main() {
    g_usrDirRoot = "C:\\yo2";
    CUsrDir2 d("Kaiba");
    CHECK(d.name == "Kaiba" && d.root == "C:\\yo2" && d.profiles == "C:\\yo2\\profiles" &&
          d.user == "C:\\yo2\\profiles\\Kaiba");

    // no name yet: both lists empty, nothing read
    CFBlistManager fb;
    CHECK(fb.loaded == 0 && fb.friends.count == 0 && fb.friends.first == 0 && fb.blacks.dir.name == "default");
    FBEntry e;
    CHECK(!fb.nextFriend(&e) && fb.friendPid(0) == 0 && fb.friendName(0).empty());

    // a character: f0001.lst / b0001.lst in the user folder
    std::strcpy(g_acc.me.players[0].name, "Yugi");
    g_acc.me.activeSlot = 0;
    fb.init();
    CHECK(fb.loaded == 1 && fb.friends.fileName == "f0001.lst" && fb.blacks.fileName == "b0001.lst");
    CHECK(fb.friends.dir.user == "C:\\yo2\\profiles\\Yugi");

    CListManager& f = fb.friends;
    CHECK(f.addMember(1002, "Mai"));
    CHECK(f.addMember(1001, "Joey"));
    CHECK(f.addMember(1003, "Bakura"));
    CHECK(!f.addMember(1001, "Joey") && !f.addMember(0, "Zero") && !f.addMember(1004, ""));
    CHECK(f.count == 3 && f.first == 97 && sortedByName(f));   // free entries ("") sort first
    CHECK(fb.friendPid(0) == 1003 && fb.friendPid(1) == 1001 && fb.friendPid(2) == 1002 && fb.friendPid(3) == 0);
    CHECK(fb.friendName(1) == "Joey" && f.contains(1002) && !f.contains(9));
    CHECK(g_disk.count("C:\\yo2\\user\\f0001.lst") && g_disk["C:\\yo2\\user\\f0001.lst"].size() == 26000);

    // the cursor walks the named entries once, from where init() put it
    fb.friendCursor = f.first;
    std::vector<uint32_t> seen;
    while (fb.nextFriend(&e)) seen.push_back(e.pid);
    CHECK((seen == std::vector<uint32_t>{1003, 1001, 1002}) && fb.friendCursor == 100);

    CHECK(f.delMember(1001) && !f.delMember(1001));
    CHECK(f.count == 2 && fb.friendPid(1) == 1002 && sortedByName(f));

    // the black list is its own file; a reload reads both back
    CHECK(fb.blacks.addMember(2001, "Marik"));
    fb.init();
    CHECK(fb.friends.count == 2 && fb.blacks.count == 1 && fb.blackPid(0) == 2001 && fb.blackCursor == 99);
    CHECK(fb.friendName(0) == "Bakura" && fb.friendName(1) == "Mai");

    // 100 random names (with repeats): one sort orders them; the quicksort agrees with std::sort
    std::mt19937 rng(7);
    CListManager big;
    for (int i = 0; i < CListManager::MAX; i++) {
        std::snprintf(big.entries[i].name, sizeof big.entries[i].name, "n%03u", unsigned(rng() % 60));
        big.entries[i].pid = 5000 + i;
    }
    std::vector<std::string> want;
    for (FBEntry& x : big.entries) want.push_back(x.name);
    std::sort(want.begin(), want.end());
    big.sort();
    for (int i = 0; i < CListManager::MAX; i++) CHECK(want[i] == big.entries[i].name);
    CHECK(big.count == 100 && big.first == 0);

    // full: the "limit" check uses the count of the last sort; with no free entry adding fails anyway
    CHECK(!big.addMember(9999, "late") && big.count == 100);
    std::printf("ok: friendbase (CUsrDir2 paths, CListManager add/del/sort, CFBlistManager files and getters)\n");
}
