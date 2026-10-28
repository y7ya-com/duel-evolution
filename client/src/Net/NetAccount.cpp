#include "NetAccount.h"

#include <cstring>
#include <new>

// @yo2 0x0063bfd0 CPlayerInfo::CPlayerInfo (the avatars' own constructors set their default)
// @yo2 0x0063c2d0 CPlayerInfo::~CPlayerInfo: the implicit one (the team-name string, then the avatars)
// ponytail: the exe leaves some text (comment, title, team) uninitialised until LIST3..5 arrive; zeroed here, with
// everything but the avatars
CPlayerInfo::CPlayerInfo() {
    char* self = reinterpret_cast<char*>(this);
    char* av = reinterpret_cast<char*>(avatar);
    memset(self, 0, av - self);
    memset(av + sizeof avatar, 0, sizeof *this - (av + sizeof avatar - self));
    playerReset(this);
}

void playerReset(CPlayerInfo* p) {
    p->valid = 0;
    memset(p->_005 + 3, 0, 4);                       // +0x08
    memset(p->name, 0, 16);
    p->name[16] = 0;
    memset(p->_021, 0, sizeof p->_021);
    memset(p->duelName, 0, 24);                      // +0x162..+0x179
    p->level = 0;
    p->u0a8 = p->mp = 0;
    memset(p->w0b0, 0, sizeof p->w0b0);
    p->u0d0 = 0;
    memset(p->w0d4, 0, sizeof p->w0d4);
    memset(p->u0d8, 0, sizeof p->u0d8);
    memset(p->w0e0, 0, sizeof p->w0e0);
    memset(p->u0ec, 0, sizeof p->u0ec);
    memset(p->w104, 0, sizeof p->w104);
    p->u10c = 0;
    p->w110 = p->titleId = p->w114 = p->w116 = 0;
    p->b118 = p->b119 = 0;
    memset(p->u11c, 0, sizeof p->u11c);
    memset(p->country, 0, sizeof p->country);
    p->state = 0;
    p->block = 0xff;
    p->x = p->y = 0;
    p->dir = 0;
    p->teamId = 0;
    p->teamCodeNum = 0;
}

// @yo2 0x0068e040 constructor
void CNetAccount::init() {
    memset((void*)this, 0, sizeof *this);
    for (CPlayerInfo& p : me.players) new (&p) CPlayerInfo;   // the eh-vector constructor of the four slots
}

// @yo2 0x006a5bc0
CPlayerInfo* CMyUser::player(int slot) { return slot >= 0 && slot < 4 ? &players[slot] : nullptr; }

// @yo2 0x00ad6a90 PBIN flag (bit 7 of byte 0 = flag 7); the exe asserts past 1024 bits
bool CPlayerBinData::flag(uint32_t bit) const {
    if (bit >> 3 > 0x7f) return false;   // fix: the exe reads past pbin after the assert
    return pbin[bit >> 3] >> (bit & 7) & 1;
}

// @yo2 0x00ad6900 set a PBIN flag; "off" XORs the bit, so it toggles (as in the exe)
void CPlayerBinData::setFlag(uint32_t bit, bool on) {
    if (bit >> 3 > 0x7f) return;         // fix: the exe writes past pbin after the assert
    uint8_t m = (uint8_t)(1 << (bit & 7));
    pbin[bit >> 3] = on ? pbin[bit >> 3] | m : pbin[bit >> 3] ^ m;
}

// @yo2 0x00ad6d10 4-byte record (an NPC's entry, an item count): little-endian u32 at npcBin[id * 4]
uint32_t CPlayerBinData::item(uint32_t id) const {
    if (id >= sizeof npcBin / 4) return 0;   // fix: no bound in the exe
    const uint8_t* p = npcBin + id * 4;
    return p[0] | p[1] << 8 | p[2] << 16 | (uint32_t)p[3] << 24;
}

// @yo2 0x00ad6d80
void CPlayerBinData::setItem(uint32_t id, uint32_t v) {
    if (id >= sizeof npcBin / 4) return;   // fix: no bound in the exe
    for (int i = 0; i < 4; i++) npcBin[id * 4 + i] = (uint8_t)(v >> 8 * i);
}

// @yo2 0x00642120
void CMyUser::setUser(const char* s) {
    strncpy(user, s ? s : "", sizeof user - 1);   // fix: the exe's strcpy runs past 16 characters
    user[16] = 0;
}

// @yo2 0x006421a0
void CMyUser::setPassword(const char* s) {
    strncpy(password, s ? s : "", sizeof password - 1);   // fix: same unbounded strcpy
    password[16] = 0;
}

// @yo2 0x0068e470 forget the login and the characters (the region from 0x3004 stays)
void CMyUser::clear() {
    for (CPlayerInfo& p : players) playerReset(&p);
    u04 = 0;
    memset(user, 0, sizeof user);
    memset(password, 0, sizeof password);
    memset(trunk, 0, sizeof trunk);
    memset(trunk2, 0, sizeof trunk2);
    activeSlot = 0;
    u2c = 0;
}

