// The free starter deck (server/src/game/starter.ts), live in the 2008 client with no reload.
//
// 1. The trunk, live. After a server-side grant the server pushes the whole trunk on the lobby connection as the trade
//    trunk table (0x7125 / 0x7126 / 0x7127): the stock 0x7127 handler (0x6bfa80) copies it into the account's trunk
//    (*(0x12711ac)+0xc68 +0x18ed, 0xcb8 counts) and syncs the card case (0xad7d80: kaban.bin, g_kabanManager). An open
//    Edit Deck read the trunk when it opened (src/Deck/DeckEntry.cpp fillFromDecks), so here its trunk list
//    (g_kabanList) gets each count's change through its own addCount / subCount, then re-filters and shows the total.
//
// 2. The deck, made for the player. Module.yo2InstallStarterDeck({name, main: [[passcode, n]...], extra: [...]},
//    {ifMissing}) -> Promise<boolean> (native: RC_INPUT "starter name|flag|pc:n,...|pc:n,..."). On a later frame, in
//    the game's own thread, once the trunk holds the cards (or ~4 s passed):
//    - deck A of g_deckManager (CDeckManager, src/Deck/DeckManager.h) gets the lists and save() writes
//      "<name>.ydc" (u16 YO2 card indices: main[80], side[15], extra[30]) into the player's folder;
//    - the player's deck file (CPlayerDataManager +0x38, saved with player.bin by its vf0) becomes that file, the one
//      player select and Edit Deck read, and load() rebuilds deck A against the card case; the deck a duel sends
//      (CDeckRuleCheck's copy of deck A, made at player select) is refilled from it;
//    - an open Edit Deck shows it: the old deck's cards go back to its trunk list, the new ones into its grids.
//    ifMissing (the login scan for characters that claimed before this existed): nothing is overwritten. An existing
//    "<name>.ydc" is left as it is; the starter becomes the current deck only when the current one has under 40 main
//    cards. Resolves true when the deck is there with every card owned, false otherwise ("Reload now").
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include "rt.h"
#include "win.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
EM_JS_DEPS(rc_starter, "$stringToUTF8,$lengthBytesUTF8");
#endif

uint32_t rc_halloc(uint32_t n, int zero);
int rc_card_index(uint32_t passcode);   // rt/cardwire.cpp
void o_006bfa80(CPU *c);

#define ACCOUNT_PTR 0x12711acu      // -> +0xc68 the account; its trunk at +0x18ed
#define TRUNK_OFF 0x18ed
#define TRUNK_N 0xcb8
#define DECK_MGR 0x012b28c4u        // CDeckManager*
#define PLAYER_DATA 0x012714c4u     // CPlayerDataManager*
#define CARD_CASE 0x012714b4u       // CKabanManager*
#define DECK_SCENE_ALIVE 0x012b1ac0u
#define DECK_WINDOW 0x012b35b8u     // CWindowTaskDeck*
#define KABAN_LIST 0x012b3980u      // CWindowTaskKabanList*
#define KABAN 0x012b3988u           // CWindowTaskKaban*
// CDeckManager: deck A's lists at +0xfe (main 95, side 30, extra 30, missing 80), sizes at +0x5a4, the file name and
// folder (VC6 strings) at +0x5ac / +0x5bc; vtable slots 50 reset, 52 save, 53 load
enum { DM_MAIN = 0xfe, DM_SIDE = 0x1bc, DM_EXTRA = 0x1f8, DM_MISSING = 0x234, DM_SIZES = 0x5a4, DM_NAME = 0x5ac,
       DM_DIR = 0x5bc, VF_RESET = 50, VF_SAVE = 52, VF_LOAD = 53 };

static uint32_t trunk_addr(void) {
    uint32_t a = RD32m(ACCOUNT_PTR), acc = a ? RD32m(a + 0xc68) : 0;
    return acc ? acc + TRUNK_OFF : 0;
}

// a thiscall on a scratch copy of the CPU (the callers run at a Present or inside an override)
static uint32_t call(CPU *c, uint32_t self, uint32_t fn, int n, uint32_t a0, uint32_t a1) {
    CPU t = *c;
    uint32_t args[2] = {a0, a1};
    t.ecx = self;
    return rc_call(&t, fn, n, args);
}
static uint32_t vcall(CPU *c, uint32_t self, int slot) { return call(c, self, RD32m(RD32m(self) + 4 * slot), 0, 0, 0); }

// ---------------------------------------------------------------- an open Edit Deck

static int deck_scene(void) { return *(uint8_t *)G(DECK_SCENE_ALIVE) && RD32m(KABAN_LIST) && RD32m(DECK_WINDOW); }

