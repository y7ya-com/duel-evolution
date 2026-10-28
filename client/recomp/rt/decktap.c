// The player's duel deck, read off the client's own outgoing messages: at a duel's setup the exe sends 0x6601 (main
// deck) and 0x6603 (extra deck), each u32 n + n x u16 YO2 card ids (big-endian). The message frame (yo2srv/red/proto.py):
// a 24-byte header (u16 id, u16 data length, u32 param, MD5) then the data, all XOR'd with 5a a5 5a 55. Web:
// Module.yo2Lazy.prefetchCards(ids) fetches those cards' big art (data/card/NNNN.png) during rock-paper-scissors, so a
// card first shown mid-duel is already in memory. Native: RC_DECK_LOG=1 logs the ids. Nothing is changed or consumed.
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include "rt.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
// on the page's thread (lazyfs lives there; the game may send from a worker), synchronously so `ids` stays valid
static void deck_js(const uint16_t *ids, int n) {
    MAIN_THREAD_EM_ASM({
        const L = Module['yo2Lazy'];
        if (L && L.prefetchCards) L.prefetchCards(Array.from(HEAPU16.subarray($0 >> 1, ($0 >> 1) + $1)));
    }, ids, n);
}
#endif

static const uint8_t KEY[4] = {0x5a, 0xa5, 0x5a, 0x55};

void rc_deck_tap(const uint8_t *buf, int len) {   // one send(): whole messages, back to back
    for (int at = 0; at + 24 <= len;) {
        uint8_t h[8];
        for (int i = 0; i < 8; i++) h[i] = buf[at + i] ^ KEY[i % 4];
        int id = h[0] << 8 | h[1], n = h[2] << 8 | h[3];
        if (at + 24 + n > len) return;
        if ((id == 0x6601 || id == 0x6603) && n >= 4) {
            const uint8_t *d = buf + at + 24;
            uint8_t x[1024];
            for (int i = 0; i < n && i < (int)sizeof x; i++) x[i] = d[i] ^ KEY[(i + 24) % 4];
            uint32_t count = (uint32_t)x[0] << 24 | x[1] << 16 | x[2] << 8 | x[3];
            if (count > (uint32_t)(n - 4) / 2) count = (uint32_t)(n - 4) / 2;
            uint16_t ids[512];
            if (count > 512) count = 512;
            for (uint32_t i = 0; i < count; i++) ids[i] = (uint16_t)(x[4 + 2 * i] << 8 | x[5 + 2 * i]);
            static int logging = -1;
            if (logging < 0) logging = getenv("RC_DECK_LOG") != NULL;
            if (logging) {
                char line[2048];
                int k = snprintf(line, sizeof line, "deck %s: %u cards:", id == 0x6601 ? "main" : "extra", count);
                for (uint32_t i = 0; i < count && k < (int)sizeof line - 8; i++) k += snprintf(line + k, sizeof line - k, " %u", ids[i]);
                rc_log("%s", line);
            }
#ifdef __EMSCRIPTEN__
            if (count) deck_js(ids, (int)count);
#endif
        }
        at += 24 + n;
    }
}
