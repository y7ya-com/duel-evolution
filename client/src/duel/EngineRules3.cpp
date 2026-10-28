// Engine rule queries (0x006f4f20..0x006f76f0): position changes and flip/gemini summons, who controls a monster,
// immunities to spells / traps / monster effects, what a chain link may affect, what may be sent where.
// tests/duel_rules_test.py compares every function with the decompiled original on randomised boards.
#include "EngineInternal.h"


// this file's functions used before their definition
int eng6f4c40(uint32_t j, int s);   // FUN_006f4c40 (EngineRules2.cpp)
int engFreeSpellSlot(uint32_t j);   // FUN_006f4550 (EngineRules2.cpp)
uint32_t engSpellImmunity(uint32_t j, int s);   // FUN_006f5f00
uint32_t engTrapImmunity(uint32_t j, int s);   // FUN_006f6210
uint32_t engMonsterImmunity(uint32_t j, int s);   // FUN_006f6380
int engImmuneSpell(uint32_t j, int s, int otherSide);   // FUN_006f61d0
int engImmuneTrap(uint32_t j, int s, int otherSide);   // FUN_006f6340
int engImmuneMonster(uint32_t j, int s, int otherSide);   // FUN_006f64b0
int engCannotChangeControl(uint32_t j, int s);   // FUN_006f5d30
int engLinkMayAffectSlot(const uint16_t* link, uint32_t j, int s, int targeted, int deny);   // FUN_006f6b20
int engMaySendTo(uint32_t j, int s, int zone);   // FUN_006f7170

static EngSlot& slotAt(uint32_t j, int s) { return g_eng.pl[j & 1].slot[s]; }
static bool liveOn(uint32_t j, int s) { return engSlotLive(j, s) && !(slotAt(j, s).flags & 4); }
static bool negatedOrGone(const EngSlot& sl) { return (sl.flags & 0x100) || (sl.flags & 8) || (sl.flags & 2); }
static uint32_t linkController(const uint16_t* link) { return (link[1] >> 14 & 1) ^ (link[1] & 1); }

static bool replayScene() {
    int s = ndLogScene();
    return s == 0xc9 || s == 0xca || s == 0xd2 || s == 0xd3 || s == 0xd4;
}

// @yo2 0x006f4f20 the monster at (j, s) may change its battle position now. On a refusal for the viewer, the reason
// goes to 0x012cc378 (3 summoned this turn, 0x10 protected by 0x1368, 0x12 a lock)
int engSlotMayChangePos(uint32_t j, int s) {
    const EngSlot& sl = slotAt(j, s);
    if (!cardId(sl.card) || g_eng.vcca64 == 8) return 0;
    if (sl.flags & 0x200000) {
        if (j == g_eng.viewer) g_eng.vcc378 = 3;
        return 0;
    }
    uint32_t spellImm = engSpellImmunity(j, s), trapImm = engTrapImmunity(j, s), monImm = engMonsterImmunity(j, s);
    int key12ce = replayScene() ? engSlotHasKey(j, 0xb, 0x12ce) : engSlotHasExpiring(j, 0xb, 0x12ce);
    bool locked = key12ce || engSlotHasKey(j, 0xb, 0x131e) || engSlotHasKey(j, s, 0x17b3) ||
                  engSlotHasKey(j, s, 0x1990) || engSlotHasKey(j, s, 0x1b69) || engSlotHasKey(j, s, 0x1da8) ||
                  engSlotHasKey(j, s, 0x1eee) || engSlotSourcesEffective(j, s, 0x1103) ||
                  engSlotSourcesEffective(j, s, 0x1243) || engSlotSourcesEffective(j, s, 0x14b2) ||
                  engSlotSourcesEffective(j, s, 0x17b1) ||
                  (engSlotSourcesEffective(j, s, 0x1842) && !engSlotIsLive(j, s, 0x1c25)) ||
                  engSlotSourcesEffective(j, s, 0x1743);
    if (!locked) {
        int here = engSlotIsLive(j, s, 0x1284);
        bool ok = engCountLiveSides(0x1284, j, monImm) - here < 1 &&
                  (!engCountLiveSides(0x10ef, j, trapImm) || !sl.faceUp || (int16_t)engRace(j, s) != 1) &&
                  (!engCountLiveSides(0x15fb, j, trapImm) || !sl.faceUp) && !engCountLiveSides(0x1d5a, j, monImm);
        if (ok) {
            if (eng6f4c40(j, s)) {
                if (j == g_eng.viewer) g_eng.vcc378 = 0x10;
                return 0;
            }
            if (!engSlotLive(j, s) || (sl.flags & 4) ||
                (!engSlotHasKey(j, s, 0x1419) && (engCardAtEx(j, s, 0) != 0x1d9d || sl.def != 0))) {
                if ((spellImm & 2) ||
                    (!engCountLive(1 - j, 0x165e, -1) && !engCountSpellsWithRoom(1 - j, 0x187c)))
                    return 1;
            }
        }
    }
    if (j == g_eng.viewer) g_eng.vcc378 = 0x12;
    return 0;
}

