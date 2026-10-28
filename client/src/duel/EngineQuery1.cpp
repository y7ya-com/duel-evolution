// Pile primitives and field queries (0x006f0600..0x006f2000).
#include "EngineInternal.h"

static EngSlot& slotAt(uint32_t j, int s) { return g_eng.pl[j & 1].slot[s]; }
static bool shut(uint32_t j, int s) { return g_eng.vca4a0 >> (((j << 4) + s) & 0x1f) & 1; }

static bool battleScratchScene() {
    int s = ndLogScene();
    return s == 0xc9 || s == 0xca || s == 0xd2;
}

// @yo2 0x006f0600 take the card at (j, zone, index) out of the board (the pile shrinks; a field slot is cleared with its
// nodes and the nodes that pointed at it)
void engRemoveAt(uint32_t j, int zone, int index) {
    uint32_t* w = engWordAt(j, zone, index);
    engNodeCardMoved(zone, 0, w);
    switch (zone) {
    case Z_HAND: engHandRemove(j, w); return;
    case Z_EXTRA: engExtraRemove(j, w); return;
    case Z_DECK: engDeckRemove(j, w); return;
    case Z_GRAVE: engGraveRemove(j, w); return;
    case Z_BANISH: engBanishRemove(j, w); return;
    }
    if (battleScratchScene() && zone + index > 10) {
        EngSlot* t = (j == g_eng.vcc3c0 && (uint32_t)zone == g_eng.vcc3dc) ? &g_eng.tmpSlot[0] : &g_eng.tmpSlot[1];
        engSlotClear(t);
        return;
    }
    engNodeFreeKeyAll((uint8_t)j, (uint8_t)(zone + index));
    engSlotClear(&slotAt(j, zone + index));
    g_eng.vca4a0 &= ~(1u << (((j << 4) + zone + index) & 0x1f));
}

// @yo2 0x006f07b0 empty a slot record and free its nodes
void engSlotClear(EngSlot* s) {
    engNodeFreeList(s->head);
    *s = EngSlot{};
}

// @yo2 0x006f07e0 put a card into (j, zone): piles append (deck: index 0 = top, else bottom; banished: index is
// the view record), field slots take index = face | def << 8 (monsters) or face (spells)
void engInsertAt(uint32_t j, int zone, uint32_t index, uint32_t* w) {
    switch (zone) {
    case Z_HAND: engHandPush(j, w); break;
    case Z_EXTRA: engExtraPush(j, w); break;
    case Z_DECK:
        if (!index) engDeckPushTop(j, w);
        else engDeckPushBottom(j, w);
        break;
    case Z_GRAVE: engGravePush(w); break;
    case Z_BANISH: engBanishPush(w, index); break;
    case 0x10: break;
    default:
        if (zone < 5) engPlaceCard(j, zone, w, (uint16_t)(index >> 8 & 0xff), index & 0xff);
        else engPutCard(j, zone, w, index & 0xff);
        break;
    }
    engNodeCardMoved(0, zone, w);
}

// @yo2 0x006f0990
int engFindLiveCard0(uint32_t j, int card) { return engFindLiveCard(j, card, -1); }

// @yo2 0x006f09c0 first slot (monsters for a monster card, else spells) other than `skip` holding live, unshut `card`
int engFindLiveCard(uint32_t j, int card, int skip) {
    int lo = cardIsMonster(card) ? 0 : 5, hi = cardIsMonster(card) ? 4 : 10;
    for (int s = lo; s <= hi; s++)
        if (s != skip && engCardAt(j, s) == card && engSlotLive(j, s) && !(slotAt(j, s).flags & 4) && !shut(j, s)) return s;
    return -1;
}

// @yo2 0x006f0aa0 first face-up spell slot whose card text is `card`
int engFindSpellText(uint32_t j, int card) {
    for (int s = 5; s <= 10; s++)
        if (engCardText(j, s) == card && slotAt(j, s).faceUp) return s;
    return -1;
}

