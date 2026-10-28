// Cooperative threads for the web build. A page that is not cross-origin isolated gives wasm one thread, and the
// browser owns it: nothing may block. So every Win32 thread (yaneSDK's app thread, CThread, timeSetEvent's timer
// thread) is an Emscripten fiber on that one thread. They switch only where the Win32 call would have blocked or
// slept anyway: Sleep, WaitFor*, GetMessage, an empty PeekMessage. After each round of the scheduler the browser
// gets a turn (emscripten_sleep), which is when the page paints, input events arrive, and fetches complete.
// Needs -sASYNCIFY (yo2win32 adds it). Native builds keep real threads; this file is web-only.
#pragma once
#include <cstdint>

namespace coop {

using Fn = void (*)(void*);

// main(): runs fn(arg) as the first thread and schedules until it returns (the others are left, like at ExitProcess)
void run(Fn fn, void* arg);

uint32_t spawn(Fn fn, void* arg);   // a new thread, first run on the scheduler's next round; returns its id (>= 1)
uint32_t self();                    // the running thread's id; 0 outside run() (the browser's own context)
void yield();                       // let every other thread run once, then continue
void sleepUntil(uint32_t ms);       // yield until platformTimeMs() >= ms (wrap-safe)

}  // namespace coop
