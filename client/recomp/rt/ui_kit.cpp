// The in-game UI kit (ui_kit.h).
#include "ui_kit.h"

#include <cstdio>
#include <cstring>
#include <initializer_list>
#include <vector>

#include "platform.h"   // platformKeyDownVk, platformMouse: for the clicks

namespace {
const uint32_t LABEL_VT = 0xbe78bc, BUTTON_VT = 0xbe7ee8, INPUT_VT = 0xbe812c, FIELD_VT = 0xbe79e4;
uint32_t f2u(float f) { uint32_t u; memcpy(&u, &f, 4); return u; }
float u2f(uint32_t u) { float f; memcpy(&f, &u, 4); return f; }
uint32_t make(CPU& t, uint32_t factory, uint32_t win, const char* text) {
    uint32_t a[2] = {win, win + 0x340};
    uint32_t el = rc_call(&t, factory, 2, a);
    ui_set_text(t, el, text);
    return el;
}
void call(CPU& t, uint32_t el, uint32_t fn, std::initializer_list<uint32_t> args) {
    std::vector<uint32_t> a(args);
    t.ecx = el;
    rc_call(&t, fn, (int)a.size(), a.data());
}
}   // namespace

uint32_t ui_label(CPU& t, uint32_t win, const char* text, int w, int h) {
    uint32_t el = make(t, 0x5aea60, win, text);
    if (!el) return 0;
    WR32m(el + 0x37c, f2u(3));
    call(t, el, 0x5af690, {(uint32_t)w, (uint32_t)h});
    return el;
}
uint32_t ui_button(CPU& t, uint32_t win, const char* text, int w, int h) {
    uint32_t el = make(t, 0x5b9f40, win, text);
    if (!el) return 0;
    WR32m(el + 0x34c, f2u(2)), WR32m(el + 0x78, f2u(2));
    call(t, el, 0x801e00, {f2u((float)w), f2u((float)h)});
    return el;
}

void ui_set_text(CPU& t, uint32_t el, const char* text) {
    if (!el) return;
    std::vector<uint16_t> w;
    for (const unsigned char* p = (const unsigned char*)text; *p;) {
        uint32_t c = *p++;
        if (c >= 0xe0) c = (c & 0x0f) << 12 | (p[0] & 0x3f) << 6 | (p[1] & 0x3f), p += 2;
        else if (c >= 0xc0) c = (c & 0x1f) << 6 | (p[0] & 0x3f), p += 1;
        w.push_back((uint16_t)c);
    }
    w.push_back(0);
    uint32_t g = rc_halloc(2 * (uint32_t)w.size(), 0);
    memcpy(rc_mem + g, w.data(), 2 * w.size());
    t.ecx = el;
    rc_call(&t, RD32m(RD32m(el) + 0x44), 1, &g);
    rc_hfree(g);
}

// The way the login dialog's own init places them: an input its +0x3c8/+0x3cc then vtable slot 0x34 (it re-applies
// them every frame); a button by FUN_005b9ed0 (thiscall: the centre, it subtracts half its size); a label its element
// position (+0x70/+0x74) and its own copy at +0x374/+0x378 (FUN_005baeb0).
void ui_place(CPU& t, uint32_t el, float x, float y) {
    if (!el) return;
    uint32_t vt = RD32m(el);
    if (vt == INPUT_VT) {
        WR32m(el + 0x3c8, f2u(x)), WR32m(el + 0x3cc, f2u(y));
        t.ecx = el;
        rc_call(&t, RD32m(vt + 0x34), 0, nullptr);
    } else if (vt == BUTTON_VT) {
        uint32_t a[2] = {f2u(x), f2u(y)};
        t.ecx = el;
        rc_call(&t, 0x5b9ed0, 2, a);
    } else if (vt == LABEL_VT) {
        call(t, el, 0x5baeb0, {f2u(x), f2u(y)});
    } else {
        WR32m(el + 0x70, f2u(x)), WR32m(el + 0x74, f2u(y));
    }
}

void ui_set_size(CPU& t, uint32_t el, float w, float h) {
    if (!el) return;
    uint32_t vt = RD32m(el), at = vt == INPUT_VT ? 0x3d0 : vt == FIELD_VT ? 0x398 : 0;
    if (vt == LABEL_VT) call(t, el, 0x5af690, {(uint32_t)(int)w, (uint32_t)(int)h});
    else if (vt == BUTTON_VT) call(t, el, 0x801e00, {f2u(w), f2u(h)});
    else if (at) {
        WR32m(el + at, f2u(w)), WR32m(el + at + 4, f2u(h));
        call(t, el, RD32m(vt + 0x34), {});
    }
}
void ui_set_font_size(CPU& t, uint32_t el, int px) {
    if (el) call(t, el, 0x5af590, {(uint32_t)px});
}
void ui_set_align(CPU& t, uint32_t el, int align) {
    if (el) call(t, el, 0x5af8a0, {(uint32_t)align});
}

bool ui_over(uint32_t win, float x, float y, float w, float h) {
    int mx, my, b;
    platformMouse(&mx, &my, &b);
    x += u2f(RD32m(win + 0x380)), y += u2f(RD32m(win + 0x384));
    return mx >= x && mx < x + w && my >= y && my < y + h;
}
bool ui_pressed(bool over, uint32_t& prev) {
    bool down = platformKeyDownVk(1), hit = prev && !down && over;
    prev = over && down;
    return hit;
}

void ui_show(uint32_t el, bool on) {
    if (el) WR32m(el + 0x20, on ? RD32m(el + 0x20) & ~2u : RD32m(el + 0x20) | 2u);
}

bool ui_clicked(uint32_t sw, uint32_t& prev) {
    return ui_pressed(sw && RD32m(sw + 0x3e8) != 0 && !(RD32m(sw + 0x20) & 2), prev);
}

// An input's text is a VC6 std::wstring at +0x39c (_Ptr +0x3a0, _Len +0x3a4, _Res +0x3a8; what FUN_005e9e40 copies
// out): a buffer from the game's own operator new (FUN_00b09654, cdecl), the reference count in the byte before the
// characters, freed by the game as _Ptr - 2. ponytail: the box's old buffer (if any) leaks.
void ui_set_input(CPU& t, uint32_t inp, const char* text) {
    uint32_t n = (uint32_t)strlen(text), size = 2 * (n + 2);
    uint32_t buf = rc_call(&t, 0xb09654, 1, &size);
    rc_wr16(rc_mem + buf, 0);
    for (uint32_t i = 0; i < n; i++) rc_wr16(rc_mem + buf + 2 + 2 * i, (uint8_t)text[i]);
    rc_wr16(rc_mem + buf + 2 + 2 * n, 0);
    WR32m(inp + 0x3a0, buf + 2);
    WR32m(inp + 0x3a4, n);
    WR32m(inp + 0x3a8, n);
}

std::string ui_input_json(uint32_t inp) {
    uint32_t p = RD32m(inp + 0x3a0), n = RD32m(inp + 0x3a4);
    std::string s;
    for (uint32_t i = 0; p && i < n && i < 256; i++) {
        uint16_t ch = rc_rd16(rc_mem + p + 2 * i);
        char e[8];
        if (ch == '"' || ch == '\\') s += '\\', s += (char)ch;
        else if (ch >= 0x20 && ch < 0x7f) s += (char)ch;
        else snprintf(e, sizeof e, "\\u%04x", ch), s += e;
    }
    return s;
}