// @yo2 0x006f0b20 first face-up, un-negated monster whose card text is `card`
int engFindMonsterText(uint32_t j, int card) {
    for (int s = 0; s < 5; s++) {
        EngSlot& sl = slotAt(j, s);
        if (engCardText(j, s) == card && sl.faceUp && !(sl.flags >> 2 & 2) && !(sl.flags & 2)) return s;
    }
    return -1;
}

// @yo2 0x006f0bb0 (j, s) holds `card`, live and not shut
int engSlotIsLive(uint32_t j, int s, int card) {
    return engCardAt(j, s) == card && engSlotLive(j, s) && !(slotAt(j, s).flags & 4) && !shut(j, s);
}

// @yo2 0x006f0c50 (j, s) holds `card` face-up, not negated (flags 3 / 1) and not shut
int engSlotIsFaceUp(uint32_t j, int s, int card) {
    EngSlot& sl = slotAt(j, s);
    return engCardAt(j, s) == card && sl.faceUp && !(sl.flags >> 2 & 2) && !(sl.flags & 2) && !shut(j, s);
}

// @yo2 0x006f0cf0 an effect record {j, slot, ..., card at [6], ... [0x10]} still applies
int engEffectStillOn(const uint32_t* rec) {
    if (engIsEffectKind(rec[6])) {
        if (rec[0x10]) return 0;
        if (!engSlotLive(rec[0], rec[1])) return 0;
    }
    return 1;
}

static bool liveCopy(uint32_t j, int s, int card) {
    return engCardAt(j, s) == card && engSlotLive(j, s) && !(slotAt(j, s).flags & 4) && !shut(j, s);
}

// @yo2 0x006f0d40 live copies of `card` on j's side other than slot `skip` (monsters 0-4, field spells slot 10,
// other spells/traps 5-9)
int engCountLive(uint32_t j, int card, int skip) {
    int n = 0;
    if (cardIsMonster(card)) {
        for (int s = 0; s < 5; s++)
            if (s != skip && liveCopy(j, s, card)) n++;
        return n;
    }
    if (cardIcon(card) == 2) return liveCopy(j, 10, card) ? 1 : 0;
    for (int s = 5; s < 10; s++)
        if (s != skip && liveCopy(j, s, card)) n++;
    return n;
}

// @yo2 0x006f0f40 live copies of `card` on the whole field
int engCountLiveAll(int card) {
    int n = 0;
    for (uint32_t j = 0; j < 2; j++) {
        if (cardIsMonster(card)) {
            for (int s = 0; s < 5; s++) n += liveCopy(j, s, card);
        } else if (cardIcon(card) != 2) {
            for (int s = 5; s < 10; s++) n += liveCopy(j, s, card);
        } else {
            n += liveCopy(j, 10, card);
        }
    }
    return n;
}

// @yo2 0x006f1140 live copies of `card` on the sides not excluded by `skipMask` (bit 0 j, bit 1 the opponent); 0 =
// the whole field
int engCountLiveSides(int card, uint32_t j, uint32_t skipMask) {
    if (!skipMask) return engCountLiveAll(card);
    int n = 0;
    if (!(skipMask & 1)) n = engCountLive(j, card, -1);
    if (!(skipMask & 2)) n += engCountLive(1 - j, card, -1);
    return n;
}

// @yo2 0x006f11c0 monsters of j showing `card`, live and unshut (flag 2 not checked)
int engCountMonsterCard(uint32_t j, int card) {
    int n = 0;
    for (int s = 0; s < 5; s++)
        if (engCardAt(j, s) == card && engSlotLive(j, s) && !shut(j, s)) n++;
    return n;
}

// @yo2 0x006f1230 ... both sides
int engCountMonsterCardAll(int card) { return engCountMonsterCard(1, card) + engCountMonsterCard(0, card); }

// @yo2 0x006f1260 live monsters of j showing `card` in position `def`
int engCountMonsterCardPos(uint32_t j, int card, uint32_t def) {
    int n = 0;
    for (int s = 0; s < 5; s++)
        if (engCardAt(j, s) == card && slotAt(j, s).def == def && engSlotLive(j, s) && !(slotAt(j, s).flags & 4) &&
            !shut(j, s))
            n++;
    return n;
}

