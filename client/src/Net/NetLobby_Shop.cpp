// CNetLobby: pack opening, DUELPASS, tournaments, mileage, shop, SD/TP/presents, NPC info, limits, deck
// (the exe's yo2NetLobby_Parse.cpp, 0x006bfcc0..0x006c3340, plus the CNetLobby helpers they call).
#include "NetLobby_Shop.h"

#include <cstring>

#include "NetLobby.h"

enum : int {   // answer-only request bytes (the rest are LB_REQ_* in NetLobby.h)
    LB_ANS_MILEAGELIST = 0x4b, LB_ANS_MILEAGEEND = 0x4d, LB_ANS_TOURSTART = 0x6a, LB_ANS_TOUREND = 0x6b,
    LB_ANS_TOURLOTTERY = 0x6c, LB_ANS_TOURLOTRESULT = 0x6d, LB_ANS_TOURPHASE = 0x6e, LB_ANS_TOURROUND = 0x6f,
    LB_ANS_TOURSIMPLEENTRY = 0x71, LB_ANS_TOURSIMPLELIST = 0x73, LB_ANS_TOURCHKDUEL = 0x74,
    LB_ANS_SHOPLISTEND = 0x81, LB_ANS_SHOPRESULTEND = 0x82,
};

// ---- account helpers

// +1 copy in the trunk (the inlined "kaban[card - 1]++ unless full" every parser here repeats)
static void trunkAdd(CMyUser& me, uint16_t card) {
    if (card < 0xcb9 && card != 0 && me.trunk[card - 1] != 0xff) me.trunk[card - 1]++;
}


// The beginner-deck rights (PBIN 0x302 / 0x304 / 0x306): set each unless it or its "got" bit (+1) is set.
static bool grantBeginnerRights(CPlayerBinData& b) {
    bool any = false;
    for (uint32_t bit : {0x302u, 0x304u, 0x306u})
        if (!b.flag(bit) && !b.flag(bit + 1)) { b.setFlag(bit, true); any = true; }
    return any;
}
// ponytail: 0x4903 and 0x8204 also query flags 0x30e..0x317 until 2007-02-11 and ignore the answers (no effect).

// ---- CNetLobby helpers

// @yo2 0x006aef90 forget the cards of the last pack / present
void CNetLobby::clearPackCards() {
    for (int i = 0; i < 0x50; i++) { packCard[i] = -1; packNew[i] = 0; }
}

// @yo2 0x006aefc0
void CNetLobby::setPackCard(int i, int32_t card, uint8_t isNew) {
    if (i < 0x50) { packCard[i] = card; packNew[i] = isNew; }
}

// @yo2 0x006ae5a0 put mileage line n in place, keeping the first n sorted by c
void CNetLobby::mileageInsert(int n, uint32_t item, uint16_t a, uint16_t b, uint16_t c) {
    if (n < 0 || n >= 100) return;   // fix: the exe writes past the 100-line arrays
    int at = 0;
    for (; at < n; at++) {
        if (c < mileageC[at]) {
            for (int k = n; k > at; k--) {
                mileageItem[k] = mileageItem[k - 1];
                mileageA[k] = mileageA[k - 1];
                mileageB[k] = mileageB[k - 1];
                mileageC[k] = mileageC[k - 1];
            }
            break;
        }
    }
    mileageItem[at] = item;
    mileageA[at] = a;
    mileageB[at] = b;
    mileageC[at] = c;
}

// @yo2 0x006ae680
void CNetLobby::addShopItem(const ShopItem& it) { shopItems.push_back(it); }

// @yo2 0x006af0b0
void CNetLobby::setUsbResult(const uint16_t cards[3], const uint8_t isNew[3]) {
    for (int i = 0; i < 3; i++) { usbCard[i] = cards[i]; usbNew[i] = isNew[i]; }
}

// @yo2 0x006cf000 0x5204 YG_MSG_ITEMGET: u16 type, u32 id; type 4 marks the item record as seen locally
void CNetLobby::itemGet(CNetAccount& acc, int16_t type, uint32_t id) {
    ygClear(&out);
    ygBegin(&out, 0x5204);
    ygPut16(&out, (uint16_t)type);
    ygPut32(&out, id);
    ygEnd(&out);
    send();
    if (type != 4) {
        flag(LB_REQ_ITEMGET) = 1;
        return;
    }
    uint32_t r = acc.bin.item(id);
    if (!(r >> 24)) acc.bin.setItem(id, r | 1u << 24);
}

// ---- parsers

// 0x4903 / 0x4905 / 0x5401 / 0x8402 ...: card list records into the trunk and the "just got" table
static uint8_t isNewCard(uint16_t card) { return cardDbOwned(card) == 0; }

