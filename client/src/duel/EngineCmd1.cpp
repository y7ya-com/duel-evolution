// Engine helpers used by the command handlers (0x007073d0..0x00709b10).
#include "EngineInternal.h"

#include <initializer_list>

#ifndef YO2_ENGINE_IN_EXE
DuelEngine g_eng;                          // 0x012c7880..0x012d2b64 (in the game: the exe's own block, see Engine.h)
#endif
DuelCardList& g_deckList = g_eng.deckList;   // the 0x6610 parser writes it

static EngSlot& slotAt(uint32_t j, int s) { return g_eng.pl[j & 1].slot[s]; }

// @yo2 0x007073d0 node of that type, key and value in a list
EngNode* engFindTypeKeyValue(uint32_t i, uint32_t key, uint32_t type, uint32_t value) {
    for (; i; i = g_eng.node[i].next) {
        const EngNode& e = g_eng.node[i];
        if ((uint32_t)(e.kind & 0xf) == type && e.key == key && e.value == value) return &g_eng.node[i];
    }
    return nullptr;
}

// @yo2 0x00707450
int engSlotHasTypeKeyValue(uint32_t j, int s, uint32_t key, uint32_t type, uint32_t value) {
    return engFindTypeKeyValue(slotAt(j, s).head, key, type, value) != nullptr;
}

// @yo2 0x007074c0 a slot's card word (0x00707500 is an identical copy)
// @yo2 0x00707500
uint32_t* engSlotWord(uint32_t j, int s) { return &slotAt(j, s).card; }

// @yo2 0x00707540
uint32_t engSlotCardId(uint32_t j, int s) { return cardId(slotAt(j, s).card); }

static uint32_t wordAt(uint32_t j, int zone, int index) {
    EngPlayer& p = g_eng.pl[j & 1];
    switch (zone) {
    case Z_HAND: return p.hand[index];
    case Z_EXTRA: return p.extra[index];
    case Z_DECK: return p.deck[index];
    case Z_GRAVE: return p.grave[index];
    case Z_BANISH: return p.banish[index];
    }
    if (zone + index > 10) index = 0;
    return p.slot[zone + index].card;
}

// @yo2 0x00707750 card id at (j, zone, index)
uint32_t engCardIdAt(uint32_t j, int zone, int index) { return cardId(wordAt(j, zone, index)); }
// @yo2 0x007078e0 uid at (j, zone, index)
uint32_t engUidAt(uint32_t j, int zone, int index) { return cardUid(wordAt(j, zone, index)); }

// @yo2 0x00707a90 position (def) of a field slot, 0 for the piles
uint16_t engDefAt(uint32_t j, int zone, int index) {
    if (zone > 10 && zone < 0x10) return 0;
    if (zone + index > 10) index = 0;
    return slotAt(j, zone + index).def;
}

// @yo2 0x00707b00 the card at (j, zone, index) is face-up / known to both players
uint32_t engFaceUpAt(uint32_t j, int zone, int index) {
    EngPlayer& p = g_eng.pl[j & 1];
    switch (zone) {
    case Z_HAND: return engHandCardShown(j, index);
    case Z_EXTRA: return 0;
    case Z_GRAVE: return 1;
    case Z_BANISH: {
        uint8_t v = p.banishView[index][0];
        if (v != 0x40) return v != 0xc0;
        return p.banishView[index][1] >> 1 & 1;
    }
    case Z_DECK: {
        uint32_t uid = cardUid(p.deck[index]);
        if (engSlotHasKeyValue(j, 11, 0x12a1, uid) || engSlotHasKeyValue(j, 11, 0x1549, uid) ||
            engSlotHasKeyValue(j, 11, 0x18db, uid))
            return ~g_eng.flags >> 2 & 1;
        if ((p.slot[11].flags & 8) && (g_eng.flags & 8)) return 0;
        return g_eng.flags >> 2 & 1;
    }
    }
    if (zone + index > 10) index = 0;
    return p.slot[zone + index].faceUp;
}

