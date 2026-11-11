// Tag Duel, the 2v2 relay (server/TAG_RELAY.md, server/src/duel/tagRelay.ts): each seat's and each spectator's lobby
// connection gets a CHATNOTICE (0x4402) on the server-only channel 10 whenever a team's pilot changes. Its text is
// "TAG1:" + the hex of: u8 the own team's active member (0 captain, 1 partner), u8 the other team's, u8 who this client
// is (0 captain, 1 partner, 255 a spectator), then four 52-byte records (u32 pid, big-endian; 16 B name; 16 B avatar
// parts for world 0 and for world 1): own captain, own partner, other captain, other partner.
// - The stock decoder (0x006bb780) reads a notice's text into a 0x81-byte stack buffer with no bound (ygGetString,
//   0x0068b0b0, stops only at the 0x400-byte body's end): a 427-character TAG1 line runs on to its return address.
//   chatfree.c's CHATNOTICE hook hands every channel-10 notice here first; the stock decoder never sees one.
// - Each side's active member goes into CNetDuel's side record (+0x548, 0x94 each: id, name, the parts per world, as
//   0x600c PREPARATION fills it), and in the duel (scene 0x1c) its parts into the duel avatars' table (0x0079a370) too.
//   The roster goes to the page as the yo2-tag-relay event (htmlui/tag-relay.js, the roster over the field).
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

#define TAG_CHANNEL 10
#define PKT_LEN 0x4      // YgPacket (src/Net/ygpacket.h): len, the body's size
#define PKT_DATA 0x24    // the body
#define NOTICE_TEXT 26   // 0x4402's body: u8 kind, u8 channel, s32 pid, s32 language, 16 B name, then the text
#define SCENE_DUEL 0x1c

static int digit(char c) { return c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : -1; }

// the text of one notice (s, n bytes, not NUL-terminated): "TAG1:" + hex, else nothing happens
void rc_tagrelay_apply(CPU *c, const char *s, unsigned n) {
    enum { SIZE = 3 + 4 * 52 };
    uint8_t bytes[SIZE];
    char encoded[SIZE * 2 + 1];
    if (n < 5 + SIZE * 2 || memcmp(s, "TAG1:", 5)) return;
    s += 5;
    for (unsigned i = 0; i < SIZE; i++) {
        int a = digit(s[2 * i]), b = digit(s[2 * i + 1]);
        if (a < 0 || b < 0) return;
        bytes[i] = (uint8_t)((a << 4) | b);
    }
    if (bytes[0] > 1 || bytes[1] > 1 || (bytes[2] > 1 && bytes[2] != 255)) return;
    memcpy(encoded, s, SIZE * 2);
    encoded[SIZE * 2] = 0;
    tagrelay_js(encoded);
    uint32_t app = RD32m(0x012711ac), nd = app ? RD32m(app + 0xc70) : 0;          // CNetDuel
    uint32_t world = RD32m(0x012bb6b0), cloth = world ? RD32m(world + 0x448) : 0;  // CGameMng's world: 0 Domino, 1 Academia
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
        if ((rc_scene_now() & 0xff) == SCENE_DUEL) {
            CPU t = *c;
            uint32_t args[2] = {side, target + 0x2c + cloth * 17};
            rc_call(&t, 0x0079a370, 2, args);   // the duel avatar's parts (side, parts)
        }
    }
}

// CHATNOTICE's packet (CNetLobby +0xf0: its connection, +0xc: the packet in) on channel 10: applied and read to its end
// as the stock decoder leaves a packet (ygBeginRead, ygEndRead) -> 1; any other notice -> 0, for the stock decoder
int rc_tagrelay_notice(CPU *c, uint32_t lobby) {
    uint32_t io = RD32m(lobby + 0xf0), p = io ? RD32m(io + 0xc) : 0;
    if (!p || *(uint8_t *)G(p + PKT_DATA + 1) != TAG_CHANNEL) return 0;
    int32_t len = (int32_t)RD32m(p + PKT_LEN);
    unsigned n = len < 0 ? 0 : len > 0x400 ? 0x400 : (unsigned)len;
    if (n > NOTICE_TEXT) {
        const char *s = (const char *)G(p + PKT_DATA + NOTICE_TEXT);
        rc_tagrelay_apply(c, s, (unsigned)strnlen(s, n - NOTICE_TEXT));
    }
    CPU t = *c;
    rc_call(&t, 0x0068a670, 1, &p);   // ygBeginRead
    t = *c;
    rc_call(&t, 0x0068a6a0, 1, &p);   // ygEndRead
    return 1;
}
