// Attack eligibility (0x006e6070..0x006e7b70).
#include "EngineInternal.h"

#include <initializer_list>

static EngSlot& slotAt(uint32_t j, int s) { return g_eng.pl[j & 1].slot[s]; }

// @yo2 0x006e6070 the monster may attack again this turn (cards with a second attack); `ignoreCard` skips its own text
int engMultiAttack(uint32_t j, int s, int ignoreCard) {
    EngSlot& sl = slotAt(j, s);
    if (!ignoreCard && engSlotLive(j, s) && !(sl.flags & 4)) {
        int c = engCardAt(j, s);
        switch (c) {
        case 0x1411: case 0x170a: case 0x1723: case 0x18b9: case 0x18fc: case 0x1a62: case 0x1c1c: case 0x1f2f:
            return 1;
        case 0x174f:
            if (engFieldSpellIs(0x10f4)) return 1;
            break;
        case 0x1da6:
            if (sl.value == 2) return 1;
            break;
        case 0x1ec5:
            if (!sl.def) return 1;
            break;
        case 0x1c78:
            if (sl.value) return 1;
            break;
        case 0x1b35:
            if (engCountMonstersTextEx(j, engIsSixSamurai, 0x1b35, 1)) return 1;
            break;
        case 0x14dc: case 0x1aec: case 0x1aed:
            if (engSlotHasKey(j, s, c)) return 1;
            break;
        }
    }
    return engSlotSourcesEffective(j, s, 0xeb6) || engSlotSourcesEffective(j, s, 0x1661) || engSlotHasKey(j, s, 0x18cb) ||
           engSlotHasKey(j, s, 0x19ab) || engSlotHasKey(j, s, 0x1d46) || engSlotHasKey(j, s, 0x1c5b) ||
           engSlotHasKeyValue(j, s, 0x1e27, 0) || engSlotHasKey(j, s, 0x1ef4);
}

// @yo2 0x006e6040
int engMultiAttack0(uint32_t j, int s) { return engMultiAttack(j, s, 0); }

// @yo2 0x006e6390 the monster has used up its attacks this turn (flag 22 = attacked, 23 = attacked twice)
int engAttacksUsed(uint32_t j, int s) {
    EngSlot& sl = slotAt(j, s);
    if (!(sl.flags & 0x400000)) return 0;
    uint32_t uid = cardUid(sl.card);
    if (!(sl.flags & 0x800000)) {
        if (engMultiAttack0(j, s)) return 0;
        if (engSlotLive(j, s) && !(sl.flags & 4)) {
            int c = engCardAt(j, s);
            if (c == 0x19f8) {
                if (engCountMonsters(1 - j) && g_eng.vcc3e8 == uid) return 0;
            } else if (c == 0xea2 || c == 0x14d5 || c == 0x1c55) {
                if (engCountMonsters(1 - j)) return 0;
            }
        }
        if (engSlotHasNode(j, s, 0x16cb, 4)) return 0;
    }
    if (engSlotHasKey(j, 11, 0x15ff)) return 0;
    if (engCardText(j, s) == 0x18a6 && engSlotHasKey(j, 11, 0x195b))
        return (int)engSlotKeyValue(j, s, 0x195b) <= engSlotCountKey(j, s, 0x18a6);
    if (engSlotLive(j, s) && !(sl.flags & 4)) {
        switch (engCardAt(j, s)) {
        case 0x1a79:
            if (sl.value) return 0;
            break;
        case 0x1505: case 0x1644: case 0x1958: case 0x1c1f: case 0x1e50: case 0x1e92: case 0x1fa2:
            return engSlotKeyValue(j, s, 0x1505) == 0;
        case 0x186c:
            return engCountLinks(j, s) + 1 <= engSlotCountKey(j, s, 0x186c);
        case 0x19c1:
            return engGraveCountProp(j, 0x19c1) + 1 <= engSlotCountKey(j, s, 0x19c1);
        case 0x1a4e:
            if (engSlotKeyValue(j, s, 0x1505)) return sl.value <= (uint32_t)engSlotCountKey(j, s, 0x1a4e);
            break;
        case 0x1ab3:
            if ((uint16_t)engType12Key(j, s) != 0xffff) return engSlotKeyValue(j, s, 0x1505) == 0;
            break;
        }
    }
    return 1;
}

