// See coop.h. Round-robin: one pass runs every thread that is due once, then the scheduler sleeps (gives the
// browser its turn) until the next one is due, at most a frame.
#include "coop.h"

#include <emscripten/emscripten.h>
#include <emscripten/fiber.h>

#include <cstdlib>
#include <vector>

#include "platform.h"

namespace coop {
namespace {

const size_t STACK = 1 << 20;          // Win32's default thread stack
const size_t ASYNCIFY_STACK = 64 << 10;   // the call chain an unwind records

struct Thread {
    uint32_t id;
    emscripten_fiber_t fiber;
    void* stack;
    void* asyncifyStack;
    Fn fn;
    void* arg;
    uint32_t wakeAt;
    bool done;
};

emscripten_fiber_t gScheduler;
char gSchedulerAsyncify[ASYNCIFY_STACK];
std::vector<Thread*> gThreads;
Thread* gCurrent;
uint32_t gNextId = 1;

bool due(uint32_t wakeAt, uint32_t now) { return (int32_t)(now - wakeAt) >= 0; }

void entry(void* p) {
    Thread* t = (Thread*)p;
    t->fn(t->arg);
    t->done = true;
    emscripten_fiber_swap(&t->fiber, &gScheduler);   // never comes back
}

void toScheduler(uint32_t wakeAt) {
    Thread* t = gCurrent;
    t->wakeAt = wakeAt;
    emscripten_fiber_swap(&t->fiber, &gScheduler);
}

}  // namespace

uint32_t spawn(Fn fn, void* arg) {
    Thread* t = new Thread{gNextId++, {}, malloc(STACK), malloc(ASYNCIFY_STACK), fn, arg, platformTimeMs(), false};
    emscripten_fiber_init(&t->fiber, entry, t, t->stack, STACK, t->asyncifyStack, ASYNCIFY_STACK);
    gThreads.push_back(t);
    return t->id;
}

uint32_t self() { return gCurrent ? gCurrent->id : 0; }

void yield() {
    if (gCurrent) toScheduler(platformTimeMs());
}

void sleepUntil(uint32_t ms) {
    if (gCurrent) toScheduler(ms);
}

void run(Fn fn, void* arg) {
    emscripten_fiber_init_from_current_context(&gScheduler, gSchedulerAsyncify, sizeof gSchedulerAsyncify);
    spawn(fn, arg);
    Thread* first = gThreads.back();
    // until the first thread returns: like returning from WinMain, that ends the process and every other thread
    while (!first->done) {
        uint32_t now = platformTimeMs();
        // index loop: a thread may spawn others while it runs (they wait for the next round)
        for (size_t i = 0, n = gThreads.size(); i < n; i++) {
            Thread* t = gThreads[i];
            if (t->done || !due(t->wakeAt, now)) continue;
            gCurrent = t;
            emscripten_fiber_swap(&gScheduler, &t->fiber);
            gCurrent = nullptr;
        }
        uint32_t wait = 16;   // a frame: the browser paints and delivers input even when every thread is busy
        now = platformTimeMs();
        for (size_t i = 0; i < gThreads.size();) {
            Thread* t = gThreads[i];
            if (t->done && t != first) {
                free(t->stack);
                free(t->asyncifyStack);
                delete t;
                gThreads.erase(gThreads.begin() + i);
                continue;
            }
            uint32_t left = due(t->wakeAt, now) ? 0 : t->wakeAt - now;
            if (left < wait) wait = left;
            i++;
        }
        emscripten_sleep(wait);
    }
}

}  // namespace coop
