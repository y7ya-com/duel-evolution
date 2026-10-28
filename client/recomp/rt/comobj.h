// Guest COM objects backed by host code: a vtable in guest memory whose slots are host functions.
#pragma once
#include <initializer_list>

extern "C" {
#include "win.h"
}

struct RcSlot { const char* name; RcFn fn; };   // fn null: the slot traps with its name
#define S(f) RcSlot{#f, f}
#define N(name) RcSlot{name, nullptr}
uint32_t rc_vtable(std::initializer_list<RcSlot> slots);