// @yo2 0x006f1320 live monsters of j showing `card` that were set this turn (flag 18)
int engCountMonsterCardSet(uint32_t j, int card) {
    int n = 0;
    for (int s = 0; s < 5; s++)
        if (engCardAt(j, s) == card && engSlotLive(j, s) && !(slotAt(j, s).flags & 4) && (slotAt(j, s).flags & 0x40000) &&
            !shut(j, s))
            n++;
    return n;
}

// @yo2 0x006f13e0
int engCountCopies0(uint32_t j, int card) { return engCopyStamp(j, card, 0); }

// @yo2 0x006f1410 the earliest (newest = 1: latest) placement stamp among j's live copies of `card`; 0 = none
uint16_t engCopyStamp(uint32_t j, int card, int newest) {
    uint16_t best = 0;
    bool monster = cardIsMonster(card);
    for (int s = monster ? 0 : 5; s <= (monster ? 4 : 10); s++) {
        EngSlot& sl = slotAt(j, s);
        if (engCardAt(j, s) != card || !engSlotLive(j, s) || (sl.flags & 4) || (monster && shut(j, s))) continue;
        if (!best || (newest ? best < sl.turn : sl.turn < best)) best = sl.turn;
    }
    return best;
}

// @yo2 0x006f15d0 the earliest stamp of `card` on either side
int engCopyStampFirst(int card) {
    int a = engCountCopies0(0, card), b = engCountCopies0(1, card);
    return a && (!b || a < b) ? a : b;
}

// @yo2 0x006f1610
int engCopyStampLast0(uint32_t j, int card) { return engCopyStamp(j, card, 1); }

// @yo2 0x006f1640 the latest stamp of `card` on either side
int engCopyStampLast(int card) {
    int a = engCopyStampLast0(0, card), b = engCopyStampLast0(1, card);
    return a && (!b || b < a) ? a : b;
}

// @yo2 0x006f1680 live copies of `card` on j's side (not `skip`) placed at stamp >= minStamp (< -minStamp if negative)
int engCountCopiesSince(uint32_t j, int card, int skip, int minStamp) {
    int n = 0;
    bool monster = cardIsMonster(card);
    for (int s = monster ? 0 : 5; s <= (monster ? 4 : 10); s++) {
        EngSlot& sl = slotAt(j, s);
        if (s == skip || engCardAt(j, s) != card || !engSlotLive(j, s) || (sl.flags & 4) || (monster && shut(j, s))) continue;
        if (minStamp < 0 ? (int)sl.turn < -minStamp : minStamp <= (int)sl.turn) n++;
    }
    return n;
}

// @yo2 0x006f1840 ... both sides
int engCountCopiesSinceAll(int card, int minStamp) {
    return engCountCopiesSince(1, card, -1, minStamp) + engCountCopiesSince(0, card, -1, minStamp);
}

static bool upAndOn(const EngSlot& sl) { return sl.faceUp && !(sl.flags >> 2 & 2) && !(sl.flags & 2); }

// @yo2 0x006f1880 face-up, un-negated cards on j's side counting as `card` (monsters: any text with that property;
// spells: that exact text), not slot `skip`
int engCountText(uint32_t j, int card, int skip) {
    int n = 0;
    if (cardIsMonster(card)) {
        for (int s = 0; s < 5; s++)
            if (engCardText(j, s) > 0 && s != skip && engTextHas(j, s, card) && upAndOn(slotAt(j, s))) n++;
        return n;
    }
    for (int s = 5; s <= 10; s++)
        if (engCardText(j, s) > 0 && s != skip && engCardText(j, s) == card && upAndOn(slotAt(j, s))) n++;
    return n;
}

// @yo2 0x006f19f0
int engCountText0(uint32_t j, int card) { return engCountText(j, card, -1); }
// @yo2 0x006f1a20 ... both sides
int engCountTextAll(int card) { return engCountText(1, card, -1) + engCountText(0, card, -1); }

// @yo2 0x006f1a60 face-up cards of j (slots 0-10) whose text has property p
int engCountTextProp(uint32_t j, int p) {
    int n = 0;
    for (int s = 0; s <= 10; s++)
        if (engTextHas(j, s, p) && slotAt(j, s).faceUp) n++;
    return n;
}

