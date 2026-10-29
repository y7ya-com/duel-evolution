// Decks on the server (owner, 2026-10-29): a character's decks live on the server, so they survive a cleared browser
// and follow the player to another device; the .ydc files in the player's folder are a cache. The page does the HTTP
// (same origin, the session cookie): GET / PUT / DELETE /api/de/decks, PUT /api/de/decks/current. The game side:
// - at character load (player select): the player's local .ydc decks and current deck go to
//   Module.yo2DeckCharLoaded({current, decks: [{name, main, side, extra}]}) (ordered passcodes). The page uploads the
//   ones the server lacks (all of them the first time: the migration) and has the server's decks written back
//   through starterdeck.c's queue (Module.yo2InstallDeck: every deck written, the server's current one made current);
// - CDeckManager::save (0x906dd0) of the player's deck: Module.onYo2DeckSaved({name, main, side, extra}), unless
//   it is one of our own writes;
// - a .ydc deleted (DeleteFileA, rt/k32io.c): Module.onYo2DeckDeleted(name);
// - Edit Deck closing (0x8e8f10): Module.onYo2DeckCurrent(name), the deck the player left as current.
// The page's handlers (defined here unless the page brings its own) retry a failed call a few times and never block
// the game. Names: Shift-JIS in the game, JSON (UTF-16 escapes) here, the file name back through
// rc_deck_file_name. Native: the same reports as log lines ("decksync: <handler> <json>") for tests.
#include <dirent.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include "rt.h"
#include "win.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
EM_JS_DEPS(rc_decksync, "$UTF8ToString");
#endif

uint32_t rc_card_passcode(uint32_t index);                       // rt/cardwire.cpp
int rc_host_path(const char *g, int write, char *out, size_t n);   // rt/k32.c
extern int rc_deck_quiet;                                          // starterdeck.c
void o_00906dd0(CPU *c);
void o_008e8f10(CPU *c);

#define DECK_MGR 0x012b28c4u
#define PLAYER_DATA 0x012714c4u
#define CARD_CASE 0x012714b4u
enum { DM_MAIN = 0xfe, DM_SIDE = 0x1bc, DM_EXTRA = 0x1f8, DM_SIZES = 0x5a4, DM_NAME = 0x5ac, DM_DIR = 0x5bc };

static void get_str(uint32_t at, char *out, size_t cap) {   // a VC6 string
    uint32_t p = RD32m(at + 4), n = RD32m(at + 8);
    if (!p || n >= cap) n = 0;
    memcpy(out, p ? G(p) : "", n);
    out[n] = 0;
}

static void strip_ydc(char *s) {
    size_t n = strlen(s);
    if (n > 4 && !strcasecmp(s + n - 4, ".ydc")) s[n - 4] = 0;
}

// a deck name from the page (UTF-8) as the game's file name (Shift-JIS), without what a file name can't hold
void rc_deck_file_name(const char *utf8, char *out, size_t cap) {
    uint16_t w[64];
    uint32_t n = 0;
    for (const unsigned char *p = (const unsigned char *)utf8; *p && n < 40;) {
        uint32_t c = *p++;
        if (c >= 0xc0) {
            int more = c >= 0xf0 ? 3 : c >= 0xe0 ? 2 : 1;
            c &= 0x3f >> more;
            while (more-- && (*p & 0xc0) == 0x80) c = c << 6 | (*p++ & 0x3f);
        }
        w[n++] = c > 0xffff ? '_' : (uint16_t)c;
    }
    uint32_t k = rc_utf16_to_sjis(w, n, out, (uint32_t)cap - 1);
    out[k] = 0;
    for (uint32_t i = 0; i < k; i++) {
        unsigned char b = (unsigned char)out[i];
        if ((b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xfc)) { i++; continue; }   // a two-byte character
        if (b < 0x20 || strchr("\\/:*?\"<>|", b)) out[i] = '_';
    }
}

// ---------------------------------------------------------------- JSON for the page

