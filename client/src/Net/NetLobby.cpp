// CNetLobby request builders (0x006cb940..0x006cf000) and connecting.
#include "NetLobby.h"

#include <cstring>

int g_lobbyWorld = 0;

static YgPacket* begin(CNetLobby* l, int32_t id) {
    ygClear(&l->out);
    ygBegin(&l->out, id);
    return &l->out;
}

static void finish(CNetLobby* l, int req = 0) {
    ygEnd(&l->out);
    l->send();
    if (req) l->flag(req) = 1;
}

static void empty(CNetLobby* l, int32_t id, int req) {
    begin(l, id);
    finish(l, req);
}

static void u32Request(CNetLobby* l, int32_t id, uint32_t v, int req) {
    ygPut32(begin(l, id), v);
    finish(l, req);
}

static YgPacket* trade(CNetLobby* l, uint16_t sub) {
    YgPacket* p = begin(l, 0x7000);
    ygPut16(p, sub);
    return p;
}

// MD5 of a room / chat-room password; false = refuse to send (empty or longer than 16)
static bool passwordDigest(bool locked, const char* password, uint8_t out[16]) {
    memset(out, 0, 16);
    if (!locked) return true;
    if (!password || !*password || strlen(password) > 16) return false;
    ygMd5(password, (int)strlen(password), out);
    return true;
}

// @yo2 0x006abe10 connect to the gate entry whose b1/b2/b3 match rgn/rank/area
int32_t CNetLobby::connect(const CNetGate* gate) {
    _7dd = 0;
    memset(challenge, 0, 16);
    authOk = 0;
    if (!gate) return YG_NO_GATE;
    const CServerList* l = gate->list();
    if (!l) return YG_NO_SERVER;   // fix: the original reads a null list mid-update
    for (const CServerInfo& e : *l) {
        // signed entry bytes against unsigned wanted ones, as in the exe: an entry's 0xff never matches 255
        if (e.kind == SERVER_LOBBY && e.lang == rgn && e.rank == rank && e.area == area) {
            strncpy(host, e.address(), sizeof host - 1);
            port = e.port;
            return CMessageIOBase::connect();
        }
    }
    return YG_NO_SERVER;
}

// @yo2 0x006cb940 0x3001 YG_MSG_REQCCODE
void CNetLobby::sendHello() { empty(this, 0x3001, LB_REQ_HELLO); }

// @yo2 0x006cb990 0x3003 login with the account's user and password and this connection's challenge
void CNetLobby::sendAuth(const CNetAccount& acc) {
    ygClear(&out);
    buildLogin(&out, acc.me.user, acc.me.password, challenge);
    send();
    flag(LB_REQ_AUTH) = 1;
}

// @yo2 0x006cbb20 0x4100 YG_MSG_PSELECT: u8 language, u8 slot, then a u32 per deck card id
void CNetLobby::reqPSelect(uint8_t lang, uint8_t slot, const uint32_t* deck, int n) {
    YgPacket* p = begin(this, 0x4100);
    ygPut8(p, lang);
    ygPut8(p, slot);
    for (int i = 0; i < n; i++) ygPut32(p, deck[i]);
    finish(this, LB_REQ_PSELECT);
}

// @yo2 0x006cbc10 0x4200 YG_MSG_REQBLOCKLIST
void CNetLobby::reqBlockList() { empty(this, 0x4200, LB_REQ_BLOCKLIST); }

// @yo2 0x006cbc60 0x4202 YG_MSG_ENTERBLOCK
void CNetLobby::reqEnterBlock(uint8_t blk, uint8_t change) {
    ygBegin(&out, 0x4202);   // the only builder here without the ygClear first; same bytes on the wire
    ygPut8(&out, blk);
    ygPut8(&out, change);
    finish(this, LB_REQ_ENTERBLOCK);
}

