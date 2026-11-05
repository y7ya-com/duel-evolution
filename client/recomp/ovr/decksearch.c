// The deck editor's trunk search, modern (owner, 2026-10-30: "like EDOPro"): screens/deck.js's search panel hands a
// filter to the game, and the game's own trunk list applies it, so the list, its drag and drop and the deck rules
// stay the engine's. CWindowTaskKabanList (yo2-decomp src/Deck/KabanWindowList.h, 0x448; vtable 0x00befe80) keeps
// every owned card in `all` (+0x3f0) and the list on screen in `shown` (+0x404):
//   setCategory(c)  0x00971240 thiscall: category (+0x434) = c, then applyCategory(): `shown` rebuilt from `all` for
//                   KL_CAT c (0 normal, 1 effect, 2 spell, 3 trap, 4 ritual, 5 fusion, 6 all), the scroll and rows reset
//   search(mode, order, const VcVector<int>& set, lo, hi, const wchar_t* text)  0x009716e0 thiscall: narrows `shown`
//                   (ATK 1 / DEF 2: lo..hi, or walked in steps of 10 to sort, order 0x1f up / 0x20 down; RACE 3,
//                   ATTR 4, ICON 5, LEVEL 8, LIMIT 9: the values in set; NAME_SORT 6; TEXT 7: name, reading or card
//                   text containing text), then the scroll total and showFrom(0)
// One filter is setCategory then one search() per criterion (AND), the sort last.
//
// The page side: Module.yo2KabanFilter(list, f) (installed at the first frame; absent = an older runtime, no search)
// packs f into `req` and bumps req.seq last; at the next Present (sedefer.c's rc_ovr_frame, the game's thread) a new
// seq runs it. list: the CWindowTaskKabanList from the snapshot, checked here (its vtable, and listed in the window
// factory's controls) before any call. f: { cat, text, attr[], race[], icon[], level[], limit[], atk: [lo, hi],
// def: [lo, hi], sort } with the cards' icon-strip cells for attr (0 Light .. 6 Divine), race (0 Dragon .. 20
// Divine-Beast) and icon (0 counter .. 5 ritual, 6 normal); the game's values are the cells + 1, a normal spell /
// trap's icon 0 (CWindowTaskImageCard*::setValue shows cell value - 1; search's ICON 0 = the plain ones).
// f.pool: { mode, ids } widens the list past the cards owned (the deck editor's "All cards", crafting/editor.js): `all`
// holds every card id with its count (DeckEntry.cpp fillFromDecks pushes 1..0xcb8, 0 for a card not owned) and
// applyCategory leaves out the 0s not in the deck; after the category, mode 1 pushes each of ids (the collectible
// cards in that category) that isn't shown, at its count (0: a missing card, the engine's own dimmed x000 row, which
// can't be dragged); mode 2 keeps only ids, pushing the ones not shown (Missing, Craftable). The other criteria, the
// text and the sort then run over the whole list, as the engine's own search does.
#include <stdlib.h>
#include <string.h>
#include "rt.h"
#include "fuzzy.h"
#include "win.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <emscripten/threading.h>
#endif

enum { TEXT = 64, SETMAX = 24, NSETS = 5, IDMAX = 4096, CARDS = 0xcb8 };
enum { S_ATK = 1, S_DEF = 2, S_RACE = 3, S_ATTR = 4, S_ICON = 5, S_NAME = 6, S_TEXT = 7, S_LEVEL = 8, S_LIMIT = 9 };
enum { UP = 0x1f, DOWN = 0x20, ATK_MAX = 0x1ff * 10 };
enum { KABAN_LIST_VT = 0x00befe80, FACTORY = 0x0126fa8c, SET_CATEGORY = 0x971240, SEARCH = 0x9716e0, SORT_PUSH = 0x913e80 };
static const int32_t SET_MODE[NSETS] = {S_ATTR, S_RACE, S_ICON, S_LEVEL, S_LIMIT};

struct DeckSearchReq {             // written by Module.yo2KabanFilter (the offsets below), seq last
    uint32_t seq, list;
    int32_t cat, ntext;
    uint16_t text[TEXT];
    int32_t set[NSETS][1 + SETMAX];    // attr, race, icon, level, limit: count, then the game's values
    int32_t atk[2], def[2];            // lo, hi; -1 = open
    int32_t sort;                      // 0 as listed, 1 name, 2 ATK down, 3 ATK up, 4 DEF down, 5 DEF up
    int32_t pool, nids;                // 0 the cards owned, 1 also ids, 2 only ids (see the header)
    int32_t ids[IDMAX];
};
static struct DeckSearchReq req;
static uint32_t done_seq;