// @yo2 0x006bfcc0 0x4903 PURCHASE_PACK_OPEN_RESULT: u32 result, s32, then (u16 card, u8 new) per card
void CNetLobby::onPurchasePackOpen(CNetAccount& acc) {
    YgPacket* p = in();
    clearPackCards();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&packOpenResult);
    ygGet32(p, (uint32_t*)&packOpenCount);
    for (int i = 0; ygReadPos(p) != -1; i++) {
        uint16_t card;
        uint8_t isNew;
        ygGet16(p, &card);
        ygGet8(p, &isNew);
        setPackCard(i, card, isNew);
        trunkAdd(acc.me, card);
    }
    ygEndRead(p);
    if (packOpenResult == 0) {
        cardDbSyncTrunk(acc.me);
        dpGain = 150;
        acc.me.u2c += 150;                  // DP
        acc.me.players[0].mp += 50;         // slot 0's MP, whichever slot is active (YOLaucher persistencia B70)
        grantBeginnerRights(acc.bin);
        packOpened = 1;
    }
    flag(LB_REQ_PURCHASEPACK) = 2;
}

// @yo2 0x006c0070 0x4905 PRESENT_PACK_OPEN_RESULT: u32 result, then (u16 card, u8 new) per card
void CNetLobby::onPresentPackOpen(CNetAccount& acc) {
    YgPacket* p = in();
    clearPackCards();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&presentPackResult);
    for (int i = 0; ygReadPos(p) != -1; i++) {
        uint16_t card;
        uint8_t isNew;
        ygGet16(p, &card);
        ygGet8(p, &isNew);
        setPackCard(i, card, isNew);
        trunkAdd(acc.me, card);
    }
    ygEndRead(p);
    cardDbSyncTrunk(acc.me);
    flag(LB_REQ_PRESENTPACK) = 2;
}

// @yo2 0x006c01b0 0x8102 DPAUTHRESULT: s32 result; if 0, u16 card, u8, u8 DP, u16 pack / structure deck
void CNetLobby::onDpAuthResult(CNetAccount& acc) {
    YgPacket* p = in();
    dpCard = 0;
    dpExtra = 0;
    dpGain = 0;
    dpPack = 0;
    clearPackCards();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&dpAuthResult);
    if (dpAuthResult == 0) {
        uint8_t dp;
        ygGet16(p, &dpCard);
        ygGet8(p, &dpExtra);
        ygGet8(p, &dp);
        dpGain = dp;
        ygGet16(p, &dpPack);
    }
    ygEndRead(p);
    if (dpCard > 0xcb7) dpExtra = 0, dpCard = 0;
    if (dpAuthResult != 0) {
        dpAuthTries++;
        flag(LB_REQ_DPAUTH) = 2;
        return;
    }
    if (dpCard != 0) {
        trunkAdd(acc.me, dpCard);
        setPackCard(0, dpCard, isNewCard(dpCard));
        packGot = 1;
    }
    std::vector<uint16_t> cards;
    int32_t pbinBase = 0;
    if (dpPack == 8999) {   // three copies of every card of pack 8999, 1000 DP and flag 0x246
        if (cardPackCards(8999, &cards, &pbinBase))
            for (uint16_t c : cards) for (int k = 0; k < 3; k++) trunkAdd(acc.me, c);
        dpGain = 1000;
        acc.bin.setFlag(0x246, true);
    } else if (dpPack != 0 && cardPackCards(dpPack, &cards, &pbinBase)) {
        for (size_t i = 0; i < cards.size(); i++) {
            trunkAdd(acc.me, cards[i]);
            setPackCard((int)i, cards[i], isNewCard(cards[i]));
        }
        acc.bin.setFlag(pbinBase + 1, true);   // the structure deck's "got" bit
        packGot = 1;
    }
    cardDbSyncTrunk(acc.me);
    acc.me.u2c += dpGain;
    if (dpGain == 30 || dpGain == 15 || dpGain == 20) acc.me.players[0].mp += 10;
    if (grantBeginnerRights(acc.bin)) packGot = 1;
    flag(LB_REQ_DPAUTH) = 2;
}

// @yo2 0x006c0930 0x5100 TOUR_INFO: u32 serial, 100 B name, u32 day, u32, u32, u32 max, u32 rounds, u32
void CNetLobby::onTourInfo() {
    YgPacket* p = in();
    CChampsData& t = champs;
    uint32_t serial, day, a, b, maxp, rounds, x;
    char name[101];
    ygBeginRead(p);
    ygGet32(p, &serial);
    ygGetBytes(p, name, 100);
    ygGet32(p, &day);
    ygGet32(p, &a);
    ygGet32(p, &b);
    ygGet32(p, &maxp);
    ygGet32(p, &rounds);
    ygGet32(p, &x);
    ygEndRead(p);
    t.serial = (int32_t)serial;
    strcpy(t.name, name);
    t.day = (int32_t)day;
    t.u74 = a;
    t.u78 = b;
    t.maxPlayers = (int32_t)maxp;
    t.rounds = (int32_t)rounds;
    t.u9c = (int32_t)x;
    flag(LB_REQ_TOURINFO) = 2;
}