// @yo2 0x006f53c0 the face-down monster at (j, s) may be flip summoned (some cards need a partner, room or no copy
// of themselves face-up)
int engMayFlipSummon(uint32_t j, int s) {
    if (slotAt(j, s).faceUp || !engSlotMayChangePos(j, s) || !engMaySet(j)) return 0;
    int card = engCardAt(j, s);
    uint32_t who = j;   // whose copies may not be on the field (0x1d3c / 0x1e66: both players')
    switch (card) {
    case 0x1d3c: case 0x1e66:
        if (engCountTextProp(0, card)) return 0;
        who = 1;
        break;
    case 0x164a: case 0x164b: case 0x164c: case 0x164d: case 0x164e: case 0x164f:
        if (!engCountTextProp(j, engGuardianWeapon(card))) return 0;
        return engRaceAttrAllowed0(j, card) != 0;
    case 0xe9f: case 0x158b: case 0x160f: case 0x1be9: case 0x1d66: case 0x1d98: case 0x1e73:
        break;
    case 0x1691:
        if (!engCountMonstersText(j, engIsArchfiend)) return 0;
        return engRaceAttrAllowed0(j, card) != 0;
    case 0x1dbe: {
        int n = 0;
        for (int t = 0; t < 5; t++)
            if (!cardId(slotAt(j, t).card) && engZoneOpen(j, t, 0)) n++;
        if (n < 2) return 0;
        return engRaceAttrAllowed0(j, card) != 0;
    }
    default:
        return engRaceAttrAllowed0(j, card) != 0;
    }
    if (engCountTextProp(who, card)) return 0;
    return engRaceAttrAllowed0(j, card) != 0;
}

// @yo2 0x006f55e0 the face-up gemini monster at (j, s) may be summoned again to gain its effect
int engMayGeminiSummon(uint32_t j, int s) {
    const EngSlot& sl = slotAt(j, s);
    if (!sl.faceUp || (sl.flags & 0x100)) return 0;
    if (!engIsGeminiKind(engCardAt(j, s)) || engGeminiOn(j, s) || !engMayNormalSummon(j)) return 0;
    if (eng6f4c40(j, s) || engNoNormalSummon(cardId(sl.card))) return 0;
    if (!engImmuneMonster(j, s, 1) && engCountCardValue(1 - j, 0x197d, engAttr(j, s))) return 0;
    return 1;
}

