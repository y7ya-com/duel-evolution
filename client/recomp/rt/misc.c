// The small DLLs: registry (in memory), VERSION, SHELL32, ole32/OLEAUT32, IMM32, comdlg32, WININET, MSACM32,
// MagicKey. Where the game has a fallback these fail cleanly; every call is logged under RC_VERBOSE.
#include <stdlib.h>

#include "win.h"

#define LOGV(...) do { if (rc_verbose) rc_log(__VA_ARGS__); } while (0)

// ---------------------------------------------------------------- ADVAPI32: registry in memory (per run)
// ponytail: flat list of "key\\value" -> bytes, saved whole to <overlay>/registry.bin on every set (the saved login
// and options live here; on the web the overlay is IndexedDB, so they survive a reload)
typedef struct { char key[256], name[128]; uint32_t type, n; uint8_t data[512]; } RegVal;
static RegVal regv[256];
static int nreg;
extern const char *rc_write_dir;
static FILE *reg_file(const char *mode) {
    char path[512];
    snprintf(path, sizeof path, "%s/registry.bin", rc_write_dir ? rc_write_dir : ".");
    return fopen(path, mode);
}
static void reg_load(void) {
    static int done;
    if (done++) return;
    FILE *f = reg_file("rb");
    if (!f) return;
    if (fread(&nreg, sizeof nreg, 1, f) != 1 || nreg < 0 || nreg > 256 || fread(regv, sizeof regv[0], (size_t)nreg, f) != (size_t)nreg)
        nreg = 0;
    fclose(f);
}
static void reg_save(void) {
    FILE *f = reg_file("wb");
    if (!f) return;
    fwrite(&nreg, sizeof nreg, 1, f);
    fwrite(regv, sizeof regv[0], (size_t)nreg, f);
    fclose(f);
}
static char regkeys[64][256];   // open key handles: index -> path
static int nkeys;

static uint32_t key_open(uint32_t parent, const char *sub) {
    char path[256];
    const char *base = parent >= 0x80000000u ? (parent == 0x80000001u ? "HKCU" : parent == 0x80000002u ? "HKLM" : "HK?")
                       : (parent - 0x5000 < (uint32_t)nkeys ? regkeys[parent - 0x5000] : "?");
    snprintf(path, sizeof path, "%s\\%s", base, sub ? sub : "");
    for (int i = 0; i < nkeys; i++)
        if (!strcasecmp(regkeys[i], path)) return 0x5000 + i;
    if (nkeys == 64) return 0;
    snprintf(regkeys[nkeys], 256, "%s", path);
    return 0x5000 + nkeys++;
}
static RegVal *val_find(uint32_t k, const char *name) {
    reg_load();
    if (k - 0x5000 >= (uint32_t)nkeys) return NULL;
    for (int i = 0; i < nreg; i++)
        if (!strcasecmp(regv[i].key, regkeys[k - 0x5000]) && !strcasecmp(regv[i].name, name ? name : "")) return &regv[i];
    return NULL;
}
IMP(ADVAPI32, RegOpenKeyA) {
    uint32_t k = key_open(ARG(0), GS(ARG(1)));
    LOGV("RegOpenKeyA(%s)", regkeys[k - 0x5000]);
    WR32m(ARG(2), k);
    RET(3, 0);   // every key "exists"; values decide
}
IMP(ADVAPI32, RegCreateKeyExA) {
    uint32_t k = key_open(ARG(0), GS(ARG(1)));
    WR32m(ARG(7), k);
    if (ARG(8)) WR32m(ARG(8), 2);   // REG_OPENED_EXISTING_KEY
    RET(9, 0);
}
IMP(ADVAPI32, RegCloseKey) { RET(1, 0); }
IMP(ADVAPI32, RegQueryValueExA) {
    RegVal *v = val_find(ARG(0), GS(ARG(1)));
    LOGV("RegQueryValueExA(%s) -> %s", GS(ARG(1)) ? GS(ARG(1)) : "", v ? "found" : "absent");
    if (!v) RET(6, 2);   // ERROR_FILE_NOT_FOUND
    if (ARG(3)) WR32m(ARG(3), v->type);
    uint32_t cap = ARG(5) ? RD32m(ARG(5)) : 0;
    if (ARG(5)) WR32m(ARG(5), v->n);
    if (ARG(4)) {
        if (cap < v->n) RET(6, 234);   // ERROR_MORE_DATA
        memcpy(G(ARG(4)), v->data, v->n);
    }
    RET(6, 0);
}
IMP(ADVAPI32, RegSetValueExA) {
    RegVal *v = val_find(ARG(0), GS(ARG(1)));
    if (!v && nreg < 256 && ARG(0) - 0x5000 < (uint32_t)nkeys) {
        v = &regv[nreg++];
        snprintf(v->key, sizeof v->key, "%s", regkeys[ARG(0) - 0x5000]);
        snprintf(v->name, sizeof v->name, "%s", GS(ARG(1)) ? GS(ARG(1)) : "");
    }
    if (!v) RET(6, 1);
    v->type = ARG(3);
    v->n = ARG(5) < sizeof v->data ? ARG(5) : sizeof v->data;
    memcpy(v->data, G(ARG(4)), v->n);
    reg_save();
    RET(6, 0);
}