static void kaban_total(CPU *c) {
    uint32_t t = trunk_addr(), k = RD32m(KABAN), sum = 0;
    if (!t || !k) return;
    for (uint32_t i = 0; i < TRUNK_N; i++) sum += *(uint8_t *)G(t + i);
    call(c, k, 0x00977310, 1, sum, 0);   // setNumber
}

// deck A's cards in (or out of) the editor's grids, each taken out of (or back into) its trunk list
static void deck_to_editor(CPU *c, int show) {
    uint32_t dm = RD32m(DECK_MGR), kl = RD32m(KABAN_LIST), dw = RD32m(DECK_WINDOW);
    static const uint32_t lists[3] = {DM_MAIN, DM_SIDE, DM_EXTRA}, adds[3] = {0x0094d940, 0x0094dcb0, 0x0094e020};
    if (!show) call(c, dw, 0x0094f9a0, 0, 0, 0);   // clearAll
    for (int p = 0; p < 3; p++)
        for (uint32_t i = 0, n = *(uint8_t *)G(dm + DM_SIZES + p); i < n; i++) {
            uint32_t id = *(uint16_t *)G(dm + lists[p] + 2 * i);
            if (show) call(c, dw, adds[p], 1, id, 0), call(c, kl, 0x00970a80, 2, id, 1);   // grid; subCount
            else call(c, kl, 0x009702c0, 2, id, 1);                                        // addCount
        }
    if (!show) return;
    for (uint32_t i = 0, n = *(uint8_t *)G(dm + DM_SIZES + 3); i < n; i++)
        call(c, dw, 0x0094e2e0, 1, *(uint16_t *)G(dm + DM_MISSING + 2 * i), 0);   // addMissing
    call(c, dw, 0x00950a00, 1, 0, 0);   // switchView(0)
    call(c, dw, 0x0094ee60, 0, 0, 0);   // rebuild
}

// 0x006bfa80 0x7127 TRADETRUNKEND (fastcall, the lobby): the trunk replaced, then the open trunk list follows it
void f_006bfa80(CPU *c) {
    uint32_t t = trunk_addr();
    static uint8_t old[TRUNK_N];
    if (t) memcpy(old, G(t), TRUNK_N);
    o_006bfa80(c);
    if (!t || !deck_scene()) return;
    uint32_t kl = RD32m(KABAN_LIST), changed = 0;
    for (uint32_t i = 0; i < TRUNK_N; i++) {
        int d = *(uint8_t *)G(t + i) - old[i];
        if (d) call(c, kl, d > 0 ? 0x009702c0 : 0x00970a80, 2, i + 1, d > 0 ? d : -d), changed++;
    }
    call(c, kl, 0x00971270, 0, 0, 0);   // applyCategory: newly owned cards into the shown list
    kaban_total(c);
    rc_log("starterdeck: open Edit Deck took %u trunk changes", changed);
}

// ---------------------------------------------------------------- the starter deck

static char req[8192];
static int pending;
static uint32_t since;

static char *queued[64];   // native: RC_INPUT "starter ..." lines, in order (the page's queue is Module._yo2StarterQ)
static int nqueued;

void rc_starter_request(const char *r) {
    if (nqueued < 64) queued[nqueued++] = strdup(r);
}

static void set_str(uint32_t at, const char *s) {   // a VC6 string (the old buffer is left: tiny, and maybe shared)
    uint32_t n = (uint32_t)strlen(s), b = rc_halloc(n + 2, 1);
    memcpy(G(b + 1), s, n);   // byte 0: the copy-on-write count, 0 = one owner
    WR32m(at + 4, b + 1), WR32m(at + 8, n), WR32m(at + 12, n);
}
static void get_str(uint32_t at, char *out, size_t cap) {
    uint32_t p = RD32m(at + 4), n = RD32m(at + 8);
    if (!p || n >= cap) n = 0;
    memcpy(out, p ? G(p) : "", n);
    out[n] = 0;
}

typedef struct { uint16_t main[80], side[15], extra[30]; int nmain, nside, nextra, need[TRUNK_N + 1], bad; } Deck;
// install modes: the starter claim (waits for the pushed trunk, makes it current), the starter login scan (ifMissing),
// and the server sync (decksync.c): a deck written, written and made current, or deleted (deleted on another
// device); tests (native RC_INPUT): a write and a delete that are reported like the player's own
enum { M_CLAIM, M_IF_MISSING, M_WRITE, M_CURRENT, M_DELETE, M_TEST_SAVE, M_TEST_DELETE };
int rc_host_path(const char *g, int write, char *out, size_t n);   // rt/k32.c
void rc_deck_deleted(const char *guest_path);                       // decksync.c
int rc_deck_quiet;   // decksync.c: our own saves are not reported back

