// Link stand-ins the tests/lobby executables share: the D3D8 fake under CZSort / CD3DDevice, file loading for
// CStringDB, and Net's three platform hooks (the tests link Net only for its data classes).
#include <string>
#include <vector>

#include "../system/d3d8_fake.cpp"
#include "Net/MessageIO.h"
#include "System/yo2File.h"

bool yo2LoadFile(const char*, std::vector<uint8_t>&) { return false; }
YgTransport ygSocketTransport(int32_t) { return YgTransport{}; }
void ygSocketClose(int32_t) {}
int32_t ygConnectAsync(const char*, uint16_t, YgConn*, uint32_t) { return -1; }
int32_t ygSocketSelect(int32_t, uint32_t) { return -1; }

// Win32 input (window_stubs.h's GetKeyState reads g_keysDown too).
#include <set>
#include <windows.h>
std::set<int> g_keysDown;
SHORT GetAsyncKeyState(int vk) { return g_keysDown.count(vk) ? SHORT(0x8000) : 0; }
