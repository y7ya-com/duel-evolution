// Board primitives (0x006ea840..0x006ed400): card classification on slots, placing cards, finding uids, piles.
#include "EngineInternal.h"

static EngSlot& slotAt(uint32_t j, int s) { return g_eng.pl[j & 1].slot[s]; }

// @yo2 0x006ea840 spell zone: not a trap, or a trap with flag 11; monster zone: a "trap monster" (flag 12) that is a spell
int engSlotSpellish(uint32_t j, int s) {
    EngSlot& sl = slotAt(j, s);
    if (s > 4) return !cardIsTrap(cardId(sl.card)) ? 1 : sl.flags >> 11 & 1;
    return (sl.flags & 0x1000) && cardIsSpell(cardId(sl.card));
}

// @yo2 0x006ea920 a trap: in the monster zone as a trap monster (flag 12), or set in the spell zone without flag 11
int engSlotTrap(uint32_t j, int s) {
    EngSlot& sl = slotAt(j, s);
    if (s < 5) return (sl.flags & 0x1000) && cardIsTrap(cardId(sl.card));
    return !(sl.flags & 0x800) && cardIsTrap(cardId(sl.card));
}

// @yo2 0x006ea9f0 flag 12: a trap card treated as a monster
int engSlotTrapMonster(uint32_t j, int s) { return slotAt(j, s).flags >> 12 & 1; }

// @yo2 0x006eaa30
int engSlot6eaa30(uint32_t j, int s) { return engSlotHasKey(j, s, 0x1e40) || engIsTunerKind(cardId(slotAt(j, s).card)); }

// @yo2 0x006eaae0 the slot's card counts as an effect monster (gemini-style cards only while their effect is on)
int engSlotEffectMonster(uint32_t j, int s, int ignoreNegate) {
    EngSlot& sl = slotAt(j, s);
    uint32_t raw = cardId(sl.card);
    if (sl.faceUp) {
        if (raw == 0x1636 || raw == 0x172f || raw == 0x1809 || raw == 0x1aca) return sl.flags >> 12 & 1;
        if (engIsGeminiKind(engCardAt(j, s))) {
            if (ignoreNegate || (sl.flags & 0x100)) return 1;
            return engGeminiOn(j, s) != 0;
        }
    }
    return engIsEffectKind(raw);
}

// @yo2 0x006eaab0
int engSlotEffectMonster0(uint32_t j, int s) { return engSlotEffectMonster(j, s, 0); }
// @yo2 0x006eac00
int engSlotEffectMonster1(uint32_t j, int s) { return engSlotEffectMonster(j, s, 1); }

// @yo2 0x006eac30 the monster has no usable effect (normal monsters, tokens, negated ones)
int engSlotNoEffect(uint32_t j, int s) {
    EngSlot& sl = slotAt(j, s);
    switch (cardKind(cardId(sl.card))) {
    case 0: case 10: case 0xd: case 0xf:
        return 1;
    case 0xe:
        return !engSlotEffectMonster0(j, s);
    default:
        return engIsGeminiKind(engCardAt(j, s)) && sl.faceUp && !(sl.flags & 0x100) && !engGeminiOn(j, s);
    }
}

// @yo2 0x006ead40 the i-th graveyard card is a normal monster (kind 0 / 0xf, or kind 9 without bit 22)
int engGraveNormal(uint32_t j, int i) {
    uint32_t w = g_eng.pl[j & 1].grave[i];
    switch (cardKind(cardId(w))) {
    case 0: case 0xf: return 1;
    case 9: return ~w >> 22 & 1;
    }
    return 0;
}

// @yo2 0x006eadf0 which of the seven "Ojama"-style cards fit a pattern (x = 1..6)
int engCardPattern(int card, int x) {
    switch (card) {
    case 0x168c: case 0x168d: case 0x168f: return x == 3;
    case 0x168e: case 0x1692: return x == 1 || x == 3 || x == 6;
    case 0x1690: case 0x1691: return x == 2 || x == 5;
    }
    return 0;
}

