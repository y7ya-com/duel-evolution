// New-style waist-up items (2026-11-21): an outfit listed in data/avatar/wu/newstyle.txt is drawn in the waist-up
// (the avatar editor, Select Player, the player card, the duel) from its own pack instead of the 2008 layers:
// one picture of the whole figure below the head per pose, its skin in neutral greys turned into the player's skin
// tone here, the player's own head over it at the pose's neck anchor, the duel disk moved / turned / scaled to the
// drawn forearm, and the disk arm's fist drawn over the disk. Everything else, and any outfit not listed, keeps the
// original layers; a missing or broken pack logs one line and the outfit stays original (ovr/nwpak.h checks it all).
//
// How the exe draws a waist-up (src/Game/Avatar/yo2AvatarTexMaker.*, htmlui cosmetics/waistup.js): CWaistUpAvatar's
// part loop makes a list of Layers (path, src x/y, w x h, dst x/y) from {wm,ww}_data.csv, 13 steps bottom first
// (back hair, the bare body bo, the face, clothes, front hair, the disk), and hands it to its CAvatarTexMaker
// (setLayers 0x009bf5e0); the maker's worker thread blends each layer onto the canvas surface (blendLayer
// 0x009c0d80, stdcall (IDirect3DSurface8 *dst, IDirect3DTexture8 *src, Layer *)).
//
// Here, keyed only on the layers' picture names (whatever made the list):
//   setLayers, after the original copied the list: when one layer is the clothes picture of a listed outfit
//   (<stem>_r.png / _l.png: the pose) and one is the bare body <pre>_bo_01_c0<S>_<pose>.png (S: the skin tone), and
//   the pack is good and has tone S:
//     - the bare body: only its rows above the head cut, at the neck offset; every other head layer at the offset;
//     - the clothes layer and the disk layer (the last one, after the clothes and not front hair) are TAGGED: their
//       srcX becomes 0x4e570000 | op (no real picture is that wide), op an entry of a fixed table saying what to draw.
//   blendLayer: an untagged layer is the original's. A tagged clothes layer draws the item's body, skin swapped; a
//   tagged disk layer draws its strip (the texture the maker loaded) through the pose's transform, then the front
//   hand, skin swapped. The surfaces are locked through their own vtables, as the original does.
// The table: lines "<m|f> <clothes hex> <code> <clothes picture stem>" (custom_assets.py writes it from the packs),
// pack data/avatar/wu/<wm|ww>_nw_<code>.pak. RC_NEWSTYLE_WU=0 turns the path off.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "rt.h"
#include "win.h"
#include "nwpak.h"

void o_009bf5e0(CPU *restrict c);   // CAvatarTexMaker::setLayers (thiscall, const vector<Layer>&)
void o_009c0d80(CPU *restrict c);   // CAvatarTexMaker::blendLayer (stdcall: dst surface, src texture, Layer *)

enum { MAKER_LAYERS = 0x15c, LAYER_SIZE = 0x2c, L_SRCX = 0x10, L_SRCY = 0x14, L_W = 0x18, L_H = 0x1c, L_DSTX = 0x20,
       L_DSTY = 0x24, TAG = 0x4e570000, TAG_MASK = 0xffff0000, MAX_STYLES = 32, MAX_OPS = 1024 };

typedef struct {
    char pre[3];        // wm / ww
    char code[3];
    char stem[48];      // the clothes picture's stem, e.g. wm_dc_04_c01
    int state;          // 0 not read, 1 good, -1 unusable
    NwItem item;
} Style;
static Style styles[MAX_STYLES];
static int nstyles = -1, off;

// disk 0: the body, 1: the disk + the front hand; ox, oy: the caller's shift of the whole bust (a tile of it)
typedef struct { uint16_t style; uint8_t pose, skin, disk; int16_t ox, oy; } Op;
static Op ops[MAX_OPS];
static int nops;   // read by the worker threads after the tag is set (append only)

static void load_table(void) {
    nstyles = 0;
    const char *env = getenv("RC_NEWSTYLE_WU");
    if (env && !strcmp(env, "0")) { off = 1; return; }
    char path[1024];
    if (!rc_host_path("merge/data/avatar/wu/newstyle.txt", 0, path, sizeof path)) return;
    FILE *f = fopen(path, "r");
    if (!f) return;
    char line[256], sex, code[8], stem[64];
    unsigned clothes;
    while (fgets(line, sizeof line, f) && nstyles < MAX_STYLES) {
        if (line[0] == '#' || sscanf(line, " %c %x %7s %63s", &sex, &clothes, code, stem) != 4) continue;
        const char *pre = sex == 'f' ? "ww" : "wm";
        size_t sl = strlen(stem);
        int ok = (sex == 'm' || sex == 'f') && strlen(code) == 2 && code[0] >= '0' && code[0] <= '9' && code[1] >= '0' &&
                 code[1] <= '9' && strcmp(code, "00") && sl > 3 && sl < sizeof styles[0].stem && !strncmp(stem, pre, 2);
        for (size_t i = 0; ok && i < sl; i++) ok = (stem[i] >= 'a' && stem[i] <= 'z') || (stem[i] >= '0' && stem[i] <= '9') || stem[i] == '_';
        if (!ok) { rc_log("newstylewu: table line ignored: %s", line); continue; }
        Style *s = &styles[nstyles++];
        memset(s, 0, sizeof *s);
        memcpy(s->pre, pre, 3);
        memcpy(s->code, code, 3);
        memcpy(s->stem, stem, sl + 1);
        rc_log("newstylewu: %c clothes 0x%02x (%s) -> %s_nw_%s", sex, clothes, stem, pre, code);
    }
    fclose(f);
}

