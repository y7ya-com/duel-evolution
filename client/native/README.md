# native/ — yo2native: everything rewritten so far, as one native exe

One macOS/Linux executable made from all of `yo2core` (`src/**`, force-loaded), yaneSDK and the platform layer.
Every function the rewrite calls that nobody has written yet is a generated stub that logs its first call. The stub
log from a boot run is the live work order.

```sh
cmake -S . -B build && nice -n 19 cmake --build build -j2 --target yo2core
nice -n 19 python3 -I native/gen_stubs.py build      # links yo2native, writes the stubs, links again (~2 min)
# boot from a folder holding merge.dat, DATA.dat, Sound.dat, TestData.dat and a copy of system.bin
YO2_HIDDEN=1 SDL_AUDIODRIVER=dummy YO2_STUBHITS=stubhits.tsv python3 -I tools/memcap.py --mb 1500 build/native/yo2native
```

- `gen_stubs.py` reads ld's "Undefined symbols" report. Each stub's return type is `decltype` of the same call,
  so no signature is written by hand. Each stub file uses the calling source's own includes. What won't compile typed
  (templates, a base without a default constructor, a declaration inside a .cpp) becomes a raw asm-named stub that
  returns 0. Careful: a raw stub for a function that returns a class by value leaves that object uninitialised. The
  full list is `build/native/stubs/stubs.tsv`: address, kind, owner, raw, name, caller.
- Stub kinds (`stubhit.h`):
  - **todo**: not written yet.
  - **glue**: the address *is* written, but the caller declares its own stand-in (e.g. Deck's
    `elemShow(void*, bool, bool)` for `CElement::setDisp`), so the call needs a forwarder or the real header.
  - **noaddr**: the stand-in's declaration has no `// 0xADDR` comment.
- The owner comes from `ASSIGNMENTS.tsv` by address.
- A crash adds a `CRASH` row naming the last new stub, and prints a backtrace on stderr.
- `main.cpp` stands in for the CRT start-up and calls `yo2WinMain` (0x606ab0).
- `app_glue.cpp` / `yane_glue.*` implement System's "outside world" calls (`src/System/yo2App.h`'s yaneSDK and Win32
  side, `yo2LoadFile`) on the real yaneSDK. `yane_glue.cpp` compiles in yaneSDK's own language mode. The
  `yo2App.h` half switches on once that header is on main.
- With `YO2_HIDDEN`, message boxes go to stderr instead of opening on screen.

## State (2026-10-27)

- **main** links: 769 stubs, 707 typed and 62 raw. 218 are glue, 236 todo, 315 have no address. Boot stops at the
  first call: `yo2WinMain` lives in `src/System/yo2App.cpp` on the unmerged phase2-system branch.
- **main + phase2-system** (local throwaway branch `native-exp`, commit 5cb4c6d1):
  - The boot goes WinMain → yaneSDK init → window → `CAppBase::ThreadProc` → `CApp::mainThread`.
  - It passes 18 stubs: config/registry, file language, card and pack text, sound volume.
  - Then it dies (SIGSEGV) where CApp creates the five Net connections: `yo2NewNetGate/Lobby/Usb` are todo, and
    `yo2NewNetAccount/Duel` are glue, so all of them return null. That log is `yo2-decomp-data/trace/stubhits.tsv`.