// @yo2 0x00707d00 cards in a pile, or whether a field slot is occupied
uint32_t engCountAt(uint32_t j, int zone) {
    EngPlayer& p = g_eng.pl[j & 1];
    switch (zone) {
    case Z_HAND: return p.handCount;
    case Z_EXTRA: return p.extraCount;
    case Z_DECK: return p.deckCount;
    case Z_GRAVE: return p.graveCount;
    case Z_BANISH: return p.banishCount;
    }
    return cardId(p.slot[zone].card) != 0;
}

// @yo2 0x00707e40 bit n of the global engine flags (command 0x09)
void engSetFlag(int bit, int on) {
    if (on) g_eng.flags |= 1u << (bit & 31);
    else g_eng.flags &= ~(1u << (bit & 31));
}

// @yo2 0x00707e90 bit n of a player's flags (slot 11)
void engSetPlayerFlag(uint32_t j, int bit, int on) {
    uint32_t& f = slotAt(j, 11).flags;
    if (on) f |= 1u << (bit & 31);
    else f &= ~(1u << (bit & 31));
}

// @yo2 0x00707f20 bit n of a slot's flags
void engSetSlotFlag(uint32_t j, int s, int bit, int on) {
    uint32_t& f = slotAt(j, s).flags;
    if (on) f |= 1u << (bit & 31);
    else f &= ~(1u << (bit & 31));
}

// @yo2 0x00707fc0 j may activate `card` now (LP costs, global locks)
int engMayActivate(uint32_t j, int card, int check) {
    if (check && eng6f4dc0(card, -1)) return 0;
    if (card == 0x1d16 && engSlotHasKey(j, 11, 0x1d16)) return 0;
    if (check) {
        if (g_eng.pl[j & 1].lp <= engCountLiveAll(0x132c) * 500) return 0;
        if (!cardIsMonster(card) && engSlotHasKey(0, 11, 0x1407)) return 0;
    }
    return 1;
}

// @yo2 0x007080b0 j still has a turn action left under the 0x20000 / 0x1c33 / 0x1d20 counting (flag set: only if
// the latest count node is not a type 2 one)
int engActionLeft(uint32_t j) {
    if (!(slotAt(j, 11).flags & 0x20000)) return 1;
    int key;
    if (engSlotHasKey(j, 11, 0x1d20)) key = 0x1d20;
    else if (engSlotHasKey(j, 11, 0x1c33)) key = 0x1c33;
    else return 0;
    return !engSlotHasNode(j, 11, key, 2);
}

// @yo2 0x00708150 j may special summon (nothing locks it)
int engMaySpecialSummon(uint32_t j) {
    if (g_eng.vcca64 == 6) return 0;
    return !engSlotHasKeyValue(j, 11, 0x1679, 2) && !engSlotHasKey(j, 11, 0x1a1b) && !engCountLive(1 - j, 0x1e5a, -1);
}

// @yo2 0x00708210 j may summon in the ways of `kinds` (1 normal, 2 special, 4 set, 8 flip); `card` exempts itself
// from the "only this card" locks
int engMaySummon(uint32_t j, uint32_t kinds, int card) {
    if ((kinds & 1) && engCountLiveAll(0x15a9) && engCountMonsters(j) > 1) return 0;
    if (kinds & 2) {
        if (g_eng.vcca64 == 6) return 0;
        if (engCountLiveAll(0x135d) && !engMayNormalSummon(j)) return 0;
        if (engSlotHasKey(j, 11, 0x1a1b) || engCountLive(1 - j, 0x1e5a, -1)) return 0;
    }
    if (kinds & 3) {
        if (g_eng.vcca64 == 4) return 0;
        for (int k : {0x1578, 0x1a92, 0x1cda, 0x1d9a, 0x1436})
            if (engSlotHasKey(j, 11, k)) return 0;
        if (engCountLive(j, 0x1972, -1)) return 0;
        for (int k : {0x1d45, 0x1dc6, 0x1df7})
            if (engSlotHasKey(j, 11, k)) return 0;
    }
    if (kinds & 8) {
        if (g_eng.vcca64 == 5 || g_eng.vc874c || (slotAt(j, 11).flags & 0x400000)) return 0;
        if (engCountLiveAll(0x147f) || engCountLiveAll(0x1ae1) || engCountLive(1 - j, 0x1ae8, -1) || engCountLiveAll(0x1ced) ||
            engSlotHasKey(j, 11, 0x1a29))
            return 0;
    }
    if ((kinds & 5) && g_eng.turnPlayer == j && (engCountCardValue(1 - j, 0x1dd9, 2) || engCountCardValue(j, 0x1dd9, 1))) return 0;
    if ((kinds & 9) && engSlotHasKey(0, 11, 0xe99)) return 0;
    if ((kinds & 0xb) && engSlotHasExpiring(j, 11, 0x15ad)) return 0;
    if (kinds & 0xd) {
        for (int k : {0x12d2, 0x12de})
            if (card != k && engSlotHasKey(j, 11, k)) return 0;
        if (card != 0x13ff && engCountLive(j, 0x13ff, -1)) return 0;
        for (int k : {0x1710, 0x1973, 0x1d1e})
            if (card != k && engSlotHasKey(j, 11, k)) return 0;
        if (engCountLiveAll(0x12b1)) return 0;
        if ((uint16_t)g_eng.pl[j & 1].v20 > 1 && engCountLiveAll(0x1de4)) return 0;
    }
    return !engSlotHasKeyValue(j, 11, 0x1679, 1);
}

