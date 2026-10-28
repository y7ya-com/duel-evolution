// MSVC CRT threads (_beginthread / _beginthreadex) for non-Windows, on the CreateThread of windows.h.
#pragma once
#include "windows.h"

uintptr_t _beginthread(void (*fn)(void*), unsigned stack, void* arg);
uintptr_t _beginthreadex(void* security, unsigned stack, unsigned (*fn)(void*), void* arg, unsigned flags, unsigned* id);
void _endthread();
void _endthreadex(unsigned code);
