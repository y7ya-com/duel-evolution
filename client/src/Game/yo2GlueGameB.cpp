// yo2GlueGameB.cpp: the names other folders gave to functions at game-b's addresses (0x00a60000..0x00b3ffff), forwarded
// to the real ones; the CRT's (0x00b08000..) go to the platform's CRT. When a caller switches to the real header,
// delete its line.
#include <sys/stat.h>
#ifdef _WIN32
#include <direct.h>
#endif

#include "Deck/DeckUtil.h"
#include "Deck/TpEntry.h"
#include "Net/NetAccount.h"
#include "Net/NetUi.h"

// src/Deck (TpEntry.cpp): the account's PBIN, *(DAT_012711ac + 0xc68) + 0x3264
// 0x00ad6a90
bool pbinTest(uint32_t bit) { return appNetAccount()->bin.flag(bit); }
// 0x00ad6900
void pbinSet(uint32_t bit, bool on) { appNetAccount()->bin.setFlag(bit, on); }

// src/Deck (DeckUtil.cpp)
namespace dk {
// 0x00b0bdc8 CRT _stat
bool fileStat(const char* path) {
    struct stat st;
    return stat(path, &st) != -1;
}
}   // namespace dk

// src/System (yo2SystemConfig.cpp, declared in its yo2SystemConfig.h)
void yo2MakeDirectory(const char* path);
// 0x00b0c5f5 CRT _mkdir; the exe ignores the result
void yo2MakeDirectory(const char* path) {
#ifdef _WIN32
    _mkdir(path);
#else
    mkdir(path, 0777);
#endif
}
