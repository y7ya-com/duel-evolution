// KERNEL32 for the recompiled exe: only what yo2.exe imports. Unwritten imports fall back to the generated weak
// stubs, which log the name and stop.
#include <ctype.h>
#include <sched.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <time.h>
#include <unistd.h>

#include "rt.h"
#include "win.h"

// ---------------------------------------------------------------- handles
RcHandle rc_handles[RC_MAX_HANDLES];
static pthread_mutex_t hmu = PTHREAD_MUTEX_INITIALIZER;

uint32_t rc_handle_new(int type) {
    pthread_mutex_lock(&hmu);
    // a closed handle of a finished thread is reused only when nothing else is free: the exe waits on thread
    // handles its threads may already have closed (_endthread), and a stale handle should keep reading "finished"
    for (int pass = 0; pass < 2; pass++)
        for (int i = 8; i < RC_MAX_HANDLES; i++)
            if (!rc_handles[i].type || (pass && rc_handles[i].type == H_THREAD && rc_handles[i].closed &&
                                        __atomic_load_n(&rc_handles[i].signaled, __ATOMIC_SEQ_CST))) {
                memset(&rc_handles[i], 0, sizeof rc_handles[i]);
                rc_handles[i].type = type;
                pthread_mutex_unlock(&hmu);
                return RC_HANDLE(i);
            }
    pthread_mutex_unlock(&hmu);
    rc_log("out of handles");
    return 0;
}

RcHandle *rc_handle(uint32_t h) {
    uint32_t i = (h - 0x100) / 4;
    if (h < 0x100 || (h & 3) || i >= RC_MAX_HANDLES || !rc_handles[i].type) return NULL;
    return &rc_handles[i];
}

static void set_err(CPU *c, uint32_t e) { c->thread->last_error = e; }

// ---------------------------------------------------------------- paths
// Guest paths: drive letter + backslashes. Everything resolves inside the game folder (read-only) with writes going
// to an overlay folder; a file in the overlay shadows the game folder's copy.
const char *rc_game_dir, *rc_write_dir;

// The game folder is read-only, so its listings are cached (every open used to re-read each directory on its path:
// 17% of the deck editor's entry frame). The overlay changes under us and is scanned every time.
static struct DirList { char *dir; char **names; int n; } dir_cache[256];
static int dir_cache_n;
static pthread_mutex_t dir_cache_mu = PTHREAD_MUTEX_INITIALIZER;

static const struct DirList *game_listing(const char *dir) {
    for (int i = 0; i < dir_cache_n; i++)
        if (!strcmp(dir_cache[i].dir, dir)) return &dir_cache[i];
    if (dir_cache_n == (int)(sizeof dir_cache / sizeof *dir_cache)) return NULL;
    DIR *d = opendir(dir);
    if (!d) return NULL;
    struct DirList *l = &dir_cache[dir_cache_n];
    int cap = 0;
    l->n = 0, l->names = NULL;
    for (struct dirent *e; (e = readdir(d));) {
        if (l->n == cap) l->names = realloc(l->names, (cap = cap ? cap * 2 : 64) * sizeof *l->names);
        l->names[l->n++] = strdup(e->d_name);
    }
    closedir(d);
    l->dir = strdup(dir);
    dir_cache_n++;
    return l;
}

static int ci_find(const char *dir, const char *name, char *out, size_t n) {
    struct stat st;
    snprintf(out, n, "%s/%s", dir, name);
    if (!rc_nospeed && !lstat(out, &st)) return 1;   // exact name (or a case-insensitive file system's match)
    size_t gl = strlen(rc_game_dir);
    if (!rc_nospeed && !strncmp(dir, rc_game_dir, gl) && (!dir[gl] || dir[gl] == '/')) {
        pthread_mutex_lock(&dir_cache_mu);
        const struct DirList *l = game_listing(dir);
        int ok = 0;
        for (int i = 0; l && i < l->n && !ok; i++)
            if (!strcasecmp(l->names[i], name)) snprintf(out, n, "%s/%s", dir, l->names[i]), ok = 1;
        pthread_mutex_unlock(&dir_cache_mu);
        if (l) return ok;
    }
    DIR *d = opendir(dir);
    if (!d) return 0;
    struct dirent *e;
    int ok = 0;
    while ((e = readdir(d)))
        if (!strcasecmp(e->d_name, name)) {
            snprintf(out, n, "%s/%s", dir, e->d_name);
            ok = 1;
            break;
        }
    closedir(d);
    return ok;
}

