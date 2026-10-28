// Registering a replacement for an original yo2.exe function.
//
// Write a free function with the ORIGINAL ABI and export it as yo2_<hex address, no leading zeros, lowercase>:
//
//     // @yo2 0x00689ea0 recv
//     YO2_HOOK int32_t __cdecl yo2_689ea0(YgPacket* p, int sock) { ... }
//
// That one export is what both halves of the harness look for: the replacement DLL patches a jmp at 0x689ea0 to it,
// and the differential tester calls it next to the original. Conventions (MSVC 6 vs i686 gcc, both agree on these):
//   __cdecl     args on the stack, caller pops                         (default for free functions in yo2.exe)
//   __stdcall   args on the stack, callee pops (ret N)                 (WinAPI, some STL helpers)
//   __thiscall  this in ECX, args on the stack, callee pops            (every non-static member function)
//   __fastcall  first two args in ECX, EDX, rest on the stack, callee pops
// Return values: EAX (EDX:EAX for 64-bit), ST0 for float/double, structs > 8 bytes via a hidden pointer as the FIRST
// stack arg (for thiscall: still after ECX). MSVC 6 returns 8-byte POD structs in EDX:EAX; gcc does too on mingw.
// Callee-saved: EBX, ESI, EDI, EBP. Check the original's `ret` / `ret N` and its first reads of ECX/EDX to pick one.
#pragma once
#include <cstdint>

#if !(defined(_WIN32) && defined(__i386__))
#error "hooks only build for i686-w64-mingw32 (see harness/README.md)"
#endif

#define YO2_HOOK extern "C" __declspec(dllexport)
