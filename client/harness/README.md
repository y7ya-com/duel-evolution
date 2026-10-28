# harness/ — verification for the rewrite (phase 0a)

Three tools, one convention: **a rewritten function is a DLL export named `yo2_<addr>` with the original ABI.**

| Tool | What it answers | Where |
|---|---|---|
| Differential tester | Does `yo2_<addr>` do what the original at `<addr>` does, on the same inputs? | `difftest/` |
| Replacement DLL `yo2rep.dll` | Does the real game still work with the original swapped for the rewrite? | `rep/`, `hooks/` |
| Boxedwine runner | Run the real `yo2.exe` natively on this Mac, with `yo2rep.dll` loaded | `boxedwine/run.sh` |

## Build and test

```bash
cmake -S . -B build-i686 -DCMAKE_TOOLCHAIN_FILE=harness/mingw-i686.cmake -DCMAKE_BUILD_TYPE=Release
cmake --build build-i686                                   # -> build-i686/harness/yo2rep.dll
python3.12 -m venv harness/.venv && harness/.venv/bin/pip install -r harness/requirements.txt   # once
harness/.venv/bin/python -I harness/difftest/run.py        # all cases, ~2 s
harness/.venv/bin/python -I harness/difftest/run.py 0x6022 # filter by name or address
```

The i686 build compiles the whole `yo2core` library (`src/**`) with `i686-w64-mingw32-g++` and links it with
`hooks/*.cpp` and `rep/main.cpp` into a single DLL. The DLL's fixed base is 0x10000000 with no relocations, it links
libgcc and libstdc++ statically, and it uses the UCRT. Wine 11 (Boxedwine 26R1) and Windows 10+ both provide UCRT.

Current result: **40/40 cases pass, 38 functions** (each case covers several inputs):