// @yo2 0x0068e8d0 connect to the gate's account server
int32_t CNetAccount::connect(const CNetGate* gate) {
    _545[0] = 0;
    memset(challenge, 0, 16);
    authResult = 0;
    authFlags = 0;
    if (!gate) return YG_NO_GATE;
    const CServerList* l = gate->list();
    const CServerInfo* e = l ? findAccountServer(*l) : nullptr;   // fix: the original reads a null list mid-update
    if (!e) return YG_NO_SERVER;
    strncpy(host, e->address(), sizeof host - 1);
    port = e->port;
    return CMessageIOBase::connect();
}

// @yo2 0x0068ef90 0x3001 hello (asks for the challenge)
void CNetAccount::sendHello() {
    ygBegin(&out, 0x3001);
    ygEnd(&out);
    send();
    flag(ACC_REQ_HELLO) = 1;
}

void buildLogin(YgPacket* out, const char* user, const char* password, const uint8_t challenge[16]) {
    uint8_t buf[16 + 16 + 16], digest[16];
    size_t nu = strlen(user), np = strlen(password);
    memcpy(buf, user, nu);
    memcpy(buf + nu, challenge, 16);
    memcpy(buf + nu + 16, password, np);
    ygMd5(buf, (int)(nu + 16 + np), digest);
    ygBegin(out, 0x3003);
    ygPutBytes(out, user, 16);     // the whole 16-byte field: whatever follows the NUL goes too
    ygPutBytes(out, digest, 16);
    ygEnd(out);
    ygCipher(out, 0);
}

// @yo2 0x0068efd0 0x3003 login
void CNetAccount::sendAuth() {
    buildLogin(&out, me.user, me.password, challenge);
    send();
    flag(ACC_REQ_AUTH) = 1;
}

// @yo2 0x0068f150 0x3010
void CNetAccount::reqPlayerList() {
    ygBegin(&out, 0x3010);
    ygEnd(&out);
    send();
    flag(ACC_REQ_PLAYERLIST) = 1;
}

// @yo2 0x0068f190 0x3020 create a character: u8 slot, 16 B name, u8 0
void CNetAccount::reqRegPlayer(int8_t slot) {
    if (slot < 0 || slot >= 4) return;
    ygBegin(&out, 0x3020);
    ygPut8(&out, slot);
    ygPutBytes(&out, me.players[slot].name, 16);
    ygPut8(&out, 0);
    ygEnd(&out);
    send();
    flag(ACC_REQ_REGPLAYER) = 1;
}

static void slotRequest(CNetAccount* a, int32_t id, int8_t slot, int req) {
    if (slot < 0 || slot >= 4) return;
    ygBegin(&a->out, id);
    ygPut8(&a->out, slot);
    ygEnd(&a->out);
    a->send();
    a->flag(req) = 1;
}

// @yo2 0x0068f250 0x3030 delete a character
void CNetAccount::reqDelPlayer(int8_t slot) { slotRequest(this, 0x3030, slot, ACC_REQ_DELPLAYER); }

// @yo2 0x0068f2c0 0x3100 YG_MSG_GETTRUNK
void CNetAccount::reqTrunk(int8_t slot) { slotRequest(this, 0x3100, slot, ACC_REQ_TRUNK); }

// @yo2 0x0068f340 0x3114 YG_MSG_GETPBIN
void CNetAccount::reqPbin(int8_t slot) { slotRequest(this, 0x3114, slot, ACC_REQ_PBIN); }

// @yo2 0x0068f3c0 0x3110 YG_MSG_DUELPASSPURCHASE
void CNetAccount::reqDuelPassPurchase() {
    ygBegin(&out, 0x3110);
    ygEnd(&out);
    send();
    flag(ACC_REQ_DPPURCHASE) = 1;
}

// @yo2 0x0068eca0 account message handler
int32_t CNetAccount::onRecv() {
    YgPacket* p = in();
    if (!p) return YG_BAD_ARGS;
    switch (p->id) {
    case 0x3002: onChallenge(); break;
    case 0x3004: onAuthResult(); break;
    case 0x3012: onPlayerList(); break;
    case 0x3022: onRegPlayerResult(); break;
    case 0x3032: onDelPlayerResult(); break;
    case 0x3101:   // YG_MSG_TRUNKDATASTART
        trunkChunk = 0;
        memset(trunkIn, 0, sizeof trunkIn);
        break;
    case 0x3102:   // YG_MSG_TRUNKDATA
        onTrunkData();
        trunkChunk++;
        break;
    case 0x3103:   // YG_MSG_TRUNKDATAEND
        memcpy(me.trunk, trunkIn, TRUNK_BYTES);
        flag(ACC_REQ_TRUNK) = 2;
        break;
    case 0x3111: onDuelPassPurchase(); break;
    case 0x3114: onPbin(); break;
    case 0x4234: onNpcBin(); break;
    }
    return YG_OK;
}