// @yo2 0x006e67f0 the monster could declare an attack now (before looking for targets)
int engMayAttack(uint32_t j, int s, int x) {
    int c = engCardAt(j, s);
    if (!c) return 0;
    EngSlot& sl = slotAt(j, s);
    if (!sl.faceUp || g_eng.vcca64 == 9) return 0;
    if (sl.def) {
        if (c == 0x12b4) {
            if (sl.flags & 0x100) return 0;
        } else {
            if (c != 0x1956 || (sl.flags & 0x100) || engCountMonsters(1 - j)) return 0;
        }
    }
    if (engAttacksUsed(j, s)) return 0;
    return engAttackAllowed(j, s, x);
}

// @yo2 0x006e6750 ... and it has a target (direct attack or one of the opponent's monsters)
int engCanAttack(uint32_t j, int s, int x) {
    if (!engMayAttack(j, s, x)) return 0;
    if (engCanDirectAttack(j, s) || engDirectOverMonsters(j, s, 1)) return 1;
    for (int t = 0; t < 5; t++)
        if (engAttackTarget(j, s, 1 - j, t, 2)) return 1;
    return 0;
}

static int fail(uint32_t j) {
    if (j == g_eng.viewer) g_eng.vcc378 = 0x13;
    return 0;
}

// @yo2 0x006e6910 the rules that forbid this monster to attack; with `full` also the declaration costs/locks.
// On refusal the client's own monster records message 0x13 (0x10 for FUN_006f4c40) to show.
int engAttackAllowed(uint32_t j, int s, int full) {
    EngSlot& sl = slotAt(j, s);
    uint32_t o = 1 - j, uid = cardUid(sl.card);
    bool live = !(sl.flags & 0x100);
    if (sl.flags & 0x1000000) return fail(j);
    if (eng6f4c40(j, s)) {
        if (j == g_eng.viewer) g_eng.vcc378 = 0x10;
        return 0;
    }
    EngStats st;
    engStatsOf2(j, s, &st);
    if (engCountLive(j, 0x1a79, -1) && (st.base != 0x1a79 || !sl.value))
        for (int t = 0; t < 5; t++)
            if (t != s && engCardAt(j, t) == 0x1a79 && g_eng.pl[j & 1].slot[t].value) return fail(j);
    if (engSlotSourcesEffective(j, s, 0x149d) || engSlotSourcesEffective(j, s, 0x13f3) ||
        (engSlotSourcesEffective(j, s, 0x1842) && !engSlotIsLive(j, s, 0x1c25)) || engSlotSourcesEffective(j, s, 0x1103) ||
        engSlotSourcesEffective(j, s, 0x1243) || engSlotSourcesEffective(j, s, 0x14b2) ||
        (!(st.f11 & 2) && engCountSpellValueMin(o, 0x1766, st.atk)) || (!(st.f10 & 1) && engCountSpellsWithRoom(j, 0x1400)) ||
        (!(st.f10 & 2) && engCountSpellsWithRoom(o, 0x1400)) || (engCountLiveSides(0x14a1, j, st.f10) && (sl.flags & 0x70000)) ||
        (st.level > 3 && engCountLiveSides(0x140e, j, st.f11)))
        return fail(j);
    if (engCountLiveAll(0x1469)) {
        int v = (int)engSlotKeyValue(j, 11, 0x1469);
        if (v >= 0 && (uint32_t)v != uid) return fail(j);
    }
    if (!(st.f10 & 1))
        for (int t = 5; t < 10; t++)
            if (engSlotIsLive(j, t, 0x1eed) && engSlotHasKey(j, t, 0xfb6) && (uint16_t)engLinkTarget(j, t) == (uint16_t)(s << 8 | j))
                return fail(j);
    if (engSlotSourcesEffective(j, s, 0x1280) || engSlotSourcesEffective(j, s, 0x128a) ||
        engSlotSourcesEffective(j, s, 0x1743) || engSlotSourcesEffective(j, s, 0x1eba))
        return fail(j);
    int self = live && st.base == 0x1284;
    if (engCountLiveSides(0x1284, j, st.f12) - self > 0 ||
        (!(st.f12 & 2) && engCountLive(o, 0x1865, -1) && (sl.flags & 0x70000)) || engSlotHasKey(j, s, 0x16c9) ||
        engSlotHasKey(j, s, 0x1944) || engSlotHasExpiring(j, s, 0x1208) || engSlotHasKey(j, s, 0x15ed) ||
        engSlotHasKey(j, s, 0x156a) || engSlotHasKey(j, s, 0x1900) || engSlotHasKey(j, s, 0x14f7) ||
        engSlotHasKey(j, s, 0x1a7b) || engSlotHasKey(j, s, 0x1af4) || engSlotHasKey(j, s, 0x1af5) ||
        engSlotHasKeyValue(j, s, 0x1819, 0) ||
        (st.race == 0x12 && engSlotHasKey(j, 11, 0x1819) && !engSlotHasKeyValue(j, s, 0x1819, 1)) ||
        engSlotHasKeyValue(j, s, 0x1890, 1) || (engSlotHasKey(j, 11, 0x15ff) && !engSlotHasKey(j, s, 0x15ff)) ||
        (engSlotHasKey(j, 11, 0x195b) && uid != engSlotKeyValue(j, 11, 0x195b)) || engSlotHasNode(j, 11, 0x1a02, 2) ||
        (!(st.f10 & 1) && engSlotHasKey(j, 11, 0x1a0d)) || engSlotHasKey(j, 11, 0xebc) || engSlotHasKey(j, 11, 0x1bae) ||
        engSlotHasKey(j, 11, 0x1bb0) || engSlotHasKey(j, 11, 0x1bb1) || engSlotHasKey(j, 11, 0x1d2a) ||
        engSlotHasKeyValue(j, s, 0x1e27, 1))
        return fail(j);
    // monsters that need a spell of their own on the field
    if (st.card == 0x18f6) {
        if (!engSlotHasKey(j, s, 0x1d84) && engSlotHasKey(j, 11, 0x1d84)) return fail(j);
    } else if (st.card == 0xfa6 || st.card == 0xfa7) {
        if (!engSlotHasKey(j, s, 0x175b) && engSlotHasKey(j, 11, 0x175b)) return fail(j);
        if (engSlotHasKey(j, 11, 0x15e0)) return fail(j);
    } else if (st.card == 0xff8) {
        if (engSlotHasKey(j, 11, 0x17f6)) return fail(j);
    } else if (st.card == 0x1fa5 && !engSlotHasKey(j, s, 0x1fa5)) {
        return fail(j);
    }
    // monsters that cannot attack the turn they moved or after some actions
    uint32_t block = 0;
    switch (st.base) {
    case 0x1622:
        if (live) {
            if (engCountField(j) > 1) return fail(j);
            block = g_eng.pl[j & 1].handCount;
        }
        break;
    case 0x127d: case 0x127e: case 0x127f: case 0x12a5: case 0x1563: case 0x1564: case 0x1565: case 0x1566: case 0x161b:
        if (live) {
            if (sl.flags & 0x30000) return fail(j);
            block = sl.flags & 0x40000;
        }
        break;
    case 0x17c7: case 0x17c8: case 0x1deb:
        if (live) {
            if (sl.flags & 0x10000) return fail(j);
            block = sl.flags & 0x40000;
        }
        break;
    case 0xf4a: case 0x1636:
        if (!engSlotHasKey(j, s, 0x1636) && (int)cardId(sl.card) == st.base) return fail(j);
        break;
    case 0x1b4c:
        block = engSlotHasKeyValue(j, s, 0x1b4c, 0);
        break;
    case 0x1d6a:
        block = engSlotHasKey(j, s, 0x1d6a);
        break;
    }
    if (block) return fail(j);
    if (!engHasBlocker(o) && !engDirectAttackAllowed(j, s)) return fail(j);
    if (!full) return 1;
    if (engSlotHasKey(j, s, 0x1c81) || (engCountLiveSides(0xec3, j, st.f10) && engCountAttr0(j, 2)) ||
        (!(st.f10 & 2) && engCountSpellsWithRoom(o, 0x1102)) || (st.race != 7 && engSlotSourcesEffective(j, s, 0x130e)) ||
        (st.atk > 0x5db && engCountLiveSides(0x134a, j, st.f10)) ||
        (st.race == 10 && !(st.f10 & 2) && engCountLive(o, 0x12e0, -1)) || engSlotHasKey(j, s, 0xdcc) ||
        engSlotHasKey(j, s, 0x12d1) ||
        (engCountLiveSides(0x14d1, j, st.f10) && (sl.flags & 0x70000) &&
         ((int)g_eng.pl[j & 1].slot[10].value == st.race || (int)g_eng.pl[o & 1].slot[10].value == st.race)) ||
        (!(st.f11 & 1) && engCountCardValue(j, 0x1358, st.race)))
        return fail(j);
    if (!(st.f11 & 2)) {
        if (engCountCardValue(o, 0x1358, st.race)) return fail(j);
        if (engCountLive(o, 0x1a19, -1))
            for (int a = 1; a < 8; a++)
                if ((st.attrMask >> a & 1) && engCountCardValue(o, 0x1a19, a)) return fail(j);
    }
    if ((st.atk > 0x76b && engCountLiveSides(0x1523, j, st.f12)) || engSlotHasKey(j, s, 0x182c) || engSlotHasKey(j, s, 0x1b69) ||
        engSlotHasNode(j, s, 0x1b98, 3) || engSlotHasKey(j, s, 0x1d0a) || engSlotHasKey(j, 11, 0xeb5) ||
        engSlotHasKey(j, 11, 0x1886) || engSlotHasKey(j, 11, 0x1baf) || engSlotHasExpiring(j, 11, 0x172d) ||
        (engCounters(j, s, 0x11) && engCountLiveSides(0x1b4b, j, st.f12)) ||
        (engSlotHasKey(j, 11, 0x1cd8) && engIsSkyblaster(st.card)))
        return fail(j);
    if (st.level > 3) {
        if (!(st.f12 & 1))
            for (int t = 0; t < 5; t++)
                if (engSlotIsLive(j, t, 0x1d69) && engCountMonstersTextSkip(j, engIsIceBarrier, t)) return fail(j);
        if (!(st.f12 & 2))
            for (int t = 0; t < 5; t++)
                if (engSlotIsLive(o, t, 0x1d69) && engCountMonstersTextSkip(o, engIsIceBarrier, t)) return fail(j);
    }
    if (st.base == 0x1441 ? live : st.base == 0xf50 || st.base == 0xf51 || st.base == 0xf53) return fail(j);
    if (st.base == 0x14db && live && !engCountRace(j, 1, s)) return fail(j);
    int cost = 0;   // LP an attack costs
    if (live) {
        switch (st.base) {
        case 0x128f: case 0x12a0:
            if (!engTributesExcept(j, s << 8 | j)) return 0;
            break;
        case 0x11cd: case 0x18a4: cost = 1000; break;
        case 0x127d: case 0x127e: case 0x127f: case 0x12a5: cost = 500; break;
        }
    }
    int lock = engCountLive(o, 0x131d, -1);
    if ((!lock || engMayDrawN(j, lock)) && cost + engCountLiveAll(0x1320) * 500 < g_eng.pl[j & 1].lp) return 1;
    return fail(j);
}

