// Pile primitives and pile queries (0x006f7800..0x006fae10): graveyard, banished, hand, deck.
#include "EngineInternal.h"

#include <cstring>
#include <utility>

static EngSlot& slotAt(uint32_t j, int s) { return g_eng.pl[j & 1].slot[s]; }

// @yo2 0x006f7800 add n to the value of every live copy of `card` on j's side (monsters 0-4, else 5-9)
void engAddValueTo(uint32_t j, int card, int n) {
    bool monster = cardIsMonster(card);
    for (int s = monster ? 0 : 5; s <= (monster ? 4 : 9); s++)
        if (engSlotIsLive(j, s, card)) slotAt(j, s).value += (uint32_t)n;
}

// @yo2 0x006f78c0 flag 7 on every live copy of `card` on j's side
void engFlagCopies(uint32_t j, int card) {
    bool monster = cardIsMonster(card);
    for (int s = monster ? 0 : 5; s <= (monster ? 4 : 9); s++)
        if (engSlotIsLive(j, s, card)) slotAt(j, s).flags |= 0x80;
}

// @yo2 0x006f7960 a card word onto its owner's graveyard (tokens / FUN_007179e0 cards vanish)
void engGravePush(const uint32_t* w) {
    EngPlayer& p = g_eng.pl[cardOwner(*w)];
    if (!cardId(*w) || engIsTokenKind(cardId(*w))) return;
    engWordCopy(&p.grave[p.graveCount], w);
    p.graveCount++;
}

// @yo2 0x006f7a00 a card word onto its owner's banished pile with its view record
void engBanishPush(const uint32_t* w, uint16_t view) {
    EngPlayer& p = g_eng.pl[cardOwner(*w)];
    if (!cardId(*w) || engIsTokenKind(cardId(*w))) return;
    uint32_t n = p.banishCount;
    engWordCopy(&p.banish[n], w);
    memcpy(p.banishView[n], &view, 2);
    p.banishCount++;
}

// @yo2 0x006f7ad0 remove graveyard card i
int engGraveRemoveAt(uint32_t j, uint32_t i) {
    EngPlayer& p = g_eng.pl[j & 1];
    if (p.graveCount <= i) return 0;
    for (p.graveCount--; i < p.graveCount; i++) engWordCopy(&p.grave[i], &p.grave[i + 1]);
    return 1;
}

// @yo2 0x006f7b70 remove that exact word from j's graveyard (searching from the top)
int engGraveRemove(uint32_t j, const uint32_t* w) {
    EngPlayer& p = g_eng.pl[j & 1];
    for (int i = (int)p.graveCount - 1; i >= 0; i--)
        if (engWordEqual(&p.grave[i], w)) return engGraveRemoveAt(j, (uint32_t)i);
    return 0;
}

// @yo2 0x006f7c10 move uid to the top of j's graveyard
void engGraveToTop(uint32_t j, uint32_t uid) {
    EngPlayer& p = g_eng.pl[j & 1];
    int i = (int)p.graveCount - 1;
    while (i >= 0 && cardUid(p.grave[i]) != (uid & 0xffff)) i--;
    if (i < 0) return;
    engWordSwap(&p.grave[i], &p.grave[p.graveCount]);   // (one past the top, as in the exe)
    for (uint32_t k = (uint32_t)i; k < p.graveCount; k++) engWordCopy(&p.grave[k], &p.grave[k + 1]);
}

// @yo2 0x006f7d20 move uid to the top of j's banished pile (with its view record)
void engBanishToTop(uint32_t j, uint32_t uid) {
    EngPlayer& p = g_eng.pl[j & 1];
    int i = (int)p.banishCount - 1;
    while (i >= 0 && cardUid(p.banish[i]) != (uid & 0xffff)) i--;
    if (i < 0) return;
    uint32_t n = p.banishCount;
    engWordCopy(&p.banish[n], &p.banish[i]);
    memcpy(p.banishView[n], p.banishView[i], 2);
    for (uint32_t k = (uint32_t)i; k < n; k++) {
        engWordCopy(&p.banish[k], &p.banish[k + 1]);
        memcpy(p.banishView[k], p.banishView[k + 1], 2);
    }
}