// list is a live trunk list: its vtable, and one of the window factory's controls (vector at +4 / +8)
static int live_list(uint32_t list) {
    RC_LOCALS;
    uint32_t fac = RD32(FACTORY);
    if (!list || !fac || RD32(list) != KABAN_LIST_VT) return 0;
    for (uint32_t p = RD32(fac + 4), e = RD32(fac + 8); p && p < e; p += 4)
        if (RD32(p) == list) return 1;
    return 0;
}

// search(mode, order, set, lo, hi, text) on list; set: a guest VcVector<int> {alloc, first, last, end}
static void search(CPU *c, uint32_t list, int32_t mode, int32_t order, const int32_t *vals, int32_t n, int32_t lo,
                   int32_t hi, uint32_t text) {
    RC_LOCALS;
    uint32_t vec = rc_halloc(16, 1), data = n ? rc_halloc(4 * n, 0) : 0;
    for (int32_t i = 0; i < n; i++) WR32(data + 4 * i, vals[i]);
    WR32(vec + 4, data), WR32(vec + 8, data + 4 * n), WR32(vec + 12, data + 4 * n);
    uint32_t a[6] = {mode, order, vec, lo, hi, text};
    CPU t = *c;   // a scratch copy below the current stack, as htmlui.c's play()
    t.ecx = list;
    rc_call(&t, SEARCH, 6, a);
    if (data) rc_hfree(data);
    rc_hfree(vec);
}

// The text: ovr/fuzzy.h's match over `shown` (+0x404, SortItems {vtbl, vector<CSortBase {vtbl, card, count, order}>}),
// the engine's own names and texts (the TEXT search's: FUN_0073bc80 the English name, FUN_0073bd30 + FUN_00743d40 the
// card text as shown), kept and ranked in place; then the scroll total (FUN_00977150) and the rows from the top
// (showFrom, 0x009735d0, on the list), as the engine's own search ends
enum { KONAMI_ID = 0x73bc50, NAME_OF = 0x73bc80, TEXT_OF = 0x73bd30, TEXT_FMT = 0x743d40, SCROLL_TOTAL = 0x977150,
       SHOW_FROM = 0x9735d0, TEXTBUF = 0x4000, G_KABAN = 0x012b3988 };