// @yo2 0x007081e0
int engMaySpecialSummon2(uint32_t j) { return engMaySummon(j, 2, 0); }

// @yo2 0x00708780 special summons allowed and no 0x135d lock at all
int engMaySpecialSummonStrict(uint32_t j) {
    if (g_eng.vcca64 == 6 || engCountLiveAll(0x135d)) return 0;
    return !engSlotHasKey(j, 11, 0x1a1b) && !engCountLive(1 - j, 0x1e5a, -1);
}

// @yo2 0x00708800
int engMaySpecialSummonBasic(uint32_t j) {
    if (g_eng.vcca64 == 6) return 0;
    return !engSlotHasKey(j, 11, 0x1a1b) && !engCountLive(1 - j, 0x1e5a, -1);
}

// @yo2 0x00708870
int engMayNormalSummon(uint32_t j) { return engMaySummon(j, 1, 0); }
// @yo2 0x007088a0
int engMaySet(uint32_t j) { return engMaySummon(j, 4, 0); }

// @yo2 0x007088d0 positions may be changed (no 0x13f2 / 0x1cec lock)
int engMayChangePosition() { return g_eng.vcca64 != 7 && !engCountLiveAll(0x13f2) && !engCountLiveAll(0x1cec); }

// @yo2 0x00708920
int engMayFlipSummonCard(uint32_t j, int card) { return engMaySummon(j, 8, card); }
// @yo2 0x00708950
int engMayFlipSummon(uint32_t j) { return engMaySummon(j, 8, 0); }
// @yo2 0x00708980 cards may be added from the deck (no 0x1dd1)
int engMaySearchDeck() { return !engCountLiveAll(0x1dd1); }

// @yo2 0x007089b0 j is under a "one action per turn" lock
int engActionLocked(uint32_t j) {
    return (slotAt(j, 11).flags & 0x20000) || engSlotHasKey(j, 11, 0x12f3) || engSlotHasKey(j, 11, 0x1d35) ||
           engSlotHasKey(j, 11, 0x1ca4);
}

// @yo2 0x00708a50
int engRaceAttrAllowed0(uint32_t j, int card) { return engRaceAttrAllowed(j, card, 0); }

// @yo2 0x00708a80 a monster of card's race / attribute may join j's field under the "one race" (0x15f6) and
// "one attribute" (0x1efe) cards; zone 0xe takes them from the graveyard pick instead of the card
int engRaceAttrAllowed(uint32_t j, int card, int zone) {
    int race, attr;
    if (zone == 0xe) {
        race = engEffRace(card);
        attr = engEffAttr(card);
    } else {
        race = cardRace(card);
        attr = cardAttr(card);
    }
    if (engCountLiveAll(0x15f6)) {
        uint32_t m = 0;
        for (int s = 0; s < 5; s++)
            if (slotAt(j, s).faceUp) {
                uint16_t r = (uint16_t)engRace(j, s);
                if (r < 0x16) m |= 1u << r;
            }
        if (engPopCount(~(1u << (race & 31)) & m)) return 0;
    }
    if (engCountLiveAll(0x1efe)) {
        uint32_t m = 0;
        for (int s = 0; s < 5; s++)
            if (slotAt(j, s).faceUp) m |= engAttrMask(j, s) & 0xfe;
        if (engPopCount(~(1u << (attr & 31)) & m)) return 0;
    }
    return 1;
}

