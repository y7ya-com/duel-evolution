// Web (Emscripten) runtime pieces. The guest's main thread runs on the browser's main thread under JSPI (or ASYNCIFY); the
// waits below hand the browser its turn (paint, input, WebSocket, proxied calls) instead of blocking it. Guest
// threads (CreateThread, timeSetEvent) are real pthreads on workers and block normally.
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#include <emscripten/threading.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "win.h"

static uint32_t last_yield;

// web/yieldguard.js: 0 when the ASYNCIFY build could not unwind this stack (a frame it did not instrument)
EM_JS(int, web_yield_ok, (void), { return Module.rcYieldOk ? Module.rcYieldOk() : 1; });

// Sleep / GetMessage / WaitFor* polling: a suspension on the main thread, a real sleep on a worker
void rc_web_sleep(uint32_t ms) {
    if (!emscripten_is_main_runtime_thread()) { usleep(ms * 1000u); return; }
    if (!web_yield_ok()) return;
    emscripten_sleep(ms);
    last_yield = rc_ticks_ms();
}

// after each Present: let the browser composite the frame and deliver input
// Every Present: Module.yo2Presents counts frames for the page (the loader shows "Loading..." when it stops moving:
// the game presents every frame unless a scene change or a load blocks it).
void rc_web_frame(void) {
    if (!emscripten_is_main_runtime_thread()) return;
    EM_ASM({ Module.yo2Presents = (Module.yo2Presents | 0) + 1; });
    rc_web_sleep(0);
}

// an empty PeekMessage: the game spins on it between frames, so yield once that has gone on for a frame
void rc_web_idle(void) {
    if (emscripten_is_main_runtime_thread() && rc_ticks_ms() - last_yield >= 16) rc_web_sleep(0);
}

// WININET on fetch: a synchronous XHR (allowed on the main thread and workers) to YO2_HTTP + the request's path,
// the same "every host goes to one server" rewrite as the native build. The body comes back as x-user-defined text
// (each char's low byte is the byte), the only binary form a synchronous XHR allows on the main thread.
EM_JS_DEPS(rc_web, "$UTF8ToString,malloc");
EM_JS(int, web_xhr, (const char *verb, const char *url, const uint8_t *body, uint32_t nbody, uint8_t **resp,
                     uint32_t *nresp), {
    const x = new XMLHttpRequest();
    x.open(UTF8ToString(verb), UTF8ToString(url), false);
    x.overrideMimeType("text/plain; charset=x-user-defined");
    try { x.send(nbody ? HEAPU8.slice(body, body + nbody) : null); } catch (e) { return 0; }
    const t = x.responseText, p = _malloc(t.length + 1);
    for (let i = 0; i < t.length; i++) HEAPU8[p + i] = t.charCodeAt(i) & 0xff;
    HEAPU32[resp >> 2] = p;
    HEAPU32[nresp >> 2] = t.length;
    return x.status;
});

// status (0 if the request failed); *resp is malloc'ed
int rc_web_http(const char *verb, const char *path, const uint8_t *body, uint32_t nbody, uint8_t **resp,
                uint32_t *nresp) {
    const char *base = getenv("YO2_HTTP");
    char url[1024];
    snprintf(url, sizeof url, "%s%s", base ? base : "", path);
    *resp = NULL;
    *nresp = 0;
    return web_xhr(verb, url, body, nbody, resp, nresp);
}

// the host stack is the guest call stack: the f_XXXXXXXX / imp_ frames of the wasm stack trace (--profiling-funcs)
void rc_web_stack(char *line, size_t n) {
    static char cs[16384];
    emscripten_get_callstack(EM_LOG_C_STACK, cs, sizeof cs);
    size_t k = 0;
    line[0] = 0;
    for (char *l = strtok(cs, "\n"); l && k + 64 < n; l = strtok(NULL, "\n")) {
        char *p = strstr(l, "f_");
        if (!p || (p > l && p[-1] != ' ' && p[-1] != '.')) p = strstr(l, "imp_");
        if (!p) continue;
        k += snprintf(line + k, n - k, "%.*s ", (int)strcspn(p, " (:@"), p);
    }
}
#endif