// @yo2 0x006eadc0
int engCardAttrIs(int card, int attr) { return cardAttr(card) == attr; }
// @yo2 0x006eae80 copy a card word
void engWordCopy(uint32_t* dst, const uint32_t* src) { *dst = *src; }
// @yo2 0x006eaea0
void engWordSwap(uint32_t* a, uint32_t* b) {
    uint32_t t = *a;
    *a = *b;
    *b = t;
}
// @yo2 0x006eaed0
int engWordEqual(const uint32_t* a, const uint32_t* b) { return *a == *b; }

// @yo2 0x006eaf00 take a serial for a new card (tokens): returns the current one (EAX keeps the old value; Ghidra
// shows the function as void) and advances, wrapping to baseSerial + 2 past 0xff
uint32_t engNextSerial(uint32_t j) {
    EngPlayer& p = g_eng.pl[j & 1];
    uint32_t s = p.nextSerial;
    if (++p.nextSerial > 0xff) p.nextSerial = p.baseSerial + 2;
    return s;
}

static void bumpMoves(uint32_t w) {
    EngUid& u = g_eng.uid[cardUid(w)];
    u.moves = (uint16_t)((u.moves & ~3) | ((u.moves + 1) & 3));
}

// @yo2 0x006eaf70 put card word `w` on slot s with explicit position and face
void engPlaceCard(uint32_t j, int s, const uint32_t* w, uint16_t def, uint32_t faceUp) {
    EngSlot& sl = slotAt(j, s);
    sl = EngSlot{};
    engWordCopy(&sl.card, w);
    sl.turn = (uint16_t)++g_eng.stamp;
    sl.def = def;
    sl.faceUp = (uint16_t)faceUp;
    bumpMoves(*w);
    sl.flags |= 0x200000;
    engSetSlotFlag(j, s, 10, faceUp);
    engSetSlotFlag(j, s, 0, j != cardOwner(*w));
}

// @yo2 0x006eb090 put card word `w` on slot s (summon / set); faceUp = 0 means set (flag 20)
void engPutCard(uint32_t j, int s, const uint32_t* w, int faceUp) {
    EngSlot& sl = slotAt(j, s);
    sl = EngSlot{};
    engWordCopy(&sl.card, w);
    sl.turn = (uint16_t)++g_eng.stamp;
    sl.def = 0;
    sl.faceUp = (uint16_t)faceUp;
    bumpMoves(*w);
    sl.value = 0;
    engSetSlotFlag(j, s, 0, j != cardOwner(*w));
    engSetSlotFlag(j, s, 0x14, faceUp == 0);
    engSetSlotFlag(j, s, 10, faceUp);
}

// @yo2 0x006eb1b0 where is uid: field (j | s << 8), or j | zone << 8 | index << 16 for the piles; 0x1000 = nowhere
uint32_t engFindUid(uint32_t uid) {
    for (uint32_t j = 0; j < 2; j++)
        for (int s = 0; s < 11; s++) {
            uint32_t w = slotAt(j, s).card;
            if (cardId(w) && cardUid(w) == uid) return j | s << 8;
        }
    struct Pile { int zone; uint32_t EngPlayer::*count; uint32_t* (*arr)(EngPlayer&); };
    for (uint32_t j = 0; j < 2; j++) {
        EngPlayer& p = g_eng.pl[j];
        for (uint32_t i = 0; i < p.graveCount; i++)
            if (cardUid(p.grave[i]) == uid) return j | 0xe00 | i << 16;
        for (uint32_t i = 0; i < p.banishCount; i++)
            if (cardUid(p.banish[i]) == uid) return j | 0xf00 | i << 16;
        for (uint32_t i = 0; i < p.deckCount; i++)
            if (cardUid(p.deck[i]) == uid) return j | 0xd00 | i << 16;
        for (uint32_t i = 0; i < p.extraCount; i++)
            if (cardUid(p.extra[i]) == uid) return j | 0xc00 | i << 16;
    }
    for (uint32_t j = 0; j < 2; j++) {
        EngPlayer& p = g_eng.pl[j];
        for (uint32_t i = 0; i < p.handCount; i++)
            if (cardUid(p.hand[i]) == uid) return j | 0xb00 | i << 16;
    }
    return 0x1000;
}