| Address | Function | Rewrite |
|---|---|---|
| 0x689ea0, 0x68a320 | ygpacket recv / send (pilot) | `src/Net/ygpacket.cpp` |
| 0x68a5a0 … 0x68b1b0 (22) | ygpacket body fields: clear/begin/end, put/get u8/u16/u32 (both overloads), bytes, string, cursor, Blowfish key + cipher | `src/Net/ygpacket.cpp` |
| 0x6a5bc0 | `CMyUser::player(slot)` (thiscall on the sub-object at CNetAccount+0x121c) | `src/Net/NetAccount.cpp` |
| 0x6022b0, 0x6022f0, 0x6024f0 | MD5Init / MD5Update / MD5Final | `src/Net/md5.h` |
| 0xad5920, 0xad5eb0 … 0xad6470 (6) | CPbinDictionary getInfo / initial / kind / slot / nameText / series | `src/Game/yo2PlayerBin.cpp` (Game's `hooks/game.cpp`, `cases/game.py`) |
| 0x603440 | MD5 Encode (words → LE bytes) | `hooks/net.cpp` (test subject) |
| 0x587b80 | `uninitialized_copy` of a 12-byte POD (stdcall) | `hooks/system.cpp` (test subject) |
| 0x59b110 | point-in-rect list hit test (x87 floats) | `hooks/system.cpp` (test subject) |

The adapters are in `hooks/net.cpp`. `hooks/net_platform.cpp` provides src/Net's three platform hooks inside the
exe: WSOCK32 sockets, and connecting through the original thread starter `0x68b7e0`. The "test subject" rewrites move
into src/ once those folders have them; their adapters stay here. `coverage.py` doesn't scan `harness/`.

## HOWTO: add a difftest case for your folder (System, Net/Lobby, duel/Deck, Game, Swf/UI)

Each folder session owns two files, so nobody edits a shared one: `harness/hooks/<folder>.cpp` (adapters) and
`harness/difftest/cases/<folder>.py` (cases). Both are picked up automatically.

**1. The adapter** (`hooks/<folder>.cpp`). It exports the original ABI under `yo2_<addr>`, with lowercase hex and no
leading zeros, and calls your rewrite:

```cpp
#include "../yo2hook.h"
#include "Net/ygpacket.h"
// free function, same signature: forward
YO2_HOOK int32_t __cdecl yo2_68ad90(YgPacket* p, uint32_t* v) { return ygGet32(p, v); }
// the original takes the value by pointer, the rewrite by value
YO2_HOOK int32_t __cdecl yo2_68a8b0(YgPacket* p, const uint32_t* v) { return p && v ? ygPut32(p, *v) : YG_BAD_ARGS; }
// member function: a __thiscall free function receives `this` in ECX exactly like the original method
YO2_HOOK int32_t __thiscall yo2_68e8d0(CNetAccount* self, const CNetGate* g) { return self->connect(g); }
// a method of a sub-object (CMyUser at CNetAccount+0x121c): model the sub-object, its `this` is ECX as usual.
// If your rewrite only has the outer class, convert: ((Outer*)((uint8_t*)sub - offsetof(Outer, sub)))->method()
YO2_HOOK CPlayerInfo* __thiscall yo2_6a5bc0(CMyUser* me, int slot) { return me->player(slot); }
```

The original's convention shows in its `ret`/`ret N` and in whether it reads ECX first (see `yo2hook.h`); the tester
checks your choice. Keep the `// @yo2 0xADDR` marker on the rewrite in src/, not on the adapter.

**2. The case** (`difftest/cases/<folder>.py`):

```python
import random
from core import case, EmuError

@case(0x6a5bc0, conv="thiscall", params=[0, 1, 3, 4])
def account_player(e, f, slot):        # e: this side's Emu, f: this side's function, slot: one param
    acc = e.obj(0x3300, fill=b"\xa5")  # recognisable bytes, so a stray write shows up
    r = f(acc + 0x121c, slot)          # thiscall: the first argument goes in ECX
    return r and r - acc               # return what must match: values, offsets, bytes (not raw stack pointers)
```

**3. Run it:** `cmake --build build-i686 && harness/.venv/bin/python -I harness/difftest/run.py 0x6a5bc0`.

Helpers on `e`, all deterministic and identical on every side:

| Helper | What |
|---|---|
| `e.alloc(n or bytes)`, `e.obj(size, cls=None, fill=None)` | arena memory, compared afterwards. `obj` sets the vptr at +0 to `cls`'s exe vtable (`"CTask"`, `"CNetAccount"`; from include/yo2) |
| `e.read/write/u32/w32` | memory access |
| `e.fn(addr, conv)` | another function on the same side, e.g. a constructor or init step (`e.fn(0x6022b0)(ctx)`) |
| `e.on_addr(addr, fn, nargs, callee_pops=False)` | stub an exe function, say one your function calls and you don't want to run; works on every side |
| `e.on_import(name, fn)` | a Win32 import; WinAPI ones are stdcall with `WINAPI_ARGS` |
| `e.trace.append(x)` | record what a stub saw (bytes sent, a callback's arguments); compared |
| `e.ignore(addr, n)` | bytes that differ on purpose. Write the reason next to it |
| `e.malloc(n)` | the shared heap. The exe's `operator new`/`malloc`/`free` and the DLL's CRT already land there, so allocations get the same addresses on every side, and the heap is compared |
| `e.side` | `"orig"`, `"rewrite"` or `"patched"`, for the rare case where the setup has to differ |

Patterns from `cases/net.py`:
- **A function factory over many addresses**: `put_case(addr, width)`.
- **A sequence on one side**: init, then update, then final. Call it through `e.fn` and return only the result.
- **An exe static the original needs but whose constructor never runs here** (`BF_CTX`): set it up in the case.
- **An expected fault**: catch `EmuError` in the case and return its text. A fault reads `fault: write at 0xc`, and
  the text doesn't depend on eip.
- **Shared state the rewrite keeps elsewhere**: `e.ignore` it, and compare the observable output instead (`cipher_roundtrip`).

What a FAIL looks like: `rewrite result: orig ... rewrite ...`, `trace: ...`, or `0x2000.. : orig <bytes> rewrite
<bytes>` for the first differing byte runs. `orig used 0x.. bytes` means one side allocated more. An
`unstubbed import X` means your code reached a Win32/CRT import with no handler: add one to `_crt()` in `emu.py` if
it's generic (as with `calloc` and `TlsAlloc`), or register it in your case.

## Differential tester (`difftest/`)

**How the rewrite runs:** it's compiled to i686 (the same `yo2rep.dll` that ships into the game) and mapped into
Unicorn as a second image next to `yo2.exe`. I chose this over a native run with a shim because pointers stay 32-bit,
the struct layouts stay those of the original, the calling conventions are real x86, and the binary under test is the
same one the game loads.

Each case runs three times, each time in a fresh `Emu` with identical inputs:

1. `orig`: the original code at `<addr>`.
2. `rewrite`: the export `yo2_<addr>`.
3. `patched`: `<addr>` again, after writing the same `jmp yo2_<addr>` patches that `rep/main.cpp` writes into the real
   process. Original callers then reach the rewrites. For example, the original `ygSend` ends up calling the rewritten MD5.

After each run the tester compares four things: the case's return value, the import trace, the arena (all inputs
come from `e.alloc`, which hands out the same addresses on both sides) and the exe's writable sections (`.data`,
`.idata`, `.data1`). The rewrite is meant to use game globals at their exe addresses, so comparing the exe's
sections covers globals on both sides. Every call also checks the ABI: how many bytes the callee popped
(cdecl/stdcall/thiscall) and whether EBX, ESI, EDI and EBP were preserved. A wrong convention fails with
`ABI mismatch: ...`.

