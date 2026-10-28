# client/ — the recompiled and hand-decompiled game client

A working (not byte-identical) C++ reimplementation of the *Yu-Gi-Oh! Online 2: Duel Evolution* client,
`yo2.exe` Ver.080912. The goal is to build it natively, and then for the browser (Emscripten + WebGL + WebSocket),
against the YOLaucher server emulator. Scope and estimate: `scoping/SCOPING.md` (moved here from the public YOLaucher fork).

**No game files here.** Konami's binaries and everything extracted from them (yo2.exe, merge.dat, the Ghidra
project, the decompiled cache, generated C) are never committed: supply your own (see the root README). The shared, unversioned data (the exe, the Ghidra project, the decompiled cache) is in
`../yo2-decomp-data/` (see its README.txt).

## Layout and owners (one writer per directory)

| Path | Phase | What |
|---|---|---|
| `harness/` | 0a | Function-replacement DLL (swap original functions in the running exe), differential tests (Unicorn: original vs rewrite on the same inputs), Boxedwine runner |
| `include/` | 0b | Class headers for the 1,109 RTTI classes: hierarchy, vtable order, field layout (`static_assert` offsets) |
| `third_party/yanesdk/` | 1 | yaneSDK v2 reconciled with the exe, plus Konami's local changes |
| `platform/` | 3 | Backends: SDL2 window/input/audio, WebGL2 renderer behind the game's D3D wrapper, WebSocket transport, lazy file fetch |
| `src/<Folder>/` | 2 | Game code, mirroring the original `C:\yugionline\yo2\client\src\<Folder>` layout. Each folder has its own owner |
| `tools/` | all | Shared tools; change these only on `main` |

## Conventions

- **Every reimplemented function gets a marker** on the line above its definition: `// @yo2 0x00689ea0 <short note>`.
  `python3 -I tools/coverage.py` counts these markers. Template copies share one marker for each address they replace.
- Keep the original data layout wherever the game or the harness depends on it, and pin it with `static_assert(offsetof(...))`.
- Use RTTI class names unchanged (`CNetLobby_CreateRoom`). Method names are ours: descriptive, camelCase.
- Rewrite into clean C++. Don't paste Ghidra output verbatim; it's a reading aid.
- Each function lands with a check: a differential test (preferred), or a deterministic test against YOLaucher's
  `proto.py` / `fake_client.py`.

## Tools

```
python3 -I tools/decomp.py 0x689ea0            # metadata + cached decompiled C for one function
python3 -I tools/decomp.py --class CDuelScene  # a class's vtable functions
python3 -I tools/coverage.py                   # progress by part / source folder
python3 -I tools/coverage.py --missing duel    # what's left in src/duel
python3 -I tools/ghidra.py <Script.java> ...   # ONLY way to run Ghidra (machine-wide lock, 2.5 GB cap)
python3.12 -I tests/test_ygpacket.py           # pilot: wire codec vs proto.py
cmake -S . -B build && cmake --build build      # native (macOS): platform tests in build/platform/
EMSDK_PYTHON=/opt/homebrew/bin/python3.12 emcmake cmake -S . -B build-web && cmake --build build-web   # wasm
```

Brew's emscripten otherwise picks Xcode's Python 3.9 and fails, so set `EMSDK_PYTHON` as above.

## Memory rules (a 16 GB Mac shared by several sessions; an earlier test crashed it)

- Run Ghidra only through `tools/ghidra.py`, and prefer the decompiled cache.
- Check `memory_pressure | tail -1` before anything heavy, and don't start it below 40% free.
- Never load the game client in a browser or Boxedwine-web from a session. The native Boxedwine runner is the
  harness owner's job, one instance at a time.
- Don't keep extra copies of the 1.1 GB game data. Read it from `../yo2-decomp-data` or the original `.7z`.

## Cloud workers (`cw-*`)

Cloud workers bulk-rewrite functions in parallel:

1. **Setup:**
   ```
   git fetch origin data && git worktree add ../yo2-decomp-data data
   export YO2_DATA=$PWD/../yo2-decomp-data YO2_EXE=$YO2_DATA/yo2.exe
   ```
   Then `apt-get install -y mingw-w64 cmake` and the harness venv (`harness/README.md`).
2. **Scope:** `python3 -I tools/coverage.py --assigned <your cw-name>` lists your functions: the rows of
   `ASSIGNMENTS.tsv` (address range + folder) minus what's marked on main or listed in `DONE_ELSEWHERE.txt`. Rewrite
   only those.
3. **Files:** only NEW files, `src/<Folder>/cw_<name>_<topic>.cpp/.h` and `tests/cw/<name>_*`, plus difftest cases
   under `harness/difftest/cases/` named `cw_<name>_*`. Never edit an existing file. Use class declarations from
   `src/` headers if they exist, otherwise from `include/yo2/`. Anything that needs a change in someone else's file
   goes in `src/<Folder>/cw_<name>_NOTES.md`.
4. **Verify:** every function gets a `// @yo2 0xADDR` marker and a difftest case wherever it can be called in
   isolation. Run tests through `tools/memcap.py`.
5. **Ship:** commit to branch `cw/<name>` and `git push origin cw/<name>` often (every ~50 functions). Never push to
   main; the coordinator merges.

## Branches

Each session works in its own git worktree on its own branch (`phase0a-harness`, `phase1-yanesdk`, ...) and
commits there. Merges into `main` happen in the coordinating session.

## Scope: only what the game needs to play

The work order is `yo2-decomp-data/trace/WORKORDER.tsv` (`python3 -I tools/workorder.py` regenerates it, with a summary
in `WORKORDER.md`). It lists every game-code function, layered by how the traced play-through (boot, title, login,
My Room, lobby, NPC dialog, shop, deck editor, NPC duel) reaches it:

| layer | what | core? |
|---|---|---|
| 1 | ran in the trace (`via=init`: a global's dynamic initializer, which becomes a C++ global definition) | yes |
| 2 | called directly by code that ran | yes |
| 3 | virtual method of a class whose vftable code that ran loads | yes |
| 5i | function pointer held by code that ran, or in a data table with a ran entry | yes |
| 4 | referenced only from code that didn't run: unplayed features | later |
| 5d | no reference at all: dead | no |

Rewrite only `core` rows, in the file's order: by phase (boot → title → login → My Room → lobby → shop → deck → duel),
then folder, then address. `python3 -I tools/coverage.py --assigned <owner>` lists your rows in that order. Layer 4
waits until the core runs. Rows with status `hdr` are compiler/header boilerplate copied into every object (initializer
stubs, guarded statics, atexit callbacks, scalar deleting destructors): the header owner (phase0b-headers) marks them
as lists, so nobody else rewrites them. A folder replaced wholesale instead of decompiled (Swf: a clean player behind
the game's interface) lists the addresses it replaces in `src/<Folder>/REIMPLEMENTED.txt`, which counts them as done. Islands (`island_<addr>`: code Ghidra never made a function) have no cached decompile;
use `third_party/yanesdk/match/DecompileAt.java` through `tools/ghidra.py`.

Skip code the rebuilt game doesn't need: `src/Test` (debug screens), `src/Patcher` (updater), debug/dump/trace helpers,
developer-only windows (e.g. CWindowTaskDebug, CTaskCapture). Their rows say `skip`. Stub them where something calls
in, and list the skipped addresses in the folder's `SKIPPED.md`.
