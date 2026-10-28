# Platform layer

What `yo2.exe` Ver.080912 asks of Windows, and what replaces each part in the native build (SDL2 + OpenGL 3.3 core)
and the web build (Emscripten SDL2 + WebGL2 + WebSocket + lazy file reads). Code lives in `platform/`; the
game-side callers in `src/` and `third_party/yanesdk/` belong to their own owners.

**Where we cut.** Two layers.
- **Direct3D: one level up.** The renderer is cut at the game's own wrapper classes (`CD3DDevice` and friends):
  the whole game draws textured quads through about 25 functions in `src\System\`, so a small D3D8 subset on GL
  is enough (§2).
- **Everything else: a scoped Win32 shim.** yaneSDK (Konami's modified copy, `third_party/yanesdk`) *is* the
  boundary, and it calls Win32/DirectX directly. Forking each of its classes would fight the `[Konami]` markers.
  Instead `platform/win32/` provides `<windows.h>`, `<mmsystem.h>`, `<dsound.h>`, `<dinput.h>`, `<d3d8.h>`, …
  for non-Windows builds, covering exactly the calls the code makes (§7), on top of the `platform/` API. It is not
  a general Win32 emulator: one window, no GDI drawing yet, "no device" answers for joystick/mixer/MIDI/codecs.

Status: written and tested:
- `net/`: the transport, native and over the gateway under Node;
- `sdl/`: window, GL context, input pump, time, timers, posted messages;
- `gfx/`: the D3D8 subset + D3DX, §2.4;
- `vfs/`: merge.dat, natively and over HTTP Range, §4;
- `audio/`: the DirectSound mixer;
- `win32/`: the Win32 shim, on which yaneSDK's app/window/input/timer/sound/file classes run unchanged (§7).

Next: the GDI/text cluster (fonts, DIB surfaces, regions). Audio needs no decoders (§7).

## 1. Win32 surface

From the import table (323 imports, `KERNEL32` 146, `USER32` 66, `GDI32` 30, `WINMM` 27, `WSOCK32` 13,
`WININET` 10, `MSACM32` 7, `IMM32` 6, `ADVAPI32` 5, `ole32` 4, plus `comdlg32`, `SHELL32`, `VERSION`, `OLEAUT32`,
`MagicKey.dll` and `d3d8`). The rest is reached at run time:

- **DirectSound, DirectDraw, DirectShow:** `CoCreateInstance` (CLSID_DirectSound, CLSID_DirectDraw,
  CLSID_FilterGraph; their GUIDs are in `.rdata`).
- **DirectInput:** `LoadLibrary("dinput.dll")` + `DirectInputCreateA`.

| Family | Imports (main ones) | Boundary classes | Native | Web |
|---|---|---|---|---|
| Window + message loop | `RegisterClassExA` `CreateWindowExA` `Peek/Get/Dispatch/TranslateMessage` `DefWindowProcA` `SetWindowPos` `AdjustWindowRect` `GetClientRect` `Client/ScreenTo*` `SetWindowRgn` `SetMenu`/`DrawMenuBar` `PostMessageA` `SendMessageA` `PostQuitMessage` `MessageBoxA` | yaneSDK `CAppBase` `CAppFrame` `CAppMainWindow` `CWindow` `CWindowClipper` | SDL window. `platformPump` turns SDL events into Win32 `(msg, wParam, lParam)` triples (`sdl/platform.h`) that feed the game's window procedure unchanged. Posted messages (`WM_USER+…`, socket `0x1401`) go to a FIFO drained in the same pump. `MessageBoxA` → `SDL_ShowSimpleMessageBox` | Same; the loop runs from `emscripten_set_main_loop`. Window shape (`SetWindowRgn`), menus: dropped |
| Timers | `SetTimer`/`KillTimer` `timeSetEvent`/`timeKillEvent` `timeGetTime` `GetTickCount` `QueryPerformance*` `Sleep` `timeBeginPeriod` | `CTimer` `CIntervalTimer` `CAppIntervalTimer` | `SDL_GetTicks64` / `std::chrono`. `WM_TIMER` and `timeSetEvent` callbacks are fired from the pump, never from another thread | Same. `Sleep` in the frame loop becomes "yield to the browser" |
| Keyboard / mouse | `GetAsyncKeyState` `GetKeyState` `GetCursorPos` `SetCursorPos` `ShowCursor` `SetCapture` `ReleaseCapture`; DirectInput keyboard/mouse | `CDirectInput` `ICDirectInput` `CKeyBase` `CMouse` `CMouseEx` `CMouseLayer` | `SDL_GetKeyboardState` mapped by VK code (the `toVk` table); mouse state from SDL. DirectInput devices become reads of the same state | Same (`SetCursorPos` is a no-op) |
| Joystick | `joyGet*`; DirectInput joystick | `CDirectInputJoyStick` `CWIN32JoyStick` `CDIJoyStick` `CJoyStick` | `SDL_GameController` | Same, through the Gamepad API |
| IME / text input | `ImmGetContext` `ImmGetCompositionStringA` `ImmGetCandidateListA` `ImmSet*Window` `WINNLSEnableIME` | `CIME` | `SDL_StartTextInput`, `SDL_TEXTEDITING` (composition) and `SDL_TEXTINPUT` (commit), then converted to the game's ANSI code page (§5) | SDL2's Emscripten backend has no composition events. A hidden `<input>` with `compositionstart/update/end` is needed for CJK input |
| Clipboard | `OpenClipboard` `Get/SetClipboardData` | (chat input) | `SDL_Get/SetClipboardText` | Same (paste needs a user gesture) |
| Text rasterising (GDI) | `CreateFontA/IndirectA` `GetGlyphOutlineW` `GetTextExtentPoint32W` `GetTextMetricsA` `TextOutA/W` `SetTextColor` `SetBkMode` `CreateDIBSection` `CreateCompatibleDC` `SelectObject` `BitBlt` `SetDIBitsToDevice` | `CFont` `CTextDrawBase` `CTextDIB32` `CTextFastPlane` `CD3DTextTexture` `CD3DTextSprite` | stb_truetype with a bundled font whose metrics are close to MS Gothic/MS UI Gothic (pick an OFL font: IPAex Gothic or M+). `GetGlyphOutlineW(GGO_GRAY*_BITMAP)` → `stbtt_MakeCodepointBitmap`. DIB sections are plain memory buffers (`CDIB32*` already software) | Same code |
| Pixel buffers | `CreateDIBSection` `GetPixel`/`SetPixel` `LineTo`/`MoveToEx`, path/region calls | yaneSDK `CDIB32` `CDIB32P5/P6/PMMX` `CFastPlane` `CPlaneBase` `CDIBDraw` `CFastDraw` | Plain memory. The MMX/P5/P6 variants collapse to one C++ path | Same |
| DirectDraw | via `CoCreateInstance` | `CDirectDrawBase` `CDirectDrawBaseM` | Probably only mode enumeration or a dead fallback; confirm before porting (no `IDirectDraw` call in the game's draw path) | – |
| Direct3D 8 | `Direct3DCreate8` | `CD3DDevice` `CD3DTextureManager` `CD3DTextTexture` `CD3DSprite*` `OneTexture` | `gfx/` on GL 3.3 core, §2 | Same on WebGL2 (GLES 3.0 subset) |
| D3DX (statically linked) | — | callers in `src\System\` and `src\Game\Avatar\` | §2.3: stb_image (PNG/JPG/BMP decode), CPU blits, ~10 matrix helpers | Same |
| Sound | DirectSound via COM; `acmStream*` `acmFormatSuggest` | `CDirectSound` `CSound` `CSoundBase` `CStreamSound` `CSoundLoader` `CSoundNullDevice` `CSclSound` `CSoundFader` `CAcm`, `mtknLib::kmACMtoPCM` `kmWaveFileReader` `kmRawWave` `kmLongSound` `kmMmioFileEx` | SDL2 audio callback + an N-voice mixer (volume, pan, loop, fade). WAV/ADPCM via dr_wav; ACM conversion replaced by the decoders | SDL2 → WebAudio (starts after the first click) |
| Music / movies | DirectShow via COM; `mciSendCommandA` | `CDirectShow` `CMovie` `CMovieNull`, `mtknLib::kmDirectShowAudio` `kmMp3File` | Nothing: the data is PCM only (§7, "Audio formats"); the game compiled movies out (`CMovieNull`, KONAMI_CHANGES.md) | Same |
| MIDI / mixer | `midiIn*` `midiOut*` `mixer*` | `CMIDIInput` `CMIDIOutput` `CMIDILoader` | MIDI in: drop. MIDI out: only if `.mid` assets exist. Mixer volume → mixer gain | Same |
| Files | `CreateFileA/W` `ReadFile` `WriteFile` `SetFilePointer` `GetFileSize` `FindFirst/NextFileA` `CreateDirectoryA` `DeleteFileA` `MoveFileA` `CopyFileA` `GetFileAttributesA` `CreateFileMappingA`/`MapViewOfFile` `GetTempPathA` `GetModuleFileNameA` `Get/SetCurrentDirectoryA` `GetDiskFreeSpaceExA` | `CFile` `IFile` `CFileLoader` `CArchive` `CCryptFile` `CPackFileCache` `CPatchFile*` `CMergeThread` | stdio + path translation (`\` → `/`, case-insensitive lookup cached per directory, because the data comes from a case-insensitive FS). A file mapping is a whole-file read | §4 |
| Settings | `RegOpenKeyA` `RegCreateKeyExA` `RegQueryValueExA` `RegSetValueExA` | `CRegistryManager` (+ `Yo1`/`Yo2`/`USB` facades) | A key=value file in the save directory | Same file in IDBFS/OPFS |
| Threads / sync | `CreateThread`/`_beginthread` `*CriticalSection` `CreateMutexA` `CreateEventA` `SetEvent` `WaitFor*Object(s)` `Tls*` `Interlocked*` | `CThread` `CMutex` (texture loader thread in `CTextureManager`, `CMergeThread`) | `std::thread`, `std::mutex`, `std::condition_variable`, `std::atomic` | Fibers on the browser thread, switching at blocking calls (`win32/coop.h`, §7 "Web game loop"); no COOP/COEP needed |
| Code pages / CRT | `MultiByteToWideChar` `WideCharToMultiByte` `LCMapString*` `CompareString*` `GetACP` `GetCPInfo` `GetLocaleInfo*`, heap, env, version | — | The CRT itself, plus an embedded CP932↔UTF-16 table (~30 KB). `GetVersionExA` and the `VERSION.dll` calls return constants | Same (no iconv on the web) |
| HTTP | `InternetOpenA` `InternetConnectA` `InternetOpenUrlA` `HttpOpenRequestA` `HttpSendRequestExA` `InternetWriteFile` `InternetReadFile` `HttpQueryInfoA` | `CHttpDownload` (patcher `root.txt`/`merge.txt` from `run.py`'s port 8730) | A small HTTP/1.0 client over `NetSocket`. The server is plain HTTP on the same host | The same client over a gateway socket (`127.0.0.1:8730` is already allowed), so there is no `fetch()` and no async plumbing |
| Sockets | `WSOCK32` ordinals 3 4 9 10 16 19 23 52 101 111 113 115 116 | `src/Net` (`FUN_0068b6c0` connect, `FUN_0068b9b0` `WSAAsyncSelect`) | `platform/net`, §3 | `platform/net` over the Boxedwine gateway, §3 |
| Shell / process | `ShellExecuteA` `CreateProcessA` `GetCommandLineA` `SetUnhandledExceptionFilter` `OutputDebugStringA` | — | `SDL_OpenURL`; `CreateProcessA` (updater) is a stub | `window.open` |
| File dialogs | `GetOpenFileNameA` `GetSaveFileNameA` | `CFileDialog` | Later (tinyfiledialogs) | `<input type=file>` / blob download |
| COM images | `CreateStreamOnHGlobal`, `OLEAUT32` #418 (`OleLoadPicture`) | — | stb_image | Same |
| Duel Pass USB | `MagicKey.dll` `GetDuelPassCode` | `CWindowModelDuelpassUSB` `CRegistryManagerUSB` | Stub returns "no key" | Same |

## 2. Direct3D 8

All of it goes through one object. `DAT_0126f310` is the `CD3DDevice` state block: `+4` holds the
`IDirect3D8*`, `+8` the `IDirect3DDevice8*`, and `+0xc` the `D3DPRESENT_PARAMETERS` (`CD3DDevice::Initialize`,
`FUN_00585270`). The device is created windowed or fullscreen at the mode the game asks for, with an auto
depth-stencil and `D3DCREATE_MULTITHREADED`. It tries HAL hardware VP, then software VP, then mixed VP, then REF.

### 2.1 Usage table

Regenerate with `python3 -I platform/tools/d3d_usage.py --write` (it scans the decompiled cache and reads the mode
tables from the exe).

<!-- d3d-usage:begin -->
Generated by `platform/tools/d3d_usage.py` over 13111 of 13111 game+yaneSDK functions in the decompiled cache.
Calls = call sites whose object is typed inside the function (device global, an alias of it, or a Create*/Get* out-parameter); funcs = distinct functions. Calls Ghidra decompiled without arguments or through an untyped field are not here: see the hand-checked list below the table.

**IDirect3D8**

| vtbl | method | calls | funcs | e.g. |
|---|---|---|---|---|
| +0x018 | GetAdapterModeCount | 1 | 1 | 00585270 |
| +0x01c | EnumAdapterModes | 1 | 1 | 00585270 |
| +0x020 | GetAdapterDisplayMode | 1 | 1 | 00585270 |
| +0x034 | GetDeviceCaps | 1 | 1 | 00585270 |
| +0x03c | CreateDevice | 4 | 1 | 00585270 |

**IDirect3DDevice8**

| vtbl | method | calls | funcs | e.g. |
|---|---|---|---|---|
| +0x00c | TestCooperativeLevel | 1 | 1 | 00621300 |
| +0x038 | Reset | 2 | 2 | 00621300, 007f74b0 |
| +0x03c | Present | 1 | 1 | 00621300 |
| +0x040 | GetBackBuffer | 1 | 1 | 0060bc00 |
| +0x050 | CreateTexture | 3 | 3 | 0059bb10, 0059de80, 006357f0 |
| +0x06c | CreateImageSurface | 3 | 3 | 0059de80, 009c0140, 009c0a80 |
| +0x07c | SetRenderTarget | 1 | 1 | 00620a10 |
| +0x080 | GetRenderTarget | 1 | 1 | 006205d0 |
| +0x084 | GetDepthStencilSurface | 1 | 1 | 006205d0 |
| +0x088 | BeginScene | 1 | 1 | 00620a10 |
| +0x08c | EndScene | 1 | 1 | 00620a10 |
| +0x094 | SetTransform | 6 | 6 | 00588ef0, 0058a130, 0058bcb0 |
| +0x0a0 | SetViewport | 1 | 1 | 0060c1f0 |
| +0x0a8 | SetMaterial | 2 | 2 | 006100d0, 007d5970 |
| +0x0c8 | SetRenderState | 1 | 1 | 00585a20 |
| +0x0f4 | SetTexture | 3 | 3 | 00588ef0, 005899f0, 0058a250 |
| +0x120 | DrawPrimitiveUP | 3 | 3 | 00588ef0, 005899f0, 0058a250 |
| +0x130 | SetVertexShader | 5 | 5 | 00588ef0, 005899f0, 0058a130 |

**IDirect3DTexture8**

| vtbl | method | calls | funcs | e.g. |
|---|---|---|---|---|
| +0x038 | GetLevelDesc | 1 | 1 | 0059de80 |
| +0x03c | GetSurfaceLevel | 1 | 1 | 0059de80 |

**IDirect3DSurface8**

| vtbl | method | calls | funcs | e.g. |
|---|---|---|---|---|
| +0x008 | Release | 2 | 1 | 006205d0 |

**Formats (CreateTexture/CreateImageSurface/... format args):** A8R8G8B8 (2)

**Pools:** (variable) (1)

**FVFs (SetVertexShader / CreateVertexBuffer):** XYZ|DIFFUSE|TEX1 (3)

**Primitive types:** TRIANGLESTRIP (3)

**Transform states:** WORLD (4), VIEW (1), PROJECTION (1)

**CreateDevice flags:** MULTITHREADED|MIXED_VP (2), MULTITHREADED|HARDWARE_VP (1), MULTITHREADED|SOFTWARE_VP (1)

**Render states (SetRenderState)** (direct calls)

| state | values used (count) |
|---|---|
| (variable) | (variable) (1) |

**Render modes** (static tables at 0xc82850.., applied as diffs by FUN_00585930; mode 0 COLOROP MULTIPLYADD drops to MODULATE without the cap, FUN_00584ea0). Modes 1-11 are diffs over mode 0. `*` = flag 1: FUN_00585930 skips it on a mode switch, so TEXTUREFACTOR is only the initial value; FUN_00585a20 sets it at run time (an additive tint: 0 normally, a fade colour otherwise)

| mode | render states | stage ops | stage samplers |
|---|---|---|---|
| 0 | ZFUNC=LESSEQUAL, ZWRITEENABLE=1, ALPHABLENDENABLE=0, ALPHATESTENABLE=1, ALPHAFUNC=NOTEQUAL, SRCBLEND=SRCALPHA, DESTBLEND=INVSRCALPHA, COLORWRITEENABLE=15, TEXTUREFACTOR=0xffffffff, CULLMODE=NONE | 0:COLOROP=MULTIPLYADD, 0:COLORARG1=TEXTURE, 0:COLORARG2=DIFFUSE, 0:COLORARG0=TFACTOR, 0:ALPHAOP=MODULATE, 0:ALPHAARG1=TEXTURE, 0:ALPHAARG2=DIFFUSE, 0:ALPHAARG0=TFACTOR | 0:MAGFILTER=LINEAR, 0:MINFILTER=LINEAR, 0:ADDRESSU=CLAMP, 0:ADDRESSV=CLAMP |
| 1 | ALPHATESTENABLE=0, TEXTUREFACTOR=0xffffffff* | - | - |
| 2 | ALPHATESTENABLE=0, TEXTUREFACTOR=0xffffffff* | - | 0:MAGFILTER=POINT, 0:MINFILTER=POINT |
| 3 | TEXTUREFACTOR=0xffffffff* | - | - |
| 4 | ALPHABLENDENABLE=1, ALPHAFUNC=NOTEQUAL, TEXTUREFACTOR=0xffffffff* | - | - |
| 5 | ALPHABLENDENABLE=1, ALPHAFUNC=NOTEQUAL, TEXTUREFACTOR=0xffffffff* | - | 0:MAGFILTER=POINT, 0:MINFILTER=POINT |
| 6 | ALPHABLENDENABLE=1, ALPHAFUNC=NOTEQUAL, DESTBLEND=ONE, TEXTUREFACTOR=0xffffffff* | - | - |
| 7 | ALPHABLENDENABLE=1, ALPHAFUNC=NOTEQUAL, DESTBLEND=ONE, TEXTUREFACTOR=0xffffffff* | - | 0:MAGFILTER=POINT, 0:MINFILTER=POINT |
| 8 | ALPHABLENDENABLE=1, ALPHAFUNC=NOTEQUAL, TEXTUREFACTOR=0xffffffff*, CULLMODE=NONE | - | 0:MAGFILTER=POINT, 0:MINFILTER=POINT |
| 9 | ALPHABLENDENABLE=1, ALPHAFUNC=NOTEQUAL, TEXTUREFACTOR=0xffffffff*, CULLMODE=NONE | - | 0:MAGFILTER=LINEAR, 0:MINFILTER=LINEAR |
| 10 | TEXTUREFACTOR=0xffffffff | 0:COLOROP=SELECTARG1, 0:COLORARG1=TEXTURE, 0:ALPHAOP=SELECTARG1, 0:ALPHAARG1=TEXTURE | 0:MAGFILTER=POINT, 0:MINFILTER=POINT |
| 11 | ALPHABLENDENABLE=1, ALPHAFUNC=NOTEQUAL, TEXTUREFACTOR=0xffffffff | 0:COLOROP=SELECTARG1, 0:COLORARG1=TEXTURE, 0:ALPHAOP=SELECTARG1, 0:ALPHAARG1=TEXTURE | 0:MAGFILTER=POINT, 0:MINFILTER=POINT |

<!-- d3d-usage:end -->

**Checked by hand** (Ghidra dropped the arguments or the object comes through a field, so the scan misses these):

| Interface | Method | Where |
|---|---|---|
| IDirect3DTexture8 | `LockRect` +0x40 (level 0, whole texture, flags 0) / `UnlockRect` +0x44 | `FUN_0058e970`, `FUN_00588a50`, `FUN_00589590` (texture fills); `CD3DTextTexture::UpdateTextTexture` `FUN_0058d7a0` (text glyphs written to a pooled texture from `FUN_0058d4e0`); `FUN_005e2700`; Deck `FUN_008da960`/`FUN_008df280` |
| IDirect3DTexture8 | `GetLevelDesc` +0x38, `GetSurfaceLevel` +0x3c | `CTextureManager::LoadTexture` `FUN_0059de80`, Avatar `FUN_009c2bd0` |
| IDirect3DSurface8 | `Release` +0x8 (Get* results); `GetDesc` +0x20 (`FUN_0059de80`, unconfirmed) | `FUN_006205d0`, `FUN_0060bc00` |
| IDirect3DDevice8 | `SetRenderState`/`GetRenderState` +0xc8/+0xcc, `SetTextureStageState` +0xfc through `this+8` | `FUN_00585a20` (state setter that checks the current value first; only `TEXTUREFACTOR` is set this way), `FUN_00585930` (render-mode switch) |

Not used anywhere: vertex/index buffers, shaders, state blocks, lights, cube/volume textures, palettes, clip planes,
multiple texture stages (stage 0 only), and every format except `A8R8G8B8`. 

**Lighting is on, and it matters.** No `D3DRS_LIGHTING` write exists anywhere in the exe (no
`push 0x89` in `.text`), so the D3D default TRUE applies. The FVF has no normal and no light is ever enabled, so D3D
computes `rgb = emissive + ambient × D3DRS_AMBIENT(0)` and takes alpha from the diffuse material source, which by
default is the vertex colour. `FUN_006100d0` sets diffuse = ambient = specular = 1 and puts the sprite's colour in
**emissive**. A sprite's tint therefore comes from the material, and its alpha from the vertices. The renderer
emulates this exactly; it is not "unlit".

### 2.2 Mapping to GL

| D3D8 | GL 3.3 core / GLES 3.0 (WebGL2) |
|---|---|
| `Direct3DCreate8`, caps, mode enumeration, `CreateDevice` | `platformInit`; caps are constants (MULTIPLYADD supported, so mode 0 keeps it) |
| `BeginScene`/`EndScene`/`Present`/`TestCooperativeLevel`/`Reset` | Nothing / nothing / `SDL_GL_SwapWindow`; the device is never lost; `Reset` (window/fullscreen switch) → `SDL_SetWindowFullscreen` |
| `Clear(TARGET\|ZBUFFER)` | `glClear` |
| `SetViewport` | `glViewport(x, H-y-h, w, h)` + `glDepthRangef(MinZ, MaxZ)` |
| `SetTransform(WORLD/VIEW/PROJECTION)` | 3 uniforms, uploaded as raw D3D row-major floats; in GLSL `P * V * W * pos` (raw upload = transpose, so this equals D3D's `pos * W * V * P`) |
| D3D clip space z ∈ [0,1], pixel centres on integers | Vertex shader: `z = 2z − w`; `xy += (+1/W, −1/H)·w` (D3D's coordinate c is GL's c + 0.5 px, right and down) (no `glClipControl` on WebGL2) |
| `SetVertexShader(0x142)` = XYZ\|DIFFUSE\|TEX1, stride 24 | One VAO: `vec3` pos, `D3DCOLOR` as 4×ubyte normalized, swizzled `.bgra` in the shader, `vec2` uv |
| `DrawPrimitiveUP(TRIANGLESTRIP, 2, v, 24)`, the only draw call (3 sites: `FUN_0058a250`, `FUN_00588ef0`, `FUN_005899f0`) | Stream into one dynamic VBO (orphaned per frame), `glDrawArrays(GL_TRIANGLE_STRIP, base, 4)`. WebGL2 has no client-side arrays. Batching consecutive quads with the same state into indexed quads is the later optimisation |
| `SetTexture(0, t)` | `glBindTexture` + sampler object chosen by the current mode (2 samplers: linear clamp, point clamp) |
| `CreateTexture(w,h,1,0,A8R8G8B8,MANAGED)` | `GL_RGBA8` texture plus a CPU shadow copy for `LockRect` |
| `LockRect`/`UnlockRect` | Hand out the shadow; on unlock, swizzle BGRA→RGBA and `glTexSubImage2D` the dirty rows. WebGL2 has neither `GL_BGRA` nor texture swizzle, so the swizzle is on the CPU |
| `CreateImageSurface`, `GetSurfaceLevel`, `GetBackBuffer`, `Get/SetRenderTarget`, `GetDepthStencilSurface` | CPU buffers; a surface of level 0 = a view of the texture shadow; render targets = FBO (sampled with v flipped); back-buffer read = `glReadPixels` |
| Render modes 0–11 (table above) | Depth `GL_LEQUAL` + depth mask; blend `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` or `SRC_ALPHA, ONE` (modes 6/7); no culling; alpha test `NOTEQUAL 0` → `discard` when `a == 0`; filters → sampler. One fragment shader with a uniform op: mode 0 `rgb = tex·diffuse + tfactor`, `a = tex.a·diffuse.a`; modes 10/11 `= tex` |
| `TEXTUREFACTOR` (set through `FUN_00585a20`) | Uniform `tfactor` (ARGB → vec4) |
| `SetMaterial`, `D3DRS_LIGHTING`/`AMBIENT`/`COLORVERTEX`/`*MATERIALSOURCE` | Vertex shader: `rgb = saturate(emissive + ambient × globalAmbient)`, `a = diffuse.a`, each from material or vertex colour per its source (no lights: the game enables none) |

### 2.3 D3DX (statically linked, called from game code)

| Address | Function (from arguments and the error strings at the call sites) | Replacement |
|---|---|---|
| `0x00b400b3` | `D3DXCreateTextureFromFileInMemoryEx` (A8R8G8B8, managed) | stb_image decode → `CreateTexture` + upload |
| `0x00b3ced6` | `D3DXGetImageInfoFromFileInMemory` | `stbi_info_from_memory` |
| `0x00b3d5f6` | `D3DXCheckTextureRequirements` | Return the sizes unchanged (NPOT is fine on GL 3.3 / WebGL2) |
| `0x00b3d66f` | `D3DXCreateTexture` | `CreateTexture` |
| `0x00b3eb13` | `D3DXLoadSurfaceFromFileInMemory` | stb_image + blit |
| `0x00b3ebcb` | `D3DXLoadSurfaceFromSurface` (filter, no colour key) | CPU blit; box filter when scaling |
| `0x00b3cf0e` | `D3DXLoadSurfaceFromMemory` (A8R8G8B8 source; Avatar texture maker) | CPU blit |
| `0x00b42a44` | `D3DXMatrixOrthoLH`-shaped (out, w, h, zn, zf) → projection | 10-line math helper |
| `0x00b41xxx`–`0x00b421b5` (6-byte jump stubs: `b41539` `b41a4b` `b41ea4` `b41f8c` `b42037` `b420f3` `b421b5` `b4137d` `b40de7`) | D3DX math through the CPU dispatch table (matrix multiply/look-at/perspective/rotation and friends; callers `FUN_0060fa70`, `FUN_007d5970`, `FUN_007d5dc0`, `FUN_00673b60`) | One small `d3dxmath.h`. Name each function when its caller is ported |

### 2.4 Implementation (`gfx/`)

`gfx/d3d8.h` and `gfx/d3dx8.h` copy the names and signatures from the DirectX 8.1 headers, so `src/System`'s
`CD3DDevice`, `CD3DTextureManager` and `CD3DTextTexture` port call for call. They are plain classes, not COM vtables,
and every method the game never calls is left out. Choices worth knowing:

- **One storage orientation.** Every target, the back buffer included, is an FBO stored top row first; the vertex
  shader flips y. Viewports, scissors, `LockRect`, read-backs and uploads therefore never flip. `Present` blits the
  back buffer to the window, flipped and scaled (which also covers HiDPI and fullscreen).
- **Back buffer is `X8R8G8B8`.** Alpha writes are masked and cleared to 1, as on a real X8 surface.
- **Caps report `POW2 | NONPOW2CONDITIONAL`.** That is what 2008 drivers reported, so `D3DXCheckTextureRequirements`
  and `D3DXCreateTextureFromFileInMemoryEx` round sizes up to powers of two exactly as they did for the original. The
  game's UV maths sees the texture sizes it always saw.
- **Textures.** One mip level, `A8R8G8B8`/`X8R8G8B8`. Managed textures keep a B,G,R,A shadow for `LockRect`, and
  unlock re-uploads just the locked rect. Render-target textures (`D3DUSAGE_RENDERTARGET`, default pool) live only
  on the GPU and are read back through their FBO. A target smaller than the depth surface gets its own depth buffer,
  because WebGL2 needs equal attachment sizes.
- **Unbound texture.** Stage 0 with no texture reads as white. Stages 1+ stay `DISABLE`.

**Test:** `build/platform/gfx_test`, 36 checks, all passing. It uses a hidden 64×64 window, draws, and reads pixels
back. The checks cover:
- `Clear` limited to the viewport;
- texel orientation and exact D3D pixel coverage (a quad from 8 to 24 covers pixels 8–23);
- lit versus unlit colour;
- MULTIPLYADD + TFACTOR;
- alpha-test discard, alpha and additive blending, LEQUAL depth and CCW culling;
- render-to-texture with a shared bigger depth buffer, sampled back in the right orientation;
- partial `LockRect`;
- D3DX on a BMP: POW2 rounding, FILTER_NONE padding, the colour key;
- the screenshot path (`D3DXLoadSurfaceFromSurface` from the back buffer).

The GLSL ES 3.00 variant validates with `glslangValidator`. It hasn't run under real WebGL2 yet, since no browser
was used.

## 3. Network

**Original.** `FUN_0068b6c0` does a *blocking* `socket` → `inet_addr` (or `gethostbyname`) → `htons` →
`connect`. Then `FUN_0068b9b0` calls `WSAAsyncSelect(sock, hwnd, 0x1401, FD_READ|FD_CLOSE)`, and each `0x1401`
message runs `ygRecv` (`FUN_00689ea0`) until it returns `YG_PENDING`. `ygSend` (`FUN_0068a320`) writes
synchronously.

**Replacement (`platform/net/net.h`).**

```cpp
NetSocket* netConnect(const char* host, int port);   // non-blocking
NetStatus  netStatus(NetSocket*);                     // NET_CONNECTING → NET_OPEN | NET_CLOSED
YgTransport netTransport(NetSocket*);                 // recv: >0, 0 closed, -1 would block, <-1 error
void       netClose(NetSocket*);
```

Net's three socket calls (`src/Net/MessageIO.h`) sit on top of this in `net/net_yg.cpp`, one file for both builds:

- `ygConnectAsync` starts a non-blocking connect and leaves `c->state` at `YGC_CONNECTING`. A failure seen at once
  (unknown host, no socket) becomes `YGC_FAILED` with error 10061. The exe instead left state at 1 forever when the
  lookup failed.
- `ygSocketTransport` / `ygSocketClose` work on small handles that index a table (`handle = index + 1`); the exe's
  were WinSock SOCKETs that Net only stores.
- `ygNetPoll(platformPostMessage)`, called once per frame by the game loop, replaces the connect thread (it sets
  `c->sock/state/err` as `FUN_0068b6c0` did) and replaces `WSAAsyncSelect`: it posts `0x1401` (wParam = socket,
  lParam = `FD_READ`=1, or `FD_CLOSE`=0x20 once) for every socket that has bytes or has closed.
- **Open item for Net:** `ygConnFree` must call `ygNetForget(c)`. `CMessageIOBase::disconnect` can free a record
  that is still connecting, and the poll would then write into freed memory (the exe's thread has the same race).

Tests: `build/platform/ygnet_test` (native, against a listener in the same process) and the web e2e below, which
now runs through these calls.

- **Native (`net_posix.cpp`):** BSD sockets, `O_NONBLOCK`, `connect` → `EINPROGRESS`, `poll` + `SO_ERROR` for
  completion. `send` loops until everything is written, as `FUN_0068a530` does. Winsock is a small `#ifdef` when a
  Windows build is wanted.