// ---------------------------------------------------------------- VERSION: no version resource for files
IMP(VERSION, GetFileVersionInfoSizeA) { LOGV("GetFileVersionInfoSizeA(%s)", GS(ARG(0))); if (ARG(1)) WR32m(ARG(1), 0); RET(2, 0); }
IMP(VERSION, GetFileVersionInfoA) { RET(4, 0); }
IMP(VERSION, VerQueryValueA) { RET(4, 0); }

// ---------------------------------------------------------------- SHELL32 / comdlg32
IMP(SHELL32, ShellExecuteA) { rc_log("ShellExecuteA(%s, %s): ignored", GS(ARG(1)) ? GS(ARG(1)) : "", GS(ARG(2)) ? GS(ARG(2)) : ""); RET(6, 2); }
IMP(COMDLG32, GetOpenFileNameA) { RET(1, 0); }
IMP(COMDLG32, GetSaveFileNameA) { RET(1, 0); }

// ---------------------------------------------------------------- ole32: COM classes are provided by rt/*.c via rc_com_create
RcComCreate rc_com_create;
IMP(OLE32, CoInitialize) { RET(1, 0); }
IMP(OLE32, CoUninitialize) { RET(0, 0); }
IMP(OLE32, CoCreateInstance) {
    const uint8_t *clsid = G(ARG(0));
    uint32_t r = rc_com_create ? rc_com_create(c, clsid, (const uint8_t *)G(ARG(3)), ARG(4)) : 0x80040154u;
    if (r) {
        rc_log("CoCreateInstance({%08x-%04x-...}) -> %08x", RD32m(ARG(0)), rc_rd16(rc_mem + ARG(0) + 4), r);
        WR32m(ARG(4), 0);
    }
    (void)clsid;
    RET(5, r);
}
IMP(OLE32, CreateStreamOnHGlobal) { rc_log("CreateStreamOnHGlobal: unsupported"); WR32m(ARG(2), 0); RET(3, 0x80004001u); }
IMP(OLEAUT32, ord418) { RET(1, 0); }

// ---------------------------------------------------------------- IMM32: no IME
IMP(IMM32, ImmGetContext) { RET(1, 0); }
IMP(IMM32, ImmReleaseContext) { RET(2, 1); }
IMP(IMM32, ImmGetCompositionStringA) { RET(4, 0); }
IMP(IMM32, ImmGetCandidateListA) { RET(4, 0); }
IMP(IMM32, ImmSetCandidateWindow) { RET(2, 1); }
IMP(IMM32, ImmSetCompositionWindow) { RET(2, 1); }

// ---------------------------------------------------------------- MSACM32: no codecs (DESIGN.md §7: audio needs none)
IMP(MSACM32, acmFormatSuggest) { RET(5, 0x200); }   // ACMERR_NOTPOSSIBLE
IMP(MSACM32, acmStreamOpen) { RET(8, 0x200); }
IMP(MSACM32, acmStreamClose) { RET(2, 0); }
IMP(MSACM32, acmStreamSize) { RET(4, 0x200); }
IMP(MSACM32, acmStreamPrepareHeader) { RET(3, 0x200); }
IMP(MSACM32, acmStreamUnprepareHeader) { RET(3, 0); }
IMP(MSACM32, acmStreamConvert) { RET(3, 0x200); }

// ---------------------------------------------------------------- MagicKey.dll (cdecl; dongle/pass code)
IMP(MAGICKEY, _GetDuelPassCode__YA_AW4MagicKeyStatusCode__PADI_Z) {
    // -1 = no USB Duel Pass key (ygoUsbKey.cpp: 0 would mean "buffer too small" and asserts, on the DUELPASS menu)
    rc_log("MagicKey GetDuelPassCode(%08x, %u): no key (-1)", ARG(0), ARG(1));
    if (ARG(0) && ARG(1)) WR8m(ARG(0), 0);
    RETC(0xffffffffu);
}

// ---------------------------------------------------------------- CRT srand (0xb0ab8d), overriding the recompiled one
// RC_SEED=<n>: every srand(seed) uses n instead, so a scripted run sees the same rand() sequence (the lobby spawn
// point is random; RC_INPUT clicks need it fixed). Otherwise exactly the original: ptd = _getptd(); ptd->holdrand = seed.
void f_00b0ec11(CPU *c);
void f_00b0ab8d(CPU *c) {
    RC_LOCALS;
    static int fixed = -1;
    static uint32_t seed;
    if (fixed < 0) {
        fixed = getenv("RC_SEED") != NULL;
        if (fixed) seed = (uint32_t)strtoul(getenv("RC_SEED"), NULL, 0);
    }
    PUSH(0xb0ab92u);
    f_00b0ec11(c);
    if (c->ret_to != 0xb0ab92u) return;
    WR32(c->eax + 0x14, fixed ? seed : RD32(c->esp + 4));
    c->ret_to = RD32(c->esp);
    c->esp += 4;
}