// @yo2 0x00708c10
int engTrue708c10(uint32_t, int) { return 1; }

// @yo2 0x00708c30 the six attribute-lock cards 0x1ae2..0x1ae7 and 0x197d allow attribute `attr`
int engAttrAllowed(uint32_t j, int attr) {
    for (int c = 0x1ae2; c <= 0x1ae7; c++)
        if (cardAttr(c) != attr && engCountLiveAll(c)) return 0;
    return !engCountCardValue(1 - j, 0x197d, attr);
}

// @yo2 0x00708d90
int engMayUseCard0(uint32_t j, int card) { return engMayUseCard(j, card, 0); }

// @yo2 0x00708dc0 j may play `card` from `zone` (hand: activation cost and LP locks; deck: no search lock)
int engMayUseCard(uint32_t j, int card, int zone) {
    int race, attr;
    if (zone == 0xe) {
        race = engEffRace(card);
        attr = engEffAttr(card);
    } else {
        race = cardRace(card);
        attr = cardAttr(card);
    }
    if (!engTrue708c10(j, race) || !engAttrAllowed(j, attr)) return 0;
    if (zone == Z_DECK) {
        if (!engMaySearchDeck()) return 0;
    } else if (zone == Z_HAND) {
        if (!engMayActivate(j, card, 1)) return 0;
        if (cardRace(card) != 0xd && g_eng.pl[j & 1].lp <= engCountLiveAll(0x132c) * 500 + engCountLiveAll(0x1df4) * 1000) return 0;
    }
    if (cardAtkRaw(card) < 0x3e9 && engCountLiveAll(0x1e6b)) return 0;
    return 1;
}

// @yo2 0x00708f40
int engMaySummonCard0(uint32_t j, int card) { return engMaySummonCard(j, card, 0); }
// @yo2 0x00708f70
int engMaySummonCard(uint32_t j, int card, int zone) { return engRaceAttrAllowed(j, card, zone) && engMayUseCard(j, card, zone); }
// @yo2 0x00708fc0
int engMaySummonFrom(uint32_t j, int card, int zone) { return engMaySpecialSummonCard(j, j, card, zone, 1); }

// @yo2 0x00708ff0 j may special summon `card` from `zone` onto `owner`'s field (special summon conditions of the
// cards themselves: ritual / fusion / contact requirements); full = also the field restrictions of the owner
int engMaySpecialSummonCard(uint32_t j, uint32_t owner, int card, int zone, int full) {
    if (!full) {
        if (!engCountLiveAll(0x135d)) {
            if (!engMaySpecialSummonBasic(j)) return 0;
        } else {
            full = 1;
        }
    }
    if (!engCanBeRevived(card) || engNoNormalSummon(card)) return 0;
    uint32_t who = owner;
    int key = card;
    bool check = false;
    switch (card) {
    case 0x1c53:
        if (zone == Z_HAND || zone == Z_DECK) return 0;
        break;
    case 0x164a: case 0x164b: case 0x164c: case 0x164d: case 0x164e: case 0x164f:
        if (!engCountTextProp(j, engGuardianWeapon(card))) return 0;
        break;
    case 0xe9f: case 0x158b: case 0x160f: case 0x1be9: case 0x1d66: case 0x1e73:
        check = full != 0;
        break;
    case 0x1c0f: {
        const uint16_t* p = engPtr16(g_eng.vc860c);
        if (p && cardIsMonster(*p)) return 0;
        break;
    }
    case 0x1c4c:
        if (zone != 0xe) return 0;
        break;
    case 0x1dbe:
        if (full) {
            int n[2] = {0, 0};
            for (int k = 0; k < 5; k++)
                if (engZoneFree(owner, k)) n[engZoneOpen(owner, k, 0) & 1]++;
            if ((n[0] > 0) + n[1] < 3) return 0;
        }
        break;
    case 0x1d98:
        who = j;
        check = true;
        break;
    case 0x1d3c: case 0x1e66:
        if (full) {
            if (engCountTextProp(0, card)) return 0;
            who = 1;
            check = true;
        }
        break;
    case 0x1d87:
        if (zone == Z_DECK) return 0;
        break;
    }
    if (check && engCountTextProp(who, key)) return 0;
    if (!engMayUseCard(j, card, zone)) return 0;
    return !full || engRaceAttrAllowed(owner, card, zone);
}

