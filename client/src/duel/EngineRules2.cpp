// Engine rule queries (0x006f31f0..0x006f4eb0): tributes, free zones, spell/trap counts.
// tests/duel_rules_test.py compares every function with the decompiled original on randomised boards.
#include "EngineInternal.h"


// this file's and EngineRules3.cpp's functions used before their definition
int engMayTribute(uint32_t j, uint32_t p, int s);   // FUN_006f3ba0
int engDoubleTribute(uint32_t j, int card, uint32_t p, int s);   // FUN_006f3df0
int engMayTributeFor(uint32_t j, uint32_t p, int s, int card, int needed);   // FUN_006f31f0
int engMayTributeForSet(uint32_t j, uint32_t p, int s);   // FUN_006f3d60
int engCountSpellTrapsIf(uint32_t j, int faceUp, int faceDown, int withField);   // FUN_006f43b0
int engFirstFreeSpellSlot(uint32_t j);   // FUN_006f45a0
int engImmuneSpell(uint32_t j, int s, int otherSide);   // FUN_006f61d0

static EngSlot& tslot(uint32_t j, int s) { return g_eng.pl[j & 1].slot[s]; }
static bool liveOn(uint32_t j, int s) { return engSlotLive(j, s) && !(tslot(j, s).flags & 4); }

// @yo2 0x006f31f0 the monster at (p, s) may be tributed by j for `card`, which needs `needed` tributes: the tribute's
// own restrictions (tokens, Cloudians, ...), then the card's (same attribute, race, owner, archetype ...)
int engMayTributeFor(uint32_t j, uint32_t p, int s, int card, int needed) {
    if (cardRace(card) != 2 && engCountLiveAll(0x1eb1)) return 0;
    const EngSlot& sl = tslot(p, s);
    switch (engCardAt(p, s)) {   // the tribute
    case 0xf64:
        if (!engCardAttrIs(card, 2)) return 0;
        break;
    case 0xf3d: case 0xf3e: case 0xf3f: case 0xf40: case 0xf41: case 0xf42: case 0xf4b: case 0xf4c: case 0xf4d:
    case 0xf62: case 0xf67: case 0xf69:
        return 0;
    case 0xf55: case 0xf56:
        if (sl.flags & 0x40000) return 0;
        break;
    case 0xf5d:
        if (!engIsCloudian(card)) return 0;
        break;
    case 0x1836: case 0x1dee:
        if (liveOn(p, s)) return 0;
        break;
    case 0x1d06:
        if (cardRace(card) != 0xf) return 0;
        break;
    }
    bool seen = j == p || sl.faceUp;   // j's own, or face-up
    enum { BASE, ATTR, RACE } check = BASE;
    switch (card) {   // the card being summoned
    case 0x1a40: case 0x1bea: case 0x1beb:
        check = ATTR;
        break;
    case 0x1c62: case 0x1d8a:
        if (needed >= 2) check = ATTR;
        break;
    case 0x1a96:
        if (needed > 1 && (j != p || cardOwner(sl.card) == j)) return 0;
        break;
    case 0x1b2d:
        if (needed > 1 && (!seen || !engIsPhantomBeast(engCardText(p, s)))) return 0;
        break;
    case 0x16ec: case 0x1725: case 0x1729: case 0x1985: case 0x1986: case 0x1b2e: case 0x1b2f: case 0x1cce:
    case 0x1ccf: case 0x1f38: case 0x1f39:
        if (j != p) return 0;
        check = RACE;
        break;
    case 0x164a: case 0x164b: case 0x164c: case 0x164d: case 0x164e: case 0x164f:   // the Guardians: their weapon
        if (needed) {
            bool found = false;
            for (int t = 0; t < 10; t++) {
                if (engCardText(j, t) != engGuardianWeapon(card) || !tslot(j, t).faceUp) continue;
                if ((t <= 4 && p == j && s != t) || (t >= 5 && !engLinkType(p, s, j, t))) found = true;
            }
            if (!found) return 0;
        }
        break;
    case 0x194c:
        if (!seen || engAtk(p, s) < 2000) return 0;
        break;
    case 0x1e99:
        if (needed >= 2) {
            if (!seen || !engIsWorm(engCardText(p, s))) return 0;
            check = RACE;
        }
        break;
    case 0x1e7a: case 0x1eae:
        if (needed >= 2) {
            if (!seen) return 0;
            check = RACE;
        }
        break;
    case 0x1f11:
        if (needed > 1 && (!seen || !engCardGroup54(engCardText(p, s)))) return 0;
        break;
    case 0x1d87:
        if (needed >= 2) {
            if (j != p) return 0;
            check = RACE;
        }
        break;
    }
    if (check == ATTR && (!seen || !engHasAttr(p, s, cardAttr(card)))) return 0;
    if (check == RACE && (uint32_t)(uint16_t)engRace(p, s) != (uint32_t)cardRace(card)) return 0;
    return engMayTribute(j, p, s);
}

