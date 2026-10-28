// Card display command handlers (0x007112c0..0x00711d30): reveal, "activates", links.
#include "EngineInternal.h"

static EngSlot& slotAt(uint32_t j, int s) { return g_eng.pl[j & 1].slot[s]; }
static bool live(uint32_t j, int s) { return engSlotLive(j, s) && !(slotAt(j, s).flags & 4); }

// @yo2 0x007112c0 0x2e reveal a card (views 0x43 + 0x21): P0 = zone | flags << 8, P1 = card, P2 = uid. A revealed hand
// card gets a type 3 node (0xfe0, or 0x1db9 for that card).
void engCmdReveal() {
    uint32_t j = cmdPlayer(), zone = g_eng.cur.p0 & 0xff, bits = g_eng.cur.p0 >> 8, card = g_eng.cur.p1, uid = g_eng.cur.p2;
    uint32_t at = engFindUid(uid);
    int idx = (at & 0xff) == j && (at >> 8 & 0xff) == zone ? (int)(at >> 16) : -1;
    switch (g_eng.step) {
    case 0:
        if (zone == Z_GRAVE) {
            if (idx >= 0 && (uint32_t)idx != g_eng.pl[j].graveCount - 1) {
                engGraveToTop(j, uid);
                duelView(0x17, j, Z_GRAVE, uid);
            }
        } else if (zone == Z_BANISH) {
            if (idx >= 0 && (uint32_t)idx != g_eng.pl[j].banishCount - 1) {
                engBanishToTop(j, uid);
                duelView(0x17, j, Z_BANISH, uid);
            }
        } else if (zone == Z_HAND && idx >= 0) {
            engNodeAddSlot(j, 11, 3, card == 0x1db9 ? 0x1db9 : 0xfe0, (uint16_t)uid);
            duelView(0x13, j, 1, uid);
        }
        g_eng.step++;
        return;
    case 1:
        if (duelViewBusy(0x17) || duelViewBusy(0x13)) return;
        duelView(0x43, (bits & 1) ^ j, uid | 0x8000, bits >> 1);
        g_eng.step++;
        return;
    case 2: {
        if (duelViewBusy(0x43)) return;
        uint32_t a;
        if (idx < 0 || (zone < 0xb && !engCardIdAt(j, zone, idx))) a = j | 0x20;
        else a = (((uint32_t)idx & 0xff) << 5 | (zone & 0x1f)) << 1 | j;
        duelView(0x21, a, card, uid);
        g_eng.step++;
        return;
    }
    case 3:
        if (duelViewBusy(0x21)) return;
        if (g_eng.phase == 2) slotAt(g_eng.turnPlayer, 11).flags |= 0x100000;
        g_eng.running = 0;
        return;
    }
}

// @yo2 0x00711620 0x2f "card X activates" (views 0x43 + 0x21 CARD_HAPPEN): P0 = YO2 id (card_prop index)
void engCmdHappen() {
    uint32_t j = cmdPlayer(), id = g_eng.cur.p0;
    switch (g_eng.step) {
    case 0:
        duelView(0x43, j, (uint32_t)cardPropId((int)id), 0);
        g_eng.step++;
        return;
    case 1:
        if (duelViewBusy(0x43)) return;
        duelView(0x21, j | 0x20, id, 0);
        g_eng.step++;
        return;
    case 2:
        if (!duelViewBusy(0x21)) g_eng.running = 0;
        return;
    }
}

// @yo2 0x007116c0 0x30 "card X activates", lighting up every live copy on the field: P0 = internal id, P1 != 0 = both
// sides (the owner is the side that has it, else the turn player)
void engCmdHappenField() {
    uint32_t card = g_eng.cur.p0, both = g_eng.cur.p1, owner = cmdPlayer(), tp = g_eng.turnPlayer;
    if (both) owner = engCountLive(1 - tp, card, -1) ? 1 - tp : tp;
    switch (g_eng.step) {
    case 0:
        duelView(0x43, owner, card, 0);
        g_eng.step++;
        return;
    case 1: {
        if (duelViewBusy(0x43)) return;
        int n = 0;
        int lo = cardIsMonster((int)card) ? 0 : 5, hi = cardIsMonster((int)card) ? 4 : 10;
        for (uint32_t k = 0; k < 2; k++) {
            uint32_t p = tp ^ k;
            if (!both && p != owner) continue;
            for (int s = lo; s <= hi; s++)
                if ((uint32_t)engCardAt(p, s) == card && live(p, s)) {
                    duelView(0x21, (s & 0x1f) << 1 | (p & 1), card, cardUid(slotAt(p, s).card));
                    n++;
                }
        }
        if (!n) duelView(0x21, (owner & 1) | 0x20, (uint32_t)cardPropIndex((int)card), 0);
        g_eng.step++;
        return;
    }
    case 2:
        if (!duelViewBusy(0x21)) g_eng.running = 0;
        return;
    }
}

// @yo2 0x00711960 0x43 view 0x22 with P0 / P1
void engCmdView22() {
    if (g_eng.step == 0) {
        duelView(0x22, cmdPlayer(), g_eng.cur.p0, g_eng.cur.p1);
        g_eng.step++;
        return;
    }
    if (g_eng.step == 1 && duelViewBusy(0x22)) return;
    g_eng.running = 0;
}