// @yo2 0x006f5720 who controls the monster at (j, s): the card's owner, changed by the slot's control nodes (mode 1
// only looks at kind 5 and 10 nodes; mode 2 returns the controller the nodes say, other modes the owner they leave)
uint32_t engController(uint32_t j, int s, int mode) {
    const EngSlot& here = slotAt(j, s);
    uint32_t owner = cardOwner(here.card);
    uint32_t result = 0xffffffff;
    uint8_t spellImm = (uint8_t)engSpellImmunity(j, s);
    uint32_t trapImm = engTrapImmunity(j, s);
    bool basic = mode == 1;
    if (engCountLiveSides(0x1632, j, trapImm)) {   // Mind Control-like lock: the opponent's 0x1632 swaps sides
        if (!(trapImm & 2) && engCountLive(1 - j, 0x1632, -1)) j = 1 - j;
        return mode != 2 ? owner : j;
    }
    uint32_t cur = owner ^ (here.flags & 1);
    for (uint32_t i = here.head; i; ) {
        const EngNode& n = g_eng.node[i];
        i = n.next;
        uint32_t key = n.key;
        uint32_t p = key & 0xff, t = key >> 8, q = key & 1;
        uint8_t v = n.value & 1;
        switch (n.kind & 0xf) {
        case 1:
            if (basic) break;
            // fall through: like kind 5
        case 5: {
            if ((engCard71a270(key) == 1 && (engCountLiveAll(0x148e) || engCountLiveAll(0x14da))) ||
                !engCard6ee450(key, n.kind & 0xf))
                break;
            if (key == 0x19c0 || key == 0x11cf || key == 0x1925 || key == 0x1da2 || key == 0x1da4) {
                cur = v;
                result = 1 - v;
            } else if (key == 0x1857) {
                cur = owner;
                result = v;
            } else {
                cur = v;
                result = v;
            }
            break;
        }
        case 6: case 7: {
            if (basic) break;
            if (!cardId(engSlotRaw(q, t)->card) || !engSlotLive(p, t) || (engSlotRaw(q, t)->flags & 4)) break;
            int at = engCardAt(p, t);
            bool take = false, takeValue = false;
            if (at == 0x1be4 || at == 0x1a9c) {
                take = !engImmuneTrap(j, s, j != p);
            } else if ((at >= 0x18bf && at <= 0x18c2) || at == 0x1df0) {
                takeValue = !engImmuneMonster(j, s, j != p) && engHasAttr(j, s, cardAttr(engCardAt(p, t)));
            } else if (at == 0x1c84) {
                takeValue = !engImmuneMonster(j, s, j != p);
            }
            if (take) {   // the node's player takes it
                cur = result = owner = p;
            } else if (takeValue) {
                cur = v;
                result = p;
                owner = cur;
            }
            break;
        }
        case 10: {
            if (basic) {
                int at = engCardAt(p, t);
                if (at == 0x15e6 || at == 0x1c37) cur = cardOwner(here.card);
                break;
            }
            const EngSlot& src = *engSlotRaw(q, t);
            if (!cardId(src.card) || !src.faceUp || (src.flags & 0x100)) break;
            if ((spellImm & ((j != p) + 1u)) && !cardIsTrap(cardId(src.card))) break;
            int at = engCardAt(p, t);
            if (at == 0x169a || at == 0x1322 || at == 0x1466 || at == 0x1877) {
                cur = result = owner = p;
            } else if (at == 0x13ea) {
                cur = src.value;
                result = p;
                owner = cur;
            } else if (at == 0x1edf) {
                cur = src.value ^ p;
                result = p;
                owner = cur;
            }
            break;
        }
        }
    }
    if (mode != 2) result = cur;
    return result;
}

// @yo2 0x006f5d30 the monster's control may not change (being summoned / gone, or a live card that forbids it)
int engCannotChangeControl(uint32_t j, int s) {
    const EngSlot& sl = slotAt(j, s);
    if ((sl.flags & 8) || (sl.flags & 4)) return 1;
    if (!liveOn(j, s)) return 0;
    int at = engCardAt(j, s);
    if (engCard71ca30(at)) return 1;
    if (at == 0x17e4 || at == 0x1826 || at == 0x1860) return engCountAttr0(j, 3) || engCountAttr0(1 - j, 3);
    return 0;
}

