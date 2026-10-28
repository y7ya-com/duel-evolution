// D3DX's x87 matrix product (0xb58a89, D3DXMatrixMultiply's CPU-table entry; stdcall out, m1, m2, returns out): every
// sprite and element matrix goes through it, 6-11% of the main thread in every scene. The recompiled x87 runs as an
// emulated register stack; here the same products and the same sums in the same order, in double like the recompiled
// x87 (out[i][j] = (m1[i][0]*m2[0][j] + m1[i][2]*m2[2][j]) + (m1[i][1]*m2[1][j] + m1[i][3]*m2[3][j]), stored as float).
// All three of the original's paths (out == m2, out == m1 == m2, otherwise) give the product of the inputs as they were
// on entry. Not reproduced: the dead x87 registers it leaves behind (it frees them without popping) and its stack temp.
// RC_NOSPEED=1 runs the original; RC_MATH=compare runs both on every call and logs any result that differs.
#include <stdlib.h>
#include <string.h>
#include "rt.h"
#include "rc_funcs.h"

void o_00b58a89(CPU *restrict c);

static void product(uint8_t *m, uint32_t out, uint32_t a, uint32_t b) {
    float x[16], y[16], r[16];
    memcpy(x, m + a, 64);
    memcpy(y, m + b, 64);
    for (int i = 0; i < 4; i++)
        for (int j = 0; j < 4; j++) {
            const float *row = x + 4 * i;
            double p0 = (double)row[0] * y[j], p1 = (double)row[1] * y[4 + j], p2 = (double)row[2] * y[8 + j],
                   p3 = (double)row[3] * y[12 + j];
            r[4 * i + j] = (float)((p0 + p2) + (p1 + p3));
        }
    memcpy(m + out, r, 64);
}

static void compare(CPU *restrict c) {
    RC_LOCALS;
    uint32_t out = RD32(c->esp + 4), a = RD32(c->esp + 8), b = RD32(c->esp + 12);
    uint8_t so[64], sa[64], sb[64], orig[64];
    memcpy(so, m + out, 64), memcpy(sa, m + a, 64), memcpy(sb, m + b, 64);
    o_00b58a89(c);
    memcpy(orig, m + out, 64);
    memcpy(m + out, so, 64), memcpy(m + a, sa, 64), memcpy(m + b, sb, 64);
    product(m, out, a, b);
    static unsigned calls, diffs;
    calls++;
    if (memcmp(orig, m + out, 64) && diffs++ < 20) rc_log("matrix compare: call %u differs (out %08x m1 %08x m2 %08x)", calls, out, a, b);
    if (!(calls & (calls - 1)) && calls >= 1024) rc_log("matrix compare: %u calls, %u differ", calls, diffs);
}

void f_00b58a89(CPU *restrict c) {
    static int mode = -1;   // 0 this, 1 the original, 2 both compared
    if (mode < 0) mode = rc_nospeed ? 1 : getenv("RC_MATH") && !strcmp(getenv("RC_MATH"), "compare") ? 2 : 0;
    if (mode == 1) { o_00b58a89(c); return; }
    if (mode == 2) { compare(c); return; }   // the original's return already done
    RC_LOCALS;
    uint32_t out = RD32(c->esp + 4);
    product(m, out, RD32(c->esp + 8), RD32(c->esp + 12));
    RET(3, out);
}