// @yo2 0x006eb4c0 uid holding card id `card`, searching j's side first; 0 = none
int engUidOfCard(uint32_t j, uint32_t card) {
    for (uint32_t k = 0; k < 2; k++)
        for (int n = 0; n < 0x100; n++) {
            int uid = (int)(k ^ j) + n * 2;
            if (g_eng.uid[uid].card == card) return uid;
        }
    return 0;
}

// @yo2 0x006eb530 field slot of uid (j | s << 8), -1 = not on the field
uint32_t engFieldUid(uint32_t uid) {
    for (uint32_t j = 0; j < 2; j++)
        for (int s = 0; s < 11; s++) {
            uint32_t w = slotAt(j, s).card;
            if (cardId(w) && cardUid(w) == uid) return j | s << 8;
        }
    return 0xffffffff;
}

static uint32_t findIn(const uint32_t* a, uint32_t n, uint32_t uid) {
    for (uint32_t i = 0; i < n; i++)
        if (cardUid(a[i]) == uid) return i;
    return 0xffffffff;
}
// @yo2 0x006eb5c0 index of uid in j's deck, -1 = not there
uint32_t engDeckIndex(uint32_t j, uint32_t uid) { return findIn(g_eng.pl[j & 1].deck, g_eng.pl[j & 1].deckCount, uid); }
// @yo2 0x006eb640
uint32_t engExtraIndex(uint32_t j, uint32_t uid) { return findIn(g_eng.pl[j & 1].extra, g_eng.pl[j & 1].extraCount, uid); }
// @yo2 0x006eb6c0
uint32_t engGraveIndex(uint32_t j, uint32_t uid) { return findIn(g_eng.pl[j & 1].grave, g_eng.pl[j & 1].graveCount, uid); }
// @yo2 0x006eb740
uint32_t engBanishIndex(uint32_t j, uint32_t uid) { return findIn(g_eng.pl[j & 1].banish, g_eng.pl[j & 1].banishCount, uid); }
// @yo2 0x006eb7c0
uint32_t engHandIndex(uint32_t j, uint32_t uid) { return findIn(g_eng.pl[j & 1].hand, g_eng.pl[j & 1].handCount, uid); }

// @yo2 0x00707580 the word at (j, zone, index): piles by index, field slots by zone + index (scene 0xc9/0xca/0xd2: past
// slot 10 a scratch record for the battling pair)
uint32_t* engWordAt(uint32_t j, int zone, int index) {
    EngPlayer& p = g_eng.pl[j & 1];
    switch (zone) {
    case Z_HAND: return &p.hand[index];
    case Z_EXTRA: return &p.extra[index];
    case Z_DECK: return &p.deck[index];
    case Z_GRAVE: return &p.grave[index];
    case Z_BANISH: return &p.banish[index];
    }
    if (zone + index > 10) {
        int m = ndLogScene();
        if (m == 0xc9 || m == 0xca || m == 0xd2)
            return j == g_eng.vcc3c0 && (uint32_t)zone == g_eng.vcc3dc ? &g_eng.tmpSlot[0].card : &g_eng.tmpSlot[1].card;
        index = 0;
    }
    return &p.slot[index + zone].card;
}

// @yo2 0x006eb840 the card word of uid wherever it is, null = nowhere
uint32_t* engWordOfUid(uint32_t uid) {
    uint32_t at = engFindUid(uid);
    if (at == 0x1000) return nullptr;
    return engWordAt(at & 0xff, at >> 8 & 0xff, at >> 16);
}