// @yo2 0x006c0a70 0x5101 TOUR_START
static void tourStart(CNetLobby* l) { l->flag(LB_ANS_TOURSTART) = 2; }
// @yo2 0x006c0a90 0x5102 TOUR_END
static void tourEnd(CNetLobby* l) { l->flag(LB_ANS_TOUREND) = 2; }

// s32 + u8 "1 starts / 0 ends" -> state 1 (running) or 2 (over)
static uint8_t runningState(uint8_t b) { return b == 0 ? 2 : 1; }

// @yo2 0x006c0ab0 0x5103 TOUR_LOTTERY: u32 phase, u8 1 starts / 0 ends
void CNetLobby::onTourLottery() {
    YgPacket* p = in();
    uint32_t phase;
    uint8_t b;
    ygBeginRead(p);
    ygGet32(p, &phase);
    ygGet8(p, &b);
    ygEndRead(p);
    champs.phase = (int32_t)phase;
    champs.lotteryState = runningState(b);
    flag(LB_ANS_TOURLOTTERY) = 2;
}

// @yo2 0x006c0b30 0x5104 TOUR_LOTRESULT: u8 1 in / 2 out
void CNetLobby::onTourLotResult() {
    YgPacket* p = in();
    uint8_t b = 0;
    ygBeginRead(p);
    ygGet8(p, &b);
    ygEndRead(p);
    champs.lotResult = b;
    flag(LB_ANS_TOURLOTRESULT) = 2;
}

// @yo2 0x006c0b80 0x5105 TOUR_PHASE: u32 phase, u8
void CNetLobby::onTourPhase() {
    YgPacket* p = in();
    uint32_t phase;
    uint8_t b;
    ygBeginRead(p);
    ygGet32(p, &phase);
    ygGet8(p, &b);
    ygEndRead(p);
    champs.phase = (int32_t)phase;
    champs.phaseState = runningState(b);
    flag(LB_ANS_TOURPHASE) = 2;
}

// @yo2 0x006c0c00 0x5106 TOUR_ROUND: u32 phase, u32 round, u8
void CNetLobby::onTourRound() {
    YgPacket* p = in();
    uint32_t phase, round;
    uint8_t b;
    ygBeginRead(p);
    ygGet32(p, &phase);
    ygGet32(p, &round);
    ygGet8(p, &b);
    ygEndRead(p);
    champs.roundPhase = (int32_t)phase;
    champs.round = (int32_t)round;
    champs.roundState = runningState(b);
    flag(LB_ANS_TOURROUND) = 2;
}

// @yo2 0x006c0c90 0x5108 TOUR_ENTRY_START: empties the entrant table (3 x u32 read and dropped)
void CNetLobby::onTourEntryStart() {
    YgPacket* p = in();
    champs.entries = 0;
    for (CChampsEntryList& e : tourEntry) {
        e.pid = 0;
        memset(e.name, 0, 16);
        e.name[16] = 0;
        e.wins = e.status = 0;
        memset(e.country, 0, 4);
    }
    uint32_t x;
    ygBeginRead(p);
    for (int i = 0; i < 3; i++) ygGet32(p, &x);
    ygEndRead(p);
}

// @yo2 0x006c0d30 0x5109 TOUR_ENTRY_DATA: 42-byte entrants appended (s32 pid, 16 B name, u8 wins, u8, 4 B, 16 B avatar)
void CNetLobby::onTourEntryData() {
    YgPacket* p = in();
    int n = champs.entries;
    ygBeginRead(p);
    for (; ygReadPos(p) != -1; n++) {
        uint32_t pid;
        char name[17], country[5];
        uint8_t wins, status, avatar[17];
        ygGet32(p, &pid);
        ygGetBytes(p, name, 16);
        ygGet8(p, &wins);
        ygGet8(p, &status);
        ygGetBytes(p, country, 4);
        ygGetBytes(p, avatar, 16);
        if (n >= 0x200) continue;   // fix: the exe writes past the 0x200 entrants
        CChampsEntryList& e = tourEntry[n];
        e.pid = (int32_t)pid;
        strcpy(e.name, name);
        e.wins = wins;
        e.status = status;
        strcpy(e.country, country);
        memcpy(e.avatar[0].bytes_, avatar, 16);
    }
    champs.entries = n;
    ygEndRead(p);
}

