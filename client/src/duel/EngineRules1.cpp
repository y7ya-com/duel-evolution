// Phase hooks and node queries (0x006e37a0..0x006e4850).
#include "EngineInternal.h"

// @yo2 0x006e37a0 phase `ph` begins for player j (0 draw: an empty hand gets node 0x1911; 3 battle: reset attack state)
void engPhaseBegin(uint32_t j, int ph) {
    EngPlayer& p = g_eng.pl[j & 1];
    if (ph == 0) {
        if (!p.handCount) engNodeAddSlot(j, 11, 1, 0x1911, 0);
        return;
    }
    if (ph != 3) return;
    for (int s = 0; s < 5; s++) {
        int c = engCardAt(j, s);
        p.slot[s].flags &= 0xff3fffff;
        if (c == 0x19c1 || c == 0x186c || c == 0x18a6 || c == 0x1a4e) engNodeFreeKeyLo(p.slot[s].head, (uint16_t)c, 1);
    }
    uint32_t o = 1 - j;
    if (engCountMonsters(o) > 1)
        for (int s = 0; s < 5; s++)
            if (cardId(g_eng.pl[o & 1].slot[s].card)) {
                engSetSlotFlag(o, s, 0x1a, 1);
                engNodeAddSlot(o, 11, 1, 0x197d, 0);
            }
    if (!engCountMonsters(o)) return;
    uint32_t mask = 0;
    for (int s = 0; s < 5; s++)
        if (engSlotIsLive(j, s, 0x1a79) && !p.slot[s].def && engCanAttack(j, s, 1)) mask |= 1u << s;
    for (int s = 0; s < 5; s++)
        if (mask & 1u << s) p.slot[s].value = 1;
}

// @yo2 0x006e39d0 phase change from `prev` to `ph`: expire phase-limited nodes
void engPhaseNodes(int ph, int prev) {
    for (int i = 1; i < 256; i++) {
        EngNode& e = g_eng.node[i];
        bool drop = false;
        switch (e.kind & 0xf) {
        case 1: case 2:
            switch (e.key) {
            case 0xece: e.value = 1; break;
            case 0x12a6: case 0x1392: case 0x1469: case 0x14d7: case 0x1571: case 0x1e08: case 0x1eef: drop = true; break;
            }
            break;
        case 7:
            drop = engCardAt(e.key & 0xff, e.key >> 8) == 0x13f9 && prev == 3 && ph != 3;
            break;
        case 8: case 9:
            switch (engCardAt(e.key & 0xff, e.key >> 8)) {
            case 0xe9f: case 0xead: case 0x1505: case 0x1644: case 0x1843: case 0x1958: case 0x1a4e: case 0x1a79:
            case 0x1ab3: case 0x1c1f: case 0x1d14: case 0x1e50: case 0x1e92: case 0x1fa2:
                drop = true;
            }
            break;
        }
        if (drop) engNodeFree(i);
    }
    for (uint32_t j = 0; j < 2; j++)
        for (int s = 0; s < 11; s++) {
            EngSlot& sl = g_eng.pl[j].slot[s];
            if (!cardId(sl.card)) continue;
            sl.flags &= 0xf7ffffff;
            int c = engCardAt(j, s);
            if (c == 0x1a79) sl.value = 0;
            else if (c == 0x1dc8 && j == g_eng.turnPlayer && ph == 1) engNodeFreeKeyLo(sl.head, 0x1dc8, 1);
        }
    uint32_t tp = g_eng.turnPlayer;
    if (prev != 3 && ph == 3 && engSlotHasNode(tp, 11, 0x1ca1, 5)) {
        engNodeFreeKeyType(g_eng.pl[tp & 1].slot[11].head, 0x1ca1, 5, 1);
        engNodeAddSlot(tp, 11, 1, 0x1ca1, 0);
    }
    g_eng.vcc32c = 0;
}

