// A monster's effective numbers (FUN_006fae40): base stats, then four boost buckets summed at the end
//   A = the monster's own text, B = values carried by its own nodes, C = continuous field effects
//   (FUN_00701bc0 per field card, FUN_00701620 for the field spell), D = equips and other attached cards.
// Field boosts are applied in stamp order between the monster's nodes so that "set ATK to X" nodes
// (which zero the buckets) only cancel what came before them, as in the exe.
#include "EngineInternal.h"

#include <cstring>
#include <initializer_list>

static EngSlot& slotAt(uint32_t j, int s) { return g_eng.pl[j & 1].slot[s]; }

static bool tagMode(int m) { return m == 0xc9 || m == 0xca || m == 0xd2 || m == 0xd3 || m == 0xd4; }

// @yo2 0x006fae40 flags bit 0 lets ATK/DEF go negative, bit 1 ignores timed nodes; minStamp limits copy counts
void engStats(uint32_t j, int s, EngStats* st, uint32_t flags, int minStamp) {
    j &= 1;
    EngSlot& sl = slotAt(j, s);
    EngPlayer& me = g_eng.pl[j];
    EngPlayer& opp = g_eng.pl[1 - j];
    int atkA = 0, defA = 0, atkB = 0, defB = 0, atkC = 0, defC = 0, atkD = 0, defD = 0;
    int fieldAtk = 0, fieldDef = 0, fieldStamp = 0, out[2];
    uint32_t aux[20];
    bool keep = false;
    st->race = st->attr = st->level = st->atk = st->def = st->baseAtk = st->baseDef = 0;
    st->f10 = st->f11 = st->f12 = 0;
    int orig = cardNormalize((int)cardId(sl.card));
    st->card = orig;
    if (!orig || s > 4) return;
    engBaseStats(j, s, st, flags, minStamp);
    st->atk = st->baseAtk;
    st->def = st->baseDef;
    st->race = engRace(j, s) & 0xffff;
    uint32_t attrForced = 0;
    st->attr = engAttrEx(j, s, &attrForced);
    st->level = engLevel(j, s);
    st->attrMask = 1u << (st->attr & 31);
    bool live = engSlotLive(j, s) && !(sl.flags & 4);
    if (!attrForced && live) {
        switch (st->base) {
        case 0x1aa5: st->attrMask |= 4; break;
        case 0x18c7: case 0x19ef: st->attrMask |= 0x78; break;
        case 0x1e5a: st->attrMask |= 0x40; break;
        case 0x1e9e: st->attrMask |= 2; break;
        }
    }
    if (!sl.faceUp || (sl.flags & 8)) return;
    int invert = engSlotHasKey(0, 0xb, 0x1257);

    // ---- A: the monster's own text
    if (live) {
        int val = (int)sl.value, n;
        int lpDiff = me.lp - opp.lp < 0 ? 0 : me.lp - opp.lp;
        switch (st->base) {
        case 0x19a3: atkA = engGraveCountTrapIcon(j, 4) * 1000; break;
        case 0x17e1: atkA = (engCountAttr0(1 - j, 4) + engCountAttr(j, 4, s)) * 1000; break;
        case 0x16ac: atkA = engCountRace(j, 7, s) * 500 + engCountRace0(1 - j, 7) * 500; break;
        case 0x160d: atkA = engCountMonstersText(j, engIsAmazoness) * 100; break;
        case 0x160f: atkA = engCountMonstersText(j, engIsAmazoness) * 400; break;
        case 0x1615: case 0x1dec: atkA = (int)engCounters(j, s, 0) * 200; break;
        case 0x1617: case 0x199b: case 0x1db0: atkA = (int)engCounters(j, s, 0) * 300; break;
        case 0x1651: atkA = engCountMonsters2(1 - j) * 500; break;
        case 0x1654: case 0x1688: case 0x1cec: case 0x1e20: case 0x1f01: st->atk = val; break;
        case 0x1755: st->atk = st->def = (engCountRace0(1 - j, 3) + engCountRace(j, 3, s)) * 1000; break;
        case 0x16c3: st->atk = engGraveMonsters(j) * 300; break;
        case 0x16ca: st->atk = st->def = (int)me.banishCount * 400; break;
        case 0x1742:
            if (me.slot[10].faceUp && engCardAt(j, 10) == 0x175e) atkA = defA = lpDiff;
            break;
        case 0x1789: if (!me.handCount && !engCountSpellZone(j)) atkA = 1500; break;
        case 0x17c2: case 0x1894: atkA = engGraveCountRace(j, 1) * 300; break;
        case 0x18c3: {   // face-up copies split by position
            int cnt[2] = {0, 0};
            for (int k = 0; k < 5; k++)
                if (engCardText(j, k) == 0x18c3 && me.slot[k].faceUp) cnt[me.slot[k].def & 1]++;
            if (!cnt[1]) atkA = cnt[0] * 1000;
            if (!cnt[0]) defA = cnt[1] * 1000;
            break;
        }
        case 0x190f: if (!me.handCount) atkA = 1000; break;
        case 0x1943: case 0x1a00: atkA = engGraveCountMonsterIf(j, engIsElementalHero) * 300; break;
        case 0x194c: atkA = engCountMonsters(1 - j) * 200 - engCountMonsters(j) * 500 + 500; break;
        case 0x1983: atkA = (int)engCounters(j, s, 0) * 500; break;
        case 0x17e3: case 0x1827: case 0x1860:
            if (engCountAttr0(j, 4) || engCountAttr0(1 - j, 4)) atkA = 500;
            break;
        case 0x17eb: atkA = defA = (int)me.handCount * 400; break;
        case 0x1809:
            if (engSlotTrapMonster(j, s) && !engSlotHasKey(j, s, 0x1636) && engCountTextProp(j, 0x1807) &&
                engCountTextProp(j, 0x180b) && engCountTextProp(j, 0x180c))
                st->atk = 3000;
            break;
        case 0x1817: atkA = (int)engCounters(j, s, 0) * 500; break;
        case 0x1ec8: if (!sl.def) atkA = (int)engCounters(j, s, 0xb) * 500; break;
        case 0x15fc:
            for (uint32_t k = 0; k < 2; k++) atkA += engGraveCountRace(k, 1) * 500 + engCountRace0(k, 1) * 500;
            break;
        case 0x1377: atkA = engGraveCountRace(1 - j, 1) * 500 + engCountRace0(1 - j, 1) * 500; break;
        case 0x1193: atkA = engCountLinks(j, s) * 500; break;
        case 0x1091: atkA = engCountRace0(0, 0xd) * 100 + engCountRace0(1, 0xd) * 100; break;
        case 0xec1:   // the highest ATK among the opponent's face-up monsters
            if (!me.handCount && engCountField(j) == 1)
                for (int k = 0; k < 5; k++)
                    if (cardId(opp.slot[k].card) && opp.slot[k].faceUp && atkA < (n = engBaseAtk(1 - j, k))) atkA = n;
            break;
        case 0xfb2: atkA = engCountText0(j, 0x11d0) * 500; break;
        case 0x1009: if (sl.flags & 0x80) atkA = defA = 100; break;
        case 0x1116: atkA = engGraveMonsters(j) * 100; break;
        case 0x1128: atkA = defA = engCountTextAll(0xfe4) * 300; break;
        case 0x113d: atkA = (engCountRace0(0, 7) + engCountRace0(1, 7)) * 100; break;
        case 0x1336: atkA = defA = (int)me.handCount * -400; break;
        case 0x133d: if (engCountMonsters2(1 - j) > 0) atkA = -1000; break;
        case 0x12a0: atkA = engCountRace0(0, 10) * 200 + engCountRace0(1, 10) * 200; break;
        case 0x11aa: atkA = defA = (int)me.handCount * 300; break;
        case 0x11d0: atkA = engCountText0(j, 0xfb2) * 500; break;
        case 0x129e: case 0x154a:
            for (const EngPlayer& p : g_eng.pl)
                for (uint32_t i = 0; i < p.graveCount; i++) {
                    uint32_t c = cardId(p.grave[i]);
                    if (c == 0xfc9 || c == 0x1278 || c == 0x142d) atkA += 300;
                }
            break;
        case 0x1387: st->atk = st->def = (int)me.handCount * 1000; break;
        case 0x1388:   // the declared value packs ATK | DEF << 16, or one boost for both under flag 0x40
            if (sl.flags & 0x40) atkB = defB = val;
            else {
                st->atk = val & 0xffff;
                st->def = (int)((uint32_t)val >> 16);
            }
            break;
        case 0x13a9: if (!engCountRace(j, 10, s)) st->atk = st->def = 1000; break;
        case 0x13ad: if (tagMode(ndLogScene()) && (sl.flags & 0x80)) atkB = defB = 500; break;
        case 0x13e8: atkA = engCountMonsters2(1 - j) * -200; break;
        case 0x1437: if (engCountFaceUpTraps(0) || engCountFaceUpTraps(1)) st->atk = st->def = 3000; break;
        case 0x1484: if (j == g_eng.turnPlayer && g_eng.phase == 3) atkA = 300; break;
        case 0x1486: if (j != g_eng.turnPlayer && g_eng.phase == 3) atkA = 300; break;
        case 0x14ec: atkA = engGraveCountRace(j, 0x11) * 200; break;
        case 0x14fc: {   // copies the linked monster
            uint32_t k = engLinkTarget(j, s);
            if ((k & 0xffff) != 0xffff) {
                EngStats o;
                engStatsOf2(k & 0xff, (int)((k & 0xffff) >> 8), &o);
                st->atk = o.atk;
                st->def = o.def;
                keep = true;
            }
            break;
        }
        case 0x1570: if (me.handCount < 2) atkA = 400; break;
        case 0x157d: atkA = engCountRace(j, 1, s) * 500; break;
        case 0x1be7: atkA = engCountRace0(j, 0xd) * 300; break;
        case 0x1a6f: atkA = (engCountSpellTraps(1) + engCountSpellTraps(0)) * 400; break;
        case 0x19be: atkA = defA = (engCountRace0(1 - j, 7) + engCountRace(j, 7, s)) * 100; break;
        case 0x19c4: st->atk = st->def = (engCountField7179e0(1) + engCountField7179e0(0)) * 500; break;
        case 0x19cc: atkA = engGraveCountProp(j, 0x1919) * 300; break;
        case 0x19d1: atkA = engGraveCountProp(j, st->card) * 500; break;
        case 0x19d3: if (val & 1) atkB = 1000; break;
        case 0x19d6: atkA = engGraveCountProp(j, 0x19cb) * 500; break;
        case 0x19ef:
            for (int k = 0; k < 5; k++)
                if (cardId(opp.slot[k].card) && opp.slot[k].faceUp && (st->attrMask & (uint32_t)engAttrMask(1 - j, k)))
                    atkA += 300;
            break;
        case 0x19f5: atkA = defA = (int)me.banishCount * 300; break;
        case 0x19f6: st->atk = st->def = (engBanishMonsters(1) + engBanishMonsters(0)) * 100; break;
        case 0x19f7: st->atk = st->def = (engBanishMonsters(1) + engBanishMonsters(0)) * 200; break;
        case 0x19f8: st->atk = st->def = (engBanishMonsters(1) + engBanishMonsters(0)) * 300; break;
        case 0x1a05:   // the ATK of the other Destiny Heroes
            st->atk = 0;
            for (int k = 0; k < 5; k++)
                if (k != s && cardId(me.slot[k].card) && me.slot[k].faceUp && engIsDestinyHero(engCardText(j, k)))
                    st->atk += engBaseAtk(j, k);
            st->def = st->atk;
            break;
        case 0x1a1d: if (val == 0x18c3) atkA = 1000; break;
        case 0x1b6a: atkA = val * 800; break;
        case 0x1b6b: atkA = val * 500; break;
        case 0x1b7e: atkA = engCountAttr0(j, 6) * 500; break;
        case 0x1b86: if (engCountTextAll(0x175e)) atkA = defA = lpDiff; break;
        case 0x1bb4: st->atk = st->def = engCountField(1 - j) * 1000; break;
        case 0x1bcf: atkA = engCountSpellIcon(j, 4) * 300; break;
        case 0x1b4d: if (me.lp < opp.lp) atkA = opp.lp - me.lp; break;
        case 0x1a75: atkA = engCountSpellTraps(1 - j) * 400; break;
        case 0x1ab1: atkA = engGraveMonsters(j) * 100; break;
        case 0x1b0f: atkA = engCountMonstersText(j, engIsElementalHero) * 200; break;
        case 0x1b10: atkA = engAllCounters(0x12) * 300; break;
        case 0x1b15: if (val & 1) atkA = 300; break;
        case 0x1b16: if (engCountMonstersText(j, engIsGadget)) atkA = 2000; break;
        case 0x1db3: atkA = defA = engCountRace0(j, 0x13) * 300; break;
        case 0x1d0c:
            st->atk = 0;
            for (int k = 0; k < 5; k++)
                if (cardId(me.slot[k].card) && me.slot[k].faceUp) st->atk += engLevel(j, k) * 300;
            break;
        case 0x1c09: atkA = (engCountField(1) + engCountField(0)) * 400; break;
        case 0x1c0f: case 0x1c10: atkA = engGraveCountRace(j, 0x14) * 500; break;
        case 0x1c62: atkA = engAllCounters(0x14) * 500; break;
        case 0x1cae: atkA = (g_eng.turnPlayer == j) * 10000; break;
        case 0x1ce0: atkA = engGraveNormalCount(j) * 1000; break;
        case 0x1d00: st->atk = st->def = (engBanishCountAttr(1, 2) + engBanishCountAttr(0, 2)) * 300; break;
        case 0x1d62: st->def = st->atk = val; break;
        case 0x1d66: st->atk = st->def = engGraveCountAttr(1 - j, 8) * 500; break;
        case 0x1d6e: if (engCountMonstersText(j, engCardGroup48)) atkA = 400; break;
        case 0x1d8b: atkA = engGraveCountAttr(j, 2) * 100; break;
        case 0x1dae: atkA = defA = engGraveDistinctMonsterIf(j, engIsLightsworn) * 300; break;
        case 0x1f23: atkA = engGraveCountAttr(j, 4) * 200; break;
        case 0x1f44: atkA = val; break;
        case 0x1f53: atkA = (int)engCounters(j, s, 0) * 1000; break;
        case 0x1fa0: atkA = engCountMonsters2(1 - j) * 100; break;
        case 0x1fb8: atkA = (engCountSpellTrapsIf(1, 0, 1, 1) + engCountSpellTrapsIf(0, 0, 1, 1)) * 300; break;
        case 0x1e12: atkA = (engGraveCountRace(1, 0xf) + engGraveCountRace(0, 0xf)) * 100; break;
        case 0x1e2f:
            n = engGraveCountAttr(j, 2);
            if (n < 2) atkA = -400;
            else if (n < 5) atkA = 400;
            break;
        case 0x1e95: atkA = (int)engCounters(j, s, 10) * 300; break;
        case 0x1e9c: atkA = engGraveCountAttr(1 - j, 1) * 200; break;
        }
    }
    if (st->card == 0x1782 && !(st->f10 & 1))
        for (int k = 5; k < 11; k++)
            if (engSlotIsLive(j, k, 0x1843) && engSlotHasKey(j, k, 0x1843)) st->atk = 3000;
    if (orig == 0xf52) st->atk = st->def = (int)sl.value;
    else if (orig == 0xf57) keep = true;
    int scene = ndLogScene();
    if (scene == 0xc9 || scene == 0xca || scene == 0xd2) {   // tag scenes fold the text boosts into B
        atkB += atkA;
        defB += defA;
        atkA = defA = 0;
    }

    // ---- C: which field cards boost us, keyed by the stamp they were placed with
    for (uint32_t p = 0; p < 2; p++)
        for (int k = 0; k < 10; k++) {
            const EngSlot& f = g_eng.pl[p].slot[k];
            bool on = cardId(f.card) && engSlotLive(p, k) && !(f.flags & 4) && engCardBoost(st, p, k, j, s, &out[1], &out[0]);
            aux[p * 10 + k] = on ? f.turn : 0;
        }
    if (engIsPhantomBeast(st->card)) atkC = engGraveCountCard(0, 0x1b2a) * 300 + engGraveCountCard(1, 0x1b2a) * 300;
    for (uint32_t p = 0; p < 2; p++) {
        int a, d;
        if (engCardAt(p, 10) && engSlotLive(p, 10) && !(g_eng.pl[p].slot[10].flags & 4) &&
            engFieldSpellBoost(st, p, 10, j, s, &a, &d)) {
            fieldAtk = a;
            fieldDef = d;
            fieldStamp = g_eng.pl[p].slot[10].turn;
            break;
        }
    }

    // ---- B / D: the monster's own nodes, oldest first
    uint32_t it = sl.head;
    while (it) {
        EngNode& node = g_eng.node[it];
        uint16_t key = node.key;
        uint32_t p = key & 0xff, ss = (uint8_t)(key >> 8), q = key & 1;
        int type = node.kind & 0xf, v = node.value;
        it = node.next;
        if ((fieldAtk || fieldDef) && fieldStamp <= node.stamp) {
            atkC += fieldAtk;
            defC += fieldDef;
            fieldAtk = fieldDef = 0;
        }
        for (uint32_t i = 0; i < 20; i++)
            if (aux[i] && (int)aux[i] <= node.stamp) {
                engCardBoost(st, i / 10, (int)(i % 10), j, s, &out[1], &out[0]);
                atkC += out[1];
                defC += out[0];
                aux[i] = 0;
            }
        switch (type) {
        case 1: case 2:
            if (flags & 2) break;
            [[fallthrough]];
        case 3: case 4:
            switch (key) {
            case 0x1391: case 0xddd: case 0x1fba:   // even = set ATK to v*5, odd = boost
                if (!(v & 1)) {
                    if (!keep) {
                        st->atk = v / 2 * 10;
                        goto zeroAtk;
                    }
                } else atkB += v / 2 * 10;
                break;
            case 0xeae: case 0xde7: case 0x14eb: case 0x15f8: case 0x1ab3:   // halve the original ATK
                if (!keep) {
                    atkB = 0;
                    st->atk = (st->baseAtk + 1) >> 1;
                }
                break;
            case 0xde1: case 0x1409: case 0x1445:
                if (!keep) {
                    st->atk = v * 10;
                    goto zeroAtk;
                }
                break;
            case 0xeab: case 0x18ca: case 0x1492: case 0x16ce: case 0x1945: case 0x1882: case 0x1ac6: case 0x1d96:
            case 0x1e3e: case 0x1ee1: case 0x1ef1:
                atkB += v;
                break;
            case 0x12ac: case 0x1ca3: case 0x164d: case 0x182d: case 0x1a61: case 0x1c53: atkA += 1000; break;
            case 0x13b2: if (type == 3) atkA += 1000; break;
            case 0x12bb: case 0x1aca: case 0x1d83: {   // the next two nodes are the new ATK and DEF
                st->atk = v;
                const EngNode& d = g_eng.node[node.next];
                st->def = d.value;
                it = d.next;
                atkA = atkB = defA = defB = 0;
                break;
            }
            case 0x12cf: case 0x16e3: atkB += v; defB += v; break;
            case 0x12d0: case 0x14be: case 0x1e26: atkB -= v; defB -= v; break;
            case 0x12f1: case 0x1a0f: case 0x1d8c: case 0x1db8: case 0x1e0a: case 0x1ed1: atkB += 500; break;
            case 0x12f2: defB += 500; break;
            case 0x132a: defB += 700; break;
            case 0x1330: defB -= 500; break;
            case 0x1329: case 0x1c3f: atkB += 700; break;
            case 0x1337: case 0x1bee: case 0x1d9e: case 0x1e08: case 0x1fb0:   // double the original ATK
                if (!keep) {
                    atkB = 0;
                    st->atk = st->baseAtk << 1;
                }
                break;
            case 0x1184: case 0x1507: case 0x1508: case 0x17ed: atkA += 1000; break;
            case 0x10ac: case 0x154d: case 0x172b: atkA += 700; break;
            case 0xecb: case 0x17c9: atkA += 3000; break;
            case 0x1009: atkA += 100; defA += 100; break;
            case 0x10c6:
                if (!keep) {
                    st->def = (defC + defB + defD + 1 + st->def) >> 1;
                    goto zeroDef;
                }
                break;
            case 0x1153:
                if (!keep) {
                    st->atk = v ? (atkC + atkB + atkD + st->atk) * 2 : (atkC + atkB + atkD + 1 + st->atk) >> 1;
                    atkC = atkD = atkA = atkB = 0;
                }
                break;
            case 0xea0: atkA -= 600; break;
            case 0x1527: case 0x19f7: case 0x1d7a: atkA += 300; defA += 300; break;
            case 0x147d: atkA -= 200; break;
            case 0x13a6: st->atk = st->def = 1000; break;
            case 0x13ad:
                if (!tagMode(ndLogScene()) && type == 3) {
                    if (!v) {
                        atkB -= 500;
                        defB -= 500;
                    } else {
                        atkA += 500;
                        defA += 500;
                    }
                }
                break;
            case 0x13b0: case 0x13b4: if (type == 3) { atkB -= 500; defB -= 500; } break;
            case 0x15a6: atkB -= 500; defB -= 500; break;
            case 0x13cb: case 0x160e: atkB -= 500; break;
            case 0x13ee: atkB -= 700; break;
            case 0x1446: case 0x19b4: case 0x14a6: case 0x1c69: atkB -= v; break;
            case 0x147a: case 0x1397: case 0x1645: case 0x1704: case 0x1941: case 0x1952: case 0x1862: case 0x1875:
            case 0x188f: case 0x18ae: case 0x1aee: case 0x1aef: case 0x1b08: case 0x1d5d: case 0x1d6b:
                atkA += 500;
                break;
            case 0x1482: case 0x1520: case 0x1737: case 0x16c4: case 0x17bb: case 0x17bc: case 0x1996: case 0x19a5:
            case 0x1835: case 0x1d5a: case 0x1a4b: case 0x1a7a: case 0x1b1b: case 0x1b50: case 0x1b72: case 0x1cee:
            case 0x1bec: case 0x1c03: case 0x1c4c: case 0x1d75: case 0x1d76: case 0x1da7: case 0x1e10: case 0x1ec9:
            case 0x1edb: case 0x1f22: case 0x1fa3:
                atkA += v;
                break;
            case 0x14a7: case 0x1a60: case 0x1e8b: atkB += 800; break;
            case 0x14b9: atkB += 700; defB += 700; break;
            case 0x14d7: atkA += 1000; defA += 1000; break;
            case 0x1690: {
                int m = ndLogScene();
                if ((m != -1 && m <= 0xd6) || !v) atkB += 1000;
                break;
            }
            case 0x153d:
                if (v == 1) atkB += 200;
                else if (v == 2) defB += 500;
                break;
            case 0x154c: atkA -= 400; break;
            case 0x157b: atkB -= 800; break;
            case 0x1644: atkA -= 500; break;
            case 0x167b: case 0x1763: case 0x1863:
                st->def = v;
                goto zeroDef;
            case 0x17ab: st->atk += invert ? -1000 : 1000; st->def += invert ? -1000 : 1000; break;
            case 0x17ac: st->atk += invert ? -2000 : 2000; st->def += invert ? -2000 : 2000; break;
            case 0x18f2: case 0x1d09: case 0x1e8e: atkA += (int16_t)v; break;
            case 0x18fe:
                if (!(st->f10 & 1)) {
                    int m = ndLogScene();
                    atkB += (m == -1 || m > 0xd6) ? v : st->baseAtk;
                }
                break;
            case 0x190e:
                st->atk = 2000;
                goto zeroAtk;
            case 0x192d: atkB += 1500; break;
            case 0x1d1b: if (type != 3) break; [[fallthrough]];
            case 0x19ab: case 0x1ee0: case 0x1e1d: case 0x1ed9: case 0x1f4b:
                if (!keep) {
                    st->atk = v;
                    goto zeroAtk;
                }
                break;
            case 0x1819:
                if (v) {
                    st->atk = 3000;
                    atkA = atkB = 0;
                }
                break;
            case 0x1840: atkA = atkB = 0; st->atk = 2700; break;
            case 0x1890: if (v != 1 && g_eng.phase == 3) atkB += v; break;
            case 0x1ba4: case 0x1a1c: case 0x1cfe: atkA += 400; break;
            case 0x19f8: atkA += 500; defA += 500; break;
            case 0x1a31: if (!keep) st->atk = v; break;
            case 0x1a32: case 0x1f17: atkB += 400; break;
            case 0x1ccc: if (type == 2) { atkB -= 1500; defB -= 1500; break; } [[fallthrough]];
            case 0x1aa5: case 0x1ccb: atkA -= 500; defA -= 500; break;
            case 0x1acf: atkA += 100; defA -= 100; break;
            case 0x1ad2: atkA += 200; defA -= 200; break;
            case 0x1b40:   // ATK 0, nothing else counts
                atkC = atkD = 0;
                st->atk = 0;
                atkA = atkB = 0;
                goto total;
            case 0x1cb0: atkA -= 1000; break;
            case 0x1cb1: case 0x1e78: defA += v; break;
            case 0x1cca: case 0x1bfb: case 0x1eb9: atkB += 1000; break;
            case 0x1d0d: case 0x1eda:
                st->atk = 0;
                goto zeroAtk;
            case 0x1c3e: case 0x1eea: atkB += 400; defB += 400; break;
            case 0x1c4d:
                if (!keep) {
                    st->atk = st->baseAtk << 1;
                    st->def = st->baseDef << 1;
                    atkB = defB = 0;
                }
                break;
            case 0x1c5f:
                if (!keep) {
                    st->atk = v;
                    const EngNode& d = g_eng.node[node.next];
                    st->def = d.value;
                    it = d.next;
                    goto zeroAll;
                }
                break;
            case 0x1e7e: if (type == 3) atkA += 500; break;
            case 0x1df2: case 0x1e09: atkA += 200; break;
            case 0x1d7e: case 0x1f0a: atkA += 300; break;
            case 0x1e16: atkB -= 1000; break;
            case 0x1e41: atkB += 300; break;
            case 0x1e88: st->atk = 1700; break;
            case 0x1ed0: atkB += 300; defB += 300; break;
            case 0x1ed6: atkA += v * 400; break;
            }
            break;
        case 6: case 7: case 8: case 9: {   // continuous effects of a field card (key = slot << 8 | player)
            const EngSlot& src = g_eng.pl[q].slot[ss];
            if (!cardId(src.card) || !src.faceUp || (src.flags & 0x100)) break;
            int c = engCardAt(p, (int)ss);
            uint32_t side = (j != p) + 1u;
            uint32_t mask = ss < 5 ? st->f12 & side : (cardIsTrap(c) ? st->f11 : st->f10) & side;
            if (mask) break;
            switch (c) {
            case 0x1a7c:
                if (node.kind & 0xf0) {
                    node.key = 0;   // hide this node while looking up the link
                    uint32_t k = engLinkTarget(p, (int)ss);
                    if ((k & 0xffff) != 0xffff && g_eng.pl[k & 1].slot[(k & 0xffff) >> 8].faceUp &&
                        engIsNeoSpacian(engCardText(k & 0xff, (int)((k & 0xffff) >> 8))))
                        atkC += v;
                    node.key = key;
                }
                break;
            case 0x184b: atkC += 500; break;
            case 0x18d3: {   // two or more monsters, all in defense position
                int count = 0;
                bool allDef = true;
                for (int k = 0; k < 5; k++)
                    if (cardId(g_eng.pl[q].slot[k].card)) {
                        count++;
                        if (!g_eng.pl[q].slot[k].def) allDef = false;
                    }
                if (count > 1 && allDef) defC += 700;
                break;
            }
            case 0x1b66: if (p == j) atkC += 300; break;
            case 0x1e0f: atkC -= 1000; break;
            case 0x1843:
                if (p == j) {
                    atkA = atkB = 0;
                    st->atk = 3000;
                }
                break;
            case 0x175d: {   // the next two nodes, both 0x175d, carry ATK and DEF
                if (keep) break;
                const EngNode& a = g_eng.node[node.next];
                const EngNode& d = g_eng.node[a.next];
                if (a.key != 0x175d || d.key != 0x175d) break;
                st->atk = a.value;
                st->def = d.value;
                goto zeroAll;
            }
            case 0x180f: atkC -= engCounterRoom(p, (int)ss) * 500; break;
            case 0x13f9:
                st->atk = 0;
                goto zeroAtk;
            case 0xff9: if (st->race == 2) { atkC += 200; defC += 200; } break;
            case 0x1243: atkC -= 700; break;
            }
            break;
        }
        zeroAll:   // the "set ATK/DEF" tails shared by node and field cases
            atkC = atkD = atkA = atkB = 0;
        zeroDef:
            defC = defD = defA = defB = 0;
            break;
        zeroAtk:
            atkC = atkD = atkA = atkB = 0;
            break;
        case 10: case 0xb: {   // equips and other cards attached to us
            const EngSlot& src = g_eng.pl[q].slot[ss];
            if (cardId(src.card) && src.faceUp && !(src.flags & 0x100)) {
                int c = engCardAt(p, (int)ss);
                if ((cardIsTrap(c) ? st->f11 : st->f10) & ((j != p) + 1u)) break;
                int sv = (int)src.value;
                switch (c) {
                case 0x16cc: case 0x1467: case 0x1234: case 0x1242: case 0x1392: case 0x1e45: case 0x10d8: case 0x10e7:
                    atkD += 700;
                    break;
                case 0x1318: atkD -= 500; defD -= 500; break;
                case 0x1237:
                    if (!keep) {
                        int mine = g_eng.pl[q].lp, theirs = g_eng.pl[1 - p].lp;
                        if (mine < theirs) {
                            atkB = 0;
                            st->atk = st->baseAtk << 1;
                        } else if (theirs < mine) {
                            atkB = 0;
                            st->atk = (st->baseAtk + 1) >> 1;
                        }
                    }
                    break;
                case 0x1238: case 0x10d3: case 0x10d5: case 0x10d7: case 0x10da: case 0x10dc: case 0x10de: case 0x10e1:
                case 0x10e2: case 0x10e5: case 0x10e8: case 0x10e9: case 0x10eb: case 0x10ec: case 0x10ed: case 0x10ee:
                    atkD += 300;
                    defD += 300;
                    break;
                case 0x12c6:
                    if (st->race == 7) {
                        if (sv == 1) atkD += 700;
                        else if (sv == 2) defD += 700;
                    }
                    break;
                case 0x12ee: case 0x12ef: case 0x10d4: case 0x10d9: case 0x10db: case 0x10ea: atkD += 400; defD -= 200; break;
                case 0x149f:
                    if (engRaceEx(j, s, src.turn) != 0xf) break;
                    [[fallthrough]];
                case 0x1309: case 0x15d1: case 0x1825: case 0x1c82: atkD += 500; defD += 500; break;
                case 0x130d: if (st->race != 7) atkD -= engCounterRoom(p, (int)ss) * 300; break;
                case 0x131a: atkD += 700 - engCounterRoom(p, (int)ss) * 200; break;
                case 0x13f6: case 0x150c: case 0x1989: case 0x1b51: case 0x19d8: case 0x1cde: atkD += 800; break;
                case 0x13e3: case 0x1661: atkD -= 500; break;
                case 0x13f4: atkD += 1000; defD -= 1000; break;
                case 0x143c: atkD += sv; break;
                case 0x145c: atkD += engCountMonstersPos(p, 1, 0) * 800; defD += engCountMonstersPos(p, 1, 0) * 800; break;
                case 0x145d: atkD += engCountSpellTraps(p) * 500; defD += engCountSpellTraps(p) * 500; break;
                case 0x15cf: atkD += 900; defD += 900; break;
                case 0x1514: case 0x14ed: case 0x165e: case 0x165f: case 0x1231: case 0x10dd: case 0x10e3: case 0x1a69:
                case 0x19b0: case 0x1bd5: case 0x1d47: case 0x1e0b: case 0x1efb:
                    atkD += 500;
                    break;
                case 0x1496: case 0x165c: case 0x193a: case 0x1c8d: case 0x1d16: case 0x1d46: atkD += 300; break;
                case 0x15b0: case 0x15ce: case 0x194b: atkD += 400; defD += 400; break;
                case 0x15b3: atkD += 600; defD += 600; break;
                case 0x1620: atkD += 3000; break;
                case 0x1625: case 0x1bf0: atkD += 400; break;
                case 0x165d: atkD -= 1000; break;
                case 0x1660: defD += 500; break;
                case 0x1c36: atkD += (engGraveCountProp(1, st->card) + engGraveCountProp(0, st->card)) * 900; break;
                case 0x1917: atkD += 2500; break;
                case 0x17a0: atkD += sv * 1000; break;
                case 0x17fa: case 0x17fb: atkD += 1500; defD += 1500; break;
                case 0x1842: if (!live || st->card != 0x1c25) atkD -= 300; break;
                case 0x1959: atkD += engCountSameFaceUp(j, s) * 800; break;
                case 0x1aba: atkD += 600; break;
                case 0x1b58: atkD += 200; defD += 200; break;
                case 0x1cba: atkD += engSlotHasKey(p, (int)ss, 0x1cba) * 1000; break;
                case 0x1cf4: atkD -= sv; break;
                case 0x1ece: atkD -= 800; defD -= 800; break;
                case 0x1e1f: atkD -= 1800; break;
                case 0x1e3b: atkD += engCountMonsters(1 - p) * 300; break;
                case 0x1ee4:
                    if (!keep) {
                        atkB = 0;
                        st->atk = st->baseAtk << 1;
                    }
                    break;
                case 0x1f33: case 0x10d6: atkD += 1000; break;
                case 0x10df: defD += 800; break;
                case 0x10e0: atkD += 700; defD += 700; break;
                }
            }
            if (st->card == 0x10bc && engCardAt(p, (int)ss) == 0xfee) {
                st->atk = 0;
                st->def = 2000;
            }
            break;
        }
        case 0xc: {   // a monster we absorbed / copy from (key = slot << 8 | player)
            const EngSlot& src = g_eng.pl[q].slot[ss];
            int b = st->base;
            EngStats t{};
            if (b == 0x1a57 || (b >= 0x1aae && b <= 0x1ab1)) atkD += cardAtk((int)cardId(src.card));
            else if (b == 0x1281 || b == 0x1284) {
                if (!src.faceUp) st->atk = st->def = 0;
                else {
                    int c = (int)cardId(src.card);
                    t.baseAtk = cardAtk(c);
                    t.baseDef = cardDef(c);
                    engTokenStats(c, &t);
                    st->atk = t.baseAtk;
                    st->def = t.baseDef;
                }
                defB = atkB = 0;
            } else if (b == 0x12a6 && engSlotLive(p, (int)ss) && !(src.flags & 4) && !(st->f10 & ((j != p) + 1u))) {
                atkD += 200;
            } else if (b == 0x1bb8 && src.faceUp) {
                int c = (int)cardId(src.card);
                t.baseAtk = cardAtk(c);
                engTokenStats(c, &t);
                atkD += t.baseAtk / 2;
            }
            break;
        }
        }
    }
    if (fieldAtk || fieldDef) {
        atkC += fieldAtk;
        defC += fieldDef;
    }
    for (uint32_t i = 0; i < 20; i++)
        if (aux[i]) {
            engCardBoost(st, i / 10, (int)(i % 10), j, s, &out[0], &out[1]);
            atkC += out[0];
            defC += out[1];
            aux[i] = 0;
        }

total:
    if (!keep) {
        int sa = atkC + atkA + atkB + atkD, sd = defC + defA + defB + defD;
        st->atk += invert ? -sa : sa;
        st->def += invert ? -sd : sd;
        if (live) {
            if (st->base == 0x1955) {
                if (engCountMonsters2(1 - j) == 2) st->atk <<= 1;
            } else if (st->base == 0x1bb3) {   // 100 more than the strongest other monster
                minStamp = sl.turn;
                st->atk = 100;
                for (uint32_t p = 0; p < 2; p++)
                    for (int k = 0; k < 5; k++)
                        if (cardId(g_eng.pl[p].slot[k].card) && g_eng.pl[p].slot[k].faceUp &&
                            engCardText(p, k) != 0x1bb3 && engCardAt(p, k) != 0x1bb3) {
                            EngStats o;
                            engStats(p, k, &o, 0, -minStamp);
                            if (st->atk < o.atk + 100) st->atk = o.atk + 100;
                        }
                st->def = st->atk;
            }
        }
        if (st->race == 4 || (st->attrMask & 0x10)) {
            if (!(st->f12 & 2) && engCountCopiesSince(1 - j, 0x1951, -1, minStamp)) st->atk = 0;
            if (!(st->f12 & 1) && engCountCopiesSince(j, 0x1951, -1, minStamp)) st->atk = 0;
        }
        for (int n = engSlotSourcesMin(j, s, 0x1381, minStamp); n > 0; n--) st->atk = (st->atk + 1) >> 1;
        int n = 0;
        if (!(st->f12 & 2)) n = engCountCopiesSince(1 - j, 0x1905, -1, minStamp);
        if (!(st->f12 & 1)) n += engCountCopiesSince(j, 0x1905, s, minStamp);
        for (; n > 0; n--) {
            st->atk = (st->atk + 1) >> 1;
            st->def = (st->def + 1) >> 1;
        }
    }
    if (!(flags & 1)) {
        if (st->atk < 0) st->atk = 0;
        if (st->def < 0) st->def = 0;
    }
}