// @yo2 0x006f1ae0 ... both sides
int engCountTextPropAll(int p) { return engCountTextProp(1, p) + engCountTextProp(0, p); }

// @yo2 0x006f1b10 face-up, un-negated monsters of j whose card passes `pred`
int engCountMonstersIf(uint32_t j, int (*pred)(int)) {
    int n = 0;
    for (int s = 0; s < 5; s++) {
        EngSlot& sl = slotAt(j, s);
        if (sl.faceUp && !(sl.flags >> 2 & 2) && !(sl.flags & 2) && pred(cardId(sl.card))) n++;
    }
    return n;
}

// @yo2 0x006f1ba0 live spells of j showing `card` that can still take a counter
int engCountSpellsWithRoom(uint32_t j, int card) {
    int n = 0;
    for (int s = 5; s <= 10; s++) {
        int c = engCardAt(j, s);
        if (c > 0 && c == card && engSlotLive(j, s) && !(slotAt(j, s).flags & 4) && engCanAddCounter(j, s)) n++;
    }
    return n;
}

// @yo2 0x006f1c60 live copies of `card` on j's side whose value is `value`
int engCountCardValue(uint32_t j, int card, int value) {
    int n = 0;
    bool monster = cardIsMonster(card);
    for (int s = monster ? 0 : 5; s <= (monster ? 4 : 10); s++)
        if (engCardAt(j, s) == card && engSlotLive(j, s) && !(slotAt(j, s).flags & 4) && (int)slotAt(j, s).value == value) n++;
    return n;
}

// @yo2 0x006f1d40 live spells of j showing `card` with value >= min
int engCountSpellValueMin(uint32_t j, int card, uint32_t min) {
    int n = 0;
    for (int s = 5; s <= 10; s++) {
        int c = engCardAt(j, s);
        if (c > 0 && c == card && engSlotLive(j, s) && !(slotAt(j, s).flags & 4) && min <= slotAt(j, s).value) n++;
    }
    return n;
}

static bool upMonster(uint32_t j, int s) {
    EngSlot& sl = slotAt(j, s);
    return cardId(sl.card) && sl.faceUp && !(sl.flags & 8);
}

// @yo2 0x006f1e00 face-up monsters of j (not being summoned, not `skip`) of race `race`
int engCountRace(uint32_t j, uint32_t race, int skip) {
    int n = 0;
    for (int s = 0; s < 5; s++)
        if (s != skip && upMonster(j, s) && ((uint32_t)engRace(j, s) & 0xffff) == race) n++;
    return n;
}

// @yo2 0x006f1ea0
int engCountRace0(uint32_t j, uint32_t race) { return engCountRace(j, race, -1); }

// @yo2 0x006f1ed0 face-up monsters of j (not `skip`) with attribute `attr` (FUN_007040c0)
int engCountAttr(uint32_t j, int attr, int skip) {
    int n = 0;
    for (int s = 0; s < 5; s++)
        if (s != skip && upMonster(j, s) && engHasAttr(j, s, attr)) n++;
    return n;
}

// @yo2 0x006f1f70
int engCountAttr0(uint32_t j, int attr) { return engCountAttr(j, attr, -1); }

// @yo2 0x006f1fa0 face-up monsters of j sharing an attribute bit (above bit 0) with `mask`
int engCountAttrMask(uint32_t j, uint32_t mask) {
    int n = 0;
    for (int s = 0; s < 5; s++)
        if (upMonster(j, s) && (engAttrMask(j, s) & mask & 0xfe)) n++;
    return n;
}

// @yo2 0x006f2030 slots of j (0-10) whose text has property p
int engCountSlotsProp(uint32_t j, int p) {
    int n = 0;
    for (int s = 0; s < 0xb; s++)
        if (engTextHas(j, s, p)) n++;
    return n;
}