// @yo2 0x006e3d30 after a phase change: drop type 4 nodes everywhere and two slot-tied cards' nodes; clear bit 25
void engPhaseCleanup() {
    for (uint32_t j = 0; j < 2; j++)
        for (int s = 0; s < 12; s++) {
            EngSlot& sl = g_eng.pl[j].slot[s];
            if (s == 11 || cardId(sl.card))
                for (uint32_t i = sl.head; i;) {
                    const EngNode& e = g_eng.node[i];
                    uint32_t n = e.next;
                    int t = e.kind & 0xf;
                    if (t == 4) engNodeFree(i);
                    else if (t > 5) {
                        int c = engCardAt(e.key & 0xff, e.key >> 8);
                        if (c == 0x1561 || c == 0x1852) engNodeFree(i);
                    }
                    i = n;
                }
            if (s < 11) sl.flags &= 0xfdffffff;
        }
}

// @yo2 0x006e3e70 a card leaves slot s: drop its slot nodes of types 2/3/7/9, its card-bound nodes, and every
// type >= 6 node anywhere that is tied to this slot; reset its value and transient flags
void engSlotLeave(uint32_t j, uint32_t s) {
    EngSlot& sl = g_eng.pl[j & 1].slot[s];
    if (!cardId(sl.card)) return;
    for (uint32_t i = sl.head; i;) {
        uint32_t n = g_eng.node[i].next;
        switch (g_eng.node[i].kind & 0xf) {
        case 2: case 3: case 7: case 9: engNodeFree(i);
        }
        i = n;
    }
    for (uint32_t i = g_eng.uid[cardUid(sl.card)].head; i;) {
        uint32_t n = g_eng.node[i].next;
        if ((g_eng.node[i].kind & 0xf) == 3) engNodeFree(i);
        i = n;
    }
    for (EngPlayer& p : g_eng.pl)
        for (EngSlot& o : p.slot) engNodeFreeKeyHi(o.head, (uint16_t)((s & 0xff) << 8 | (j & 0xff)), 1);
    sl.value = 0;
    sl.flags &= 0xf5f73f6f;
}

// @yo2 0x006e4050 monsters: collapse adjacent pairs of 0x1f08 nodes (the original also builds an unused local record
// when the slot has node 0x1f24)
void engCollapse1f08() {
    for (uint32_t j = 0; j < 2; j++)
        for (int s = 0; s < 5; s++) {
            EngSlot& sl = g_eng.pl[j].slot[s];
            if (!cardId(sl.card)) continue;
            for (uint32_t i = sl.head; i;) {
                uint32_t n = g_eng.node[i].next;
                const EngNode& a = g_eng.node[i];
                if ((a.kind & 0xf) < 6 && a.key == 0x1f08 && n && !((g_eng.node[n].kind ^ a.kind) & 0xf) &&
                    g_eng.node[n].key == 0x1f08) {
                    uint32_t nn = g_eng.node[n].next;
                    engNodeFree(i);
                    engNodeFree(n);
                    n = nn;
                }
                i = n;
            }
        }
}

// @yo2 0x006e41d0 rewrite node i: kind (0 = turn it into a plain type 1), value; a slot-tied node becoming type < 6
// takes the card id of its slot as its key
void engNodeSet(uint32_t, uint32_t, int i, uint32_t kind, uint16_t value) {
    EngNode& e = g_eng.node[i];
    uint32_t t = kind & 0xf;
    if (kind == 0) {
        t = 1;
        e.key = 0;
        kind = 1;
    } else if ((e.kind & 0xf) > 5 && t < 6) {
        e.key = (uint16_t)engCardAt(e.key & 0xff, (char)(e.key >> 8));
    }
    e.kind = (uint8_t)(t | (kind >> 4 & 0xf) << 4);
    e.value = value;
}