// @yo2 0x00702bd0 effective ATK
int engAtk(uint32_t j, int s) {
    EngStats st;
    engStatsOf2(j, s, &st);
    return st.atk;
}
// @yo2 0x00702c30 effective DEF
int engDef(uint32_t j, int s) {
    EngStats st;
    engStatsOf2(j, s, &st);
    return st.def;
}
// @yo2 0x00702c00 original ATK
int engBaseAtk(uint32_t j, int s) {
    EngStats st;
    engStatsOf(j, s, &st);
    return st.baseAtk;
}
// @yo2 0x00702c60 original DEF
int engBaseDef(uint32_t j, int s) {
    EngStats st;
    engStatsOf(j, s, &st);
    return st.baseDef;
}
// @yo2 0x00702c90 effective level
int engLevel(uint32_t j, int s) { return engLevelEx(j, s, 0); }
// @yo2 0x007033d0 effective race
int engRace(uint32_t j, int s) { return engRaceEx(j, s, -1); }
// @yo2 0x00703f70 effective attribute
int engAttr(uint32_t j, int s) { return engAttrEx(j, s, 0); }
// @yo2 0x007040c0 does the monster count as attribute `attr`
int engHasAttr(uint32_t j, int s, int attr) { return (int)(1u << (attr & 31) & (uint32_t)engAttrMask(j, s)) > 0; }