// bracket slot bits (the u16's low byte): 0x80 side 1 else 2, 0x40 result 1 else 2, 0x3f wins
static void setSlotBits(TourSlot& s, uint16_t v) {
    uint8_t b = (uint8_t)v;
    s.side = b & 0x80 ? 1 : 2;
    s.result = b & 0x40 ? 1 : 2;
    s.wins = b & 0x3f;
}

// @yo2 0x006c0eb0 0x5111 TOUR_LIST: u32, u32, u32 -> +0x36d8, u32 phase, u8 chunk (0 clears the bracket);
// then pages of u8 count, u8, 8 x (u32 pid, u16 bits) from page chunk * 20; chunk 3 completes it
void CNetLobby::onTourList() {
    YgPacket* p = in();
    uint32_t a, b, c, phase;
    uint8_t chunk;
    ygBeginRead(p);
    ygGet32(p, &a);
    ygGet32(p, &b);
    ygGet32(p, &c);
    ygGet32(p, &phase);
    ygGet8(p, &chunk);
    if (chunk == 0)
        for (TourPage& pg : tourPage) {
            pg.count = 0;
            for (TourSlot& s : pg.slot) s.pid = 0, s.side = s.result = s.wins = 0;
        }
    champs.udc = (int32_t)c;
    champs.phase = (int32_t)phase;
    for (int i = chunk * 20; ygReadPos(p) != -1; i++) {
        uint8_t cnt, b5;
        int32_t pid[8];
        uint16_t bits[8];
        ygGet8(p, &cnt);
        ygGet8(p, &b5);
        for (int k = 0; k < 8; k++) {
            ygGet32(p, (uint32_t*)&pid[k]);
            ygGet16(p, &bits[k]);
        }
        if (i >= 0x49) continue;    // fix: the exe writes past the 0x49 pages
        TourPage& pg = tourPage[i];
        pg.count = cnt;
        pg.b5 = b5;
        for (int k = 0; k < 8; k++) {
            pg.slot[k].pid = pid[k];
            setSlotBits(pg.slot[k], bits[k]);
        }
    }
    ygEndRead(p);
    if (chunk > 2) flag(LB_REQ_TOURLIST) = 2;
}

// @yo2 0x006c10c0 0x5112 TOUR_ENDRESULT: u32 serial, 100 B, u32 day, u32 entrants, u32 rounds, 16 B champion,
// u32, 16 B runner-up
void CNetLobby::onTourEndResult() {
    YgPacket* p = in();
    CChampsData& t = champs;
    uint32_t serial, day, entries, rounds, x;
    char name[101], champ[17], second[17];
    ygBeginRead(p);
    ygGet32(p, &serial);
    ygGetBytes(p, name, 100);
    ygGet32(p, &day);
    ygGet32(p, &entries);
    ygGet32(p, &rounds);
    ygGetBytes(p, champ, 16);
    ygGet32(p, &x);
    ygGetBytes(p, second, 16);
    ygEndRead(p);
    t.serial = (int32_t)serial;
    strcpy(t.name, name);
    t.day = (int32_t)day;
    t.entries = (int32_t)entries;
    t.rounds = (int32_t)rounds;
    strcpy(t.champion, champ);
    t.u9c = (int32_t)x;
    strcpy(t.runnerUp, second);
    flag(LB_REQ_TOURENDRESULT) = 2;
}

// @yo2 0x006c1250 0x5113 TOUR_TIMER: u32 seconds left
void CNetLobby::onTourTimer() {
    YgPacket* p = in();
    uint32_t s = 0;
    ygBeginRead(p);
    ygGet32(p, &s);
    ygEndRead(p);
    champs.timer = (int32_t)s;
    flag(LB_REQ_TOURTIMER) = 2;
}

// @yo2 0x006c12a0 0x5114 TOUR_PCOUNTER: u32 serial, u32 day, u32 alive, u32 entrants, u32 audience
void CNetLobby::onTourPCounter() {
    YgPacket* p = in();
    uint32_t v[5];
    ygBeginRead(p);
    for (uint32_t& x : v) ygGet32(p, &x);
    ygEndRead(p);
    champs.serial = (int32_t)v[0];
    champs.day = (int32_t)v[1];
    champs.alive = (int32_t)v[2];
    champs.entries = (int32_t)v[3];
    champs.audience = (int32_t)v[4];
    flag(LB_REQ_TOURPCOUNTER) = 2;
}