// @yo2 0x006f7e90 the id of graveyard card i as the rules see it (two cards change while bit 22 is clear)
int engGraveCardId(uint32_t j, int i) {
    uint32_t w = g_eng.pl[j & 1].grave[i], id = cardId(w);
    if (id == 0x1bc7 && !(w & 0x400000)) return 0xfe4;
    if (id == 0x1dbb && !(w & 0x400000)) return 0xfbe;
    return (int)id;
}

// @yo2 0x006f7f10 topmost graveyard index whose card has property p, -1 = none
int engGraveTopProp(uint32_t j, int p) {
    for (int i = (int)g_eng.pl[j & 1].graveCount - 1; i >= 0; i--)
        if (engGraveIs(j, i, p)) return i;
    return -1;
}

// @yo2 0x006f7f80 1-based position of that exact word in j's graveyard, 0 = none
int engGravePos(uint32_t j, const uint32_t* w) {
    EngPlayer& p = g_eng.pl[j & 1];
    for (uint32_t i = 0; i < p.graveCount; i++)
        if (engWordEqual(&p.grave[i], w)) return (int)i + 1;
    return 0;
}

// @yo2 0x006f8000 graveyard cards of j with property p
int engGraveCountProp(uint32_t j, int p) {
    int n = 0;
    for (uint32_t i = 0; i < g_eng.pl[j & 1].graveCount; i++)
        if (engGraveIs(j, (int)i, p)) n++;
    return n;
}

// @yo2 0x006f8080 graveyard copies of card id `card` without bit 22
int engGraveCountCard(uint32_t j, uint32_t card) {
    int n = 0;
    EngPlayer& p = g_eng.pl[j & 1];
    for (uint32_t i = 0; i < p.graveCount; i++)
        if (cardId(p.grave[i]) == card && !(p.grave[i] & 0x400000)) n++;
    return n;
}

// @yo2 0x006f8100 ... not already marked by a slot-11 node of that key
int engGraveCountCardUnmarked(uint32_t j, uint32_t card) {
    int n = 0;
    EngPlayer& p = g_eng.pl[j & 1];
    for (uint32_t i = 0; i < p.graveCount; i++) {
        uint32_t w = p.grave[i];
        if (cardId(w) == card && !(w & 0x400000) && !engSlotHasKeyValue(j, 11, card, cardUid(w))) n++;
    }
    return n;
}

// @yo2 0x006f81d0 banished copies of card id `card`
int engBanishCountCard(uint32_t j, uint32_t card) {
    int n = 0;
    EngPlayer& p = g_eng.pl[j & 1];
    for (uint32_t i = 0; i < p.banishCount; i++)
        if (cardId(p.banish[i]) == card) n++;
    return n;
}

// @yo2 0x006f8240 topmost banished index counting as `card`, -1 = none
int engBanishTopCard(uint32_t j, int card) {
    EngPlayer& p = g_eng.pl[j & 1];
    for (int i = (int)p.banishCount - 1; i >= 0; i--)
        if (engSameCard(card, cardId(p.banish[i]))) return i;
    return -1;
}

// @yo2 0x006f82d0 remove banished card i (with its view record)
int engBanishRemoveAt(uint32_t j, uint32_t i) {
    EngPlayer& p = g_eng.pl[j & 1];
    if (p.banishCount <= i) return 0;
    for (p.banishCount--; i < p.banishCount; i++) {
        engWordCopy(&p.banish[i], &p.banish[i + 1]);
        memcpy(p.banishView[i], p.banishView[i + 1], 2);
    }
    return 1;
}

// @yo2 0x006f83b0 remove that exact word from j's banished pile
int engBanishRemove(uint32_t j, const uint32_t* w) {
    EngPlayer& p = g_eng.pl[j & 1];
    for (uint32_t i = 0; i < p.banishCount; i++)
        if (engWordEqual(&p.banish[i], w)) return engBanishRemoveAt(j, i);
    return 0;
}

// @yo2 0x006f8440 swap j's deck and graveyard (the cards lose bits 15..22)
void engSwapDeckGrave(uint32_t j) {
    EngPlayer& p = g_eng.pl[j & 1];
    int deck = (int)p.deckCount, grave = (int)p.graveCount;
    for (int i = (deck <= grave ? grave : deck) - 1; i >= 0; i--) {
        p.grave[i] &= 0xff807fff;
        engNodeCardMoved(Z_GRAVE, Z_DECK, &p.grave[i]);
        engWordSwap(&p.deck[i], &p.grave[i]);
    }
    p.deckCount = (uint32_t)grave;
    p.graveCount = (uint32_t)deck;
}

