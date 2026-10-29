# recomp/ — static recompilation of yo2.exe (x86-32 → C)

Every function of `yo2.exe` (Ver.080912) is translated mechanically into C, N64Recomp/XenonRecomp style, and
linked with a small Win32 runtime into a native executable, `yo2rc`. Hand-decompiled functions from `src/` replace
recompiled ones by address as they mature. **The generated C is Konami-derived: it is never committed (`out/`
is git-ignored); build it from your own yo2.exe.**

## Build and run

```sh
python3 -m venv .venv && .venv/bin/pip install capstone pefile unicorn      # once
.venv/bin/python gen.py                                                      # ~70 s: out/rc_*.c (154 MB, 104 files)
python3 -I ../tools/buildslot.py make -j2                                    # ~5 min at -O1: build/yo2rc, build/rcdiff
python3 -I ../tools/buildslot.py .venv/bin/python difftest.py 400            # recompiled vs original (Unicorn)
cd run && RC_LENIENT=1 python3 -I ../../tools/memcap.py --mb 1500 ../build/yo2rc
```

Environment: `YO2_GAME` (folder with merge.dat etc.; read-only, default `../game`: an APFS clone (`cp -cR`) of the Boxedwine copy, since a rebuilt binary reading inside ~/Library/Containers stalls on a macOS privacy prompt), `YO2_WRITE` (overlay
for anything the game writes, default `./rc-overlay`), `RC_VERBOSE=1` (log files, threads, LoadLibrary),
`RC_LENIENT=1` (an unwritten import logs once and returns 0 instead of stopping; exploration only).
`RC_FASTFORWARD=1` (test runs: virtual time. The main thread's frame-pacing Sleep waits until the other guest threads are idle, then jumps the clock instead of sleeping; only screenshot frames, or every `RC_FF_RENDER`-th, are drawn. A scripted MVP run takes ~80 s instead of ~12 min, with the same frame-numbered RC_INPUT script. Pair it with a test server started through `tools/run_fast.py`, which shrinks run.py's 0.25 s per-message send pause), `RC_TIMESCALE=N` (test runs: the game's clocks run N× faster and its sleeps/timeouts last 1/N; the game paces frames on its clock, so frames come N× faster with the same logic per frame and frame-numbered RC_INPUT scripts stay valid), `RC_SEED=<n>` (every CRT srand uses n: repeatable rand(), e.g. the lobby spawn point for RC_INPUT scripts), `YO2_TEXLOADERS` (texture loader threads, default 4; 128 = the original, each spinning Sleep(1): emit.py `IMM_HOOKS`).

Fast rebuilds: gen.py keeps a per-function cache (out/emitcache.pkl) keyed on the recompiler's code, the exe, the
entry set and the flag-returners, plus the hooks.py entries on each function's own instructions: a warm full regen
takes ~2 s (cold ~110 s), a hook edit re-emits only the functions it touches. Chunks are ~400 KB (411 files; delete
out/chunks.txt to re-cut), the runtime's C is cached objects with header deps, so a one-chunk change rebuilds and
relinks in ~3 s (link alone 0.5 s; Apple's linker is fast enough that lld would not help).
Builds use ccache when it is installed (`brew install ccache`): one cache for all worktrees, so a generated chunk
any session already compiled takes 0.08 s instead of ~2.3 s. gen.py writes only chunks whose text changed.

## Web build (browser MVP, not built yet)

```sh
python3 -I ../tools/buildslot.py make -j2 web                                # build-web/yo2rc.{html,js,wasm}
YO2_GAME=<game folder> node web/serve.mjs                                    # http://127.0.0.1:8780/
node web/serve.mjs --manifest <game folder> > files.txt                      # for a hosted (R2) copy
```

- **Memory**: guest address == wasm address (`rc_mem = 0`). Emscripten's data, stacks and heap sit above 1 GB
  (`-sGLOBAL_BASE=0x40000000`), in a fixed 2 GB shared memory. A guest null access reads wasm address 0 instead of
  trapping.
- **Threads**: guest threads (CreateThread, timeSetEvent) are pthreads on workers and block normally. The guest main
  thread is the browser's main thread under JSPI. It yields (`rt/web.c`) at every Present, at Sleep, GetMessage and
  WaitFor* polls, and after a frame's worth of empty PeekMessage spins. The page must be cross-origin isolated
  (COOP/COEP).
- **Files**: `web/lazyfs.js` mounts each base URL's `files.txt` as lazy MEMFS files at `/game` (and `/fonts`). Reads are
  synchronous 1 MB HTTP Range requests through a 64 MB LRU, so k32io.c's POSIX calls work unchanged. Writes go to
  MEMFS `/overlay` and are lost on reload. Background `fetch()`es keep those synchronous requests rare: merge.dat's
  directory at start, the menus' and deck editor's small regions (~40 MB, pinned), the maps next to the current one
  (the exe's map table) and the lobby avatars, read-ahead after a miss; every chunk goes into the Cache API and the
  last session's working set is loaded from it before main runs. Per player it also learns, from the scene events (ovr/scene.c), which chunks each scene reads (its switch and the stay, up to 48) and which scene follows which; arriving in a scene pins what the next two likely scenes read, and boot fetches its own and the first scenes' sets in parallel. A player with nothing learned starts from defaults taken from a native MVP run (login -> lobby -> NPC duel -> lobby) over the same merge.dat. Requests carry `?v=<ETag>`: a server that answers
  those with `Cache-Control: immutable` lets the browser serve even a synchronous miss from disk, and turns on a
  low-priority trickle of the card art into that cache. `?prefetch=0` turns it all off. Tests: `node
  web/lazyfs_test.mjs`; `node web/lazyfs_replay.mjs <RC_IOTRACE log> <merge.dat> off|on|on-http [state]` replays a
  native run's reads through it with a modelled network and prints the synchronous stalls.
- **Network**: WSOCK32 runs over platform/net's WebSocket gateway (`rt/web_wsock.c`, included by wsock.c, and
  `rt/web_net.cpp`). Every gateway call runs on the main thread, proxied from workers. WININET is a synchronous XHR to
  `YO2_HTTP` + path; that server needs CORS.
- **Config** (query string): `game=`, `fonts=`, `http=` (YO2_HTTP), `gateway=` (YO2_GATEWAY, default
  wss://original.ygoevolution.com/net), `server=` (YO2_SERVER).
- **Known risk**: GL calls from a guest worker thread (a loader thread making textures) have no context there.

## Pipeline

| File | Does |
|---|---|
| `image.py` | PE sections, the full `.reloc` table, imports, function entries: functions2.jsonl (Ghidra + RTTI virtuals), incremental-link thunks resolved, `islands/`, every code pointer held in data (vtables, `__xc` initializer tables, callbacks) |
| `cfg.py` | Recursive descent per function. `jmp` to another entry = tail call. Jump tables = `jmp [idx*4+tbl]` with the table read off consecutive relocations. Code shared between functions is simply decoded into both |
| `emit.py` | One C function per x86 function (below) |
| `gen.py` | Whole exe → `out/`: `rc_funcs.h` (prototypes), `rc_NNN.c`, `rc_table.c` (address → function for indirect calls, IAT slots, weak import fallbacks) |
| `rt/` | Runtime: guest memory, loader, dispatch, x87 helpers (`rt.c`), allocator (`mem.c`), KERNEL32 (`k32.c`, `k32io.c`), cp932 |
| `difftest.py` + `rt/rcdiff.c` | Oracle: random register/stack/arena inputs, original under Unicorn vs recompiled; compares registers, esp, x87 ST0/depth, arena and `.data` writes |

Survey of the whole exe: 40,139 functions (66 more found only as call targets), 1.82 M instructions, 246
mnemonics, 733 jump tables, 141 indirect jumps that are tail calls through function pointers, 7 undecodable spots.

## Model

- **CPU state**: `CPU` struct (8 GPRs, fs base, DF, x87 stack). Functions are `void f_XXXXXXXX(CPU *restrict c)`;
  `restrict` lets clang keep registers in host registers between calls.
- **Memory**: the guest 4 GB lives in one reserved host range; guest address `a` is `rc_mem + a` (`m` is a local copy
  so stores can't alias it). The image is loaded at its original addresses (0x400000); guest heap/VirtualAlloc
  0x10000000–0xF0000000, thread stacks + TEBs from the VirtualAlloc granules (freed when the thread ends). Unmapped pages fault with the guest address printed.
- **Calls**: `call` pushes the real return address and calls the C function; `ret n` pops it and returns. Indirect
  calls/jumps go through `rc_icall`/`rc_ijmp` (binary search over every entry and thunk). IAT slots hold magic
  addresses, so `mov esi, [__imp_X]; call esi` works too. Host code calls guest code with `rc_call`.
- **Flags**: computed only where read (per-function liveness + reaching producers). A `jcc`/`setcc` whose flags all
  come from one cmp/sub/test/and/... computes its condition straight from that instruction's operands (clang turns
  `cmp; jl` back into one compare); everything else uses eager flag locals.
- **x87**: 8 doubles + top; decoded from the opcode bytes (capstone's fsub/fsubr register forms are unreliable).
  64-bit precision instead of 80: the CRT runs at 53-bit precision control anyway (fcw 0x27f), so only exponent range
  and D3D's single-precision mode differ. `fistp` honours the control word's rounding mode (`_ftol`).
- **SIMD**: MMX/3DNow!/SSE appear only in D3DX's CPU-specific paths (~60 functions); `cpuid` and
  `IsProcessorFeaturePresent` report a plain Pentium Pro, so D3DX takes its x87 paths. Those instructions trap.
- **SEH**: fs:[0] frames are ordinary guest memory; `RaiseException`/`RtlUnwind` walk the chain and call the
  handlers (MSVC's own `__CxxFrameHandler` / `_except_handler3`, recompiled).
- **Threads**: real host threads, each with its own CPU, guest stack and TEB; CRITICAL_SECTION = host recursive mutex.

## Status

The whole exe is recompiled and boots natively on macOS: CRT start-up, WinMain, window, D3D8 device on GL, D3DX
textures, then the boot screen is drawn with GDI text, up to the updater's "Failed to connect to server!" (WININET
is offline so far). Difftest: random 353/353, integer-heavy 298/298, x87-heavy 433/438.

Headless run (hidden window, no audio device, screenshots as BMP):

```sh
cd run && YO2_HIDDEN=1 SDL_MAC_BACKGROUND_APP=1 SDL_AUDIODRIVER=dummy RC_FRAMES=200 RC_SHOT=100,199 \
  python3 -I ../../tools/memcap.py --mb 1500 ../build/yo2rc
```

Scripted input (inside the program, never real input): `RC_INPUT="<frame>:<cmd>;..."` with `move x y`, `click x y`,
`down x y` / `up x y` (a `move` in between is a drag: it carries MK_LBUTTON), `dblclick x y`, `rdown`/`rup x y`,
`text abc`, `key enter|tab|bs|esc`, in game pixels. `RC_INPUT_FILE=<path>`: commands appended to that file (one per line) run as they arrive, and a line `shot` saves a screenshot, so a driver can steer a long run live (the two-client PvP duel: `run/pvp`, scripts in the coordinator's notes). Every 300 frames the log prints the wall-clock fps. Against a test run.py on a port offset (its own copied state):
`YO2_PORT_OFFSET=300 YO2_HTTP=127.0.0.1:9030 YO2_SERVER=127.0.0.1` (only the exe's own ports 5730–5799 are shifted).
Title → ONLINE (512,458) → User ID (488,368) / Password (488,432) → OK (415,492) logs in by frame ~3000 (no rules page
any more: rt/debrand.cpp).
`walkto exit N [frames]` / `walkto X Y [frames]` walks the avatar in world pixels: it holds the right button and steers
the cursor along a BFS path over the map's atari (collision) colours, until the exit is taken, the point is reached or
the timeout passes; a walkto given while one runs is queued. Card shop from the Store lobby (Map_a02):
`walkto 1200 880 1500;walkto exit 2 1200` (the mat under the stairs). `+N:cmd` runs N frames after the last queued walkto
ends, so the shop clicks follow the walk whatever its length (each with a `move` 10 frames before: the Swf buttons
need the hover first): Sadie (712,226) at +500, Booster Packs (530,350) +800, a pack's 200MP button (330,294) +1200,
Confirm (904,502) +1350, Yes (394,560) +1600 opens it.
`walkto npc NAME [frames]` walks to within 90 px of the avatar with that name on the current map (an NPC or another
player; following it if it moves), and `clicknpc NAME` hovers its body, clicks it and clicks its row in the list of
avatars that opens. A-lien's duel from the Store lobby: `walkto npc A-lien 1500;+30:clicknpc A-lien`, then dialog
(512,170) at +690 and +840, Start Duel Yes (427,436) +1140, RPS Rock (250,680) +1700, "First to go" (512,290) +2490
(each with a move first): the duel field by ~3300 frames after the walk.

Sound: DirectSound (`rt/dsound.cpp` → `platform/audio` mixer → SDL audio; on the web SDL's AudioContext resumes on
the first user gesture). `YO2_SOUND=0` mixes on the clock into nothing (no device, identical timing);
`YO2_SOUND_TRACE=1` logs every buffer Play. Headless check without audible output: `SDL_AUDIODRIVER=disk
SDL_DISKAUDIOFILE=sound.raw` (s16 stereo, 44.1 kHz). Verified: the title's looping BGM stream (4 s ring, 22.05 kHz
stereo) from ~7 s on, and the OPTIONS click effect (149,412 bytes, one-shot).

Background audio = slots (`rt/audio.cpp`, `web/audio.js`, `audio-slots.md`): the game's own background audio
(bgm.txt, ids 0x20000000 + n) never plays; request n selects slot n (46), which plays the player's files for it or
nothing (the default; empty "winning", "pinch" and field-spell slots keep the duel's audio, empty jingles keep what
plays). Effects are untouched. Web: `Module.yo2Audio` (web/audio.js: listSlots/set/master/preview/current, files in
IndexedDB, playlists, crossfades; `node web/audio_test.mjs`) under web/audiopage.js. Native: rt/audioslots.h fed by
rt/audioui.c's folders, AudioToolbox decoding; `YO2_AUDIO_DUMP=<file>` writes the mix (f32 stereo).

Web sound effects: `platform/audio/dsound.cpp` mixes on its own pthread into a ring in the (shared) wasm heap, kept
150 ms ahead, and `web/sfx.js`'s AudioWorklet plays it on the browser's audio thread, so a main-thread stall doesn't
reach the output; an underrun fades to silence and never replays (`node web/sfx_test.mjs`). Probes:
`Module.yo2Sfx.ctx`, `.underruns()`, `.stall(ms)`.

A trap prints the guest call stack (the host stack's `f_XXXXXXXX` frames) and exits.

Non-local control flow uses one mechanism. Every `ret` stores the address it popped in `c->ret_to`, and each call
site compares it with its own return address, returning further while they differ. This covers:
- CRT asm that pops its own return address;
- C++ catch continuations, `__except` blocks and `longjmp` targets. These are recompiled as entries, and their
  eventual `ret` unwinds the dead host frames.

## Browsers without JSPI (Safari, Firefox): the ASYNCIFY build

`make web-async` links the same objects with `-sASYNCIFY` instead of `-sJSPI` into `build-web/yo2rc-async.{js,wasm}`,
beside the JSPI build; `yo2rc.html` loads `yo2rc.js` when `WebAssembly.Suspending` exists, else `yo2rc-async.js`
(`?async` forces it, for A/B in Chrome). Ship both. Only the functions in `web/async-only.txt` are instrumented (~50:
the frames on the stack at real yields, recorded with `?yieldlog`; ASYNCIFY_ADVISE would mark all 79k, since every
guest call goes through rc_icall's indirect call, and that 132 MB build doesn't even compile in V8). `web/yieldguard.js`
checks every yield's stack against that list by function index (`web/wasmnames.py`) and skips a yield from any other
stack (logged as "not in web/async-only.txt": add the name and relink). SDL's own sleep in SDL_GL_SwapWindow is off in
that build (`SDL_EMSCRIPTEN_ASYNCIFY=0`, web/asyncguard.js), and its memory is 2 GB - 64 KB: Firefox's WebGL rejects a
heap view of exactly 2 GB.

## Background audio settings

The game ships no background audio; players add their own per slot (title, My Room, lobby, ...). The Main Menu has
an "Audio" entry (`ovr/audiomenu.c`: the exe's never-shown entry 6) that opens the settings. Web: `web/audiopage.js`
(a --pre-js) draws the page over the canvas, the slots grouped and named for players, and drives `Module.yo2Audio`
(`web/audio.js`: decoding, the files kept in the browser's IndexedDB and never uploaded, playback). Native:
`<YO2_WRITE>/audio/<slot>/` folders plus `audio/settings.txt` (`master 0.8`, `<slot> volume 0.7 shuffle 1 loop 1`),
reread on each Audio click, fed to the slot API in `rt/audioslots.h` (until playback links it, `rt/audioui.c`'s weak
stand-ins log the calls). `RC_NOAUDIOMENU=1` leaves the menu as it was.

Sound effects: `ovr/sedefer.c` moves the game's load of all 41 (5.7 MB of Sound.dat, read before the first frame)
to a later Present: on the web once `web/lazyfs.js` has them in memory (`Module.yo2Lazy.sounds()`, fetched in the
background after the first frame), natively at the first. An effect the game plays before that is skipped.
`RC_SE_EAGER=1` loads them at the original point.

## DUELPASS removed (PvP is free)

`ovr/nodp.c`: the owner removed DUELPASS points (DP) from the game. The client's DP gates (FUN_00863ec0 ×3: create /
accept a duel or match, "You do not have enough DUELPASS Points"; FUN_00863750: the own room deleted after a duel) all
read the selected character's balance, account+0x1248, which only 0x4101 and 0x4140 set from the server. The
balance is pinned at 0x7fffffff after both handlers, so no gate trips whatever the server sends. The Main Menu's
DUELPASS entry (the only way into the DUELPASS windows, the only places the balance is shown) is hidden;
`ovr/audiomenu.c`'s showEntry override does it, and arrange() closes the gap. `RC_DP=1` restores both.

## Overrides (stage 3)

Recompiled functions are weak symbols. A strong `f_XXXXXXXX` (an ABI shim reading the guest stack, calling the
hand-written function, popping like the original) replaces it at link time; direct calls and the dispatch table
both pick it up. Caveat: natively the hand code's structs have 64-bit pointers while guest memory holds 32-bit
ones, so drop-in overrides work for pointer-free signatures or in an ILP32 (wasm32) build.

Game-behaviour overrides: `rt/gate.c` (0x82c9c0, the My Room doors): when the gate list holds exactly one lobby
(YOLaucher's `YO2_SINGLE_LOBBY=1`), either door goes straight into it, with no language or room list.

Scene signal: `ovr/scene.c` wraps `CSceneMng::switchScene` (0x61d6a0) for the web loader ring:
`Module.onYo2Scene?.("begin"|"end", from, to)` (SceneId numbers), "end" on the first Present after the switch at which
the screen fader is not fading to or holding black. Begins can come back to back with one end. `RC_SCENE_LOG=1` logs
them natively.

Speed overrides: `ovr/*.c`, linked into yo2rc (native and web) ahead of `librc.a`. `ovr/speed.c` replaces hot
deck-editor paths with equivalents that give the same results: the sprite z-sort on cached keys, the one-texel mouse
hit test, a `__RTDynamicCast` cache, and the exe's debug-check flags set at start (`RC_ASSERTS=1` keeps the checks). An
override that still needs the recompiled original lists its address in `ovr/orig.txt`; `ovr/orig.py` copies those
bodies out of `out/` as `o_XXXXXXXX` at build time. `RC_NOSPEED=1` runs every original and turns the runtime fast
paths (dispatch cache, game-folder listing cache, in-place READONLY locks) off, for A/B runs of one binary.
`ovr/decode.c` decodes the texture manager's PNGs (D3DXCreateTextureFromFileInMemoryEx, 0xb400b3: one level,
A8R8G8B8, no filter, image top left in a power-of-two texture) with stb_image instead of the recompiled libpng;
`RC_DECODE=orig` runs the original, `RC_DECODE=compare` runs both and logs any texel that differs, `RC_DECODE_LOG=1`
times them.
Profiling: `RC_FRAMESTATS=1` logs fps, the worst present-to-present gap and the main thread's CPU per frame every 30
frames; `RC_PROF=<ms>` (macOS) samples the main thread every millisecond and logs the `f_` functions behind any frame
slower than `<ms>`; with `RC_PROF_DUMP=<file>` every sample is also tallied per scene and written at `RC_FRAMES`, and
`tools/profsum.py <file>` ranks the guest functions, host leaves and inclusive frames of each scene;
`RC_PROF_UNDER=f_<addr>` adds the host frames under that innermost guest function to the dump as scene `fff`.
`ovr/path.c` replaces the avatar's walk path search (A*, 0xa04a30), which re-sorted its whole open list after every
step (up to ~300 ms of CPU for one click in a lobby), with a heap that pops the nodes in the same order (~0.6 ms);
`ovr/math.c` replaces D3DX's x87 matrix product (0xb58a89, 6-11% of every scene) with the same arithmetic in C;
`ovr/heap.c` runs the CRT's malloc and free (system-heap mode: wrappers around HeapAlloc/HeapFree, 5-14% of every
scene) as the same rc_halloc/rc_hfree calls in C (`RC_HEAP=compare`); `speed.c` clears text pages with memset, and both sprites' `pixelPtr` (the mouse hit test: 0x589590 and
CD3DSpriteTrans's 0x588a50, ~20% of My Room) lock the one texel instead of mirroring the whole texture (`RC_PIXEL=compare`). The runtime remembers read path lookups (rt/k32.c, dropped on any overlay write;
`RC_PATHS=compare` checks each remembered answer): the exe probes ~4 missing archives per asset, ~1900 per lobby entry;
a read of a file the lookup did not find fails without its stat and open (`RC_PATHS=compare` opens anyway), and reads of
the game folder keep their fd when closed for the next open of that path (merge.dat is reopened for every asset). `RC_ASTAR=compare` / `RC_MATH=compare` run original and override on every call
and log any byte that differs.
Sanitizers: `make SAN=1` builds `build-san/yo2rc` with the runtime, overrides and platform code under ASan+UBSan (run it
with `ASAN_OPTIONS=handle_segv=0:handle_sigbus=0:allow_user_segv_handler=1:detect_leaks=0`: guest faults are ours; under
ASan, Homebrew's sdl2-compat finds SDL3 only through the libSDL3.dylib link the build puts beside the binary).