typedef struct { char *p; size_t n, cap; } Buf;
static void put(Buf *b, const char *s) {
    size_t k = strlen(s);
    if (b->n + k + 1 > b->cap) b->p = realloc(b->p, b->cap = (b->n + k + 1) * 2);
    memcpy(b->p + b->n, s, k + 1);
    b->n += k;
}
static void put_name(Buf *b, const char *sjis) {
    uint16_t w[128];
    uint32_t n = rc_sjis_to_utf16(sjis, (uint32_t)strlen(sjis), w, 128);
    char t[8];
    put(b, "\"");
    for (uint32_t i = 0; i < n; i++) {
        if (w[i] == '"' || w[i] == '\\') snprintf(t, sizeof t, "\\%c", w[i]);
        else if (w[i] < 0x20 || w[i] >= 0x7f) snprintf(t, sizeof t, "\\u%04x", w[i]);
        else snprintf(t, sizeof t, "%c", w[i]);
        put(b, t);
    }
    put(b, "\"");
}
static void put_ids(Buf *b, const uint16_t *ids, int n) {   // card indexes -> passcodes, in deck order
    char t[16];
    put(b, "[");
    for (int i = 0, first = 1; i < n; i++) {
        uint32_t pc = ids[i] ? rc_card_passcode(ids[i]) : 0;
        if (!pc) continue;
        snprintf(t, sizeof t, first ? "%u" : ",%u", pc), first = 0;
        put(b, t);
    }
    put(b, "]");
}
static void put_deck(Buf *b, const char *name, const uint16_t *m, int nm, const uint16_t *s, int ns, const uint16_t *e, int ne) {
    put(b, "{\"name\":"), put_name(b, name);
    put(b, ",\"main\":"), put_ids(b, m, nm);
    put(b, ",\"side\":"), put_ids(b, s, ns);
    put(b, ",\"extra\":"), put_ids(b, e, ne);
    put(b, "}");
}

static void emit(const char *handler, Buf *b) {   // Module[handler](JSON value)
#ifdef __EMSCRIPTEN__
    MAIN_THREAD_EM_ASM({
        const f = Module[UTF8ToString($0)];
        if (f) try { f(JSON.parse(UTF8ToString($1))); } catch (e) { console.error('decksync', e); }
    }, handler, b->p);
#endif
    rc_log("decksync: %s %s", handler, b->p);
    free(b->p);
}

// ---------------------------------------------------------------- the reports

// 0x00906dd0 CDeckManager::save (thiscall): deck A's lists -> <dir>\<name>
void f_00906dd0(CPU *c) {
    uint32_t self = c->ecx;
    o_00906dd0(c);
    if (rc_deck_quiet || self != RD32m(DECK_MGR) || !(c->eax & 0xff)) return;
    char name[128];
    get_str(self + DM_NAME, name, sizeof name);
    strip_ydc(name);
    const uint8_t *n = (const uint8_t *)G(self + DM_SIZES);
    if (!n[0] && !n[1] && !n[2]) return;   // an empty deck (a new character's first deck.ydc): nothing to keep
    Buf b = {0};
    put_deck(&b, name, (const uint16_t *)G(self + DM_MAIN), n[0], (const uint16_t *)G(self + DM_SIDE), n[1],
             (const uint16_t *)G(self + DM_EXTRA), n[2]);
    emit("onYo2DeckSaved", &b);
}

void rc_deck_deleted(const char *guest_path) {   // rt/k32io.c DeleteFileA, after a successful delete
    const char *base = guest_path;
    for (const char *p = guest_path; *p; p++)
        if (*p == '\\' || *p == '/') base = p + 1;
    size_t n = strlen(base);
    if (rc_deck_quiet || n <= 4 || strcasecmp(base + n - 4, ".ydc") || n > 120) return;
    char name[128];
    memcpy(name, base, n + 1);
    strip_ydc(name);
    Buf b = {0};
    put_name(&b, name);
    emit("onYo2DeckDeleted", &b);
}

static void report_current(void) {
    uint32_t pd = RD32m(PLAYER_DATA);
    char name[128];
    if (!pd) return;
    get_str(pd + 0x38, name, sizeof name);
    strip_ydc(name);
    if (!*name) return;
    Buf b = {0};
    put_name(&b, name);
    emit("onYo2DeckCurrent", &b);
}

// 0x008e8f10 CDeckScene vf05: Edit Deck closes
void f_008e8f10(CPU *c) {
    o_008e8f10(c);
    report_current();
}

