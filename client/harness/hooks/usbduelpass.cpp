// src/UsbDuelpass adapters, plus its two platform calls inside the exe: GetVersionExA directly, and MagicKey.dll's
// GetDuelPassCode through the exe's own import slot (the DLL doesn't link MagicKey).
#include <windows.h>

#include <cstring>

#include "../yo2hook.h"
#include "UsbDuelpass/ygoUsbKey.h"

OsVersion osVersion() {
    OSVERSIONINFOA v;
    std::memset(&v, 0, sizeof v);
    v.dwOSVersionInfoSize = sizeof v;
    GetVersionExA(&v);
    return {v.dwPlatformId, v.dwMajorVersion};
}

int32_t magicKeyGetDuelPassCode(char* buf, int32_t size) {
    using Fn = int32_t(__cdecl*)(char*, int32_t);
    return (*reinterpret_cast<Fn*>(0x012d5e8c))(buf, size);  // yo2.exe IAT: MagicKey.dll!GetDuelPassCode
}

YO2_HOOK void __thiscall yo2_8cdc70(YgoUsbKey* self, uint8_t enabled) { self->read(enabled != 0); }