// resolve case-insensitively below root; returns 1 if it exists. out gets the best path either way.
static int resolve_in(const char *root, const char *rel, char *out, size_t n) {
    char cur[1024], part[256];
    snprintf(cur, sizeof cur, "%s", root);
    const char *p = rel;
    int exists = 1;
    while (*p) {
        while (*p == '/') p++;
        if (!*p) break;
        size_t k = strcspn(p, "/");
        snprintf(part, sizeof part, "%.*s", (int)k, p);
        p += k;
        if (!strcmp(part, ".")) continue;
        char nxt[1024];
        if (exists && ci_find(cur, part, nxt, sizeof nxt)) {
            snprintf(cur, sizeof cur, "%s", nxt);
        } else {
            exists = 0;
            size_t l = strlen(cur);
            snprintf(cur + l, sizeof cur - l, "/%s", part);
        }
    }
    snprintf(out, n, "%s", cur);
    return exists;
}

static void guest_rel(const char *g, char *rel, size_t n) {
    char t[1024];
    snprintf(t, sizeof t, "%s", g);
    for (char *q = t; *q; q++)
        if (*q == '\\') *q = '/';
    const char *s = t;
    if (isalpha((unsigned char)s[0]) && s[1] == ':') s += 2;
    // the exe "lives" in C:/yo2 (GetModuleFileName); strip that prefix
    if (!strncasecmp(s, "/yo2/", 5)) s += 5;
    else if (!strcasecmp(s, "/yo2")) s += 4;
    while (*s == '/') s++;
    snprintf(rel, n, "%s", s);
}

// for reading: overlay first, then game dir. for writing: overlay (parent dirs created on demand).
int rc_host_path(const char *g, int write, char *out, size_t n) {
    char rel[1024];
    guest_rel(g, rel, sizeof rel);
    if (resolve_in(rc_write_dir, rel, out, n)) return 1;
    if (!write && resolve_in(rc_game_dir, rel, out, n)) return 1;
    if (write) {
        resolve_in(rc_write_dir, rel, out, n);
        char d[1024];
        snprintf(d, sizeof d, "%s", out);
        for (char *q = d + strlen(rc_write_dir) + 1; *q; q++)
            if (*q == '/') { *q = 0; mkdir(d, 0755); *q = '/'; }
        return 0;
    }
    resolve_in(rc_game_dir, rel, out, n);
    return 0;
}

// ---------------------------------------------------------------- process / module
#define MODNAME "C:\\yo2\\yo2.exe"
static uint32_t cmdline_a, env_a, env_w;

