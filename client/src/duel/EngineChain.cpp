// Chain-link target lists (0x0071f140..0x0071f400), the chain-link predicates Ghidra missed (0x006f01c0..0x006f0580)
// and the engine's dialog requests: duelView(0x32, kind, a, b) asks the scene for a prompt (0x0071f4d0..0x0071f8e0).
#include "EngineInternal.h"
#include "DuelText.h"

#include <cstring>

static uint16_t* ring() { return engAt<uint16_t>(0x012c8618); }   // 128 overflow targets shared by the links

// target i of a link as stored: the 5 in the link, then the ring; card 0x1935 lists its ring target first
static uint16_t targetWord(const EngChain* c, int i) {
    if (c->w0 == 0x1935) {
        if (!i) i = 5;
        else if (--i >= 5) return ring()[(c->ringAt - 5 + i) % 128];
        else return c->tgt[i];
    }
    if (i < 5) return c->tgt[i];
    return ring()[(c->ringAt - 5 + i) % 128];
}

static void bumpCount(EngChain* c) { c->w6 = (uint16_t)((((c->w6 & 0xff00) + 0x100) ^ (c->w6 & 0xff))); }

// @yo2 0x0071f140 append a target word; the sixth append stores where the ring continues instead
void engChainAddTarget(EngChain* c, uint16_t t) {
    uint32_t n = c->w6 >> 8;
    if (n < 5) c->tgt[n] = t;
    else if (n == 5) c->ringAt = (uint16_t)g_eng.vc8614;
    bumpCount(c);
}

// @yo2 0x0071f1c0 append the monster in (j, s) as a target and mark the link as having picked targets
void engChainAddSlot(EngChain* c, uint32_t j, int s) {
    c->w6 |= 0x80;
    uint32_t n = c->w6 >> 8;
    if (n < 5) {
        uint32_t uid = cardUid(g_eng.pl[j & 1].slot[s].card) & 0x1ff;
        c->tgt[n] = (uint16_t)((j & 1) | (s & 0xf) << 1 | uid << 5 | (g_eng.uid[uid].moves & 3) << 14);
    } else if (n == 5) c->ringAt = (uint16_t)g_eng.vc8614;
    bumpCount(c);
}

// @yo2 0x0071f340
void engChainAddTarget3(EngChain* c, uint8_t j, uint8_t s, uint32_t uid) {
    engChainAddTarget(c, (uint16_t)(((uid & 0x1ff) << 4 | (s & 0xf)) << 1 | (j & 1)));
}

// @yo2 0x0071f380 target i as player | slot << 8
uint32_t engChainTarget(const EngChain* c, int i) {
    uint8_t b = (uint8_t)targetWord(c, i);
    return (b & 1u) | (b >> 1 & 0xfu) << 8;
}

// @yo2 0x0071f400 uid of target i
uint32_t engChainTargetUid(const EngChain* c, int i) { return (targetWord(c, i) & 0x3fe0u) >> 5; }

// @yo2 0x0071f480
uint32_t engPairA() { return g_eng.pairA; }
// @yo2 0x0071f4a0
int engPairANone() { return g_eng.pairA == 0xff; }

// ---- chain-link predicates (link records: w0 card, bits player | zone << 1, w4 uid << 6, w6 low 7 bits count)

// @yo2 0x006f01c0 does the link's card target (or name) uid `uid`
int engChainHasTarget(const EngChain* c, int uid) {
    switch (c->w0) {
    case 0x1754: case 0x14b4: case 0x132e: case 0x1a30: return 1;
    case 0x1c09: return (c->bits & 0x3000) == 0x2000;
    case 0x147e: case 0x1489: case 0x16ab: case 0x1727: case 0x1af0: case 0x1be2: case 0x1d7c: case 0x1d7d:
    case 0x1e7c:
        break;
    default:
        return 0;
    }
    for (int i = 0; i < (c->w6 & 0x7f); i++)
        if ((int)engChainTargetUid(c, i) == uid) return 1;
    return 0;
}

// @yo2 0x006f02e0
int engCardBit3(int card) { return cardBit(card, 3) != 0; }
// @yo2 0x006f0310
// @yo2 0x006f0330
// @yo2 0x006f0350
// @yo2 0x006f0520
int engChainFalse(const EngChain*) { return 0; }

// @yo2 0x006f0370 is the link's effect kept from resolving (0x1cb3 on its controller's side, 0x1a5c on its source)
int engChainBlocked(const EngChain* c, int ignoreSource) {
    if (engCard71ca70(c->w0)) return 1;
    if (engCountLive(c->bits & 1, 0x1cb3, -1)) {
        uint32_t zone = c->bits & 0x3e;
        if (zone >= 10 && zone < 0x15) return 1;       // spell/trap zones
        if (zone >= 0x15 && !cardIsMonster(c->w0)) return 1;
    }
    if (!ignoreSource && (c->bits & 0x3e) < 9) {
        uint32_t k = engFieldUid((c->w4 & 0x7fc0) >> 6);
        if ((k >> 8 & 0xff) < 5 && engSlotHasKey(k & 0xff, k >> 8 & 0xff, 0x1a5c)) return 1;
    }
    return 0;
}