// @yo2 0x006e4290 retarget every slot-tied (type >= 6) node keyed `from` (j | slot << 8) to `to`
void engNodeRetarget(uint32_t from, uint16_t to) {
    for (uint32_t j = 0; j < 2; j++)
        for (int s = 0; s < 12; s++) {
            EngSlot& sl = g_eng.pl[j].slot[s];
            if (!cardId(sl.card) && s != 11) continue;
            for (uint32_t i = sl.head; i; i = g_eng.node[i].next) {
                EngNode& e = g_eng.node[i];
                if ((e.kind & 0xf) > 5 && (e.key & 0xff) == (from & 0xff) && (e.key >> 8) == (from >> 8 & 0xff)) e.key = to;
            }
        }
}

// @yo2 0x006e4410 count the slot-tied nodes of list `head` whose source slot holds card `card`. needActive: the source
// must not be negated (flags bit 8); checkImmune: skip sources the target (j, s) is immune to; type: only that type
// (0 = types 6..11); minValue > 0 counts only nodes with value >= minValue, < 0 only value >= -minValue.
int engCountSources(uint32_t j, int s, uint32_t head, int card, int needActive, int checkImmune, uint32_t type, int minValue) {
    int n = 0;
    for (uint32_t i = head; i;) {
        const EngNode& e = g_eng.node[i];
        uint32_t next = e.next;
        uint32_t t = e.kind & 0xf;
        if (type ? t == type : t > 5 && t < 0xc) {
            uint32_t sj = e.key & 0xff, ss = e.key >> 8;
            int c = engCardAt(sj, ss);
            if (c == card && !(g_eng.vca4a0 >> ((sj * 16 + ss) & 0x1f) & 1) &&
                (!needActive || !(g_eng.pl[e.key & 1].slot[ss].flags & 0x100))) {
                bool skip = false;
                if (checkImmune) {
                    int imm = ss < 5 ? engImmuneMonster(j, s, j != sj)
                                     : cardIsTrap(c) ? engImmuneTrap(j, s, j != sj) : engImmuneSpell(j, s, j != sj);
                    skip = imm != 0;
                }
                if (!skip) {
                    if (!minValue) n++;
                    else {
                        if (minValue > 0 && minValue <= e.value) n++;
                        if (minValue < 0 && -minValue > e.value) n++;
                    }
                }
            }
        }
        i = next;
    }
    return n;
}

// @yo2 0x006e43a0
int engSlotSources(uint32_t j, int s, int card) { return engCountSources(j, s, g_eng.pl[j & 1].slot[s].head, card, 0, 0, 0, 0); }
// @yo2 0x006e4620
int engSlotSourcesActive(uint32_t j, int s, int card) { return engCountSources(j, s, g_eng.pl[j & 1].slot[s].head, card, 1, 0, 0, 0); }
// @yo2 0x006e4690
int engSlotSourcesNotImmune(uint32_t j, int s, int card) { return engCountSources(j, s, g_eng.pl[j & 1].slot[s].head, card, 0, 1, 0, 0); }
// @yo2 0x006e4700
int engSlotSourcesEffective(uint32_t j, int s, int card) { return engCountSources(j, s, g_eng.pl[j & 1].slot[s].head, card, 1, 1, 0, 0); }
// @yo2 0x006e4770
int engSlotSourcesMin(uint32_t j, int s, int card, int minValue) {
    return engCountSources(j, s, g_eng.pl[j & 1].slot[s].head, card, 1, 1, 0, minValue);
}
// @yo2 0x006e47e0
int engSlotSourcesType(uint32_t j, int s, int card, uint32_t type) {
    return engCountSources(j, s, g_eng.pl[j & 1].slot[s].head, card, 1, 1, type, 0);
}

// @yo2 0x006e4850 (j, s) is affected by `card` from side `src`, unless it is immune to it
int engAffectedBy(uint32_t j, int s, int card, uint32_t src) {
    int imm = cardIsTrap(card) ? engImmuneTrap(j, s, j != src) : engImmuneSpell(j, s, j != src);
    if (imm) return 0;
    return engAffectedBy2(j, s, card, src, -1);
}

