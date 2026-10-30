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
#include <string.h>
#include "rt.h"
#include "win.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

enum { TEXT = 64, SETMAX = 24, NSETS = 5 };
enum { S_ATK = 1, S_DEF = 2, S_RACE = 3, S_ATTR = 4, S_ICON = 5, S_NAME = 6, S_TEXT = 7, S_LEVEL = 8, S_LIMIT = 9 };
enum { UP = 0x1f, DOWN = 0x20, ATK_MAX = 0x1ff * 10 };
enum { KABAN_LIST_VT = 0x00befe80, FACTORY = 0x0126fa8c, SET_CATEGORY = 0x971240, SEARCH = 0x9716e0 };
static const int32_t SET_MODE[NSETS] = {S_ATTR, S_RACE, S_ICON, S_LEVEL, S_LIMIT};

struct DeckSearchReq {             // written by Module.yo2KabanFilter (the offsets below), seq last
    uint32_t seq, list;
    int32_t cat, ntext;
    uint16_t text[TEXT];
    int32_t set[NSETS][1 + SETMAX];    // attr, race, icon, level, limit: count, then the game's values
    int32_t atk[2], def[2];            // lo, hi; -1 = open
    int32_t sort;                      // 0 as listed, 1 name, 2 ATK down, 3 ATK up, 4 DEF down, 5 DEF up
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

// 0x00b0d6fd wcsstr (the CRT's, cdecl; two callers: the trunk's TEXT search and one other). Case-blind for Latin
// letters while our search runs (a player types "dark" for DARK), exact as the CRT's otherwise.
static int fold;
static uint16_t lower(uint16_t ch) { return (ch >= 'A' && ch <= 'Z') || (ch >= 0xc0 && ch <= 0xde && ch != 0xd7) ? ch + 32 : ch; }
void f_00b0d6fd(CPU *restrict c) {
    RC_LOCALS;
    uint32_t hay = RD32(c->esp + 4), needle = RD32(c->esp + 8), hit = 0;
    for (uint32_t h = hay; RD16(h); h += 2) {
        uint32_t k = 0;
        for (uint16_t a, b; (b = RD16(needle + k)) && (a = RD16(h + k)); k += 2)
            if (fold ? lower(a) != lower(b) : a != b) break;
        if (!RD16(needle + k)) { hit = h; break; }
    }
    c->eax = hit;
    c->ret_to = RD32(c->esp);
    c->esp += 4;
}

static void run(CPU *c, const struct DeckSearchReq *r) {
    RC_LOCALS;
    if (!live_list(r->list) || r->cat < 0 || r->cat > 6) return;
    CPU t = *c;
    t.ecx = r->list;
    uint32_t cat = r->cat;
    rc_call(&t, SET_CATEGORY, 1, &cat);
    if (r->ntext > 0 && r->ntext <= TEXT) {
        uint32_t buf = rc_halloc(2 * r->ntext + 2, 1);
        for (int32_t k = 0; k < r->ntext; k++) WR16(buf + 2 * k, r->text[k]);
        fold = 1;
        search(c, r->list, S_TEXT, 0, NULL, 0, 0, 0, buf);
        fold = 0;
        rc_hfree(buf);
    }
    for (int k = 0; k < NSETS; k++) {
        int32_t n = r->set[k][0];
        if (n > 0 && n <= SETMAX) search(c, r->list, SET_MODE[k], 0, &r->set[k][1], n, 0, 0, 0);
    }
    if (r->atk[0] >= 0 || r->atk[1] >= 0)
        search(c, r->list, S_ATK, 0, NULL, 0, r->atk[0] < 0 ? 0 : r->atk[0], r->atk[1] < 0 ? ATK_MAX : r->atk[1], 0);
    if (r->def[0] >= 0 || r->def[1] >= 0)
        search(c, r->list, S_DEF, 0, NULL, 0, r->def[0] < 0 ? 0 : r->def[0], r->def[1] < 0 ? ATK_MAX : r->def[1], 0);
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
EM_JS(void, decksearch_install, (uint32_t base, int T, int S), {
    Module.yo2KabanFilter = (list, f) => {
        const H = new Int32Array(HEAPU8.buffer, base, 4 + T / 2 + 5 * (1 + S) + 5);
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
        H[0] = (H[0] + 1) | 0;
    };
});
#endif

// ovr/sedefer.c's rc_ovr_frame, at every Present, after rc_htmlui_frame
void rc_decksearch_frame(CPU *c) {
#ifdef __EMSCRIPTEN__
    static int installed;
    if (!installed) installed = 1, decksearch_install((uint32_t)(uintptr_t)&req, TEXT, SETMAX);
#endif
    if (req.seq == done_seq) return;
    done_seq = req.seq;
    struct DeckSearchReq r = req;
    run(c, &r);
}