// @yo2 0x00702cc0 effective level; raw = 1 skips the modifiers (only replacements count)
int engLevelEx(uint32_t j, int s, int raw) {
    j &= 1;
    const EngSlot& sl = slotAt(j, s);
    int card = cardNormalize((int)cardId(sl.card));
    g_eng.vcc338++;
    uint32_t f10 = (uint32_t)engSpellImmunity(j, s) & 0xff, f11 = (uint32_t)engTrapImmunity(j, s) & 0xff;
    g_eng.vcc338--;
    if (!card) return 0;
    int lv = cardLevel(card), own = 0, field = 0;
    if (s >= 5 || !sl.faceUp || (sl.flags & 8)) return lv;
    if (card == 0xf57) {
        uint32_t k = engLinkTarget(j, s);
        if ((k & 0xffff) != 0xffff) return engLevel(k & 0xff, (int)((k & 0xffff) >> 8));
    }
    if (!raw) {
        int v = (int)engUidKeyValue((int)cardUid(sl.card), 0x18d9);
        if (v > 0) lv = v;
    }
    if (engSlotTrapMonster(j, s)) {
        EngStats t{};
        engTokenStats(card, &t);
        lv = t.level;
    }
    for (uint32_t it = sl.head; it;) {
        const EngNode& n = g_eng.node[it];
        uint16_t key = n.key;
        it = n.next;
        switch (n.kind & 0xf) {
        case 1: case 2: case 3:
            if (raw) break;
            switch (key) {
            case 0x1e33: case 0x1e41: own++; break;
            case 0x1dd0: case 0x1e32: own--; break;
            case 0x15c7: own -= n.value * 2; break;
            case 0x1ad5: case 0x1ed6: if (engCardAt(j, s) == key) own += n.value; break;
            case 0x1ec1: own = 0; lv = n.value; break;
            case 0x1f34: own += n.value; break;
            }
            break;
        case 5:
            if (key == 0xf47 || key == 0xf49) {   // packed stats: the level is the value's bits 4..7; skip the next two
                lv = (n.value & 0xff) >> 4;
                it = g_eng.node[g_eng.node[it].next].next;
            }
            break;
        case 7: case 10: {
            if (raw) break;
            uint32_t p = key & 0xff, q = key & 1, ss = (uint8_t)(key >> 8);
            const EngSlot& src = g_eng.pl[q].slot[ss];
            if (!cardId(src.card) || (src.flags & 0x100)) break;
            int c = engCardAt(p, (int)ss);
            if (((cardIsTrap(c) ? f11 : f10) & ((j != p) + 1u)) == 0) {
                if (c == 0x15e3) field -= 2;
                else if (c == 0x1e0b) field++;
                else if (c == 0x1e0f) field--;
            }
            break;
        }
        }
    }
    if (!raw)
        for (uint32_t p = 0; p < 2; p++)
            if (engCardAt(p, 10) == 0x150b && engSlotLive(p, 10) && !(g_eng.pl[p].slot[10].flags & 4) &&
                !(f10 & ((j != p) + 1u)) && engHasAttr(j, s, 3))
                field--;
    if (lv && (lv += field + own) < 1) lv = 1;
    return lv;
}