IMP(KERNEL32, GetVersion) { RET(0, 0x0a280105); }   // Windows XP SP-ish: 5.1 build 2600
IMP(KERNEL32, GetVersionExA) {
    uint32_t p = ARG(0);
    WR32m(p + 4, 5); WR32m(p + 8, 1); WR32m(p + 12, 2600); WR32m(p + 16, 2);
    strcpy(GS(p + 20), "Service Pack 3");
    RET(1, 1);
}
IMP(KERNEL32, GetCommandLineA) { RET(0, cmdline_a); }
IMP(KERNEL32, GetModuleHandleA) { RET(1, ARG(0) ? 0 : rc_image_base); }
IMP(KERNEL32, GetModuleFileNameA) {
    uint32_t buf = ARG(1), n = ARG(2);
    snprintf(GS(buf), n, "%s", MODNAME);
    RET(3, strlen(GS(buf)));
}
IMP(KERNEL32, GetStartupInfoA) {
    uint32_t p = ARG(0);
    memset(G(p), 0, 68);
    WR32m(p, 68);
    RET(1, 0);
}
IMP(KERNEL32, GetStdHandle) { RET(1, 0x10); }   // stdout/stderr/stdin all -> host stderr (see fd_of)
IMP(KERNEL32, GetFileType) { RET(1, ARG(0) == 0x10 ? 2 : 1); }
IMP(KERNEL32, SetHandleCount) { RET(1, ARG(0)); }
IMP(KERNEL32, SetStdHandle) { RET(2, 1); }
IMP(KERNEL32, GetCurrentProcess) { RET(0, 0xffffffffu); }
IMP(KERNEL32, GetCurrentThread) { RET(0, 0xfffffffeu); }
IMP(KERNEL32, GetCurrentThreadId) { RET(0, c->thread->id); }
IMP(KERNEL32, GetLastError) { RET(0, c->thread->last_error); }
IMP(KERNEL32, SetLastError) { c->thread->last_error = ARG(0); RET(1, 0); }
IMP(KERNEL32, GetACP) { RET(0, 932); }
IMP(KERNEL32, GetOEMCP) { RET(0, 932); }
IMP(KERNEL32, IsValidCodePage) { RET(1, ARG(0) == 932 || ARG(0) == 1252 || ARG(0) == 65001); }
IMP(KERNEL32, GetUserDefaultLCID) { RET(0, 0x411); }
IMP(KERNEL32, GetSystemDefaultLangID) { RET(0, 0x411); }
IMP(KERNEL32, IsValidLocale) { RET(2, 1); }
IMP(KERNEL32, IsProcessorFeaturePresent) { RET(1, 0); }   // no MMX/SSE/3DNow!: x87 paths everywhere
IMP(KERNEL32, SetUnhandledExceptionFilter) { RET(1, 0); }
IMP(KERNEL32, UnhandledExceptionFilter) { RET(1, 0); }
IMP(KERNEL32, SetConsoleCtrlHandler) { RET(2, 1); }
IMP(KERNEL32, OutputDebugStringA) { if (rc_verbose) rc_log("ODS: %s", GS(ARG(0))); RET(1, 0); }
IMP(KERNEL32, IsBadReadPtr) { RET(2, ARG(0) == 0); }
IMP(KERNEL32, IsBadWritePtr) { RET(2, ARG(0) == 0); }
IMP(KERNEL32, IsBadCodePtr) { RET(1, ARG(0) == 0); }
IMP(KERNEL32, ExitProcess) {
    rc_log("ExitProcess(%u)", ARG(0));
    fflush(stdout);
    _exit((int)ARG(0));
}
IMP(KERNEL32, TerminateProcess) {
    rc_log("TerminateProcess(%u)", ARG(1));
    _exit((int)ARG(1));
}
IMP(KERNEL32, FatalAppExitA) { rc_log("FatalAppExit: %s", GS(ARG(1))); _exit(3); }

IMP(KERNEL32, GetEnvironmentStrings) { RET(0, env_a); }
IMP(KERNEL32, GetEnvironmentStringsW) { RET(0, env_w); }
IMP(KERNEL32, FreeEnvironmentStringsA) { RET(1, 1); }
IMP(KERNEL32, FreeEnvironmentStringsW) { RET(1, 1); }
IMP(KERNEL32, GetEnvironmentVariableA) { set_err(c, 203); RET(3, 0); }
IMP(KERNEL32, SetEnvironmentVariableA) { RET(2, 1); }

// ---------------------------------------------------------------- memory
IMP(KERNEL32, HeapCreate) { RET(3, 0x00150000); }   // one process heap: every heap shares the guest allocator
IMP(KERNEL32, HeapDestroy) { RET(1, 1); }
IMP(KERNEL32, HeapAlloc) { RET(3, rc_halloc(ARG(2), ARG(1) & 8)); }
IMP(KERNEL32, HeapFree) { rc_hfree(ARG(2)); RET(3, 1); }
IMP(KERNEL32, HeapReAlloc) {
    // HEAP_REALLOC_IN_PLACE_ONLY (_expand): fail rather than move, the caller keeps using the old pointer
    if ((ARG(1) & 0x10) && rc_hrealloc_fits(ARG(2), ARG(3)) == 0) RET(4, 0);
    RET(4, rc_hrealloc(ARG(2), ARG(3), ARG(1) & 8));
}
IMP(KERNEL32, HeapSize) { RET(3, rc_hsize(ARG(2))); }
IMP(KERNEL32, VirtualAlloc) {
    uint32_t a = ARG(0), n = ARG(1), type = ARG(2);
    if (a && rc_vsize(a & ~0xffffu)) RET(4, a);   // commit inside a reservation: already backed
    if (a && !(type & 0x2000)) RET(4, a);
    RET(4, rc_valloc(n));
}
IMP(KERNEL32, VirtualFree) {
    if (ARG(2) & 0x8000) rc_vfree(ARG(0));   // MEM_RELEASE; decommit is a no-op
    RET(3, 1);
}
IMP(KERNEL32, GlobalAlloc) { RET(2, rc_halloc(ARG(1) ? ARG(1) : 1, ARG(0) & 0x40)); }   // fixed memory: handle = pointer
IMP(KERNEL32, GlobalReAlloc) { RET(3, rc_hrealloc(ARG(0), ARG(1), ARG(2) & 0x40)); }
IMP(KERNEL32, GlobalFree) { rc_hfree(ARG(0)); RET(1, 0); }
IMP(KERNEL32, GlobalLock) { RET(1, ARG(0)); }
IMP(KERNEL32, GlobalUnlock) { RET(1, 1); }
IMP(KERNEL32, GlobalSize) { RET(1, rc_hsize(ARG(0))); }
IMP(KERNEL32, LocalFree) { rc_hfree(ARG(0)); RET(1, 0); }
IMP(KERNEL32, LocalLock) { RET(1, ARG(0)); }
IMP(KERNEL32, LocalUnlock) { RET(1, 1); }