static bool live(uint32_t j, int s) { return engSlotLive(j, s) && !(slotAt(j, s).flags & 4); }

// @yo2 0x006e7b70 monster (aj, as) may attack monster (tj, ts); mode 0 skips the target's own protections
int engAttackTarget(uint32_t aj, int as, uint32_t tj, int ts, int mode) {
    int a = engCardAt(aj, as), t = engCardAt(tj, ts), tBase = engCardText(tj, ts);
    uint32_t im = engSpellImmunity(aj, as), is = engTrapImmunity(aj, as), it = engMonsterImmunity(aj, as);
    bool aLive = live(aj, as);
    EngSlot& ts_ = slotAt(tj, ts);
    if (!t) return 0;
    if (engSlotHasKey(aj, 11, 0x15ff)) {
        if (!engSlotKeyValue(1 - aj, 11, 0x15ff) || engSlotHasKeyValue(tj, ts, 0x15ff, 0)) return 0;
    }
    if (aLive) {
        // monsters that may only attack a target they are linked to
        bool linked = false;
        switch (a) {
        case 0x1a79: linked = slotAt(aj, as).value != 0; break;
        case 0x1505: case 0x1644: case 0x1958: case 0x1c1f: case 0x1e50: linked = true; break;
        case 0x1ab3: linked = (uint16_t)engType12Key(aj, as) != 0xffff; break;
        case 0x1a4e:
            if (!engSlotKeyValue(aj, as, 0x1505)) return 0;
            break;
        case 0x1e92: {
            uint32_t v = engSlotKeyValue(aj, as, 0x1505);
            if (v == 0 || v == 1) return 0;
            if (v == 2 && (engLinkType(tj, ts, aj, as) || !ts_.faceUp || !engHasAttr(tj, ts, 1))) return 0;
            break;
        }
        }
        if (linked && (!engSlotKeyValue(aj, as, 0x1505) || engLinkType(tj, ts, aj, as))) return 0;
    }
    if (!(im & 2) && engCountMonstersWith(tj, 0x1318) > 0) return engSlotSourcesActive(tj, ts, 0x1318);
    if (engSlotHasKey(aj, 11, 0x1669)) return engSlotHasKey(tj, ts, 0x1669);
    if (engSlotSourcesEffective(aj, as, 0x1561) || engSlotSourcesEffective(aj, as, 0x1852)) return 0;
    if (aLive) {
        if (a == 0x14fe) return 0;
        if (a == 0x1ec3 && !slotAt(aj, as).def) {
            uint32_t o = 1 - aj;
            if (engCountMonstersFace(o, 1)) {
                if (!ts_.faceUp) return 0;
                int ta = engAtk(tj, ts);
                for (int k = 0; k < 5; k++) {
                    EngSlot& ok = slotAt(o, k);
                    if (cardId(ok.card) && ok.faceUp && (o != tj || k != ts) && ta < engAtk(o, k)) return 0;
                }
            }
        }
    }
    uint32_t sp = is & 2, tp = it & 2;
    if (!sp) {
        int others = 0;
        bool self = false;
        for (int k = 0; k < 5 && !self; k++)
            if (cardId(slotAt(tj, k).card) && engSlotHasKey(tj, k, 0x17fc)) {
                if (k == ts) self = true;
                else others++;
            }
        if (!self && others) return 0;
        if (engSlotHasKey(aj, 11, 0x17fd)) return 0;
        if (engSlotHasKey(aj, 11, 0x1b0a) && engLevel(aj, as) < 5 && engCountText0(tj, 0x1a4b) &&
            (!ts_.faceUp || !engTextHas(tj, ts, 0x1a4b)))
            return 0;
    }
    for (int k = 0; k < 5; k++)
        if (k != ts && cardId(slotAt(tj, k).card) && engAffectedBy(tj, k, 0x15ea, tj)) return 0;
    if (engCountLiveSides(0xec7, aj, is)) {
        uint32_t av = engAttrMask(aj, as);
        if ((!ts_.faceUp || !(av & 0xfe & engAttrMask(tj, ts))) && engCountAttrMask(1 - aj, av & 0xfe)) return 0;
    }
    if (!tp) {
        if ((t != 0xe9f && t != 0x1bad && t != 0x1cd4) || !live(tj, ts))
            for (int k = 0; k < 5; k++) {
                if (k == ts || !live(tj, k)) continue;
                int c = engCardAt(tj, k);
                if (c == 0xe9f || c == 0x1cd4) return 0;
                if (c == 0x1bad && engCountMonstersDef(aj, 0)) return 0;
            }
        if (live(tj, ts)) {
            if (t == 0x1753) {
                if (engCountRace0(tj, 0xd)) return 0;
            } else if (t == 0x1744 || t == 0x1755 || t == 0x1756 || t == 0x1863) {
                if (engCountRace(tj, cardRace(t), ts)) return 0;   // the exe passes ts by a deferred push Ghidra drops
            }
        }
    }
    if (ts_.faceUp) {
        if (!tp) {
            if (engRace(tj, ts) == 10 && engCountLive(tj, 0x1703, -1)) return 0;
            if (engIsAmazoness(tBase) && tBase != 0x160f && engCountLive(tj, 0x160f, -1)) return 0;
            if (engIsArchfiend(tBase) && tBase != 0x168c && engCountLive(tj, 0x168c, -1)) return 0;
            if (engIsMachiners(tBase) && tBase != 0x18a0 && engCountLive(tj, 0x18a0, -1)) return 0;
        }
        if (engAffectedBy2(tj, ts, 0x1980, 1 - aj, -1) && !sp && engAtk(aj, as) > 0x76b) return 0;
    }
    if (!mode) return 1;
    if (aLive && (a == 0x127d || a == 0x127e || a == 0x127f || a == 0x12a5 || a == 0x154a) && engHasFaceUpToon(tj) &&
        (!ts_.faceUp || !engIsToonKind(cardId(ts_.card))))
        return 0;
    if (!tp) {
        if (live(tj, ts)) {
            switch (t) {
            case 0x179d:
                for (int k = 0; k < 5; k++) {
                    EngSlot& sk = slotAt(tj, k);
                    if (cardId(sk.card) && sk.faceUp && engSlotNoEffect(tj, k) && engLevel(tj, k) < 4) return 0;
                }
                break;
            case 0x13cd:
                if (engFieldSpellIs(0x10f4)) return 0;
                break;
            case 0xeca: case 0x1399:
                if (engCountMonsters(tj) > 1) return 0;
                break;
            case 0x164e:
                return 0;
            case 0x1b7e:
                if (engCountAttr(tj, cardAttr(0x1b7e), ts)) return 0;   // ditto
                break;
            case 0x18b6:
                if (engCountMonstersFacePos(tj, 0, 1)) return 0;
                break;
            case 0x1acf:
                if (engCountMonstersText(tj, engIsElementalHero) > 1) return 0;
                break;
            case 0x1b89:
                for (int k = 0; k < 5; k++) {
                    EngSlot& sk = slotAt(tj, k);
                    if (cardId(sk.card) && sk.faceUp && engCardText(tj, k) != 0x1b89 && engRace(tj, k) == 0x11) return 0;
                }
                break;
            }
        }
        if (ts_.faceUp) {
            int key = 0;
            switch ((uint16_t)engRace(tj, ts)) {
            case 0xf: key = 0x14c6; break;
            case 0x11: key = 0x1f8c; break;
            case 0x12: key = 0x16ed; break;
            case 0x13:
                if (tBase != 0x1a2f && engCountLive(tj, 0x1a2f, ts)) return 0;
                break;
            }
            if (key && engCountLive(tj, key, ts)) return 0;
            if (tBase != 0x1a1e && engIsHarpie(tBase) && engCountLive(tj, 0x1a1e, ts)) return 0;
            if (tBase != 0x1a56 && engCountLive(tj, 0x1a56, ts)) return 0;
            if (engCountLive(tj, 0x1d98, ts)) return 0;
            if (engIsAllureQueen(tBase) && engCountLive(tj, 0x1aeb, -1)) return 0;
        }
        if (engCountLive(tj, 0x18b1, -1) && !ts_.faceUp && ts_.def) return 0;
        for (int k = 0; k < 4; k++) {
            if (k == ts || !live(tj, k)) continue;
            int c = engCardAt(tj, k);
            if ((c == 0x19a4 || c == 0x1ec3) && slotAt(tj, k).def) return 0;
        }
        if (engCountLive(tj, 0x1ad2, -1) && (!ts_.faceUp || tBase != 0x1ad2)) return 0;
        if (engCountLive(tj, 0x1b9c, -1) && (!ts_.faceUp || tBase != 0x1b9c)) return 0;
    }
    if (!(im & 2) && engCountLive(tj, 0x1777, -1) && engCountText0(tj, 6000) && (!ts_.faceUp || tBase != 6000)) return 0;
    if (!sp && engSlotHasKey(aj, 11, 0x14d4) && !ts_.faceUp) return 0;
    return 1;
}