The `Emu` (`emu.py`):
- The images are mapped at their preferred bases. The FS register points at a TEB (for SEH frames), and the FPU
  control word is 0x27F, Windows' 53-bit default, so x87 code rounds the way it does on Windows.
- Every import of both images points at a stub slot. `e.on_import("recv", fn)` runs `fn(e, *args)` there. stdcall
  arg counts are in `WINAPI_ARGS`. Calling an import with no handler fails and names the import. The CRT imports the
  DLL uses (memcpy, memset, malloc, ...) have default handlers.
- `e.on_addr(addr, fn, nargs)` stubs out a callee inside the exe.
- Handlers append what matters to `e.trace` (for example the bytes passed to `send`). The trace is compared.
- `e.ignore(addr, n)` excludes bytes that differ on purpose. Each use needs a comment saying why.

Cases live in `cases/<folder>.py` (see the HOWTO above). `core.py` is the framework, and `run.py` runs everything.

It catches real divergences. These are the ones it found, each one documented where it's ignored:
- **The MD5_CTX count**: the original keeps `count[2]` in bits, and `Md5` keeps one 64-bit byte count at the same offset.
- **The MD5 buffer tail**: the original hashes whole blocks in place, and `Md5` copies every byte through the
  buffer, so the stale bytes after the live part differ. They're never read.
- **MD5Final**: the original wipes the context with `memset(ctx, 0, 0x58)`, and `Md5::final` leaves it.

None of these is visible to the game while the context stays a local, which is the case in ygpacket. If a class ever
embeds an MD5_CTX, `Md5` needs the original layout. Mutating `ygpacket.cpp` (the length limit, one shift) makes the
recv and send cases fail as they should.

Not covered yet (add them when the first case needs them):
- Static constructors. Neither the exe's (`_initterm`) nor the DLL's (`DllMain`/CRT init) run in Unicorn. Set up the
  static yourself (the `BF_CTX` pattern), or call its constructor through `e.fn`.
