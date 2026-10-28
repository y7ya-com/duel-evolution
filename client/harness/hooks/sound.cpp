// src/Sound adapters: the WinSock layer (ygNetWin32.cpp) with the original ABI.
#include "../yo2hook.h"
#include "Sound/ygNetWin32.h"

// Inside yo2.exe the key goes to the exe's own message cipher (0x68b180), which the game's code uses.
static void exeSetCipherKey(const uint8_t* key, int len) {
    using Fn = void(__cdecl*)(const uint8_t*, int);
    reinterpret_cast<Fn>(0x0068b180)(key, len);
}

YO2_HOOK int32_t __cdecl yo2_68a530(int32_t sock, const char* buf, int32_t len) {
    return ygSendAll(static_cast<uint32_t>(sock), buf, len);
}
YO2_HOOK int32_t __cdecl yo2_68b3e0() { return ygNetStartup(exeSetCipherKey); }
YO2_HOOK int32_t __cdecl yo2_68b6c0(const char* host, uint16_t port, YgConn* c) { return ygConnectBlocking(host, port, c); }
YO2_HOOK int32_t __stdcall yo2_68b7e0(const char* host, uint16_t port, YgConn* c, uint32_t notify) {
    return ygConnectStart(host, port, c, notify);
}
