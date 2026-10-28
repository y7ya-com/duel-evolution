// New screens in the game's own UI: thin wrappers over the 2008 client's widget factories and setters, so a runtime
// override can add labels and buttons to one of the game's windows (rt/session.cpp's sign-in panel is the first user).
// Every call runs guest code through rc_call on the CPU the caller passes (a scratch copy of *rc_cur()).
//
// The game's widgets (CWindowTask*), each made by a cdecl factory(window, window + 0x340) that adds it to the window;
// the setters are thiscall on the widget (as the login dialog's init, FUN_007fe0d0, calls them):
//   label   CWindowTaskText        vtable 0xbe78bc  factory 0x5aea60  position 0x5baeb0 (x, y), text box 0x5af690
//           (w, h ints: it wraps at w), font size 0x5af590 (px), align 0x5af8a0 (0 1 2). Colour 0x5af650 (the
//           element's +0xa4 r g b a, multiplied with the glyph texels) is not wrapped: these labels' glyphs are black,
//           so a tint has no effect on them. Tinted text works through a CWindowTaskShadowText set up as the duel
//           result window's (src/Result/yo2ResultWindow.cpp: white glyphs, inheritTransform_, a coloured parent).
//   button  CWindowTaskTextSwitch  vtable 0xbe7ee8  factory 0x5b9f40  size 0x801e00 (w, h floats), centre 0x5b9ed0
//   input   CWindowTaskInput       vtable 0xbe812c  +0x3c8 x, +0x3cc y, +0x3d0 w, +0x3d4 h (floats), then slot 0x34
//   field   CWindowTaskTextField   vtable 0xbe79e4  +0x398 w, +0x39c h (floats), then slot 0x34 (the dialog header)
// Common: +0x20 flags (bit 1 hides), vtable slot 0x44 sets the text (a wide string), a button's +0x3e8 is 1 on hover.
// Depth: the window body is drawn at z 0, the dialog's own buttons at 2 and labels at 3 (a label's +0x37c, copied to
// its element's +0x78 when placed; a button's +0x34c and +0x78); ui_label / ui_button do the same, or the window's
// translucent body covers them and they look faint.
#pragma once
#include <cstdint>
#include <string>
extern "C" {
#include "win.h"
}

uint32_t ui_label(CPU& t, uint32_t win, const char* text, int w = 424, int h = 16);   // UTF-8, BMP only; w x h: box
uint32_t ui_button(CPU& t, uint32_t win, const char* text, int w = 80, int h = 24);
void ui_set_text(CPU& t, uint32_t el, const char* text);      // a label's or button's text (UTF-8, BMP only)
void ui_place(CPU& t, uint32_t el, float x, float y);         // window coordinates; a button by its CENTRE
void ui_show(uint32_t el, bool on);
void ui_set_size(CPU& t, uint32_t el, float w, float h);   // a label's text box, a button, an input, a field
void ui_set_font_size(CPU& t, uint32_t label, int px);
void ui_set_align(CPU& t, uint32_t label, int align);   // 0 left, 1 centre, 2 right (in its text box)
// The mouse over a box in window coordinates (a label has no hover of its own: its hitTest, slot 15, is false).
bool ui_over(uint32_t win, float x, float y, float w, float h);
bool ui_pressed(bool over, uint32_t& prev);   // pressed and released while over: a click; prev starts at 0
// A click on a button made by ui_button: the window routes the mouse button only to its own buttons, so a new one
// only shows hover; pressed and released over it is the click. Call once a frame; prev: its state, start at 0.
bool ui_clicked(uint32_t button, uint32_t& prev);
void ui_set_input(CPU& t, uint32_t input, const char* ascii);   // a CWindowTaskInput's text
std::string ui_input_json(uint32_t input);   // its text, escaped for a JSON string

const float UI_CHAR_W = 7.8f;   // the labels' 16 px font, an average character (DejaVu Sans, the web's; Arial ~7.3)