// ---- graveyard / banished counts

// @yo2 0x006f8520 monsters in j's graveyard
int engGraveMonsters(uint32_t j) {
    EngPlayer& p = g_eng.pl[j & 1];
    int n = 0;
    for (uint32_t i = 0; i < p.graveCount; i++) n += cardIsMonster(cardId(p.grave[i]));
    return n;
}

// @yo2 0x006f85b0 graveyard cards passing engGraveNormal
int engGraveNormalCount(uint32_t j) {
    int n = 0;
    for (uint32_t i = 0; i < g_eng.pl[j & 1].graveCount; i++) n += engGraveNormal(j, (int)i) != 0;
    return n;
}

// @yo2 0x006f8620 graveyard cards whose effective race is `race`
int engGraveCountRace(uint32_t j, int race) {
    EngPlayer& p = g_eng.pl[j & 1];
    int n = 0;
    for (uint32_t i = 0; i < p.graveCount; i++) n += engEffRace(cardId(p.grave[i])) == race;
    return n;
}

// @yo2 0x006f86c0 graveyard cards whose effective attribute is `attr`
int engGraveCountAttr(uint32_t j, int attr) {
    EngPlayer& p = g_eng.pl[j & 1];
    int n = 0;
    for (uint32_t i = 0; i < p.graveCount; i++) n += engEffAttr(cardId(p.grave[i])) == attr;
    return n;
}

// distinct names among `ids` (the exe's O(n^2) first-occurrence scan) plus the popcount of the FUN_006f24d0 bits
static int distinct(const int* ids, int n) {
    int count = 0;
    uint32_t bits = 0;
    for (int i = 0; i < n; i++) {
        int k = 0;
        while (k < i && !engSameCard(ids[i], ids[k])) k++;
        if (k == i) count++;
        bits |= (uint32_t)eng6f24d0(ids[i]);
    }
    return engPopCount(bits) + count;
}

// @yo2 0x006f8760 distinct graveyard names with effective attribute `attr`
int engGraveDistinctAttr(uint32_t j, int attr) {
    int ids[190], n = 0;
    for (uint32_t i = 0; i < g_eng.pl[j & 1].graveCount; i++) {
        int c = engGraveCardId(j, (int)i);
        if (engEffAttr(c) == attr) ids[n++] = c;
    }
    return distinct(ids, n);
}

// @yo2 0x006f8880 graveyard monsters passing `pred`
int engGraveCountMonsterIf(uint32_t j, int (*pred)(int)) {
    EngPlayer& p = g_eng.pl[j & 1];
    int n = 0;
    for (uint32_t i = 0; i < p.graveCount; i++) {
        int c = (int)cardId(p.grave[i]);
        if (cardIsMonster(c) && pred(c)) n++;
    }
    return n;
}

// @yo2 0x006f8920 distinct graveyard monster names passing `pred`
int engGraveDistinctMonsterIf(uint32_t j, int (*pred)(int)) {
    EngPlayer& p = g_eng.pl[j & 1];
    int ids[190], n = 0;
    for (uint32_t i = 0; i < p.graveCount; i++) {
        int c = (int)cardId(p.grave[i]);
        if (cardIsMonster(c) && pred(c)) ids[n++] = c;
    }
    return distinct(ids, n);
}

// @yo2 0x006f8a80 graveyard spells with icon `icon`
int engGraveCountSpellIcon(uint32_t j, int icon) {
    EngPlayer& p = g_eng.pl[j & 1];
    int n = 0;
    for (uint32_t i = 0; i < p.graveCount; i++) {
        int c = (int)cardId(p.grave[i]);
        n += cardIsSpell(c) && cardIcon(c) == icon;
    }
    return n;
}

// @yo2 0x006f8b40 graveyard traps with icon `icon`
int engGraveCountTrapIcon(uint32_t j, int icon) {
    EngPlayer& p = g_eng.pl[j & 1];
    int n = 0;
    for (uint32_t i = 0; i < p.graveCount; i++) {
        int c = (int)cardId(p.grave[i]);
        n += cardIsTrap(c) && cardIcon(c) == icon;
    }
    return n;
}