// @yo2 0x00703fa0 attribute mask: the attribute's bit plus the extra bits some cards add while live
uint32_t engAttrMask(uint32_t j, int s) {
    uint32_t forced = 0;
    int a = engAttrEx(j, s, &forced);
    if (!forced && engSlotLive(j, s) && !(slotAt(j, s).flags & 4)) {
        switch (engCardAt(j, s)) {
        case 0x1aa5: return 1u << (a & 31) | 4;
        case 0x18c7: case 0x19ef: return 1u << (a & 31) | 0x78;
        case 0x1e5a: return 1u << (a & 31) | 0x40;
        case 0x1e9e: return 1u << (a & 31) | 2;
        }
    }
    return a ? 1u << (a & 31) : 0;
}

// @yo2 0x00703400 effective race; the newest race-changing effect wins (stamps equal to `skipStamp` don't count)
int engRaceEx(uint32_t j, int s, uint32_t skipStamp) {
    uint32_t jj = j & 1, best = 0;
    const EngSlot& sl = slotAt(jj, s);
    int card = cardNormalize((int)cardId(sl.card));
    g_eng.vcc338++;
    uint32_t f10 = (uint32_t)engSpellImmunity(j, s), f11 = (uint32_t)engTrapImmunity(j, s), f12 = (uint32_t)engMonsterImmunity(j, s);
    g_eng.vcc338--;
    if (!card) return (int)(f12 & 0xffff0000);   // (the exe returns the mask's high half)
    int race = cardRace(card);
    if (s >= 5 || !sl.faceUp || (sl.flags & 8)) return race;
    if (card == 0xf57) {
        uint32_t k = engLinkTarget(j, s);
        if ((k & 0xffff) != 0xffff) return engRace(k & 0xff, (int)((k & 0xffff) >> 8));
    }
    if (engSlotTrapMonster(j, s)) {
        EngStats t{};
        engTokenStats(card, &t);
        race = t.race;
    }
    for (uint32_t k = 0; k < 2; k++) {
        uint32_t side = (j != k) + 1u;
        const EngPlayer& p = g_eng.pl[k];
        for (int i = 0; i < 5; i++) {
            if (!(side & f12) && engSlotIsLive(k, i, 0x12a1) && engSlotHasKeyValue(k, i, 0x12a1, j) &&
                best < p.slot[i].turn && p.slot[i].turn != skipStamp) {
                race = 10;
                best = p.slot[i].turn;
            }
            const EngSlot& st = p.slot[i + 5];
            if (!(side & f11) && engSlotIsLive(k, i + 5, 0x1357) && best < st.turn && st.turn != skipStamp && st.value) {
                best = st.turn;
                race = (int)st.value;
            }
        }
        if (!(f10 & side) && engSlotIsLive(k, 10, 0x1eb1) && best < p.slot[10].turn && p.slot[10].turn != skipStamp) {
            race = 2;
            best = p.slot[10].turn;
        }
    }
    for (uint32_t it = sl.head; it;) {
        const EngNode& n = g_eng.node[it];
        uint16_t key = n.key;
        it = n.next;
        switch (n.kind & 0xf) {
        case 1: case 2: case 3: case 4:
            if (key == 0x15ae && best < n.value) {
                race = 1;
                best = n.value;
            }
            break;
        case 5:
            if ((key == 0xf47 || key == 0xf49) && !best) {   // packed stats: race in the value's high byte
                race = n.value >> 8;
                it = g_eng.node[g_eng.node[it].next].next;
            }
            break;
        case 10: {
            uint32_t p = key & 0xff, q = key & 1, ss = (uint8_t)(key >> 8);
            const EngSlot& src = g_eng.pl[q].slot[ss];
            if (cardId(src.card) && engSlotLive(p, (int)ss) && !(src.flags & 4) && best < src.turn && src.turn != skipStamp) {
                int c = engCardAt(p, (int)ss);
                if (!((cardIsTrap(c) ? f11 : f10) & ((j != p) + 1u)) && c == 0x149f) {
                    race = 1;
                    best = src.turn;
                }
            }
            break;
        }
        }
    }
    return race & 0xffff;
}