// @yo2 0x006cbce0 0x4210 LIST1 (pid -1 = everybody)
void CNetLobby::reqList1(int32_t pid) { u32Request(this, 0x4210, pid, LB_REQ_LIST1); }
// @yo2 0x006cbd50 0x4214 LIST2
void CNetLobby::reqList2(int32_t pid) { u32Request(this, 0x4214, pid, LB_REQ_LIST2); }
// @yo2 0x006cbdc0 0x4218 LIST3
void CNetLobby::reqList3(int32_t pid) { u32Request(this, 0x4218, pid, LB_REQ_LIST3); }
// @yo2 0x006cbe30 0x421c LIST4
void CNetLobby::reqList4(int32_t pid) { u32Request(this, 0x421c, pid, LB_REQ_LIST4); }
// @yo2 0x006cbea0 0x4221 LIST5
void CNetLobby::reqList5(int32_t pid) { u32Request(this, 0x4221, pid, LB_REQ_LIST5); }
// @yo2 0x006cbf10 0x4230 NPC info list
void CNetLobby::reqNpcInfoList() { empty(this, 0x4230, LB_REQ_NPCINFOLIST); }
// @yo2 0x006cbf80 0x4150 YG_MSG_REQPLAYERINFO
void CNetLobby::reqPlayerInfo(uint32_t pid) { u32Request(this, 0x4150, pid, LB_REQ_PLAYERINFO); }
// @yo2 0x006cbff0 0x5320 YG_MSG_REQAVATARINFO
void CNetLobby::reqAvatarInfo(uint32_t pid) { u32Request(this, 0x5320, pid, LB_REQ_AVATARINFO); }

// @yo2 0x006cc060 0x4170 YG_MSG_REGAVATARINFO
void CNetLobby::regAvatarInfo(uint32_t a, const uint8_t parts[16], uint32_t b) {
    YgPacket* p = begin(this, 0x4170);
    ygPut32(p, a);
    ygPutBytes(p, parts, 16);
    ygPut32(p, b);
    finish(this, LB_REQ_REGAVATAR);
}

// @yo2 0x006cc0f0 0x4172 YG_MSG_REGPLAYERCOMMENT
void CNetLobby::regComment(uint8_t line, const char text[32]) {
    YgPacket* p = begin(this, 0x4172);
    ygPut8(p, line);
    ygPutBytes(p, text, 32);
    finish(this, LB_REQ_COMMENT);
}

// @yo2 0x006cc170 0x4174 YG_MSG_UPDATE_PLAYERTITLE
void CNetLobby::updateTitle(int32_t title) { u32Request(this, 0x4174, title, LB_REQ_TITLE); }
// @yo2 0x006cc1e0 0x4280 YG_MSG_REQDUELROOMLIST
void CNetLobby::reqDuelRoomList(int32_t v) { u32Request(this, 0x4280, v, LB_REQ_ROOMLIST); }

// @yo2 0x006cc250 0x4288 YG_MSG_REQCREATEROOM
void CNetLobby::reqCreateRoom(uint8_t a, uint8_t b, uint8_t c, bool locked, const char* password, uint8_t d,
                              uint8_t e, uint8_t f, uint32_t g) {
    uint8_t digest[16];
    if (!passwordDigest(locked, password, digest)) return;
    YgPacket* p = begin(this, 0x4288);
    ygPut8(p, a);
    ygPut8(p, b);
    ygPut8(p, c);
    ygPut8(p, locked);
    ygPutBytes(p, digest, 16);
    ygPut8(p, 0);
    ygPut8(p, d);
    ygPut8(p, e);
    ygPut8(p, f);
    ygPut32(p, g);
    finish(this, LB_REQ_CREATEROOM);
}

// @yo2 0x006cc3d0 0x4290 YG_MSG_REQDELETEROOM
void CNetLobby::reqDeleteRoom() { empty(this, 0x4290, LB_REQ_DELETEROOM); }
// @yo2 0x006cc8e0 0x4303 YG_MSG_MATCHOFFERREPLY
void CNetLobby::matchOfferReply(bool yes) { u32Request(this, 0x4303, yes, 0); }
// @yo2 0x006cc960 0x430a YG_MSG_AUTOMATCHREPLY
void CNetLobby::autoMatchReply(bool yes) { u32Request(this, 0x430a, yes, 0); }
// @yo2 0x006cc9e0 0x4304 YG_MSG_CANCELREQMATCH
void CNetLobby::cancelReqMatch() { empty(this, 0x4304, LB_REQ_CANCELMATCH); }

