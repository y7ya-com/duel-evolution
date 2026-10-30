// The trunk search's fuzzy match (owner, 2026-10-30; the logic of duelforge's filterCards, which the owner gave to
// copy): both sides normalised to a-z / 0-9 ("Blue-Eyes", "blue eyes" and "blueeyes" are one), a card matches when
// the whole query is in its name or every word of the query is, else when every word is in its card text; ranked
// name-starts-with-the-query, then any name match, then text-only, alphabetical within each. Plain C over host
// strings: ovr/decksearch.c feeds it the engine's names and texts, rt/fuzzy_test.c tests it.
#ifndef FUZZY_H
#define FUZZY_H
#include <stddef.h>
#include <stdint.h>
#include <string.h>

enum { FZ_LEN = 64, FZ_TOK = 8 };
typedef struct {
    char q[FZ_LEN + 1];                 // the whole query, normalised
    int ntok;
    char tok[FZ_TOK][FZ_LEN + 1];       // its words, each normalised (empty ones dropped)
} FzQuery;

// a-z / 0-9 of s (UTF-16), lowercased; everything else dropped. Returns the length (out holds at most cap - 1)
static size_t fz_norm(const uint16_t *s, size_t n, char *out, size_t cap) {
    size_t k = 0;
    for (size_t i = 0; i < n && s[i] && k + 1 < cap; i++) {
        uint16_t ch = s[i];
        if (ch >= 'A' && ch <= 'Z') ch += 32;
        if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) out[k++] = (char)ch;
    }
    out[k] = 0;
    return k;
}

static void fz_query(FzQuery *q, const uint16_t *s, size_t n) {
    fz_norm(s, n, q->q, sizeof q->q);
    q->ntok = 0;
    for (size_t i = 0; i < n && q->ntok < FZ_TOK;) {
        while (i < n && (s[i] == ' ' || s[i] == '\t' || s[i] == 0x3000)) i++;
        size_t j = i;
        while (j < n && s[j] && s[j] != ' ' && s[j] != '\t' && s[j] != 0x3000) j++;
        if (j > i && fz_norm(s + i, j - i, q->tok[q->ntok], sizeof q->tok[0])) q->ntok++;
        i = j + 1;
    }
}

static int fz_all(const FzQuery *q, const char *norm) {
    for (int t = 0; t < q->ntok; t++)
        if (!strstr(norm, q->tok[t])) return 0;
    return q->ntok > 0;
}

// 0: the name starts with the query; 1: the query or all its words are in the name; -1: not a name match
static int fz_name_rank(const FzQuery *q, const char *name) {
    if (!*q->q) return -1;
    if (!strncmp(name, q->q, strlen(q->q))) return 0;
    return strstr(name, q->q) || fz_all(q, name) ? 1 : -1;
}

// a text-only match (rank 2): every word of the query in the card text
static int fz_text_hit(const FzQuery *q, const char *text) { return fz_all(q, text); }

// the order: rank, then the name alphabetically (lowercase key)
typedef struct { int rank; char key[FZ_LEN + 1]; uint32_t idx; } FzHit;
static int fz_cmp(const void *a, const void *b) {
    const FzHit *x = a, *y = b;
    if (x->rank != y->rank) return x->rank - y->rank;
    int c = strcmp(x->key, y->key);
    return c ? c : (x->idx > y->idx) - (x->idx < y->idx);   // stable: the list's order between equal names
}
// the sort key of a name: lowercase, as typed (letters, digits, spaces and punctuation kept: "Blue-Eyes" < "Blue Moon")
static void fz_key(const uint16_t *s, size_t n, char *out, size_t cap) {
    size_t k = 0;
    for (size_t i = 0; i < n && s[i] && k + 1 < cap; i++) {
        uint16_t ch = s[i];
        out[k++] = (char)(ch >= 'A' && ch <= 'Z' ? ch + 32 : ch < 0x80 ? ch : 0x7f);
    }
    out[k] = 0;
}
#endif