static int ready(Style *s) {
    if (s->state) return s->state > 0;
    s->state = -1;
    char rel[96], path[1024], err[160] = "";
    snprintf(rel, sizeof rel, "merge/data/avatar/wu/%s_nw_%s.pak", s->pre, s->code);
    FILE *f = rc_host_path(rel, 0, path, sizeof path) ? fopen(path, "rb") : NULL;
    if (!f) { rc_log("newstylewu: %s missing; %s stays original", rel, s->stem); return 0; }
    size_t cap = 1 << 20, n = 0;
    uint8_t *b = malloc(cap);
    for (size_t got; (got = fread(b + n, 1, cap - n, f)) > 0;) {
        n += got;
        if (n == cap) {
            if (cap >= (32u << 20)) break;
            b = realloc(b, cap *= 2);
        }
    }
    fclose(f);
    if (nwpak_load(b, n, &s->item, err, sizeof err)) s->state = 1;
    else rc_log("newstylewu: %s: %s; %s stays original", rel, err, s->stem);
    free(b);
    if (s->state > 0) rc_log("newstylewu: %s checked (%u bytes, %d skin tones)", rel, (unsigned)n, s->item.ntones);
    return s->state > 0;
}

// a layer's picture name, lower case, without its folders (0: none)
static int layer_name(uint32_t layer, char *out, size_t n) {
    uint32_t p = RD32m(layer + 4), len = RD32m(layer + 8);
    if (!p || !len || len >= 256) return 0;
    char full[256];
    memcpy(full, G(p), len), full[len] = 0;
    const char *b = full;
    for (const char *q = full; *q; q++)
        if (*q == '/' || *q == '\\') b = q + 1;
    size_t i = 0;
    for (; b[i] && i + 1 < n; i++) out[i] = (char)(b[i] >= 'A' && b[i] <= 'Z' ? b[i] + 32 : b[i]);
    out[i] = 0;
    return i > 0;
}

static int op_for(int style, int pose, int skin, int disk, int ox, int oy) {
    for (int i = 0; i < nops; i++)
        if (ops[i].style == style && ops[i].pose == pose && ops[i].skin == skin && ops[i].disk == disk && ops[i].ox == ox &&
            ops[i].oy == oy)
            return i;
    if (nops >= MAX_OPS) return -1;
    ops[nops] = (Op){(uint16_t)style, (uint8_t)pose, (uint8_t)skin, (uint8_t)disk, (int16_t)ox, (int16_t)oy};
    __atomic_store_n(&nops, nops + 1, __ATOMIC_RELEASE);
    return nops - 1;
}

void f_009bf5e0(CPU *restrict c) {
    uint32_t maker = c->ecx;
    o_009bf5e0(c);
    if (nstyles < 0) load_table();
    if (off || !nstyles) return;
    uint32_t first = RD32m(maker + MAKER_LAYERS + 4), last = RD32m(maker + MAKER_LAYERS + 8);
    if (!first || last < first || (last - first) % LAYER_SIZE || (last - first) / LAYER_SIZE > 64) return;
    int n = (int)((last - first) / LAYER_SIZE), clothes = -1, body = -1, style = -1, pose = -1, skin = 0;
    char name[128];
    for (int i = 0; i < n; i++) {
        if (!layer_name(first + i * LAYER_SIZE, name, sizeof name)) continue;
        size_t ln = strlen(name);
        for (int k = 0; k < nstyles && clothes < 0; k++) {
            size_t sl = strlen(styles[k].stem);
            if (ln == sl + 6 && !strncmp(name, styles[k].stem, sl) && name[sl] == '_' && (name[sl + 1] == 'r' || name[sl + 1] == 'l') &&
                !strcmp(name + sl + 2, ".png"))
                clothes = i, style = k, pose = name[sl + 1] == 'l';
        }
    }
    if (clothes < 0) return;   // the common case: an original outfit
    Style *s = &styles[style];
    for (int i = 0; i < n; i++) {   // the bare body of this pose: <pre>_bo_01_c0S_<pose>.png
        if (!layer_name(first + i * LAYER_SIZE, name, sizeof name)) continue;
        if (strlen(name) == 18 && !strncmp(name, s->pre, 2) && !strncmp(name + 2, "_bo_01_c0", 9) && name[11] >= '1' &&
            name[11] <= '8' && name[12] == '_' && name[13] == "rl"[pose] && !strcmp(name + 14, ".png"))
            body = i, skin = name[11] - '0';
    }
    if (body < 0 || !ready(s)) return;
    if (skin > s->item.ntones) {
        rc_log("newstylewu: %s has no skin tone %d; original", s->stem, skin);
        return;
    }
    // the disk: the last layer, after the clothes, not front hair
    int disk = -1;
    if (n - 1 > clothes && layer_name(first + (n - 1) * LAYER_SIZE, name, sizeof name) && strncmp(name + 2, "_h1_", 4)) disk = n - 1;
    // the caller's shift of the whole bust: the bare body's layer against its place in the pack's canvas
    int32_t ox = (int32_t)RD32m(first + body * LAYER_SIZE + L_DSTX) - s->item.bare_x,
            oy = (int32_t)RD32m(first + body * LAYER_SIZE + L_DSTY) - s->item.bare_y;
    if (ox < -2048 || ox > 2048 || oy < -2048 || oy > 2048) return;
    int ob = op_for(style, pose, skin, 0, ox, oy), od = disk >= 0 ? op_for(style, pose, skin, 1, ox, oy) : -1;
    if (ob < 0 || (disk >= 0 && od < 0)) return;
    const NwPose *p = &s->item.pose[pose];
    for (int i = 0; i < n; i++) {
        uint32_t L = first + i * LAYER_SIZE;
        if (i == clothes) WR32m(L + L_SRCX, TAG | (uint32_t)ob);
        else if (i == disk) WR32m(L + L_SRCX, TAG | (uint32_t)od);
        else {
            if (i == body) {   // only the head: the rows above the cut
                int32_t y = (int32_t)RD32m(L + L_DSTY), h = (int32_t)RD32m(L + L_H), keep = p->headcut + oy - y;
                WR32m(L + L_H, (uint32_t)(keep < 0 ? 0 : keep < h ? keep : h));
            }
            WR32m(L + L_DSTX, RD32m(L + L_DSTX) + (uint32_t)p->ndx);
            WR32m(L + L_DSTY, RD32m(L + L_DSTY) + (uint32_t)p->ndy);
        }
    }
}