// @yo2 0x006f5e40 the opponent may take the card at (j, s) (a face-up trap monster needs a free spell slot there)
int engMayTakeControl(uint32_t j, int s) {
    const EngSlot& sl = slotAt(j, s);
    if (!cardId(sl.card)) return 0;
    if (sl.faceUp) {
        if (engCannotChangeControl(j, s)) return 0;
        if (engSlotTrapMonster(j, s) && engFreeSpellSlot(1 - j) < 0) return 0;
    }
    return 1;
}

// @yo2 0x006f5f00 the face-up monster's immunity to spells: bit 1 against its controller's, bit 0 against the
// opponent's (3 = both)
uint32_t engSpellImmunity(uint32_t j, int s) {
    int at = engCardAt(j, s);
    if (!at || s > 4) return 0;
    const EngSlot& sl = slotAt(j, s);
    if (!sl.faceUp) return 0;
    uint32_t bits = 0;
    if (!negatedOrGone(sl)) {
        switch (at) {
        case 0x17d1: case 0x17d3: case 0x1c10: case 0x164e: case 0x1742:
            return 3;
        case 0x1814: case 0x181a:
            bits = 2;
            break;
        case 0x1c72:
            if (sl.flags & 0x40) return 3;
            break;
        case 0x12a8: case 0x13cd: case 0x1706: case 0x1709:   // while Umi is out
            if (engFieldSpellIs(0x10f4) && !(sl.flags & 0x100)) return 3;
            break;
        }
    }
    if (engAffectedBy2(j, s, 0x1693, j, -1)) bits = 2;
    if (engAffectedBy2(j, s, 0x1693, 1 - j, -1)) bits |= 1;
    if (!engSlotEffectMonster0(j, s) && engCountLiveAll(0x1667)) return 3;
    if (engSlotNoEffect(j, s)) {
        if (engCountLive(j, 0x17a1, -1)) bits |= 2;
        if (engCountLive(1 - j, 0x17a1, -1)) bits |= 1;
    }
    if (g_eng.vcc338 == 0 && engCardText(j, s) != 0x1dbb && engCountLiveAll(0x1dbb) && engLevel(j, s) < 4 &&
        (int16_t)engRace(j, s) == 2)
        return 3;
    return bits;
}

// @yo2 0x006f61d0 immune to the spells of its controller (otherSide 0) or of the opponent (otherSide 1)
int engImmuneSpell(uint32_t j, int s, int otherSide) { return (int)((otherSide + 1u) & engSpellImmunity(j, s)) > 0; }

// @yo2 0x006f6210 the face-up monster's immunity to traps (3 = both sides, else 0)
uint32_t engTrapImmunity(uint32_t j, int s) {
    int at = engCardAt(j, s);
    if (!at || s >= 5) return 0;
    const EngSlot& sl = slotAt(j, s);
    if (!sl.faceUp) return 0;
    if (!negatedOrGone(sl) && (at == 0x19c3 || at == 0x1437 || at == 0x194e || at == 0x1c10)) return 3;
    if (g_eng.vcc338 == 0 && engCardText(j, s) != 0x1dbb && engCountLiveAll(0x1dbb) && engLevel(j, s) < 4 &&
        (int16_t)engRace(j, s) == 2)
        return 3;
    return 0;
}

// @yo2 0x006f6340
int engImmuneTrap(uint32_t j, int s, int otherSide) { return (int)((otherSide + 1u) & engTrapImmunity(j, s)) > 0; }

// @yo2 0x006f6380 the face-up monster's immunity to monster effects (bits as engSpellImmunity)
uint32_t engMonsterImmunity(uint32_t j, int s) {
    int at = engCardAt(j, s);
    if (!at || s > 4) return 0;
    const EngSlot& sl = slotAt(j, s);
    if (!sl.faceUp) return 0;
    if (!negatedOrGone(sl) && at == 0x1c10) return 3;
    uint32_t bits = 0;
    int text = engCardText(j, s);
    if (text == 0x185a || text == 0x18b8 || text == 0x18b9) {
        if (engAffectedBy(j, s, 0x18df, j)) bits = 2;
        if (engAffectedBy(j, s, 0x18df, 1 - j)) bits |= 1;
    }
    return bits;
}