// @yo2 0x006c1370 0x5115 TOUR_STATUS: u32 serial, u32 day, u32 state, u32 phase, u32, u32 round, u8 subtitle
void CNetLobby::onTourStatus() {
    YgPacket* p = in();
    uint32_t v[6];
    uint8_t sub;
    ygBeginRead(p);
    for (uint32_t& x : v) ygGet32(p, &x);
    ygGet8(p, &sub);
    ygEndRead(p);
    champs.serial = (int32_t)v[0];
    champs.day = (int32_t)v[1];
    champs.state = (int32_t)v[2];
    champs.phase = (int32_t)v[3];
    champs.roundPhase = (int32_t)v[4];
    champs.round = (int32_t)v[5];
    champs.subtitle = sub;
    flag(LB_REQ_TOURSTATUS) = 2;
}

// @yo2 0x006c1460 0x5116 TOUR_SIMPLE_ENTRY_START: rewinds the entrant index (3 x u32 dropped)
void CNetLobby::onTourSimpleEntryStart() {
    YgPacket* p = in();
    champs.entries = 0;
    uint32_t x;
    ygBeginRead(p);
    for (int i = 0; i < 3; i++) ygGet32(p, &x);
    ygEndRead(p);
}

// @yo2 0x006c14d0 0x5117 TOUR_SIMPLE_ENTRY_DATA: (u8 wins, u8 status) per entrant, in table order
void CNetLobby::onTourSimpleEntry() {
    YgPacket* p = in();
    int n = champs.entries;
    ygBeginRead(p);
    for (; ygReadPos(p) != -1; n++) {
        uint8_t w, s;
        ygGet8(p, &w);
        ygGet8(p, &s);
        if (n < 0x200) tourEntry[n].wins = w, tourEntry[n].status = s;   // fix: unbounded in the exe
    }
    champs.entries = n;
    ygEndRead(p);
}

// @yo2 0x006c15a0 0x5119 TOUR_SIMPLE_LIST: u32 phase, u8 chunk; then pages of 8 x u16 bits from page chunk * 40
void CNetLobby::onTourSimpleList() {
    YgPacket* p = in();
    uint32_t phase;
    uint8_t chunk;
    ygBeginRead(p);
    ygGet32(p, &phase);
    ygGet8(p, &chunk);
    champs.phase = (int32_t)phase;
    for (int i = chunk * 40; ygReadPos(p) != -1; i++) {
        uint16_t bits[8];
        for (uint16_t& b : bits) ygGet16(p, &b);
        if (i >= 0x49) continue;    // fix: the exe writes past the 0x49 pages
        for (int k = 0; k < 8; k++) setSlotBits(tourPage[i].slot[k], bits[k]);
    }
    ygEndRead(p);
    if (chunk != 0) flag(LB_ANS_TOURSIMPLELIST) = 2;
}

// @yo2 0x006c16d0 0x5120 TOUR_CHKDUELSTART: u8
void CNetLobby::onTourChkDuelStart() {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGet8(p, &tourDuelStart);
    ygEndRead(p);
    flag(LB_ANS_TOURCHKDUEL) = 2;
}

// @yo2 0x006c1710 0x8204 USBDPAUTHRESULT: s32 result; if 0, u8, 3 x (u16 card, u8 new), u8 DP
void CNetLobby::onUsbDpAuthResult(CNetAccount& acc) {
    YgPacket* p = in();
    uint16_t cards[3] = {};
    uint8_t isNew[3] = {}, b = 0;
    clearPackCards();
    dpGain = 0;
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&usbDpAuthResult);
    if (usbDpAuthResult == 0) {
        uint8_t dp;
        ygGet8(p, &b);
        for (int i = 0; i < 3; i++) {
            ygGet16(p, &cards[i]);
            ygGet8(p, &isNew[i]);
            setPackCard(i, cards[i], isNewCard(cards[i]));
            trunkAdd(acc.me, cards[i]);
        }
        ygGet8(p, &dp);
        dpGain = dp;
    }
    ygEndRead(p);
    if (usbDpAuthResult != 0) {
        dpAuthTries++;
        flag(LB_REQ_USBDPAUTH) = 2;
        return;
    }
    cardDbSyncTrunk(acc.me);
    acc.me.u2c += dpGain;
    acc.me.players[0].mp += 30;
    grantBeginnerRights(acc.bin);
    usbPackGot = 1;
    usbB = b;
    setUsbResult(cards, isNew);
    usbGain = (uint8_t)dpGain;
    flag(LB_REQ_USBDPAUTH) = 2;
}