// @yo2 0x006e8cf0 how many of the opponent's monsters (j, s) may attack
int engAttackTargetCount(uint32_t j, int s) {
    int n = 0;
    for (int t = 0; t < 5; t++)
        if (engAttackTarget(j, s, 1 - j, t, 1)) n++;
    return n;
}

// @yo2 0x006e8d40 nothing forbids (j, s) a direct attack (whether the opponent has monsters is checked elsewhere)
int engDirectAttackAllowed(uint32_t j, int s) {
    uint32_t it = engMonsterImmunity(j, s), is = engTrapImmunity(j, s), o = 1 - j;
    EngSlot& sl = slotAt(j, s);
    if (live(j, s)) {
        bool linked = false;
        switch (engCardAt(j, s)) {
        case 0x147d: case 0xe8a: case 0xea7:
            return 0;
        case 0x127d: case 0x127e: case 0x127f: case 0x12a5: case 0x154a:
            if (engHasFaceUpToon(o)) return 0;
            break;
        case 0x1a79:
            if (sl.value && engNoExtraAttack(j, s) && engSlotKeyValue(j, s, 0x1505) == 1) return 0;
            break;
        case 0x1ec3:
            if (!sl.def && engCountMonstersFace(o, 1)) return 0;
            break;
        case 0x1505: case 0x1644: case 0x1958: case 0x1a4e: case 0x1ab3: case 0x1c1f: case 0x1e50: case 0x1e92:
            linked = true;
            break;
        }
        if (linked && engNoExtraAttack(j, s) && ((sl.flags & 0x400000) || engSlotKeyValue(j, s, 0x1505) != 0xffffffff))
            return 0;
    }
    if (engSlotHasKey(j, 11, 0x15ff) && engNoExtraAttack(j, s) && engSlotKeyValue(o, 11, 0x15ff) != 0xffffffff) return 0;
    if (!(it & 2) && engCountLive(o, 0x1ad2, -1)) return 0;
    if (!(is & 2)) {
        for (int k = 0; k < 5; k++)
            if (cardId(slotAt(o, k).card) && engSlotHasKey(o, k, 0x17fc)) return 0;
        if (engSlotHasKey(j, 11, 0x1b0a) && engLevel(j, s) < 5 && engCountText0(o, 0x1a4b)) return 0;
    }
    if (engCountLiveSides(0xec7, j, is) && engCountAttrMask(o, engAttrMask(j, s) & 0xfe)) return 0;
    return !engSlotHasKey(j, s, 0x1619) && !engSlotHasKey(j, s, 0x18e5) && !engSlotHasKey(j, 11, 0x1669) &&
           !engSlotHasKey(j, 11, 0x195b);
}