// @yo2 0x00703990 effective attribute; *stamp (optional) gets the stamp of the effect that set it (0 = printed)
int engAttrEx(uint32_t j, int s, uint32_t* stamp) {
    uint32_t best = 0;
    int card, attr;
    uint32_t f10, f11;
    for (;;) {   // a copy (0xf57) shows the linked monster's attribute
        card = cardNormalize((int)cardId(slotAt(j, s).card));
        g_eng.vcc338++;
        f10 = (uint32_t)engSpellImmunity(j, s) & 0xff;
        f11 = (uint32_t)engTrapImmunity(j, s) & 0xff;
        g_eng.vcc338--;
        if (stamp) *stamp = 0;
        if (!card) return 0;
        attr = cardAttr(card);
        const EngSlot& sl = slotAt(j, s);
        if (s > 4 || !sl.faceUp || (sl.flags & 8)) return attr;
        if (!(sl.flags & 0x100) && attr == 2 && engCardGroup61(engCardAt(j, s))) attr = 0;
        if (card != 0xf57) break;
        uint32_t k = engLinkTarget(j, s);
        if ((k & 0xffff) == 0xffff) break;
        stamp = nullptr;
        s = (int)((k & 0xffff) >> 8);
        j = k & 0xff;
    }
    const EngSlot& sl = slotAt(j, s);
    if (engSlotTrapMonster(j, s)) {
        EngStats t{};
        engTokenStats(card, &t);
        attr = t.attr;
    }
    for (uint32_t k = 0; k < 2; k++)
        for (int i = 5; i < 11; i++) {
            const EngSlot& src = g_eng.pl[k].slot[i];
            if (!cardId(src.card) || !engSlotLive(k, i) || (src.flags & 4) || best >= src.turn) continue;
            uint32_t side = (j != k) + 1u;
            if (!(f11 & side) && engCardAt(k, i) == 0x171f && src.value) {
                best = src.turn;
                attr = (int)src.value;
            }
            if (!(f10 & side) && engCardAt(k, i) == 0xead && engIsCrystalBeast(engCardText(j, s))) {
                attr = 2;
                best = src.turn;
            }
        }
    for (uint32_t it = sl.head; it;) {
        const EngNode& n = g_eng.node[it];
        uint16_t key = n.key;
        it = n.next;
        switch (n.kind & 0xf) {
        case 3:
            if (key == 0x183b && best <= n.value) attr = (int)sl.value;
            break;
        case 5:
            if ((key == 0xf47 || key == 0xf49) && !best) {   // packed stats: attribute in the low nibble
                attr = n.value & 0xf;
                it = g_eng.node[g_eng.node[it].next].next;
            }
            break;
        case 7: case 10: {
            uint32_t p = key & 0xff, q = key & 1, ss = (uint8_t)(key >> 8);
            const EngSlot& src = g_eng.pl[q].slot[ss];
            if (!cardId(src.card) || !engSlotLive(p, (int)ss) || (src.flags & 4)) break;
            int c = engCardAt(p, (int)ss);
            if ((cardIsTrap(c) ? f11 : f10) & ((j != p) + 1u)) break;
            if (c == 0xec8) {
                if (n.value) {
                    attr = n.value;
                    best = src.turn;
                }
            } else if (c == 0x145b && best < src.turn && src.value) {
                attr = (int)src.value;
                best = src.turn;
            }
            break;
        }
        }
    }
    if (stamp) *stamp = best;
    return attr;
}