// @yo2 0x006eb890 a card word's position bit (bit 15) when its card has the 0x71b470 property, else 1
uint32_t engWordBit15(const uint32_t* w) { return engNoNormalSummon(cardId(*w)) ? *w >> 15 & 1 : 1; }

static bool live(uint32_t j, int s) { return engSlotLive(j, s) && !(slotAt(j, s).flags & 4); }

// @yo2 0x006eb8d0 counters (value low u16) the slot can still take: -1 when its card takes no counters or is full
int engCounterRoom(uint32_t j, int s) {
    int c = engCardAt(j, s);
    int max = engTurnCount(c);
    if (max < 1) return -1;
    EngSlot& sl = slotAt(j, s);
    switch (c) {
    case 0xfee: {
        uint32_t at = engLinkTarget(j, s);
        if ((at & 0xffff) == 0xffff || engCardText(at & 0xff, (at & 0xffff) >> 8) != 0x10bc) return -1;
        break;
    }
    case 0xff9:
        if (!(sl.flags & 0x80)) return -1;
        break;
    case 0x1009:
        if (!engCountTextPropAll(0xff9)) return -1;
        break;
    case 0x14ac:
        if ((int16_t)engLinkTarget(j, s) == -1) return -1;
        break;
    case 0x1a7e:
        if (!engSlotHasNode(j, s, 0x1a7e, 1)) return -1;
        break;
    }
    if (max <= (int)(uint16_t)sl.value) return -1;
    if (!cardIsMonster(c) || c == 0xfee) {
        if (s < 5) return -1;
    } else if (s > 4) {
        return -1;
    }
    return sl.value & 0xffff;
}

// @yo2 0x006ebaa0 the slot can take one more counter
int engCanAddCounter(uint32_t j, int s) {
    int max = engTurnCount(engCardAt(j, s));
    return max > 0 && engCounterRoom(j, s) >= 0 && (int)(uint16_t)slotAt(j, s).value < max;
}

// @yo2 0x006ebb30 the smaller of the slot's 0x112f / 0x1130 node values (0x10000 = neither)
uint32_t engSlotMinLock(uint32_t j, int s) {
    int a = (int)engSlotKeyValue(j, s, 0x112f), b = (int)engSlotKeyValue(j, s, 0x1130);
    int m = a >= 0 && a < 0x10000 ? a : 0x10000;
    if (b >= 0 && b < m) m = b;
    return (uint32_t)m & 0xffff;
}

// The exe's table at 0x00cab538: cards that create tokens -> {card, token id, a, b}
static const uint16_t s_tokenCards[46][4] = {
    {0xe8b, 0xea7, 0, 2}, {0x12a0, 0xf3c, 1, 0}, {0x12c5, 0xf3d, 0, 1}, {0x12d2, 0xf3e, 4, 1}, {0x13fc, 0xf42, 2, 2},
    {0x13ff, 0xf43, 1, 0}, {0x1543, 0xf44, 1, 2}, {0x1595, 0xf45, 1, 2}, {0x15bc, 0xf46, 1, 0}, {0x15c6, 0xf47, 1, 2},
    {0x15d5, 0xf48, 1, 2}, {0x15f5, 0xf49, 1, 2}, {0x1600, 0xf4a, 1, 2}, {0x166a, 0xf4b, 3, 1}, {0x1710, 0xf4e, 2, 1},
    {0x180e, 0xf50, 0, 1}, {0x1810, 0xf51, 0, 1}, {0x199e, 0xf52, 1, 2}, {0x19a5, 0xf53, 1, 2}, {0x19af, 0xf54, 3, 0},
    {0x19fe, 0xf55, 2, 1}, {0x1a1c, 0xf57, 1, 2}, {0x1a32, 0xf57, 1, 2}, {0x1a37, 0xf58, 1, 2}, {0x1a62, 0xf59, 2, 2},
    {0x1a8a, 0xf5a, 1, 2}, {0x1b08, 0xf5b, 1, 1}, {0x1bb1, 0xf5c, 1, 0}, {0x1c63, 0xf5d, 2, 1}, {0x1ca3, 0xf5e, 1, 0},
    {0x1cd8, 0xf5f, 0, 2}, {0x1cda, 0xf60, 2, 0}, {0x1cf0, 0xf61, 2, 2}, {0x1d0e, 0xf62, 1, 2}, {0x1d16, 0xf63, 1, 2},
    {0x1d1e, 0xf64, 2, 1}, {0x1d28, 0xf65, 0, 2}, {0x1da4, 0xf66, 1, 2}, {0x1d8d, 0xf67, 3, 1}, {0x1def, 0xf68, 1, 2},
    {0x1e85, 0xf69, 1, 0}, {0x1ec0, 0xf6a, 1, 1}, {0x1df5, 0xf6b, 1, 1}, {0x1ee0, 0xf6c, 1, 0}, {0x1ef3, 0xf6d, 2, 2},
    {0x1efa, 0xf6e, 2, 1},
};