static void parse_list(char *s, uint16_t *ids, int *n, int cap, int *need, int *bad) {
    for (char *tok = strtok(s, ","); tok; tok = strtok(NULL, ",")) {
        char *colon = strchr(tok, ':');
        int copies = colon ? atoi(colon + 1) : 1, id = rc_card_index((uint32_t)strtoul(tok, NULL, 10));
        if (!id || id > TRUNK_N) { rc_log("starterdeck: passcode %s not in the card table", tok); (*bad)++; continue; }
        for (int k = 0; k < copies && *n < cap; k++) ids[(*n)++] = (uint16_t)id, need[id]++;
    }
}

static int install(CPU *c, char *name, int mode, Deck *d) {
    int if_missing = mode == M_IF_MISSING;
    uint32_t dm = RD32m(DECK_MGR), pd = RD32m(PLAYER_DATA);
    char file[128], old[256];
    snprintf(file, sizeof file, "%s.ydc", name);
    get_str(dm + DM_NAME, old, sizeof old);
    int editor = deck_scene(), cur_ok = *(uint8_t *)G(dm + DM_SIZES) >= 40, activate = mode == M_CLAIM || mode == M_CURRENT || (if_missing && !cur_ok);
    if (editor) deck_to_editor(c, 0);
    int write = 1;
    if (if_missing) {   // "<name>.ydc" already there: keep it
        set_str(dm + DM_NAME, file);
        write = !(vcall(c, dm, VF_LOAD) & 0xff);
    }
    if (write) {
        vcall(c, dm, VF_RESET);
        for (int i = 0; i < d->nmain; i++) WR8m(dm + DM_MAIN + 2 * i, d->main[i] & 0xff), WR8m(dm + DM_MAIN + 2 * i + 1, d->main[i] >> 8);
        for (int i = 0; i < d->nside; i++) WR8m(dm + DM_SIDE + 2 * i, d->side[i] & 0xff), WR8m(dm + DM_SIDE + 2 * i + 1, d->side[i] >> 8);
        for (int i = 0; i < d->nextra; i++) WR8m(dm + DM_EXTRA + 2 * i, d->extra[i] & 0xff), WR8m(dm + DM_EXTRA + 2 * i + 1, d->extra[i] >> 8);
        WR8m(dm + DM_SIZES, (uint8_t)d->nmain), WR8m(dm + DM_SIZES + 1, (uint8_t)d->nside), WR8m(dm + DM_SIZES + 2, (uint8_t)d->nextra);
        set_str(dm + DM_NAME, file);
        rc_deck_quiet = mode != M_TEST_SAVE;
        if (!(vcall(c, dm, VF_SAVE) & 0xff)) rc_log("starterdeck: %s not written", file);
        rc_deck_quiet = 0;
    }
    if (activate) {   // (a deck already current stays so: the server's current pointer is never echoed back)
        set_str(pd + 0x38, file);
        vcall(c, pd, 0);   // save player.bin
    } else {
        set_str(dm + DM_NAME, old);
    }
    vcall(c, dm, VF_LOAD);
    // the deck a duel sends (0x6600..0x6603) is CDeckRuleCheck's copy (DAT_012bdf40..), which player select fills
    // from deck A: counts main / side / extra, then 80 / 15 / 30 ids
    static const uint32_t lists[3] = {DM_MAIN, DM_SIDE, DM_EXTRA}, ids[3] = {0x012bdf4c, 0x012bdfec, 0x012be00a}, caps[3] = {80, 15, 30};
    for (int p = 0; p < 3; p++) {
        uint32_t n = *(uint8_t *)G(dm + DM_SIZES + p);
        if (n > caps[p]) n = caps[p];
        memset(G(ids[p]), 0, 2 * caps[p]);
        memcpy(G(ids[p]), G(dm + lists[p]), 2 * n);
        WR32m(0x012bdf40 + 4 * p, n);
    }
    if (editor) deck_to_editor(c, 1), kaban_total(c);
    int missing = *(uint8_t *)G(dm + DM_SIZES + 3), nmain = *(uint8_t *)G(dm + DM_SIZES);
    rc_log("starterdeck: %s %s%s, current deck %s: %d main, %d missing%s", file, write ? "written" : "already there",
           if_missing ? " (login scan)" : "", activate ? file : old, nmain, missing, editor ? ", Edit Deck refreshed" : "");
    return mode == M_WRITE || !activate || (nmain >= 40 && !missing);
}

static void done(int ok) {
    pending = 0;
#ifdef __EMSCRIPTEN__
    EM_ASM({ const c = Module._yo2StarterCur; Module._yo2StarterCur = null; if (c) c.res(!!$0); }, ok);
#else
    (void)ok;
#endif
}