// banished cards j can see face-up that satisfy `f`
template <class F> static int banishCountIf(uint32_t j, F f) {
    EngPlayer& p = g_eng.pl[j & 1];
    int n = 0;
    for (uint32_t i = 0; i < p.banishCount; i++)
        if (engFaceUpAt(j, Z_BANISH, (int)i) && f((int)cardId(p.banish[i]))) n++;
    return n;
}

// @yo2 0x006f8c00 face-up banished monsters
int engBanishMonsters(uint32_t j) { return banishCountIf(j, [](int c) { return cardIsMonster(c); }); }
// @yo2 0x006f8cc0 face-up banished cards of attribute `attr`
int engBanishCountAttr(uint32_t j, int attr) { return banishCountIf(j, [&](int c) { return cardAttr(c) == attr; }); }
// @yo2 0x006f8d80 face-up banished cards of race `race`
int engBanishCountRace(uint32_t j, int race) { return banishCountIf(j, [&](int c) { return cardRace(c) == race; }); }
// @yo2 0x006f8e40 face-up banished spells with icon `icon`
int engBanishCountSpellIcon(uint32_t j, int icon) {
    return banishCountIf(j, [&](int c) { return cardIsSpell(c) && cardIcon(c) == icon; });
}
// @yo2 0x006f8f10 face-up banished traps with icon `icon`
int engBanishCountTrapIcon(uint32_t j, int icon) {
    return banishCountIf(j, [&](int c) { return cardIsTrap(c) && cardIcon(c) == icon; });
}

// @yo2 0x006f8fe0 may player j special summon the card word *w (owned by `owner`) from zone `zone`;
// mode 0 = basic check only, 1 = race/attribute restrictions, 2 = either
int engMaySummonFrom(uint32_t j, uint32_t owner, const uint32_t* w, int zone, uint32_t mode) {
    int c = (int)cardId(*w);
    if (!engCanBeRevived(c)) return 0;
    if (zone == Z_GRAVE) {
        switch (c) {
        case 0x14b5: case 0x1571: case 0x15b1: case 0x15b4: case 0x15f9: case 0x15fa: case 0x17c7: case 0x17c8:
        case 0x1820:
            return 0;
        case 0x14d5:
            if (!engTributesOfRace(j, 1)) return 0;
        }
    }
    if (!engNoNormalSummon(c)) {
        if (c == 0x1c4c && !(*w & 0x8000)) return 0;
        if (mode == 2) {
            if (engMaySpecialSummonCard(j, owner, c, zone, 0)) return 1;
            mode = 1;
        }
        return engMaySpecialSummonCard(j, owner, c, zone, (int)mode) ? 1 : 0;
    }
    if (!(*w & 0x8000)) return 0;   // a nomi monster must have been properly summoned once
    if (engIsToonKind(c) && !engHas12be(j)) return 0;
    if (c == 0x14fc) {
        if (!engCountText0(owner, 0x1414)) return 0;
    } else if ((c == 0x1578 || c == 0x1cda || c == 0x1d9a) && engActionLocked(j)) {
        return 0;
    }
    if (!engMayUseCard(j, c, zone)) return 0;
    if (mode == 2) mode = !engMaySpecialSummonBasic(j);
    if (mode == 0) return engMaySpecialSummonBasic(j) ? 1 : 0;
    return engRaceAttrAllowed(owner, c, zone) ? 1 : 0;
}

// @yo2 0x006f9390 ... graveyard card i of `owner`
int engMaySummonFromGrave(uint32_t j, uint32_t owner, int i) {
    return engMaySummonFrom(j, j, &g_eng.pl[owner & 1].grave[i], Z_GRAVE, 1);
}

// @yo2 0x006f93e0 ... banished card i of `owner`
int engMaySummonFromBanish(uint32_t j, uint32_t owner, int i) {
    return engMaySummonFrom(j, j, &g_eng.pl[owner & 1].banish[i], Z_BANISH, 1);
}

// @yo2 0x006f9430 may j add monster `card`: blocked by an opponent's 0x15eb-protected monster, or a Lightsworn under 0x1e74
int engMayAddMonster(uint32_t j, int card) {
    if (!cardIsMonster(card)) return 1;
    uint32_t o = 1 - j;
    for (int s = 0; s < 5; s++)
        if (cardId(g_eng.pl[o & 1].slot[s].card) && engAffectedBy2(o, s, 0x15eb, o, -1)) return 0;
    if (engIsLightsworn(card) && engCountLiveAll(0x1e74)) return 0;
    return 1;
}