// ---------------------------------------------------------------- TLS / interlocked / critical sections
static uint64_t tls_used;
IMP(KERNEL32, TlsAlloc) {
    for (int i = 0; i < 64; i++)
        if (!(tls_used & (1ull << i))) { tls_used |= 1ull << i; RET(0, i); }
    RET(0, 0xffffffffu);
}
IMP(KERNEL32, TlsFree) { if (ARG(0) < 64) tls_used &= ~(1ull << ARG(0)); RET(1, ARG(0) < 64); }
IMP(KERNEL32, TlsGetValue) { set_err(c, 0); RET(1, ARG(0) < 64 ? c->thread->tls[ARG(0)] : 0); }
IMP(KERNEL32, TlsSetValue) { if (ARG(0) < 64) c->thread->tls[ARG(0)] = ARG(1); RET(2, ARG(0) < 64); }
IMP(KERNEL32, InterlockedIncrement) { RET(1, __atomic_add_fetch((uint32_t *)G(ARG(0)), 1, __ATOMIC_SEQ_CST)); }
IMP(KERNEL32, InterlockedDecrement) { RET(1, __atomic_sub_fetch((uint32_t *)G(ARG(0)), 1, __ATOMIC_SEQ_CST)); }
IMP(KERNEL32, InterlockedExchange) { RET(2, __atomic_exchange_n((uint32_t *)G(ARG(0)), ARG(1), __ATOMIC_SEQ_CST)); }

// CRITICAL_SECTION (24 bytes): +0 holds our mutex index + 1 (guest code never looks inside)
#define MAX_CS 4096
static pthread_mutex_t cs_mu[MAX_CS];
static uint32_t cs_n, cs_free[MAX_CS], cs_nfree;   // DeleteCriticalSection returns its slot (game objects own CSs)
static pthread_mutex_t cs_alloc = PTHREAD_MUTEX_INITIALIZER;
static pthread_mutex_t *cs_get(uint32_t p) {
    uint32_t k = RD32m(p);
    if (!k || k > MAX_CS) {   // used without InitializeCriticalSection (or zeroed): make one
        pthread_mutex_lock(&cs_alloc);
        k = RD32m(p);
        if (!k || k > MAX_CS) {
            if (cs_nfree) k = cs_free[--cs_nfree];
            else {
                if (cs_n == MAX_CS) rc_trap(NULL, 0, "out of critical sections");
                pthread_mutexattr_t at;
                pthread_mutexattr_init(&at);
                pthread_mutexattr_settype(&at, PTHREAD_MUTEX_RECURSIVE);
                pthread_mutex_init(&cs_mu[cs_n], &at);
                k = ++cs_n;
            }
            WR32m(p, k);
        }
        pthread_mutex_unlock(&cs_alloc);
    }
    return &cs_mu[k - 1];
}
IMP(KERNEL32, InitializeCriticalSection) { memset(G(ARG(0)), 0, 24); cs_get(ARG(0)); RET(1, 0); }
IMP(KERNEL32, DeleteCriticalSection) {
    pthread_mutex_lock(&cs_alloc);
    uint32_t k = RD32m(ARG(0));
    if (k && k <= cs_n) { cs_free[cs_nfree++] = k; WR32m(ARG(0), 0); }
    pthread_mutex_unlock(&cs_alloc);
    RET(1, 0);
}
IMP(KERNEL32, EnterCriticalSection) { pthread_mutex_lock(cs_get(ARG(0))); RET(1, 0); }
IMP(KERNEL32, LeaveCriticalSection) { pthread_mutex_unlock(cs_get(ARG(0))); RET(1, 0); }