// @yo2 0x006f3ba0 the monster at (p, s) may be tributed by j at all (the opponent's only with a 0x13eb node for j)
int engMayTribute(uint32_t j, uint32_t p, int s) {
    int at = engCardAt(p, s);
    if (!at || s > 4 || !engMayChangePosition()) return 0;
    if (j != p && !engSlotHasKeyValue(p, s, 0x13eb, j)) return 0;
    if (engSlotHasKey(p, s, 0x16a4) || engSlotHasKey(p, s, 0x12d1) || engSlotSourcesEffective(p, s, 0x1eba)) return 0;
    if (at == 0x1900 && liveOn(p, s)) return 0;
    return 1;
}

// @yo2 0x006f3cd0 the same, except live 0x1bea / 0x1d06
int engMayTribute3cd0(uint32_t j, uint32_t p, int s) {
    int at = engCardAt(p, s);
    if ((at == 0x1bea || at == 0x1d06) && liveOn(p, s)) return 0;
    return engMayTribute(j, p, s);
}

// @yo2 0x006f3d60 the same, except a live 0x1d06
int engMayTributeForSet(uint32_t j, uint32_t p, int s) {
    if (engCardAt(p, s) == 0x1d06 && liveOn(p, s)) return 0;
    return engMayTribute(j, p, s);
}

// @yo2 0x006f3df0 the monster at (p, s) counts as two tributes for `card`
int engDoubleTribute(uint32_t j, int card, uint32_t p, int s) {
    const EngSlot& sl = tslot(p, s);
    if ((sl.flags & 0x100) || (p != j && !sl.faceUp)) return 0;
    int at = engCardAt(p, s);
    switch (at) {
    case 0x1b8c:
        return cardAttr(card) == cardAttr(0x1b8c) && cardRace(card) == cardRace(0x1b8c);
    case 0x1521: case 0x1798: case 0x17e8: case 0x17e9: case 0x1873: case 0x1874:
        return cardAttr(card) == cardAttr(at);
    case 0x1c2d: case 0x1c2e: case 0x1cc7: case 0x1cc8:
        return engIsNormalKind2(card) && cardAttr(card) == cardAttr(at);
    case 0x1da1:
        return sl.value == 2 && engIsArcanaForce(card);
    }
    return 0;
}

// @yo2 0x006f3ff0 tributes available to j for `card` (double tributes count twice); 0 when no monster zone would be
// free afterwards
uint32_t engTributesFor(uint32_t j, int card, int needed) {
    bool own = engFreeMonsterZones(j) > 0;
    if (!engMayChangePosition()) return 0;
    uint32_t n = 0;
    for (uint32_t p = 0; p < 2; p++)
        for (int s = 0; s < 5; s++) {
            const EngSlot& sl = tslot(p, s);
            if (!cardId(sl.card) || (sl.flags & 8) || !engMayTributeFor(j, p, s, card, needed)) continue;
            if (p == j && eng6f2b60(p, s)) own = true;
            n += 1 + engDoubleTribute(j, card, p, s);
        }
    return own ? n : 0;
}

static EngSlot& slotAt(uint32_t j, int s) { return g_eng.pl[j & 1].slot[s]; }
static bool occupied(uint32_t j, int s) { return cardId(slotAt(j, s).card) != 0; }

// @yo2 0x006f4110 the monsters j could tribute for a set; 0 when no monster zone would be free afterwards (none free
// now and none of the tributes is j's own in a usable zone)
uint32_t engTributesForSet(uint32_t j) {
    bool own = engFreeMonsterZones(j) > 0;   // Ghidra loses this: the exe keeps it in param_1's stack slot
    if (!engMayChangePosition()) return 0;
    uint32_t n = 0;
    for (uint32_t p = 0; p < 2; p++)
        for (int s = 0; s < 5; s++) {
            const EngSlot& sl = slotAt(p, s);
            if (cardId(sl.card) && !(sl.flags & 8) && engMayTributeForSet(j, p, s)) {
                if (p == j && eng6f2b60(p, s)) own = true;
                n++;
            }
        }
    return own ? n : 0;
}

// @yo2 0x006f41f0 tributes available for a set, leaving out the monster at key (slot << 8 | player)
int engTributesExcept(uint32_t j, uint32_t key) {
    if (!engMayChangePosition()) return 0;
    int n = 0;
    for (uint32_t p = 0; p < 2; p++)
        for (int s = 0; s < 5; s++) {
            const EngSlot& sl = slotAt(p, s);
            if (cardId(sl.card) && !(sl.flags & 8) && ((uint32_t)(s << 8 | p)) != key) n += engMayTributeForSet(j, p, s);
        }
    return n;
}