// ---- the worker: tagged layers

// a COM call through the object's vtable (stdcall, this first)
static uint32_t com(CPU *c, uint32_t obj, uint32_t slot, int n, const uint32_t *args) {
    uint32_t a[8] = {obj};
    for (int i = 0; i < n && i < 7; i++) a[i + 1] = args[i];
    CPU t = *c;
    return rc_call(&t, RD32m(RD32m(obj) + slot), n + 1, a);
}

void f_009c0d80(CPU *restrict c) {
    uint32_t dst = RD32m(c->esp + 4), src = RD32m(c->esp + 8), layer = RD32m(c->esp + 12);
    uint32_t tag = RD32m(layer + L_SRCX);
    int count = __atomic_load_n(&nops, __ATOMIC_ACQUIRE);
    if ((tag & TAG_MASK) != TAG || (int)(tag & 0xffff) >= count) {
        o_009c0d80(c);
        return;
    }
    const Op op = ops[tag & 0xffff];
    const Style *s = &styles[op.style];
    const NwPose *p = &s->item.pose[op.pose];
    const uint8_t(*lut)[3] = s->item.lut[op.skin];
    // guest scratch below the stack: the locked rects and the descriptions
    uint32_t scratch = (c->esp - 0x200) & ~15u, dlr = scratch, ddesc = scratch + 0x10, slr = scratch + 0x40;
    CPU t = *c;
    t.esp = scratch - 0x10;
    uint32_t a3[3] = {ddesc}, a4[4] = {dlr, 0, 0};
    if (com(&t, dst, 0x20, 1, a3) == 0 && com(&t, dst, 0x24, 3, a4) == 0) {   // GetDesc, LockRect(&lr, NULL, 0)
        int dw = (int)RD32m(ddesc + 0x18), dh = (int)RD32m(ddesc + 0x1c), pitch = (int)RD32m(dlr);
        uint8_t *px = G(RD32m(dlr + 4));
        NwPose q = *p;   // the pose's records moved by the caller's shift
        q.x += op.ox, q.y += op.oy, q.cx += op.ox, q.cy += op.oy;
        p = &q;
        if (!op.disk) nw_blend_rgba(px, pitch, dw, dh, p->body, p->w, p->h, p->x, p->y, lut);
        else {
            uint32_t b5[4] = {0, slr, 0, 0x10};   // LockRect(level 0, &lr, NULL, D3DLOCK_READONLY)
            if (src && com(&t, src, 0x40, 4, b5) == 0) {
                nw_blend_disk(px, pitch, dw, dh, G(RD32m(slr + 4)), (int)RD32m(slr), (int)RD32m(layer + L_W),
                              (int)RD32m(layer + L_H), (int)RD32m(layer + L_DSTX), (int)RD32m(layer + L_DSTY), p);
                uint32_t z[1] = {0};
                com(&t, src, 0x44, 1, z);   // UnlockRect(0)
            }
            nw_blend_rgba(px, pitch, dw, dh, p->hand, p->w, p->h, p->x, p->y, lut);
        }
        com(&t, dst, 0x28, 0, NULL);   // UnlockRect
    }
    c->ret_to = RD32m(c->esp);
    c->esp += 16;   // stdcall, 3 arguments
}