// ---------------------------------------------------------------- time
IMP(KERNEL32, GetTickCount) { RET(0, rc_ticks_ms()); }
IMP(KERNEL32, QueryPerformanceFrequency) { WR32m(ARG(0), 1000000); WR32m(ARG(0) + 4, 0); RET(1, 1); }
#ifdef __EMSCRIPTEN__
void rc_web_sleep(uint32_t ms);
IMP(KERNEL32, Sleep) {   // as below, but a real wait yields to the browser
    if (rc_fastforward && rc_is_main_thread(c)) rc_ff_main_sleep(ARG(0));
    else if (rc_fastforward && ARG(0)) { rc_thread_busy(-1); rc_vwait(ARG(0)); rc_thread_busy(1); }
    else rc_web_sleep(ARG(0) ? (ARG(0) + rc_timescale - 1) / rc_timescale : 0);
    RET(1, 0);
}
#else
IMP(KERNEL32, Sleep) {
    if (!rc_fastforward) usleep((useconds_t)rc_real_us(ARG(0)));
    else if (rc_is_main_thread(c)) rc_ff_main_sleep(ARG(0));   // the frame pacing: no wait, time jumps
    else if (ARG(0)) { rc_thread_busy(-1); rc_vwait(ARG(0)); rc_thread_busy(1); }
    else sched_yield();
    RET(1, 0);
}
#endif

static uint64_t wall_us(void) {   // the wall clock, advancing at the guest's rate (RC_TIMESCALE) from the real start time
    static uint64_t w0, m0;
    if (!w0) {
        struct timeval tv;
        gettimeofday(&tv, NULL);
        m0 = rc_now_us();
        w0 = (uint64_t)tv.tv_sec * 1000000 + (uint64_t)tv.tv_usec;
    }
    return w0 + (rc_now_us() - m0);
}
static void filetime_now(uint32_t p) {
    uint64_t ft = (wall_us() + 11644473600000000ull) * 10;
    WR32m(p, (uint32_t)ft);
    WR32m(p + 4, (uint32_t)(ft >> 32));
}
static void systemtime(uint32_t p, int local) {
    time_t t = (time_t)(wall_us() / 1000000);
    struct tm tm;
    if (local) localtime_r(&t, &tm);
    else gmtime_r(&t, &tm);
    uint16_t v[8] = {(uint16_t)(tm.tm_year + 1900), (uint16_t)(tm.tm_mon + 1), (uint16_t)tm.tm_wday,
                     (uint16_t)tm.tm_mday, (uint16_t)tm.tm_hour, (uint16_t)tm.tm_min, (uint16_t)tm.tm_sec, 0};
    memcpy(G(p), v, 16);
}
IMP(KERNEL32, GetSystemTimeAsFileTime) { filetime_now(ARG(0)); RET(1, 0); }
IMP(KERNEL32, GetSystemTime) { systemtime(ARG(0), 0); RET(1, 0); }
IMP(KERNEL32, GetLocalTime) { systemtime(ARG(0), 1); RET(1, 0); }
IMP(KERNEL32, GetTimeZoneInformation) { memset(G(ARG(0)), 0, 172); WR32m(ARG(0), (uint32_t)-540); RET(1, 0); }  // JST

