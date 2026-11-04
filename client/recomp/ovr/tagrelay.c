// Server-only chat channel 10 carries relay identities. Reuse the existing avatar loader so the active player's
// actual equipped character replaces the outgoing pilot, and publish the roster for the web HUD.
#include <string.h>
#include "rt.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
EM_JS_DEPS(rc_tagrelay, "$UTF8ToString");
EM_JS(void, tagrelay_js, (const char *hex), {
    const h = UTF8ToString(hex), bytes = Uint8Array.from(h.match(/../g), x => parseInt(x, 16));
    const names = [0, 1, 2, 3].map(i => {
        const b = bytes.slice(3 + i * 52 + 4, 3 + i * 52 + 20), z = b.indexOf(0);
        return new TextDecoder('windows-1252').decode(z < 0 ? b : b.slice(0, z));
    });
    globalThis.__yo2TagRelay = { active: [bytes[0], bytes[1]], self: bytes[2], names };
    dispatchEvent(new CustomEvent('yo2-tag-relay', { detail: globalThis.__yo2TagRelay }));
});
#else
static void tagrelay_js(const char *hex) { (void)hex; }
#endif
int rc_scene_now(void);
static int digit(uint16_t c) { return c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : -1; }
static uint16_t ch(uint32_t p, unsigned i) { uint16_t v; memcpy(&v, G(p + 2 * i), 2); return v; }
void rc_tagrelay_chat(CPU *c, uint32_t p, uint32_t n) {
    enum { SIZE = 3 + 4 * 52 };
    uint8_t bytes[SIZE];
    char encoded[SIZE * 2 + 1];
    unsigned start = 0;
    for (; start + 5 <= n; start++) if (ch(p, start) == 'T' && ch(p, start + 1) == 'A' && ch(p, start + 2) == 'G' && ch(p, start + 3) == '1' && ch(p, start + 4) == ':') break;
    start += 5;
    if (start + SIZE * 2 > n) return;
    for (unsigned i = 0; i < SIZE; i++) {
        int a = digit(ch(p, start + 2 * i)), b = digit(ch(p, start + 2 * i + 1));
        if (a < 0 || b < 0) return;
        bytes[i] = (uint8_t)((a << 4) | b);
        encoded[2 * i] = (char)ch(p, start + 2 * i);
        encoded[2 * i + 1] = (char)ch(p, start + 2 * i + 1);
    }
    if (bytes[0] > 1 || bytes[1] > 1 || (bytes[2] > 1 && bytes[2] != 255)) return;
    encoded[SIZE * 2] = 0;
    tagrelay_js(encoded);
    uint32_t app = RD32m(0x012711ac), nd = app ? RD32m(app + 0xc70) : 0;
    uint32_t world = RD32m(0x012bb6b0), cloth = world ? RD32m(world + 0x448) : 0;
    if (!nd) return;
    if (cloth > 1) cloth = 0;
    for (unsigned side = 0; side < 2; side++) {
        const uint8_t *record = bytes + 3 + (2 * side + bytes[side]) * 52;
        uint32_t target = nd + 0x548 + side * 0x94;
        WR32m(target, (uint32_t)record[0] << 24 | (uint32_t)record[1] << 16 | (uint32_t)record[2] << 8 | record[3]);
        memcpy(G(target + 4), record + 4, 16);
        *(uint8_t *)G(target + 20) = 0;
        for (unsigned w = 0; w < 2; w++) {
            memcpy(G(target + 0x2c + w * 17), record + 20 + w * 16, 16);
            *(uint8_t *)G(target + 0x2c + w * 17 + 16) = 0;
        }
        if ((rc_scene_now() & 0xff) == 0x1c) {
            CPU t = *c;
            uint32_t args[2] = {side, target + 0x2c + cloth * 17};
            rc_call(&t, 0x0079a370, 2, args); // avatarSetParts(side, parts)
        }
    }
}