// @yo2 0x006e48f0 count the active slot-tied nodes on (j, s) whose source holds `card`; src < 0 = any side,
// value < 0 = any source value
int engAffectedBy2(uint32_t j, int s, int card, uint32_t src, int value) {
    int n = 0;
    for (uint32_t i = g_eng.pl[j & 1].slot[s].head; i;) {
        const EngNode& e = g_eng.node[i];
        uint32_t next = e.next, t = e.kind & 0xf;
        if (t > 5 && t < 0xc) {
            uint32_t ss = e.key >> 8, sj = e.key & 0xff;
            int c = engCardAt(sj, ss);
            const EngSlot& o = g_eng.pl[e.key & 1].slot[ss];
            if (((int)src < 0 || src == sj) && !(o.flags & 0x100) && c == card && (value < 0 || (int)o.value == value)) n++;
        }
        i = next;
    }
    return n;
}

// @yo2 0x006e4a30 nodes of type >= 10 on (j, s) whose source slot is occupied
int engCountLinks(uint32_t j, int s) {
    int n = 0;
    for (uint32_t i = g_eng.pl[j & 1].slot[s].head; i; i = g_eng.node[i].next) {
        const EngNode& e = g_eng.node[i];
        if ((e.kind & 0xf) > 9 && cardId(g_eng.pl[e.key & 1].slot[e.key >> 8].card)) n++;
    }
    return n;
}

// @yo2 0x006e4b00 (tj, ts) carries a link (type >= 10) from source (sj, ss)
int engHasLinkFrom(uint32_t sj, uint32_t ss, uint32_t tj, int ts) {
    for (uint32_t i = g_eng.pl[tj & 1].slot[ts].head; i; i = g_eng.node[i].next) {
        const EngNode& e = g_eng.node[i];
        if ((e.kind & 0xf) > 9 && (e.key & 0xff) == sj && (e.key >> 8) == ss) return 1;
    }
    return 0;
}

// @yo2 0x006e4bc0 same, also counting types 6-7 with bit 4 set
int engHasLinkFrom2(uint32_t sj, uint32_t ss, uint32_t tj, int ts) {
    for (uint32_t i = g_eng.pl[tj & 1].slot[ts].head; i; i = g_eng.node[i].next) {
        const EngNode& e = g_eng.node[i];
        uint32_t t = e.kind & 0xf;
        bool kind = (t >= 6 && t <= 7 && (e.kind & 0x10)) || t >= 10;
        if (kind && (e.key & 0xff) == sj && (e.key >> 8) == ss) return 1;
    }
    return 0;
}

// @yo2 0x006e4ca0 type of the first slot-tied node on (j, s) whose source is (sj, ss); 0 = none
int engLinkType(uint32_t j, int s, uint32_t sj, uint32_t ss) {
    if (!cardId(g_eng.pl[j & 1].slot[s].card)) return 0;
    for (uint32_t i = g_eng.pl[j & 1].slot[s].head; i; i = g_eng.node[i].next) {
        const EngNode& e = g_eng.node[i];
        if ((e.kind & 0xf) > 5 && (e.key & 0xff) == sj && (e.key >> 8) == ss) return e.kind & 0xf;
    }
    return 0;
}

// the three "find the slot this one is linked to" searches: j | s << 8, or 0xffff
static uint32_t findLinked(uint32_t j, int s, bool (*ok)(int t, int want), int want) {
    if (!cardId(g_eng.pl[j & 1].slot[s].card)) return 0xffff;
    for (uint32_t a = 0; a < 2; a++)
        for (int b = 0; b < 11; b++)
            if (ok(engLinkType(a, b, j, s), want)) return a | b << 8;
    return 0xffff;
}

// @yo2 0x006e4e00 the slot (j, s) has a link onto
uint32_t engLinkTarget(uint32_t j, int s) { return findLinked(j, s, [](int t, int) { return t != 0; }, 0); }
// @yo2 0x006e4ea0 ... of that type
uint32_t engLinkTargetType(uint32_t j, int s, int type) { return findLinked(j, s, [](int t, int w) { return t == w; }, type); }
// @yo2 0x006e4f60 ... of type >= 10
uint32_t engLinkTargetHi(uint32_t j, int s) { return findLinked(j, s, [](int t, int) { return t > 9; }, 0); }

