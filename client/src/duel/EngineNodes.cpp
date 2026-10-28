// Effect / modifier nodes (0x006e2760..0x006e35f0): a pool of 255 10-byte records chained into lists hanging off
// field slots (EngSlot::head), off physical cards (EngUid::head) and off each player's slot 11. A node's kind
// low nibble is its type: 0 free, 1-2 count down at the end of a turn (high nibble = turns left), 3 bound to a card,
// < 6 and >= 6 are the two families the remove helpers tell apart, 7 = tied to the slot packed in its key.
#include "EngineInternal.h"

static uint16_t& nextOf(uint32_t i) { return g_eng.node[i].next; }

// @yo2 0x006e2760 free node i: zero it and unlink it from every list that points at it
void engNodeFree(uint32_t i) {
    uint16_t next = g_eng.node[i].next;
    g_eng.node[i] = EngNode{};
    for (EngPlayer& p : g_eng.pl)
        for (EngSlot& s : p.slot)
            if (s.head == i) s.head = next;
    for (uint32_t u = 1; u < 512; u++)
        if (g_eng.uid[u].head == i) g_eng.uid[u].head = next;
    for (uint32_t k = 1; k < 256; k++)
        if (g_eng.node[k].next == i) g_eng.node[k].next = next;
}

// @yo2 0x006e2830 index of a node given a pointer to its key, 0 if it isn't one (nodes 1..255)
int engNodeIndex(const void* key) {
    for (int i = 1; i < 256; i++)
        if (key == &g_eng.node[i].key) return i;
    return 0;
}

// @yo2 0x006e2870 remove every type >= 6 node keyed (b << 8 | a) from every slot list
void engNodeFreeKeyAll(uint8_t a, uint8_t b) {
    uint16_t key = (uint16_t)(b << 8 | a);
    for (EngPlayer& p : g_eng.pl)
        for (EngSlot& s : p.slot)
            for (uint32_t i = s.head; i;) {
                uint32_t n = nextOf(i);
                if ((g_eng.node[i].kind & 0xf) > 5 && g_eng.node[i].key == key) engNodeFree(i);
                i = n;
            }
}

// @yo2 0x006e2a40 first free node; the caller checks it is < 0x100 (the original scans on past the pool)
int engNodeAlloc() {
    int i = 1;
    while (i < 256 && (g_eng.node[i].kind & 0xf)) i++;
    return i;
}

static int append(uint16_t* link, int kind, uint16_t key, uint16_t value) {
    int i = engNodeAlloc();
    if (i >= 0x100) return -1;
    while (*link) link = &nextOf(*link);
    *link = (uint16_t)i;
    EngNode& n = g_eng.node[i];
    n.kind = (uint8_t)kind;
    n.key = key;
    n.value = value;
    n.next = 0;
    n.stamp = (uint16_t)g_eng.stamp;
    return i;
}

// @yo2 0x006e2930 append a node to slot `s` of player j; returns its index or -1 when the pool is full
int engNodeAddSlot(uint32_t j, int s, int kind, uint16_t key, uint16_t value) {
    return append(&g_eng.pl[j & 1].slot[s].head, kind, key, value);
}

// @yo2 0x006e2a80 append a node to a physical card's list
int engNodeAddUid(int uid, int kind, uint16_t key, uint16_t value) {
    return append(&g_eng.uid[uid].head, kind, key, value);
}

// @yo2 0x006e2b60 free a whole list
void engNodeFreeList(uint32_t i) {
    while (i) {
        uint32_t n = nextOf(i);
        engNodeFree(i);
        i = n;
    }
}

// the four "free matching nodes of a list" variants; `once` stops after the first match
static void freeWhere(uint32_t i, bool once, bool (*match)(const EngNode&, uint32_t, uint32_t), uint32_t a, uint32_t b) {
    while (i) {
        uint32_t n = nextOf(i);
        if (match(g_eng.node[i], a, b)) {
            engNodeFree(i);
            if (once) return;
        }
        i = n;
    }
}

