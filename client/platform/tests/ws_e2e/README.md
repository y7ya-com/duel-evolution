# ws_e2e: web transport under Node

`gate_hello_ws` is the web build of `tests/gate_hello.cpp`. It runs the same gate handshake through `net_ws.cpp`:
Node WebSocket → Boxedwine `network-gateway.mjs` → TCP → `run.py`. It passes when `0x2002` and then `0x2003` arrive
with consecutive params. No browser is involved: Node 24 has a global `WebSocket`, which Emscripten's
`libwebsocket.js` uses as is (no `ws` package needed).

```sh
emcmake cmake -S . -B build-web && cmake --build build-web --target gate_hello_ws
GATEWAY=/path/to/network-gateway.mjs platform/tests/ws_e2e/run.sh   # starts gateway + server, runs, stops both
```

`run.sh` takes `NODE` (Node ≥ 22), `YO2EMU` (default `YOLaucher-web/tools/yo2emu`) and `BUILD` (default
`build-web`). It refuses to start if port 5730 or 8001 is already in use.

Gateway: Boxedwine master `2dbabfc`, `project/emscripten/network-gateway.mjs`. Keep its `network-gateway/index.html`
next to it, because it reads that file at startup. Run it as `node network-gateway.mjs --port 8001 --allow-origin none`.
Node's WebSocket sends no `Origin` header, and the gateway accepts a missing origin only when `none` is allowed.

Manual run: `node build-web/platform/gate_hello_ws.js [ws://127.0.0.1:8001/boxedwine-network] [127.0.0.1] [5730]`.
