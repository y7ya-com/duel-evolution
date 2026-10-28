// CFBlistManager, CListManager, CUsrDir2 (the exe's src\Lobby\yo2FriendBase.cpp).
#include "yo2FriendBase.h"

#include <algorithm>
#include <cstring>

#include "Net/NetAccount.h"
#include "Net/NetLobby_Social.h"
#include "Net/NetUi.h"

// @yo2 0x0085e540 its static initialiser: empty
// @yo2 0x0085e570 its atexit destructor
vc6::string g_usrDirRoot;

// @yo2 0x0085c610
CUsrDir2::CUsrDir2(vc6::string n) { build(n); }

// @yo2 0x0085c850 CUsrDir2 deleting destructor
// @yo2 0x0085c740 the four strings
CUsrDir2::~CUsrDir2() = default;

// @yo2 0x0085cb70
void CUsrDir2::setUser(vc6::string n) { build(n); }

// @yo2 0x0085e600 <root>\profiles\<name>
void CUsrDir2::build(vc6::string n) {
    root = g_usrDirRoot;
    profiles = root;
    profiles += "\\profiles";
    user = profiles;
    user += "\\";
    user += n;
    name = n;
}

// @yo2 0x0085c460
CListManager::CListManager() : dir("default") { setup("", ""); }

// @yo2 0x0085c880 CListManager deleting destructor
// @yo2 0x0085c8b0 the file name, then the CUsrDir2
CListManager::~CListManager() = default;

// @yo2 0x0085ca10 empty; with an owner and a file, that owner's folders and the file's entries
void CListManager::setup(vc6::string owner, vc6::string file) {
    std::memset(entries, 0, sizeof entries);
    if (!owner.empty() && !file.empty()) {
        dir.setUser(owner);
        fileName = file;
        load();
    }
    recount();
}

static vc6::string listPath(const vc6::string& file) {
    vc6::string p = fblistUserDir();
    p += "\\";
    p += file;
    return p;
}

// @yo2 0x0085cd00
void CListManager::load() {
    std::memset(entries, 0, sizeof entries);
    std::vector<uint8_t> data;
    fblistFileRead(listPath(fileName).c_str(), &data);   // a missing file leaves the list empty
    // fix: the exe copies the whole file over the 26000-byte table, however long it is
    std::memcpy(entries, data.data(), std::min(data.size(), sizeof entries));
}

// @yo2 0x0085cf70
void CListManager::save() { fblistFileWrite(listPath(fileName).c_str(), entries, sizeof entries); }

// @yo2 0x0085d4c0
int CListManager::indexOf(uint32_t pid) {
    for (int i = 0; i < MAX; i++)
        if (entries[i].pid == pid) return i;
    return -1;
}

// @yo2 0x0085d4f0
FBEntry* CListManager::find(uint32_t pid) {
    int i = indexOf(pid);
    return i >= 0 ? &entries[i] : nullptr;
}

// @yo2 0x0085d1a0
bool CListManager::contains(uint32_t pid) { return indexOf(pid) >= 0; }

// @yo2 0x0085d440
void CListManager::recount() {
    count = 0;
    first = -1;
    for (int i = 0; i < MAX; i++) {
        if (entries[i].pid == 0) continue;
        count++;
        if (first == -1) first = i;
    }
    if (first == -1) first = 0;
}

// @yo2 0x0085d1d0 into the first free entry, then sorted and saved. count is the one of the last sort.
bool CListManager::addMember(uint32_t pid, const char* name) {
    if (count > 99) {
        yo2Trace("■ClistManager::AddMember--[%s]登録限界です(%d)\n", name, count);   // full
        return false;
    }
    if (pid == 0) {
        yo2Trace("■ClistManager::AddMember--[%s]PIDが不正です(%d)\n", name, 0);   // bad pid
        return false;
    }
    if (!*name) {
        yo2Trace("■ClistManager::AddMember--[%s]名前が不正です\n", name);   // bad name
        return false;
    }
    if (find(pid)) {
        yo2Trace("■ClistManager::AddMember--[%s]はすでにリストにいます\n", name);   // already there
        return false;
    }
    FBEntry* e = find(0);
    if (!e) {
        yo2Trace("■ClistManager::AddMember--リストに空きがありません\n");   // no free entry
        return false;
    }
    std::memset(e, 0, sizeof *e);
    e->pid = pid;
    std::strncpy(e->name, name, sizeof e->name - 1);   // fix: the exe's strcpy has no bound
    yo2Trace("■ClistManager::AddMember--[PID:%d][%s]をリストに加えました\n", e->pid, name);
    sort();
    save();
    return true;
}

