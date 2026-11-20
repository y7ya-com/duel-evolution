// New-style chibi avatars (2026-11-20): a player whose outfit is listed as new-style is drawn from that outfit's own
// set of 56 SWF motion dumps instead of the legacy cm_*.txt set: a 3D-rendered body with its own art for all 8
// facings and more frames per motion (walk 8, gesture 8, duel stance 6), with the player's own legacy head (the bald
// head of bo_01_c0S, eyes, mouth, face mark, glasses, both hair layers in the player's colour) drawn OVER it at a
// per-frame neck anchor. Old outfits keep the legacy look; a client without this file draws every outfit legacy.
//
// How the exe draws a chibi (src/Game/Avatar/yo2ChibiAvatarElm.cpp): CChibiAvatarElm holds 56 CSwfEngines, one per
// motion x facing (index motion * 8 + dir). Each plays one parsed SWF dump: the 56 parsed records (0x4c bytes: PNG
// table +0, dictionary +0x10, timeline +0x34) sit at 0x012b6a30, loaded once from kPlayerMotionFiles (facings 5..7 =
// the files of 3..1, drawn with the engine's x scale -1). The PNG table is copied and rewritten for the avatar's parts
// (applyParts 0x009ccfc0 -> applyMaleParts / applyFemaleParts, replaceFirst on template names such as "h1_01_c01"),
// and the engine keeps POINTERS to the record's dictionary and timeline (createEngine 0x009cca40), so a record must
// live as long as its engines: records are never freed.
//
// The record array's address is a runtime value in the four functions that read it (hooks.py IMM_HOOKS: rc_ns_rec*()):
// each runs with the array of the elm's set, the legacy one or the new-style outfit's.
//
// Which outfits: data/avatar/chibi/newstyle.txt, lines "<m|f> <clothes hex> <code>" (custom_assets.py writes it from
// the packs; RC_NEWSTYLE="m79=01,..." overrides it, RC_NEWSTYLE=0 turns the path off). Its art: one pack per skin tone,
// data/avatar/chibi/c?_nb_<code>_c0<S>.pak (client/tools/newstyle_pack.py): the 56 dumps, the body frames and the
// per-frame trimmed heads. NOTHING of a pack is used until the whole pack has passed ovr/nspak.h's check (every entry's
// CRC, every PNG decoded, every picture the dumps name present): a missing, short or corrupt pack, or dumps the
// SwfReader leaves empty, log one line and that avatar keeps its legacy look. The texture manager asserts on a missing
// or broken PNG, so this check is the only thing between a bad file and a crash. A checked pack's files are written to
// a memory folder (rc_mem_dir: /rcmem on the web, never persisted; RC_MEMDIR natively) that k32.c's lookup searches
// before the game folder, under the names the exe asks for.
//
// The decision uses the avatar as applyParts sees it (avatarValidate on a copy: the exe resets an invalid avatar to the
// world's default), the player's body (byte 0) and skin tone (byte 13: tones 1..3; others stay legacy). The skin tone
// reaches the pictures through the names: "nb_00_c01" in the dumps becomes "nb_<code>_c0<S>" here, after the exe's
// own rewrite (applyFemaleParts' "cm" -> "cw" included).
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include "rt.h"
#include "win.h"
#include "nspak.h"

uint32_t rc_halloc(uint32_t n, int zero);
void o_009c9ca0(CPU *restrict c);   // CChibiAvatarElm::requestTextures
void o_009ca1c0(CPU *restrict c);   // CChibiAvatarElm::releaseTextures
void o_009ca6c0(CPU *restrict c);   // CChibiAvatarElm::texturesLoaded
void o_009cca40(CPU *restrict c);   // CChibiAvatarElm::createEngine(index)
void o_009ccfc0(CPU *restrict c);   // CChibiAvatarElm::applyParts(vector<string>&)