// @yo2 0x006cca30 0x4400 YG_MSG_CHAT: u8 0, u8 kind, 3 x u32, the text bytes
void CNetLobby::sendChat(uint8_t kind, uint32_t a, uint32_t b, uint32_t c, const char* text, int len) {
    YgPacket* p = begin(this, 0x4400);
    ygPut8(p, 0);
    ygPut8(p, kind);
    ygPut32(p, a);
    ygPut32(p, b);
    ygPut32(p, c);
    ygPutBytes(p, text ? text : "", text ? len : 0);
    finish(this);
}

// @yo2 0x006ccb70 0x4320 YG_MSG_REQWATCH
void CNetLobby::reqWatch(uint32_t room) {
    u32Request(this, 0x4320, room, LB_REQ_WATCH);
    watchState = 3;
}

// @yo2 0x006ccbf0 0x4410 YG_MSG_REQCHATROOMLIST
void CNetLobby::reqChatRoomList() { empty(this, 0x4410, LB_REQ_CHATROOMLIST); }

// @yo2 0x006ccc40 0x4424 YG_MSG_REQCREATECHATROOM: 32 B name, u8 locked, MD5(password)
void CNetLobby::reqCreateChatRoom(const char name[32], bool locked, const char* password) {
    uint8_t digest[16];
    if (!*name || !passwordDigest(locked, password, digest)) return;
    YgPacket* p = begin(this, 0x4424);
    ygPutBytes(p, name, 32);
    ygPut8(p, locked);
    ygPutBytes(p, digest, 16);
    finish(this, LB_REQ_CREATECHATROOM);
}

// @yo2 0x006ccd70 0x4428 YG_MSG_REQEXITCHATROOM
void CNetLobby::reqExitChatRoom() { empty(this, 0x4428, LB_REQ_EXITCHATROOM); }

// @yo2 0x006ccdc0 0x4802 YG_MSG_SELECTCARDPACK
void CNetLobby::selectCardPack(uint16_t pack) {
    ygPut16(begin(this, 0x4802), pack);
    finish(this, LB_REQ_SELECTPACK);
}

// @yo2 0x006cce40 0x42a0 YG_MSG_RESETAUTOWAIT
void CNetLobby::resetAutoWait() { empty(this, 0x42a0, LB_REQ_RESETAUTOWAIT); }
// @yo2 0x006cce90 0x4510 YG_MSG_REQFRIEND
void CNetLobby::reqFriend(uint32_t pid) { u32Request(this, 0x4510, pid, LB_REQ_FRIEND); }

// @yo2 0x006ccf00 0x4513 YG_MSG_FRIENDOFFERREPLY
void CNetLobby::friendOfferReply(uint32_t pid, int32_t answer) {
    YgPacket* p = begin(this, 0x4513);
    ygPut32(p, pid);
    ygPut32(p, answer);
    finish(this);
}

static void name16(CNetLobby* l, int32_t id, const char* name, int req) {
    char b[33] = {};   // the exe strcpy's into a 17 (0x4500) / 32 (0x4550) byte buffer; we cut at 32
    strncpy(b, name ? name : "", 32);
    ygPutBytes(begin(l, id), b, 16);
    finish(l, req);
}

// @yo2 0x006cd0c0 0x4500 YG_MSG_GETPIDBYPNAME
void CNetLobby::getPidByName(const char* name) { name16(this, 0x4500, name, LB_REQ_PIDBYNAME); }
// @yo2 0x006cd1f0 0x4550 YG_MSG_TEAMCREATE
void CNetLobby::teamCreate(const char* name) { name16(this, 0x4550, name, LB_REQ_TEAMCREATE); }
// @yo2 0x006cd2b0 0x4552 YG_MSG_TEAMDISBAND
void CNetLobby::teamDisband() { empty(this, 0x4552, LB_REQ_TEAMDISBAND); }
// @yo2 0x006cd320 0x4554 YG_MSG_TEAMJOIN
void CNetLobby::teamJoin(uint32_t team) { u32Request(this, 0x4554, team, 0); }