// @yo2 0x0085d360
bool CListManager::delMember(uint32_t pid) {
    if (FBEntry* e = find(pid)) {
        std::memset(e, 0, sizeof *e);
        sort();
        yo2Trace("■ClistManager::DelMember--[PID:%d]をリストから削除しました\n", pid);
        save();
        return true;
    }
    yo2Trace("■ClistManager::DelMember--[PID:%d]該当なし。削除失敗\n", pid);
    return false;
}

static int cmp(const FBEntry& a, const FBEntry& b) { return std::strcmp(a.name, b.name); }

// @yo2 0x0085d530 the larger of the first two different names from i on, -1 if they're all the same
int CListManager::pivot(int i, int j) {
    for (int k = i + 1; k <= j; k++)
        if (int c = cmp(entries[i], entries[k])) return c < 0 ? k : i;
    return -1;
}

// @yo2 0x0085d650 the names below entries[p] to the left; the first index of the right part. The pivot is read
// through its index, so a swap can change it mid-way, as in the exe.
int CListManager::partition(int l, int r, int p) {
    int i = l, j = r;
    if (l > r) return i;
    do {
        while (i <= r && cmp(entries[i], entries[p]) < 0) i++;
        while (l <= j && cmp(entries[j], entries[p]) >= 0) j--;
        if (j < i) return i;
        std::swap(entries[i], entries[j]);
        i++;
        j--;
    } while (i <= j);
    return i;
}

// @yo2 0x0085d830
void CListManager::quicksort(int i, int j) {
    int p;
    while (i != j && (p = pivot(i, j)) != -1) {
        int k = partition(i, j, p);
        quicksort(i, k - 1);
        i = k;
    }
}

// @yo2 0x0085d8a0 by name, free entries first; repeated until a pass finds them in order
void CListManager::sort() {
    for (int passes = 1;; passes++) {
        quicksort(0, MAX - 1);
        bool unsorted = false;
        for (int i = 0; i < MAX - 1; i++)
            if (cmp(entries[i], entries[i + 1]) > 0) unsorted = true;
        YO2_ASSERT(passes <= 99, "Sort too many !\n");
        if (!unsorted) {
            recount();
            yo2Trace("ClistManager::Sort %d回ソートしてデータを整頓しました。\n", passes);   // sorted in n passes
            return;
        }
    }
}

// @yo2 0x0085dac0
CFBlistManager::CFBlistManager() { init(); }

// @yo2 0x0085db50 CFBlistManager deleting destructor
// @yo2 0x0085db80 the two lists
CFBlistManager::~CFBlistManager() = default;

// @yo2 0x0085dbb0 the active character's lists; before a name is known, empty ones
void CFBlistManager::init() {
    CNetAccount* acc = appNetAccount();
    std::string name = playerNameString(acc->me.players[acc->me.activeSlot]);
    if (name.empty()) {
        yo2Trace("プレイヤ名が未確定なのでフレンド＆ブラックデータは仮初期化\n");   // no name yet: provisional
        friends.setup("", "");
        blacks.setup("", "");
        loaded = 0;
    } else {
        yo2Trace("プレイヤ[%s]のフレンド＆ブラックデータを読み込みます\n", name.c_str());   // loading [name]'s lists
        friends.setup(std::string_view(name), "f0001.lst");
        blacks.setup(std::string_view(name), "b0001.lst");
        loaded = 1;
    }
    friendCursor = friends.first;
    blackCursor = blacks.first;
}

static bool nextOf(CListManager& l, int32_t& cursor, FBEntry* out) {
    std::memset(out, 0, sizeof *out);
    for (; cursor <= 99; cursor++) {
        if (*l.entry(cursor)->name) {
            *out = *l.entry(cursor++);
            return true;
        }
    }
    return false;
}

// @yo2 0x0085dfe0 the next named friend from the cursor
bool CFBlistManager::nextFriend(FBEntry* out) { return nextOf(friends, friendCursor, out); }
// @yo2 0x0085e0c0
bool CFBlistManager::nextBlack(FBEntry* out) { return nextOf(blacks, blackCursor, out); }

// @yo2 0x0085e1a0 the i-th friend's pid (0 out of range)
uint32_t CFBlistManager::friendPid(int i) {
    return i >= 0 && i < friends.count ? friends.entry(friends.first + i)->pid : 0;
}
// @yo2 0x0085e1e0
uint32_t CFBlistManager::blackPid(int i) {
    return i >= 0 && i < blacks.count ? blacks.entry(blacks.first + i)->pid : 0;
}

// @yo2 0x0085e220 the i-th friend's name ("" out of range)
vc6::string CFBlistManager::friendName(int i) {
    if (i < 0 || i >= friends.count) return vc6::string();
    return vc6::string(friends.entry(friends.first + i)->name);
}