- Float return values in ST0. There's no reader for them yet. Add one with `UC_X86_REG_FP0`.
- The DLL's own `.data` isn't compared, because it isn't game state.
- Virtual calls from rewrite code into the exe's objects. The i686 mingw build uses the Itanium C++ ABI, where a
  virtual destructor takes two slots, so the slot numbers after it don't match MSVC's (see include/README.md). Code
  that treats `_vtbl` as data, as src/Net does, is unaffected. Real `virtual` calls on exe objects need an MSVC-ABI
  build (`clang --target=i686-pc-windows-msvc`), which isn't set up yet.

## Replacement DLL (`yo2rep.dll`)

**Registering a replacement:** write a free function with the original ABI and export it as `yo2_<hex addr>`
(lowercase, no leading zeros). `yo2hook.h` has the macro and the ABI notes:

```cpp
#include "yo2hook.h"
// @yo2 0x00689ea0 recv
YO2_HOOK int32_t __cdecl yo2_689ea0(YgPacket* p, int sock) { ... }
```

The export is the whole registration. `hooks/*.cpp` is globbed into the DLL. If a game folder's rewrite already has
the original's signature (a member function is `__thiscall` in both MSVC 6 and i686 gcc), the adapter is a
one-line forwarder. If the API changed (ygpacket takes a `YgTransport` instead of a socket), the adapter rebuilds the
original's view. `hooks/net.cpp` shows both. One export can stand in for template copies (0x68a8b0 and 0x68a930).

ABI cheat sheet (from `yo2hook.h`):

| Convention | Arguments | Who pops | Where you see it in yo2.exe |
|---|---|---|---|
| `__cdecl` | stack | caller (`ret`) | most free functions |
| `__stdcall` | stack | callee (`ret N`) | WinAPI, some STL helpers (0x587b80 is `ret 0xc`) |
| `__thiscall` | `this` in ECX, rest on the stack | callee | every non-static member function |
| `__fastcall` | ECX, EDX, rest on the stack | callee | rare (Ghidra prints `__fastcall` for some thiscalls with no args) |

- Return values: EAX, EDX:EAX for 64-bit values, ST0 for float/double. Structs larger than 8 bytes go through a
  hidden pointer, which is the first stack argument (after ECX for a thiscall).
- Callee-saved registers: EBX, ESI, EDI, EBP.
- To pick the convention, look at the original's `ret`/`ret N` and at whether it reads ECX/EDX before writing them.
  The tester then verifies the choice.

**How it loads:** the same way YOLaucher's `yo2net.c` does. `yo2.exe` imports `VERSION.dll`, which isn't a KnownDLL,
so a `version.dll` next to the exe wins. Under Wine this also needs the registry override
`[HKCU\Software\Wine\DllOverrides] "version"="native,builtin"`, applied with `regedit /S`. The environment variable
`WINEDLLOVERRIDES` is ignored. At `DLL_PROCESS_ATTACH`, `rep/main.cpp` does three things:

1. Forwards the 17 `version.dll` exports to the system DLL. These are jmp stubs, as in yo2net.c.
2. `LoadLibrary("yo2net.dll")` if it's present. That's YOLaucher's network DLL, renamed, and its own `DllMain`
   installs the 127.0.0.1 redirects. The two DLLs chain instead of competing for the name.
3. Walks its own export table. For every `yo2_<addr>`, it writes `E9 rel32` over the first 5 bytes at `<addr>`. It
   first checks that the exe's PE timestamp is `0x48fef7e7` (Ver.080912) and that `<addr>` is inside `.text`. All
   callers reach the rewrite, including the ones that go through the exe's `jmp` thunk table at 0x401000.

Controls: `YO2REP=off` loads the DLL but patches nothing, which gives the original game. Unset or `all` patches every
export. `YO2REP=689ea0,68a320` patches only those two, for bisecting a replacement that breaks the game. Each run
writes `yo2rep.log` next to the exe.

Two caveats:
- A function shorter than 5 bytes, or one that something jumps into within its first 5 bytes, can't be patched this
  way. That's rare.