// @yo2 0x006cd390 0x4568 YG_MSG_TEAMJOIN_REPLY: u32 yes, then the two ids
void CNetLobby::teamJoinReply(uint32_t a, uint32_t b, bool yes) {
    YgPacket* p = begin(this, 0x4568);
    ygPut32(p, yes);
    ygPut32(p, a);
    ygPut32(p, b);
    finish(this);
}

// @yo2 0x006cd420 0x4556 YG_MSG_TEAMBANISH
void CNetLobby::teamBanish(uint32_t pid) { u32Request(this, 0x4556, pid, 0); }
// @yo2 0x006cd490 0x4569 YG_MSG_TEAMLEAVE
void CNetLobby::teamLeave() { empty(this, 0x4569, 0); }
// @yo2 0x006cd4e0 0x4558 YG_MSG_TEAMLIST
void CNetLobby::teamList() { empty(this, 0x4558, LB_REQ_TEAMLIST); }
// @yo2 0x006cdcc0 0x4620 YG_MSG_GETMAILCOUNT
void CNetLobby::getMailCount() { empty(this, 0x4620, LB_REQ_MAILCOUNT); }
// @yo2 0x006cdd10 0x4610 YG_MSG_RCVMAIL
void CNetLobby::rcvMail() { empty(this, 0x4610, LB_REQ_RCVMAIL); }
// @yo2 0x006cdd60 0x4530 YG_MSG_REQADDBLACK
void CNetLobby::reqAddBlack(uint32_t pid) { u32Request(this, 0x4530, pid, LB_REQ_ADDBLACK); }
// @yo2 0x006cddd0 0x4540 YG_MSG_REQDELBLACK
void CNetLobby::reqDelBlack(uint32_t pid) { u32Request(this, 0x4540, pid, LB_REQ_DELBLACK); }

// @yo2 0x006cde40 0x7000/0x7132 YG_MSG_TRADEREADY
void CNetLobby::tradeReady() { trade(this, 0x7132); finish(this, LB_REQ_TRADEREADY); }
// @yo2 0x006cdec0 0x7000/0x7101 YG_MSG_TRADESTART
void CNetLobby::tradeStart() { trade(this, 0x7101); finish(this, LB_REQ_TRADESTART); }

// @yo2 0x006cdf40 0x7000/0x7102 YG_MSG_REQTRADE
void CNetLobby::reqTrade(uint32_t pid) {
    ygPut32(trade(this, 0x7102), pid);
    finish(this, LB_REQ_TRADE);
    flag(LB_REQ_TRADEOFFERREPLY) = 0;
}

// @yo2 0x006cdfd0 0x7000/0x7105 YG_MSG_TRADEOFFERREPLY
void CNetLobby::tradeOfferReply(bool yes) {
    ygPut32(trade(this, 0x7105), yes);
    finish(this, LB_REQ_TRADEOFFERREPLY);
}

// @yo2 0x006ce060 0x7000/0x7108 YG_MSG_CANCELREQTRADE
void CNetLobby::cancelReqTrade() { trade(this, 0x7108); finish(this, LB_REQ_CANCELTRADE); }

// @yo2 0x006ce0e0 0x7000/0x7113 YG_MSG_ADDCARD
void CNetLobby::tradeAddCard(int16_t card) {
    ygPut16(trade(this, 0x7113), card);
    finish(this, LB_REQ_TRADECARD);
    flag(LB_REQ_TRADECARD2) = 1;
}

// @yo2 0x006ce170 0x7000/0x7114 YG_MSG_DELETECARD
void CNetLobby::tradeDeleteCard(int16_t card) {
    ygPut16(trade(this, 0x7114), card);
    finish(this, LB_REQ_TRADECARD);
    flag(LB_REQ_TRADECARD2) = 1;
}

// @yo2 0x006ce200 0x7000/0x7117 YG_MSG_SETTRADESTATUS
void CNetLobby::setTradeStatus(uint8_t status) {
    ygPut8(trade(this, 0x7117), status);
    finish(this, LB_REQ_TRADESTATUS);
}