// @yo2 0x006e4d70 monsters of j (face-up) affected by an active `card` node
int engCountMonstersWith(uint32_t j, int card) {
    int n = 0;
    for (int s = 0; s < 5; s++) {
        const EngSlot& sl = g_eng.pl[j & 1].slot[s];
        if (cardId(sl.card) && sl.faceUp && engSlotSourcesActive(j, s, card)) n++;
    }
    return n;
}

// @yo2 0x006e5000 key (sj | ss << 8) of the first slot-tied node on (j, s) whose source holds `card`
// (active: the source slot is live and not flagged 4); 0xffff = none
uint32_t engSourceOf(uint32_t j, int s, int card, int active) {
    for (uint32_t i = g_eng.pl[j & 1].slot[s].head; i; i = g_eng.node[i].next) {
        const EngNode& e = g_eng.node[i];
        if ((e.kind & 0xf) < 6) continue;
        uint32_t sj = e.key & 0xff, ss = e.key >> 8;
        if (engCardAt(sj, ss) != card) continue;
        if (!active || (engSlotLive(sj, ss) && !(g_eng.pl[e.key & 1].slot[ss].flags & 4))) return e.key;
    }
    return 0xffff;
}

// @yo2 0x006e5120 same, always active, and the source's flag bit 7 must equal `bit7`
uint32_t engSourceOfBit7(uint32_t j, int s, int card, uint32_t bit7) {
    for (uint32_t i = g_eng.pl[j & 1].slot[s].head; i; i = g_eng.node[i].next) {
        const EngNode& e = g_eng.node[i];
        if ((e.kind & 0xf) < 6) continue;
        uint32_t ss = e.key >> 8;
        const EngSlot& o = g_eng.pl[e.key & 1].slot[ss];
        if (engCardAt(e.key & 0xff, ss) == card && engSlotLive(e.key & 0xff, ss) && !(o.flags & 4) &&
            (o.flags >> 7 & 1) == bit7)
            return e.key;
    }
    return 0xffff;
}

// @yo2 0x006e5240 key of the first type 0xc node on (j, s)
uint32_t engType12Key(uint32_t j, int s) {
    for (uint32_t i = g_eng.pl[j & 1].slot[s].head; i; i = g_eng.node[i].next)
        if ((g_eng.node[i].kind & 0xf) == 0xc) return g_eng.node[i].key;
    return 0xffff;
}

// @yo2 0x006e52c0 key of the first type 0xb node whose source card passes FUN_00717a70
uint32_t engType11Source(uint32_t j, int s, int active) {
    for (uint32_t i = g_eng.pl[j & 1].slot[s].head; i; i = g_eng.node[i].next) {
        const EngNode& e = g_eng.node[i];
        if ((e.kind & 0xf) != 0xb) continue;
        uint32_t sj = e.key & 0xff, ss = e.key >> 8;
        if (!engCard717a70(engCardAt(sj, ss))) continue;
        if (!active || (engSlotLive(sj, ss) && !(g_eng.pl[e.key & 1].slot[ss].flags & 4))) return e.key;
    }
    return 0xffff;
}

// @yo2 0x006e53e0 first type < 6 node of a list with that key
EngNode* engFindKey(uint32_t i, uint32_t key) {
    for (; i; i = g_eng.node[i].next)
        if ((g_eng.node[i].kind & 0xf) < 6 && g_eng.node[i].key == key) return &g_eng.node[i];
    return nullptr;
}

// @yo2 0x006e5430 ... and that type
EngNode* engFindKeyType(uint32_t i, uint32_t key, uint32_t type) {
    for (; i; i = g_eng.node[i].next) {
        const EngNode& e = g_eng.node[i];
        if ((e.kind & 0xf) < 6 && e.key == key && (uint32_t)(e.kind & 0xf) == type) return &g_eng.node[i];
    }
    return nullptr;
}

