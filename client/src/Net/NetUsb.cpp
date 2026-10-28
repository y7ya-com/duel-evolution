// CNetUsb (the exe's src\Net\yo2NetUsb.cpp).
#include "NetUsb.h"

#include <cstring>

#include "NetUi.h"
#include "UsbDuelpass/ygoUsbKey.h"

// @yo2 0x006d59b0 CNetUsb::CNetUsb: the base, its own account record (players cleared, defaults), the PBIN copy
void CNetUsb::init() {
    CMessageIOBase::init();
    result = 0;
    for (CPlayerInfo& p : me.players) p = CPlayerInfo();
    bin = CPlayerBinData();
}

// @yo2 0x006d5d60 CNetUsb deleting destructor
// @yo2 0x006d5d90 CNetUsb::~CNetUsb: the implicit one (the four CPlayerInfo, then the base)

// @yo2 0x006d5fd0 the gate list's USB server (kind 6)
static const CServerInfo* findUsbServer(const CServerList& l) {
    for (const CServerInfo& e : l)
        if (e.kind == SERVER_USB) return &e;
    return nullptr;
}

// @yo2 0x006d5e50
int32_t CNetUsb::connect(const CNetGate* gate) {
    if (!gate) return YG_NO_GATE;
    const CServerList* l = gate->list();
    const CServerInfo* e = l ? findUsbServer(*l) : nullptr;   // fix: the exe reads a null list mid-update
    if (!e) return YG_NO_SERVER;
    strncpy(host, e->address(), sizeof host - 1);
    port = e->port;
    return CMessageIOBase::connect();
}

// @yo2 0x006d6090 YG_MSG_USBCHECK: the key's 16 bytes
void CNetUsb::sendKey() {
    ygBegin(&out, 0x8201);
    ygPutBytes(&out, appUsbKey()->code, 0x10);
    ygEnd(&out);
    send();
    flag(USB_REQ_CHECK) = 1;
}

// @yo2 0x006d6010
int32_t CNetUsb::onRecv() {
    YgPacket* p = in();
    if (!p) return YG_BAD_ARGS;
    if (p->id == 0x8202) onCheckResult();
    else if (p->id == 0x8205) onCardList();
    return 0;
}

// @yo2 0x006d6100 YG_MSG_USBCHECKRESULT: u32 result
void CNetUsb::onCheckResult() {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGet32(p, &result);
    ygEndRead(p);
    flag(USB_REQ_CHECK) = 2;
}

// @yo2 0x006d6170 YG_MSG_USBGETCARDLIST: u8 failed, s8 result, 3 x u16 card; on success the key keeps them
void CNetUsb::onCardList() {
    YgPacket* p = in();
    uint8_t failed = 0;
    int8_t r = 0;
    uint16_t c[3] = {};
    ygBeginRead(p);
    ygGet8(p, &failed);
    ygGet8(p, reinterpret_cast<uint8_t*>(&r));
    for (uint16_t& x : c) ygGet16(p, &x);
    ygEndRead(p);
    if (failed == 0) {
        YgoUsbKey* k = appUsbKey();
        for (int i = 0; i < 3; i++) k->cards[i] = c[i];
        k->cardResult = r;
    }
    flag(USB_REQ_CARDS) = 2;
}
