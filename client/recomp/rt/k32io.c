// KERNEL32 files, directories, sync objects, threads, modules.
#include <ctype.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <fnmatch.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <time.h>
#include <unistd.h>

#include "win.h"
#ifdef __EMSCRIPTEN__
#include <emscripten/threading.h>
void rc_web_sleep(uint32_t ms);
#endif

pthread_mutex_t rc_sync_mu = PTHREAD_MUTEX_INITIALIZER;
pthread_cond_t rc_sync_cv = PTHREAD_COND_INITIALIZER;

static void err(CPU *c, uint32_t e) { c->thread->last_error = e; }
static uint32_t win_err(int e) { return e == ENOENT ? 2 : e == EACCES ? 5 : e == EEXIST ? 183 : 31; }

uint32_t rc_ticks_ms(void) { return (uint32_t)(rc_now_us() / 1000); }
IMP(KERNEL32, QueryPerformanceCounter) {
    uint64_t us = rc_now_us();
    WR32m(ARG(0), (uint32_t)us);
    WR32m(ARG(0) + 4, (uint32_t)(us >> 32));
    RET(1, 1);
}

// ---------------------------------------------------------------- files
IMP(KERNEL32, CreateFileA) {
    const char *g = GS(ARG(0));
    uint32_t access = ARG(1), disp = ARG(4);
    char p[1024];
    int wr = (access & 0x40000000u) != 0;
    int exists = rc_host_path(g, 0, p, sizeof p);
    if (wr) {
        char w[1024];
        int in_overlay = rc_host_path(g, 1, w, sizeof w);
        if (!in_overlay && exists && disp != 2 /*CREATE_ALWAYS*/) {   // copy-on-write from the game folder
            int s = open(p, O_RDONLY), d = open(w, O_WRONLY | O_CREAT | O_TRUNC, 0644);
            char buf[65536];
            ssize_t k;
            while (s >= 0 && d >= 0 && (k = read(s, buf, sizeof buf)) > 0) (void)!write(d, buf, k);
            if (s >= 0) close(s);
            if (d >= 0) close(d);
        }
        snprintf(p, sizeof p, "%s", w);
        exists = in_overlay || exists;
    }
    int fl = wr ? ((access & 0x80000000u) ? O_RDWR : O_WRONLY) : O_RDONLY;
    switch (disp) {
    case 1: if (exists) { err(c, 80); RET(7, 0xffffffffu); } fl |= O_CREAT; break;   // CREATE_NEW
    case 2: fl |= O_CREAT | O_TRUNC; break;                                            // CREATE_ALWAYS
    case 3: break;                                                                     // OPEN_EXISTING
    case 4: fl |= O_CREAT; break;                                                      // OPEN_ALWAYS
    case 5: fl |= O_TRUNC; break;                                                      // TRUNCATE_EXISTING
    }
    struct stat st;
    if (!stat(p, &st) && S_ISDIR(st.st_mode)) { err(c, 5); RET(7, 0xffffffffu); }
    int fd = open(p, fl, 0644);
    if (rc_verbose) rc_log("CreateFileA(%s) -> %s fd=%d", g, p, fd);
    if (fd < 0) { err(c, win_err(errno)); RET(7, 0xffffffffu); }
    uint32_t h = rc_handle_new(H_FILE);
    rc_handle(h)->fd = fd;
    err(c, (disp == 2 || disp == 4) && exists ? 183 : 0);
    RET(7, h);
}
IMP(KERNEL32, CreateFileW) {
    char a[1024];
    uint32_t n = 0, s = ARG(0);
    while (rc_rd16(rc_mem + s + 2 * n) && n < 1000) n++;
    n = rc_utf16_to_sjis((uint16_t *)G(s), n, a, sizeof a - 1);
    a[n] = 0;
    uint32_t tmp = rc_halloc(n + 1, 0);
    strcpy(GS(tmp), a);
    WR32m(c->esp + 4, tmp);
    imp_KERNEL32_CreateFileA(c);
    rc_hfree(tmp);
}
static int fd_of(uint32_t h) {
    RcHandle *r = rc_handle(h);
    return r && (r->type == H_FILE || r->type == H_MAPPING) ? r->fd : (h == 0x10 ? 2 : -1);
}
// RC_IOLAT=<ms> (measurement): emulate the web build's lazy archive. The first read touching each 1 MB chunk of a big
// file (merge.dat, Sound.dat: >= 64 MB) waits <ms>, like lazyfs's synchronous Range request on a cache miss.
// RC_IORESIDENT=<hex offset>+<hex length>,... marks spans of the biggest file as already cached (a prefetch).
static void io_latency(int fd, uint32_t len) {
    static int ms = -1;
    static struct { ino_t ino; uint8_t seen[1024]; } files[4];
    static pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;
    static int trace = -1;   // RC_IOTRACE=1: every read of a big file (frame, offset, length), for web/lazyfs replays
    if (ms < 0) ms = getenv("RC_IOLAT") ? atoi(getenv("RC_IOLAT")) : 0, trace = getenv("RC_IOTRACE") != NULL;
    struct stat st;
    if ((!ms && !trace) || fstat(fd, &st) || st.st_size < (64 << 20) || st.st_size > (1024ll << 20)) return;
    off_t pos = lseek(fd, 0, SEEK_CUR);
    if (trace) {
        extern int rc_frame_no;
        rc_log("iotrace %d %lld %llx %x", rc_frame_no, (long long)st.st_size, (unsigned long long)pos, len);
        if (!ms) return;
    }
    pthread_mutex_lock(&mu);
    int f = 0;
    while (f < 4 && files[f].ino && files[f].ino != st.st_ino) f++;
    if (f == 4) { pthread_mutex_unlock(&mu); return; }
    if (!files[f].ino) {
        files[f].ino = st.st_ino;
        const char *r = getenv("RC_IORESIDENT");
        if (st.st_size > (512 << 20))   // the archive (merge.dat)
            for (; r && *r;) {
                unsigned long long o = strtoull(r, (char **)&r, 16), n = *r == '+' ? strtoull(r + 1, (char **)&r, 16) : 0;
                for (unsigned long long q = o >> 20; q <= (o + n) >> 20 && q < 1024; q++) files[f].seen[q] = 1;
                if (*r == ',') r++; else break;
            }
    }
    int miss = 0;
    for (off_t q = pos >> 20; q <= (pos + (off_t)len) >> 20 && q < 1024; q++)
        if (!files[f].seen[q]) files[f].seen[q] = 1, miss++;
    pthread_mutex_unlock(&mu);
    if (miss) {
        extern int rc_frame_no;
        rc_log("iolat: frame %d, %d chunk(s) at %llx+%x, %d ms", rc_frame_no, miss, (unsigned long long)pos, len, ms * miss);
        usleep((useconds_t)ms * 1000u * miss);
    }
}
IMP(KERNEL32, ReadFile) {
    int fd = fd_of(ARG(0));
    if (fd >= 0) io_latency(fd, ARG(2));
    ssize_t k = fd >= 0 ? read(fd, G(ARG(1)), ARG(2)) : -1;
    if (ARG(3)) WR32m(ARG(3), k > 0 ? (uint32_t)k : 0);
    if (k < 0) { err(c, 6); RET(5, 0); }
    RET(5, 1);
}
IMP(KERNEL32, WriteFile) {
    int fd = fd_of(ARG(0));
    ssize_t k = fd >= 0 ? write(fd, G(ARG(1)), ARG(2)) : -1;
    if (ARG(3)) WR32m(ARG(3), k > 0 ? (uint32_t)k : 0);
    if (k < 0) { err(c, 6); RET(5, 0); }
    RET(5, 1);
}
IMP(KERNEL32, SetFilePointer) {
    int fd = fd_of(ARG(0));
    int64_t d = (int32_t)ARG(1);
    if (ARG(2)) d = (int64_t)((uint64_t)RD32m(ARG(2)) << 32 | (uint32_t)ARG(1));
    off_t r = lseek(fd, d, ARG(3) == 0 ? SEEK_SET : ARG(3) == 1 ? SEEK_CUR : SEEK_END);
    if (r < 0) { err(c, 131); RET(4, 0xffffffffu); }
    if (ARG(2)) WR32m(ARG(2), (uint32_t)((uint64_t)r >> 32));
    err(c, 0);
    RET(4, (uint32_t)r);
}
IMP(KERNEL32, GetFileSize) {
    struct stat st;
    if (fstat(fd_of(ARG(0)), &st)) RET(2, 0xffffffffu);
    if (ARG(1)) WR32m(ARG(1), (uint32_t)((uint64_t)st.st_size >> 32));
    RET(2, (uint32_t)st.st_size);
}
IMP(KERNEL32, SetEndOfFile) {
    int fd = fd_of(ARG(0));
    RET(1, ftruncate(fd, lseek(fd, 0, SEEK_CUR)) == 0);
}
IMP(KERNEL32, FlushFileBuffers) { RET(1, 1); }
IMP(KERNEL32, SetFileTime) { RET(4, 1); }
IMP(KERNEL32, CloseHandle) {
    RcHandle *r = rc_handle(ARG(0));
    if (!r) RET(1, ARG(0) == 0x10);
    if (r->type == H_FILE || r->type == H_MAPPING) close(r->fd);
    if (r->type == H_FIND && r->dir) closedir(r->dir);
    if (r->type != H_THREAD) r->type = H_FREE;   // thread handles stay waitable after exit (rc_handle_new)
    else r->closed = 1;
    RET(1, 1);
}
IMP(KERNEL32, DeleteFileA) {
    char p[1024];
    if (!rc_host_path(GS(ARG(0)), 1, p, sizeof p)) { err(c, 2); RET(1, 0); }
    RET(1, unlink(p) == 0);
}
IMP(KERNEL32, MoveFileA) {
    char a[1024], b[1024];
    rc_host_path(GS(ARG(0)), 1, a, sizeof a);
    rc_host_path(GS(ARG(1)), 1, b, sizeof b);
    RET(2, rename(a, b) == 0);
}
IMP(KERNEL32, CopyFileA) {
    char a[1024], b[1024];
    rc_host_path(GS(ARG(0)), 0, a, sizeof a);
    int ex = rc_host_path(GS(ARG(1)), 1, b, sizeof b);
    if (ex && ARG(2)) RET(3, 0);
    int s = open(a, O_RDONLY), d = s < 0 ? -1 : open(b, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    char buf[65536];
    ssize_t k;
    while (d >= 0 && (k = read(s, buf, sizeof buf)) > 0) (void)!write(d, buf, k);
    if (s >= 0) close(s);
    if (d >= 0) close(d);
    RET(3, d >= 0);
}
IMP(KERNEL32, CreateDirectoryA) {
    char p[1024];
    if (rc_host_path(GS(ARG(0)), 1, p, sizeof p)) { err(c, 183); RET(2, 0); }
    RET(2, mkdir(p, 0755) == 0);
}
IMP(KERNEL32, GetFileAttributesA) {
    char p[1024];
    struct stat st;
    if (!rc_host_path(GS(ARG(0)), 0, p, sizeof p) || stat(p, &st)) { err(c, 2); RET(1, 0xffffffffu); }
    RET(1, S_ISDIR(st.st_mode) ? 0x10 : 0x80);
}
IMP(KERNEL32, GetDriveTypeA) { RET(1, 3); }
IMP(KERNEL32, GetDiskFreeSpaceExA) {
    for (int i = 1; i <= 3; i++)
        if (ARG(i)) { WR32m(ARG(i), 0); WR32m(ARG(i) + 4, 16); }   // 64 GB
    RET(4, 1);
}
IMP(KERNEL32, GetCurrentDirectoryA) {
    snprintf(GS(ARG(1)), ARG(0), "C:\\yo2");
    RET(2, 6);
}
IMP(KERNEL32, SetCurrentDirectoryA) { RET(1, 1); }
IMP(KERNEL32, GetWindowsDirectoryA) { snprintf(GS(ARG(0)), ARG(1), "C:\\WINDOWS"); RET(2, 10); }
IMP(KERNEL32, GetTempPathA) { snprintf(GS(ARG(1)), ARG(0), "C:\\yo2\\tmp\\"); RET(2, 11); }
IMP(KERNEL32, GetTempFileNameA) {
    static unsigned n;
    sprintf(GS(ARG(3)), "%s\\%.3s%04X.tmp", GS(ARG(0)), GS(ARG(1)), ++n & 0xffff);
    RET(4, n);
}
IMP(KERNEL32, GetFullPathNameA) {
    const char *s = GS(ARG(0));
    char out[1024];
    if ((s[0] && s[1] == ':') || s[0] == '\\') snprintf(out, sizeof out, "%s", s);
    else snprintf(out, sizeof out, "C:\\yo2\\%s", s);
    snprintf(GS(ARG(2)), ARG(1), "%s", out);
    if (ARG(3)) {
        char *last = strrchr(GS(ARG(2)), '\\');
        WR32m(ARG(3), last ? ARG(2) + (uint32_t)(last + 1 - GS(ARG(2))) : 0);
    }
    RET(4, strlen(out));
}

// find: WIN32_FIND_DATAA = attrs(4) 3*FILETIME(24) sizeHigh sizeLow res0 res1 (16) name[260] alt[14]
static int find_next(RcHandle *r, uint32_t out) {
    struct dirent *e;
    while (r->dir && (e = readdir(r->dir))) {
        if (fnmatch(r->pattern, e->d_name, FNM_CASEFOLD)) continue;
        char full[2048];
        struct stat st;
        snprintf(full, sizeof full, "%s/%s", r->dirpath, e->d_name);
        if (stat(full, &st)) continue;
        memset(G(out), 0, 320);
        WR32m(out, S_ISDIR(st.st_mode) ? 0x10 : 0x80);
        WR32m(out + 32, (uint32_t)st.st_size);
        snprintf(GS(out + 44), 260, "%s", e->d_name);
        return 1;
    }
    return 0;
}
IMP(KERNEL32, FindFirstFileA) {
    char g[1024], p[1024];
    snprintf(g, sizeof g, "%s", GS(ARG(0)));
    char *bs = strrchr(g, '\\');
    const char *pat = bs ? bs + 1 : g;
    if (bs) *bs = 0;
    rc_host_path(bs ? g : ".", 0, p, sizeof p);
    uint32_t h = rc_handle_new(H_FIND);
    RcHandle *r = rc_handle(h);
    snprintf(r->pattern, sizeof r->pattern, "%s", !strcmp(pat, "*.*") ? "*" : pat);
    snprintf(r->dirpath, sizeof r->dirpath, "%s", p);
    r->dir = opendir(p);
    if (!find_next(r, ARG(1))) {
        if (r->dir) closedir(r->dir);
        r->type = H_FREE;
        err(c, 2);
        RET(2, 0xffffffffu);
    }
    RET(2, h);
}
IMP(KERNEL32, FindNextFileA) {
    RcHandle *r = rc_handle(ARG(0));
    if (!r || !find_next(r, ARG(1))) { err(c, 18); RET(2, 0); }
    RET(2, 1);
}
IMP(KERNEL32, FindClose) {
    RcHandle *r = rc_handle(ARG(0));
    if (r) { if (r->dir) closedir(r->dir); r->type = H_FREE; }
    RET(1, 1);
}

// file times: FILETIME <-> SYSTEMTIME via timegm
static uint64_t ft_get(uint32_t p) { return (uint64_t)RD32m(p + 4) << 32 | RD32m(p); }
static void ft_put(uint32_t p, uint64_t v) { WR32m(p, (uint32_t)v); WR32m(p + 4, (uint32_t)(v >> 32)); }
IMP(KERNEL32, FileTimeToLocalFileTime) { ft_put(ARG(1), ft_get(ARG(0)) + 9ull * 3600 * 10000000); RET(2, 1); }
IMP(KERNEL32, LocalFileTimeToFileTime) { ft_put(ARG(1), ft_get(ARG(0)) - 9ull * 3600 * 10000000); RET(2, 1); }
IMP(KERNEL32, FileTimeToSystemTime) {
    uint64_t ft = ft_get(ARG(0));
    time_t t = (time_t)(ft / 10000000 - 11644473600ull);
    struct tm tm;
    gmtime_r(&t, &tm);
    uint16_t v[8] = {(uint16_t)(tm.tm_year + 1900), (uint16_t)(tm.tm_mon + 1), (uint16_t)tm.tm_wday,
                     (uint16_t)tm.tm_mday, (uint16_t)tm.tm_hour, (uint16_t)tm.tm_min, (uint16_t)tm.tm_sec,
                     (uint16_t)(ft / 10000 % 1000)};
    memcpy(G(ARG(1)), v, 16);
    RET(2, 1);
}
IMP(KERNEL32, SystemTimeToFileTime) {
    uint16_t v[8];
    memcpy(v, G(ARG(0)), 16);
    struct tm tm = {.tm_year = v[0] - 1900, .tm_mon = v[1] - 1, .tm_mday = v[3], .tm_hour = v[4], .tm_min = v[5],
                    .tm_sec = v[6]};
    ft_put(ARG(1), ((uint64_t)timegm(&tm) + 11644473600ull) * 10000000 + v[7] * 10000ull);
    RET(2, 1);
}

// mapping: read-only views of a file
IMP(KERNEL32, CreateFileMappingA) {
    struct stat st;
    int fd = fd_of(ARG(0));
    if (fd < 0 || fstat(fd, &st)) RET(6, 0);
    uint32_t h = rc_handle_new(H_MAPPING);
    rc_handle(h)->fd = dup(fd);
    rc_handle(h)->map_size = ARG(5) ? ARG(5) : (uint32_t)st.st_size;
    RET(6, h);
}
IMP(KERNEL32, MapViewOfFile) {
    RcHandle *r = rc_handle(ARG(0));
    if (!r) RET(5, 0);
    uint32_t off = ARG(3), n = ARG(4) ? ARG(4) : r->map_size - off;
    uint32_t a = rc_valloc(n);
    if (a) (void)!pread(r->fd, G(a), n, off);
    RET(5, a);
}
IMP(KERNEL32, UnmapViewOfFile) { rc_vfree(ARG(0)); RET(1, 1); }   // ponytail: writes to a view are not flushed

// ---------------------------------------------------------------- sync objects
IMP(KERNEL32, CreateEventA) {
    uint32_t h = rc_handle_new(H_EVENT);
    rc_handle(h)->manual = ARG(1);
    rc_handle(h)->signaled = ARG(2);
    RET(4, h);
}
IMP(KERNEL32, SetEvent) {
    pthread_mutex_lock(&rc_sync_mu);
    RcHandle *r = rc_handle(ARG(0));
    if (r) r->signaled = 1;
    pthread_cond_broadcast(&rc_sync_cv);
    pthread_mutex_unlock(&rc_sync_mu);
    RET(1, r != NULL);
}
IMP(KERNEL32, CreateMutexA) {
    uint32_t h = rc_handle_new(H_MUTEX);
    if (ARG(1)) { rc_handle(h)->owner = c->thread->id; rc_handle(h)->count = 1; }
    c->thread->last_error = 0;
    RET(3, h);
}
IMP(KERNEL32, ReleaseMutex) {
    pthread_mutex_lock(&rc_sync_mu);
    RcHandle *r = rc_handle(ARG(0));
    int ok = r && r->owner == c->thread->id && r->count;
    if (ok && !--r->count) r->owner = 0;
    pthread_cond_broadcast(&rc_sync_cv);
    pthread_mutex_unlock(&rc_sync_mu);
    RET(1, ok);
}
// with rc_sync_mu held: is h signaled for this thread? consumes it (auto-reset event, mutex ownership)
static int try_take(CPU *c, uint32_t h) {
    RcHandle *r = rc_handle(h);
    if (!r) return 1;
    switch (r->type) {
    case H_EVENT:
        if (!r->signaled) return 0;
        if (!r->manual) r->signaled = 0;
        return 1;
    case H_MUTEX:
        if (r->count && r->owner != c->thread->id) return 0;
        r->owner = c->thread->id;
        r->count++;
        return 1;
    case H_THREAD: return r->signaled;
    default: return 1;
    }
}
static uint32_t wait_many(CPU *c, uint32_t n, uint32_t hs, int all, uint32_t ms) {
    struct timespec dl;
    clock_gettime(CLOCK_REALTIME, &dl);
    uint64_t ns = (uint64_t)dl.tv_nsec + rc_real_us(ms) * 1000;
    uint64_t vdeadline = rc_now_us() + (uint64_t)ms * 1000;   // fast-forward: the deadline is on the guest clock
    dl.tv_sec += ns / 1000000000;
    dl.tv_nsec = ns % 1000000000;
    pthread_mutex_lock(&rc_sync_mu);
    for (;;) {
        if (all) {
            int ok = 1;
            for (uint32_t i = 0; i < n && ok; i++) {
                RcHandle *r = rc_handle(RD32m(hs + 4 * i));
                ok = !r || (r->type == H_EVENT ? r->signaled : r->type == H_THREAD ? r->signaled
                            : r->type == H_MUTEX ? !r->count || r->owner == c->thread->id : 1);
            }
            if (ok) {
                for (uint32_t i = 0; i < n; i++) try_take(c, RD32m(hs + 4 * i));
                pthread_mutex_unlock(&rc_sync_mu);
                return 0;
            }
        } else
            for (uint32_t i = 0; i < n; i++)
                if (try_take(c, RD32m(hs + 4 * i))) {
                    pthread_mutex_unlock(&rc_sync_mu);
                    return i;
                }
        if (ms == 0) break;
#ifdef __EMSCRIPTEN__
        if (emscripten_is_main_runtime_thread()) {
            pthread_mutex_unlock(&rc_sync_mu);
            rc_web_sleep(1);
            pthread_mutex_lock(&rc_sync_mu);
            struct timespec now;
            clock_gettime(CLOCK_REALTIME, &now);
            if (ms != 0xffffffffu && (now.tv_sec > dl.tv_sec || (now.tv_sec == dl.tv_sec && now.tv_nsec >= dl.tv_nsec))) break;
            continue;
        }
#endif
        if (ms == 0xffffffffu) pthread_cond_wait(&rc_sync_cv, &rc_sync_mu);
        else if (rc_fastforward) {   // 1 ms real slices until the virtual deadline
            if (rc_now_us() >= vdeadline) break;
            struct timespec sl;
            clock_gettime(CLOCK_REALTIME, &sl);
            sl.tv_nsec += 1000000;
            if (sl.tv_nsec >= 1000000000) { sl.tv_sec++; sl.tv_nsec -= 1000000000; }
            pthread_cond_timedwait(&rc_sync_cv, &rc_sync_mu, &sl);
        } else if (pthread_cond_timedwait(&rc_sync_cv, &rc_sync_mu, &dl)) break;
    }
    pthread_mutex_unlock(&rc_sync_mu);
    return 0x102;   // WAIT_TIMEOUT
}
static uint32_t wait_counted(CPU *c, uint32_t n, uint32_t hs, int all, uint32_t ms) {   // idle while blocked
    int idle = ms && !rc_is_main_thread(c);
    if (idle) rc_thread_busy(-1);
    uint32_t r = wait_many(c, n, hs, all, ms);
    if (idle) rc_thread_busy(1);
    return r;
}
IMP(KERNEL32, WaitForSingleObject) {
    uint32_t h = ARG(0), ms = ARG(1);
    uint32_t tmp = c->esp + 4;   // the handle argument itself is a 1-element array
    (void)h;
    RET(2, wait_counted(c, 1, tmp, 0, ms));
}
IMP(KERNEL32, WaitForMultipleObjects) { RET(4, wait_counted(c, ARG(0), ARG(1), ARG(2), ARG(3))); }

// ---------------------------------------------------------------- threads
static uint32_t next_tid = 0x100;
typedef struct { CPU *c; uint32_t start, param, h; } ThreadArg;

static void thread_ended(CPU *c, uint32_t code) {   // returned from its start routine or called ExitThread
    rc_thread_busy(-1);
    if (c->thread->handle) {   // timeSetEvent threads have none
        pthread_mutex_lock(&rc_sync_mu);
        rc_handle(c->thread->handle)->exit_code = code;
        rc_handle(c->thread->handle)->signaled = 1;
        pthread_cond_broadcast(&rc_sync_cv);
        pthread_mutex_unlock(&rc_sync_mu);
    }
    rc_free_thread_stack(c);
}
static void *thread_main(void *p) {
    ThreadArg *t = p;
    CPU *c = t->c;
    pthread_detach(pthread_self());   // nobody joins (waits use the handle): free the host stack at exit
    rc_set_cur(c);
    rc_thread_busy(1);
    uint32_t r = rc_call(c, t->start, 1, &t->param);
    thread_ended(c, r);
    free(t);
    return NULL;
}
static ThreadArg *pending[RC_MAX_HANDLES];
IMP(KERNEL32, CreateThread) {
    uint32_t h = rc_handle_new(H_THREAD);
    ThreadArg *t = malloc(sizeof *t);
    t->c = rc_new_thread_cpu(ARG(1));
    t->c->thread->id = __atomic_fetch_add(&next_tid, 4, __ATOMIC_SEQ_CST);
    t->start = ARG(2);
    t->param = ARG(3);
    t->h = h;
    t->c->thread->handle = h;
    if (ARG(5)) WR32m(ARG(5), t->c->thread->id);
    if (rc_verbose) rc_log("CreateThread %08x(%08x) tid %x%s", t->start, t->param, t->c->thread->id,
                           ARG(4) & 4 ? " suspended" : "");
    if (ARG(4) & 4) pending[(h - 0x100) / 4] = t;
    else pthread_create(&rc_handle(h)->th, NULL, thread_main, t);
    RET(6, h);
}
IMP(KERNEL32, ResumeThread) {
    uint32_t i = (ARG(0) - 0x100) / 4;
    if (i < RC_MAX_HANDLES && pending[i]) {
        ThreadArg *t = pending[i];
        pending[i] = NULL;
        pthread_create(&rc_handles[i].th, NULL, thread_main, t);
        RET(1, 1);
    }
    RET(1, 0);
}
IMP(KERNEL32, ExitThread) {
    rc_log("ExitThread(%u) from tid %x", ARG(0), c->thread->id);
    thread_ended(c, ARG(0));   // the updater's HTTP threads end here and the main thread waits on their handles
    pthread_exit(NULL);
}
IMP(KERNEL32, GetExitCodeProcess) { WR32m(ARG(1), 0); RET(2, 1); }
IMP(KERNEL32, CreateProcessA) {
    rc_log("CreateProcessA(%s, %s): refused", GS(ARG(0)), GS(ARG(1)));
    err(c, 2);
    RET(10, 0);
}

// ---------------------------------------------------------------- modules
// LoadLibrary hands out fake module handles; GetProcAddress resolves names an rt/*.c file registered.
typedef struct { const char *dll, *name; RcFn fn; } RcProc;
static RcProc procs[256];
static int nprocs;
void rc_register_proc(const char *dll, const char *name, RcFn fn) { procs[nprocs++] = (RcProc){dll, name, fn}; }

static const char *mods[32];
static int nmods;
IMP(KERNEL32, LoadLibraryA) {
    const char *n = GS(ARG(0));
    if (rc_verbose) rc_log("LoadLibraryA(%s)", n);
    for (int i = 0; i < nmods; i++)
        if (!strcasecmp(mods[i], n)) RET(1, 0x70000000u + 0x10000u * i);
    int known = 0;
    for (int i = 0; i < nprocs; i++)
        if (!strncasecmp(procs[i].dll, n, strcspn(procs[i].dll, "."))) known = 1;
    if (!known) {
        rc_log("LoadLibraryA(%s): not provided", n);
        err(c, 126);
        RET(1, 0);
    }
    mods[nmods] = strdup(n);
    RET(1, 0x70000000u + 0x10000u * nmods++);
}
IMP(KERNEL32, FreeLibrary) { RET(1, 1); }
IMP(KERNEL32, GetProcAddress) {
    uint32_t m = ARG(0);
    const char *n = ARG(1) < 0x10000 ? "#ord" : GS(ARG(1));
    if (m >= 0x70000000u && (m - 0x70000000u) / 0x10000 < (uint32_t)nmods) {
        const char *dll = mods[(m - 0x70000000u) / 0x10000];
        for (int i = 0; i < nprocs; i++)
            if (!strncasecmp(procs[i].dll, dll, strcspn(procs[i].dll, ".")) && !strcmp(procs[i].name, n))
                RET(2, rc_host_fn(procs[i].fn));
    }
    rc_log("GetProcAddress(%08x, %s): not provided", m, n);
    err(c, 127);
    RET(2, 0);
}

// ---------------------------------------------------------------- misc
IMP(KERNEL32, FormatMessageA) {
    if (ARG(4) && ARG(5)) snprintf(GS(ARG(4)), ARG(5), "error %u", ARG(2));
    RET(7, ARG(4) ? strlen(GS(ARG(4))) : 0);
}
IMP(KERNEL32, EnumSystemLocalesA) { RET(2, 1); }
// SEH: walk the guest's fs:[0] chain of {prev, handler} records, calling each handler as Windows does:
// handler(ExceptionRecord*, EstablisherFrame, ContextRecord*, DispatcherContext*) -> 0 continue execution,
// 1 continue search. A C++ catch never returns here: __CxxFrameHandler unwinds (RtlUnwind), runs the catch
// funclet and jumps to its continuation; the guest code there eventually `ret`s past the dead host frames, which
// unwind through the call sites' ret_to checks. We notice by c->ret_to no longer being RC_RETURN_MAGIC.
static uint32_t make_record(CPU *c, uint32_t code, uint32_t flags, uint32_t n, uint32_t args, uint32_t at,
                            uint32_t *ctx) {
    c->esp = (c->esp - 0x400) & ~15u;
    uint32_t er = c->esp, cx = c->esp + 0x60;
    memset(G(er), 0, 0x400);
    WR32m(er, code); WR32m(er + 4, flags); WR32m(er + 12, at);
    if (n > 15) n = 15;
    WR32m(er + 16, n);
    for (uint32_t i = 0; i < n; i++) WR32m(er + 20 + 4 * i, RD32m(args + 4 * i));
    WR32m(cx, 0x10007);   // CONTEXT: control + integer
    WR32m(cx + 0xb0, c->edi); WR32m(cx + 0xb4, c->esi); WR32m(cx + 0xb8, c->ebx); WR32m(cx + 0xbc, c->edx);
    WR32m(cx + 0xc0, c->ecx); WR32m(cx + 0xc4, c->eax); WR32m(cx + 0xc8, c->ebp); WR32m(cx + 0xb8 + 0x14, at);
    *ctx = cx;
    return er;
}
IMP(KERNEL32, RaiseException) {
    uint32_t ret = RD32m(c->esp), sp = c->esp, code = ARG(0), ctx;
    rc_log("RaiseException(%08x) from %08x", code, ret);
    uint32_t er = make_record(c, code, ARG(1), ARG(2), ARG(3), ret, &ctx);
    uint32_t dc = er + 0x3f0;
    for (uint32_t fr = RD32m(c->fs_base); fr != 0xffffffffu && fr; fr = RD32m(fr)) {
        uint32_t a[4] = {er, fr, ctx, dc};
        uint32_t r = rc_call(c, RD32m(fr + 4), 4, a);
        if (c->ret_to != RC_RETURN_MAGIC) return;   // caught: control already moved to the continuation
        if (r == 0) { c->esp = sp; RET(4, 0); }     // ExceptionContinueExecution
    }
    rc_trap(c, ret, "unhandled exception");
}
IMP(KERNEL32, RtlUnwind) {
    uint32_t target = ARG(0), er = ARG(2), ret = ARG(3), sp = c->esp, ctx;
    if (!er) er = make_record(c, 0xc0000027u, 0, 0, 0, RD32m(sp), &ctx);
    else { c->esp = (c->esp - 0x400) & ~15u; ctx = c->esp; memset(G(ctx), 0, 0x2cc); }
    WR32m(er + 4, RD32m(er + 4) | (target ? 2 : 6));   // EXCEPTION_UNWINDING (| EXIT_UNWIND)
    uint32_t dc = c->esp + 0x3f0;
    for (uint32_t fr = RD32m(c->fs_base); fr != 0xffffffffu && fr && fr != target; ) {
        uint32_t a[4] = {er, fr, ctx, dc};
        rc_call(c, RD32m(fr + 4), 4, a);
        if (c->ret_to != RC_RETURN_MAGIC) return;
        fr = RD32m(fr);
        WR32m(c->fs_base, fr);
    }
    c->esp = sp;
    RET(4, ret);
}

// ---------------------------------------------------------------- resources: the image's own .rsrc
// IMAGE_RESOURCE_DIRECTORY: 16-byte header (named count at +12, id count at +14), then 8-byte entries
// {name or id, offset | 0x80000000 for a subdirectory}. A "handle" is the guest address of the data entry.
static uint32_t rsrc_base(void) {
    uint32_t pe = rc_image_base + RD32m(rc_image_base + 0x3c);
    return rc_image_base + RD32m(pe + 24 + 96 + 2 * 8);   // data directory 2 = resources
}
static int name_eq(uint32_t base, uint32_t ent, uint32_t name, int wide) {
    uint32_t id = RD32m(ent);
    if (name < 0x10000) return !(id & 0x80000000u) && id == name;
    if (!(id & 0x80000000u)) {   // "#123" names an id
        const char *s = GS(name);
        return s[0] == '#' && (uint32_t)atoi(s + 1) == id;
    }
    uint32_t str = base + (id & 0x7fffffffu);
    uint16_t n = rc_rd16(rc_mem + str);
    for (uint16_t i = 0; i < n; i++) {
        uint16_t a = rc_rd16(rc_mem + str + 2 + 2 * i);
        uint16_t b = wide ? rc_rd16(rc_mem + name + 2 * i) : (uint8_t)GS(name)[i];
        if (a < 128 && b < 128 && toupper(a) != toupper(b)) return 0;
        if (!b) return 0;
    }
    return (wide ? rc_rd16(rc_mem + name + 2 * n) : (uint8_t)GS(name)[n]) == 0;
}
static uint32_t rsrc_find(uint32_t dir, uint32_t base, uint32_t name, int wide) {
    uint32_t n = rc_rd16(rc_mem + dir + 12) + rc_rd16(rc_mem + dir + 14);
    for (uint32_t i = 0; i < n; i++) {
        uint32_t ent = dir + 16 + 8 * i;
        if (name == 0xffffffffu || name_eq(base, ent, name, wide)) return RD32m(ent + 4);
    }
    return 0xffffffffu;
}
static uint32_t find_resource(uint32_t name, uint32_t type, int wide) {
    uint32_t base = rsrc_base(), o;
    if ((o = rsrc_find(base, base, type, wide)) == 0xffffffffu || !(o & 0x80000000u)) return 0;
    if ((o = rsrc_find(base + (o & 0x7fffffffu), base, name, wide)) == 0xffffffffu || !(o & 0x80000000u)) return 0;
    if ((o = rsrc_find(base + (o & 0x7fffffffu), base, 0xffffffffu, wide)) == 0xffffffffu) return 0;   // first language
    return base + o;
}
IMP(KERNEL32, FindResourceA) {
    uint32_t r = find_resource(ARG(1), ARG(2), 0);
    if (rc_verbose || !r)
        rc_log("FindResourceA(%s, %s) -> %08x", ARG(1) < 0x10000 ? "#id" : GS(ARG(1)), ARG(2) < 0x10000 ? "#id" : GS(ARG(2)), r);
    RET(3, r);
}
IMP(KERNEL32, FindResourceW) { RET(3, find_resource(ARG(1), ARG(2), 1)); }
IMP(KERNEL32, LoadResource) { RET(2, ARG(1)); }
IMP(KERNEL32, LockResource) { RET(1, ARG(0) ? rc_image_base + RD32m(ARG(0)) : 0); }
IMP(KERNEL32, SizeofResource) { RET(2, ARG(1) ? RD32m(ARG(1) + 4) : 0); }
