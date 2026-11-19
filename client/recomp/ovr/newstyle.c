// New-style chibi avatars (prototype, 2026-11-19): a player whose outfit is listed as new-style is drawn from a second
// set of 56 SWF motion dumps instead of the legacy cm_*.txt set, so the outfit's body can have more frames per motion
// and its own art for all 8 facings, while the player's own legacy head (the head of bo_01_cNN, eyes, mouth, face
// mark, glasses, both hair layers in the player's colour) rides on it at a per-frame neck anchor.
//
// How the exe draws a chibi (src/Game/Avatar/yo2ChibiAvatarElm.cpp): CChibiAvatarElm holds 56 CSwfEngines, one per
// motion x facing (index motion * 8 + dir). Each plays one parsed SWF dump: the 56 parsed records (0x4c bytes: PNG
// table +0, dictionary +0x10, timeline +0x34) sit at 0x012b6a30, loaded once from kPlayerMotionFiles (0x012b7e50,
// facings 5..7 = the files of 3..1, drawn with the engine's x scale -1 by switchEngine). The PNG table is copied and
// rewritten for the avatar's parts (applyParts 0x009ccfc0 -> applyMaleParts / applyFemaleParts, replaceFirst on
// template names such as "h1_01_c01"), and the engine keeps POINTERS to the record's dictionary and timeline
// (createEngine 0x009cca40 passes rec+0x10 / rec+0x34 to CSwfEngine::load), so a record must live as long as its
// engines.
//
// This file: the record array's address is a runtime value in the four functions that read it (hooks.py IMM_HOOKS:
// rc_ns_rec*()). Each of them runs with the address of the elm's set: the legacy array, or a new-style array loaded on
// first use from data/Avatar/chibi/nm_*.txt (male) / nw_*.txt (female), 56 files named as kPlayerMotionFiles but with
// facings 5..7 their own files (nm_n06..08 ...). The engine's mirroring of facings 5..7 is kept: a new-style body
// frame for facing 5..7 is stored flipped, so it shows the right way round, and the legacy head art of facings 3..1
// is mirrored by the engine exactly as for a legacy avatar. Every new-style PNG name keeps the legacy template names
// for the head layers, so applyMaleParts / applyFemaleParts put the player's own head in; the outfit's body frames
// are "c?_nb_00_c01_<motion><dir>_<frame>.png", and applyParts' "nb_00" becomes the outfit's code here.
//
// Which outfits are new-style: RC_NEWSTYLE ("m6f=00,f70=01": body m/f, clothes number hex, = body code) or else the
// loose file data/avatar/chibi/newstyle.txt (lines "m 6f 00"). A set whose 56 files are not all present is not used
// (the legacy look stays). RC_NEWSTYLE=0 turns it off.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include "rt.h"

uint32_t rc_halloc(uint32_t n, int zero);
void o_009c9ca0(CPU *restrict c);   // CChibiAvatarElm::requestTextures
void o_009ca1c0(CPU *restrict c);   // CChibiAvatarElm::releaseTextures
void o_009ca6c0(CPU *restrict c);   // CChibiAvatarElm::texturesLoaded
void o_009cca40(CPU *restrict c);   // CChibiAvatarElm::createEngine(index)
void o_009ccfc0(CPU *restrict c);   // CChibiAvatarElm::applyParts(vector<string>&)

enum { ENGINES = 56, REC = 0x4c };
#define LEGACY_RECORDS 0x012b6a30u
// CChibiAvatarElm: kind_ (0 player) at +0x340, avatar_ (CAvatarData) at +0x660: its 16 bytes at +0x664
enum { ELM_KIND = 0x340, ELM_BYTES = 0x664, AV_SEX = 0, AV_CLOTHES = 6 };
// exe functions: vc6 std::string _Tidy(false) and assign(ptr, n) (thiscall), the motion record's ctor (thiscall),
// SwfReader::load(name, png, dict, timeline) (cdecl, thunk), CChibiAvatarElm::replaceFirst(names, from, to) (cdecl)
enum { STR_TIDY = 0x00402581, STR_ASSIGN = 0x00409953, REC_CTOR = 0x009c9430, SWF_LOAD = 0x00406d2a,
       REPLACE_FIRST = 0x009cedc0 };

static uint32_t base = LEGACY_RECORDS;
uint32_t rc_ns_rec(void) { return base; }
uint32_t rc_ns_rec4(void) { return base + 4; }
uint32_t rc_ns_rec8(void) { return base + 8; }
uint32_t rc_ns_rec10(void) { return base + 0x10; }
uint32_t rc_ns_rec34(void) { return base + 0x34; }

typedef struct { uint8_t sex, clothes; char code[3]; } Style;
static Style styles[64];
static int nstyles = -1, off;

static void add_style(char sex, unsigned clothes, const char *code) {
    if (nstyles >= 64 || (sex != 'm' && sex != 'f') || clothes > 0xff || strlen(code) != 2) return;
    styles[nstyles++] = (Style){(uint8_t)(sex == 'f'), (uint8_t)clothes, {code[0], code[1], 0}};
    rc_log("newstyle: %c clothes 0x%02x -> nb_%s", sex, clothes, code);
}

static const char *game_dir(void) {
    const char *g = getenv("YO2_GAME");
    return g && *g ? g : "../game";
}