// @yo2 0x006f2070 cards owned by j with property p: on both fields (by owner bit) and in j's graveyard
int engCountOwnedProp(uint32_t j, int p) {
    int n = 0;
    for (uint32_t k = 0; k < 2; k++)
        for (int s = 0; s < 0xb; s++) {
            uint32_t w = slotAt(k, s).card;
            if (cardOwner(w) == j && engSameCard(cardId(w), p)) n++;
        }
    EngPlayer& pl = g_eng.pl[j & 1];
    for (uint32_t i = 0; i < pl.graveCount; i++)
        if (engSameCard(cardId(pl.grave[i]), p)) n++;
    return n;
}

// @yo2 0x006f2180 j has the face-up ritual-ish spell 0x12be
int engHas12be(uint32_t j) { return engFindSpellText(j, 0x12be) >= 0; }

// @yo2 0x006f21b0 live monsters of j (not being summoned) showing `card` in position `def`
int engCountLivePos(uint32_t j, int card, uint32_t def) {
    int n = 0;
    for (int s = 0; s < 5; s++) {
        EngSlot& sl = slotAt(j, s);
        if (cardId(sl.card) && !(sl.flags & 8) && engSlotIsLive(j, s, card) && sl.def == def) n++;
    }
    return n;
}

// @yo2 0x006f2250 cards of j on the field (slots 0-10, not being summoned)
int engCountField(uint32_t j) {
    int n = 0;
    for (int s = 0; s < 0xb; s++)
        if (cardId(slotAt(j, s).card) && !(slotAt(j, s).flags & 8)) n++;
    return n;
}

// @yo2 0x006f22a0 monsters of j (not being summoned)
int engCountMonsters(uint32_t j) {
    int n = 0;
    for (int s = 0; s < 5; s++)
        if (cardId(slotAt(j, s).card) && !(slotAt(j, s).flags & 8)) n++;
    return n;
}

// @yo2 0x006f22f0
int engCountMonsters2(uint32_t j) { return engCountMonsters(j); }
// @yo2 0x006f2310
int engCountMonstersText(uint32_t j, int (*pred)(int)) { return engCountMonstersTextEx(j, pred, -1, 1); }
// @yo2 0x006f2340
int engCountMonstersTextAll(int (*pred)(int)) { return engCountMonstersText(1, pred) + engCountMonstersText(0, pred); }

// @yo2 0x006f2370 un-negated monsters of j (face-up if `faceUp`) whose card text passes `pred`, ignoring text `skip`
int engCountMonstersTextEx(uint32_t j, int (*pred)(int), int skip, int faceUp) {
    int n = 0;
    for (int s = 0; s < 5; s++) {
        int t = engCardText(j, s);
        EngSlot& sl = slotAt(j, s);
        if (t && t != skip && !(sl.flags >> 2 & 2) && !(sl.flags & 2) && (!faceUp || sl.faceUp) && pred(t)) n++;
    }
    return n;
}

// @yo2 0x006f2430 face-up, un-negated monsters of j other than `skip` whose card text passes `pred`
int engCountMonstersTextSkip(uint32_t j, int (*pred)(int), int skip) {
    int n = 0;
    for (int s = 0; s < 5; s++) {
        EngSlot& sl = slotAt(j, s);
        if (s != skip && sl.faceUp && !(sl.flags >> 2 & 2) && !(sl.flags & 2) && pred(engCardText(j, s))) n++;
    }
    return n;
}

// @yo2 0x006f24d0 1 for 0x1c06, 2 for 0x1d11, 0 otherwise
int eng6f24d0(int card) {
    if (card == 0x1c06) return 1;
    return card == 0x1d11 ? 2 : 0;
}

static bool on(const EngSlot& sl) { return !(sl.flags >> 2 & 2) && !(sl.flags & 2); }

// @yo2 0x006f2500 distinct face-up monster texts of j passing `pred` (copies that "count as" an earlier one are not new),
// plus one for each of the two special kinds (0x1c06 / 0x1d11) present
int engCountDistinct(uint32_t j, int (*pred)(int)) {
    int n = 0;
    uint32_t kinds = 0;
    for (int s = 0; s < 5; s++) {
        int t = engCardText(j, s);
        EngSlot& sl = slotAt(j, s);
        if (!t || !sl.faceUp || !on(sl) || !pred(t)) continue;
        int k = 0;
        for (; k < s; k++) {
            int u = engCardText(j, k);
            EngSlot& o = slotAt(j, k);
            if (u && o.faceUp && on(o) && pred(u) && engSameCard(t, u)) break;
        }
        if (k == s) n++;
        kinds |= (uint32_t)eng6f24d0(engCardAt(j, s));
    }
    return engPopCount(kinds) + n;
}

