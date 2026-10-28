// --pre-js for the ASYNCIFY build only. The indices of the functions asyncify instrumented (web/async-only.txt, filled
// in after the link by the Makefile, web/wasmnames.py): web/yieldguard.js lets a yield through only when every wasm frame
// is one. SDL would also emscripten_sleep(0) inside every SDL_GL_SwapWindow (an uninstrumented
// stack, and a second yield per frame: rt/web.c already yields after each Present), so its asyncify sleeps are off.
if (typeof document !== "undefined") {
    Module.rcAsyncOnly = new Set(__RC_ASYNC_ONLY__);
    Module.preRun = Module.preRun || [];
    Module.preRun.push(() => { ENV.SDL_EMSCRIPTEN_ASYNCIFY = "0"; });
}
