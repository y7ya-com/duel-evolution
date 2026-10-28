// Battle helpers (0x006e9d70..0x006ea7d0).
#include "EngineInternal.h"

#include <cstring>
#include <initializer_list>

static EngSlot& slotAt(uint32_t j, int s) { return g_eng.pl[j & 1].slot[s]; }
static bool live(uint32_t j, int s) { return engSlotLive(j, s) && !(slotAt(j, s).flags & 4); }

// @yo2 0x006e9d70 the monster's own text keeps it from being destroyed by battle
int engBattleProofByText(uint32_t j, int s) {
    int c = engCardAt(j, s);
    if (!live(j, s)) return 0;
    switch (c) {
    case 0xecb: case 0x139f: case 0x1416: case 0x14d6: case 0x1588: case 0x1651: case 0x168b: case 0x16ff: case 0x1728:
    case 0x1835: case 0x18ab: case 0x18fd: case 0x194d: case 0x1991: case 0x19c9: case 0x1a21: case 0x1a53: case 0x1aae:
    case 0x1ab3: case 0x1abf: case 0x1b2b: case 0x1b86: case 0x1c08: case 0x1c54: case 0x1c55: case 0x1c59: case 0x1c5a:
    case 0x1c5f: case 0x1ca5: case 0x1cc9: case 0x1d7e: case 0x1dae: case 0x1dc0: case 0x1eb8: case 0x1ebf: case 0x1f2f:
        return 1;
    case 0x1a1d:
        return slotAt(j, s).value == 0x191c;
    case 0x1b14:
        return slotAt(j, s).value & 1;
    case 0x154c: case 0x196b: case 0x196c: case 0x196d: case 0x196e:
        return engSlotHasKey(j, s, c);
    }
    return 0;
}

// @yo2 0x006ea2e0 the monster cannot be destroyed by battle (its text, a node, or a field effect)
int engBattleProof(uint32_t j, int s) {
    int c = engCardAt(j, s), base = engCardText(j, s);
    if (engBattleProofByText(j, s) || engSlotHasKey(j, s, 0x1a0f) || engSlotHasKey(j, s, 0x1c3f)) return 1;
    uint32_t im = engSpellImmunity(j, s), is = engTrapImmunity(j, s), it = engMonsterImmunity(j, s);
    if (!(is & 1) && engSlotHasKey(j, 11, 0x15f2)) return 1;
    int key = 0;
    switch ((uint16_t)engRace(j, s)) {
    case 1:
        if (!(is & 1)) key = 0x14e3;
        break;
    case 0xb: case 0xc: case 0x10:
        if (!(it & 1)) key = 0x16fc;
        break;
    }
    if (key && engCountLive(j, key, -1)) return 1;
    if (!(im & 1)) {
        if ((c == 0xfcb || c == 0xfcc || c == 0x147b) && engCountLive(j, 0x187d, -1)) return 1;
        for (int k : {0x1408, 0x1625, 0x1496, 0x15ce, 0x1620, 0x1e00})
            if (engAffectedBy(j, s, k, j)) return 1;
    }
    return !(it & 1) && engCardGroup48(base) && engCountLive(j, 0x1f1c, -1);
}

// @yo2 0x006ea5d0 the monster attacked: flag 22 (or 23 on its second attack) and 21, per-attack nodes
void engMarkAttacked(uint32_t j, int s) {
    uint32_t& f = slotAt(j, s).flags;
    f |= 1u << ((f & 0x400000) ? 23 : 22) | 0x200000;
    int c = engCardAt(j, s);
    if (c == 0x19c1 || c == 0x186c || c == 0x18a6 || c == 0x1a4e) engNodeAddSlot(j, s, 1, (uint16_t)c, 0);
    else if (c == 0x1b20) engNodeAddSlot(j, s, 2, (uint16_t)c, 0);
    int key = engCardText(j, s);
    if (key == 0xfa6) key = 0xfa7;
    if ((key == 0xff8 || key == 0xfa7 || key == 0x18f6) && !engSlotHasKey(j, 11, key)) engNodeAddSlot(j, 11, 1, (uint16_t)key, 0);
}

// @yo2 0x006ea700 population count
int engPopCount(uint32_t v) {
    int n = 0;
    for (; v; v &= v - 1) n++;
    return n;
}