// @yo2 0x006f9500 effective race: 0x1eb1 outnumbering 0xeb4 forces 2, else the newest live 0xeb4's declared race
int engEffRace(int card) {
    if (cardIsMonster(card)) {
        int a = engCopyStampLast(0xeb4), b = engCopyStampLast(0x1eb1);
        if (a < b) return 2;
        if (a > 0) {
            uint32_t best = 0, race = 0;
            for (uint32_t j = 0; j < 2; j++)
                for (int s = 5; s <= 10; s++) {
                    const EngSlot& sl = g_eng.pl[j].slot[s];
                    if (engSlotIsLive(j, s, 0xeb4) && (!best || best < sl.turn)) {
                        best = sl.turn;
                        race = sl.value;
                    }
                }
            return (int)race;
        }
    }
    return cardRace(card);
}

// @yo2 0x006f9630 effective attribute: Crystal Beasts become 2 while 0xead is live
int engEffAttr(int card) {
    if (engIsCrystalBeast(card) && engCountLiveAll(0xead)) return 2;
    return cardAttr(card);
}

// @yo2 0x006f9680 a card word into j's hand (fusion/synchro cards go back to the extra deck instead)
void engHandPush(uint32_t j, const uint32_t* w) {
    EngPlayer& p = g_eng.pl[j & 1];
    uint32_t c = cardId(*w);
    if (!c || engIsTokenKind((int)c)) return;
    if (engIsFusionOrSynchro((int)c)) {
        engExtraPush(cardOwner(*w), w);
        return;
    }
    engWordCopy(&p.hand[p.handCount], w);
    p.handCount++;
}

// @yo2 0x007436f0
void engZero(void* p, uint32_t n) { memset(p, 0, n); }

// @yo2 0x006f9750 remove that exact word from j's hand
int engHandRemove(uint32_t j, const uint32_t* w) {
    EngPlayer& p = g_eng.pl[j & 1];
    for (uint32_t i = 0; i < p.handCount; i++)
        if (engWordEqual(&p.hand[i], w)) {
            for (p.handCount--; i < p.handCount; i++) engWordCopy(&p.hand[i], &p.hand[i + 1]);
            engZero(&p.hand[p.handCount], 4);
            return 1;
        }
    return 0;
}

// @yo2 0x006f9870 0x1dbc counts as a normal monster
int engIsNormalKind2(int card) { return card == 0x1dbc ? 1 : engIsNormalKind(card); }

// @yo2 0x006f98a0 effective level of the card behind uid (0x18d9 overrides, 0x150b lowers, 0x15c7 in hand lowers by 2)
int engUidLevel(uint32_t j, int uid) {
    int c = g_eng.uid[uid].card;
    int lv = cardLevel(c);
    if (!lv) return 0;
    int v = (int)engUidKeyValue(uid, 0x18d9);
    if (v > 0) lv = v;
    if (engCardAttrIs(c, 3))
        for (uint32_t k = 0; k < 2; k++)
            if (engCardAt(k, 10) == 0x150b && engSlotLive(k, 10) && !(g_eng.pl[k].slot[10].flags & 4) &&
                engFieldSpellIs(0x150b))
                lv = lv - 1 > 0 ? lv - 1 : 1;
    int n = engSlotCountKey(j, 0xb, 0x15c7);
    if (n && (lv -= 2 * n) < 1) lv = 1;
    return lv;
}

// first hand index whose card satisfies `f`, -1 = none
template <class F> static int handFind(uint32_t j, F f) {
    EngPlayer& p = g_eng.pl[j & 1];
    for (uint32_t i = 0; i < p.handCount; i++)
        if (f((int)cardId(p.hand[i]))) return (int)i;
    return -1;
}
template <class F> static int handCountIf(uint32_t j, F f) {
    EngPlayer& p = g_eng.pl[j & 1];
    int n = 0;
    for (uint32_t i = 0; i < p.handCount; i++) n += f((int)cardId(p.hand[i])) ? 1 : 0;
    return n;
}