// @yo2 0x006ebba0 the token record of a card, null = it makes no tokens
const uint16_t* engTokenCard(uint32_t card) {
    for (const auto& t : s_tokenCards)
        if (t[0] == card) return t;
    return nullptr;
}

// @yo2 0x006ebbe0 the card that counts counters of kind k (exe table 0x00beb748)
int engCounterCard(int k) {
    static const int t[] = {0, 1, 0x1a0c, 0x1c10, 0x1cdf, 0x1d19, 0x1d22, 0x1dc5, 0x1dca, 0x1e4d, 0x1e95, 0x1ec8, 0x1eea,
                            0x1f74, 0xdac, 0x1439, 0x1513, 0x1a90, 0x1b71, 0x1bfc, 0x1c61, 0xeb8, 0x1f64};
    return k >= 0 && k < (int)(sizeof t / sizeof *t) ? t[k] : 0;
}

// @yo2 0x006ebc00 counters of kind k on (j, s): kinds above 0xe live in nodes of their card, 0 / 1 / 10 / others
// on the slot's own value when its card matches
uint32_t engCounters(uint32_t j, int s, int k) {
    if (k > 0xe) return engSlotSumKey(j, s, engCounterCard(k));
    int c = engCardAt(j, s);
    if (k == 0) {
        if (!engSpellCounterMax(c)) return 0;
    } else if (k == 1) {
        if (!engCard71c420(c)) return 0;
    } else if (k == 10) {
        if (c != 0x1e95 && c != 0x1e97) return 0;
    } else if (c != engCounterCard(k)) {
        return 0;
    }
    return slotAt(j, s).value;
}

// @yo2 0x006ebd10 counters of kind k on j's field
int engFieldCounters(uint32_t j, int k) {
    int n = 0;
    for (int s = 0; s < 11; s++) n += (int)engCounters(j, s, k);
    return n;
}

// @yo2 0x006ebd50 ... on both fields
int engAllCounters(int k) { return engFieldCounters(1, k) + engFieldCounters(0, k); }

// @yo2 0x006ebd80 a gemini-style (kind 9) monster has its effect on (flag 14, or field spell 0x1c85 unless negated)
int engGeminiOn(uint32_t j, int s) {
    EngSlot& sl = slotAt(j, s);
    if (sl.flags & 0x4000) return 1;
    return !(sl.flags & 0x100) && engIsGeminiKind(cardId(sl.card)) && engCountLiveAll(0x1c85);
}