// @yo2 0x00701620 what the field spell in (p, fs) gives monster (j, s) described by *st; returns whether it gives anything
int engFieldSpellBoost(const EngStats* st, uint32_t p, int fs, uint32_t j, int s, int* atk, int* def) {
    int c = engCardAt(p, fs), a = 0, d = 0;
    if (!(st->f10 & ((j != p) + 1u))) {
        switch (c) {
        case 0x10f0: if (st->race > 9 && st->race < 0xe) a = d = 200; break;
        case 0x10f1: if (st->race == 2 || st->race == 6 || st->race == 9) a = d = 200; break;
        case 0x10f2: if (st->race == 1 || st->race == 0x10 || st->race == 0x13) a = d = 200; break;
        case 0x10f3: if (st->race == 0xc || st->race == 0xf) a = d = 200; break;
        case 0x10f4:
            if (st->race == 4 || st->race == 7) a = d = -200;
            else if (st->race == 5 || st->race == 8 || st->race == 0xe || st->race == 0x13) a = d = 200;
            break;
        case 0x10f5:
            if (st->race == 3 || st->race == 0x12) a = d = 200;
            else if (st->race == 0x11) a = d = -200;
            break;
        case 0x1323: if (g_eng.pl[j & 1].slot[s].def) d = 500; break;
        case 0x1344: case 0x1345: case 0x1346: case 0x1347: case 0x1348: case 0x1349: {   // one attribute each
            static const uint8_t bit[6] = {0x20, 8, 0x10, 0x40, 2, 4};
            if (st->attrMask & bit[c - 0x1344]) {
                a = 500;
                d = -400;
            }
            break;
        }
        case 0x150b: if (st->attrMask & 8) a = d = 200; break;
        case 0x1bfc: if (!engSlotIsLive(j, s, 0x1c0f)) a = (int)engCounters(j, s, 0x13) * -500; break;
        case 0x1a77: {
            int cj = (int)cardId(g_eng.pl[j & 1].slot[s].card);
            if (engCardText(j, s) == 0x19fd || (engIsFusion(cj) && engIsNeosFusion(cj))) a = 500;
            break;
        }
        case 0x159d: if (engIsGravekeeper(engCardText(j, s))) a = d = 500; break;
        case 0x183f: if (st->race == 0x10) a = d = 200; break;
        case 0x1aa7: if (st->race == 9) a = d = 300; break;
        case 0x1dca: if (engIsLightsworn(engCardText(j, s))) a = (int)engCounters(p, fs, 8) * 100; break;
        case 0x1c8b: if (engIsGladiatorBeast(engCardText(j, s))) a = d = (int)g_eng.pl[p & 1].slot[fs].value * 100; break;
        case 0x1d21: if (st->attrMask & 0x20) { a = -500; d = 400; } break;
        case 0x1dcb: if (st->race == 0xe && (st->attrMask & 8) && st->level < 3) a = 1200; break;
        }
    }
    if (atk) *atk = a;
    if (def) *def = d;
    return a || d;
}