// @yo2 0x006f99d0 first trap in hand
int engHandFirstTrap(uint32_t j) { return handFind(j, [](int c) { return cardIsTrap(c); }); }
// @yo2 0x006f9a50 first spell in hand
int engHandFirstSpell(uint32_t j) { return handFind(j, [](int c) { return cardIsSpell(c); }); }
// @yo2 0x006f9ad0 hand cards of race `race`
int engHandCountRace(uint32_t j, int race) { return handCountIf(j, [&](int c) { return cardRace(c) == race; }); }
// @yo2 0x006f9b70 hand cards of attribute `attr`
int engHandCountAttr(uint32_t j, int attr) { return handCountIf(j, [&](int c) { return cardAttr(c) == attr; }); }
// @yo2 0x006f9c10 hand copies of `card`
int engHandCountCard(uint32_t j, int card) { return handCountIf(j, [&](int c) { return engSameCard(c, card); }); }
// @yo2 0x006f9cb0 hand cards passing `pred`
int engHandCountIf(uint32_t j, int (*pred)(int)) { return handCountIf(j, pred); }
// @yo2 0x006f9d40 hand spells with icon `icon`
int engHandCountSpellIcon(uint32_t j, int icon) {
    return handCountIf(j, [&](int c) { return cardIsSpell(c) && cardIcon(c) == icon; });
}
// @yo2 0x006f9e00 first hand index holding `card`
int engHandFind(uint32_t j, int card) { return handFind(j, [&](int c) { return engSameCard(c, card); }); }
// @yo2 0x006f9e90 monsters in hand
int engHandMonsters(uint32_t j) { return handCountIf(j, [](int c) { return cardIsMonster(c); }); }
// @yo2 0x006f9f20 hand cards of level >= lv
int engHandCountLevelAtLeast(uint32_t j, int lv) { return handCountIf(j, [&](int c) { return cardLevel(c) >= lv; }); }
// @yo2 0x006f9fc0 hand cards of level 1..lv
int engHandCountLevelUpTo(uint32_t j, int lv) {
    return handCountIf(j, [&](int c) { int l = cardLevel(c); return l > 0 && l <= lv; });
}

// @yo2 0x006fa050 is j's hand open (replays always; watchers only when slot-11 bit 1 is set)
int engHandOpen(uint32_t j) {
    if (ndIsReplay()) return 1;
    uint32_t f = g_eng.pl[j & 1].slot[11].flags;
    if (ndIsWatch() && !(f & 2)) return 0;
    return f >> 1 & 1;
}

// @yo2 0x006fa0e0 is hand card i of j shown to the opponent
int engHandCardShown(uint32_t j, int i) {
    int uid = (int)cardUid(g_eng.pl[j & 1].hand[i]);
    if (engHandOpen(j)) return 1;
    if (engSlotHasKey(j, 0xb, 0xfa1)) return 0;
    if (engSlotHasKeyValue(j, 0xb, 0xfe0, (uint32_t)uid)) return 1;
    return engSlotHasTypeKeyValue(j, 0xb, 0x1db9, 3, (uint32_t)uid) != 0;
}

// @yo2 0x006fa1c0 is j's draw phase skipped / drawing forbidden by a live card
int engDrawBlocked(uint32_t j) {
    if (engCountLiveAll(0xec3) && engCountAttr0(j, 1)) return 1;
    uint32_t o = 1 - j;
    if (engCountLive(o, 0x137b, -1) || engCountLiveAll(0x1340) || engCountLive(o, 0x17e7, -1) ||
        engCountLive(o, 0x1ca6, -1))
        return 1;
    return j == g_eng.turnPlayer && engCountLiveAll(0x135e) ? 1 : 0;
}

// @yo2 0x00720850 the engine LCG (MSVC rand constants)
uint32_t engRand() {
    g_eng.seed = g_eng.seed * 0x343fd + 0x269ec3;
    return g_eng.seed >> 16 & 0x7fff;
}

// @yo2 0x00720890 0..n-1
uint32_t engRandN(int n) { return (uint32_t)((int)engRand() * n) >> 15; }

// @yo2 0x006fa2d0 shuffle j's hand (Fisher-Yates from the top; not while it is shown, except in replays)
int engHandShuffle(uint32_t j) {
    if (engHandOpen(j) && !ndIsReplay()) return 0;
    EngPlayer& p = g_eng.pl[j & 1];
    uint32_t n = p.handCount;
    if (n < 2) return 0;
    for (uint32_t i = n - 1; (int)i > 0; i--, n--) {
        uint32_t r = engRandN((int)n), t;
        engWordCopy(&t, &p.hand[r]);
        engWordCopy(&p.hand[r], &p.hand[i]);
        engWordCopy(&p.hand[i], &t);
    }
    return 1;
}