// @yo2 0x006e54b0 ... and that value
EngNode* engFindKeyValue(uint32_t i, uint32_t key, uint32_t value) {
    for (; i; i = g_eng.node[i].next) {
        const EngNode& e = g_eng.node[i];
        if ((e.kind & 0xf) < 6 && e.key == key && e.value == value) return &g_eng.node[i];
    }
    return nullptr;
}

// @yo2 0x006e5520 a type 1-2 node with no turns left (high nibble 0) and that key (and value, if value >= 0)
EngNode* engFindExpiring(uint32_t i, uint32_t key, int value) {
    for (; i; i = g_eng.node[i].next) {
        const EngNode& e = g_eng.node[i];
        uint32_t t = e.kind & 0xf;
        if (t && t <= 2 && e.key == key && !(e.kind & 0xf0) && (value < 0 || (uint32_t)value == e.value))
            return &g_eng.node[i];
    }
    return nullptr;
}

// @yo2 0x006e55a0 count type < 6 nodes with that key
int engCountKey(uint32_t i, uint32_t key) {
    int n = 0;
    for (; i; i = g_eng.node[i].next)
        if ((g_eng.node[i].kind & 0xf) < 6 && g_eng.node[i].key == key) n++;
    return n;
}

// @yo2 0x006e5610 ... and that type
int engCountKeyType(uint32_t i, uint32_t key, uint32_t type) {
    int n = 0;
    for (; i; i = g_eng.node[i].next) {
        const EngNode& e = g_eng.node[i];
        if ((e.kind & 0xf) < 6 && e.key == key && (uint32_t)(e.kind & 0xf) == type) n++;
    }
    return n;
}

// @yo2 0x006e5690 ... and that value
int engCountKeyValue(uint32_t i, uint32_t key, uint32_t value) {
    int n = 0;
    for (; i; i = g_eng.node[i].next) {
        const EngNode& e = g_eng.node[i];
        if ((e.kind & 0xf) < 6 && e.key == key && e.value == value) n++;
    }
    return n;
}

static uint16_t headOf(uint32_t j, int s) { return g_eng.pl[j & 1].slot[s].head; }
// @yo2 0x006e5710
int engSlotCountKey(uint32_t j, int s, uint32_t key) { return engCountKey(headOf(j, s), key); }
// @yo2 0x006e5760
int engSlotCountKeyType(uint32_t j, int s, uint32_t key, uint32_t type) { return engCountKeyType(headOf(j, s), key, type); }
// @yo2 0x006e57b0
int engSlotCountKeyValue(uint32_t j, int s, uint32_t key, uint32_t value) { return engCountKeyValue(headOf(j, s), key, value); }

// @yo2 0x006e5800
int engSlotHasKey(uint32_t j, int s, int key) { return engFindKey(headOf(j, s), key) != nullptr; }

// @yo2 0x006e5870 index of the type < 6 node with that key and value, 0 = none
int engSlotNodeKeyValue(uint32_t j, int s, uint32_t key, uint32_t value) {
    for (uint32_t i = headOf(j, s); i; i = g_eng.node[i].next) {
        const EngNode& e = g_eng.node[i];
        if ((e.kind & 0xf) < 6 && e.key == key && e.value == value) return (int)i;
    }
    return 0;
}

// @yo2 0x006e5910
int engSlotHasKeyValue(uint32_t j, int s, uint32_t key, uint32_t value) { return engFindKeyValue(headOf(j, s), key, value) != nullptr; }
// @yo2 0x006e5980
int engSlotHasNode(uint32_t j, int s, int key, int type) { return engFindKeyType(headOf(j, s), key, type) != nullptr; }
// @yo2 0x006e59f0
int engSlotHasExpiring(uint32_t j, int s, uint32_t key) { return engFindExpiring(headOf(j, s), key, -1) != nullptr; }
// @yo2 0x006e5a60
int engSlotHasExpiringValue(uint32_t j, int s, uint32_t key, int value) { return engFindExpiring(headOf(j, s), key, value) != nullptr; }