// @yo2 0x006ce290 0x7000/0x7119 YG_MSG_TRADELASTCONFIRM: u8, 10 x u32 mine, 10 x u32 theirs
void CNetLobby::tradeLastConfirm(uint8_t a, const int32_t mine[10], const int32_t theirs[10]) {
    YgPacket* p = trade(this, 0x7119);
    ygPut8(p, a);
    for (int i = 0; i < 10; i++) ygPut32(p, mine[i]);
    for (int i = 0; i < 10; i++) ygPut32(p, theirs[i]);
    finish(this, LB_REQ_TRADECONFIRM);
}

// @yo2 0x006ce360 0x7000/0x7112 YG_MSG_TRADEUSEREXIT
void CNetLobby::tradeUserExit() { trade(this, 0x7112); finish(this, LB_REQ_TRADEEXIT); }
// @yo2 0x006ce3e0 0x7000/0x7122 YG_MSG_ARRIVETRADECARD
void CNetLobby::arriveTradeCard() { trade(this, 0x7122); finish(this); }
// @yo2 0x006ce450 0x7000/0x7128 YG_MSG_TRADECLEAR
void CNetLobby::tradeClear() { trade(this, 0x7128); finish(this, LB_REQ_TRADECLEAR); }
// @yo2 0x006ce4d0 0x4902 YG_MSG_PURCHASE_PACK_OPEN
void CNetLobby::purchasePackOpen() { empty(this, 0x4902, LB_REQ_PURCHASEPACK); }
// @yo2 0x006ce520 0x4901 YG_MSG_RECOVERY_PACK_LIST
void CNetLobby::recoveryPackList() { empty(this, 0x4901, LB_REQ_RECOVERYPACK); }
// @yo2 0x006ce570 0x4904 YG_MSG_PRESENT_PACK_OPEN
void CNetLobby::presentPackOpen() { empty(this, 0x4904, LB_REQ_PRESENTPACK); }

// @yo2 0x006ce5c0 0x8101 YG_MSG_REQDPAUTH: the typed code, 16 B, Blowfish like the login
void CNetLobby::reqDpAuth(const char code[16]) {
    if (dpAuthTries > 10) {
        dpAuthResult = DPAUTH_TOO_MANY;
        flag(LB_REQ_DPAUTH) = 2;
        return;
    }
    YgPacket* p = begin(this, 0x8101);
    ygPutBytes(p, code, 16);
    ygEnd(p);
    ygCipher(p, 0);
    send();
    flag(LB_REQ_DPAUTH) = 1;
}

// @yo2 0x006ce660 0x4910 YG_MSG_REQGUNSLINGCARD
void CNetLobby::reqGunslingCard() { empty(this, 0x4910, LB_REQ_GUNSLING); }
// @yo2 0x006ce6b0 0x5200 YG_MSG_REQMILEAGEITEM
void CNetLobby::reqMileageItem() { empty(this, 0x5200, LB_REQ_MILEAGEITEM); }

// @yo2 0x006ce700 0x5202 YG_MSG_REQMILEAGERESULT: the selected mileage line
void CNetLobby::reqMileageResult() {
    YgPacket* p = begin(this, 0x5202);
    ygPut32(p, mileageItem[mileageSel]);
    ygPut16(p, mileageA[mileageSel]);
    ygPut16(p, mileageB[mileageSel]);
    ygPut16(p, mileageC[mileageSel]);
    finish(this, LB_REQ_MILEAGERESULT);
}

// @yo2 0x006ce830 0x5210 YG_MSG_REQSHOPRESULT: u32 item + u8 count per cart line; empties the purchase list first
void CNetLobby::reqShopResult() {
    purchased.clear();
    YgPacket* p = begin(this, 0x5210);
    for (const ShopPick& c : cart) {
        ygPut32(p, c.itemId);
        ygPut8(p, c.count);
    }
    finish(this, LB_REQ_SHOPRESULT);
}