enum { ENGINES = 56, REC = 0x4c };
#define LEGACY_RECORDS 0x012b6a30u
#define GAME_MNG 0x012bb6b0u   // CGameMng*; its world at +0x448 (worldparts.c)
// CChibiAvatarElm: kind_ (0 player) at +0x340, avatar_ (CAvatarData: vptr, 16 bytes) at +0x660
enum { ELM_KIND = 0x340, ELM_AVATAR = 0x660, AV_BYTES = 4, AV_SIZE = 0x14, AV_SEX = 0, AV_CLOTHES = 6, AV_SKIN = 13 };
// exe functions: vc6 std::string _Tidy(false) and assign(ptr, n) (thiscall), the motion record's ctor (thiscall),
// SwfReader::load(name, png, dict, timeline) (cdecl, thunk), CChibiAvatarElm::replaceFirst(names, from, to) (cdecl),
// avatarValidate(CAvatarData *, int world, bool checkSeries) (stdcall)
enum { STR_TIDY = 0x00402581, STR_ASSIGN = 0x00409953, REC_CTOR = 0x009c9430, SWF_LOAD = 0x00406d2a,
       REPLACE_FIRST = 0x009cedc0, AVATAR_VALIDATE = 0x00a58cc0 };

static uint32_t base = LEGACY_RECORDS;
uint32_t rc_ns_rec(void) { return base; }
uint32_t rc_ns_rec4(void) { return base + 4; }
uint32_t rc_ns_rec8(void) { return base + 8; }
uint32_t rc_ns_rec10(void) { return base + 0x10; }
uint32_t rc_ns_rec34(void) { return base + 0x34; }

enum { SKINS = 3, MAX_STYLES = 64 };
typedef struct {
    uint8_t sex, clothes;
    char code[3];
    int8_t pack[SKINS + 1];   // per skin tone: 0 not looked at yet, 1 checked and in rc_mem_dir, -1 unusable
    int8_t recs_state;        // 0 not loaded, 1 loaded, -1 failed (the style is unusable)
    uint32_t recs;            // its 56 motion records
    uint32_t to[SKINS + 1];   // guest strings "nb_<code>_c0<S>"
} Style;
static Style styles[MAX_STYLES];
static int nstyles = -1, off;

static void add_style(char sex, unsigned clothes, const char *code) {
    if (nstyles >= MAX_STYLES || (sex != 'm' && sex != 'f') || clothes > 0xff || strlen(code) != 2 ||
        code[0] < '0' || code[0] > '9' || code[1] < '0' || code[1] > '9' || !strcmp(code, "00")) {
        rc_log("newstyle: table line %c %x %s ignored", sex, clothes, code);
        return;
    }
    for (int i = 0; i < nstyles; i++)
        if (styles[i].sex == (sex == 'f') && styles[i].clothes == clothes) return;   // the first line wins
    styles[nstyles++] = (Style){.sex = (uint8_t)(sex == 'f'), .clothes = (uint8_t)clothes, .code = {code[0], code[1], 0}};
    rc_log("newstyle: %c clothes 0x%02x -> nb_%s", sex, clothes, code);
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
            char *eq = strchr(tok, '=');
            add_style(tok[0], (unsigned)strtoul(tok + 1, NULL, 16), eq ? eq + 1 : "");
        }
        return;
    }
    char path[1024];
    if (!rc_host_path("merge/data/avatar/chibi/newstyle.txt", 0, path, sizeof path)) return;
    FILE *f = fopen(path, "r");
    if (!f) return;
    char line[128], sex, code[8];
    unsigned clothes;
    while (fgets(line, sizeof line, f))
        if (line[0] != '#' && sscanf(line, " %c %x %7s", &sex, &clothes, code) == 3) add_style(sex, clothes, code);
    fclose(f);
}

// the elm's avatar as applyParts draws it: a copy through avatarValidate (an invalid avatar becomes the default)
static uint32_t scratch_avatar;
static int validated(CPU *c, uint32_t elm, uint8_t out[16]) {
    if (!scratch_avatar) scratch_avatar = rc_halloc(0x20, 1);
    memcpy(G(scratch_avatar), G(elm + ELM_AVATAR), AV_SIZE);
    uint32_t game = RD32m(GAME_MNG);
    if (game) {
        uint32_t a[3] = {scratch_avatar, RD32m(game + 0x448), 1};
        CPU t = *c;
        rc_call(&t, AVATAR_VALIDATE, 3, a);
    }
    memcpy(out, G(scratch_avatar + AV_BYTES), 16);
    return 1;
}