// the player's .ydc files (the overlay folder of <data>\<player>) and current deck, at character load
static void report_local(const char *dir) {
    char g[300], h[1024], cur[128];
    snprintf(g, sizeof g, "%s\\x.ydc", dir);
    rc_host_path(g, 1, h, sizeof h);
    char *slash = strrchr(h, '/');
    if (slash) *slash = 0;
    get_str(RD32m(PLAYER_DATA) + 0x38, cur, sizeof cur);
    strip_ydc(cur);
    Buf b = {0};
    put(&b, "{\"current\":"), put_name(&b, cur), put(&b, ",\"decks\":[");
    int n = 0;
    DIR *d = opendir(h);
    if (d) {
        for (struct dirent *e; (e = readdir(d));) {
            size_t k = strlen(e->d_name);
            if (k <= 4 || k > 120 || strcasecmp(e->d_name + k - 4, ".ydc")) continue;
            char path[1200], name[128];
            snprintf(path, sizeof path, "%s/%s", h, e->d_name);
            uint16_t f[125] = {0};   // main[80], side[15], extra[30]
            FILE *fp = fopen(path, "rb");
            if (!fp) continue;
            size_t got = fread(f, 1, sizeof f, fp);
            fclose(fp);
            int cards = 0;
            for (int i = 0; i < 125; i++) cards += f[i] != 0;
            if (got != sizeof f || !cards) continue;
            memcpy(name, e->d_name, k + 1);
            strip_ydc(name);
            if (n++) put(&b, ",");
            put_deck(&b, name, f, 80, f + 80, 15, f + 95, 30);
        }
        closedir(d);
    }
    put(&b, "]}");
    emit("yo2DeckCharLoaded", &b);
}

void rc_deck_sync_frame(CPU *c) {   // starterdeck.c, at every Present
    (void)c;
#ifdef __EMSCRIPTEN__
    static int boot;
    if (!boot++)
        EM_ASM({
            // fire and forget, a few tries on a network error or a 5xx
            const api = (path, method, body) => {
                const go = (n) => fetch('/api/de/decks' + path, {method, credentials: 'same-origin',
                        headers: body ? {'Content-Type': 'application/json'} : {}, body: body ? JSON.stringify(body) : undefined})
                    .then((r) => { if (r.status >= 500) throw r.status; return r; })
                    .catch(() => n < 3 ? new Promise((ok) => setTimeout(ok, 2000 << n)).then(() => go(n + 1)) : null);
                return go(0);
            };
            Module.onYo2DeckSaved = Module.onYo2DeckSaved || ((d) => api('', 'PUT', d));
            Module.onYo2DeckDeleted = Module.onYo2DeckDeleted || ((name) => api('/' + encodeURIComponent(name), 'DELETE'));
            Module.onYo2DeckCurrent = Module.onYo2DeckCurrent || ((name) => api('/current', 'PUT', {name}));
            Module.yo2DeckCharLoaded = Module.yo2DeckCharLoaded || (async (local) => {
                const r = await api('', 'GET');
                if (!r || !r.ok) return;
                const srv = await r.json();
                const have = new Set(srv.decks.map((d) => d.name)), dead = new Set((srv.deleted || []).map((d) => d.name));
                const fresh = !srv.decks.length && !dead.size;   // nothing stored yet: this browser's decks are the character's
                for (const d of local.decks)
                    if (!have.has(d.name) && !dead.has(d.name))
                        await api('', 'PUT', {...d, current: d.name === local.current && (fresh || !srv.current)});
                if (fresh) return;
                for (const d of srv.decks) if (d.name !== srv.current) Module.yo2InstallDeck(d, 2);
                const cur = srv.decks.find((d) => d.name === srv.current);
                if (cur) Module.yo2InstallDeck(cur, 3);
                else if (local.current) api('/current', 'PUT', {name: local.current});
            });
        });
#endif
    static char last[300];
    uint32_t dm = RD32m(DECK_MGR);
    if (!dm || !RD32m(PLAYER_DATA) || !RD32m(CARD_CASE)) return;
    char dir[256];
    get_str(dm + DM_DIR, dir, sizeof dir);
    if (!*dir || !strcmp(dir, last)) return;   // a character loaded (player select)
    strcpy(last, dir);
    report_local(dir);
}