- **Web (`net_ws.cpp`):** speaks the protocol of Boxedwine's `network-gateway.mjs`, the bridge YOLaucher's browser
  plan already runs next to the server (`YOLaucher-web/web/README.md`). That gives one WebSocket per page and many TCP
  sockets multiplexed by id:
  - text `{"type":"open","id":N,"host":"127.0.0.1","port":5730}` → `{"type":"open","id":N,"status":0}`
    (negative errno on failure)
  - binary `[0x01][id u32 BE][bytes]` both ways
  - `{"type":"close","id":N}` both ways, `{"type":"error",...}` from the server

  The gateway URL defaults to `ws://127.0.0.1:8001/boxedwine-network` (`netSetGateway` changes it). Run it as
  `node network-gateway.mjs --port 8001 --allow-origin <page origin>`. Its default allow rule `127.0.0.1:*` covers
  every server port: gate 5730, accounts 5731-5732, rooms 5740-5750 and 5800-5876, duel 5760, HTTP 8730. For public
  hosting use `wss://` and an explicit origin. The WebSocket upgrade checks only the origin, not
  `BOXEDWINE_GATEWAY_AUTH`.
- **Why not Emscripten's own socket emulation plus websockify:** that needs one websockify listener per destination
  port (about 100 ports here) and does its own blocking emulation. The gateway is one port, already deployed, and the
  same frames serve both the Boxedwine path and the rebuild.