// @yo2 0x00701bc0 what the card in (p, fs) gives monster (j, s) described by *st: a monster's continuous effect
// (fs < 5) or a spell/trap's (fs >= 5); returns whether it gives anything
int engCardBoost(const EngStats* st, uint32_t p, int fs, uint32_t j, int s, int* atk, int* def) {
    int c = engCardAt(p, fs), a = 0, d = 0;
    const EngSlot& src = g_eng.pl[p & 1].slot[fs];
    uint32_t side = (j != p) + 1u, m = st->attrMask;
    if (fs < 5 && !(st->f12 & side)) {
        switch (c) {
        case 0x1822: if (p != j && engSlotHasKey(p, fs, 0x1822)) a = -300; break;
        case 0x121a: a = (m & 4 ? 500 : 0) - (m & 2 ? 400 : 0); break;   // one attribute up, its opposite down
        case 0x1192: a = (m & 2 ? 500 : 0) - (m & 4 ? 400 : 0); break;
        case 0x11b2: a = (m & 8 ? 500 : 0) - (m & 0x10 ? 400 : 0); break;
        case 0x11b5: a = (m & 0x20 ? 500 : 0) - (m & 0x40 ? 400 : 0); break;
        case 0x11fc: a = (m & 0x10 ? 500 : 0) - (m & 8 ? 400 : 0); break;
        case 0x1207: a = (m & 0x40 ? 500 : 0) - (m & 0x20 ? 400 : 0); break;
        case 0x16ab: if (p == j && (m & 8)) a = 200; break;
        case 0x1483: if (p != j && j == g_eng.turnPlayer && g_eng.phase == 3) a = -300; break;
        case 0x1399: case 0x1ed7: if (st->race == 0xf && j == p) a = 400; break;
        case 0x13a0: if (st->race == 0xd && j == p && src.def) a = d = 500; break;
        case 0x1cb3: if (st->race != 0x11) a = d = -500; break;
        case 0x191c:
            if (p == j && st->race == 7) {
                int cnt[2] = {0, 0};
                for (int k = 0; k < 5; k++)
                    if (engCardText(j, k) == 0x191c && g_eng.pl[j & 1].slot[k].faceUp) cnt[g_eng.pl[j & 1].slot[k].def & 1]++;
                if (!cnt[1]) a = 500;
                if (!cnt[0]) d = 500;
            }
            break;
        case 0x1b89: if (st->race == 0x11 && j == p) a = d = 400; break;
        case 0x18af: if (p != j && engSlotHasKey(p, fs, 0x18af)) a = d = -700; break;
        case 0x182a: if (m & 0x40) a = 300; break;
        case 0x185e: if (p != j && engSlotHasKey(p, fs, 0x185e)) a = -500; break;
        case 0x1ec7:
            if (p == j && engCardGroup58(st->card)) {
                if (!src.def) a = 800;
                else d = 1000;
            }
            break;
        case 0x1d73: if (p == j && engIsSaber(st->card)) a = 400; break;
        case 0x1da0:
            if (p == j && engIsArcanaForce(st->card)) {
                if (src.value == 1) a = -500;
                else if (src.value == 2) a = 500;
            }
            break;
        }
    }
    if (fs > 4) {
        if (!(st->f10 & side)) {
            switch (c) {
            case 0x15a2: if (j == p && j == g_eng.turnPlayer && g_eng.phase == 3) a += 200; break;
            case 0x13f6: if (m & 8) a -= 500; break;
            case 0x1429: if (j == p) d += 300; break;
            case 0x14cf: if (st->race == 0xf && j == p) a += engCountRace0(j, 0xf) * 200 + engCountRace0(j, 0x12) * 200; break;
            case 0x19b2: if (engIsAncientGear(engCardText(j, s))) a += 300; break;
            case 0x1ce7: if (j != p) a -= engLevel(j, s) * 100; break;
            }
        }
        if (!(st->f11 & side) && c == 0x138e && engCountSameFaceUp(j, s)) {
            a += 500;
            d += 500;
        }
    }
    if (atk) *atk = a;
    if (def) *def = d;
    return a || d;
}

// @yo2 0x00702430 how card B (bp, bs) affects monster A (ap, as) whose numbers are *st, for the board's link lines:
// 1 attached, 2 / 6 targeted by a spell (icon 4) / other, 3 field spell, 4 / 5 continuous effects, 0 none
int engRelation(const EngStats* st, uint32_t ap, int as, uint32_t bp, int bs) {
    const EngSlot& a = slotAt(ap, as);
    if (a.flags & 8) return 0;
    for (uint32_t it = a.head; it;) {
        const EngNode& n = g_eng.node[it];
        uint16_t key = n.key;
        uint32_t p = key & 0xff, ss = (uint8_t)(key >> 8);
        it = n.next;
        switch (n.kind & 0xf) {
        case 5:
            if (key > 0x1a2a && key < 0x1a2f && bp == ap && (uint32_t)bs != (uint32_t)as && slotAt(bp, bs).faceUp &&
                engCardAt(bp, bs) == key)
                return 6;
            break;
        case 6: case 7:
            if (bp == p && (uint32_t)bs == ss) {
                switch (engCardAt(p, (int)ss)) {
                case 0x1743: case 0x1280: case 0x128a: case 0x1eba: return 4;
                case 0xff9: return 5;
                case 0x1a7c: if (n.kind & 0xf0) return 5; break;
                }
                return cardIcon((int)cardId(g_eng.pl[key & 1].slot[ss].card)) == 4 ? 2 : 6;
            }
            break;
        case 10: case 0xb: case 0xc:
            if (bp == p && (uint32_t)bs == ss) return 1;
            break;
        }
    }
    if (as < 5 && a.faceUp && engSlotLive(bp, bs) && !(slotAt(bp, bs).flags & 4)) {
        if (bs == 10) {
            if (engFieldSpellBoost(st, bp, 10, ap, as, nullptr, nullptr)) return 3;
        } else {
            if (engCardBoost(st, bp, bs, ap, as, nullptr, nullptr)) return 5;
            if (!(st->f12 & ((ap != bp) + 1u)) && engSlotIsLive(bp, bs, 0x1905) && (ap != bp || as != bs)) return 5;
        }
    }
    return 0;
}

// @yo2 0x00702830 the link lines of card (j, s): out[player * 11 + slot] = relation | 0x100 when FUN_006f7610 holds;
// 7 marks the card itself as blocked/negated, 6 a zone it locks
void engRelations(uint32_t j, int s, uint16_t out[22]) {
    memset(out, 0, 22 * sizeof(uint16_t));
    if (s > 10) return;
    const EngSlot& sl = slotAt(j, s);
    if (!cardId(sl.card) || (sl.flags & 8)) return;
    if (s < 5 && eng6f4c40(j, s)) out[j * 11 + s] = 7;
    else if (!sl.faceUp) {
        if (s > 4 && eng6f76f0(j, s)) out[j * 11 + s] = 7;   // (the exe also pushes j != viewer, unread)
    } else {
        if ((sl.flags & 0x100) || engSlotHasKey(j, s, 0x1636) || engSlotHasKey(j, s, 0x1dc8)) out[j * 11 + s] = 7;
        int c = engCardAt(j, s);
        if (c == 0x1c0b || c == 0x1432 || c == 0x17ee || c == 0x1dbe || c == 0x1dcf || c == 0x1e86) {
            for (int k = 0; k < 2; k++)   // monster zones it locks: bits 0..4 player 0, 16..20 player 1
                for (int i = 0; i < 5; i++)
                    if (sl.value & 1u << (k * 16 + i)) out[k * 11 + i] = 6;
        } else if (c == 0x1aa9) {
            for (int i = 5; i < 11; i++)   // the opponent's spell/trap zones, bits 21..26
                if (sl.value & 1u << (i + 16)) out[(1 - j) * 11 + i] = 6;
        }
    }
    EngStats mine, other;
    engStatsOf2(j, s, &mine);
    for (uint32_t k = 0; k < 2; k++)
        for (int i = 0; i < 11; i++) {
            if (!cardId(g_eng.pl[k].slot[i].card)) continue;
            engStatsOf2(k, i, &other);
            uint16_t& e = out[k * 11 + i];
            if (!e && !(e = (uint16_t)engRelation(&other, k, i, j, s))) e = (uint16_t)engRelation(&mine, j, s, k, i);
            if (engChainTargets(k, i, j, s)) e |= 0x100;
        }
}