// @yo2 0x00709330 per player (bits 0-2, 16-18): 1 no draws, 2 no monster draws, 4 no draws by its owner's effects
uint32_t engDrawLocks() {
    uint32_t m = 0;
    for (uint32_t j = 0; j < 2; j++) {
        uint32_t v = 0;
        if (engDrawLockActive()) {
            v = engCountLive(j, 0x1332, -1) != 0;
            if (engCountLive(j, 0x1a27, -1)) v = 1;
            if (engCountLive(j, 0x1a1a, -1)) v = 1;
            if (engCountLive(j, 0x1a33, -1)) v |= 2;
            if (engCountLive(j, 0x1444, -1)) v |= 4;
        }
        m |= v << (j * 16);
    }
    return m;
}

// @yo2 0x00709410 the card of uid may be drawn by its owner
int engMayDrawUid(uint32_t uid) { return engMayDraw(uid & 1, cardIsMonster(g_eng.uid[uid].card)); }

// @yo2 0x00709450 j may draw (a monster, if `monster`)
int engMayDraw(uint32_t j, int monster) {
    uint32_t m = engDrawLocks();
    if (m & 0x10001) return 0;
    if ((m & 0x20002) && monster) return 0;
    return !(4u << ((j & 1) << 4) & m);
}

// @yo2 0x007094a0 draws allowed for j; when not, *who = 1 if the lock is the opponent's
int engDrawAllowed(uint32_t j, int monster, uint32_t* who) {
    uint32_t m = engDrawLocks();
    int ok = 1;
    for (uint32_t k = 0; k < 2; k++) {
        uint32_t p = k ^ j, v = m >> (p << 4);
        if ((v & 1) || ((v & 2) && monster) || ((v & 4) && j == p)) {
            if (who) *who = p != j;
            ok = 0;
        }
    }
    return ok;
}

// @yo2 0x00709530 j may draw n cards (enough cards, and a revealed top card that is a monster under a lock)
int engMayDrawN(uint32_t j, uint32_t n) {
    EngPlayer& p = g_eng.pl[j & 1];
    if (p.deckCount < n) return 0;
    int monster = 1;
    if (n == 1 && (g_eng.flags & 4)) monster = cardIsMonster(cardId(p.deck[0]));
    return engMayDraw(j, monster);
}

// @yo2 0x007095b0
int engTrue7095b0() { return 1; }
// @yo2 0x007095d0
int engMayAddToHand0(uint32_t j, uint32_t k) { return engMayAddToHand(j, k, nullptr); }

// @yo2 0x00709600 cards may be added to k's hand (0x1d36 on either side forbids it; *who = 1 if it is k's opponent's)
int engMayAddToHand(uint32_t j, uint32_t k, uint32_t* who) {
    if (engDrawLockActive() && engSearchAllowed(j, k)) {
        for (uint32_t x = 0; x < 2; x++) {
            uint32_t p = (1 - k) ^ x;
            if (engCountLive(p, 0x1d36, -1)) {
                if (who) *who = p != k;
                return 0;
            }
        }
    }
    return 1;
}

// @yo2 0x00709690 with 0x159d on the field only k's 0x158b lets it search
int engSearch159d(uint32_t, uint32_t k) { return !engCountLiveAll(0x159d) || engCountLive(k, 0x158b, -1); }
// @yo2 0x007096d0 the draw / search locks apply (no 0x1eb2 on the field)
int engDrawLockActive() { return !engCountLiveAll(0x1eb2); }
// @yo2 0x00709700
int engSearchAllowed(uint32_t j, uint32_t k) {
    if (!engDrawLockActive() || engCountLive(1 - j, 0x1480, -1)) return 0;
    return engSearch159d(j, k);
}