static uint32_t call1(CPU *c, uint32_t fn, uint32_t a) { CPU t = *c; return rc_call(&t, fn, 1, &a); }
static size_t wread(const uint8_t *m, uint32_t p, uint16_t *out, size_t cap) {
    size_t n = 0;
    while (p && n + 1 < cap && (out[n] = RD16(p + 2 * n))) n++;
    out[n] = 0;
    return n;
}
static void retotal(CPU *c, uint32_t list, uint32_t k) {
    RC_LOCALS;
    uint32_t kaban = RD32(G_KABAN);
    CPU t = *c;
    t.ecx = kaban;
    if (k && kaban) rc_call(&t, SCROLL_TOTAL, 1, &k);   // none left: the total stays, as the engine's own search
    t = *c;
    t.ecx = list;
    uint32_t top = 0;
    rc_call(&t, SHOW_FROM, 1, &top);
}
// f.pool (the header): `shown` narrowed to ids (mode 2) in place, then each id not shown pushed with its `all` count
// through SortItems::push (FUN_00913e80, thiscall on the vector's holder: it grows the guest storage itself)
static void pool(CPU *c, uint32_t list, const struct DeckSearchReq *r) {
    RC_LOCALS;
    if (r->pool < 1 || r->pool > 2 || r->nids < 0 || r->nids > IDMAX) return;
    static uint8_t want[CARDS + 1], seen[CARDS + 1];
    memset(want, 0, sizeof want);
    memset(seen, 0, sizeof seen);
    for (int32_t i = 0; i < r->nids; i++) if (r->ids[i] > 0 && r->ids[i] <= CARDS) want[r->ids[i]] = 1;
    uint32_t first = RD32(list + 0x404 + 8), last = RD32(list + 0x404 + 0xc), k = first;
    for (uint32_t p = first; first && p < last; p += 16) {
        int32_t id = (int32_t)RD32(p + 4);
        int ok = id > 0 && id <= CARDS;
        if (r->pool == 2 && !(ok && want[id])) continue;
        if (ok) seen[id] = 1;
        if (k != p) memmove(m + k, m + p, 16);
        k += 16;
    }
    if (first) WR32(list + 0x404 + 0xc, k);
    uint32_t af = RD32(list + 0x3f0 + 8), al = RD32(list + 0x3f0 + 0xc), na = al > af ? (al - af) / 16 : 0;
    for (int32_t i = 0; i < r->nids; i++) {
        int32_t id = r->ids[i];
        if (id <= 0 || id > CARDS || seen[id]) continue;
        seen[id] = 1;
        uint32_t e = af + 16 * (uint32_t)(id - 1);   // `all` is pushed in id order: id at id - 1
        int32_t count = (uint32_t)(id - 1) < na && (int32_t)RD32(e + 4) == id ? (int32_t)RD32(e + 8) : 0;
        CPU t = *c;
        t.ecx = list + 0x404;
        uint32_t a[2] = {(uint32_t)id, (uint32_t)count};
        rc_call(&t, SORT_PUSH, 2, a);
    }
    first = RD32(list + 0x404 + 8), last = RD32(list + 0x404 + 0xc);
    retotal(c, list, last > first ? (last - first) / 16 : 0);
}
static void fuzzy(CPU *c, uint32_t list, const uint16_t *text, int32_t ntext) {
    RC_LOCALS;
    FzQuery q;
    fz_query(&q, text, (size_t)ntext);
    if (!*q.q) return;   // no letters or digits: no text filter
    uint32_t first = RD32(list + 0x404 + 8), last = RD32(list + 0x404 + 0xc), n = last > first ? (last - first) / 16 : 0;
    FzHit *hits = n ? malloc(n * sizeof *hits) : NULL;
    uint8_t *items = n ? malloc(n * 16) : NULL;
    uint32_t buf = rc_halloc(TEXTBUF, 1), k = 0;
    static uint16_t w[TEXTBUF / 2], tw[TEXTBUF / 2];   // a name, a card text (the game's thread only)
    static char norm[TEXTBUF / 2];
    for (uint32_t i = 0; i < n && hits && items; i++) {
        uint32_t it = first + 16 * i, kid = call1(c, KONAMI_ID, RD32(it + 4));
        size_t len = wread(m, call1(c, NAME_OF, kid), w, FZ_LEN + 1);
        fz_norm(w, len, norm, sizeof norm);
        int rank = fz_name_rank(&q, norm);
        if (rank < 0) {   // the card text, only when the name doesn't match
            CPU t = *c;
            uint32_t a[2] = {buf, call1(c, TEXT_OF, kid)};
            WR16(buf, 0);
            rc_call(&t, TEXT_FMT, 2, a);
            fz_norm(tw, wread(m, buf, tw, TEXTBUF / 2), norm, sizeof norm);
            if (fz_text_hit(&q, norm)) rank = 2;
        }
        if (rank < 0) continue;
        hits[k] = (FzHit){rank, "", k};
        fz_key(w, len, hits[k].key, sizeof hits[k].key);
        memcpy(items + 16 * k, m + it, 16);
        k++;
    }
    if (hits && items) {
        qsort(hits, k, sizeof *hits, fz_cmp);
        for (uint32_t i = 0; i < k; i++) memcpy(m + first + 16 * i, items + 16 * hits[i].idx, 16);
        WR32(list + 0x404 + 0xc, first + 16 * k);   // the items are trivially destructible: the rest just drops out
        // the scroll total: FUN_00977150 is thiscall on g_kaban (DAT_012b3988; it adds 0x3b4 for its scroll TaskPtr
        // itself, then get() + setTotal: the decomp's free kabanScrollSetTotal), as the exe's callers load ECX
        retotal(c, list, k);
    }
    rc_hfree(buf);
    free(hits);
    free(items);
}