// @yo2 0x006fa3c0 fixed stats of the six token kinds
void engTokenStats(int card, EngStats* st) {
    struct T { int card, race, attr, level, atk, def; };
    static const T t[] = {
        {0x172f, 2, 2, 4, 1800, 500}, {0xea9, 0x12, 1, 1, 0, 0},     {0x1472, 0x14, 5, 4, 1600, 1800},
        {0x1636, 0xe, 3, 10, 0, 3000}, {0x1809, 7, 5, 4, 0, 2000},    {0x1aca, 7, 5, 4, 0, 0},
    };
    for (const T& e : t)
        if (e.card == card) {
            st->race = e.race;
            st->attr = e.attr;
            st->level = e.level;
            st->baseAtk = e.atk;
            st->baseDef = e.def;
        }
}

// @yo2 0x006fa530
void engStatsOf(uint32_t j, int s, EngStats* st) { engBaseStats(j, s, st, 0, 0); }
// @yo2 0x006fae10
void engStatsOf2(uint32_t j, int s, EngStats* st) { engStats(j, s, st, 0, 0); }

// @yo2 0x00704f20 after a shuffle the client no longer knows the deck order: every deck card keeps its owner and
// bit 31 but gets a positional placeholder id and loses its flags and serial
void engDeckForget(uint32_t j) {
    static const uint8_t ph[30] = {1, 2, 3, 4, 5, 6, 7, 8, 9, 0x1f, 0xb, 0xc, 0xd, 0xe, 0xf,
                                   0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x20};
    EngPlayer& p = g_eng.pl[j & 1];
    for (int i = (int)p.deckCount - 1; i >= 0; i--)
        p.deck[i] = (p.deck[i] & 0x80000000) | (j & 1) << 14 | ph[i / 3 % 30];   // ponytail: the exe reads stack past 90 cards; decks never get there
}

// @yo2 0x00705320 bit 0 of the field mask the server sent for j / zone z
uint32_t engFieldMaskBit(int j, int z) { return ndFieldMask2(j, z) & 1; }

// @yo2 0x00705350 take deck card i of j into *out
int engDeckTakeAt(uint32_t j, uint32_t i, uint32_t* out) {
    EngPlayer& p = g_eng.pl[j & 1];
    if (i >= p.deckCount) return 0;
    engWordCopy(out, &p.deck[i]);
    for (p.deckCount--; i < p.deckCount; i++) engWordCopy(&p.deck[i], &p.deck[i + 1]);
    return 1;
}

// @yo2 0x00705410 top deck card into the hand
void engDrawTop(uint32_t j) {
    uint32_t w;
    if (engDeckTakeAt(j, 0, &w)) engHandPush(j, &w);
}