static Style *style_of(CPU *c, uint32_t elm, int *skin) {
    if (nstyles < 0) load_table();
    if (off || !nstyles || !elm || RD32m(elm + ELM_KIND) != 0) return NULL;
    uint8_t raw_sex = rc_mem[elm + ELM_AVATAR + AV_BYTES + AV_SEX], raw_clothes = rc_mem[elm + ELM_AVATAR + AV_BYTES + AV_CLOTHES];
    int any = 0;
    for (int i = 0; i < nstyles && !any; i++) any = styles[i].sex == raw_sex && styles[i].clothes == raw_clothes;
    if (!any) return NULL;   // the common case: no avatarValidate call
    uint8_t b[16];
    validated(c, elm, b);
    *skin = b[AV_SKIN] + 1;
    if (*skin < 1 || *skin > SKINS) return NULL;
    for (int i = 0; i < nstyles; i++)
        if (styles[i].sex == b[AV_SEX] && styles[i].clothes == b[AV_CLOTHES]) return &styles[i];
    return NULL;
}

// ---- the packs

static int mkdirs(const char *dir) {
    char p[1024];
    snprintf(p, sizeof p, "%s", dir);
    for (char *q = p + 1; *q; q++)
        if (*q == '/') { *q = 0; mkdir(p, 0755); *q = '/'; }
    mkdir(p, 0755);
    struct stat st;
    return !stat(p, &st) && S_ISDIR(st.st_mode);
}

static const char *mem_dir(void) {
    static const char *dir;
    static int tried;
    if (tried) return dir;
    tried = 1;
    const char *env = getenv("RC_MEMDIR");
#ifdef __EMSCRIPTEN__
    const char *d = env && *env ? env : "/rcmem";
#else
    const char *d = env && *env ? env : "rc-mem";
#endif
    char sub[1024];
    snprintf(sub, sizeof sub, "%s/merge/data/avatar/chibi", d);
    if (!mkdirs(sub)) {
        rc_log("newstyle: no memory folder %s", d);
        return NULL;
    }
    return dir = strdup(d);
}

static int read_file(const char *path, uint8_t **out, size_t *len) {
    FILE *f = fopen(path, "rb");
    if (!f) return 0;
    size_t cap = 1 << 20, n = 0;
    uint8_t *b = malloc(cap);
    for (size_t got; (got = fread(b + n, 1, cap - n, f)) > 0;) {
        n += got;
        if (n == cap) b = realloc(b, cap *= 2);
        if (cap > (64u << 20)) break;
    }
    int err = ferror(f);
    fclose(f);
    if (err) return free(b), 0;
    *out = b, *len = n;
    return 1;
}

