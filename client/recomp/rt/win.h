// Shared Win32-emulation state for rt/*.c
#pragma once
#include <pthread.h>
#include <stdio.h>

#include "rt.h"

#define RC_MAX_HANDLES 4096
#define RC_HANDLE(i) (0x100u + 4u * (uint32_t)(i))
enum { H_FREE, H_FILE, H_EVENT, H_MUTEX, H_THREAD, H_FIND, H_MAPPING, H_PROCESS };

typedef struct RcHandle {
    int type;
    int fd;                 // H_FILE
    int manual, signaled;   // H_EVENT / H_MUTEX / H_THREAD (signaled = thread ended)
    uint32_t owner, count;  // H_MUTEX
    void *dir;              // H_FIND: DIR*
    char pattern[260], dirpath[1024];
    uint32_t map_size;      // H_MAPPING: backing file handle in fd
    pthread_t th;
    uint32_t exit_code;
    int closed;             // H_THREAD: CloseHandle'd (the slot stays, see rc_handle_new)
} RcHandle;

extern RcHandle rc_handles[RC_MAX_HANDLES];
extern const char *rc_game_dir, *rc_write_dir;
uint32_t rc_handle_new(int type);
RcHandle *rc_handle(uint32_t h);
int rc_host_path(const char *guest, int write, char *out, size_t n);
void rc_path_changed(void);   // k32.c: after a write to the overlay (rc_host_path remembers read lookups)

uint32_t rc_valloc(uint32_t size);
uint32_t rc_vsize(uint32_t a);
uint32_t rc_heap_find(uint32_t v, int (*ok)(uint32_t));
int rc_readable(uint32_t a);
void rc_vfree(uint32_t a);
uint32_t rc_halloc(uint32_t n, int zero);
uint32_t rc_palloc(uint32_t n);   // runtime-owned guest memory, never freed (mem.c)
uint32_t rc_hsize(uint32_t p);
void rc_hfree(uint32_t p);
uint32_t rc_hrealloc(uint32_t p, uint32_t n, int zero);
int rc_hrealloc_fits(uint32_t p, uint32_t n);

uint32_t rc_ticks_ms(void);
uint32_t rc_sjis_to_utf16(const char *s, uint32_t n, uint16_t *out, uint32_t outn);
uint32_t rc_utf16_to_sjis(const uint16_t *s, uint32_t n, char *out, uint32_t outn);
void rc_k32_init(CPU *c, const char *cmdline);

// sync: everything waitable signals through one condition variable (ponytail: fine for a handful of threads)
extern pthread_mutex_t rc_sync_mu;
extern pthread_cond_t rc_sync_cv;

static inline void WR8m(uint32_t a, uint8_t v) { rc_mem[a] = v; }

// COM classes created through CoCreateInstance (DirectSound, ...): returns an HRESULT, writes the guest object to out
typedef uint32_t (*RcComCreate)(CPU *c, const uint8_t *clsid, const uint8_t *iid, uint32_t out);
extern RcComCreate rc_com_create;