// @yo2 0x006f0480 cards whose links count as continuous
int engChainContinuous(const EngChain* c) {
    switch (c->w0) {
    case 0x12cf: case 0x12d0: case 0x14f6: case 0x1530: case 0x15df: case 0x1696: case 0x1737: case 0x1739:
    case 0x18d9: case 0x1926: case 0x1adf: case 0x1ec2:
        return 1;
    }
    return 0;
}

// @yo2 0x006f0540 one target, on a monster zone
int engChainOneMonsterTarget(const EngChain* c) {
    return (c->w6 & 0x7f) == 1 && (engChainTarget(c, 0) >> 8 & 0xff) < 5;
}

// @yo2 0x006f0580 one target: a trap monster, or a spell/trap zone
int engChainOneTrapTarget(const EngChain* c) {
    uint32_t k = engChainTarget(c, 0), s = k >> 8 & 0xff;
    if ((c->w6 & 0x7f) != 1) return 0;
    if (s < 5) return engSlotTrapMonster(k & 0xff, (int)s) != 0;
    return s < 0xb;
}

// ---- dialog requests (duelView 0x32: sub-kind, a, b)

// @yo2 0x0071f4d0 a message for player j unless j is driven by the program (ctl 1)
void engAskMessage(int j, uint32_t text) {
    if (g_eng.ctl[j] != 1) duelView(0x32, 0, text, 0);
}
// @yo2 0x0071f510
void engAsk2(uint32_t a) { duelView(0x32, 2, a, 0); }
// @yo2 0x0071f540
void engAsk3(uint32_t a, uint32_t b) { duelView(0x32, 3, a, b); }

// @yo2 0x0071f570 a choice among up to four cards (bit i of `flags` marks card i): fills the deck-list block
void engAskCards(uint32_t a, int c0, int c1, int c2, int c3, uint32_t flags) {
    int ids[4] = {c0, c1, c2, c3};
    DuelCardList& l = g_eng.deckList;
    l.count = 0;
    for (int i = 0; i < 4; i++) {
        l.card[i] = ((l.card[i] & ~0x3fffu) | (ids[i] & 0x3fff)) & 0xffff7fff;
        l.card[i] |= (flags >> i & 1) << 15;
        l.count += ids[i] != 0;
    }
    l.x = 0;
    duelView(0x32, 4, a, 0);
}

// @yo2 0x0071f640
void engAsk5(uint32_t a) { duelView(0x32, 5, 0xe7, a); }
// @yo2 0x0071f670
void engAsk6(uint32_t a, uint32_t b) { duelView(0x32, 6, a, b); }
// @yo2 0x0071f6a0
void engAsk7(uint32_t a, uint32_t lo, int hi) { duelView(0x32, 7, a, (uint32_t)hi << 16 | (lo & 0xffff)); }
// @yo2 0x0071f6e0
void engAsk8(uint32_t a, uint32_t lo, int hi) { duelView(0x32, 8, a, (uint32_t)hi << 16 | (lo & 0xffff)); }
// @yo2 0x0071f720
void engAsk9(uint32_t a) { duelView(0x32, 9, a, 0); }
// @yo2 0x0071f750
void engAskNumber(uint32_t a, uint32_t lo) { duelView(0x32, 10, a, (lo & 0xffff) | 0xff0000); }
// @yo2 0x0071f790
void engAskNumber2(uint32_t a, uint32_t lo, int hi) { duelView(0x32, 10, a, (uint32_t)hi << 16 | (lo & 0xffff)); }
// @yo2 0x0071f7d0
void engAsk11(uint32_t a, uint32_t lo, uint8_t b2, uint8_t b3) {
    duelView(0x32, 0xb, a, (uint32_t)(b3 << 8 | b2) << 16 | (lo & 0xffff));
}
// @yo2 0x0071f810
void engAskClose() { duelView(0x32, 0xc, 0, 0); }
// @yo2 0x0071f840
void engAsk13(uint32_t a) { duelView(0x32, 0xd, a, 0); }
// @yo2 0x0071f870
void engAsk14(uint32_t a, uint32_t b) { duelView(0x32, 0xe, a, b); }
// @yo2 0x0071f8c0
void engSendChoice(uint32_t v) { ndSendChoice(v); }