// @yo2 0x006f64b0
int engImmuneMonster(uint32_t j, int s, int otherSide) {
    return (int)((otherSide + 1u) & engMonsterImmunity(j, s)) > 0;
}

// @yo2 0x006f64f0 the monster at (j, s) is immune to a chain link: by the link card's type (a monster card activated
// from a spell slot counts as a spell)
int engImmuneToLink(const uint16_t* link, uint32_t j, int s) {
    int other = j != (link[1] & 1u);
    if (cardIsTrap(link[0])) return engImmuneTrap(j, s, other);
    uint32_t z = link[1] & 0x3e;
    if (cardIsSpell(link[0]) || (z > 9 && z < 0x14 && cardIsMonster(link[0]))) return engImmuneSpell(j, s, other);
    return engImmuneMonster(j, s, other);
}

// @yo2 0x006f65e0 a chain link's effect may affect the card at (j, s)
int engLinkMayAffect(const uint16_t* link, uint32_t j, int s) {
    const EngSlot& sl = slotAt(j, s);
    bool faceUp = sl.faceUp != 0;
    if (!cardId(sl.card)) return 0;
    if ((int32_t)g_eng.vc8744 > 0) return 1;
    if ((sl.flags & 8) || (sl.flags & 4)) return 0;
    int text = engCardText(j, s);
    uint32_t lp = linkController(link);
    uint32_t z = link[1] & 0x3e;
    if (s <= 4) {
        if (faceUp) {
            if (!(sl.flags & 0x100)) {
                int at = engCardAt(j, s);
                if (at == 0x1c10 || (at >= 0x1386 && at <= 0x1388)) return 0;
                if (at == 0x1ed9) {   // only level 7+ monsters' effects
                    bool cardLevelCheck = z > 0x14;
                    if (z < 9) {
                        uint32_t q = link[1] & 1, t = link[1] >> 1 & 0x1f;
                        const EngSlot& src = *engSlotRaw(q, t);
                        if (cardUid(src.card) != (uint32_t)(link[2] >> 6 & 0x1ff) || (src.flags & 4))
                            cardLevelCheck = true;
                        else if (engLevel(q, t) < 7)
                            return 0;
                    }
                    if (cardLevelCheck && cardIsMonster(link[0]) && cardLevel(link[0]) < 7) return 0;
                }
            }
            if ((int16_t)engRace(j, s) == 1) {
                if (engCountLiveAll(0x128b) || engCountLive(1 - lp, 0x1879, -1)) return 0;
            }
            if (engSlotHasKeyValue(j, s, 0x1c5e, lp)) return 0;
            if (engIsLightsworn(text) && engCountLiveAll(0x1e74)) return 0;
            if (engCardGroup58(text) && (engCountMonsterCardPos(0, 0x1ec6, 1) || engCountMonsterCardPos(1, 0x1ec6, 1)))
                return 0;
        }
        uint32_t opp = 1 - lp;
        for (int t = 0; t < 5; t++)
            if (!(opp == j && t == s) && cardId(g_eng.pl[opp & 1].slot[t].card) &&
                engAffectedBy2(opp, t, 0x15eb, opp, -1))
                return 0;
        bool spellLink = (z > 9 && z < 0x15) || (z > 0x14 && !cardIsMonster(link[0]));
        if (spellLink && j == 1 - lp && (!faceUp || text != 0x1b9c) && engCountLive(1 - lp, 0x1b9c, -1)) return 0;
    }
    if (faceUp && text > 0x17d1 && text < 0x17d5 && engCountLive(1 - lp, 0x17dc, -1)) return 0;
    return 1;
}