// @yo2 0x006f2690 face-up, un-negated cards of j (slots 0-10) whose text passes `pred`
int engCountFieldTextIf(uint32_t j, int (*pred)(int)) {
    int n = 0;
    for (int s = 0; s < 0xb; s++)
        if (slotAt(j, s).faceUp && on(slotAt(j, s)) && pred(engCardText(j, s))) n++;
    return n;
}

// @yo2 0x006f2730 ... both sides
int engCountFieldTextIfAll(int (*pred)(int)) { return engCountFieldTextIf(1, pred) + engCountFieldTextIf(0, pred); }

// @yo2 0x006f2760 ... spell zones 5-9 only
int engCountSpellTextIf(uint32_t j, int (*pred)(int)) {
    int n = 0;
    for (int s = 5; s < 10; s++)
        if (slotAt(j, s).faceUp && on(slotAt(j, s)) && pred(engCardText(j, s))) n++;
    return n;
}

// @yo2 0x006f2800 field cards of j that are FUN_007179e0 cards
int engCountField7179e0(uint32_t j) {
    int n = 0;
    for (int s = 0; s < 0xb; s++)
        if (engIsTokenKind(cardId(slotAt(j, s).card))) n++;
    return n;
}

// @yo2 0x006f2870 monsters of j (not being summoned), only face-up ones if `faceUp`, only attack-position ones if `atk`
int engCountMonstersPos(uint32_t j, int faceUp, int atk) {
    int n = 0;
    for (int s = 0; s < 5; s++) {
        EngSlot& sl = slotAt(j, s);
        if (cardId(sl.card) && !(sl.flags & 8) && (!faceUp || sl.faceUp) && (!atk || !sl.def)) n++;
    }
    return n;
}

// @yo2 0x006f2910 monsters of j (not being summoned) with exactly that face and position
int engCountMonstersFacePos(uint32_t j, uint32_t faceUp, uint32_t def) {
    int n = 0;
    for (int s = 0; s < 5; s++) {
        EngSlot& sl = slotAt(j, s);
        if (cardId(sl.card) && !(sl.flags & 8) && sl.faceUp == faceUp && sl.def == def) n++;
    }
    return n;
}

// @yo2 0x006f2990 ... with that face
int engCountMonstersFace(uint32_t j, uint32_t faceUp) {
    int n = 0;
    for (int s = 0; s < 5; s++) {
        EngSlot& sl = slotAt(j, s);
        if (cardId(sl.card) && !(sl.flags & 8) && sl.faceUp == faceUp) n++;
    }
    return n;
}

// @yo2 0x006f2a00 ... in that position
int engCountMonstersDef(uint32_t j, uint32_t def) {
    int n = 0;
    for (int s = 0; s < 5; s++) {
        EngSlot& sl = slotAt(j, s);
        if (cardId(sl.card) && !(sl.flags & 8) && sl.def == def) n++;
    }
    return n;
}

// @yo2 0x006f2a70 monsters of j whose text passes `pred` (face-up only if `faceUp`, attack position only if `atk`)
int engCountMonstersPosIf(uint32_t j, int faceUp, int atk, int (*pred)(int)) {
    int n = 0;
    for (int s = 0; s < 5; s++) {
        int t = engCardText(j, s);
        EngSlot& sl = slotAt(j, s);
        if (t && pred(t) && (!faceUp || sl.faceUp) && (!atk || !sl.def)) n++;
    }
    return n;
}

// @yo2 0x006f2b60
int eng6f2b60(uint32_t j, int s) { return engZoneOpen(j, s, 1); }

