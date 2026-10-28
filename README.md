# Duel Evolution

A revival of the 2008 online card-dueling client *Yu-Gi-Oh! Online 2* (Duel Evolution), playable again at
https://original.ygoevolution.com/.

- **The client** is the original `yo2.exe` (Ver.080912), statically recompiled from x86 to C, then compiled to
  WebAssembly (browser) and native code (macOS/Linux/Windows). A small Win32 stand-in runtime and platform layer
  (SDL2, WebGL, WebSocket) replace Windows. Functions are progressively replaced by a hand-written C++ decompilation.
- **The server** is a new TypeScript implementation of the game's protocol on Cloudflare Workers, Durable Objects and
  D1, with duels run by OCGcore (WebAssembly).

> **Disclaimer.** This is a fan preservation project, not affiliated with or endorsed by Konami or any rights holder.
> Yu-Gi-Oh! is a trademark of its respective owners. **No game files are included**: no executables, archives,
> images, audio, fonts or data tables from the original game. To build or run the client you must own the game and
> supply your own `yo2.exe` Ver.080912 and its data (`merge.dat`, `Sound.dat`).

## Layout

| Path | What |
|---|---|
| `client/recomp/` | the static recompiler (`gen.py`, `emit.py`, `cfg.py`, `hooks.py`, …), its runtime (`rt/`), overrides (`ovr/`) and the web build's JS (`web/`) |
| `client/src/`, `client/include/` | the hand decompilation (C++), class layouts and generated headers |
| `client/platform/` | Win32/D3D8/DirectSound/WinSock stand-ins over SDL2, OpenGL/WebGL and WebSocket; the virtual file system |
| `client/native/`, `client/CMakeLists.txt` | the native build of the decompiled client |
| `client/harness/`, `client/tests/` | differential tests (decompiled vs original, under Unicorn/Boxedwine) and unit checks |
| `client/third_party/` | yaneuraoGameSDK 2nd (with the game's changes reconstructed), see *Licences* |
| `client/web-shell/` | the site's page shell: `index.html`, `stage.js` (fit to window, full screen), `loader.js` (loading screen) |
| `client/html-ui/` | HTML/CSS rebuilds of in-game dialogs, checked by pixel diff against the client |
| `client/tools/`, `client/scoping/` | decompilation tooling (Ghidra scripts, coverage, work order) and the original scoping notes |
| `server/` | the TypeScript server (`DESIGN.md`, `AUTH.md`, `DEPLOY.md`) |
| `infra/` | `ship-client.sh` (web client to R2), `fetch-private.sh` (maintainers' copy of the generated data) |

## Files you supply

Everything below is Konami's or derived from Konami's files, so it is never committed (`.gitignore` keeps it out).
Maintainers with access to the site's Cloudflare account get the generated ones with `infra/fetch-private.sh`
(R2 `ygo-original/private/dev/`); everyone else regenerates them from their own copy of the game:

| Not in the repo | How to get it |
|---|---|
| `yo2.exe` Ver.080912, `MagicKey.dll`, `merge.dat`, `Sound.dat`, other `*.dat` | your own install of the game. Put them in one folder: `YO2_GAME` (client) and `YO2_DATA` (tools, default a sibling `yo2-decomp-data/`) point there |
| `client/recomp/out/` (generated C, ~150 MB) | `cd client/recomp && .venv/bin/python gen.py` (reads `$YO2_DATA/yo2.exe`) |
| Ghidra project, `functions2.jsonl`, `decompiled/`, `labels.tsv`, `vtables.tsv` | `client/tools/ghidra.py` + `client/tools/ghidra_scripts/` (headless Ghidra over your `yo2.exe`) |
| `server/gamedata/*.json` (lobby, shop, persist, ydc, translator, brain, duel tables) | the generators in `server/scripts/` from an extracted client and EDOPro's `cards.cdb`: see `server/gamedata/README.md` |
| `server/gamedata/engine/` (cards, strings, scripts pack) | `node server/scripts/engine_gamedata.mjs` (EDOPro `cards.cdb`, `strings.conf`, CardScripts) |
| `server/gamedata/fixtures/` (parity recordings) | `server/scripts/*_record.*` against the Python reference server |
| `client/html-ui/assets/`, `golden*/`, `diff*/` | `client/html-ui/tools/extract_assets.py <merge.dat>`; goldens with `tools/capture_signin.py` / `tools/grab.py` from your build; diffs with `tools/diff.mjs` |
| `client/web-shell/loader/` (loading-screen art: `abmake_bg_*.png`, `menu_mark_a01_*`, `ring.json`) | the PNGs from `merge.dat` (`data/common/`), `ring.json` from the menu mark movie with `client/web-shell/swf2json.py` |
| fonts (DejaVu Sans, used for GDI text) | download DejaVu Sans; the web build serves it from `fonts/` |

## Building

### Client, native

```sh
cd client/recomp
python3 -m venv .venv && .venv/bin/pip install capstone pefile unicorn   # once
.venv/bin/python gen.py                                                    # generated C into out/
make -j4                                                                   # build/yo2rc
YO2_GAME=/path/to/game build/yo2rc
```

`client/recomp/README.md` has the details (environment variables, fast rebuilds, the differential test).
`client/tools/buildslot.py` is an optional wrapper that caps CPU and memory for long builds.

### Client, web

Needs Emscripten and a browser with JSPI and cross-origin isolation (current desktop Chrome or Edge).

```sh
cd client/recomp
make -j4 web                                          # build-web/yo2rc.{html,js,wasm}
YO2_GAME=/path/to/game node web/serve.mjs             # http://127.0.0.1:8780/ with COOP/COEP headers
```

### Server

Node 22 and pnpm. The server imports `server/gamedata/` (see *Files you supply*), so generate or fetch it first.

```sh
cd server
pnpm install
cp .dev.vars.example .dev.vars     # local-only secrets and Cloudflare's always-pass Turnstile test keys
pnpm db:migrate:local
pnpm dev                           # wrangler dev on http://localhost:8787
pnpm typecheck && pnpm test
```

Duels need the engine data in the (local) R2 bucket:
`npx wrangler r2 object put ygo-original/duel-evolution/engine/<file> --file gamedata/engine/<file> --local` for
`cards.json`, `strings.json` and `scripts.pack`.

### Pointing a client at a server

The client reads its server settings from environment variables. In the browser they come from the page's query
parameters (`client/recomp/web/lazyfs.js`):

| Variable | Query param | Meaning |
|---|---|---|
| `YO2_HTTP` | `http` | base URL for the game's HTTP (updater) requests |
| `YO2_GATEWAY` | `gateway` | WebSocket URL of the game channel (the server's `/net`) |
| `YO2_SERVER` | `server` | every game socket connects to this host |
| `YO2_PORT_OFFSET` | `YO2_PORT_OFFSET` | added to the game's ports (the server uses 1000) |

For a local server:
`http://127.0.0.1:8780/yo2rc.html?http=http://localhost:8787&gateway=ws://localhost:8787/net&server=127.0.0.1&YO2_PORT_OFFSET=1000`.
The site's own `client/web-shell/index.html` fills these in from its origin. A native client speaks plain TCP;
`server/parity/bridge.mjs` relays it onto the server's WebSocket.

Sign-in uses accounts on the server (better-auth): Discord OAuth, or a username and password verified through
Discord. A shared Discord bot forwards the `/verify` and `/reset` commands to the server, HMAC-signed
(`server/AUTH.md`).

## Contributing

Issues and pull requests are welcome; `CONTRIBUTING.md` has the details. Enable the guard once per clone:
`git config core.hooksPath .githooks` (needs `gitleaks`). It refuses game files, extracted data, binaries, files over
1 MB and secrets on every commit and patch (`infra/guard.py`); CI runs the same checks.

- Never commit game files or anything extracted from them (see *Files you supply*). The `.gitignore` covers the
  usual paths; check `git status` before you commit.
- Every change to the decompilation lands with a check: a differential test against the original function
  (`client/harness/difftest`) or a deterministic test (`client/tests/`).
- Server changes keep `pnpm typecheck` and `pnpm test` green; protocol changes keep parity (`server/parity/`).
- Keep the user-facing name "Duel Evolution".

## Licences

Our code is under the MIT licence (`LICENSE`). Third-party code in this repository keeps its own licence:

| Component | Licence |
|---|---|
| `client/platform/third_party/stb_image.h`, `stb_truetype.h` (Sean Barrett) | MIT or public domain (Unlicense), at your choice |
| `client/third_party/yanesdk/` (yaneuraoGameSDK 2nd v1.65, M. Isozaki) | free for any use including commercial, redistribution allowed, copyright stays with the author (`client/third_party/yanesdk/KONAMI_CHANGES.md`) |

Dependencies that are installed, not vendored: OCGcore via `ocgcore-wasm` (AGPL-3.0), EDOPro card data and scripts
(used only to generate `server/gamedata/`), Hono, better-auth, drizzle (MIT), capstone (BSD), Unicorn (GPL-2.0, test
harness only), SDL2 (zlib), Emscripten (MIT/UIUC).

The game itself, its code, art, audio and data are Konami's and are not covered by this licence. The hand
decompilation in `client/src/` reimplements the original program's behaviour for interoperability and preservation.