// @yo2 0x006ebe10 the slot's card is live: face-up, not negated (flags 3 / 11 / 1), gemini effects switched on
int engSlotLive(uint32_t j, int s) {
    EngSlot& sl = slotAt(j, s);
    if (!sl.faceUp) return 0;
    uint32_t f = sl.flags;
    if (((f >> 5 & 8) | (f & 8)) >> 2 || (f & 2)) return 0;
    if (s < 5 && engIsGeminiKind(engCardAt(j, s))) return engGeminiOn(j, s);
    return 1;
}

// @yo2 0x006ebed0 the card whose text a monster carries now (copy and disguise effects; type 2 nodes newer than
// its arrival win), for spell slots only Ritual-alike 0xecd -> 0x12be
int engCardText(uint32_t j, int s) {
    EngSlot& sl = slotAt(j, s);
    int v = cardNormalize(cardId(sl.card));
    uint32_t uid = cardUid(sl.card);
    if (s > 4) {
        if (v == 0xecd && live(j, s) && !eng6f4dc0(0x12be, uid)) v = 0x12be;
        return v;
    }
    int cur = v;
    uint16_t stamp = 0;
    for (uint32_t i = sl.head; i; i = g_eng.node[i].next) {
        const EngNode& e = g_eng.node[i];
        if ((e.kind & 0xf) != 2) continue;
        switch (e.key) {
        case 0x1e7e:
            if (!eng6f4dc0(e.value, uid)) cur = e.value, stamp = e.stamp;
            break;
        case 0x1a74:
            if (!eng6f4dc0(e.value, uid)) v = cur = e.value, stamp = e.stamp;
            break;
        case 0x1d43: case 0x1dc2: case 0x1f0e:
            if (!eng6f4dc0(e.value, uid)) v = e.value, stamp = e.stamp;
            break;
        }
    }
    if (sl.turn <= stamp) return v;
    int to = 0;
    switch (cur) {
    case 0xea9: return (int)sl.value;
    case 0x1bc7: to = 0xfe4; break;
    case 0x1c1b: to = 0x19fd; break;
    case 0x19bc: to = 0x18f6; break;
    case 0x19a6: to = 0x18f9; break;
    default: return v;
    }
    return engSlotLive(j, s) && !eng6f4dc0(to, uid) ? to : v;
}

// @yo2 0x006ec2c0 card id on a slot as the rules see it: monsters under 0x1a74 / 0x1e7e copy nodes show the copied card;
// with `resolveCopy` monsters 0x1cb0-type take their 0x1dda node
int engCardAtEx(uint32_t j, int s, int resolveCopy) {
    EngSlot& sl = slotAt(j, s);
    int c = cardNormalize(cardId(sl.card));
    if (s >= 5) return c;
    if (!engCard71cb90(c)) {
        if (resolveCopy && engIsArcanaForce(c)) {
            int v = (int)engSlotKeyValue(j, s, 0x1dda);
            if (v > 0) return v;
        }
        return c;
    }
    if (!sl.head) return c;
    for (uint32_t i = sl.head; i; i = g_eng.node[i].next) {
        const EngNode& e = g_eng.node[i];
        if ((e.kind & 0xf) == 2 && (e.key == 0x1a74 || e.key == 0x1e7e) && cardIsMonster(e.value) &&
            !eng6f4dc0(e.value, cardUid(sl.card)))
            c = e.value;
    }
    return c;
}

// @yo2 0x006ec290
int engCardAt(uint32_t j, int s) { return engCardAtEx(j, s, 1); }

// @yo2 0x006ec430 the slot's card text has property p (FUN_00717230)
int engTextHas(uint32_t j, int s, int p) { return engSameCard(engCardText(j, s), p); }
// @yo2 0x006ec470 graveyard card i counts as p
int engGraveIs(uint32_t j, int i, int p) { return engSameCard(engGraveCardId(j, i), p); }

// @yo2 0x006ec4b0 the slot's card carries node 0x1d6f
int engSlotHas1d6f(uint32_t j, int s) { return engUidHasKey(cardUid(slotAt(j, s).card), 0x1d6f); }