// @yo2 0x006e91d0 the monster has no second attack left (or never had one)
int engNoExtraAttack(uint32_t j, int s) {
    if (!(slotAt(j, s).flags & 0x800000) && engMultiAttack(j, s, 1)) return 0;
    return 1;
}

// @yo2 0x006e9240 j controls a monster that prevents direct attacks
int engHasBlocker(uint32_t j) {
    for (int s = 0; s < 5; s++) {
        int c = engCardAt(j, s);
        if (!c) continue;
        if (!live(j, s)) return 1;
        if (c == 0x13cd) {
            if (!engFieldSpellIs(0x10f4)) return 1;
        } else if (c != 0x164e) {
            return 1;
        }
    }
    return 0;
}

// @yo2 0x006e9300
int engCanDirectAttack(uint32_t j, int s) { return engDirectAttackAllowed(j, s) && !engHasBlocker(1 - j); }

static bool oppSpellZoneEmpty(uint32_t o) {
    for (int k = 5; k < 11; k++)
        if (cardId(slotAt(o, k).card)) return false;
    return true;
}

// card texts that let (j, s) attack directly although the opponent has monsters
static int directByCard(uint32_t j, int s, int c) {
    uint32_t o = 1 - j;
    switch (c) {
    case 0xeb3: case 0x1129: case 0x1133: case 0x1134: case 0x114c: case 0x118e: case 0x1221: case 0x13b2: case 0x13b3:
    case 0x1597: case 0x1598: case 0x182d: case 0x1a52: case 0x1aaf: case 0x1b9f: case 0x1bb5: case 0x1c7f: case 0x1d9b:
    case 0x1db2:
        return 1;
    case 0x14fe:
        return 2;
    case 0x1705: return engFieldSpellIs(0x10f4) != 0;
    case 0x138b: return eng6f4820(o) != 0;
    case 0x1a01: return engCountSpellTrapsIf(j, 0, 1, 1) != 0;
    case 0x1b33: return engCountMonstersTextEx(j, engIsSixSamurai, 0x1b33, 1) != 0;
    case 0x1563: case 0x1564: case 0x1565: case 0x1566:
        if (!engHas12be(j)) return 0;
        return !engHasFaceUpToon(o);
    case 0x127d: case 0x127e: case 0x127f: case 0x12a5: case 0x154a:
        return !engHasFaceUpToon(o);
    case 0x15ba:
        if (!oppSpellZoneEmpty(o)) return 0;
        for (int k = 0; k < 5; k++) {
            EngSlot& sk = slotAt(o, k);
            if (cardId(sk.card) && (!sk.faceUp || engAtk(o, k) <= 0x63f)) return 0;
        }
        return 1;
    case 0x1701: case 0x1747:
        if (!oppSpellZoneEmpty(o)) return 0;
        return !engCountMonstersPos(o, 0, 1);
    case 0x186d:
        return !engCountMonstersPos(o, 0, 1);
    case 0x1acf:
        return engCountMonstersText(j, engIsElementalHero) > 1;
    case 0x1a41:
        return !engCountSpellZone(o);
    case 0x1a08:
        for (int k = 0; k < 5; k++) {
            EngSlot& sk = slotAt(o, k);
            if (cardId(sk.card) && (!sk.faceUp || engAtk(o, k) <= engAtk(j, s))) return 0;
        }
        return 1;
    case 0x1af1:   // the opponent's monster and spell zones in front of it are empty
        return !cardId(slotAt(o, 4 - s).card) && !cardId(slotAt(o, 9 - s).card);
    }
    return 0;
}