static void load_table(void) {
    nstyles = 0;
    const char *env = getenv("RC_NEWSTYLE");
    if (env && !strcmp(env, "0")) {
        off = 1;
        return;
    }
    if (env && *env) {
        char buf[512];
        snprintf(buf, sizeof buf, "%s", env);
        for (char *tok = strtok(buf, ","); tok; tok = strtok(NULL, ",")) {
            char sex = tok[0], *eq = strchr(tok, '=');
            add_style(sex, (unsigned)strtoul(tok + 1, NULL, 16), eq ? eq + 1 : "00");
        }
        return;
    }
    char path[512];
    snprintf(path, sizeof path, "%s/merge/data/avatar/chibi/newstyle.txt", game_dir());
    FILE *f = fopen(path, "r");
    if (!f) return;
    char line[128], sex, code[8];
    unsigned clothes;
    while (fgets(line, sizeof line, f))
        if (line[0] != '#' && sscanf(line, " %c %x %7s", &sex, &clothes, code) == 3) add_style(sex, clothes, code);
    fclose(f);
}

static const Style *style_of(uint32_t elm) {
    if (nstyles < 0) load_table();
    if (off || !elm || RD32m(elm + ELM_KIND) != 0) return NULL;
    uint8_t sex = rc_mem[elm + ELM_BYTES + AV_SEX], clothes = rc_mem[elm + ELM_BYTES + AV_CLOTHES];
    for (int i = 0; i < nstyles; i++)
        if (styles[i].sex == sex && styles[i].clothes == clothes) return &styles[i];
    return NULL;
}

// the 56 file names: kPlayerMotionFiles' order (n w g t d01_01 d01_02 d01_03, 8 facings each), every facing its own
static void motion_file(int sex, int i, char *out, size_t n) {
    static const char motions[] = "nwgt";
    int m = i / 8, dir = i % 8 + 1;
    const char *p = sex ? "nw" : "nm";
    if (m < 4) snprintf(out, n, "data/avatar/chibi/%s_%c%02d.txt", p, motions[m], dir);
    else snprintf(out, n, "data/avatar/chibi/%s_d01_%02d.txt", p, m - 3);
}

static uint32_t guest_string(CPU *c, const char *s) {
    uint32_t len = (uint32_t)strlen(s), str = rc_halloc(0x10, 1), buf = rc_halloc(len + 1, 1);
    memcpy(G(buf), s, len);
    CPU t = *c;
    uint32_t z = 0, a[2] = {buf, len};
    t.ecx = str;
    rc_call(&t, STR_TIDY, 1, &z);
    t = *c;
    t.ecx = str;
    rc_call(&t, STR_ASSIGN, 2, a);
    return str;
}

// sex's record array (loaded on first use), 0 when its files are not all there
static uint32_t records(CPU *c, int sex) {
    static uint32_t recs[2];
    static int tried[2];
    if (tried[sex]) return recs[sex];
    tried[sex] = 1;
    char name[96], path[640];
    struct stat st;
    for (int i = 0; i < ENGINES; i++) {
        motion_file(sex, i, name, sizeof name);
        snprintf(path, sizeof path, "%s/merge/%s", game_dir(), name);
        if (stat(path, &st)) {
            rc_log("newstyle: %s missing, %s stays legacy", path, sex ? "female" : "male");
            return 0;
        }
    }
    uint32_t r = rc_halloc(ENGINES * REC, 1);
    for (int i = 0; i < ENGINES; i++) {
        CPU t = *c;
        t.ecx = r + i * REC;
        rc_call(&t, REC_CTOR, 0, NULL);
    }
    for (int i = 0; i < ENGINES; i++) {
        motion_file(sex, i, name, sizeof name);
        uint32_t rec = r + i * REC, a[4] = {guest_string(c, name), rec, rec + 0x10, rec + 0x34};
        CPU t = *c;
        rc_call(&t, SWF_LOAD, 4, a);
    }
    rc_log("newstyle: %s motions loaded at %08x", sex ? "female" : "male", r);
    return recs[sex] = r;
}

static uint32_t base_for(CPU *c, uint32_t elm) {
    const Style *s = style_of(elm);
    uint32_t r = s ? records(c, s->sex) : 0;
    return r ? r : LEGACY_RECORDS;
}

#define WITH_BASE(addr)                         \
    void f_##addr(CPU *restrict c) {            \
        uint32_t was = base;                    \
        base = base_for(c, c->ecx);             \
        o_##addr(c);                            \
        base = was;                             \
    }
WITH_BASE(009c9ca0)
WITH_BASE(009ca1c0)
WITH_BASE(009ca6c0)
WITH_BASE(009cca40)

// applyParts: then the outfit's body frames ("nb_00_c01" -> "nb_<code>_c01"), only for a new-style elm
void f_009ccfc0(CPU *restrict c) {
    uint32_t elm = c->ecx, names = RD32m(c->esp + 4);
    o_009ccfc0(c);
    const Style *s = style_of(elm);
    if (!s || !records(c, s->sex) || !strcmp(s->code, "00")) return;
    static uint32_t from, to[64];
    int k = (int)(s - styles);
    if (!from) from = guest_string(c, "nb_00_c01");
    if (!to[k]) {
        char buf[16];
        snprintf(buf, sizeof buf, "nb_%s_c01", s->code);
        to[k] = guest_string(c, buf);
    }
    uint32_t a[3] = {names, from, to[k]};
    CPU t = *c;
    rc_call(&t, REPLACE_FIRST, 3, a);
}