// skin tone `skin`'s pack of style s: checked, then its files written to the memory folder. -> 1 usable
static int pack_ready(Style *s, int skin) {
    if (s->pack[skin]) return s->pack[skin] > 0;
    s->pack[skin] = -1;
    const char *pre = s->sex ? "cw" : "cm";
    char rel[128], path[1024], err[160] = "";
    snprintf(rel, sizeof rel, "merge/data/avatar/chibi/%s_nb_%s_c%02d.pak", pre, s->code, skin);
    uint8_t *blob = NULL;
    size_t len = 0;
    NsEntry *e = NULL;
    int n = 0;
    const char *dir = mem_dir();
    if (!dir) snprintf(err, sizeof err, "no memory folder");
    else if (!rc_host_path(rel, 0, path, sizeof path) || !read_file(path, &blob, &len)) snprintf(err, sizeof err, "missing");
    else if (nspak_check(blob, len, pre, s->code, skin, &e, &n, err, sizeof err)) {
        int ok = 1;
        for (int i = 0; i < n && ok; i++) {
            char out[1024];
            snprintf(out, sizeof out, "%s/merge/data/avatar/chibi/%s", dir, e[i].name);
            FILE *f = fopen(out, "wb");
            ok = f && fwrite(e[i].data, 1, e[i].size, f) == e[i].size;
            if (f && fclose(f)) ok = 0;
            if (!ok) snprintf(err, sizeof err, "%s: not written", e[i].name);
        }
        nspak_free(e, n);
        if (ok) {
            rc_mem_dir = dir;
            rc_path_changed();   // k32.c forgets the lookups that missed the memory folder
            s->pack[skin] = 1;
        }
    }
    free(blob);
    if (s->pack[skin] > 0) rc_log("newstyle: %s_nb_%s_c%02d.pak checked, %d files (%u bytes)", pre, s->code, skin, n, (unsigned)len);
    else rc_log("newstyle: %s_nb_%s_c%02d.pak: %s; clothes 0x%02x stays legacy for skin tone %d", pre, s->code, skin, err,
                s->clothes, skin);
    return s->pack[skin] > 0;
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

// style s's 56 motion records, parsed from its dumps (in the memory folder once a pack is ready). 0 if any comes out
// empty (the SwfReader found no picture table: the style is not used)
static uint32_t records(CPU *c, Style *s) {
    if (s->recs_state) return s->recs_state > 0 ? s->recs : 0;
    s->recs_state = -1;
    const char *pre = s->sex ? "cw" : "cm";
    uint32_t r = rc_halloc(ENGINES * REC, 1);
    for (int i = 0; i < ENGINES; i++) {
        CPU t = *c;
        t.ecx = r + i * REC;
        rc_call(&t, REC_CTOR, 0, NULL);
    }
    for (int i = 0; i < ENGINES; i++) {
        char name[96], file[128];
        nspak_dump_name(pre, s->code, i, file, sizeof file);
        snprintf(name, sizeof name, "data/avatar/chibi/%s", file);
        uint32_t rec = r + i * REC, a[4] = {guest_string(c, name), rec, rec + 0x10, rec + 0x34};
        CPU t = *c;
        rc_call(&t, SWF_LOAD, 4, a);
        if (RD32m(rec + 4) == RD32m(rec + 8)) {   // the PNG table's begin == end
            rc_log("newstyle: %s read no pictures; clothes 0x%02x stays legacy", name, s->clothes);
            return 0;
        }
    }
    rc_log("newstyle: %s_nb_%s motions loaded at %08x", pre, s->code, r);
    s->recs_state = 1;
    return s->recs = r;
}

// the style elm is drawn with now (NULL: legacy), and its skin tone
static Style *usable(CPU *c, uint32_t elm, int *skin) {
    Style *s = style_of(c, elm, skin);
    if (!s || s->recs_state < 0 || !pack_ready(s, *skin) || !records(c, s)) return NULL;
    return s;
}

static uint32_t base_for(CPU *c, uint32_t elm) {
    int skin;
    Style *s = usable(c, elm, &skin);
    return s ? s->recs : LEGACY_RECORDS;
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

// applyParts: then the outfit's own pictures ("nb_00_c01" -> "nb_<code>_c0<S>"), only for a new-style elm (the
// legacy dumps name no nb_ picture)
void f_009ccfc0(CPU *restrict c) {
    uint32_t elm = c->ecx, names = RD32m(c->esp + 4);
    o_009ccfc0(c);
    int skin;
    Style *s = usable(c, elm, &skin);
    if (!s) return;
    static uint32_t from;
    if (!from) from = guest_string(c, "nb_00_c01");
    if (!s->to[skin]) {
        char buf[16];
        snprintf(buf, sizeof buf, "nb_%s_c%02d", s->code, skin);
        s->to[skin] = guest_string(c, buf);
    }
    uint32_t a[3] = {names, from, s->to[skin]}, eax = c->eax;
    CPU t = *c;
    rc_call(&t, REPLACE_FIRST, 3, a);
    c->eax = eax;
}