// @yo2 0x00709770 j may send cards from the deck to the graveyard / mill (milling locks)
int engMayMill(uint32_t j, int bySelf) {
    if (bySelf && engSlotHasKey(j, 11, 0x1805)) return 0;
    for (int k : {0x1850, 0x1a06, 0x1bf6, 0x1ded})
        if (engSlotHasKey(j, 11, k)) return 0;
    if (bySelf && engCountLive(j, 0xebb, -1) && engGraveCountRace(j, 4)) return 0;
    return !engCountLive(j, 0x18c4, -1);
}

// @yo2 0x00709880 no 0x1ce5 and no 0x1dd1 on the field
int engMayShuffleSearch() { return !engCountLiveAll(0x1ce5) && !engCountLiveAll(0x1dd1); }

// @yo2 0x007098c0 the engine is idle and waits for j: the human's move dialog, or a pending AI/automatic move
int engWaitingFor(uint32_t j) {
    if (g_eng.running || g_eng.queued) return 0;
    if (g_eng.ctl[j & 1] == 1) return g_eng.turnPlayer == j && g_eng.vcc2fc && g_eng.vcc304 == 3;
    if (j == g_eng.viewer) return g_eng.inputClass || duelViewBusy(0x32) || duelViewBusy(0x33);
    return !(g_eng.vcc820 & 1) && engLogPending();
}

// @yo2 0x00709980 j can mill n cards (n < 0: the opponent of j, -n cards)
int engCanMill(uint32_t j, int n) {
    j ^= n < 0;
    if (g_eng.phase && engCountLive(1 - j, 0x178b, -1)) return 0;
    if (!g_eng.phase && engSlotHasExpiringValue(j, 11, 0x1885, 0)) return 0;
    uint32_t need = n < 0 ? (uint32_t)-n : (uint32_t)n;
    return need <= g_eng.pl[j & 1].deckCount;
}

// @yo2 0x00709a60 hand size limit for j at the end of the turn (6; 5 or 7 with the cards that change it; 0xffff = none)
int engHandLimit(uint32_t j) {
    int none = engCopyStampLast(0x1401), five = engCountCopies0(1 - j, 0x1800), seven = (int)engSlotKeyValue(j, 11, 0x159f);
    if (none && five < none) return 0xffff;
    int lim = five > 0 && seven < five ? 5 : 6;
    if (seven >= 1 && five < seven) lim = 7;
    return lim;
}

// @yo2 0x00709af0
int engTrue709af0() { return 1; }

// @yo2 0x00709b10 queue an engine command (0x6202 type 0); refused while the engine is shut down (cc848 == 3)
void engQueue(uint16_t b, uint16_t p0, uint16_t p1, uint16_t p2) {
    if (g_eng.ctl[0] == 3 || g_eng.queued >= 0x100) return;
    g_eng.queue[g_eng.queued++] = EngCmd{b, p0, p1, p2};
}

// @yo2 0x00709ba0 the same without the shutdown check
void engQueueAlways(uint16_t b, uint16_t p0, uint16_t p1, uint16_t p2) {
    if (g_eng.queued >= 0x100) return;
    g_eng.queue[g_eng.queued++] = EngCmd{b, p0, p1, p2};
}

// @yo2 0x00709c20 an immediate command (runs before the queue: the duel log's "interrupt")
void engQueueNow(uint16_t b, uint16_t p0, uint16_t p1, uint16_t p2) {
    g_eng.vcc82c &= 0xff00;
    EngCmd* c = engAt<EngCmd>(0x012cc824);
    *c = EngCmd{b, p0, p1, p2};
    g_eng.vcc820 |= 4;
}

// @yo2 0x00709c90 the running command is done
void engCmdDone() { g_eng.running = 0; }