// @yo2 0x006ec520 cards 0x1b33..0x1b39, 0x1df3, 0x1f0d
int engSlotSpecialKind(uint32_t j, int s) {
    int c = engCardAt(j, s);
    return engIsTheSixSamurai(c) || c == 0x1df3 || c == 0x1f0d;
}

// @yo2 0x006ec570
int engSlotKindCheck(uint32_t j, int s, int card) {
    if (card == 0x1df3) return (int16_t)engRace(j, s) == 0xd;
    if (card == 0x1f0d) return engTextHas(j, s, 0x1e7f);
    return engIsSixSamurai(engCardText(j, s));
}

// @yo2 0x006ec600 put a word on top of j's deck
void engDeckPushTop(uint32_t j, const uint32_t* w) {
    EngPlayer& p = g_eng.pl[j & 1];
    for (int i = (int)p.deckCount; i > 0; i--) engWordCopy(&p.deck[i], &p.deck[i - 1]);
    p.deckCount++;
    engWordCopy(&p.deck[0], w);
}

// @yo2 0x006ec6a0 ... at the bottom
void engDeckPushBottom(uint32_t j, const uint32_t* w) {
    EngPlayer& p = g_eng.pl[j & 1];
    engWordCopy(&p.deck[p.deckCount], w);
    p.deckCount++;
}

// @yo2 0x006ec720 add a word to j's extra deck
void engExtraPush(uint32_t j, const uint32_t* w) {
    EngPlayer& p = g_eng.pl[j & 1];
    engWordCopy(&p.extra[p.extraCount], w);
    p.extraCount++;
}

// @yo2 0x006ec7a0 clear both players' flag 3 on slot 11
void engClearPlayerFlag3() {
    for (EngPlayer& p : g_eng.pl) p.slot[11].flags &= ~8u;
}

// @yo2 0x006ec7e0 j's deck was shuffled: forget its order (the server reveals cards as they leave it)
void engShuffleDeck(uint32_t j) { engDeckForget(j); }

// @yo2 0x006ec800 first deck index whose card has property p, -1 = none
uint32_t engDeckFindProp(uint32_t j, int p) {
    EngPlayer& pl = g_eng.pl[j & 1];
    for (uint32_t i = 0; i < pl.deckCount; i++)
        if (engSameCard(cardId(pl.deck[i]), p)) return i;
    return 0xffffffff;
}

// @yo2 0x006ec890 first deck index holding card id `card`
uint32_t engDeckFindCard(uint32_t j, uint32_t card) {
    EngPlayer& pl = g_eng.pl[j & 1];
    for (uint32_t i = 0; i < pl.deckCount; i++)
        if (cardId(pl.deck[i]) == card) return i;
    return 0xffffffff;
}

// @yo2 0x006ec900 first extra-deck index whose card has property p
uint32_t engExtraFindProp(uint32_t j, int p) {
    EngPlayer& pl = g_eng.pl[j & 1];
    for (uint32_t i = 0; i < pl.extraCount; i++)
        if (engSameCard(cardId(pl.extra[i]), p)) return i;
    return 0xffffffff;
}

// @yo2 0x006ec990 remove that exact word from j's deck
int engDeckRemove(uint32_t j, const uint32_t* w) {
    EngPlayer& p = g_eng.pl[j & 1];
    for (uint32_t i = 0; i < p.deckCount; i++)
        if (engWordEqual(&p.deck[i], w)) {
            for (p.deckCount--; i < p.deckCount; i++) engWordCopy(&p.deck[i], &p.deck[i + 1]);
            return 1;
        }
    return 0;
}