// @yo2 0x0071f8e0 a yes/no question about a card, a choice, an attribute pair...: formats the text, then asks
void engAskText(uint32_t a, int kind, uint32_t v, int arg) {
    char out[256] = {}, tmp[256] = {};   // ponytail: kinds 1 and 6 format the exe's uninitialised buffer; we start empty
    int bits[2] = {0, 0};
    switch (kind) {
    case 0: textCopy(out, textCardName((int)v)); break;
    case 2:
        if (engChoiceText((int)v, arg) == 0x1ac) {
            textFormatS(out, 0xf8, textCardName((int)v));
            goto ask;
        }
        textCopy(out, (uintptr_t)(uint32_t)engChoiceText((int)v, arg));
        break;
    case 3: textCopy(out, textRace((int)v)); break;
    case 4: textCopy(out, textAttr((int)v)); break;
    case 5: textFormatD(out, 0x130, (int)v); break;
    case 7: textFormatD(out, 0x11b, (int)v); break;
    case 8: {   // two attributes from a mask (bits 1..6)
        int* p = bits;
        for (int i = 1; i < 7; i++)
            if (v & 1u << i) *p++ = i;
        textFormatD(tmp, 0x129, bits[0]);
        textFormatD(out, tmp, bits[1]);
        goto ask;
    }
    case 9:
        textFormatS(out, 0xf8, textCardName((int)v));
        goto ask;
    default:
        if (kind > 7) goto ask;
        break;
    }
    textStripColor(tmp, out);
    textFormatS(out, 0x108, tmp);
ask:
    duelView(0x32, 1, (uintptr_t)out, a);
}

// @yo2 0x0071e6a0 is this activation stopped (can't be activated / negated on activation); sets message 0x14 for the
// viewer when it is
int engChainStopped(const uint16_t* w) {   // (a link record: EngChain layout)
    const EngChain* c = (const EngChain*)w;
    int card = c->w0;
    uint32_t pl = c->bits & 1, zone = c->bits >> 1 & 0x1f, z2 = c->bits & 0x3e, uid = (c->w4 & 0x7fc0) >> 6;
    uint32_t owner = (c->bits >> 14 & 1) ^ pl, o = 1 - pl;
    if (!engCard71cbd0(w)) return 0;
    int r = z2 < 9 ? eng6f4c40(pl, (int)zone) : eng6f4dc0(card, uid);
    bool mon = cardIsMonster(card), stZone = z2 >= 10 && z2 <= 0x14;
    uint32_t k = engFieldUid(uid);
    bool ok = !r &&
              ((mon && !stZone) || (!engSlotHasKey(0, 0xb, 0x1407) && (z2 > 0x14 || !engSlotHasKey(pl, (int)zone, 0x19ae)))) &&
              (z2 > 8 || (int)k < 0 || !engSlotHasKey(k & 0xff, k >> 8 & 0xff, 0x1944)) &&
              (!engSlotHasKeyValue(g_eng.turnPlayer, 0xb, 0x15ff, uid) || !(*engWordOfUid(uid) & 0x400000)) &&
              (engCard71a270(card) != 1 || !engCountLiveAll(0x148e)) &&
              (!engCountLiveAll(0x168a) || !engCard71ce20(w)) &&
              ((z2 > 8 && (z2 < 0x15 || !mon)) || (!engCountCardValue(0, 0x1b7b, 1) && !engCountCardValue(1, 0x1b7b, 1)));
    if (!ok) goto stopped;
    if ((z2 < 0x15 || mon) && !stZone) r = engSlotHasKeyValue(owner, 0xb, 0x1679, 1);
    else {
        if (engSlotHasKey(0, 0xb, 0x1684)) goto stopped;
        r = engSlotHasKeyValue(owner, 0xb, 0x1679, 2);
    }
    if (r) goto stopped;
    {
        uint32_t m = (c->bits & 0x3000) && (c->bits & 0x3000) != 0x3000 ? 0 : (uint32_t)engCard6ee9e0(card);
        if ((m & 1) && !engCanMill(owner, 0)) goto stopped;
        if ((m & 2) && !engCanMill(1 - owner, 0)) goto stopped;
    }
    if (stZone) {
        if (!cardIsTrap(card)) {
            if (engCountLiveAll(0x15da)) goto stopped;
            r = engCountLiveAll(0x1765);
        } else {
            for (uint32_t p = 0; p < 2; p++)
                for (int s = 0; s < 5; s++)
                    if (engSlotIsLive(p, s, 0x1296) && (pl != p || !engSlotSourcesActive(p, s, 0x12d3))) goto stopped;
            if (engCountLiveAll(0x1d9c) || engCountLiveAll(0x1760)) goto stopped;
            r = engSlotHasKey(o, 0xb, 0x1840);
        }
        if (r) goto stopped;
    }
    if (c->bits & 0x3000) return 0;
    if (!mon) {
        if (engSlotHasKey(pl, 0xb, 0x18ab)) {
            uint32_t at = engFieldUid(engSlotKeyValue(pl, 0xb, 0x18ab));
            if (at != 0xffffffff && engSlotLive(at & 0xff, at >> 8 & 0xff) && !(g_eng.pl[at & 1].slot[at >> 8 & 0xff].flags & 4))
                goto stopped;
        }
        if (engSlotHasKeyValue(pl, 0xb, 0x1885, 1) || engSlotHasKey(pl, 0xb, 0x1a2a) || engSlotHasKey(pl, 0xb, 0x1bb3))
            goto stopped;
        for (int s = 0; s < 5; s++)
            if (engSlotIsLive(o, s, 0x1b39) && (engSlotHasKey(o, s, 0x1b39) || engSlotHasKey(o, s, 0x161a))) goto stopped;
        if (z2 < 0x15 && (engSlotSourcesActive(pl, (int)zone, 0x184a) || (z2 != 0x14 && engCountLiveAll(0x1de2)) ||
                          engSlotHasKey(pl, (int)zone, 0x1df6)))
            goto stopped;
    }
    if (cardIsSpell(card) &&
        !(!engSlotSourcesActive(pl, (int)zone, 0x1390) && !engSlotHasKey(pl, 0xb, 0x13bd) &&
          !engSlotHasKeyValue(owner, 0xb, 0x1664, uid) && (g_eng.pl[o].handCount || !engCountLive(o, 0x1910, -1)) &&
          (cardIcon(card) != 5 || !engCountLive(o, 0x1722, -1)) && !engSlotHasKey(pl, 0xb, 0x1af7) &&
          !engSlotHasExpiring(pl, 0xb, 0x1b3b) && !engSlotHasKeyValue(owner, 0xb, 0x16dd, (uint32_t)card) &&
          (cardIcon(card) != 2 || !engCountLiveAll(0x1bd7))))
        goto stopped;
    if (cardIsTrap(card)) {
        const uint8_t* kind = engAt<uint8_t>(0x012c8764);
        const uint32_t* who = engAt<uint32_t>(0x012c8784);
        for (uint32_t i = 0; i < g_eng.vc875c; i++) {
            uint16_t id = g_eng.uid[who[i] & 0x1ff].card;
            if (kind[i] == 6 && id > 0x182e && id < 0x1833) goto stopped;
        }
        if (engSlotHasKey(0, 0xb, 0x188e) ||
            (g_eng.phase == 3 && (engCountLive(o, 0x1833, -1) || engCountLive(o, 0x1834, -1) || engSlotHasKey(0, 0xb, 0x19bb))) ||
            engSlotHasExpiring(pl, 0xb, 0x1b3c))
            goto stopped;
    }
    return 0;
stopped:
    if (owner == g_eng.viewer) g_eng.vcc378 = 0x14;
    return 1;
}

