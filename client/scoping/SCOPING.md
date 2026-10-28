# yo2.exe decompilation: scope and estimate

Goal: C++ source that builds into a working YO2 client, first as a Windows exe and then natively for the browser
(Emscripten + WebGL/WebSocket), with no emulator. Measured on `yo2.exe` Ver.080912 (SHA-256 `d25d4b13…`), 2026-10-25.

## Bottom line

| Variant | One developer, full time, with AI drafting | Team of 3 |
|---|---|---|
| **Working rebuild** (same behaviour, not byte-identical) | **~23 months** (range 16–29) | ~9–12 months |
| Byte-identical ("matching") rebuild | 3–5+ years | 1.5–2.5 years |

A browser build only becomes possible at 100% coverage. Until then the replaced functions run inside the original
x86 exe. In the earlier conversation I guessed 6–12 months for one developer. The measured numbers below put it at
roughly twice that.

## What's in the exe

| Part | Functions | x86 code | Work |
|---|---|---|---|
| Compiler-generated `Unwind@`/`Catch@` stubs, thunks | 35,044 | 287 KB | none (the compiler regenerates them) |
| **yaneSDK** (Japanese game SDK, public domain, source in [OpenJoey](https://github.com/derplayer/OpenJoey)) | 2,990 | 1.0 MB | reconcile with source; Konami patched it (e.g. `merge.dat` loading, fonts) |
| CRT, Dinkumware STL, libpng 1.0.5/1.2.10, libjpeg, zlib, D3DX | ~1,935 | ~0.36 MB | use the real libraries / a modern runtime |
| **Game code** (`C:\yugionline\yo2\client\src\…`) | 10,946 | 4.2 MB | **decompile** |
| of which unique bodies (template copies removed) | **6,838** | **3.7 MB** | |

How these were measured ([tools/](tools/)):

- Ghidra 12.1 headless analysis, plus 3,960 virtual methods Ghidra missed. Those were recovered from the MSVC RTTI
  structures (1,109 classes with vtables, `vtables.py`).
- yaneSDK was identified two ways: its 115 RTTI classes match the v2 headers, and 92% of the strings in its code
  region occur verbatim in yaneSDK v2 source (a known game region scores 2%). The libraries are identified by their
  error strings, plus the linker placing them after the last game object.
- Template copies were counted by hashing each function body with call targets and image addresses masked
  (`dedupe.py`).
- The Rich header shows a Visual C++ 6.0-era toolchain, which decompilation tools support if a byte-identical build
  were ever the goal.
- YOLaucher's notes already document 611 game functions, mostly network and duel code.

Game code by original source folder (approximate, attributed from assert paths): System 4.2k (D3D wrapper, task
framework, UI windows), Game 1.6k, duel 1.0k, Deck 0.9k, Swf (in-house Flash player) 0.4k, Net 0.4k, Lobby 0.3k,
Test 0.3k (debug screens, droppable), then shop, Pack, MyRoom, Tournament and 15 small folders.

Unique game functions by size:

| Bytes | Functions | Hours each (dev + AI) | Hours |
|---|---|---|---|
| < 32 | 1,005 | 0.05 | 50 |
| 32–128 | 1,870 | 0.15 | 280 |
| 128–512 | 2,360 | 0.35 | 830 |
| 512–2K | 1,280 | 0.8 | 1,020 |
| 2K–8K | 266 | 2.5 | 665 |
| > 8K | 57 | 6 | 340 |
| | | | **≈ 3,200 h** |

## Pilot (calibration)

- **The wire codec was rewritten and verified.** `FUN_00689ea0` (receive, 908 B) and `FUN_0068a320` (send, 407 B)
  are now [`pilot/ygpacket.cpp`](pilot/ygpacket.cpp). They keep the original object layout (`static_assert`ed) and
  return codes, and the socket is a callback, so the same code can run over a WebSocket. The test runs 203 packets in
  three chunkings and they are byte-identical to `proto.py`; bad-MD5, oversize-length and EOF errors also match
  (`python3 -I pilot/test_ygpacket.py`).
  This was the best case: the protocol was already documented, so the work took minutes. That's roughly 4 KB of x86
  per hour.
- **10 random game functions** (27 B to 2.6 KB) were decompiled to see typical output. Large functions are mostly
  inlined boilerplate: assert macros carrying `__FILE__`/line, `dynamic_cast` through RTTI, inlined `strlen`, string
  temporaries. Once the shared headers and macros (`TaskPtr<T>`, assert, logging) are recreated, these functions
  shrink several-fold in source. The real cost is recovering class layouts and what each callee does.
  The table above works out to about **1.2 KB of x86 per hour** overall, a third of the best case, which is
  consistent with that.

## Phases (one developer)

| Phase | Weeks | Notes |
|---|---|---|
| 0. Foundation | 6–8 | Headers for the 1,109 classes, macros, a function-replacement DLL (the OpenRCT2 approach: the game keeps running while functions are swapped), differential tests (YOLaucher `fake_client`/`paridad`, recorded inputs) |
| 1. yaneSDK | 2–4 | Find the exact v2 release, diff Konami's changes |
| 2. Game code | 55–103 (central 80) | Folder by folder; Net and duel first (best documented) |
| 3. Platform port | 6–10 | yaneSDK backends → SDL; the game's `CD3DDevice` wrapper → WebGL2/WebGPU; WinSock → WebSocket (the `YgTransport` seam); drop the WinINet updater; IMM32 → browser text input; MSACM → software decoding; files → lazy fetch |
| **Total** | **~70–125** | ≈ 2,800–5,000 h; central ≈ 3,900 h |

The API the port has to replace is small: 323 imported functions (146 kernel32, 66 user32, 30 gdi32, 27 winmm,
13 wsock32, 10 wininet…). Direct3D enters only through `Direct3DCreate8`, and DirectInput, DirectSound and
DirectShow are loaded dynamically inside yaneSDK.

## What would move the number

- **Automated differential testing** (run original and rewritten functions on the same recorded inputs in an x86
  emulator such as Unicorn) would let AI agents rewrite and self-check most functions without a human. That could
  plausibly halve phase 2, but it's unproven here.
- **Dropping the `Test/` debug screens and unused features** saves roughly 3–5%.
- Hand-written x86 or self-modifying code would make things worse. None was seen in the samples.

## Legal

Decompiled Konami code is fine to work on privately. Publishing it is legally grey: decompilation projects publish
code without assets, but that has not been tested in court for this game. This fork currently contains only tooling,
counts and a clean-room codec that was already public through `proto.py`. No decompiler output is committed.
