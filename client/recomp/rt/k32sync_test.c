// make k32sync_test: a mutex the game's main thread waits on goes to it, not to another thread that asks at the same
// moment (CTextureManager's FileMutex: the loader threads kept it from the main thread for seconds at lobby entry);
// the thread holding it can still take it again
#include "k32io.c"

#include <assert.h>

static uint8_t mem[1 << 16];
uint8_t *rc_mem = mem;
RcHandle rc_handles[RC_MAX_HANDLES];
uint32_t rc_handle_new(int type) { static int n = 8; rc_handles[n].type = type; return RC_HANDLE(n++); }
RcHandle *rc_handle(uint32_t h) { uint32_t i = (h - 0x100) / 4; return h >= 0x100 && i < RC_MAX_HANDLES && rc_handles[i].type ? &rc_handles[i] : NULL; }
static struct RcThread tmain = {.id = 0x10}, ta = {.id = 0x20}, tb = {.id = 0x30};
static CPU cmain = {.thread = &tmain}, ca = {.thread = &ta}, cb = {.thread = &tb};
int rc_is_main_thread(CPU *c) { return c == &cmain; }
// the rest of the runtime k32io.c links against: unused here
int rc_fastforward, rc_verbose, rc_nospeed, rc_frame_no;
uint32_t rc_image_base;
const char *rc_game_dir;
uint64_t rc_now_us(void) { return 0; }
uint64_t rc_real_us(uint32_t ms) { return (uint64_t)ms * 1000; }
void rc_thread_busy(int d) { (void)d; }
void rc_log(const char *f, ...) { (void)f; }
_Noreturn void rc_trap(CPU *c, uint32_t a, const char *w) { (void)c, (void)a, (void)w; abort(); }
uint32_t rc_call(CPU *c, uint32_t f, int n, const uint32_t *a) { (void)c, (void)f, (void)n, (void)a; return 0; }
void rc_free_thread_stack(CPU *c) { (void)c; }
CPU *rc_new_thread_cpu(uint32_t s) { (void)s; return NULL; }
void rc_set_cur(CPU *c) { (void)c; }
uint32_t rc_halloc(uint32_t n, int z) { (void)n, (void)z; return 0; }
void rc_hfree(uint32_t p) { (void)p; }
uint32_t rc_valloc(uint32_t n) { (void)n; return 0; }
void rc_vfree(uint32_t p) { (void)p; }
uint32_t rc_host_fn(RcFn f) { (void)f; return 0; }
int rc_host_path(const char *g, int w, char *o, size_t n) { (void)g, (void)w, (void)o, (void)n; return 0; }
void rc_path_changed(void) {}
uint32_t rc_utf16_to_sjis(const uint16_t *s, uint32_t n, char *o, uint32_t on) { (void)s, (void)n, (void)o, (void)on; return 0; }

static uint32_t mtx;
static void *main_waits(void *p) {
    (void)p;
    WR32m(0x100, mtx);
    return (void *)(uintptr_t)wait_many(&cmain, 1, 0x100, 0, 0xffffffffu);
}

int main(void) {
    RcHandle *m = rc_handle(mtx = rc_handle_new(H_MUTEX));
    WR32m(0x200, mtx);
    assert(wait_many(&ca, 1, 0x200, 0, 0) == 0 && m->owner == ta.id);   // a loader thread holds it
    pthread_t th;
    pthread_create(&th, NULL, main_waits, NULL);
    usleep(100000);   // the main thread is waiting on it by now

    pthread_mutex_lock(&rc_sync_mu);
    assert(try_take(&ca, mtx) && m->count == 2);   // its holder takes it again (recursion)
    m->count = 0, m->owner = 0;                    // ReleaseMutex x2
    assert(!try_take(&cb, mtx));                   // another loader asks first: not while the main thread waits
    pthread_cond_broadcast(&rc_sync_cv);
    pthread_mutex_unlock(&rc_sync_mu);

    void *r;
    pthread_join(th, &r);
    assert(r == 0 && m->owner == tmain.id && !main_wants);   // the main thread has it
    puts("k32sync_test: ok");
    return 0;
}