// @yo2 0x006ea780 first slot set in a 2 x 16-bit slot mask: j | s << 8, or -1
uint32_t engFirstInMask(uint32_t mask) {
    for (uint32_t j = 0; j < 2; j++)
        for (int s = 0; s < 11; s++)
            if (mask & 1u << (j * 16 + s)) return j | s << 8;
    return 0xffffffff;
}

// @yo2 0x006ea7d0
int eng6ea7d0(int card) {
    if (engSlotHasKey(0, 11, 0x1407) || eng6f4dc0(card, -1)) return 1;
    return engCard71cad0(card);
}

// n halvings (rounding up), or -n doublings
static int halve(int x, int n) {
    for (int i = 0; i < -n; i++) x *= 2;
    for (int i = 0; i < n; i++) x = (x + 1) >> 1;
    return x;
}

// @yo2 0x00705450 the numbers of the current battle: fills both EngBattleSide records (ATK/DEF after battle-only
// effects) and returns the attacker's damage (also left in its record's atk)
int engBattleCalc() {
    uint32_t a = g_eng.vcc3c0, d = g_eng.vcc3c4, o = 1 - a;   // the exe takes the other record as 1 - attacker
    int as = (int)g_eng.vcc3dc, ds = (int)g_eng.vcc3e0;
    uint32_t direct = g_eng.vcc3c8;
    EngBattleSide* B = engBattle();
    EngStats st[2];
    int halfAtk[2] = {0, 0};   // ATK halvings (negative = doublings) per role: 0 attacker, 1 attacked
    int zeroAtk[2] = {0, 0}, stamp[2] = {0, 0}, halfDef[2] = {0, 0};
    int sign = engSlotHasKey(0, 0xb, 0x1257) ? -1 : 1;
    for (uint32_t k = 0; k < 2; k++) {   // records are per player
        uint32_t pl = k == a ? a : d;
        int sl = k == a ? as : ds;
        int text = 0, card = 0;
        uint32_t uid = 0;
        if (!direct || k != d) {
            text = engCardText(pl, sl);
            card = engCardAt(pl, sl);
            uid = cardUid(slotAt(pl, sl).card);
            if (card == 0x1ab3) {   // its battle boost counts only while it attacks
                if (live(pl, sl) && pl == a) engNodeAddSlot(pl, sl, 4, 0x1ab3, 0);
                engStats(pl, sl, &st[k], 1, 0);
                engNodeFreeKeyLo(slotAt(pl, sl).head, 0x1ab3, 1);
            } else engStats(pl, sl, &st[k], 1, 0);
        } else memset(&st[k], 0, sizeof st[k]);
        EngBattleSide& b = B[k];
        b.j = pl;
        b.slot = (uint32_t)sl;
        b.v44 = 1;
        b.pos = slotAt(pl, sl).def;
        b.uid = uid;
        b.moves = g_eng.uid[uid].moves & 3;
        b.text = text;
        b.card = card;
        b.race = st[k].race;
        b.level = st[k].level;
        b.baseAtk = b.baseDef = b.atk = b.def = 0;
        memset(b.v34, 0, sizeof b.v34);
        *engAt<uint32_t>(0x012cc480 + k * 0x14) = 0;
    }
    bool skipAttacker = false;
    if (direct < 2) {
        for (uint32_t role = 0; (int)role < 2 - (int)direct; role++) {
            uint32_t p = role ^ a;
            EngBattleSide& me = B[p];
            const EngBattleSide& other = B[(1 - role) ^ a];
            uint32_t f12 = st[role].f12;   // (the exe takes the mask by role, the rest by player)
            if (engSlotIsLive(me.j, (int)me.slot, 0x1bb3)) stamp[role] = slotAt(me.j, (int)me.slot).turn;
            int n = engSlotSources(me.j, (int)me.slot, 0x1381);
            if (!(f12 & 2)) halfDef[role] += engCountCopiesSince(1 - me.j, 0x1905, -1, stamp[role]);
            if (!(f12 & 1)) halfDef[role] += engCountCopiesSince(me.j, 0x1905, (int)me.slot, stamp[role]);
            halfAtk[role] = n + halfDef[role];
            if (st[me.j].race == 4 || (st[me.j].attrMask & 0x10)) {
                if (!(f12 & 2)) zeroAtk[role] += engCountCopiesSince(1 - me.j, 0x1951, -1, stamp[role]);
                if (!(f12 & 1)) zeroAtk[role] += engCountCopiesSince(me.j, 0x1951, -1, stamp[role]);
            }
            if (engSlotIsLive(me.j, (int)me.slot, 0x1955) && engCountMonsters(1 - me.j) == 2)
                halfAtk[role] = n + halfDef[role] - 1;
            if (!direct && !(f12 & ((a != d) + 1u)) && live(other.j, (int)other.slot)) {
                if (other.card == 0x1b40)
                    zeroAtk[role] |= engIsFusion((int)cardId(slotAt(me.j, (int)me.slot).card));
                else if (other.card == 0x1d86) {
                    st[p].atk /= 2;
                    st[p].def /= 2;
                    halfAtk[role]++;
                    halfDef[role]++;
                }
            }
        }
        skipAttacker = stamp[0] != 0;
    }
    if (!skipAttacker) {   // ---- the attacker's battle-only boosts
        int ia = 0, id = 0;
        if (live(a, as)) {
            switch (B[a].card) {
            case 0x1643: if (!direct) ia = st[o].baseAtk; break;
            case 0x13aa: if (!direct && B[o].race == 0xf) ia = id = 2000; break;
            case 0x14cc: if (!direct && B[o].race && B[o].race == (int)slotAt(a, as).value) ia = 1000; break;
            case 0x14d7: ia = engHandCountRace(a, 1) * 1000; break;
            case 0x1956:
                if (B[a].pos) {
                    st[a].atk /= 2;
                    halfAtk[0]++;
                }
                break;
            case 0x1aaf:
                if (engSlotHasKey(a, 0xb, 0x1aaf)) {
                    st[a].atk /= 2;
                    halfAtk[0]++;
                }
                break;
            case 0x1e35: if (engSlotCountKey(a, as, 0x1e35) % 2) ia = 1000; break;
            }
            int v = engBattleBonus(B[a].card, 1);
            if (v != -1 && v != 0) {
                if (B[a].card == 0x1b40) {
                    zeroAtk[1] = 1;
                    st[d].atk = 0;
                } else ia += v;
            }
        }
        if (engSlotHasKey(a, 0xb, 0x1846)) ia += engSlotSourcesEffective(a, as, 0x1846) * 1500;
        ia += engSlotSumKey(a, as, 0x1ef2);
        if (!direct) {
            if (engIsAlien(B[o].card)) {
                int n = eng6f7390(a, as);
                ia -= n * 300;
                id -= n * 300;
                if (a != d && engCountLive(d, 0x1bd9, -1) && !engImmuneSpell(a, as, 1)) {
                    ia -= 300;
                    id -= 300;
                }
            }
            if (engIsSixSamurai(B[o].card) && engCountLiveSides(0x1b5b, a, engSpellImmunity(a, as))) ia -= 500;
            if (B[a].level < B[o].level) ia += (B[o].level - B[a].level) * engSlotSourcesEffective(a, as, 0x1c38) * 500;
        }
        for (uint32_t it = slotAt(a, as).head; it;) {
            const EngNode& n = g_eng.node[it];
            it = n.next;
            int t = n.kind & 0xf;
            if (t >= 6) continue;
            switch (n.key) {
            case 0x13aa: ia += 2000; id += 2000; break;
            case 0x1119:
                if (t == 4) {
                    ia = 0;
                    st[a].atk = 0;
                }
                break;
            case 0x13a7: if (n.value == 1) ia += 3000; break;
            case 0x14cc: ia += 1000; break;
            case 0x152d:
                zeroAtk[0] = 1;
                st[a].atk = 2400;
                break;
            }
        }
        ia = halve(ia, halfAtk[0]);
        for (int i = 0; i < halfDef[0]; i++) id = (id + 1) >> 1;
        if (zeroAtk[0]) ia = 0;
        st[a].atk += ia * sign;
        st[a].def += id * sign;
    }
    if (!direct) {
        if (!stamp[1]) {   // ---- the attacked monster's battle-only boosts
            int ia = 0, id = 0;
            if (live(d, ds)) {
                switch (B[o].card) {
                case 0x14cc:
                    if ((B[a].race && B[a].race == (int)slotAt(d, ds).value) || engSlotHasKey(d, ds, 0x14cc)) ia = 1000;
                    break;
                case 0x13a7: if (engSlotHasKeyValue(d, ds, 0x13a7, 1)) ia = 3000; break;
                case 0x13aa: if (B[a].race == 0xf || engSlotHasKey(d, ds, 0x13aa)) ia = id = 2000; break;
                case 0x1643: ia = st[a].baseAtk; break;
                }
                int v = engBattleBonus(B[o].card, 0);
                if (v != -1 && v != 0) {
                    if (B[o].card == 0x10c6) halfDef[1]++;
                    else if (B[o].card == 0x1621) {
                        if (!stamp[0]) st[a].atk += 200 - st[a].baseAtk;
                    } else if (B[o].card == 0x1b40) {
                        if (!stamp[0]) {
                            zeroAtk[0] = 1;
                            st[a].atk = 0;
                        }
                    } else ia += v;
                }
            }
            ia += engSlotSumKey(d, ds, 0x1853) + engSlotSumKey(d, ds, 0x1ef2);
            if (engIsAlien(B[a].card)) {
                int n = eng6f7390(d, ds);
                ia -= n * 300;
                id -= n * 300;
                if (a != d && engCountLive(a, 0x1bd9, -1) && !engImmuneSpell(d, ds, 1)) {
                    ia -= 300;
                    id -= 300;
                }
            }
            if (B[o].level < B[a].level) ia += (B[a].level - B[o].level) * engSlotSourcesEffective(d, ds, 0x1c38) * 500;
            ia = halve(ia, halfAtk[1]);
            for (int i = 0; i < halfDef[1]; i++) id = (id + 1) >> 1;
            if (zeroAtk[1]) ia = 0;
            st[o].atk += ia * sign;
            st[o].def += id * sign;
        }
        // ---- boosts that depend on the opponent's numbers
        int k1 = engSlotIsLive(a, as, 0x1ac8), k2 = engSlotSourcesEffective(a, as, 0x1238);
        bool hero = false;
        if (engIsElementalHero(B[a].card) && engCountLiveSides(0x18ff, a, engSpellImmunity(a, as))) hero = true;
        if (engIsDestinyHero(B[a].card) && engCountLiveSides(0x1a66, a, engSpellImmunity(a, as))) hero = true;
        if (!stamp[0]) {
            st[a].atk += halve(((st[o].atk + 1) >> 1) * (k1 + k2), halfAtk[0]);
            if (hero && st[a].atk < st[o].atk) {
                int v = zeroAtk[0] ? 0 : halve(1000, halfAtk[0]);
                hero = false;
                st[a].atk += v * sign;
            }
        }
        if (!stamp[1] && engSlotSourcesActive(d, ds, 0x159e) && st[o].atk < 1001) {
            int x = B[a].pos == 0 ? st[a].atk : st[a].def;
            if (x > 2499 && engSlotSourcesEffective(d, ds, 0x159e)) {
                int v = zeroAtk[1] ? 0 : halve(2500, halfAtk[1]);
                st[o].atk += v * sign;
                int w = zeroAtk[0] ? 0 : halve(((v + 1) >> 1) * (k1 + k2), halfAtk[0]);
                st[a].atk += w * sign;
            }
        }
        if (!stamp[0]) {
            if (hero && st[a].atk < st[o].atk) st[a].atk += (zeroAtk[0] ? 0 : halve(1000, halfAtk[0])) * sign;
            if (engSlotSourcesActive(a, as, 0x159e) && st[a].atk < 1001) {
                int x = B[o].pos == 0 ? st[o].atk : st[o].def;
                if (x > 2499 && engSlotSourcesEffective(a, as, 0x159e))
                    st[a].atk += (zeroAtk[0] ? 0 : halve(2500, halfAtk[0])) * sign;
            }
        }
        for (uint32_t role = 0; role < 2; role++)   // 0x1bb3: 100 more than the opponent
            if (stamp[role] && !stamp[1 - role]) {
                uint32_t p = role ^ a;
                int base = st[1 - p].atk + 100, x = halve(base, halfAtk[role]), y = base;
                for (int i = 0; i < halfDef[role]; i++) y = (y + 1) >> 1;
                if (zeroAtk[role]) x = 0;
                if (st[p].atk < x) st[p].atk = x;
                if (st[p].def < y) st[p].def = y;
            }
    }
    for (int k = 0; k < 2; k++) {
        B[k].baseAtk = st[k].baseAtk < 0 ? 0 : st[k].baseAtk;
        B[k].baseDef = st[k].baseDef < 0 ? 0 : st[k].baseDef;
        B[k].atk = st[k].atk < 0 ? 0 : st[k].atk;
        B[k].def = st[k].def < 0 ? 0 : st[k].def;
    }
    // ---- the damage
    int m = 0;   // 1 doubles, -1 halves
    if (!B[a].atk) return 0;
    if (direct && engSlotHasKey(a, as, 0x16a3)) B[a].atk = 400;
    if (live(a, as)) {
        int c = B[a].card;
        switch (c) {
        case 0x1a41: case 0x1a52:
            if (direct && engSlotHasKey(a, 0xb, c)) B[a].atk = engBaseAtk(a, (int)B[a].slot);
            break;
        case 0x1500: case 0x168d: if (d == 1 - a) m = -1; break;
        case 0x1750: if (direct) m = 1; break;
        case 0x1b9f: if (direct && engSlotHasKey(a, 0xb, 0x1b9f)) m = -1; break;
        }
    }
    if (engCountCardValue(d, 0x1da3, 2) || engCountCardValue(1 - d, 0x1da3, 1)) m = -1;
    if (!direct && B[o].pos) {
        if (engSlotHasKey(1 - a, 0xb, 0x1883)) m = 1;
        if (B[o].race == 6 && engCountLiveAll(0x19f2)) m = 1;
    }
    if (engSlotHasKey(d, 0xb, 0x1ba7) || m < 0) B[a].atk /= 2;
    else if (m > 0) B[a].atk <<= 1;
    if (engAffectedBy(a, as, 0x1663, 1 - d)) B[a].atk = 1000;
    if (B[a].atk < 1001 && engCountLive(d, 0xec4, -1)) B[a].atk = 0;
    return B[a].atk;
}