// ---------------------------------------------------------------- strings / locale
IMP(KERNEL32, lstrlenA) { RET(1, ARG(0) ? strlen(GS(ARG(0))) : 0); }
IMP(KERNEL32, lstrcpyA) { strcpy(GS(ARG(0)), GS(ARG(1))); RET(2, ARG(0)); }
IMP(KERNEL32, lstrcatA) { strcat(GS(ARG(0)), GS(ARG(1))); RET(2, ARG(0)); }
IMP(KERNEL32, lstrcmpA) { RET(2, (uint32_t)strcmp(GS(ARG(0)), GS(ARG(1)))); }
IMP(KERNEL32, lstrcpynA) {
    uint32_t n = ARG(2);
    if (n) { strncpy(GS(ARG(0)), GS(ARG(1)), n - 1); GS(ARG(0))[n - 1] = 0; }
    RET(3, ARG(0));
}
IMP(KERNEL32, GetCPInfo) {
    uint32_t p = ARG(1);
    memset(G(p), 0, 20);
    WR32m(p, ARG(0) == 932 ? 2 : 1);
    WR8m(p + 4, '?');
    if (ARG(0) == 932) {   // Shift-JIS lead-byte ranges
        uint8_t lb[] = {0x81, 0x9f, 0xe0, 0xfc};
        memcpy(G(p + 6), lb, 4);
    }
    RET(2, 1);
}
IMP(KERNEL32, MultiByteToWideChar) {
    uint32_t src = ARG(2), wdst = ARG(4), wn = ARG(5);
    int32_t n = (int32_t)ARG(3);
    uint32_t len = n < 0 ? strlen(GS(src)) + 1 : (uint32_t)n;
    uint32_t out = rc_sjis_to_utf16(GS(src), len, wdst ? (uint16_t *)G(wdst) : NULL, wn);
    RET(6, out);
}
IMP(KERNEL32, WideCharToMultiByte) {
    uint32_t src = ARG(2), dst = ARG(4), dn = ARG(5);
    int32_t n = (int32_t)ARG(3);
    uint32_t len = n;
    if (n < 0) { len = 0; while (((uint16_t *)G(src))[len]) len++; len++; }
    RET(8, rc_utf16_to_sjis((uint16_t *)G(src), len, dst ? GS(dst) : NULL, dn));
}
IMP(KERNEL32, GetStringTypeA) {   // CT_CTYPE1 for single bytes
    uint32_t src = ARG(2), n = ARG(3), out = ARG(4);
    if ((int32_t)n < 0) n = strlen(GS(src)) + 1;
    for (uint32_t i = 0; i < n; i++) {
        unsigned ch = (uint8_t)GS(src)[i];
        uint16_t t = 0;
        if (ch < 128) {
            if (isupper(ch)) t |= 1; if (islower(ch)) t |= 2; if (isdigit(ch)) t |= 4; if (isspace(ch)) t |= 8;
            if (ispunct(ch)) t |= 0x10; if (iscntrl(ch)) t |= 0x20; if (ch == ' ' || ch == '\t') t |= 0x40;
            if (isxdigit(ch)) t |= 0x80; if (isalpha(ch)) t |= 0x100;
        }
        rc_wr16(rc_mem + out + 2 * i, t);
    }
    RET(5, 1);
}
IMP(KERNEL32, GetStringTypeW) {
    uint32_t src = ARG(1), n = ARG(2), out = ARG(3);
    if ((int32_t)n < 0) { n = 0; while (((uint16_t *)G(src))[n]) n++; n++; }
    for (uint32_t i = 0; i < n; i++) {
        unsigned ch = rc_rd16(rc_mem + src + 2 * i);
        uint16_t t = 0;
        if (ch < 128) {
            if (isupper(ch)) t |= 1; if (islower(ch)) t |= 2; if (isdigit(ch)) t |= 4; if (isspace(ch)) t |= 8;
            if (ispunct(ch)) t |= 0x10; if (iscntrl(ch)) t |= 0x20; if (ch == ' ' || ch == '\t') t |= 0x40;
            if (isxdigit(ch)) t |= 0x80; if (isalpha(ch)) t |= 0x100;
        } else t = 0x100;
        rc_wr16(rc_mem + out + 2 * i, t);
    }
    RET(4, 1);
}
IMP(KERNEL32, LCMapStringA) {   // LCMAP_LOWERCASE / UPPERCASE on ASCII; anything else: copy
    uint32_t fl = ARG(1), src = ARG(2), dst = ARG(4), dn = ARG(5);
    int32_t n = (int32_t)ARG(3);
    uint32_t len = n < 0 ? strlen(GS(src)) + 1 : (uint32_t)n;
    if (!dn) RET(6, len);
    for (uint32_t i = 0; i < len && i < dn; i++) {
        char ch = GS(src)[i];
        GS(dst)[i] = (fl & 0x100) ? tolower(ch) : (fl & 0x200) ? toupper(ch) : ch;
    }
    RET(6, len);
}
IMP(KERNEL32, LCMapStringW) {
    uint32_t fl = ARG(1), src = ARG(2), dst = ARG(4), dn = ARG(5);
    int32_t n = (int32_t)ARG(3);
    uint32_t len = (uint32_t)n;
    if (n < 0) { len = 0; while (rc_rd16(rc_mem + src + 2 * len)) len++; len++; }
    if (!dn) RET(6, len);
    for (uint32_t i = 0; i < len && i < dn; i++) {
        uint16_t ch = rc_rd16(rc_mem + src + 2 * i);
        if (ch < 128) ch = (fl & 0x100) ? tolower(ch) : (fl & 0x200) ? toupper(ch) : ch;
        rc_wr16(rc_mem + dst + 2 * i, ch);
    }
    RET(6, len);
}
IMP(KERNEL32, CompareStringA) {
    int32_t n1 = ARG(3), n2 = ARG(5);
    const char *a = GS(ARG(2)), *b = GS(ARG(4));
    size_t l1 = n1 < 0 ? strlen(a) : (size_t)n1, l2 = n2 < 0 ? strlen(b) : (size_t)n2;
    int r = (ARG(1) & 1) ? strncasecmp(a, b, l1 < l2 ? l1 : l2) : memcmp(a, b, l1 < l2 ? l1 : l2);
    if (!r) r = (l1 > l2) - (l1 < l2);
    RET(6, r < 0 ? 1 : r > 0 ? 3 : 2);
}
IMP(KERNEL32, CompareStringW) {
    int32_t n1 = ARG(3), n2 = ARG(5);
    uint32_t a = ARG(2), b = ARG(4);
    uint32_t l1 = n1, l2 = n2;
    if (n1 < 0) { l1 = 0; while (rc_rd16(rc_mem + a + 2 * l1)) l1++; }
    if (n2 < 0) { l2 = 0; while (rc_rd16(rc_mem + b + 2 * l2)) l2++; }
    int r = 0;
    for (uint32_t i = 0; !r && i < l1 && i < l2; i++) {
        uint16_t x = rc_rd16(rc_mem + a + 2 * i), y = rc_rd16(rc_mem + b + 2 * i);
        if (ARG(1) & 1) { if (x < 128) x = tolower(x); if (y < 128) y = tolower(y); }
        r = (x > y) - (x < y);
    }
    if (!r) r = (l1 > l2) - (l1 < l2);
    RET(6, r < 0 ? 1 : r > 0 ? 3 : 2);
}
IMP(KERNEL32, GetLocaleInfoA) {
    uint32_t t = ARG(1) & 0xffff, buf = ARG(2), n = ARG(3);
    const char *v = t == 0x1004 ? "932" : t == 0xb ? "932" : t == 0x14 ? "\\" : t == 0xf ? "," : t == 0xe ? "." :
                    t == 0x3 ? "JPN" : t == 0x7 ? "JPN" : "0";
    if (!n) RET(4, strlen(v) + 1);
    snprintf(GS(buf), n, "%s", v);
    RET(4, strlen(GS(buf)) + 1);
}
IMP(KERNEL32, GetLocaleInfoW) {
    uint32_t t = ARG(1) & 0xffff, buf = ARG(2), n = ARG(3);
    const char *v = t == 0x1004 ? "932" : t == 0xb ? "932" : "0";
    if (!n) RET(4, strlen(v) + 1);
    uint32_t i = 0;
    for (; v[i] && i + 1 < n; i++) rc_wr16(rc_mem + buf + 2 * i, v[i]);
    rc_wr16(rc_mem + buf + 2 * i, 0);
    RET(4, i + 1);
}
IMP(KERNEL32, MulDiv) {
    int64_t r = (int64_t)(int32_t)ARG(0) * (int32_t)ARG(1);
    int32_t d = (int32_t)ARG(2);
    RET(3, d ? (uint32_t)(int32_t)((r + (r < 0 ? -d / 2 : d / 2)) / d) : 0xffffffffu);
}

// ---------------------------------------------------------------- init
void rc_k32_init(CPU *c, const char *cmdline) {
    char buf[1024];
    snprintf(buf, sizeof buf, "\"%s\" %s", MODNAME, cmdline ? cmdline : "");
    cmdline_a = rc_halloc(strlen(buf) + 1, 1);
    strcpy(GS(cmdline_a), buf);
    const char envs[] = "OS=Windows_NT\0PATH=C:\\WINDOWS\\system32;C:\\WINDOWS\0WINDIR=C:\\WINDOWS\0\0";
    env_a = rc_halloc(sizeof envs, 1);
    memcpy(G(env_a), envs, sizeof envs);
    env_w = rc_halloc(sizeof envs * 2, 1);
    for (size_t i = 0; i < sizeof envs; i++) rc_wr16(rc_mem + env_w + 2 * i, (uint8_t)envs[i]);
    (void)c;
}