static void run(CPU *c, const struct DeckSearchReq *r) {
    RC_LOCALS;
    if (!live_list(r->list) || r->cat < 0 || r->cat > 6) return;
    CPU t = *c;
    t.ecx = r->list;
    uint32_t cat = r->cat;
    rc_call(&t, SET_CATEGORY, 1, &cat);
    pool(c, r->list, r);
    for (int k = 0; k < NSETS; k++) {
        int32_t n = r->set[k][0];
        if (n > 0 && n <= SETMAX) search(c, r->list, SET_MODE[k], 0, &r->set[k][1], n, 0, 0, 0);
    }
    if (r->atk[0] >= 0 || r->atk[1] >= 0)
        search(c, r->list, S_ATK, 0, NULL, 0, r->atk[0] < 0 ? 0 : r->atk[0], r->atk[1] < 0 ? ATK_MAX : r->atk[1], 0);
    if (r->def[0] >= 0 || r->def[1] >= 0)
        search(c, r->list, S_DEF, 0, NULL, 0, r->def[0] < 0 ? 0 : r->def[0], r->def[1] < 0 ? ATK_MAX : r->def[1], 0);
    if (r->ntext > 0 && r->ntext <= TEXT) fuzzy(c, r->list, r->text, r->ntext);   // after the filters: fewer to read
    switch (r->sort) {   // ATK / DEF sorts keep the monsters only (the engine's walk skips the rest)
    case 1: search(c, r->list, S_NAME, 0, NULL, 0, 0, 0, 0); break;
    case 2: search(c, r->list, S_ATK, DOWN, NULL, 0, ATK_MAX, 0, 0); break;
    case 3: search(c, r->list, S_ATK, UP, NULL, 0, 0, ATK_MAX, 0); break;
    case 4: search(c, r->list, S_DEF, DOWN, NULL, 0, ATK_MAX, 0, 0); break;
    case 5: search(c, r->list, S_DEF, UP, NULL, 0, 0, ATK_MAX, 0); break;
    }
}

#ifdef __EMSCRIPTEN__
// the page's writer: the cells to the game's values, in DeckSearchReq's layout (base), seq last
EM_JS(void, decksearch_install, (uint32_t base, int T, int S, int I), {
    Module.yo2KabanFilter = (list, f) => {
        const H = new Int32Array(HEAPU8.buffer, base, 4 + T / 2 + 5 * (1 + S) + 7 + I);
        const W = new Uint16Array(HEAPU8.buffer, base + 16, T);
        const text = String(f.text || "").trim().slice(0, T);
        H[1] = list >>> 0; H[2] = f.cat ?? 6; H[3] = text.length;
        for (let i = 0; i < text.length; i++) W[i] = text.charCodeAt(i);
        const sets = [(f.attr || []).map(v => v + 1), (f.race || []).map(v => v + 1),
            (f.icon || []).map(v => v === 6 ? 0 : v + 1), f.level || [], f.limit || []];
        let o = 4 + T / 2;
        for (const s of sets) { H[o] = Math.min(s.length, S); s.slice(0, S).forEach((v, i) => { H[o + 1 + i] = v; }); o += 1 + S; }
        const n = v => v == null || v === "" ? -1 : Math.max(0, v | 0);
        H[o] = n(f.atk?.[0]); H[o + 1] = n(f.atk?.[1]); H[o + 2] = n(f.def?.[0]); H[o + 3] = n(f.def?.[1]);
        H[o + 4] = Math.max(0, ["", "name", "atk-", "atk+", "def-", "def+"].indexOf(f.sort || ""));
        const P = f.pool || {}, ids = Array.isArray(P.ids) ? P.ids.slice(0, I) : [];
        H[o + 5] = P.mode === 1 || P.mode === 2 ? P.mode : 0; H[o + 6] = ids.length;
        ids.forEach((v, i) => { H[o + 7 + i] = v | 0; });
        H[0] = (H[0] + 1) | 0;
    };
    Module.yo2KabanPool = 1;   // this runtime takes f.pool (the page shows its All cards toggle only then)
});
#endif

// ovr/sedefer.c's rc_ovr_frame, at every Present, after rc_htmlui_frame
void rc_decksearch_frame(CPU *c) {
#ifdef __EMSCRIPTEN__
    static int installed;
    if (!installed && emscripten_is_main_runtime_thread())   // the page's Module (as htmlui.c's onYo2Frame)
        installed = 1, decksearch_install((uint32_t)(uintptr_t)&req, TEXT, SETMAX, IDMAX);
#endif
    if (req.seq == done_seq) return;
    done_seq = req.seq;
    struct DeckSearchReq r = req;
    run(c, &r);
}