// @yo2 0x006e2ba0 type >= 6 with that key
void engNodeFreeKeyHi(uint32_t head, uint16_t key, int once) {
    freeWhere(head, once, [](const EngNode& n, uint32_t k, uint32_t) { return (n.kind & 0xf) > 5 && n.key == k; }, key, 0);
}

// @yo2 0x006e2c10 type < 6 with that key
void engNodeFreeKeyLo(uint32_t head, uint16_t key, int once) {
    freeWhere(head, once, [](const EngNode& n, uint32_t k, uint32_t) { return (n.kind & 0xf) < 6 && n.key == k; }, key, 0);
}

// @yo2 0x006e2c80 exact type with that key
void engNodeFreeKeyType(uint32_t head, uint16_t key, uint32_t type, int once) {
    freeWhere(head, once, [](const EngNode& n, uint32_t k, uint32_t t) { return (uint32_t)(n.kind & 0xf) == t && n.key == k; },
              key, type);
}

// @yo2 0x006e2d00 key and value
void engNodeFreeKeyValue(uint32_t head, uint16_t key, uint32_t value, int once) {
    freeWhere(head, once, [](const EngNode& n, uint32_t k, uint32_t v) { return n.value == v && n.key == k; }, key, value);
}

// @yo2 0x006e2d80 every type < 6 node in the pool with that key and value
void engNodeFreeAllKeyValue(uint32_t key, uint32_t value) {
    for (int i = 1; i < 256; i++) {
        const EngNode& n = g_eng.node[i];
        if ((n.kind & 0xf) < 6 && n.key == key && n.value == value) engNodeFree(i);
    }
}

// @yo2 0x006e2df0 every type < 6 node with that key and value: clear its value
void engNodeClearValue(uint32_t key, uint32_t value) {
    for (int i = 1; i < 256; i++) {
        EngNode& n = g_eng.node[i];
        if ((n.kind & 0xf) < 6 && n.key == key && n.value == value) n.value = 0;
    }
}

// @yo2 0x006e2e40 a slot is emptied: drop its nodes except two kinds of type < 6 (0x164f, 0x1c40)
void engNodeClearSlot(EngSlot* s) {
    for (uint32_t i = s->head; i;) {
        uint32_t n = nextOf(i);
        const EngNode& e = g_eng.node[i];
        if ((e.kind & 0xf) > 5 || (e.key != 0x164f && e.key != 0x1c40)) engNodeFree(i);
        i = n;
    }
}