// @yo2 0x006c1b70 0x5201 MILEAGELISTNOTICE: (s32 item, u16, u16, u16 sort key) per line
void CNetLobby::onMileageList() {
    YgPacket* p = in();
    ygBeginRead(p);
    for (int i = 0; ygReadPos(p) != -1; i++) {
        uint32_t item;
        uint16_t a, b, c;
        ygGet32(p, &item);
        ygGet16(p, &a);
        ygGet16(p, &b);
        ygGet16(p, &c);
        mileageInsert(i, item, a, b, c);
    }
    ygEndRead(p);
    flag(LB_ANS_MILEAGELIST) = 2;
}

// @yo2 0x006c1c30 0x5203 MILEAGERESULTEND: u32 result
void CNetLobby::onMileageResultEnd() {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&mileageResult);
    ygEndRead(p);
    flag(LB_ANS_MILEAGEEND) = 2;
}

// @yo2 0x006c1c70 0x5209 SHOPLISTNOTICE: 17-byte items (u32 id, u8 type, u32 param, u32 cost, 4 x u8)
void CNetLobby::onShopList() {
    YgPacket* p = in();
    ygBeginRead(p);
    while (ygReadPos(p) != -1) {
        ShopItem it{};
        ygGet32(p, &it.itemId);
        ygGet8(p, &it.type);
        ygGet32(p, &it.param);
        ygGet32(p, &it.cost);
        for (uint8_t& x : it.b) ygGet8(p, &x);
        addShopItem(it);
    }
    ygEndRead(p);
}

// @yo2 0x006c1da0 0x5213 shop list start: empties it
void CNetLobby::onShopListStart() {
    ygBeginRead(in());
    ygEndRead(in());
    shopItems.clear();
}

// @yo2 0x006c1e40 0x5214 shop list end
void CNetLobby::onShopListEnd() {
    ygBeginRead(in());
    ygEndRead(in());
    flag(LB_ANS_SHOPLISTEND) = 2;
}

// @yo2 0x006c1e80 0x5211 SHOPRESULTEND: u32 result
void CNetLobby::onShopResultEnd() {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&shopResult);
    ygEndRead(p);
    flag(LB_ANS_SHOPRESULTEND) = 2;
}

// @yo2 0x006c1ef0 0x5215 PURCHASE_SHOP_ITEM_RESULT begin: nothing
static void purchaseBegin() {}

// @yo2 0x006c1f10 0x5216 PURCHASE_SHOP_ITEM_RESULT end
static void purchaseEnd(CNetLobby* l) { l->flag(LB_REQ_SHOPRESULT) = 2; }

// @yo2 0x006c1f30 0x5212 PURCHASE_SHOP_ITEM_RESULT: u32 result, then 13-byte lines (u32 item, u8 type, s32 card,
// u8 new, 3 x u8); types 0/1 add the card to the trunk
void CNetLobby::onPurchaseShopItem(CNetAccount& acc) {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&purchaseResult);
    while (ygReadPos(p) != -1) {
        ShopPurchase it{};
        ygGet32(p, &it.itemId);
        ygGet8(p, &it.type);
        ygGet32(p, (uint32_t*)&it.card);
        ygGet8(p, &it.isNew);
        for (uint8_t& x : it.b) ygGet8(p, &x);
        // @yo2 0x006c43d0 vector<ShopPurchase>::_Insert_n (0x14-byte records; the shop UI's lists use it too)
        purchased.push_back(it);
        if (it.type == 0 || it.type == 1) trunkAdd(acc.me, (uint16_t)it.card);
    }
    ygEndRead(p);
    if (purchaseResult == 0) cardDbSyncTrunk(acc.me);
}

// @yo2 0x006c2450 0x5310: s32 pid, u8, u8; recorded while recordMoves is on
void CNetLobby::on5310() {
    YgPacket* p = in();
    uint32_t pid;
    uint8_t a, b;
    ygBeginRead(p);
    ygGet32(p, &pid);
    ygGet8(p, &a);
    ygGet8(p, &b);
    ygEndRead(p);
    if (!recordMoves) return;
    // @yo2 0x006c56a0 deque<Mark5310>::push_back, a new 0x1000-byte block (512 records)
    // @yo2 0x006c6750 deque<Mark5310>::_Growmap
    // @yo2 0x006c69c0 deque<Mark5310> iterator set node
    marks.push_back({(int32_t)pid, (uint32_t)a | (uint32_t)b << 8});
    markCount++;
}

// u32 result, then u16 cards: the shape of 0x5401 / 0x8402 (0x8402 has a u8 count first)
static void readCards(CNetLobby* l, CNetAccount& acc, YgPacket* p, int n) {
    for (int i = 0; n < 0 ? ygReadPos(p) != -1 : i < n; i++) {
        uint16_t card;
        ygGet16(p, &card);
        l->setPackCard(i, card, isNewCard(card));
        trunkAdd(acc.me, card);
    }
}