// @yo2 0x006ce960 0x5100 YG_MSG_TOUR_INFO
void CNetLobby::tourInfo() { empty(this, 0x5100, LB_REQ_TOURINFO); }
// @yo2 0x006ce9b0 0x5107 YG_MSG_TOUR_REQENTRY
void CNetLobby::tourReqEntry() { empty(this, 0x5107, LB_REQ_TOURENTRY); }
// @yo2 0x006cea00 0x5111 YG_MSG_TOUR_LIST
void CNetLobby::tourList() { empty(this, 0x5111, LB_REQ_TOURLIST); }
// @yo2 0x006cea50 0x5112 YG_MSG_TOUR_ENDRESULT
void CNetLobby::tourEndResult() { empty(this, 0x5112, LB_REQ_TOURENDRESULT); }
// @yo2 0x006ceaa0 0x5113 YG_MSG_TOUR_TIMER
void CNetLobby::tourTimer() { empty(this, 0x5113, LB_REQ_TOURTIMER); }
// @yo2 0x006ceaf0 0x5114 YG_MSG_TOUR_PCOUNTER
void CNetLobby::tourPCounter() { empty(this, 0x5114, LB_REQ_TOURPCOUNTER); }
// @yo2 0x006ceb40 0x5115 YG_MSG_TOUR_STATUS
void CNetLobby::tourStatus() { empty(this, 0x5115, LB_REQ_TOURSTATUS); }
// @yo2 0x006ceb90 0x4915 YG_MSG_REQCHAMPSCARDGET
void CNetLobby::reqChampsCardGet() { empty(this, 0x4915, LB_REQ_CHAMPSCARD); }

// @yo2 0x006cebe0 0x8203 YG_MSG_REQUSBDPAUTH: 16 B from the USB DUELPASS object (not encrypted)
void CNetLobby::reqUsbDpAuth(const uint8_t key[16]) {
    if (dpAuthTries > 10) {
        usbDpAuthResult = DPAUTH_TOO_MANY;
        flag(LB_REQ_USBDPAUTH) = 2;
        return;
    }
    ygPutBytes(begin(this, 0x8203), key, 16);
    finish(this, LB_REQ_USBDPAUTH);
}

// @yo2 0x006cec70 0x5300 move: u32 pid, u16 x, u16 y, u8 dir, u8
void CNetLobby::sendMove(uint32_t pid, uint16_t x, uint16_t y, uint8_t dir, uint8_t b) {
    YgPacket* p = begin(this, 0x5300);
    ygPut32(p, pid);
    ygPut16(p, x);
    ygPut16(p, y);
    ygPut8(p, dir);
    ygPut8(p, b);
    finish(this);
}

// @yo2 0x006ced40 0x5310: u32, u8, u8
void CNetLobby::send5310(uint32_t pid, uint8_t a, uint8_t b) {
    YgPacket* p = begin(this, 0x5310);
    ygPut32(p, pid);
    ygPut8(p, a);
    ygPut8(p, b);
    finish(this);
}

// @yo2 0x006cedd0 0x5400 YG_MSG_SD_GET_REQUEST
void CNetLobby::sdGetRequest(uint16_t a, uint16_t b) {
    YgPacket* p = begin(this, 0x5400);
    ygPut16(p, a);
    ygPut16(p, b);
    finish(this, LB_REQ_SDGET);
}

// @yo2 0x006cee50 0x8301 YG_MSG_REQTPPRESENTINFO
void CNetLobby::reqTpPresentInfo() { empty(this, 0x8301, LB_REQ_TPPRESENTINFO); }

// @yo2 0x006ceea0 0x8303 YG_MSG_REQTPCARDGET: u8 + 3 x u16
void CNetLobby::reqTpCardGet(uint8_t a, const uint16_t cards[3]) {
    YgPacket* p = begin(this, 0x8303);
    ygPut8(p, a);
    for (int i = 0; i < 3; i++) ygPut16(p, cards[i]);
    finish(this, LB_REQ_TPCARDGET);
}

// @yo2 0x006cef30 0x8401 start-up present: u8 count + u16 per card (the exe logs it as REQTPCARDGET too)
void CNetLobby::reqStartupPresent(const uint16_t* cards, int n) {
    YgPacket* p = begin(this, 0x8401);
    ygPut8(p, (uint8_t)n);
    for (int i = 0; i < n; i++) ygPut16(p, cards[i]);
    finish(this, LB_REQ_STARTUPPRESENT);
}
