// The avatar's walk path (0xa04a30, thiscall, ret 0x14): A* over the map's walk grid, 8 neighbours, for a click to walk
// somewhere or to an NPC. The original keeps the open nodes in a std::list and, after every expansion, re-sorts the whole
// list (MSVC6 list::sort: a merge sort through 16 bins, 17 list heads allocated and freed each time): O(n^2 log n), one
// long walk in a lobby took ~250 ms of CPU in a single frame. Here the open nodes are a binary heap keyed (f, order
// pushed). list::sort is stable, each node enters the list once and its f never changes while it waits, so the heap
// pops the nodes in the original's order: every node gets the same g, f, parent and flags, and the same path comes back
// in a vector from the guest's operator new. Gone: the scratch allocations (list nodes, sort bins).
// RC_NOSPEED=1 runs the original; RC_ASTAR=compare runs both on the same grid and logs any byte that differs.
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "rt.h"
#include "rc_funcs.h"

void o_00a04a30(CPU *restrict c);

// grid (this): +0 goal x, +4 goal y, +8 width, +0xc height, +0x14 nodes (0x2c each, row-major)
// node: +0 x, +4 y, +8..+0x13 what a path step holds, +0x14 walkable, +0x18 g, +0x1c f, +0x20 parent, +0x24 open,
// +0x25 closed, +0x28 cost to enter
enum { NODE = 0x2c, G = 0x18, F = 0x1c, PARENT = 0x20, OPEN = 0x24, CLOSED = 0x25, COST = 0x28 };
#define DIAG 0xbf0ebcu       // float: the diagonal step (and the heuristic's diagonal factor)
#define STRAIGHT 0xbe8198u   // float: a straight step
#define NEW_RET 0xa05054u    // the original's return address from operator new (an exception unwinds past it)

typedef struct { float f; uint32_t seq, node; } Open;
static __thread Open *heap;
static __thread size_t cap;

static int before(const Open *a, const Open *b) { return a->f < b->f || (a->f == b->f && a->seq < b->seq); }

static void heap_push(size_t *n, Open v) {
    if (*n == cap) heap = realloc(heap, (cap = cap ? cap * 2 : 1024) * sizeof *heap);
    size_t i = (*n)++;
    for (; i && before(&v, &heap[(i - 1) / 2]); i = (i - 1) / 2) heap[i] = heap[(i - 1) / 2];
    heap[i] = v;
}
static Open heap_pop(size_t *n) {
    Open top = heap[0], v = heap[--*n];
    size_t i = 0;
    for (;;) {
        size_t k = 2 * i + 1;
        if (k >= *n) break;
        if (k + 1 < *n && before(&heap[k + 1], &heap[k])) k++;
        if (!before(&heap[k], &v)) break;
        heap[i] = heap[k];
        i = k;
    }
    if (*n) heap[i] = v;
    return top;
}

// 0xa052d0: a node joins the open list (x87 at double precision, stored as float, like the original's fld/fadd/fstp)
static void open_node(uint8_t *m, uint32_t grid, uint32_t node, uint32_t parent, float step) {
    if (parent) WRF32(node + G, (double)step + RDF32(parent + G));
    int32_t a = (int32_t)llabs((int64_t)(int32_t)(RD32(grid) - RD32(node)));
    int32_t b = (int32_t)llabs((int64_t)(int32_t)(RD32(grid + 4) - RD32(node + 4)));
    double h = a < b ? (double)(b - a) + (double)a * RDF32(DIAG) : (double)(a - b) + (double)b * RDF32(DIAG);
    WR32(node + PARENT, parent);
    WR8(node + OPEN, 1);
    WRF32(node + F, h + RDF32(node + G));
}