// @yo2 0x006c26d0 0x5401 SD_GET_RESULT: u32 result, u16 per card of the structure deck
void CNetLobby::onSdGetResult(CNetAccount& acc) {
    YgPacket* p = in();
    clearPackCards();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&sdGetResult);
    readCards(this, acc, p, -1);
    ygEndRead(p);
    cardDbSyncTrunk(acc.me);
    flag(LB_REQ_SDGET) = 2;
}

// @yo2 0x006c2800 0x8302 TPPRESENTINFORESULT: u16 prize card
void CNetLobby::onTpPresentInfo() {
    YgPacket* p = in();
    uint16_t c = 0;
    ygBeginRead(p);
    ygGet16(p, &c);
    ygEndRead(p);
    tpVictoryCard = c;
    flag(LB_REQ_TPPRESENTINFO) = 2;
}

// @yo2 0x006c2880 0x8304 TPCARDGETRESULT: u32 result, u8, then always 4 x u16 cards (added whatever the result)
void CNetLobby::onTpCardGetResult(CNetAccount& acc) {
    YgPacket* p = in();
    uint8_t x;
    clearPackCards();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&tpCardGetResult);
    ygGet8(p, &x);
    readCards(this, acc, p, 4);
    ygEndRead(p);
    cardDbSyncTrunk(acc.me);
    flag(LB_REQ_TPCARDGET) = 2;
}

// @yo2 0x006c29c0 0x8402 STARTUP_PRESENTGET_RESULT: u32 result, u8 n, n x u16 cards (added whatever the result)
void CNetLobby::onStartupPresent(CNetAccount& acc) {
    YgPacket* p = in();
    uint8_t n = 0;
    clearPackCards();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&startupPresentResult);
    ygGet8(p, &n);
    readCards(this, acc, p, n < 80 ? n : 80);   // fix: the exe reads them into an 80-entry stack array
    ygEndRead(p);
    cardDbSyncTrunk(acc.me);
    flag(LB_REQ_STARTUPPRESENT) = 2;
}

// @yo2 0x006c2b30 0x5205 ITEMGET_RESULT: u16 n + n x u16 PBIN bits to set, u16 m + m x u16 cards
void CNetLobby::onItemGetResult(CNetAccount& acc) {
    YgPacket* p = in();
    uint16_t n, v;
    ygBeginRead(p);
    ygGet16(p, &n);
    for (int i = 0; i < n; i++) {
        ygGet16(p, &v);
        acc.bin.setFlag(v, true);
        newItemListAdd(NEW_ITEM_FLAGS, v);
    }
    ygGet16(p, &n);
    for (int i = 0; i < n; i++) {
        ygGet16(p, &v);
        trunkAdd(acc.me, v);
        newItemListAdd(NEW_ITEM_CARDS, v);
    }
    if (n) cardDbSyncTrunk(acc.me);
    ygEndRead(p);
    flag(LB_REQ_ITEMGET) = 2;
}

// @yo2 0x006c2d30 0x4231 NPCINFOLIST_START: u32 count; empties the NPC list
void CNetLobby::onNpcInfoListStart() {
    YgPacket* p = in();
    npcInfoClear();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&npcInfoCount);
    ygEndRead(p);
    if (npcInfoCount != 0) flag(LB_REQ_NPCINFOLIST) = 2;
}

// @yo2 0x006c30f0 one 61-byte NPC record
static void readNpcInfo(YgPacket* p, NpcInfo* n) {
    ygGet32(p, (uint32_t*)&n->id);
    ygGetBytes(p, n->name, 16);
    ygGetBytes(p, n->parts, 16);
    ygGet8(p, &n->b26);
    ygGet32(p, (uint32_t*)&n->u28);
    ygGet32(p, (uint32_t*)&n->u30);
    ygGet32(p, (uint32_t*)&n->threshold);
    ygGet32(p, (uint32_t*)&n->spot);
    ygGet32(p, (uint32_t*)&n->u3c);
    ygGet32(p, (uint32_t*)&n->prev);
}

// @yo2 0x006c2df0 0x4232 NPCINFOLIST_DATA: NPC records appended
void CNetLobby::onNpcInfoList() {
    YgPacket* p = in();
    ygBeginRead(p);
    while (ygReadPos(p) != -1) {
        NpcInfo n{};
        readNpcInfo(p, &n);
        npcInfoAdd(n);
    }
    ygEndRead(p);
}

// @yo2 0x006c3190 0x4237 NPCPRESENTTYPE: u32
void CNetLobby::onNpcPresentType() {
    YgPacket* p = in();
    uint32_t v = 0;
    ygBeginRead(p);
    ygGet32(p, &v);
    ygEndRead(p);
    npcPresentType = (int32_t)v;
}

