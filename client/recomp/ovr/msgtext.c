// The game's dialogs (CWindowModelDialogOk / YesNo, vtable slot 0x34 = FUN_005df750, thiscall: this, text id) look
// the id up in CStringDB (DAT_01271840, slot 1: thiscall this, out VC6 wstring, id; _Ptr at +4, _Len at +8) and set it
// through slot 0x30. An id with no text (0x11b7, ...) made an empty box: it now reads "Something went wrong.
// [text 0x<id>]", logged once per id (stderr: the browser console on the web).
#include "rt.h"
#include "rc_funcs.h"
#include "win.h"

void o_005df750(CPU *restrict c);

static int empty_text(CPU *t, uint32_t id) {
    uint32_t db = RD32m(0x1271840), buf, a[2], p, n;
    if (!db) return 0;
    buf = rc_halloc(16, 1);
    a[0] = buf, a[1] = id;
    t->ecx = db;
    rc_call(t, RD32m(RD32m(db) + 4), 2, a);
    p = RD32m(buf + 4), n = RD32m(buf + 8);
    rc_hfree(buf);   // ponytail: a non-empty result's string buffer leaks (a few bytes, only when a dialog opens)
    return !p || !n;
}

void f_005df750(CPU *restrict c) {
    uint32_t self = c->ecx, id = RD32m(c->esp + 4);
    o_005df750(c);
    CPU t = *c;   // a scratch copy below the current stack
    if (!empty_text(&t, id)) return;
    static uint32_t logged[64];
    int i = 0;
    while (i < 64 && logged[i] && logged[i] != id) i++;
    if (i < 64 && !logged[i]) logged[i] = id, rc_log("dialog: text id %#x is empty", id);
    char s[64];
    int n = snprintf(s, sizeof s, "Something went wrong.\n[text 0x%x]", id);
    uint32_t w = rc_halloc(2 * (uint32_t)n + 2, 1);
    for (int k = 0; k < n; k++) rc_wr16(rc_mem + w + 2 * k, (uint8_t)s[k]);
    t = *c;
    t.ecx = self;
    rc_call(&t, RD32m(RD32m(self) + 0x30), 1, &w);
    rc_hfree(w);
}
