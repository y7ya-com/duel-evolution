// yo2FriendBase.cpp: the friend list and the black list (CFBlistManager, *(DAT_012711ac + 0xc50)). Each is a
// CListManager of 100 name-sorted entries kept in an encrypted file per character: f0001.lst / b0001.lst in the
// user's folder. The lobby reads them for MATCHINGSVR (0x3603, friends) and PSELECT (0x4100, the black list).
#pragma once
#include <cstdint>
#include <vector>

#include "System/vc6.h"
#include "System/yo2Debug.h"

// FUN_00618600 on *DAT_012714c4: the current user's folder (<app dir>\<its +0x28>), where the .lst files live.
vc6::string fblistUserDir();
// CCryptFile with the default key (System, 0x0060c780..): Read + GetMemory / size, and Write.
bool fblistFileRead(const char* path, std::vector<uint8_t>* data);
void fblistFileWrite(const char* path, const void* data, uint32_t size);

// DAT_012aeef8: the root CUsrDir2 builds on (static init 0x0085e540: empty; set by whoever knows the app folder).
extern vc6::string g_usrDirRoot;

// CUsrDir2 (0x44): an account's folders.
class CUsrDir2 {
public:
    explicit CUsrDir2(vc6::string name);   // FUN_0085c610
    virtual ~CUsrDir2();                    // FUN_0085c740
    void setUser(vc6::string name);         // FUN_0085cb70
    void build(vc6::string name);           // FUN_0085e600

    vc6::string name;       // 0x04
    vc6::string root;       // 0x14 g_usrDirRoot
    vc6::string profiles;   // 0x24 <root>\profiles
    vc6::string user;       // 0x34 <profiles>\<name>

private:
    struct Layout;
};
struct CUsrDir2::Layout {
    YO2_AT(CUsrDir2, name, 0x04);
    YO2_AT(CUsrDir2, profiles, 0x24);
    YO2_AT(CUsrDir2, user, 0x34);
};
YO2_SIZEOF(CUsrDir2, 0x44);

struct FBEntry {          // 0x104, what the .lst file holds 100 of
    char name[0x14];      // 0x00 sort key; "" = free
    uint32_t pid;         // 0x14 0 = free
    uint8_t _18[0xec];
};
static_assert(sizeof(FBEntry) == 0x104, "FBEntry size");

// CListManager (0x65f0, "ClistManager" in its log lines).
class CListManager {
public:
    enum { MAX = 100 };
    CListManager();                                       // FUN_0085c460
    virtual ~CListManager();                              // FUN_0085c8b0
    void setup(vc6::string owner, vc6::string file);      // FUN_0085ca10
    void load();                                          // FUN_0085cd00
    void save();                                          // FUN_0085cf70
    bool contains(uint32_t pid);                          // FUN_0085d1a0
    bool addMember(uint32_t pid, const char* name);       // FUN_0085d1d0
    bool delMember(uint32_t pid);                         // FUN_0085d360
    FBEntry* entry(int i) { return &entries[i]; }         // @yo2 0x0085d410
    void recount();                                       // FUN_0085d440
    int indexOf(uint32_t pid);                            // FUN_0085d4c0
    FBEntry* find(uint32_t pid);                          // FUN_0085d4f0
    void sort();                                          // FUN_0085d8a0

    CUsrDir2 dir;             // 0x04
    vc6::string fileName;     // 0x48 "f0001.lst" / "b0001.lst"
    FBEntry entries[MAX];     // 0x58
    int32_t count = 0;        // 0x65e8 entries with a pid
    int32_t first = 0;        // 0x65ec index of the first of them (they sort after the free ones)

private:
    int pivot(int i, int j);                  // FUN_0085d530
    int partition(int l, int r, int p);       // FUN_0085d650
    void quicksort(int i, int j);             // FUN_0085d830
    struct Layout;
};
struct CListManager::Layout {
    YO2_AT(CListManager, dir, 0x04);
    YO2_AT(CListManager, fileName, 0x48);
    YO2_AT(CListManager, entries, 0x58);
    YO2_AT(CListManager, count, 0x65e8);
    YO2_AT(CListManager, first, 0x65ec);
};
YO2_SIZEOF(CListManager, 0x65f0);

// CFBlistManager (0xcbf0): friends and black list of the active character.
class CFBlistManager {
public:
    CFBlistManager();                          // FUN_0085dac0
    virtual ~CFBlistManager();                 // FUN_0085db80
    void init();                               // FUN_0085dbb0 (re)load for the active character
    bool nextFriend(FBEntry* out);             // FUN_0085dfe0
    bool nextBlack(FBEntry* out);              // FUN_0085e0c0
    uint32_t friendPid(int i);                 // FUN_0085e1a0
    uint32_t blackPid(int i);                  // FUN_0085e1e0
    vc6::string friendName(int i);             // FUN_0085e220

    CListManager friends;       // 0x04
    CListManager blacks;        // 0x65f4
    int32_t friendCursor = 0;   // 0xcbe4 nextFriend's position
    int32_t blackCursor = 0;    // 0xcbe8
    uint8_t loaded = 0;         // 0xcbec 1 = a character's files are loaded

private:
    struct Layout;
};
struct CFBlistManager::Layout {
    YO2_AT(CFBlistManager, friends, 0x04);
    YO2_AT(CFBlistManager, blacks, 0x65f4);
    YO2_AT(CFBlistManager, friendCursor, 0xcbe4);
    YO2_AT(CFBlistManager, loaded, 0xcbec);
};
YO2_SIZEOF(CFBlistManager, 0xcbf0);
