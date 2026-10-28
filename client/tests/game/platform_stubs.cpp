// Link stand-ins every Game test shares. CElement pulls in CZSort -> CD3DDevice -> D3D8 (tests/system's fake) and
// CStringDB -> yo2LoadFile (served from the Game file provider).
#include <string>
#include <vector>

#include "../system/d3d8_fake.cpp"
#include "Game/yo2GameData.h"
#include "System/yo2File.h"

bool yo2LoadFile(const char* name, std::vector<uint8_t>& out) {
    std::string b;
    if (!gameReadFile(name, &b))
        return false;
    out.assign(b.begin(), b.end());
    return true;
}

// Win32 input: the keys a test holds down (GetAsyncKeyState's high bit).
#include <set>
#include <windows.h>
std::set<int> g_keysDown;
SHORT GetAsyncKeyState(int vk) { return g_keysDown.count(vk) ? SHORT(0x8000) : 0; }

// The three platform hooks src/Net's connection layer needs (MessageIO.h). Game tests never open a connection;
// they link Net only for its data classes (CPlayerBinData), whose object file also holds CNetAccount.
#include "Net/MessageIO.h"

YgTransport ygSocketTransport(int32_t) { return YgTransport{}; }
void ygSocketClose(int32_t) {}
int32_t ygConnectAsync(const char*, uint16_t, YgConn*, uint32_t) { return 0; }
int32_t ygSocketSelect(int32_t, uint32_t) { return 0; }
