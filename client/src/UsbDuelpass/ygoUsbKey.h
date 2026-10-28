// ygoUsbKey.cpp: the USB DUELPASS key. Konami's MagicKey.dll reads a code off a USB stick; the client stores it here
// (CApp+0xc5c) and the lobby sends it for the USB DUELPASS card gift (LB_REQ_USBDPAUTH, src/Net).
#pragma once
#include <cstdint>

#include "System/vc6.h"

struct YgoUsbKey {
    enum State : int32_t {
        STATE_NONE = 1,   // disabled, unsupported OS, or no stick (MagicKey -1)
        STATE_READ = 2,   // code holds the key's 16 bytes
        STATE_ERROR = 3,  // MagicKey failed (-6..-2, or anything else unexpected)
    };
    void read(bool enabled);

    uint32_t unk00;       // 0x00 not touched here
    int32_t state;        // 0x04 State
    uint8_t code[16];     // 0x08 the DUELPASS code, from offset 0x12 of what MagicKey returns
    uint8_t _18[0x108 - 0x18];
    uint32_t cards[3];    // 0x108 the gift's card ids (CNetUsb 0x8205, src/Net/NetUsb.cpp)
    uint8_t _114[4];
    int32_t cardResult;   // 0x118 0x8205's second byte
};
YO2_AT(YgoUsbKey, state, 0x04);
YO2_AT(YgoUsbKey, code, 0x08);
YO2_AT(YgoUsbKey, cards, 0x108);
YO2_AT(YgoUsbKey, cardResult, 0x118);

// The platform side (src/UsbDuelpass/ygoUsbKeyPlatform.cpp off Windows; harness/hooks/usbduelpass.cpp inside the exe).
struct OsVersion {
    uint32_t platformId;  // VER_PLATFORM_WIN32_WINDOWS = 1, VER_PLATFORM_WIN32_NT = 2
    uint32_t major;
};
OsVersion osVersion();                                  // GetVersionExA
int32_t magicKeyGetDuelPassCode(char* buf, int32_t size);  // MagicKey.dll MagicKeyStatusCode GetDuelPassCode(char*, unsigned) (cdecl): 1 = ok, -1 = no key