// @yo2 0x007119f0 0x42 card -> card link (equip, target; view 0x23 CEquipEffect): P0 = source j | slot << 8,
// P1 = target j | slot << 8, P2 = node type
void engCmdLink() {
    uint32_t sj = g_eng.cur.p0 & 1, ss = g_eng.cur.p0 >> 8, tj = g_eng.cur.p1 & 1, ts = g_eng.cur.p1 >> 8 & 0xff;
    if (g_eng.step == 0) {
        g_eng.step = 1;
        duelView(0x23, ss << 8 | sj, (g_eng.cur.p1 & 0xff00) | tj, cardUid(slotAt(sj, ss).card));
        if (sj == g_eng.viewer) engStatAdd(0x27, 1);
    }
    if (!duelViewBusy(0x23)) {
        engNodeAddSlot(tj, ts, g_eng.cur.p2, g_eng.cur.p0, 0);
        engCollapse1f08();
        duelView(0x25, 0, 0, 0);
        g_eng.running = 0;
    }
}

static void finishSimple() {
    engCollapse1f08();
    duelView(0x25, 0, 0, 0);
    g_eng.running = 0;
}

// @yo2 0x00711b50 0x3b TURN counter of a slot (view 0x24 hourglass): P0 = slot, P1 = 0 reset / else +1, P2 != 0 shows
// the number P2 over the player instead (P0 = card)
void engCmdTurnCounter() {
    uint32_t j = cmdPlayer(), s = g_eng.cur.p0;
    if (!g_eng.cur.p2) {
        int c = engCardAt(j, s);
        if (!c || engTurnCount(c) < 1) return finishSimple();
        EngSlot& sl = slotAt(j, s);
        if (!g_eng.cur.p1) {
            sl.value = 0;
            return finishSimple();
        }
        if (g_eng.step == 0) {
            uint16_t old = (uint16_t)sl.value;
            sl.value++;
            duelView(0x24, (s & 0xff) << 8 | (j & 0xff), old + 1u, cardUid(sl.card));
            g_eng.step++;
            return;
        }
    } else if (g_eng.step == 0) {
        duelView(0x24, 0x1000 | (j & 0xff), g_eng.cur.p2, (uint32_t)engUidOfCard(j, s));
        g_eng.step++;
        return;
    }
    if (duelViewBusy(0x24)) return;
    finishSimple();
}

// @yo2 0x00711d30 0x44 give a card its identity, creating it if the position is empty (tokens and cards that come
// from nowhere): P0 = j | zone << 1 | index << 6 | face << 14 | def << 15, P1 = internal id | bits << 14 (kept on the uid)
void engCmdSetCard() {
    uint32_t p0 = g_eng.cur.p0, card = g_eng.cur.p1 & 0x3fff, bits = g_eng.cur.p1 >> 14, player = cmdPlayer();
    uint32_t dj = p0 & 1, zone = p0 >> 1 & 0x1f, idx = p0 >> 6 & 0xff, uid;
    int existing = (p0 & 0x3e) < 0x18 ? (int)engCardIdAt(dj, zone, idx) : engPileCount(dj, zone);
    if (!existing) {
        uint32_t w = player << 14 | card;
        w = (engNoNormalSummon(card) & 1u) << 15 | (w & 0xffff7fff);
        uint32_t serial = engNextSerial(player) & 0xff;
        uint32_t full = serial << 23 | (w & 0x807fffff);
        uid = ((w & 0x4000) >> 14) + serial * 2;
        g_eng.uid[uid].card = (uint16_t)card;
        g_eng.uid[uid].w8 = (uint16_t)((g_eng.uid[uid].w8 & ~3u) | (bits & 3));
        if ((p0 & 0x3e) < 10) {
            engPlaceCard(dj, zone, &full, (uint16_t)(p0 >> 15), p0 >> 14 & 1);
            EngSlot& sl = slotAt(dj, zone);
            sl.flags &= 0xffdfffff;
            if (engNoNormalSummon(card)) sl.flags |= 0x40;
        } else if ((p0 & 0x3e) < 0x15) {
            engPutCard(dj, zone, &full, p0 >> 14 & 1);
            slotAt(dj, zone).flags &= 0xffefffff;
        } else {
            full = serial << 23 | (w & 0x807f7fff);
            switch (zone) {
            case Z_EXTRA: engExtraPush(dj, &full); break;
            case Z_DECK: engDeckPushTop(dj, &full); break;
            case Z_GRAVE: engGravePush(&full); break;
            case Z_BANISH: engBanishPush(&full, 0); break;
            }
        }
    } else {
        uint32_t* w = engWordAt(dj, zone, idx);
        *w = (*w & ~0x3fffu) | card;
        uid = cardUid(*w);
        g_eng.uid[uid].card = (uint16_t)card;
        g_eng.uid[uid].w8 = (uint16_t)((g_eng.uid[uid].w8 & ~3u) | (bits & 3));
    }
    duelView(0x1c, p0, card, uid);
    g_eng.running = 0;
}