// @yo2 0x0070a1b0 run the immediate command (step byte in the low byte of cc82c)
int engRunNow() {
    uint32_t step = g_eng.vcc82c & 0xff;
    if (step == 0) {
        g_eng.cur = *engAt<EngCmd>(0x012cc824);
        g_eng.vcc82c = (g_eng.vcc82c & ~0xffu) | ((step + 1) & 0xff);
        g_eng.running = 1;
        g_eng.step = 0;
    } else if (step == 2) {
        engLogRecord6(8, 0, 0, 0);
        g_eng.vcc820 &= ~4u;
        return 1;
    } else if (step != 1) {
        return 1;
    }
    engDispatch();
    if (g_eng.running) return 1;
    g_eng.vcc82c = (g_eng.vcc82c & ~0xffu) | (((g_eng.vcc82c & 0xff) + 1) & 0xff);
    engLogRecord6(8, 0, 0, 0);
    g_eng.vcc820 &= ~4u;
    return 1;
}

// @yo2 0x0070a290 run the engine for one frame: start the next queued command or keep the current one going.
// 0 = idle (nothing queued), 1 = busy. A running DUEL_VIEW 0 holds everything.
int engRun() {
    if (duelViewBusy(0)) return 1;
    if (g_eng.vcc2f0 && (g_eng.vcc820 & 4)) return engRunNow();
    switch (g_eng.vcc380) {
    case 0:
        if (!g_eng.queued) return 0;
        g_eng.cur = g_eng.queue[0];
        g_eng.queued--;
        for (int i = 0; i < g_eng.queued; i++) g_eng.queue[i] = g_eng.queue[i + 1];
        g_eng.vcc820 |= 8;
        g_eng.running = 1;
        if (g_eng.vcc2f0) {
            engLogRecord(7, -1, &g_eng.cur, 8);   // the duel log records it
            g_eng.vcc820 &= ~8u;
        }
        g_eng.step = 0;
        g_eng.vcc380++;
        g_eng.vc80b4 = 0;
        [[fallthrough]];
    case 1: {
        int scene = ndLogScene();
        if (scene == 0xc9 || scene == 0xca || scene == 0xd2) eng_722690();
        else if (scene == 0xd5 || scene == 0xd6) eng_72ca70();
        else engDispatch();
        if (g_eng.running) return 1;
        g_eng.vcc380++;
        [[fallthrough]];
    }
    case 2:
        if (!(g_eng.vcc820 & 8)) return 1;
        g_eng.vcc380 = 0;
        return g_eng.queued != 0;
    }
    return 0;
}