// @yo2 0x006e9340 (j, s) may attack directly over monsters: 0 no, 1 yes, 2 it must (no other choice)
int engDirectOverMonsters(uint32_t j, int s, int useCard) {
    uint32_t is = engTrapImmunity(j, s);
    if (!engDirectAttackAllowed(j, s)) return 0;
    if (engSlotSourcesEffective(j, s, 0x1561) || engSlotSourcesEffective(j, s, 0x1852)) return 2;
    if (!(is & 2) && engSlotHasKey(j, 11, 0x17fd)) return 2;
    int c = engCardAt(j, s);
    if (c == 0x14fe) {
        if (useCard && live(j, s)) return 2;
    } else if (c == 0x1a79 && live(j, s) && slotAt(j, s).value) {
        return 0;
    }
    if (engSlotHasKey(j, 11, 0x15ff)) return 0;
    if (useCard && live(j, s)) {
        int r = directByCard(j, s, c);
        if (r) return r;
    }
    for (int key : {0x1295, 0x13ab, 0x15cf, 0x169b, 0x16a3})
        if (engSlotHasKey(j, s, key)) return 1;
    if (engSlotHasKey(j, s, 0x17aa) && engSlotNoEffect(j, s)) return 1;
    for (int key : {0x1893, 0x1a13, 0x1a73, 0x1c24})
        if (engSlotHasKey(j, s, key)) return 1;
    if (engSlotHasKeyValue(j, s, 0x1b4c, 1) || engSlotSourcesEffective(j, s, 0x1759) || engSlotSourcesEffective(j, s, 0x165d))
        return 1;
    return engSlotHasKey(j, s, 0x1bdd) && engSlotHasKey(j, 11, 0x1bdd);
}