// @yo2 0x006eca70 take the first card with id `card` out of j's deck into *out
int engDeckTakeCard(uint32_t j, uint32_t card, uint32_t* out) {
    EngPlayer& p = g_eng.pl[j & 1];
    for (uint32_t i = 0; i < p.deckCount; i++)
        if (cardId(p.deck[i]) == (card & 0xffff)) {
            engWordCopy(out, &p.deck[i]);
            for (p.deckCount--; i < p.deckCount; i++) engWordCopy(&p.deck[i], &p.deck[i + 1]);
            return 1;
        }
    return 0;
}

// @yo2 0x006ecb60 remove that exact word from j's extra deck
int engExtraRemove(uint32_t j, const uint32_t* w) {
    EngPlayer& p = g_eng.pl[j & 1];
    for (uint32_t i = 0; i < p.extraCount; i++)
        if (engWordEqual(&p.extra[i], w)) {
            for (p.extraCount--; i < p.extraCount; i++) engWordCopy(&p.extra[i], &p.extra[i + 1]);
            return 1;
        }
    return 0;
}

template <class F> static int countDeck(uint32_t j, F f) {
    EngPlayer& p = g_eng.pl[j & 1];
    int n = 0;
    for (uint32_t i = 0; i < p.deckCount; i++)
        if (f(cardId(p.deck[i]))) n++;
    return n;
}
template <class F> static int countExtra(uint32_t j, F f) {
    EngPlayer& p = g_eng.pl[j & 1];
    int n = 0;
    for (uint32_t i = 0; i < p.extraCount; i++)
        if (f(cardId(p.extra[i]))) n++;
    return n;
}

// @yo2 0x006ecc40 monsters in j's deck
int engDeckMonsters(uint32_t j) { return countDeck(j, [](int c) { return cardIsMonster(c); }); }
// @yo2 0x006eccd0 deck cards of that race
int engDeckRace(uint32_t j, int race) { return countDeck(j, [race](int c) { return cardRace(c) == race; }); }
// @yo2 0x006ecd70 deck cards of that attribute
int engDeckAttr(uint32_t j, int attr) { return countDeck(j, [attr](int c) { return cardAttr(c) == attr; }); }
// @yo2 0x006ece10 deck spells with that icon
int engDeckSpellIcon(uint32_t j, int icon) { return countDeck(j, [icon](int c) { return cardIsSpell(c) && cardIcon(c) == icon; }); }
// @yo2 0x006eced0 deck traps with that icon
int engDeckTrapIcon(uint32_t j, int icon) { return countDeck(j, [icon](int c) { return cardIsTrap(c) && cardIcon(c) == icon; }); }
// @yo2 0x006ecf90 deck cards with property p
int engDeckProp(uint32_t j, int p) { return countDeck(j, [p](int c) { return engSameCard(c, p) != 0; }); }
// @yo2 0x006ed030 extra-deck cards with property p
int engExtraProp(uint32_t j, int p) { return countExtra(j, [p](int c) { return engSameCard(c, p) != 0; }); }
// @yo2 0x006ed0d0 extra-deck cards whose FUN_00716c30 is v
int engExtra716c30(uint32_t j, int v) { return countExtra(j, [v](int c) { return engCardCategory(c) == v; }); }
// @yo2 0x006ed170 deck cards the predicate accepts
int engDeckCountIf(uint32_t j, int (*pred)(int)) { return countDeck(j, [pred](int c) { return pred(c) != 0; }); }

// @yo2 0x006ed200 reverse j's deck
void engDeckReverse(uint32_t j) {
    EngPlayer& p = g_eng.pl[j & 1];
    for (uint32_t i = 0, k = p.deckCount; i < p.deckCount / 2; i++) engWordSwap(&p.deck[i], &p.deck[--k]);
}

// @yo2 0x006ed290 empty
void engNop290() {}
// @yo2 0x006ed2b0
void engNop2b0() {}
// @yo2 0x006ed2d0
void engNop2d0() {}
// @yo2 0x006ed2f0
uint32_t engCc848(int i) { return g_eng.ctl[i]; }