// @yo2 0x006fa560 the "original" ATK/DEF of the monster in slot s (card-text base values, before boosts):
// fills card/base/baseAtk/baseDef and the three side masks f10..f12; flags bit 1 skips the timed nodes
void engBaseStats(uint32_t j, int s, EngStats* st, uint32_t flags, int) {
    const EngSlot& sl = slotAt(j, s);
    bool keep = false;
    st->card = st->base = cardNormalize((int)cardId(sl.card));
    st->baseAtk = cardAtk(st->card);
    st->baseDef = cardDef(st->card);
    if (!sl.faceUp || (sl.flags & 8)) return;
    st->card = engCardText(j, s);
    st->base = engCardAt(j, s);
    st->f10 = (uint32_t)engSpellImmunity(j, s);
    st->f11 = (uint32_t)engTrapImmunity(j, s);
    st->f12 = (uint32_t)engMonsterImmunity(j, s);
    if (!(flags & 2) && engCard71cb90((int)cardId(sl.card))) {
        int v = (int)engSlotKeyTypeValue(j, s, 0x1cb7, 2);
        if (v >= 0) st->baseAtk = v;
    }
    if (engSlotLive(j, s) && !(sl.flags & 4)) {
        int val = (int)sl.value;
        if (engSlotTrapMonster(j, s)) engTokenStats(st->base, st);
        int b = st->base;
        if (b == cardNormalize((int)cardId(sl.card))) {   // values the card declared for itself
            switch (b) {
            case 0x1a4e: st->baseAtk = st->baseDef = val * 800; break;
            case 0x1864: if (val) st->baseAtk = 2000; break;
            case 0xf57: {   // copies the linked monster's current ATK/DEF
                uint32_t k = engLinkTarget(j, s);
                if ((k & 0xffff) != 0xffff) {
                    EngStats o;
                    engStatsOf2(k & 0xff, (int)((k & 0xffff) >> 8), &o);
                    st->baseAtk = o.atk;
                    st->baseDef = o.def;
                }
                keep = true;
                break;
            }
            case 0x14fc: keep = true; break;
            case 0x18b4: case 0x18fb: st->baseAtk = st->baseDef = val; break;
            case 0x1cb2: if (val) st->baseAtk = 1900; break;
            case 0x1c5d: st->baseAtk = val; break;
            case 0x1c76: if (val) st->baseAtk = 2100; break;
            case 0x1c77: if (val) st->baseDef = 2400; break;
            case 0x1ceb: st->baseAtk = val * 1000; break;
            case 0x1838: case 0x1f37:
                if (val) {
                    st->baseAtk /= 2;
                    st->baseDef /= 2;
                }
                break;
            }
        }
        switch (st->base) {
        case 0x1a1e:
            if (engCountMonstersTextEx(j, engIsHarpie, st->card, 1) > 1) {
                st->baseAtk <<= 1;
                st->baseDef <<= 1;
            }
            break;
        case 0x18c5: st->baseAtk = (engGraveCountProp(j, 0x18c5) + engGraveCountProp(j, 0xfbe)) * 1000; break;
        case 0x120e:
            if (val > 0) {
                if ((uint32_t)val < g_eng.turn) {
                    st->baseAtk <<= 1;
                    st->baseDef <<= 1;
                } else {
                    st->baseAtk = (st->baseAtk + 1) >> 1;
                    st->baseDef = (st->baseDef + 1) >> 1;
                }
            }
            break;
        case 0x18b0: st->baseDef = engBanishCountRace(j, 6) * 700; break;
        case 0x191b: st->baseAtk = engBanishCountRace(j, 9) * 1000; break;
        case 0x1c21: st->baseDef = 2300; break;
        case 0x1ad5: st->baseAtk = st->baseDef = engLevel(j, s) * 300; break;
        case 0x1c20: st->baseAtk = 2100; break;
        case 0x1cab: st->baseAtk = 2300; break;
        }
        if (keep) return;
    }
    for (uint32_t i = sl.head; i;) {
        const EngNode& n = g_eng.node[i];
        i = n.next;
        switch (n.kind & 0xf) {
        case 1: case 2:
            if (flags & 2) break;
            [[fallthrough]];
        case 3: case 4: case 5:
            switch (n.key) {
            case 0x17b3: st->baseDef = 0; break;
            case 0x1d2b: st->baseAtk = 0; break;
            case 0x14b0: st->baseAtk = n.value; break;
            case 0x1621: st->baseAtk = 200; break;
            case 0xf47: case 0xf49: {   // the next two nodes carry ATK then DEF
                const EngNode& a = g_eng.node[i];
                st->baseAtk = a.value;
                st->baseDef = g_eng.node[a.next].value;
                i = g_eng.node[a.next].next;
                break;
            }
            case 0x12cb: case 0x19d2: case 0x19f1: case 0x1f08: case 0x1f24:
                std::swap(st->baseAtk, st->baseDef);
                break;
            }
            break;
        case 10: {   // a field card (key = slot << 8 | player) sets base ATK while its side mask doesn't cover us
            uint32_t p = n.key & 0xff, q = n.key & 1, ss = (uint32_t)(uint8_t)(n.key >> 8);
            const EngSlot& src = g_eng.pl[q].slot[ss];
            if (!cardId(src.card) || !src.faceUp || (src.flags & 0x100)) break;
            int c = engCardAt(p, (int)ss);
            uint32_t mask = (cardIsTrap(c) ? st->f11 : st->f10) & ((j != p) + 1u);
            if (mask) break;
            if (c == 0xeb6) st->baseAtk = 0;
            else if (c == 0x1e46) {
                int mine = g_eng.pl[q].lp, theirs = g_eng.pl[(1 - p) & 1].lp;
                if (mine < theirs) st->baseAtk = 2400;
                else if (theirs < mine) st->baseAtk = 1000;
            }
            break;
        }
        }
    }
}