// @yo2 0x0071fb40 the UTF-16 version of FUN_0071f8e0 (the one the dialogs read); kinds 2 (with text 0x1ac) and 9 format
// the text but never ask, as in the exe
void engAskTextW(uint32_t a, int kind, uint32_t v, int arg) {
    char16_t out[128] = {}, tmp[128] = {};   // ponytail: kinds above 9 ask with the exe's uninitialised buffer; ours is empty
    int bits[2] = {0, 0};
    switch (kind) {
    case 0: case 1: wtextCopy(out, textCardName((int)v)); break;
    case 2:
        if (engChoiceText((int)v, arg) == 0x1ac) {
            wtextFormatS(out, 0xf8, textCardName((int)v));
            return;
        }
        wtextCopy(out, (uint32_t)engChoiceText((int)v, arg));
        break;
    case 3: wtextCopy(out, textRace((int)v)); break;
    case 4: wtextCopy(out, textAttr((int)v)); break;
    case 5: wtextFormatD(out, 0x130, (int)v); break;
    case 6: wtextCopy(out, (v == 0) + 400); break;
    case 7: wtextFormatD(out, 0x11b, (int)v); break;
    case 8: {
        int* p = bits;
        for (int i = 1; i < 7; i++)
            if (v & 1u << i) *p++ = i;
        wtextFormatD(tmp, 0x129, bits[0]);
        wtextFormatD(out, (const char*)tmp, bits[1]);
        goto ask;
    }
    case 9:
        wtextFormatS(out, 0xf8, textCardName((int)v));
        return;
    default:
        goto ask;
    }
    wtextStripMarks(tmp, (const char*)out);
    wtextFormatS(out, 0x108, (const char*)tmp);
ask:
    duelView(0x32, 1, (uintptr_t)out, a);
}