// @yo2 0x006f2b90 zone `zone` of player j can take a card (not closed by a zone-lock card; with `negatedOk` a negated
// lock does not count)
int engZoneOpen(uint32_t j, uint32_t zone, int negatedOk) {
    uint32_t bitMine = 1u << (((j << 4) + zone) & 0x1f);
    if ((int)zone > 4) {
        for (uint32_t p = 0; p < 2; p++)
            for (uint32_t i = slotAt(p, 11).head; i;) {
                const EngNode& e = g_eng.node[i];
                i = e.next;
                if ((e.kind & 0xf) != 6) continue;
                uint32_t sj = e.key & 0xff, ss = e.key >> 8;
                EngSlot& src = slotAt(sj & 1, ss);
                int c = engCardAt(sj, ss);
                bool locks;
                if (c == 0x1aa9) locks = j != p && (src.value & 1u << ((zone + 16) & 0x1f));
                else locks = c == 0x1dcf && j == p && (src.value & bitMine);
                if (locks && (!negatedOk || !(src.flags & 0x100))) return 0;
            }
        for (uint32_t p = 0; p < 2; p++)
            for (int s = 0; s < 5; s++)
                if (engSlotTrapMonster(p, s) && engSlotKeyValue(p, s, 0x1472) == (zone << 8 | j)) return 0;
        return 1;
    }
    for (uint32_t p = 0; p < 2; p++) {
        for (uint32_t i = slotAt(p, 11).head; i;) {
            const EngNode& e = g_eng.node[i];
            i = e.next;
            if ((e.kind & 0xf) != 6) continue;
            uint32_t sj = e.key & 0xff, ss = e.key >> 8;
            EngSlot& src = slotAt(sj & 1, ss);
            uint32_t mask;
            switch (engCardAt(sj, ss)) {
            case 0xeb7: mask = (uint32_t)e.value << ((sj << 4) & 0x1f); break;
            case 0x1432: case 0x17ee: case 0x1c0b: case 0x1dbe: case 0x1e86: mask = src.value; break;
            default: continue;
            }
            if (mask && (mask & bitMine) && !(src.flags & 4) && (!negatedOk || !(src.flags & 0x100))) return 0;
        }
        EngPlayer& pl = g_eng.pl[p];
        for (uint32_t k = 0; k < pl.banishCount; k++)   // a banished card holding its old zone
            if (pl.banishView[k][0] == 0x40 && j == (pl.banishView[k][1] & 1u) && zone == (uint32_t)(pl.banishView[k][1] >> 4)) return 0;
    }
    return 1;
}

// @yo2 0x006f2fd0 monster zone s of j is empty and open
int engZoneFree(uint32_t j, int s) { return !cardId(slotAt(j, s).card) && eng6f2b60(j, s); }

// @yo2 0x006f3040 how many monsters j can still summon (free zones, capped by 0x16df and the opponent's 0x15e5)
int engFreeMonsterZones(uint32_t j) {
    int n = engFreeMonsterZonesRaw(j);
    if (engCountLiveAll(0x16df)) {
        int cap = 5 - engCountField(j);
        if (cap < 1) return 0;
        if (cap <= n) n = cap;
    }
    int o = engCountLive(1 - j, 0x15e5, -1) ? engCountMonsters(1 - j) : 0;
    if (o) {
        int cap = o - engCountMonsters(j);
        if (cap < 1) return 0;
        if (cap <= n) return cap;
    }
    return n;
}

// @yo2 0x006f3120 free monster zones of j
int engFreeMonsterZonesRaw(uint32_t j) {
    int n = 0;
    for (int s = 0; s < 5; s++) n += engZoneFree(j, s) != 0;
    return n;
}

// @yo2 0x006f3160 the zone a new monster of j goes to, -1 = none
int engNextMonsterZone(uint32_t j) { return engFreeMonsterZones(j) ? engFirstFreeZone(j) : -1; }

// @yo2 0x006f31a0 first free monster zone in the exe's preference order (0x00beb7b8: middle first)
int engFirstFreeZone(uint32_t j) {
    static const int order[5] = {2, 3, 1, 4, 0};
    for (int z : order)
        if (engZoneFree(j, z)) return z;
    return -1;
}