static uint32_t valueOr(const EngNode* e) { return e ? e->value : 0xffffffff; }
// @yo2 0x006e5ad0 value of the slot's node with that key, -1 = none
uint32_t engSlotKeyValue(uint32_t j, int s, uint32_t key) { return valueOr(engFindKey(headOf(j, s), key)); }
// @yo2 0x006e5b40
uint32_t engSlotKeyTypeValue(uint32_t j, int s, uint32_t key, uint32_t type) { return valueOr(engFindKeyType(headOf(j, s), key, type)); }
// @yo2 0x006e5bb0
uint32_t engSlotExpiringValue(uint32_t j, int s, uint32_t key) { return valueOr(engFindExpiring(headOf(j, s), key, -1)); }

// the same on a physical card's list
// @yo2 0x006e5c20
int engUidHasKey(int uid, uint32_t key) { return engFindKey(g_eng.uid[uid].head, key) != nullptr; }
// @yo2 0x006e5c60
int engUidHasKeyType(int uid, uint32_t key, uint32_t type) { return engFindKeyType(g_eng.uid[uid].head, key, type) != nullptr; }
// @yo2 0x006e5ca0
int engUidHasKeyValue(int uid, uint32_t key, uint32_t value) { return engFindKeyValue(g_eng.uid[uid].head, key, value) != nullptr; }
// @yo2 0x006e5ce0
uint32_t engUidKeyValue(int uid, uint32_t key) { return valueOr(engFindKey(g_eng.uid[uid].head, key)); }
// @yo2 0x006e5d20
uint32_t engUidKeyTypeValue(int uid, uint32_t key, uint32_t type) { return valueOr(engFindKeyType(g_eng.uid[uid].head, key, type)); }
// @yo2 0x006e5d70
int engUidCountKey(int uid, uint32_t key) { return engCountKey(g_eng.uid[uid].head, key); }
// @yo2 0x006e5da0
int engUidCountKeyType(int uid, uint32_t key, uint32_t type) { return engCountKeyType(g_eng.uid[uid].head, key, type); }

// @yo2 0x006e5de0 sum of the values of the slot's type < 6 nodes with that key
int engSlotSumKey(uint32_t j, int s, uint32_t key) {
    int n = 0;
    for (uint32_t i = headOf(j, s); i; i = g_eng.node[i].next)
        if ((g_eng.node[i].kind & 0xf) < 6 && g_eng.node[i].key == key) n += g_eng.node[i].value;
    return n;
}

// @yo2 0x006e5e80 first node of the slot's list the predicate accepts
EngNode* engSlotFindIf(uint32_t j, int s, int (*pred)(EngNode*, uint32_t), uint32_t arg) {
    for (uint32_t i = headOf(j, s); i;) {
        uint32_t n = g_eng.node[i].next;
        if (pred(&g_eng.node[i], arg)) return &g_eng.node[i];
        i = n;
    }
    return nullptr;
}

// @yo2 0x006e5f10 first time: flag 0x20000 on the player; then nodes 0x1c33, then 0x1d20 (type 2)
void engPlayerMark(uint32_t j) {
    uint32_t& f = g_eng.pl[j & 1].slot[11].flags;
    if (!(f & 0x20000)) {
        f |= 0x20000;
        return;
    }
    if (!engSlotHasNode(j, 11, 0x1c33, 2)) engNodeAddSlot(j, 11, 2, 0x1c33, 0);
    else if (!engSlotHasNode(j, 11, 0x1d20, 2)) engNodeAddSlot(j, 11, 2, 0x1d20, 0);
}

// @yo2 0x006e5fd0 1 = (j, s) is the attacker, 2 = the attack target, 0 = neither
int engBattleRole(uint32_t j, uint32_t s) {
    if (j == g_eng.vcc3c0 && s == g_eng.vcc3dc) return 1;
    if (!g_eng.vcc3c8 && j == g_eng.vcc3c4 && s == g_eng.vcc3e0) return 2;
    return 0;
}

// @yo2 0x00717a70
int engCard717a70(int card) { return cardKind(card) == 8; }