- An unpatched original function that inlined a rewritten one still has the old copy of it.

Status: **it works inside the real game** (Boxedwine run, 2026-10-25, title menu reached). `yo2rep.log` reported
`yo2net.dll loaded (YOLaucher network hooks)`, then `yo2_... patched` ×11, then `11 replacement(s) active`.
`yo2net.log` reported `ganchos OK`, and the updater's `root.txt` request was redirected to 127.0.0.1:8730.

## Running the real exe natively (Boxedwine 26R1, macOS)

Boxedwine emulates an x86 Linux kernel and CPU and runs a 32-bit Wine 11 on top. Use the native macOS build, never
the browser build: in a browser the 1.1 GB of game data lands in RAM.

One-time setup. The app is App-Sandboxed (`com.apple.security.app-sandbox`), so it can only read and write inside its
container. The app itself goes in `../yo2-decomp-data/boxedwine/`, and its data goes in
`~/Library/Containers/org.boxedwine/Data/yo2/`.

```bash
cd ../yo2-decomp-data/boxedwine
curl -LO https://github.com/danoon2/Boxedwine/releases/download/26R1.0/Boxedwine26R1Mac.zip   # 68 MB, notarized
unzip -q Boxedwine26R1Mac.zip
rm Boxedwine26R1Mac.zip
mkdir -p ~/Library/Containers/org.boxedwine/Data/yo2
cd ~/Library/Containers/org.boxedwine/Data/yo2
curl -LO http://boxedwine.org/v2/5/TinyCore15Wine10.0.zip   # 157 MB
```

Use the Wine filesystem that 26R1's own catalog (`boxedwine.org/v2/26R1/filesV2.xml`) installs on Mac, which is
Wine 10.0, `v2/5`. Don't use `v2/22/TinyCore15Wine11.0.zip`: it was built for Boxedwine master. On 26R1 its
explorer.exe spins on "Vulkan not compiled into Boxedwine", RSS reaches 2.4 GB, and no `DllMain` ever runs.

Then run it from the repo root:

```bash
harness/boxedwine/run.sh            # needs ≥ 60% memory free; one instance; stopped after SECS=180 or below 45% free
```

What `run.sh` does:
- Builds `game/` in the container the first time. It takes no extra disk: every file is an APFS clone
  (`cp -c`) of a copy that already exists. `merge.dat` and `merge.log` come from next to the .7z, `yo2.exe` and
  `MagicKey.dll` from yo2-decomp-data, and `Sound.dat` and `TestData.dat` from the 2006 folder. I checked all of
  their CRC32s against the .7z. Writes into a clone never reach the original. Only `system.bin` (628 bytes) differs,
  and it's extracted from the .7z.
- Copies `yo2rep.dll` in as `version.dll`. It also builds YOLaucher's `yo2net.dll` with the flags from its
  `build_dll.ps1`: the build goes to a temp dir and is then copied, because `ld` can't write into the container.
- Writes `yo2.reg` (the `version` native override, plus Direct3D `renderer=gl`) and `run.bat`.
- Runs `Boxedwine -root <root> -zip TinyCore15Wine10.0.zip -opengl osmesa -mount_drive <game> d -w /mnt/drive_d
  -nosound -resolution 1024x768 -env YO2REP=... -env WINEDEBUG=+loaddll -env YO2ONLINE_NET=1 /bin/wine cmd /c run.bat`.
  The native build passes environment variables as `-env KEY=VALUE`; the web build uses `KEY:VALUE`.
- `-opengl osmesa` selects the bundled software Mesa (llvmpipe), which is what the UI picks for non-native OpenGL.
  Mac hardware GL gave WineD3D `NULL GL_RENDERER`, so D3D8 had no adapter.
- At the end it prints the RSS, the `loaddll` lines for our DLLs, `yo2rep.log` and `yo2net.log`.

For the game to get past the updater and connect, start the emulator server first:
`(cd ../YOLaucher-web/tools/yo2emu && YO2_NO_CLIENT=1 python3.12 run.py 0)`.