// @yo2 0x006f42b0 tributes of one race (j's own monsters, or the opponent's face-up ones)
int engTributesOfRace(uint32_t j, uint32_t race) {
    if (!engMayChangePosition()) return 0;
    int n = 0;
    for (uint32_t p = 0; p < 2; p++)
        for (int s = 0; s < 5; s++) {
            const EngSlot& sl = slotAt(p, s);
            if (cardId(sl.card) && !(sl.flags & 8) && (p == j || sl.faceUp) &&
                ((uint32_t)engRace(p, s) & 0xffff) == race)
                n += engMayTributeForSet(j, p, s);
        }
    return n;
}

// @yo2 0x006f4380 every spell/trap card of j, field spell included
int engCountSpellTraps(uint32_t j) { return engCountSpellTrapsIf(j, 0, 0, 1); }

// @yo2 0x006f43b0 j's spell/trap cards (slots 5..9, the field slot with withField, and trap monsters): all of them
// when faceUp == faceDown, else only the face-up / face-down ones
int engCountSpellTrapsIf(uint32_t j, int faceUp, int faceDown, int withField) {
    int n = 0;
    int end = withField ? 11 : 10;
    for (int s = 0; s < end; s++) {
        const EngSlot& sl = slotAt(j, s);
        if (!cardId(sl.card) || (s <= 4 && !engSlotTrapMonster(j, s))) continue;
        bool want = faceUp ? (faceDown ? true : sl.faceUp != 0) : (faceDown ? sl.faceUp == 0 : true);
        if (want) n++;
    }
    return n;
}

// @yo2 0x006f4490 cards in j's spell/trap zone (slots 5..9)
int engCountSpellZone(uint32_t j) {
    int n = 0;
    for (int s = 5; s < 10; s++)
        if (occupied(j, s)) n++;
    return n;
}

// @yo2 0x006f44e0 the slot is empty and usable (FUN_006f2b60)
int engSlotFree(uint32_t j, int s) { return !occupied(j, s) && eng6f2b60(j, s); }

// @yo2 0x006f4550 the spell slot a new spell/trap would take, -1 when none (a full field under 0x16df counts)
int engFreeSpellSlot(uint32_t j) {
    if (engCountLiveAll(0x16df) && engCountField(j) > 4) return -1;
    return engFirstFreeSpellSlot(j);
}

// @yo2 0x006f45a0 the first free spell slot from the centre out (7, 8, 6, 9, 5), -1 when none
int engFirstFreeSpellSlot(uint32_t j) {
    static const int order[5] = {2, 3, 1, 4, 0};   // the exe's table at 0x00beb7cc
    for (int o : order)
        if (engSlotFree(j, o + 5)) return o + 5;
    return -1;
}

// @yo2 0x006f45f0
int engCountFreeSpellSlots(uint32_t j) {
    int n = 0;
    for (int s = 5; s < 10; s++)
        if (engSlotFree(j, s)) n++;
    return n;
}

// @yo2 0x006f4630 free spell slots, capped by 5 - FUN_006f2250 while 0x16df is on the field
uint32_t engSpellRoom(uint32_t j) {
    int n = engCountFreeSpellSlots(j);
    if (!engCountLiveAll(0x16df)) return n;
    if (5 - engCountField(j) <= n) n = 5 - engCountField(j);
    return n < 1 ? 0 : n;
}

// @yo2 0x006f46b0 j has room for this spell/trap (field spells: the field slot rules of 0x16df and 0x1bd7)
int engHasRoomFor(uint32_t j, int card) {
    if (cardIcon(card) != 2) return engFreeSpellSlot(j) >= 0;
    bool fieldTaken = cardId(slotAt(j, Z_FIELD).card) != 0;
    if (engCountLiveAll(0x16df) && !fieldTaken && engCountField(j) > 4) return 0;
    if (engCountLiveAll(0x1bd7) && fieldTaken) return 0;
    return 1;
}

// @yo2 0x006f47a0 j has a face-up toon monster
int engHasFaceUpToon(uint32_t j) {
    for (int s = 0; s < 5; s++) {
        const EngSlot& sl = slotAt(j, s);
        if (cardId(sl.card) && sl.faceUp && engIsToonKind(cardId(sl.card))) return 1;
    }
    return 0;
}

// @yo2 0x006f4820 none of j's face-up monsters has FUN_00703fa0 bits 0x46
int eng6f4820(uint32_t j) {
    for (int s = 0; s < 5; s++) {
        const EngSlot& sl = slotAt(j, s);
        if (cardId(sl.card) && sl.faceUp && ((uint32_t)engAttrMask(j, s) & 0x46)) return 0;
    }
    return 1;
}