**Test.** `build/platform/gate_hello [host] [port]` sends `0x2005 "Ver.080912.00"` (param 1, no NUL) through
`netConnect` + `ygSend`, then expects `0x2002` and `0x2003` with consecutive params. It passes against
`YO2_NO_CLIENT=1 python3.12 run.py 0`: `0x2002 #1 len=4`, `0x2003 #2 len=1008`. The web backend passes the same handshake
under Node through Boxedwine's real `network-gateway.mjs` (master `2dbabfc`, `--allow-origin none` because Node's
WebSocket sends no Origin): `platform/tests/ws_e2e/run.sh`, see its README.

## 4. Files on the web

Game data is the player's own folder; nothing from the game is hosted. `merge.dat` alone is about 700 MB, so the
data is never loaded whole (README memory rules; a GB-sized load crashed the owner's Mac once). There are two
sources, both read in 1 MB chunks through a capped LRU, the same scheme as `YOLaucher-web/web/lazydrive.js`:

1. **Player folder (public):** the player picks the folder once (File System Access API). It is copied into OPFS in
   the background, and from then on reads go through `FileSystemSyncAccessHandle` in the game's worker thread.
2. **Dev server (local only):** HTTP `Range` requests against a manifest `{ "lazy": [["merge.dat", size], ...] }`,
   as lazydrive does.

Both sit behind the `CFile`/`IFile` boundary as a synchronous `read(off, len)`. The game loop stays on the browser
thread (§7 "Web game loop": fibers with ASYNCIFY). The dev-server source already reads with synchronous XHR
(`vfs_url.cpp`), which the main thread still allows. OPFS's `FileSystemSyncAccessHandle` is worker-only, so the
player-folder source will read with `EM_ASYNC_JS` (`getFile().slice().arrayBuffer()`): the ASYNCIFY build suspends
the calling fiber until the bytes arrive, and the browser runs meanwhile. Writes (settings, `CRegistryManager` file,
downloaded patches) go to OPFS.

**Implementation (`vfs/`).** `VfsSource` (a local file through `pread`, or on the web `vfsOpenUrl` with
synchronous Range XHR in 1 MB chunks through one 64-chunk LRU) and `VfsArchive` (`vfsMount`, `vfsFind`,
`vfsReadAll`, `vfsReadAt`). Lookups ignore case and treat `/` and `\` the same, but leave CP932 trail bytes alone.
LZSS entries decode on read. Ranged reads of stored entries touch only the bytes asked for. `vfsOpenUrl` refuses a
server that doesn't send `Accept-Ranges: bytes`, so a plain GET can never pull the whole 700 MB.

**Test:** `build/platform/vfs_test <merge.dat> [kcej-list.txt]` mounts the real 19,445-entry file and matches
every TOC row against `kcej_dat.py list`. It checks content hashes of LZSS and stored entries (including a 1.9 MB
BMP) and ranged reads across a 1 MB chunk boundary. The web build passes the same test under Node
(`node platform/tests/vfs_node.cjs build-web/platform/vfs_test_web.js <merge.dat>`) against a local Range server:
13 requests, 11 MB read. Not yet built: the OPFS source (another `VfsSource`) and a run in a real browser worker.

## 5. Text and code pages

The game is ANSI (`*A` APIs, `GetACP`). Strings in its data are CP932 (Japanese build lineage) or CP1252 depending on
the language pack. Text reaches the screen as `GetGlyphOutlineW` bitmaps uploaded with `LockRect`
(`CD3DTextTexture`). Built (`win32/text.cpp`, `gdi.cpp`, `font.cpp`, `ole.cpp`):

- **Code pages.** `MultiByteToWideChar` / `WideCharToMultiByte` handle 932, 1252 and UTF-8, with Windows' buffer
  rules (0 + `ERROR_INSUFFICIENT_BUFFER`) and default characters (U+30FB for an undefined Shift-JIS pair, `?` the
  other way). The tables are generated at configure time from Python's `cp932`/`cp1252` codecs, which are
  Microsoft's mappings (`tools/gen_codepages.py`). `wsprintfA/W` keep Windows' `%s`/`%S` meaning. ponytail:
  `platformPump` still emits one `WM_CHAR` per Unicode code point.
- **GDI on memory.** Memory DCs, DIB sections (1/8/16/24/32 bpp), `BitBlt` with the common ROPs,
  `SetDIBitsToDevice`, `Get/SetPixel`, regions as banded rectangles (`CombineRgn`, paths via `PathToRegion`, with a
  pixel-centre fill rule). A window DC is a surface nobody sees, because the game presents through Direct3D.
- **Fonts.** stb_truetype (`third_party/stb_truetype.h`, v1.26).
  - Faces are font files found by name in `YO2_FONT_DIR`, or the system font folders (the web's `/fonts`).
  - Japanese requests (Shift-JIS charset or a Japanese/Gothic face name) take `msgothic.ttc` when the player has
    it, else Hiragino W3/W6, Noto CJK or IPA. Latin requests take Arial, DejaVu or Liberation.
  - A missing glyph comes from the other class.
  - Cell metrics follow GDI: OS/2 `usWinAscent + usWinDescent`; `lfHeight > 0` sizes the cell, `< 0` the em.
  - Bold without a bold file is drawn twice, 1 px apart.
  - Only ANTIALIASED/CLEARTYPE quality blends coverage; the rest is 1-bit, like XP's GDI.
  - `GetGlyphOutlineW` gives GDI's GRAY8 (0..64), GRAY4, GRAY2 and BITMAP layouts.
  - ponytail: no hinting. Thin strokes at small sizes peak below full coverage where GDI would snap them; italics
    aren't synthesised.
- **OLE pictures.** `OleLoadPicture`/`IPicture::Render` (yaneSDK's CGraphicLoader) decode with stb_image.

Test: `build/platform/gdi_test` and `node build-web/platform/gdi_test.js`, 25 checks each, all pass: code pages,
wsprintf, DIB/BitBlt/pixels, glyphs actually drawn inside their cell, GetGlyphOutline levels, regions, paths, and an
OLE picture rendered at 2x.

## 6. Skeleton and build

- `sdl/platform.{h,cpp}`: SDL2 window (800×600, HiDPI drawable), GL 3.3 core forward-compatible natively, GLES 3.0
  (WebGL2) on the web, vsync, text input on. `platformPump` emits `WM_KEYDOWN/UP` (VK codes, lParam with scancode,
  repeat and transition bits), `WM_CHAR`, `WM_MOUSEMOVE`, `WM_[LRM]BUTTON{DOWN,UP,DBLCLK}` (MK_* in wParam,
  MAKELPARAM coords), `WM_MOUSEWHEEL`, `WM_SETFOCUS/KILLFOCUS`, `WM_SIZE`, `WM_CLOSE`.
- `sdl/main.cpp`: `yo2_skeleton [--frames N] [--verbose]` clears and pumps; it stands in for `WinMain` until the
  game loop lands.
- Native: `cmake -S . -B build && cmake --build build` (needs `brew install sdl2`, which is sdl2-compat).
- Web: `emcmake cmake -S . -B build-web && cmake --build build-web --target yo2_skeleton` → `yo2_skeleton.html/js/wasm`
  (`-sUSE_SDL=2`, WebGL2 only, `-lwebsocket.js`).

## 7. yaneSDK on non-Windows (`win32/` shim)

`third_party/yanesdk` (v1.65 + Konami's changes, phase 1) builds for macOS/Linux and Emscripten from the root
CMake. Its sources stay as they are, except for eight `// [portable]` pointer-width fixes (KONAMI_CHANGES.md). Three
pieces make that work:

1. **`platform/win32/` headers** are put first on the include path, so `stdafx.h`'s `<windows.h>`, `<mmsystem.h>`,
   `<dsound.h>`, `<ddraw.h>`, … resolve there. `win32.cpp` implements them:

   | Area | How |
   |---|---|
   | Window, messages | One real window. The first top-level `CreateWindowEx` of a registered class calls `platformInit`, with the client size from yaneSDK (`AdjustWindowRect` is the identity, there is no frame). `PeekMessage`/`GetMessage` drain `platformPump` into one queue, on the window's thread only. `DispatchMessage` calls the class or subclassed `WNDPROC` (`SetWindowLong(GWL_WNDPROC/USERDATA)` take `LONG_PTR`). `SendMessage` is a direct call (ponytail: no cross-thread marshalling). `SetTimer` runs on the platform timers, `TIMERPROC`s included. `GetClientRect` is the game size; `GetCursorPos` is in game pixels, so Konami's `CMouse::GetXY` 1024/width scaling stays the identity |
   | Threads, sync | `std::thread`, mutex, condition variable. `HANDLE`s are small integers in a table, as on Win32, because `CThread` keeps its `_beginthread` handle in a `DWORD`. `CRITICAL_SECTION` = recursive mutex. `timeSetEvent` calls back on its own thread, as winmm does |
   | Time | `timeGetTime`/`GetTickCount` = `platformTimeMs`; `QueryPerformanceCounter` = steady clock; `Sleep` is a no-op on the browser main thread |
   | Files | POSIX underneath, with Windows paths: `\` → `/`, drive letter dropped, each component matched case-insensitively (the data was made on a case-insensitive file system). `CreateFile`/`ReadFile`/`SetFilePointer`/…, `FindFirstFile` (DOS `*.*`), temp/current directory, and `fopen` itself, because Konami's `CFile` calls `::fopen` with backslash paths. `GetModuleFileName` says the exe lives in the current directory. `mmio` RIFF parsing works on memory or a file |
   | DirectX via COM | `CoCreateInstance(CLSID_DirectSound)` → the `audio/` mixer (`Initialize` opens SDL audio; `DuplicateSoundBuffer` copies the samples). `CLSID_DirectInput` → keyboard device whose `GetDeviceState` = `platformKeyboardDik`. DirectDraw and DirectShow fail creation, as on a PC without them |
   | No-device answers | joystick (none attached), mixer (no devices: `CAudioMixer` leaves volumes alone), MIDI in/out, ACM codecs (`acmStreamOpen` fails; the data has no compressed sound, so nothing is lost), DirectShow PCM reader (NULL factory), IMM (composition arrives as `WM_CHAR`), clipboard (process-local), registry (not needed by yaneSDK) |
   | Language | `GetSystemDefaultLangID`: `YO2_LANGID`, default 0x0409; `GetACP` follows it (932/1252). `MultiByteToWideChar` is ASCII-only until the CP932 table lands with the text cluster |

2. **`platform/tools/sjis_for_clang.py`** rewrites the Shift-JIS sources into the build directory at configure time.
   GCC has `-finput-charset=CP932`, but clang, which Emscripten requires, doesn't: a trail byte `0x5C` (`\`, as in
   機能 or 表) ends a `//` comment as a line continuation and swallows the next line. Comments become UTF-8; narrow
   literals become octal escapes of the same Shift-JIS bytes, so the runtime bytes are unchanged; `L"…"` becomes
   `\u` escapes, which is what MSVC produced. The tool has a self-test.

3. **Compiler mode:** clang with `-std=gnu++11 -fms-extensions -fdelayed-template-parsing -w`. Delayed parsing
   keeps uninstantiated YTL template bodies unparsed, as MSVC did. They contain code that never compiled anywhere
   (`m_pProtoType`, `_Y`).

**Audio formats (settled).** I read every entry's RIFF header in Sound.dat, without extracting it. All 87 sounds
are plain PCM `WAVE_FORMAT_PCM`, so no ADPCM, MP3 or other codec decoder is needed; the DirectSound mixer plays
them as they are:

| Kind | Count | Format | Examples |
|---|---|---|---|
| BGM, `bgm\*.wav` | 72 | 16-bit stereo, 22.05 kHz | `b_burn.wav`, 18.8 MB |
| Sound effects, `se\*.wav` | 15 | 16-bit mono, 22.05 kHz | `chain.wav`, `coin.wav`, `dice.wav` |

merge.dat and DATA.dat hold no sound at all (png, txt, bmp, bin, ydc, iid, csv, swf, idx, inc, xml). There are no
.mid files, so MIDI out stays "no device".

**All 131 files build off Windows** (native and web). The last 22 needed:
- the GDI/text/OLE stand-ins (§5);
- "no such device" surfaces in `win32_nodevice.cpp`: DirectDraw creation fails (`DDERR_NODIRECTDRAWHW`), MCI has
  no CD drive, file dialogs come back cancelled, DirectShow fails in `CoCreateInstance`;
- two `[portable]` source fixes (KONAMI_CHANGES.md).

The DirectDraw path is dead in the game, so failing it is faithful:
- yo2.exe imports only `Direct3DCreate8`.
- Nothing calls `CFastDraw::CFastDraw`.
- `CFastPlane` is reached only from yaneSDK-internal loaders (`CRegion::Load`, `CSpriteChara::Load`, the plane
  factory), and no game code calls those.

**Test:** `build/third_party/yanesdk/yane_test` (native, hidden window, SDL dummy audio). It is a real
`CAppBase`/`CAppFrame` app at 1024×768:
- `CDirectInput` press/hold/release, including Konami's `IsKeyRelease`;
- `CMouseEx` left button via `WM_LBUTTONDOWN` through the hook chain, at (512,384) with Konami's click count 1;
- `CTimer` (`Sleep(50)` → 50 ms);
- `CIntervalTimer` multimedia timer (13 ticks of 10 ms in 125 ms);
- `CSound` loading a WAV through Konami's `CFile` and playing it to the end (100 ms → done at 122 ms);
- `WM_CLOSE` ending the app and `Run()` returning.

It also checks `CFont` (Konami's wide text) measuring "Duel" and drawing it over its shadow into a DIB section.
13 checks, all pass. The same library also builds with Emscripten and still builds for Windows (mingw).

**Web game loop (built, ASYNCIFY + fibers).** yaneSDK's loop blocks (`while (IsThreadValid())`) and runs on its
own thread, and timeSetEvent/CThread add more threads. On the web every Win32 thread is an Emscripten fiber on the
browser thread (`win32/coop.{h,cpp}`, linked with `-sASYNCIFY`):

- **Switch points.** A thread gives way only where the Win32 call would have blocked or slept: `Sleep`,
  `WaitForSingle/MultipleObject(s)` (events, mutexes, threads), `EnterCriticalSection` on a held section,
  `GetMessage`/`WaitMessage`, and an empty `PeekMessage`. The last one makes polling loops cooperative.
- **Scheduling.** One round runs every thread that is due once. Then `emscripten_sleep` gives the browser its turn,
  for at most a frame: paint, input, fetches.
- **Timers.** `timeSetEvent` is a fiber like any other.
- **Entry.** The program's `main()` calls `coop::run(appMain)`: the whole app, and every thread it starts, runs
  inside.

Why not pthreads + `PROXY_TO_PTHREAD`:
- They need a cross-origin-isolated page (COOP/COEP).
- yaneSDK draws from its app thread, so WebGL would have to live in a worker (OffscreenCanvas), which SDL's
  Emscripten port barely supports.

Fibers keep SDL, WebGL and DOM events on the main thread, where `yo2_skeleton` already runs.

Costs:
- ASYNCIFY makes the wasm bigger and slower: yane_test is 756 KB. JSPI (`-sJSPI`) is the upgrade once
  browsers ship it everywhere.
- A thread that spins without calling any of the above starves the others. Nothing in yaneSDK does.

Under Node there is no DOM. `platformInit(hidden)` then skips the window and WebGL, keeping only events and
timers. If DirectSound finds no audio device (Node, or a browser before the first click), the mixer runs on the
clock into nothing, so sounds still end.

**Test:** `node build-web/third_party/yanesdk/yane_test.js` runs the same 13 checks as the native yane_test (app
thread, input, Sleep, multimedia timer, CSound playing to its end, CFont drawing, WM_CLOSE, Run returning). All pass.

## 8. Open items

- The font choice for glyph metrics against MS Gothic; it needs a side-by-side screenshot from the original.
- The web IME (hidden `<input>` composition) and the worker/OPFS file path: both are designed here, not built.
