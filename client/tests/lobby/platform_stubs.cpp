// Link stand-ins every Lobby test shares (as tests/game/platform_stubs.cpp, with phase2-net's connection hooks):
// CElement pulls in CZSort -> CD3DDevice -> D3D8 (tests/system's fake), CStringDB -> yo2LoadFile.
#include <set>
#include <string>
#include <vector>
#include <windows.h>

#include "../system/d3d8_fake.cpp"
#include "Net/MessageIO.h"
#include "System/yo2File.h"

bool yo2LoadFile(const char*, std::vector<uint8_t>&) { return false; }
std::set<int> g_keysDown;
SHORT GetAsyncKeyState(int vk) { return g_keysDown.count(vk) ? SHORT(0x8000) : 0; }
YgTransport ygSocketTransport(int32_t) { return YgTransport{}; }
void ygSocketClose(int32_t) {}
int32_t ygConnectAsync(const char*, uint16_t, YgConn*, uint32_t) { return -1; }
int32_t ygSocketSelect(int32_t, uint32_t) { return -1; }