// @yo2 0x006f48a0 face-up spells in slots 5..9
int engCountFaceUpSpells(uint32_t j) {
    int n = 0;
    for (int s = 5; s < 10; s++) {
        const EngSlot& sl = slotAt(j, s);
        if (cardId(sl.card) && sl.faceUp && engSlotSpellish(j, s)) n++;
    }
    return n;
}

// @yo2 0x006f4920 face-up traps in slots 0..9 (trap monsters included)
int engCountFaceUpTraps(uint32_t j) {
    int n = 0;
    for (int s = 0; s < 10; s++) {
        const EngSlot& sl = slotAt(j, s);
        if (cardId(sl.card) && sl.faceUp && engSlotTrap(j, s)) n++;
    }
    return n;
}

// @yo2 0x006f49a0 face-down cards in slots 5..9
int engCountSetSpellTraps(uint32_t j) {
    int n = 0;
    for (int s = 5; s < 10; s++) {
        const EngSlot& sl = slotAt(j, s);
        if (cardId(sl.card) && !sl.faceUp) n++;
    }
    return n;
}

// @yo2 0x006f49f0 face-up non-trap cards in slots 5..9 with this spell icon (4 also takes flag 13, 3 also monsters)
int engCountSpellIcon(uint32_t j, int icon) {
    int n = 0;
    for (int s = 5; s < 10; s++) {
        const EngSlot& sl = slotAt(j, s);
        if (!sl.faceUp) continue;
        int card = cardId(sl.card);
        if (cardIsTrap(card)) continue;
        if (cardIcon(card) != icon) {
            if (icon == 4) {
                if (!(sl.flags & 0x2000)) continue;
            } else if (icon != 3 || !cardIsMonster(card)) {
                continue;
            }
        }
        n++;
    }
    return n;
}

// @yo2 0x006f4ac0 other face-up monsters (either side) that are the same card as the one at (j, s) by text
int engCountSameFaceUp(uint32_t j, int s) {
    int text = engCardText(j, s);
    if (!slotAt(j, s).faceUp || !text) return 0;
    int n = 0;
    for (uint32_t p = 0; p < 2; p++)
        for (int t = 0; t < 5; t++) {
            if (p == j && t == s) continue;
            const EngSlot& sl = slotAt(p, t);
            if (!sl.faceUp || (sl.flags & 8) || (sl.flags & 2)) continue;
            int other = engCardText(p, t);
            if (engSameCard(text, other) || engSameCard(other, text)) n++;
        }
    return n;
}

// @yo2 0x006f4c00 the active field spell is `card` (A Legendary Ocean counts as Umi)
int engFieldSpellIs(int card) { return (card == 0x10f4 && g_eng.fieldSpell == 0x150b) || (int)g_eng.fieldSpell == card; }

// @yo2 0x006f4c40 a live, unshut 0x1368 in a spell slot protects the card at (j, s): it is listed in the 0x1368
// card's text and has no 0x1368 node naming its uid
int eng6f4c40(uint32_t j, int s) {
    uint32_t w = slotAt(j, s).card;
    if (!cardId(w)) return 0;
    for (uint32_t p = 0; p < 2; p++) {
        if (engImmuneSpell(j, s, j != p)) continue;
        for (int t = 5; t < 10; t++) {
            if (engCardAt(p, t) != 0x1368 || !engSlotLive(p, t)) continue;
            const EngSlot& src = slotAt(p, t);
            if (src.flags & 4) continue;
            if (engTextHas(j, s, src.value) && !engSlotHasKeyValue(p, t, 0x1368, cardUid(w))) return 1;
        }
    }
    return 0;
}

// @yo2 0x006f4dc0 a live 0x1368 names `card` and (uid >= 0) has no 0x1368 node for that uid; uids 0 and 1 never match
int eng6f4dc0(int card, uint32_t uid) {
    if (!(uid & ~1u)) return 0;
    for (uint32_t p = 0; p < 2; p++)
        for (int t = 5; t < 10; t++) {
            if (engCardAt(p, t) != 0x1368 || !engSlotLive(p, t)) continue;
            const EngSlot& src = slotAt(p, t);
            if (src.flags & 4) continue;
            if (!engSameCard(card, src.value)) continue;
            if ((int)uid < 0 || !engSlotHasKeyValue(p, t, 0x1368, uid)) return 1;
        }
    return 0;
}

// @yo2 0x006f4eb0 0 for a monster in attack position with a 0x1de1 node, else 1
int eng6f4eb0(uint32_t j, int s) {
    if (slotAt(j, s).def == 0 && engSlotHasKey(j, s, 0x1de1)) return 0;
    return 1;
}