// @yo2 0x0068f430 0x3002 YG_MSG_CHALLENGE: 16 B (the receive buffer is zeroed, so an empty one reads as zeroes)
void CNetAccount::onChallenge() {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGetBytes(p, challenge, 16);
    ygEndRead(p);
    flag(ACC_REQ_HELLO) = 2;
}

// @yo2 0x0068f480 0x3004 YG_MSG_AUTHRESULT: s32 result; if 0, u32 flags + 4 B region
void CNetAccount::onAuthResult() {
    YgPacket* p = in();
    char r[5] = {};   // the original copies this stack buffer even when the result is an error
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&authResult);
    if (authResult == 0) {
        ygGet32(p, &authFlags);
        ygGetBytes(p, r, 4);
    }
    ygEndRead(p);
    memcpy(me.region, r, 4);
    me.region5 = r[4];
    flag(ACC_REQ_AUTH) = 2;
}

// @yo2 0x0068f520 0x3012 YG_MSG_PLAYERLIST
void CNetAccount::onPlayerList() {
    YgPacket* p = in();
    for (CPlayerInfo& pd : me.players) playerReset(&pd);
    uint32_t result;
    ygBeginRead(p);
    ygGet32(p, &result);
    for (int i = 0; result == 0 && i < 4 && ygReadPos(p) != -1; i++) {
        uint8_t slot, level, raw[17];
        char name[17];
        uint32_t v;
        uint16_t w;
        ygGet8(p, &slot);
        CPlayerInfo scratch;
        CPlayerInfo* r = slot < 4 ? &me.players[slot] : &scratch;   // fix: the original writes through a null record
        ygGetBytes(p, name, 16);
        strcpy(r->name, name);
        ygGet8(p, &level); r->level = level;
        ygGet32(p, &v); r->u0a8 = v;
        ygGet32(p, &v); r->u11c[2] = v;
        ygGet32(p, &v); r->u11c[3] = v;
        ygGet16(p, &w); r->titleId = w;
        ygGet32(p, &v); r->mp = v;
        ygGet16(p, &w); r->w0b0[0] = w;
        ygGet16(p, &w); r->w0b0[1] = w;
        ygGet16(p, &w); r->w0b0[5] = w;
        ygGet16(p, &w); r->w0b0[4] = w;
        ygGetBytes(p, raw, 16); memcpy(r->avatar[0].bytes_, raw, 16);
        ygGetBytes(p, raw, 16); memcpy(r->avatar[1].bytes_, raw, 16);
        r->valid = 1;
    }
    ygEndRead(p);
    flag(ACC_REQ_PLAYERLIST) = 2;
}

static void readResult(CNetAccount* a, int32_t* dst, int req) {
    YgPacket* p = a->in();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)dst);
    ygEndRead(p);
    a->flag(req) = 2;
}

// @yo2 0x0068fa10 0x3022 YG_MSG_REGPLAYERRESULT
void CNetAccount::onRegPlayerResult() { readResult(this, &regResult, ACC_REQ_REGPLAYER); }

// @yo2 0x0068fa50 0x3032 YG_MSG_DELPLAYERRESULT
void CNetAccount::onDelPlayerResult() { readResult(this, &delResult, ACC_REQ_DELPLAYER); }

// @yo2 0x0068fc10 0x3111 YG_MSG_DUELPASSPURCHASERESULT: unopened packs
void CNetAccount::onDuelPassPurchase() { readResult(this, &duelPassPacks, ACC_REQ_DPPURCHASE); }

// @yo2 0x0068fa90 0x3102 one trunk chunk: chunks 0-5 carry 512 B, chunk 6 the last 184
void CNetAccount::onTrunkData() {
    if (trunkChunk > 6) return;   // fix: the original writes past the trunk buffer
    YgPacket* p = in();
    ygBeginRead(p);
    if (trunkChunk == 6) ygGetBytes(p, trunkIn + 0xc00, 0xb8);
    else ygGetBytes(p, trunkIn + trunkChunk * 0x200, 0x200);
    ygEndRead(p);
}

// @yo2 0x0068fb10 0x3114 YG_MSG_GETPBIN: 128 B (copied with FUN_00ad68a0 into the sub-object at +0x3264)
void CNetAccount::onPbin() {
    YgPacket* p = in();
    uint8_t b[0x81] = {};
    ygBeginRead(p);
    ygGetBytes(p, b, 0x80);
    ygEndRead(p);
    memcpy(bin.pbin, b, sizeof bin.pbin);
}

// @yo2 0x0068fb90 0x4234 YG_MSG_NPCBIN: 512 B (FUN_00ad68d0)
void CNetAccount::onNpcBin() {
    YgPacket* p = in();
    uint8_t b[0x201] = {};
    ygBeginRead(p);
    ygGetBytes(p, b, 0x200);
    ygEndRead(p);
    memcpy(bin.npcBin, b, sizeof bin.npcBin);
    flag(ACC_REQ_PBIN) = 2;
}