// @yo2 0x006f6b20 a chain link may target / affect the card at (j, s); `deny` is what a protecting card returns
// (targeted: the link targets it)
int engLinkMayAffectSlot(const uint16_t* link, uint32_t j, int s, int targeted, int deny) {
    uint32_t z = link[1] & 0x3e;
    bool spellish = (z >= 10 && z <= 0x14) || !cardIsMonster(link[0]);
    if (g_eng.vc8750) return 0;
    if (link[0] == 0) return 1;
    if (s == Z_FIELD && engCountLiveAll(0x1bd7)) return 0;
    const EngSlot& sl = slotAt(j, s);
    if (!sl.faceUp) {
        if (s < 5) return 1;
        return !engSlotHasKey(0, 0xb, 0x153c);
    }
    int at = engCardAt(j, s);
    if (liveOn(j, s)) {
        switch (at) {
        case 0x1ba7:
            if (s == Z_FIELD && engCountSpellTextIf(j, engIsCrystalBeast) > 0) return deny;
            break;
        case 0x150c:
            if (s >= 5 && (int16_t)engLinkTarget(j, s) != -1) return deny;
            break;
        case 0x1640:
            if (s <= 4 && !targeted && spellish) return deny;
            break;
        case 0x1645:
            if (s <= 4 && spellish) return deny;
            break;
        case 0x1cd3:
            if (s < 5 && spellish &&
                ((z > 0x14 && cardIsSpell(link[0])) || (z > 9 && z < 0x15 && !cardIsTrap(link[0]))))
                return deny;
            break;
        case 0x1e7d:
            if (s < 5) return deny;
            break;
        }
    }
    if (engCardText(j, s) == 0x169f && j == 1 - (link[1] & 1u) && link[0] != 0x1362 && engCountLive(j, 0x1683, -1))
        return deny;
    if (engSlotHasKey(j, s, 0x1a5c)) return deny;
    if (s < 5) {
        EngStats st{};
        engStatsOf2(j, s, &st);
        if (targeted && engSlotSourcesEffective(j, s, 0x150a) && (!engSlotTrapMonster(j, s) || engNo6ee020() != 2))
            return deny;
        if (engIsDestinyHero(st.card) && engCountMonsterCardSet(j, 0x1a05)) return deny;
        if (!(st.f12 & 1)) {
            if (cardIsTrap(link[0]) && st.race == 7 && st.atk < 0x4b1 && engCountMonsterCardPos(j, 0x1ea3, 0))
                return deny;
            if (spellish && engIsIceBarrier(st.card) && engCountMonsterCard(j, 0x1f12)) return deny;
        }
    }
    return 1;
}

// @yo2 0x006f6fd0
int engLinkMayAffectSlot0(const uint16_t* link, uint32_t j, int s, int targeted) {
    return engLinkMayAffectSlot(link, j, s, targeted, 0);
}

// @yo2 0x006f7000 the same for `card` activated from `zone` by j's opponent, as a fresh link record
int engCardMayAffectSlot(uint32_t j, int s, uint16_t card, uint8_t zone, int targeted) {
    uint16_t link[14] = {};
    link[0] = card;
    link[1] = (uint16_t)((~j & 1) | (zone & 0x1f) << 1);
    return engLinkMayAffectSlot(link, j, s, targeted, 0);
}

// @yo2 0x006f70a0 the card at (j, s) does not stop the draw lock (a face-up, live 0x1a8d monster does)
int eng6f70a0(uint32_t j, int s) {
    if (!engDrawLockActive()) return 0;
    const EngSlot& sl = slotAt(j, s);
    if (sl.faceUp && engCardAt(j, s) == 0x1a8d && !(sl.flags & 0x100) && s < 5) return 0;
    return 1;
}

// @yo2 0x006f7140
int engMaySendToGrave(uint32_t j, int s) { return engMaySendTo(j, s, Z_GRAVE); }