// @yo2 0x006c31e0 0x5600 LIMITATIONLIST: (u32 index, u32 YO2 id, u32 Konami id, u8 copies) per card
void CNetLobby::onLimitationList() {
    YgPacket* p = in();
    ygBeginRead(p);
    while (ygReadPos(p) != -1) {
        uint32_t i, a, b;
        uint8_t c;
        ygGet32(p, &i);
        ygGet32(p, &a);
        ygGet32(p, &b);
        ygGet8(p, &c);
        limitationSet((int32_t)i, (int32_t)a, (int32_t)b, c);
        limitationCount((int32_t)i + 1);
    }
    ygEndRead(p);
}

// @yo2 0x006c32a0 0x5601 UNRELEASELIST: (u32 index, u32 YO2 id, u32 Konami id) per card
void CNetLobby::onUnreleaseList() {
    YgPacket* p = in();
    ygBeginRead(p);
    while (ygReadPos(p) != -1) {
        uint32_t i, a, b;
        ygGet32(p, &i);
        ygGet32(p, &a);
        ygGet32(p, &b);
        unreleasedSet((int32_t)i, (int32_t)a, (int32_t)b);
        unreleasedCount((int32_t)i + 1);
    }
    ygEndRead(p);
}

// @yo2 0x006c3340 0x4182 SAVE_DECK: s32 (dropped), 128 B, 512 B (the PBIN / NPCBIN shapes)
void CNetLobby::onSaveDeck() {
    YgPacket* p = in();
    memset(deckPbin, 0, sizeof deckPbin);
    memset(deckNpcBin, 0, sizeof deckNpcBin);
    uint32_t x;
    ygBeginRead(p);
    ygGet32(p, &x);
    ygGetBytes(p, deckPbin, 0x80);
    ygGetBytes(p, deckNpcBin, 0x200);
    ygEndRead(p);
}

bool CNetLobby::onRecvShop(CNetAccount& acc, int32_t id) {
    switch (id) {
    case 0x4903: onPurchasePackOpen(acc); break;
    case 0x4905: onPresentPackOpen(acc); break;
    case 0x8102: onDpAuthResult(acc); break;
    case 0x5100: onTourInfo(); break;
    case 0x5101: tourStart(this); break;
    case 0x5102: tourEnd(this); break;
    case 0x5103: onTourLottery(); break;
    case 0x5104: onTourLotResult(); break;
    case 0x5105: onTourPhase(); break;
    case 0x5106: onTourRound(); break;
    case 0x5108: onTourEntryStart(); break;
    case 0x5109: onTourEntryData(); break;
    case 0x5110: flag(LB_REQ_TOURENTRY) = 2; break;           // TOUR_ENTRY_END
    case 0x5111: onTourList(); break;
    case 0x5112: onTourEndResult(); break;
    case 0x5113: onTourTimer(); break;
    case 0x5114: onTourPCounter(); break;
    case 0x5115: onTourStatus(); break;
    case 0x5116: onTourSimpleEntryStart(); break;
    case 0x5117: onTourSimpleEntry(); break;
    case 0x5118: flag(LB_ANS_TOURSIMPLEENTRY) = 2; break;     // TOUR_SIMPLE_ENTRY_END
    case 0x5119: onTourSimpleList(); break;
    case 0x5120: onTourChkDuelStart(); break;
    case 0x8204: onUsbDpAuthResult(acc); break;
    case 0x5201: onMileageList(); break;
    case 0x5203: onMileageResultEnd(); break;
    case 0x5209: onShopList(); break;
    case 0x5211: onShopResultEnd(); break;
    case 0x5212: onPurchaseShopItem(acc); break;
    case 0x5213: onShopListStart(); break;
    case 0x5214: onShopListEnd(); break;
    case 0x5215: purchaseBegin(); break;
    case 0x5216: purchaseEnd(this); break;
    case 0x5310: on5310(); break;
    case 0x5401: onSdGetResult(acc); break;
    case 0x8302: onTpPresentInfo(); break;
    case 0x8304: onTpCardGetResult(acc); break;
    case 0x8402: onStartupPresent(acc); break;
    case 0x5205: onItemGetResult(acc); break;
    case 0x4231: onNpcInfoListStart(); break;
    case 0x4232: onNpcInfoList(); break;
    case 0x4233: flag(LB_REQ_NPCINFOLIST) = 2; break;         // NPCINFOLIST_END
    case 0x4237: onNpcPresentType(); break;
    case 0x5600: onLimitationList(); break;
    case 0x5601: onUnreleaseList(); break;
    case 0x4182: onSaveDeck(); break;
    default: return false;
    }
    return true;
}