// @yo2 0x006e2ec0 a card moves from zone `from` to zone `to`: drop the nodes that pointed at it
void engNodeCardMoved(int from, int to, const uint32_t* word) {
    uint32_t uid = cardUid(*word);
    bool leaves = from == Z_GRAVE || from == Z_BANISH || to == Z_EXTRA || to == Z_DECK || to == Z_HAND;
    if (leaves) {
        for (uint32_t j = 0; j < 2; j++)
            for (int s = 5; s < 11; s++) {
                EngSlot& sl = g_eng.pl[j].slot[s];
                if (!sl.faceUp) continue;
                int c = engCardAt(j, s);
                if (c == 0x1668) {
                    for (uint32_t i = sl.head; i;) {
                        EngNode& e = g_eng.node[i];
                        i = e.next;
                        if (e.key == 0x1668 && (e.kind & 0xf) == 3 && (uint32_t)(e.value >> 3) == uid) e.value = 0;
                    }
                } else if (c == 0x1368) {
                    if (engSlotLive(j, s) && !(sl.flags & 4)) engNodeFreeKeyValue(sl.head, (uint16_t)c, uid, 1);
                } else if (c == 0x159c || c == 0x1d19) {
                    engNodeFreeKeyValue(sl.head, (uint16_t)c, uid, 1);
                }
            }
        for (EngPlayer& p : g_eng.pl)
            for (uint32_t i = p.slot[11].head; i;) {
                const EngNode& e = g_eng.node[i];
                uint32_t n = e.next;
                if ((e.kind & 0xf) < 6) {
                    bool drop = false;
                    if (e.value == uid) {
                        switch (e.key) {
                        case 0xdf6: case 0x1181: case 0x12c8: case 0x13a6: case 0x1466: case 0x1522: case 0x156b:
                        case 0x1571: case 0x1664: case 0x16f9: case 0x1775: case 0x17de: case 0x1811: case 0x1836:
                        case 0x185c: case 0x18bc: case 0x197f: case 0x19cb: case 0x19f7: case 0x19f8: case 0x1a04:
                        case 0x1a61: case 0x1a62: case 0x1a64: case 0x1a9f: case 0x1b8f: case 0x1baa: case 0x1c5b:
                        case 0x1cca: case 0x1ce6: case 0x1cef: case 0x1cfc: case 0x1d06: case 0x1dbf:
                            drop = true;
                        }
                    } else if ((uint32_t)(e.value >> 3) == uid) {
                        switch (e.key) {
                        case 0x140c: case 0x15b8: case 0x16b9: case 0x1a02: case 0x1a7a: case 0x1d1b:
                            drop = true;
                        }
                    }
                    if (drop) engNodeFree(i);
                }
                i = n;
            }
        engNodeFreeKeyLo(g_eng.uid[uid].head, 0x18d9, 1);
        engNodeFreeKeyLo(g_eng.uid[uid].head, 0x1add, 1);
        engNodeFreeKeyLo(g_eng.uid[uid].head, 0x1ce0, 1);
        engNodeFreeAllKeyValue(0x1ce0, uid);
        engNodeFreeKeyLo(g_eng.uid[uid].head, 0x1dd2, 1);
        engNodeClearValue(0x1dd2, uid);
    }
    // to the graveyard from anywhere but banished, or leaving the board: card-bound (type 3) nodes go too
    bool leaves2 = from == Z_GRAVE ? to != Z_BANISH : leaves;
    if (leaves2) {
        for (uint32_t i = g_eng.uid[uid].head; i;) {
            uint32_t n = nextOf(i);
            if ((g_eng.node[i].kind & 0xf) == 3) engNodeFree(i);
            i = n;
        }
        for (int i = 1; i < 256; i++) {
            const EngNode& e = g_eng.node[i];
            if ((e.kind & 0xf) < 6 && e.value == uid && (e.key == 0x164f || e.key == 0x1b98 || e.key == 0x1cd0))
                engNodeFree(i);
        }
    }
    for (EngPlayer& p : g_eng.pl)
        for (EngSlot& s : p.slot)
            for (uint32_t i = s.head; i;) {
                const EngNode& e = g_eng.node[i];
                uint32_t n = e.next;
                if ((e.kind & 0xf) < 6 && e.value == uid) {
                    switch (e.key) {
                    case 0xfe0: case 0x18db: case 0x1d6a: case 0x1d98: case 0x1db9: case 0x1df6: case 0x1e36:
                    case 0x1f9b:
                        engNodeFree(i);
                        break;
                    case 0x1549:
                        if (from == Z_DECK) engNodeFree(i);
                        break;
                    }
                }
                i = n;
            }
}

// @yo2 0x006e35f0 end of turn: count down timed nodes, drop slot-tied ones whose card is gone
void engNodeTurnTick() {
    for (int i = 1; i < 256; i++) {
        EngNode& e = g_eng.node[i];
        int t = e.kind & 0xf;
        if (!t) continue;
        if (t < 3) {
            if (!(e.kind & 0xf0)) engNodeFree(i);
            else e.kind = (uint8_t)((e.kind & 0x0f) | ((e.kind & 0xf0) - 0x10));
        } else if (t == 7) {
            int c = engCardAt(e.key & 0xff, e.key >> 8);
            if (c == 0x1b66 || c == 0xec8 || c == 0x1d32 || (c == 0x175d && e.value < g_eng.turn)) engNodeFree(i);
        }
    }
    for (uint32_t j = 0; j < 2; j++)
        for (int s = 5; s < 11; s++)
            if (engCardAt(j, s) == 0x1390)
                for (EngSlot* o = &g_eng.pl[(1 - g_eng.turnPlayer) & 1].slot[5]; o < &g_eng.pl[(1 - g_eng.turnPlayer) & 1].slot[11]; o++)
                    if (cardId(o->card)) engNodeFreeKeyHi(o->head, (uint16_t)(s << 8 | j), 1);
}