// @yo2 0x00704100 index of a field-boosting card (the board's boost-icon table), 0 = none
int engBoostIcon(int card) {
    static const uint16_t ids[] = {0x10f0, 0x10f1, 0x10f2, 0x10f3, 0x10f4, 0x10f5, 0x1323, 0x1344, 0x1345, 0x1346, 0x1347,
                                   0x1348, 0x1349, 0x149c, 0x14d1, 0x150b, 0x159d, 0x169f, 0x175e, 0x183f, 0x187f, 0x18ff,
                                   0x19f2, 0x1a0c, 0x1a77, 0x1a67, 0x1a66, 0x1aa7, 0x1b5b, 0x1b5c, 0x1ba7, 0x1bd9, 0x1bfc,
                                   0x1c8b, 0x1d21, 0x1dcb, 0x1dc8, 0x1dca};
    for (int i = 0; i < (int)(sizeof ids / sizeof *ids); i++)
        if (ids[i] == card) return i + 1;
    return 0;
}

// @yo2 0x007043b0 may the monster in (j, s) attack directly
int engMayAttackDirect(uint32_t j, int s) {
    int c = engCardAt(j, s);
    if (engBattleProofByText(j, s) || engSlotHasKey(j, s, 0x1a0f) || engSlotHasKey(j, s, 0x1c3f)) return 1;
    uint32_t f10 = (uint32_t)engSpellImmunity(j, s), f11 = (uint32_t)engTrapImmunity(j, s);
    if (!(f11 & 1) && engSlotHasKey(j, 0xb, 0x15f2)) return 1;
    int enabler = 0;
    switch (engRace(j, s)) {
    case 1: if (!(f11 & 1)) enabler = 0x14e3; break;
    case 0xb: case 0xc: case 0x10: enabler = 0x16fc; break;
    }
    if (enabler && engCountLive(j, enabler, -1)) return 1;
    if (!(f10 & 1)) {
        if (((c > 0xfca && c < 0xfcd) || c == 0x147b) && engCountLive(j, 0x187d, -1)) return 1;
        for (int k : {0x1408, 0x1625, 0x1496, 0x15ce, 0x1620})
            if (engAffectedBy(j, s, k, j)) return 1;
    }
    return 0;
}

// @yo2 0x00704600 the race a token or copied monster shows (type-5 nodes only)
int engTokenRace(uint32_t j, int s) {
    const EngSlot& sl = slotAt(j, s);
    int card = cardNormalize((int)cardId(sl.card));
    engSpellImmunity(j, s);
    engTrapImmunity(j, s);
    uint32_t f12 = (uint32_t)engMonsterImmunity(j, s);
    if (!card) return (int)(f12 & 0xffff0000);
    int race = cardRace(card);
    if (s >= 5 || !sl.faceUp || (sl.flags & 8)) return race;
    if (card == 0x19ed) {
        uint32_t k = engLinkTarget(j, s);
        if ((k & 0xffff) != 0xffff) return engRace(k & 0xff, (int)((k & 0xffff) >> 8));
    }
    for (uint32_t it = sl.head; it;) {
        const EngNode& n = g_eng.node[it];
        it = n.next;
        if ((n.kind & 0xf) != 5) continue;
        if (n.key == 0x1472) {
            if (card == 0x172f) race = 2;
            else if (card == 0x1472) race = 0x14;
            else if (card == 0x1636) race = 0xe;
            else if (card == 0x1809 || card == 0x1aca) race = 7;
        } else if (n.key == 0x1602 || n.key == 0x1608) {
            race = n.value >> 8;
            it = g_eng.node[g_eng.node[it].next].next;
        }
    }
    return race & 0xffff;
}

// @yo2 0x00704820 the attribute a token or copied monster shows (type-5 nodes only)
int engTokenAttr(uint32_t j, int s) {
    const EngSlot& sl = slotAt(j, s);
    int card = cardNormalize((int)cardId(sl.card));
    engSpellImmunity(j, s);
    engTrapImmunity(j, s);
    if (!card) return 0;
    int attr = cardAttr(card);
    if (s > 4 || !sl.faceUp || (sl.flags & 8)) return attr;
    if (card == 0x19ed) {
        uint32_t k = engLinkTarget(j, s);
        if ((k & 0xffff) != 0xffff) return engAttr(k & 0xff, (int)((k & 0xffff) >> 8));
    }
    for (uint32_t it = sl.head; it;) {
        const EngNode& n = g_eng.node[it];
        it = n.next;
        if ((n.kind & 0xf) != 5) continue;
        if (n.key == 0x1472) {
            if (card == 0x172f) attr = 2;
            else if (card == 0x1636) attr = 3;
            else if (card == 0x1472 || card == 0x1809 || card == 0x1aca) attr = 5;
        } else if (n.key == 0x1602 || n.key == 0x1608) {
            attr = n.value & 0xf;
            it = g_eng.node[g_eng.node[it].next].next;
        }
    }
    return attr;
}

// @yo2 0x00704a30 drop the nodes that only last until the end of the damage step
void engNodeDropBattle() {
    for (int i = 1; i < 256; i++) {
        const EngNode& n = g_eng.node[i];
        int t = n.kind & 0xf;
        if (t == 1) {
            if (n.key == 0x1505 || n.key == 0x15ff) engNodeFree((uint32_t)i);
        } else if (t == 8) {
            uint32_t c = cardId(g_eng.pl[n.key & 1].slot[(uint8_t)(n.key >> 8)].card);
            if (c == 0x1958 || c == 0x1505 || c == 0x1644 || c == 0x1a4e || c == 0x1a79) engNodeFree((uint32_t)i);
        }
    }
}

// @yo2 0x00704b10 the card whose text a monster uses (a copy effect 0x1a74, or four monsters renamed while live)
int engTextCard(uint32_t j, int s) {
    uint32_t w = g_eng.pl[j & 1].slot[s].card;
    int card = cardNormalize((int)cardId(w));
    if (s >= 5) return card;
    int uid = (int)cardUid(w), k = card;
    if (engCard71cb90(card)) {
        k = (int)engSlotKeyValue(j, s, 0x1a74);
        if (k == -1 || eng6f4dc0(k, uid)) return card;
    }
    static const uint16_t renames[][2] = {{0x1bc7, 0xfe4}, {0x19a6, 0x18f9}, {0x19bc, 0x18f6}, {0x1c1b, 0x19fd}};
    for (const auto& r : renames)
        if (k == r[0] && engSlotLive(j, s) && !eng6f4dc0(r[1], uid)) return r[1];
    return k;
}

// @yo2 0x00704d10 load a duel deck record into j's deck and extra deck: cards get serials 1.. in order
// (record: u32 main count, u32, u32 extra count, u16 main[95] at +0xc, u16 extra[] at +0xca, card_prop indexes)
void engLoadDeck(uint32_t j, const uint32_t* rec) {
    j &= 1;
    EngPlayer& p = g_eng.pl[j];
    const uint8_t* b = (const uint8_t*)rec;
    uint32_t serial = 1;
    p.deckCount = 0;
    for (uint32_t i = 0; i < rec[0]; i++, serial++) {
        uint16_t net;
        memcpy(&net, b + 0xc + i * 2, 2);
        uint32_t id = (uint32_t)ndPropId(net);
        p.deck[i] = (id & 0x3fff) | (p.deck[i] & 0x807f8000) | (serial & 0xff) << 23 | j << 14;
        engSetUidCard(j + (serial & 0xff) * 2, net);
        p.deckCount++;
    }
    p.extraCount = 0;
    for (uint32_t i = 0; i < rec[2]; i++, serial++) {
        uint16_t net;
        memcpy(&net, b + 0xca + i * 2, 2);
        uint32_t id = (uint32_t)ndPropId(net);
        p.extra[i] = (((p.extra[i] & ~0x3fffu) | (id & 0x3fff)) & 0x807fbfff) | j << 14 | (serial & 0xff) << 23;
        engSetUidCard(j + (serial & 0xff) * 2, net);
        p.extraCount++;
    }
    p.baseSerial = serial - 1;
    p.nextSerial = serial;
}