### Smoke test: `harness/boxedwine/smoke.sh`

One repeatable in-game check of the replacement DLL. It needs ≥ 62% free memory before starting, because the
server takes about 150 MB; otherwise it prints `SMOKE SKIPPED` and exits 2. Each run:
1. Writes a fresh emulator state with a made-up test account (`make_state.py`). The state, log and token files
   (`LOCALAPPDATA`) go in `$TMPDIR/yo2smoke`, never in the YOLaucher repo.
2. Starts YOLaucher's server (`run.py 0`) and stops it again at the end.
3. Plays `script.txt` through Boxedwine's built-in automation player (`-automation <dir>`, passed via `run.sh`
   `AUTOMATION=`). The player feeds X events with SDL scancodes, so macOS input quirks don't apply, and real
   input is ignored while it plays. The script clicks ONLINE, then Weiter on the rules, then types into the login
   fields and clicks OK.
4. Reads the server log and prints the furthest stage reached: `SMOKE reached=<stage> expect=<EXPECT>`. The stages,
   in order, are gate, login, charlist, character, lobby and room. It exits 0 when `reached` is at or past `EXPECT`
   (default `lobby`).

Options:
- `YO2REP=off` runs the same check on the untouched original, for comparison.
- `HOLD=n` keeps the game up n × 5 more minutes, so you can look at it.

Script format: `CMD=value` lines; no blank lines or comments; `WAIT` must be under 300 s; clicks and keys need at
least 1 s between them. Coordinates are guest pixels. A run takes about 5 minutes. After "script: success",
Boxedwine 26R1 aborts in libc++ during its own shutdown (`recursive_mutex lock failed`). That's harmless, because
the result comes from the server log.

Status: it reaches **charlist** with every replacement active. The account server accepts the login (`0x3004 = 0`)
and sends the character list (`0x3012` with the seeded character). Choosing the character, then the lobby, comes next.

Results of the runs on 2026-10-25, the last one on Wine 10 with osmesa:
- yo2.exe loads.
- `version.dll` (ours) loads as native, chain-loads `yo2net.dll`, and patches all 11 functions.
- The D3D8 adapter comes up on llvmpipe (LLVM 19.1.7), and dsound/dinput8 load.
- The updater requests `root.txt`, redirected to 127.0.0.1:8730. With no server running, the game exits right after.
- **With the server running (`YO2_NO_CLIENT=1 python3.12 run.py 0`), it reaches the title menu**, rendered via D3D8 →
  WineD3D → llvmpipe, with all 11 replacements active. RSS is about 790 MB.
- **The pilot holds on real traffic.** With every replacement patched, the client sent `0x2005 "Ver.080912.00"` to the
  gate, and the server logged `md5=ok`. The client then took in the gate's five 1008-byte `0x2003` room lists plus
  `0x2004`, went on to the account server on 5731 (`0x0005`, `0x3001`, `0x3003`), and every packet verified. That
  exercises the rewritten ygSend/ygRecv/MD5 in the live game.
- The login itself was rejected by the server (`0x3004 -240`), because the test account isn't registered in a fresh
  state. To get further, prepare a state the way `fake_client.py` does (`prep_state`).
- Input:
  - Mouse clicks register natively, but the first raw click on a new target only moves the cursor, so click twice.
    The rules screen's "Weiter" works the same way.
  - Text: macOS "type" events carry key code 0, which SDL reads as `a`. Send individual key presses instead.
- The web build reached the title screen but its clicks didn't register; the native build gets through to login.
- The menu is in German. Set the language the way YOLaucher's launcher does.

Hints from the web port (`YOLaucher-web/web/README.md`):
- Sound crashed Boxedwine-web, which is why the runner passes `-nosound`.
- The client shipped with DXVK/d3d8to9 DLLs. The game folder here doesn't include them, so Wine's own WineD3D is used.