static void astar(CPU *restrict c) {
    RC_LOCALS;
    uint32_t grid = c->ecx, ret = RD32(c->esp), out = RD32(c->esp + 4);
    int32_t sx = (int32_t)RD32(c->esp + 8), sy = (int32_t)RD32(c->esp + 12);
    int32_t gx = (int32_t)RD32(c->esp + 16), gy = (int32_t)RD32(c->esp + 20);
    static const int8_t STEP[8][3] = {{-1, -1, 1}, {-1, 0, 0}, {-1, 1, 1}, {0, -1, 0}, {0, 1, 0}, {1, -1, 1}, {1, 0, 0}, {1, 1, 1}};
    WR32(grid, gx);
    WR32(grid + 4, gy);
    size_t n = 0;
    uint32_t seq = 0, goal = 0;
    heap_push(&n, (Open){0, seq++, RD32(grid + 0x14) + (RD32(grid + 8) * (uint32_t)sy + (uint32_t)sx) * NODE});
    while (n) {
        uint32_t cur = heap_pop(&n).node;
        int32_t x = (int32_t)RD32(cur), y = (int32_t)RD32(cur + 4);
        if (x == gx && y == gy) { goal = cur; break; }
        for (int k = 0; k < 8; k++) {   // 0xa053e0: inside the grid, not open, not closed, walkable
            int32_t nx = x + STEP[k][0], ny = y + STEP[k][1], w = (int32_t)RD32(grid + 8);
            uint32_t node = RD32(grid + 0x14) + ((uint32_t)w * (uint32_t)ny + (uint32_t)nx) * NODE;
            if (nx < 0 || nx >= w || ny < 0 || ny >= (int32_t)RD32(grid + 12) || RD8(node + OPEN) || RD8(node + CLOSED) ||
                !RD8(node + 0x14))
                continue;
            open_node(m, grid, node, cur, (float)(RDF32(node + COST) + RDF32(STEP[k][2] ? DIAG : STRAIGHT)));
            heap_push(&n, (Open){rc_rdf32(m + node + F), seq++, node});
        }
        WR8(cur + CLOSED, 1);
    }
    // the path, start first: each step's +8..+0x13 and its walkable byte (the original leaves the last 3 bytes of a
    // step as stack garbage; 0 here). ponytail: a parent chain longer than the grid stops (the original would loop).
    uint32_t len = 0, limit = RD32(grid + 8) * RD32(grid + 12) + 1;
    for (uint32_t p = goal; p && len < limit; p = RD32(p + PARENT)) len++;
    PUSH(len * 16);
    PUSH(NEW_RET);
    f_00b09654(c);   // operator new
    if (c->ret_to != NEW_RET) return;   // it threw: unwinding
    c->esp += 4;
    uint32_t buf = c->eax, i = len;
    for (uint32_t p = goal; p && i; p = RD32(p + PARENT)) {
        i--;
        if (!buf) continue;
        uint32_t e = buf + i * 16;
        WR32(e, RD32(p + 8)), WR32(e + 4, RD32(p + 12)), WR32(e + 8, RD32(p + 16)), WR32(e + 12, RD8(p + 0x14));
    }
    WR32(out + 4, buf);
    WR32(out + 8, buf + len * 16);
    WR32(out + 12, buf + len * 16);
    c->eax = out;
    c->ret_to = ret;
    c->esp += 4 + 0x14;
}

// RC_ASTAR=compare: the original on the grid, then this on the same grid restored, every node byte and path step compared
static void compare(CPU *restrict c) {
    RC_LOCALS;
    uint32_t grid = c->ecx, esp = c->esp, out = RD32(esp + 4);
    size_t size = (size_t)RD32(grid + 8) * RD32(grid + 12) * NODE;
    uint32_t nodes = RD32(grid + 0x14);
    uint8_t *before_ = malloc(size), *orig = malloc(size), hdr[8];
    memcpy(before_, m + nodes, size);
    memcpy(hdr, m + grid, 8);
    struct timespec t0, t1, t2;
    clock_gettime(CLOCK_MONOTONIC, &t0);
    o_00a04a30(c);
    clock_gettime(CLOCK_MONOTONIC, &t1);
    uint32_t ob = RD32(out + 4), oe = RD32(out + 8), ret_to = c->ret_to, eax = c->eax, esp_after = c->esp;
    uint8_t *opath = malloc(oe - ob + 1);
    memcpy(opath, m + ob, oe - ob);
    memcpy(orig, m + nodes, size);
    memcpy(m + nodes, before_, size);
    memcpy(m + grid, hdr, 8);
    c->esp = esp, c->ecx = grid;
    astar(c);
    clock_gettime(CLOCK_MONOTONIC, &t2);
    uint32_t nb = RD32(out + 4), ne = RD32(out + 8);
    int bad = 0;
    for (size_t i = 0; i < size; i++)
        if (orig[i] != m[nodes + i] && bad++ < 4) rc_log("astar compare: node byte %zu (node %zu +0x%zx) %02x vs %02x", i, i / NODE, i % NODE, orig[i], m[nodes + i]);
    if (oe - ob != ne - nb) bad++, rc_log("astar compare: path %u vs %u steps", (oe - ob) / 16, (ne - nb) / 16);
    else
        for (uint32_t i = 0; i < oe - ob; i++)
            if (i % 16 < 13 && opath[i] != m[nb + i] && bad++ < 8) rc_log("astar compare: path byte %u differs", i);
    static int calls, diffs;
    calls++, diffs += bad != 0;
#define MS(a, b) ((b.tv_sec - a.tv_sec) * 1e3 + (b.tv_nsec - a.tv_nsec) / 1e6)
    rc_log("astar compare: call %d, %u nodes, path %u steps, %s (%d of %d calls differ); original %.1f ms, heap %.2f ms",
           calls, (unsigned)(size / NODE), (ne - nb) / 16, bad ? "DIFFERENT" : "identical", diffs, calls, MS(t0, t1), MS(t1, t2));
    PUSH(ob);   // the original's vector buffer: free it (operator delete)
    PUSH(NEW_RET);
    f_00b08e6d(c);
    c->esp += 4;
    c->ret_to = ret_to, c->eax = eax, c->esp = esp_after;
    free(before_), free(orig), free(opath);
}

void f_00a04a30(CPU *restrict c) {
    static int mode = -1;   // 0 the heap, 1 the original, 2 both compared
    if (mode < 0) mode = rc_nospeed ? 1 : getenv("RC_ASTAR") && !strcmp(getenv("RC_ASTAR"), "compare") ? 2 : 0;
    if (mode == 1) o_00a04a30(c);
    else if (mode == 2) compare(c);
    else astar(c);
}