// @yo2 0x00709cb0 run the current command's handler (id = low 12 bits of B); unknown ids finish at once
void engDispatch() {
    g_eng.inDispatch = 1;
    switch (g_eng.cur.b & 0xfff) {
        case 0x01: engCmdDuelStart(); break;
        case 0x02: engCmdClearMarkers(); break;
        case 0x03: engCmdEndTurn(); break;
        case 0x04: engCmdTurnChange(); break;
        case 0x05: engCmdDuelEnd(); break;
        case 0x06: engCmdExodia(); break;
        case 0x07: engCmdExodiaPieces(); break;
        case 0x08: engCmd08(); break;
        case 0x09: engCmdSetFlag(); break;
        case 0x0a: engCmdView3(); break;
        case 0x0b: engCmdRunExtra(); break;
        case 0x0c: engCmdPhaseDraw(); break;
        case 0x0d: engCmdPhaseStandby(); break;
        case 0x0e: engCmdPhaseMain1(); break;
        case 0x0f: engCmdPhaseBattle(); break;
        case 0x10: engCmdPhaseMain2(); break;
        case 0x11: engCmdPhaseEnd(); break;
        case 0x12: engCmdChainSet(); break;
        case 0x13: engCmdChainRun(); break;
        case 0x14: engCmdFieldChange(); break;
        case 0x15: engCmdBattleInit(); break;
        case 0x16: engCmd16(); break;
        case 0x17: engCmdBattleRun(); break;
        case 0x18: engCmd18(); break;
        case 0x19: engCmdAttack(); break;
        case 0x1a: engCmdDirectAttack(); break;
        case 0x1b: engCmdAttacked(); break;
        case 0x1c: engCmdAttackEnd(); break;
        case 0x1d: engCmdBattle6(); break;
        case 0x1e: engCmdBattle6End(); break;
        case 0x1f: engCmdBattle9(); break;
        case 0x20: engCmdAttackAgain(); break;
        case 0x21: engCmdSlotFlag2(); break;
        case 0x22: engCmdSetPlayerFlag(); break;
        case 0x23: engCmdLoseLp(); break;
        case 0x24: engCmdLpGain(); break;
        case 0x25: engCmdLpLose(); break;
        case 0x26: engCmdLpSet(); break;
        case 0x27: engCmdLpReset(); break;
        case 0x28: engCmdRunList(); break;
        case 0x29: engCmdLockOn(); break;
        case 0x2a: engCmdSetSlotFlag(); break;
        case 0x2b: engCmd2b(); break;
        case 0x2c: engCmdSummonEffect(); break;
        case 0x2d: engCmdSummon(); break;
        case 0x2e: engCmdReveal(); break;
        case 0x2f: engCmdHappen(); break;
        case 0x30: engCmdHappenField(); break;
        case 0x31: engCmdDestroy(); break;
        case 0x32: engCmdExplode(); break;
        case 0x33: engCmdBanish(); break;
        case 0x34: engCmdChangePosition(); break;
        case 0x35: engCmdFlip(); break;
        case 0x36: engCmdAddNode(); break;
        case 0x37: engCmdRemoveNode(); break;
        case 0x38: engCmdSetNode(); break;
        case 0x39: engCmdRestamp(); break;
        case 0x3a: engCmdSetValue(); break;
        case 0x3b: engCmdTurnCounter(); break;
        case 0x3c: engCmdCounter(); break;
        case 0x3d: engCmdSlotMove(); break;
        case 0x3e: engCmdSlotSwap(); break;
        case 0x3f: engCmdMove(); break;
        case 0x40: engCmdMoveAt(); break;
        case 0x41: engCmdMoveToField(); break;
        case 0x42: engCmdLink(); break;
        case 0x43: engCmdView22(); break;
        case 0x44: engCmdSetCard(); break;
        case 0x45: engCmdSummoned(); break;
        case 0x46: engCmdTribute(); break;
        case 0x47: engCmdCounterNode(); break;
        case 0x48: engCmdToken(); break;
        case 0x49: engCmdShuffleMonsters(); break;
        case 0x4a: engCmdTributeMark(); break;
        case 0x4b: engCmdMaterialMark(); break;
        case 0x4c: engCmdMaterialStart(); break;
        case 0x4d: engCmdFusion(); break;
        case 0x4e: engCmdShuffleHand(); break;
        case 0x4f: engCmdHandToMonster(); break;
        case 0x50: engCmdHandToSpell(); break;
        case 0x51: engCmdHandShow(); break;
        case 0x52: engCmdHandOpen(); break;
        case 0x53: engCmdHandPick(); break;
        case 0x54: engCmdShuffleDeck(); break;
        case 0x55: engCmdDraw(); break;
        case 0x56: engCmd56(); break;
        case 0x57: engCmdRestack(); break;
        case 0x58: engCmdFlipTop(); break;
        case 0x59: engCmdReverseDecks(); break;
        case 0x5a: engCmd5a(); break;
        case 0x5b: engCmdDeckReset(); break;
        case 0x5c: engCmdCoin(); break;
        case 0x5d: engCmdDie(); break;
        case 0x5e: engCmdView3a(); break;
        case 0x5f: engCmdView3c(); break;
        case 0x60: engCmdSummonPhrase(); break;
        case 0x61: engCmdView45(); break;
        case 0x62: engCmdChainPhrase(); break;
        case 0x63: engCmd63(); break;
        case 0x64: engCmd64(); break;
        case 0x65: engCmd65(); break;
        case 0x66: engCmdMessage(); break;
        case 0x67: engCmdView3e(); break;
        case 0x68: engCmdChainEntry(); break;
        case 0x69: engCmdWait69(); break;
        case 0x6a: engCmdChainEnd(); break;
        case 0x6b: engCmdBattleOver(); break;
        default: g_eng.running = 0; break;
    }
}
