// CNetUsb: the USB DUELPASS server's connection (gate entry kind 6): send the stick's key (0x8201), get the check
// result (0x8202) and the gift's card list (0x8205) into the app's YgoUsbKey.
#pragma once
#include "NetAccount.h"

struct CNetUsb : CMessageIOBase {
    void init();                          // FUN_006d59b0 the constructor's body (members: C++'s)
    int32_t connect(const CNetGate* gate);   // FUN_006d5e50
    void sendKey();                       // FUN_006d6090 0x8201
    int32_t onRecv();                     // FUN_006d6010

    uint32_t result;            // 0x534 0x8202
    uint8_t _538[8];
    CMyUser me;                 // 0x540
    CPlayerBinData bin;         // 0x2588

private:
    void onCheckResult();       // FUN_006d6100
    void onCardList();          // FUN_006d6170
};
YO2_AT(CNetUsb, result, 0x534);
YO2_AT(CNetUsb, me, 0x540);
YO2_AT(CNetUsb, bin, 0x2588);
YO2_SIZEOF(CNetUsb, 0x2810);

enum : int { USB_REQ_CHECK = 0x1c, USB_REQ_CARDS = 0x1d, SERVER_USB = 6 };
