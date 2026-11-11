// Wardrobe equips arrive as 0x4181, including for ourselves. The original handler only updates the lobby list;
// it never updates the active account character, and the area sync never rebuilds an existing chibi's parts.
#include <string.h>
#include "rt.h"

void o_006b9930(CPU *c);
void o_00a02ad0(CPU *c);

static uint32_t appearance_player(void) {
    uint32_t app = RD32m(0x012711ac), acc = app ? RD32m(app + 0xc68) : 0;
    if (!acc) return 0;
    unsigned slot = rc_mem[acc + 0x121c + 0x6d0];
    return slot < 4 ? acc + 0x121c + 0x30 + slot * 0x1a8 : 0;
}

static uint32_t appearance_call(CPU *c, uint32_t self, uint32_t fn, int n, const uint32_t *args) {
    CPU t = *c;
    t.ecx = self;
    return rc_call(&t, fn, n, args);
}

// setPlayer takes the 0x1a8-byte player by value and destroys it (ret 0x1a8): build the copy on the stack with the
// copy constructor, as the game's own callers do (009d20c0, 009d2b33).
static void appearance_set_player(CPU *c, uint32_t avatar, uint32_t player) {
    CPU t = *c;
    t.esp -= 0x1a8;
    t.ecx = t.esp;
    rc_call(&t, 0x009d2220, 1, &player); // ret 4: esp back on the copy
    t.ecx = avatar;
    rc_call(&t, 0x009de490, 0, NULL);
}

static uint32_t appearance_be32(uint32_t p) {
    const uint8_t *b = G(p);
    return (uint32_t)b[0] << 24 | (uint32_t)b[1] << 16 | (uint32_t)b[2] << 8 | b[3];
}

void f_006b9930(CPU *c) {
    uint32_t conn = RD32m(c->ecx + 0xf0), pkt = conn ? RD32m(conn + 0xc) : 0;
    uint32_t me = appearance_player();
    if (pkt && RD32m(pkt + 4) == 24 && me) {
        uint32_t pid = appearance_be32(pkt + 0x24), world = appearance_be32(pkt + 0x28);
        if (world < 2 && pid == RD32m(me + 0xc)) {
            memcpy(G(me + 0x138 + world * 20), G(pkt + 0x2c), 16);
            uint32_t game = RD32m(0x012bb6b0), pd = RD32m(0x012714c4);
            if (game && pd && RD32m(game + 0x448) == world)
                memcpy(G(pd + 0xc8), G(pkt + 0x2c), 16);
        }
    }
    o_006b9930(c);
}

// CAreaMap's regular player sync: rebuild our current chibi when its loaded look differs from the account.
// Use the normal texture-loading state machine, releasing the previous textures before replacing the parts.
void f_00a02ad0(CPU *c) {
    uint32_t me = appearance_player(), game = RD32m(0x012bb6b0), mgr = RD32m(c->ecx + 0x288);
    if (me && game && mgr) {
        uint32_t world = RD32m(game + 0x448), pid = RD32m(me + 0xc);
        uint32_t avatar = appearance_call(c, mgr, 0x00409efd, 1, &pid);
        uint32_t elm = avatar ? RD32m(avatar + 0x98) : 0;
        if (world < 2 && elm && memcmp(G(elm + 0x664), G(me + 0x138 + world * 20), 16)) {
            // show() restores these after loading; use the actual walking position, not the last warp position.
            memcpy(G(avatar + 0xd4), G(elm + 0x70), 12);
            rc_mem[avatar + 0xe0] = (uint8_t)RD32m(elm + 0x34c);
            uint32_t instant = 1, async = 0;
            appearance_call(c, avatar, 0x009c2040, 1, &instant); // hide(true), release textures and loader
            appearance_set_player(c, avatar, me);               // setPlayer, clear old engines and set new parts
            appearance_call(c, avatar, 0x009c1f40, 0, NULL);    // requestLoad
            appearance_call(c, avatar, 0x009de190, 1, &async);  // setup(false), stream textures then show
        }
    }
    o_00a02ad0(c);
}