void rc_deck_file_name(const char *utf8, char *out, size_t cap);   // decksync.c
void rc_deck_sync_frame(CPU *c);                                    // decksync.c

void rc_starter_frame(CPU *c) {   // ovr/sedefer.c's rc_ovr_frame, at every Present
    rc_deck_sync_frame(c);
#ifdef __EMSCRIPTEN__
    static int boot;
    if (!boot++)
        EM_ASM({
            const enc = (l) => (l || []).map((e) => typeof e === 'number' ? e + ':1' : Array.isArray(e) ? e[0] + ':' + e[1] : e.passcode + ':' + e.n).join(',');
            Module.yo2InstallDeck = (deck, mode) => new Promise((res) => {   // modes: starterdeck.c M_*
                const req = [String(deck.name), mode, enc(deck.main), enc(deck.extra), enc(deck.side)].join('|');
                (Module._yo2StarterQ = Module._yo2StarterQ || []).push({req, res});
            });
            Module.yo2InstallStarterDeck = (deck, opts) => Module.yo2InstallDeck(deck, opts && opts.ifMissing ? 1 : 0);
        });
    if (!pending) {
        int n = EM_ASM_INT({
            const q = Module._yo2StarterQ;
            if (!q || !q.length || Module._yo2StarterCur) return 0;
            Module._yo2StarterCur = q.shift();
            return lengthBytesUTF8(Module._yo2StarterCur.req) + 1;
        });
        if (n > (int)sizeof req) { done(0); return; }
        if (n) EM_ASM({ stringToUTF8(Module._yo2StarterCur.req, $0, $1); }, req, n), pending = 1, since = rc_ticks_ms();
    }
#endif
    if (!pending && nqueued) {
        strncpy(req, queued[0], sizeof req - 1);
        free(queued[0]);
        memmove(queued, queued + 1, --nqueued * sizeof *queued);
        pending = 1, since = rc_ticks_ms();
    }
    if (!pending) return;
    uint32_t dm = RD32m(DECK_MGR), t = trunk_addr(), waited = rc_ticks_ms() - since;
    if (!dm || !RD32m(PLAYER_DATA) || !RD32m(CARD_CASE) || !t || !RD32m(dm + DM_DIR + 8)) {   // no character yet
        if (waited > 120000) rc_log("starterdeck: no character loaded, given up"), done(0);
        return;
    }
    static char buf[sizeof req];
    static Deck d;
    memcpy(buf, req, sizeof buf);
    memset(&d, 0, sizeof d);
    char *name = buf, *flag = strchr(name, '|'), *main = flag ? strchr(flag + 1, '|') : NULL, *extra = main ? strchr(main + 1, '|') : NULL;
    if (!extra) { rc_log("starterdeck: bad request"); done(0); return; }
    *flag++ = *main++ = *extra++ = 0;
    char *side = strchr(extra, '|');
    if (side) *side++ = 0;
    char sjis[96];
    rc_deck_file_name(name, sjis, sizeof sjis);
    parse_list(main, d.main, &d.nmain, 80, d.need, &d.bad);
    parse_list(extra, d.extra, &d.nextra, 30, d.need, &d.bad);
    if (side) parse_list(side, d.side, &d.nside, 15, d.need, &d.bad);
    int mode = atoi(flag);
    // decksync's server decks (written, made current, deleted) wait while Edit Deck is open: an install reloads deck A,
    // and the player's unsaved edits with it (htmlui-deck: the grid went to 40 card backs). A starter claim still shows
    // in the open editor.
    if ((mode == M_WRITE || mode == M_CURRENT || mode == M_DELETE) && deck_scene()) return;
    int owned = 1;
    for (int id = 1; id <= TRUNK_N; id++) owned &= *(uint8_t *)G(t + id - 1) >= d.need[id];
    if (mode == M_DELETE || mode == M_TEST_DELETE) {   // the file only: a current deck that is gone loads as empty
        char g[300], h[1024], dir[256];
        get_str(dm + DM_DIR, dir, sizeof dir);
        snprintf(g, sizeof g, "%s\\%s.ydc", dir, sjis);
        int ok = rc_host_path(g, 1, h, sizeof h) && !unlink(h);
        rc_log("starterdeck: %s.ydc %s", sjis, ok ? "deleted" : "not there");
        if (ok && mode == M_TEST_DELETE) rc_deck_deleted(g);
        done(ok);
        return;
    }
    if (!owned && mode <= M_IF_MISSING && waited < 4000) return;   // the server's trunk push is on its way
    done(install(c, *sjis ? sjis : "Starter", mode, &d) && !d.bad && (mode == M_WRITE || d.nmain >= 40));
}