// @yo2 0x00706d00 battle-only ATK bonus of `card` against the opposing monster (vsAttacked = 1: the card attacks);
// -1 = not a battle-bonus card
int engBattleBonus(int card, int vsAttacked) {
    uint32_t a = g_eng.vcc3c0;
    bool direct = g_eng.vcc3c8 != 0, otherSide = a != g_eng.vcc3c4, fight = !direct && otherSide;
    const EngBattleSide& r = engBattle()[vsAttacked ? 1 - a : a];
    auto attr = [&](int at) { return engHasAttr(r.j, (int)r.slot, at); };
    switch (card) {
    case 0x1a7a: return fight ? r.level * 200 : 0;
    case 0x1952: return (int)g_eng.vcc3c8 * 500;
    case 0x18f2: return fight ? (vsAttacked ? 500 : -500) : 0;
    case 0x1621: return vsAttacked ? 0 : otherSide;
    case 0x17ed: return !direct && attr(1) ? 1000 : 0;
    case 0x1508: return !direct * 1000;
    case 0x1507: return (int)g_eng.vcc3c8 * 1000;
    case 0x1397: return !direct && attr(2) ? 500 : 0;
    case 0x10c6: return vsAttacked ? 0 : attr(1) != 0;
    case 0x1184: return vsAttacked && !direct && attr(6) ? 1000 : 0;
    case 0x1da7: return vsAttacked && fight ? 300 : 0;
    case 0x1d75: return !direct && attr(1) ? 200 : 0;
    case 0x1d76: return !direct && attr(1) ? 700 : 0;
    case 0x1e8e: return fight * (vsAttacked ? 300 : -500);
    case 0x1d09: return fight * (vsAttacked ? 400 : -400);
    case 0x1aef: return vsAttacked && otherSide && r.slot == 4 - g_eng.vcc3dc ? 500 : 0;
    case 0x1b40: return !direct && engIsFusion((int)cardId(slotAt(r.j, (int)r.slot).card)) != 0;
    case 0x1b72: return !direct && attr(3) ? 1000 : 0;
    case 0x1ba4: return vsAttacked && fight ? 400 : 0;
    }
    return -1;
}
