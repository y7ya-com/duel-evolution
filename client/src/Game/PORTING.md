# Porting src/Game (and MyRoom, ChangeAvatar, PlayerSelect)

How the game's world/avatar code is being rewritten. The worked example is `yo2PlayerBin.{h,cpp}` +
`tests/game/pbin_test.cpp`.

## Reading the original
- `python3 -I tests/game/dc.py --file Game/yo2Foo.cpp` prints every function of that .obj block in link order
  (= the original source order), with the MSVC6 noise folded: std::string from a literal, refcount releases, EH frame
  bookkeeping, the assert box (`ASSERT_BOX(flag, line)` + `exit(1)`), strlen loops. Callees are named from every
  `// @yo2` marker in the tree and from known CRT functions; data strings are shown inline. The block's first
  functions (the ctor, inline virtuals, `atexit` stubs) have no path string: check where it really starts.
- `python3 -I tests/game/dc.py 0xADDR ...` for single functions; `python3 -I tools/decomp.py 0xADDR` for raw text.
- Ghidra hides x87 code and sometimes stack layouts: `i686-w64-mingw32-objdump -d -M intel
  --start-address=0x.. --stop-address=0x.. ../yo2-decomp-data/yo2.exe` settles it (e.g. float constants, which
  stack slot is which record field).
- Class sizes, vtable slots and field offsets: `include/yo2/<Folder>/<Class>.h` (generated; don't edit it). Report
  header problems in `src/Game/HEADER_ISSUES.md`.

## Writing the rewrite
- One `src/Game/<sub>/yo2Foo.{h,cpp}` per original .cpp, mirroring `client\src\Game\...` (`Avatar/`, `AreaMap/`).
- Classes derive from the System framework on this branch: `src/System` (`CTask`, `CEasyTask`, `CElement`,
  `CTaskPtr<T>`, `vc6::string/list/vector/map` with the exe's layouts, `YO2_ASSERT`, `yo2Trace`, `yo2Format`). Override
  the framework's virtuals (`onInit`, `onMain`, `onDestroy`, `draw`, ...) instead of the generated `CEasyTask_vf03`.
- Keep the exe's layout: same members at the same offsets, pinned with `YO2_AT(Class, member, 0xOFF)` and
  `YO2_SIZEOF(Class, 0xSIZE)` (they only fire on i686). Use vc6:: containers where the exe has MSVC6 containers.
- Names are ours (descriptive camelCase), RTTI class names unchanged. Clean C++, not Ghidra output.
- Every rewritten function gets `// @yo2 0xADDR <Class::method + short note>` on the line above its definition (an
  inline one in a class body too). Deleting destructors share the destructor's line (see yo2PlayerBin.cpp).
- Data files: through `Game/yo2GameData.h` (`GameFile::read` + `readLine`, or `gameReadFile`), never fopen.
- Things other owners rewrite (Net's CPlayerBinData, the text manager, D3D textures, Swf, sound, CGameMng if it isn't
  yours): declare the smallest interface you need in your own header, with a `// TODO(<owner>)` comment, and implement
  a stub in the test. Don't define another owner's class. Prefer plain functions over hook pointers.
- Don't touch `src/System`, `src/Net`, `include/`, `third_party/`, `platform/`, `tools/`.

## Checking it
- `tests/game/<foo>_test.cpp` per file, run by `python3 -I tests/game/run.py [filter]`: host build with ASan/UBSan
  plus an i686 compile (layout asserts). Every function needs a check that would fail if its logic broke. Use the
  real game data where the code reads it (`mergeProvider` in `tests/game/game_test.h` reads merge.dat lazily; it is
  ~700 MB, never load or copy it whole).
- Functions that only do UI/rendering glue with nothing observable on the host still get a test of what is
  observable (task tree, fields, messages sent).
- Memory: check `memory_pressure | tail -1` before builds; stop below 45% free. No Ghidra.