// @yo2 0x006f7170 the card at (j, s) may be sent to `zone` (hand 0xb, deck 0xd, graveyard 0xe) while the locks are on
int engMaySendTo(uint32_t j, int s, int zone) {
    int at = engCardAt(j, s);
    if (!at || engIsTokenKind(at)) return 0;
    if (!engDrawLockActive()) return 1;
    const EngSlot& sl = slotAt(j, s);
    if ((at == 0x16f8 || at == 0x1ce0) && sl.faceUp) return 0;
    if (sl.faceUp && engSlotHasKey(j, s, 0x1e15)) return 0;
    if (zone == Z_HAND) {
        if (cardIsMonster(at) && engCountLiveAll(0x1afc)) return 0;
    } else if (zone == Z_GRAVE) {
        uint32_t locks = engDrawLocks();
        if (locks & 0x10001) return 0;
        if ((locks & 0x20002) && cardIsMonster(at) && s < 5) return 0;
        if (locks & (4u << (cardOwner(sl.card) << 4))) return 0;
    }
    return 1;
}

// @yo2 0x006f7330
int engMayReturnToHand(uint32_t j, int s) { return engMaySendTo(j, s, Z_HAND); }

// @yo2 0x006f7360
int engMayReturnToDeck(uint32_t j, int s) { return engMaySendTo(j, s, Z_DECK); }

// @yo2 0x006f7390 counter 0x11 on the card times the live 0x1a90/0x1a92/0x1a94/0x1a96/0x1c83 monsters on the sides it
// is not immune to
// @yo2 0x006f73bf (not a function: a label inside 0x006f7390's loop that Ghidra split off)
int eng6f7390(uint32_t j, int s) {
    int counters = engCounters(j, s, 0x11);
    if (!counters) return 0;
    uint8_t imm = (uint8_t)engMonsterImmunity(j, s);
    int n = 0;
    for (uint32_t p = 0; p < 2; p++) {
        if (imm & ((j != p) + 1u)) continue;
        for (int t = 0; t < 5; t++) {
            int at = engCardAt(p, t);
            if ((at == 0x1a90 || at == 0x1a92 || at == 0x1a94 || at == 0x1a96 || at == 0x1c83) && liveOn(p, t)) n++;
        }
    }
    return counters * n;
}

// @yo2 0x006f74b0 the card at (j, s) may hold `card` as an equip: 1 yes, 2 yes as one of the listed cards, 0 no
int engMayEquip(uint32_t j, int s, int card) {
    if (!card) return 0;
    const EngSlot& sl = slotAt(j, s);
    if (sl.flags & 0x800) return 1;
    if (s < 5 || s > 10 || !sl.faceUp || (sl.flags & 0x2000)) return 0;
    if (cardIsMonster(card) || cardIcon(card) == 3) return 1;
    switch (card) {
    case 0xeb6: case 0x1231: case 0x1238: case 0x13ea: case 0x1514: case 0x1980: case 0x1a18: case 0x1a69:
    case 0x1cba: case 0x1d47: case 0x1efb:
        return (sl.flags & 8) || (sl.flags & 2) ? 0 : 2;
    }
    return 0;
}

// @yo2 0x006f7610 a link of player lj from zone lzone in the current chain targets (tj, tslot)
int engChainTargets(uint32_t tj, uint8_t tslot, uint32_t lj, uint32_t lzone) {
    for (int i = g_eng.chainCount - 1; i >= 0; i--) {
        const EngChain& c = g_eng.chain[i + 1];
        if ((c.bits & 1u) != lj || (uint32_t)((c.bits & 0x3e) >> 1) != lzone) continue;
        for (int k = 0; k < (c.w6 & 0x7f); k++)
            if ((uint32_t)engChainTarget(&c, k) == ((uint32_t)tslot << 8 | (tj & 0xff))) return 1;
    }
    return 0;
}

// @yo2 0x006f76f0 FUN_0071e6a0 on a link record made from the spell/trap at (j, s); 0 for monster slots
int eng6f76f0(uint32_t j, uint32_t s) {
    if ((int)s <= 4) return 0;
    uint32_t w = slotAt(j, s).card;
    uint16_t link[14] = {};
    link[0] = (uint16_t)cardId(w);
    link[1] = (uint16_t)((j & 1) | (s & 0x1f) << 1);
    link[2] = (uint16_t)(cardUid(w) << 6 & 0x7fc0);
    return engChainStopped(link);
}
