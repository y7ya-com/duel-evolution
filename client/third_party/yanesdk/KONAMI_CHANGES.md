# yaneSDK in yo2.exe: release, matching and Konami's changes

This directory is **yaneuraoGameSDK 2nd v1.65** (`yaneSDK2_165.lzh`, 2002-11-26) with the changes Konami made for
Yu-Gi-Oh! Online 2 (`yo2.exe` Ver.080912). Upstream files are Shift-JIS with CRLF; every Konami change is marked
`// [Konami]` in the source, every non-Konami portability change `// [portable]`.

## License

Not public domain. The yaneSDK2nd manual (`CD/RAW/yaneSDK2nd_man/etc/yaneSDK2nd.html` in the OpenJoey dump) says it is
fully open source and royalty-free, commercial use included, no copyright notice required, "quote or copy freely",
but the copyright stays with やねうらお (M. Isozaki). OpenJoey's own GPL-3 does not apply to this code. Konami's changes
are reconstructed from their binary by hand, like `src/`.

## Which release (evidence)

Candidates found in `yo2-decomp-data/openjoey/misc/yakeSDK_source_untouched/v2/`:

| candidate | date | classes | in yo2.exe RTTI |
|---|---|---|---|
| copy bundled in `extra/MapEditor100.lzh` | ≤ 2001-12 | 275 | 106 |
| book CD `CD/RAW/yaneSDK2nd/` | spring 2002 (lacks the Jun-Nov 2002 fixes) | 290 | 111 |
| **`yaneSDK2_165.lzh`** (= `examples/yaneSDK2_165/`, byte-identical after CRLF) | 2002-11-26 | 290 | **113** |

1. **Classes.** `CBGMLoaderListener` and `CSELoaderListener` exist only in v1.65 and are in the exe's RTTI. Every other
   yaneSDK-looking RTTI class (`CApp`, `CAppMainWindow`) is the application's own class.
2. **Code that only v1.65 has** (its `log/XVO.txt` lists these fixes of 2002-06..11):
   - `CTimeBase::timeBeginPeriodMin` (0x57f2b0) checks `timeGetDevCaps`'s result and falls back to `GetTickCount`
     (fix of 2002-11-27; the CD version ignores the result).
   - `CCDDA::ConvertFromMealTime` (0x4336f0) computes `h*60*60 + m*60 + s` (the CD version has `h*24*60`).
   - `CAcm::Open(LPVOID,DWORD)` (0x42a770, an island) tests `(src[1]&0xf8)!=0xf8` and looks for the ID3 tag from the
     buffer start (the CD version's `src[1]&0xf8 != 0xf8` compiles to no test at all).
3. **Strings.** 83 of the 95 strings referenced by yaneSDK-range functions occur verbatim in v1.65; the 12 others
   are Konami's (fonts, `AddCache %s`, `merge/`, `<LA>`/`<LJ>`/`<LK>`, `CAPTION`/`CLASSNAME`, the build path in
   `yaneDir.cpp`). Most v1.65 strings are absent because `Err.Out` is compiled out (`USE_ErrorLog` off).
4. **Vtables.** With Konami's build configuration and the header changes below, the vtable layout computed from the
   v1.65 headers equals the exe's for all 114 yaneSDK classes with RTTI (slot count and order).
5. **Link order.** The exe lays out the .obj files in case-insensitive alphabetical order of the v1.65 file list
   (enraAudioPlugin ... yaneWinHook, original paths `C:\yugionline\yo2\client\yaneSDK\`), each .obj's functions in
   v1.65 definition order.

No yaneSDK2nd release after 1.65 exists in the archive; nothing in the exe needs a later one.

## How functions were matched

The matcher is in `match/` (see its README); in short:

- **Exe side.** All non-thunk functions in 0x423110-0x583060 (2,907 Ghidra functions). The link is incremental:
  every function is 16-byte aligned and padded with 0xCC, and **Ghidra had not found ~560 unreferenced functions**
  in this range (code islands in the padding, e.g. `CAcm::Open(LPVOID,DWORD)` at 0x42a770). They were decompiled
  read-only (no change to the shared Ghidra project) and added: 3,482 exe functions. Unreferenced functions were
  not dropped by the linker.
- **Source side.** Every out-of-line function of the v1.65 .cpp files, preprocessed with Konami's configuration:
  1,367 functions (after Konami's additions; yaneScene/yaneSceneTransiter are not linked).
- **Vtable anchors.** Header class declarations give MSVC vtable layouts (inherited slots, overrides, new virtuals
  ordered by the first declaration of each name, overloads grouped in reverse order). Exe vtables come from RTTI.
  Where layouts agree, every slot names its exe function exactly; deleting destructors lead to the real destructor.
- **Global alignment.** One order-preserving alignment (Needleman-Wunsch) of the source list against the exe list,
  scored by shared Win32 API calls, strings, constants, return codes, parameter count, size, vtable anchors (hard),
  and call-graph agreement with already-matched neighbours (iterated). Compiler-generated stubs (deleting
  destructors, dynamic initialisers/atexit) are excluded.
- **Validation.** Automatic holdouts looked good (hiding a third of the vtable anchors: 147/155 recovered, 1 wrong),
  but the per-cluster reviews found link-order-only matches drifting in dense runs of small overloaded functions
  (CStringMap, CSerialize) and around constructors. So every link-order-only pair (468) was then checked by hand
  against its decompilation: 391 confirmed, 76 wrong (corrected), 1 unsure. Corrections and confirmations are fixed
  inputs (`match/overrides.json`); 26 pairs that appeared after re-running remain unverified.
- **Calls through names.** Call-graph evidence uses function names, so it is not trusted for overloaded names.

Marker notes say how a match was established: `vt` vtable slot (exact), `feat` shared APIs/strings, `cg` call graph
(unique names only), `tight` sandwiched 1:1 between strong matches, `review` checked by hand against the
decompilation, `manual` address found while porting the changes. `// @yo2? 0x... order` (link order + size +
signature only, not hand-checked) is deliberately not counted by `tools/coverage.py`. Regenerate with
`match/README.md`.

## Match rate

| | count |
|---|---|
| v1.65 + Konami out-of-line functions compiled into yo2.exe (.cpp definitions) | 1,367 |
| matched to an exe function | 1,356 (99.2%) |
| of which verified (`vt/feat/cg/tight/review/manual`) | 1,330 (97.3%) |
| unverified (`@yo2?`, link order only) | 26 |
| header-inline virtuals marked via vtables | 279 |
| `// @yo2` markers in the tree / `// @yo2?` | 1,609 / 26 |

Exe side, the 2,990 functions `labels.tsv` calls yaneSDK (`tools/coverage.py`: 1,820 = 89.6% of their bytes):

| what | funcs | KB |
|---|---|---|
| marked `@yo2`: matched definitions and header-inline virtuals | 1,402 | 392 |
| marked `@yo2`: blit-template instances, one marker per instance above the template (`match/tmpl_markers.py`) | 419 | ~480 |
| marked `@yo2?` | 21 | 4 |
| blit-template instances not assigned to a template (their callers use several templates and the argument count does not decide) | 107 | ~78 |
| other unmarked: STL / YTL / smart_ptr template instances and inline helpers | 759 | 84 |
| compiler-generated deleting destructors / static initialisers | 133 | 3 |
| ILT thunks (5-byte jmp) | 117 | 1 |
| not yaneSDK at all: Blowfish cipher and tables at 0x583060-0x585000 (mislabelled by range) | 27 | 5 |
| yanePlaneEffectBlt tables | 5 | 0 |

Template instances are assigned to the template their matched callers call (`caller`), or, where a dispatcher
calls both `Blt` and `BltDouble` (or `Effect` and `EffectDouble`), by argument count (`caller+arity`: the Double
variants take a second src/dst pair and functor; on the 294 instances assigned by caller alone, Blt never has more
than 12 arguments and Effect always 4). 4 BltDouble and 2 EffectDouble instances for 11 and 6 call sites is consistent.

A further 204 verified markers sit on functions Ghidra never created (code islands), which `labels.tsv` does not
list, so `coverage.py` cannot count them. Their decompilation is in `yo2-decomp-data/islands/`.

STL instances (std::vector/list/map/string internals, Dinkumware VC6) have no source in this tree: a rebuild uses
the toolchain's STL, so they get no markers.

## Konami's changes

Every entry is ported in the source and marked `// [Konami]`; names Konami's code does not reveal (new fields,
functions only reached through vtables) are ours. Addresses are yo2.exe virtual addresses.

### Build configuration (`config/yaneConfig.h`)

| kind | what | evidence |
|---|---|---|
| config | `USE_MovieDS`, `USE_MovieAVI` off | `CMovie::CreateInstance` 0x543680 only builds CMovieNull; no CMovieDS/CMovieAVI RTTI |
| config | `USE_MIDIOutputMCI`, `USE_MIDIOutputDM` off | `CMIDIOutput::CreateInstance` 0x53f990 only builds CSoundNullDevice |
| config | `USE_DirectDraw` off (no CPlane/CDirectDraw) | CLayerBase vtable has 5 slots (3 OnDraw overloads); no CPlane RTTI |
| config | `USE_SAVER` off | same CLayerBase evidence; no CSaverDraw RTTI |
| config | `USE_YANE_NEWDELETE` off | `operator new` is the CRT's (0xb09654); yaneMemory.cpp block has no allocator |
| config | `USE_DIRECTX`, `USE_DIB32`, `USE_FastDraw`, `USE_YGA`, `USE_StreamSound`, both JoyStick switches on | DIBDraw's USE_DIRECTX branches compiled in; vtables |
| debug new | `yaneDir.cpp` was compiled with a crtdbg-style `new(_NORMAL_BLOCK, __FILE__, __LINE__)` (the build path string at 0x44b440 is its file argument) | documented only; no behaviour change |

### Input (`yaneKeyBase`, `yaneMouse`)

| kind | Class::Function | exe address | what changed |
|---|---|---|---|
| layout/added | CKeyBase::IsKeyRelease(int) const | 0x539ba0 (vtable slot 4) | new virtual after IsKeyPush: key went up this frame; shifts every CKeyBase-derived vtable (CDirectInput, CJoyStick, CMIDIInput) |
| layout | CMouse | fields +0x0c/+0x10 | two int click counters (R, L) after m_bOutScreenInput; CMouseEx fields move by 8 |
| added | CMouse::GetLClickCount/GetRClickCount/ResetLClickCount/ResetRClickCount | 0x541fb0, 0x541fd0, 0x541ff0, 0x542010 (slots 9-12) | inline virtual accessors before the destructor |
| modified | CMouse::CMouse | 0x541f70 | zeroes the counters |
| modified | CMouse::WndProc | 0x5423b0 | button-down +1, double-click (WM_xBUTTONDBLCLK) +2 per button |
| added | CMouseEx::GetFlushedXY(int&,int&) const | 0x5425c0 (slot 14) | second copy of GetXY, right after it |

### App, window, thread, timer, input
| kind | Class::Function | exe address | what changed |
|---|---|---|---|
| modified | CAppBase::OnPreCreate | 0x42b300 | default caption "あぷりちゃん" -> "CAPTION", classname "YANEAPPLICATION" -> "CLASSNAME" (size 640x480 and style 0xCA0000 unchanged; Ghidra prints the style as a string pointer) |
| modified | CWindow::CreateSimpleWindow | 0x581a00 | WNDCLASSEX.style 0 -> CS_DBLCLKS (8). Rest same as v1.65 |
| modified | CWindow::Create | 0x581e30 | WNDCLASSEX.style 0 -> CS_DBLCLKS. Windowed path: after InnerAdjustWindow, SystemParametersInfo(SPI_GETWORKAREA) and the outer width/height are clamped to rcWork.right/rcWork.bottom before CreateWindow. Centering now does SPI_GETWORKAREA again and uses ((rcWork.right-w)>>1,(rcWork.bottom-h)>>1) with the clamped outer size, not GetScreenSize with the client size (checked in the disassembly) |
| removed | CWindow::ChangeWindowStyle | 0x5825c0 | CIMEBase::Hide() call in the fullscreen branch removed (CIMEBase::Hide 0x5366e0 has no callers in the exe); Show() is still called in the windowed branch |
| modified | CWindow::gWndProc | 0x582a90 | when no CWindow is attached (GWL_USERDATA==0): WM_IME_SETCONTEXT (0x281) goes to DefWindowProc with lParam & 0x3ffffff0 (clears ISC_SHOWUIALL) |
| modified | CThread::StopThread | 0x57efe0 | after the m_dwThreadID==-1 check: `if (m_dwThreadID == GetCurrentThreadId()) return 2;` then `if (!m_bThreadExecute) return 0;` before WaitForSingleObject |
| modified | CFPSLayer::OnDraw | 0x530350 | the char buffer from wsprintf is converted with mbstowcs(wbuf[512], buf, 64) and the wide buffer is passed to CFont::SetText (Konami's CFont is wide-char: exe CFont::SetText 0x52f4d0 uses wvsprintfW) |
| added | CVirtualKey::IsVKeyRelease (name is ours) | 0x580de0 | new, placed after IsVKeyPush: same loop as IsVKeyPush but calls CKeyBase::IsKeyRelease (vtable +0x10). The matcher paired IsVKeyPush with 0x580de0; the real IsVKeyPush is 0x580d70 (calls slot +0xc = IsKeyPush). Non-virtual; header declaration added |
| modified | CMouse::GetXY | 0x542080 | windowed path: after the ClientToScreen subtraction, GetClientRect(hWnd,&rt) and x = (int)((1024.0f/rt.right)*x), y = (int)((768.0f/rt.bottom)*y) (float constants 0xbe963c/0xbe9640). The RECT used by the out-of-screen check is the same variable (moved up). SetXY is not scaled in the exe |

Files edited (worktree, Shift-JIS/CRLF via patch.py): yaneAppBase.cpp, yaneWindow.cpp, yaneThread.cpp, yaneFPSLayer.cpp,
yaneVirtualKey.cpp, yaneVirtualKey.h, yaneMouse.cpp. vtdiff slot counts unchanged (CVirtualKey 1, CWindow 2, CThread 11, all
other classes in the cluster match the exe).

Leads checked, no change:
- CTimer::Get/Set/Reset/Pause/Restart, CTimerEx::Flush, CFPSTimer::ResetTimer/WaitFrame: GetTickCount comes from the upstream
  inline CTimeBase::timeGetTime() (m_bUseTGT ? ::timeGetTime() : ::GetTickCount()). Not a Konami change.
- CWindow::IsWindowsClassName 0x582830: same 7 names (BUTTON, COMBOBOX, EDIT, LISTBOX, MDICLIENT, SCROLLBAR, STATIC). It only
  looks different because the last three compares are inlined.
- CFileDialog::CFileDialog 0x52dcd0: filter "All files {*.*}\0*.*\0\0", ext "txt", nMaxFile 256, same as v1.65. The matcher put
  GetOpenFile/GetSaveAsFile on 0x52dad0/0x52db20 (list-splice template code). The real ones are 0x52dbc0/0x52dc00 and they are unchanged.
- CShell::Execute/OpenFolder: "" is the empty-string fallback of string::c_str(). Unchanged.
- CFindWindow::EnumWndProc: it is the 17-byte island 0x52dfc0 (reached through thunk 0x4027a7 from FindSameWindow). Unchanged.
- CDebugWindow::OnPreCreate, CFlagDebugger, CAppManager, CAppIntervalTimer, CWinHookList, CCriticalSection, CMutex, CMsgSR,
  CMsgDlg, CSingleApp, CCOMBase, CCPUID, CRand, CSinTable (real ctor 0x56be10), CIntervalTimer, CDirectInput, joysticks, CKey*,
  CMouseEx, CMouseDecoratorManager, CMIDIInput: these match v1.65 apart from compiler noise and STL/YTL instances.
- yaneMemory.cpp / yaneError.cpp: compiled out (USE_MEMORY_CHECK / USE_ErrorLog off), so the exe has no code for them.

Unsure / dependencies:
- CFPSLayer::OnDraw now calls m_Font.SetText(WCHAR*). It compiles only after the font cluster changes CFont::SetText to take a
  wide string (exe 0x52f4d0: variadic, wvsprintfW, wide string member). Until yaneFont.h is updated this line will not compile.
- CMouse::GetXY divides by rt.right/rt.bottom. A minimized window (0x0 client rect) would divide by zero in float. The exe does
  the same thing.
- CThread::StopThread compares the _beginthread handle with GetCurrentThreadId(), as the exe does. That looks like a Konami bug,
  but it is ported unchanged.
- Some matcher labels in this cluster point at the wrong address, but none of them hides a change: CVirtualKey ctor is really
  0x580720, CDirectInputJoyStick::DIEnumDevicesCallback is really 0x537c20, CFileDialog::GetOpenFile/GetSaveAsFile are really
  0x52dbc0/0x52dc00, and the CTimer ctor/dtor bodies are 0x57f550/0x57f660.

### Text, fonts, scenario view
Files: yaneFont, yaneTextDraw, yaneTextDIB32, yaneTextFastPlane, yaneTextLayer, yaneTextPlane, yaneScenarioView, yaneIMEBase.

Main finding: Konami switched the whole text pipeline to **wide strings**. CFont now holds a `wstring` and draws with
TextOutW/GetTextExtentPoint32W. CTextDraw/CScenarioDraw text pointers and tag literals are wide (`LPCWSTR`, `L"..."`). The
html/scenario text is still decoded **byte-wise**: `(BYTE)*lpSrc`, so only the low byte of each WCHAR is used. Double-byte
decoding now depends on new language tags plus GetSystemDefaultLangID.

| kind | Class::Function | exe address | what changed |
|---|---|---|---|
| layout | CFont | — | `m_String` is `wstring` (was `string`). New `int m_nCharSet` at +0x4c, after m_nShadowOffsetY (name is ours). sizeof 0x50 |
| modified | CFont::CFont | 0x52ea70 | adds `m_nCharSet = SHIFTJIS_CHARSET` as the last statement (after SetFont(0) has set it to DEFAULT_CHARSET) |
| modified | CFont::SetFont(int) | 0x52eda0 | new font table, which also sets the charset: 0 "MS Sans Serif"/DEFAULT, 1 "Arial"/DEFAULT, 2 "MS Gothic"/SHIFTJIS, 3 ＭＳ Ｐゴシック/SHIFTJIS, 4 ＭＳ 明朝/SHIFTJIS, 5 ＭＳ Ｐ明朝/SHIFTJIS, 6 "GulimChe"/HANGEUL, default "" (charset unchanged) |
| modified | CFont::SetText(const wstring&) | 0x52f340 | takes wstring (wstring::assign inlined, hence the size) |
| modified | CFont::SetText(LPWSTR fmt,...) | 0x52f4d0 | `WCHAR buf[512]` + wvsprintfW |
| modified | CFont::SetText(int) | 0x52f630 | wsprintfW(L"%d") |
| modified | CFont::GetText (inline) | — | returns LPCWSTR |
| modified | CFont::OnDraw | 0x52f780 | CreateFont charset = m_nCharSet (was SHIFTJIS_CHARSET), pitch&family 0 (was FF_MODERN) |
| modified | CFont::GetSize | 0x52f930 | same CreateFont change; wide buffer, GetTextExtentPoint32W + wcslen; **sx = cx + 4** (was +3) |
| modified | CFont::TextOut | 0x52fb90 | wstring, TextOutW + wcslen |
| layout | CTextDrawContext | — | new `int m_nIndent` at +0x18, after m_rgbColorBk. New `int m_nLangMode` at +0x6c, before m_lpStr (names are ours). m_lpStr and m_lpTextAdr are LPCWSTR. sizeof 0x78 (was 0x70) |
| modified | CTextDrawContext::CTextDrawContext | 0x57a430 | inits both new fields to 0 |
| modified | CTextDrawContext::SetTextPtr / GetTextPtrNow / Get/SetTextOffset | 0x57a5b0.. | LPCWSTR (offsets are now in WCHARs) |
| modified | CTextDrawBase::UpdateText | 0x57ad70 | `nIndent` starts at `context.m_nIndent` (was 0). At each line end nIndent becomes 0 unless the bracket indent applies (only the first line is indented) |
| modified | CTextDrawBase::GetNextMoji | 0x57be50 | rewritten, see the tags section below |
| modified | CTextDrawBase::GetRect | 0x57b7a0 | `(LPCWSTR)&m_dwMojiLast` |
| modified | CTextDrawBase::SetContext | 0x57cde0 | lpStr is LPCWSTR. Bold weight is **FW_SEMIBOLD (600)**, was FW_BOLD (700) |
| modified | CTextDrawBase::IsToken/SkipTo/SkipTo2/SkipSpace/GetStrNum/GetNum/GetStrColor | 0x57cca0-0x57cdb0 | wide parameters (SkipTo2's buffer is LPWSTR); they forward to wide CStringScanner overloads |
| layout | CTextDrawBase | — | `m_lpRepString` is LPCWSTR. `vector<LPCWSTR> m_vTagList`. Offsets otherwise unchanged (m_szUserMes is still CHAR[256]) |
| modified | CTextDraw{DIB32,DIB32A,DIB32AA,FastPlane,FastPlaneA,FastPlaneAA}::OnDrawText | 0x57cfb0,0x57d110,0x57d270,0x57d780,0x57d8e0,0x57da40 | `(LPWSTR)&dwMoji` (also changed in the compiled-out CTextDrawPlane) |
| layout | CScenarioDrawBackLogManager::CLog | — | `smart_array<WCHAR> m_szLog`, SetStr(smart_array<WCHAR>) |
| modified | CScenarioDrawBackLogManager::SetLog | 0x559530 | wide text: SkipTo(L"<HR>"), smart_array<WCHAR>. CopyMemory still copies `nSize-1` **bytes** (a Konami bug, kept) |
| modified | CScenarioDraw::SetConfigFile | 0x55a790 | each ReadLine'd CHAR line goes through `MultiByteToWideChar(CP_ACP,MB_PRECOMPOSED,buf,256,wbuf,256)` before the lr check, then is parsed with L"#..." tokens |
| modified | CScenarioDraw::Open | 0x55f420 | `SetTextPtr((LPCWSTR)GetFile()->GetMemory())`: the raw file is used as UTF-16 with no conversion |
| modified | CScenarioDraw::UpdateText / SkipToLabel | 0x560310 / 0x562760 | vector<LPCWSTR> tag list, L"" tokens (GetNextStr still returns a narrow `string`) |
| modified | CScenarioDraw::OnDrawText(HDC) / OnDrawBG(HDC) / OnDrawSCChara(HDC) | 0x55e120 / 0x55ea40 / 0x55f080 | CFont::SetText(L"...") (L"立ちキャラ[%d] = %d" is real UTF-16 in the exe) |

All other functions in these files match the source apart from inlining and STL/smart_ptr noise:
- yaneTextDIB32: UpdateText at 0x577a70 is the unmatched 885-byte function, with the inline UpdateTextHorizontal and UpdateTextVertical folded into it.
- yaneTextFastPlane, yaneTextLayer, yaneIMEBase: unchanged.
- yaneTextPlane: not in the exe (USE_DirectDraw is off).
- ~CTextDrawContext: at 0x57a500, found through the vtable.
- The remaining UNMATCHED entries are template instances:
  - CFont: the wstring internals (0x52f680, 0x52fca0-0x530000).
  - yaneTextDraw: the auto_vector_ptr and vector helpers.
  - yaneScenarioView: CTextDrawContext::operator= (0x55f7a0), smart_ptr helpers, and the CDIB32MaskMSB functor (0x57d740).
- The CTextDrawFastPlane* OnDrawText/OnDrawSprite functions are at 0x57d780.. and 0x57dba0/0x57dc20. The sheet's matches at 0x57dca0 and 0x57de60 are wrong; those are vector helpers.
- CScenarioDraw's class layout is unchanged; the ctor offsets verified against the source.

#### GetNextMoji (0x57be50): tags and semantics
- Text is LPCWSTR, but each character is `(BYTE)*lpSrc++`, i.e. only the low byte of each WCHAR is used. A double-byte character is still `lead | trail<<8`, where trail is the low byte of the next WCHAR.
- End of text returns **2** (was 3), the same as `<HR>`.
- Tags kept: `<BR>`, `</P>`, `<HR>`, `&lt;`, `&gt;`, `&amp;`, `<B>`, `</B>`, `<FONT size= color=>` (face= removed), `</FONT>`, `<Select n>`, `</Select n>`.
- Tags removed (their literals are absent from the exe): `<!--`, `<head>`, html/body, U/S/I, `<P>`, `<P align>`, `<VDATA>`, `<IndentForBracket>`, `<GAIJI>`, `<ReplaceString>`, `<Bottom>`/`<Middle>`/`<Top>`, `<if>`/`<else>`/`<endif>`.
- Unknown-tag skipping is removed, so m_vTagList is never filled. An unknown `<...>` is drawn as characters, and CScenarioDraw's special-tag loop has nothing to process.
- New tags set `context.m_nLangMode`:
  - `<LJ>` = 1, Japanese: Shift-JIS lead bytes 81-9F and E0-FC.
  - `<LA>` = 2, ASCII/Latin: single bytes.
  - `<LK>` = 3, Korean: lead 81-FD, trail 41-FE.
  - Mode 0 is "auto". At the first character it becomes 1 on a 0x411 (Japanese) system, 3 on a 0x412 (Korean) system, and 2 otherwise.
  - The mode resets to 0 on `<BR>`, `</P>`, `<HR>`, end of text, the prohibit-buffer return, the replace-string return, and the `<FONT` error returns.
- Decoding by mode:
  - LJ on a Japanese system: decodes the pair.
  - LJ elsewhere: half-width kana A1-DF becomes '?', and an SJIS pair becomes 0x3F3F ("??"), consuming the trail byte.
  - LK on a Korean system: decodes the pair.
  - LK elsewhere: 0x3F3F, consuming the trail byte.
  - LA on a Japanese system: kana becomes '?', and an SJIS lead becomes 0x3F3F without consuming the trail.
  - LA on a Korean system: a Korean lead becomes 0x3F3F without consuming the trail.
  - LA on any other system: bytes pass through.
- So the game's `"+%s+: <LA>%s"` format renders the text after `<LA>` as single-byte (Latin) text. On J/K systems, bytes that would start a double-byte character are masked to '?', so foreign text cannot produce mojibake.

#### Unsure / not ported here
- **Needed outside my files (yaneStringScanner, other cluster):** wide CStringScanner overloads. The exe calls these from my files:
  - `IsToken(LPCWSTR&,LPCWSTR)` 0x5755a0. Its comparison runs a per-character CRT function (0xb09e25); it may be case-insensitive.
  - `SkipTo(LPCWSTR&,LPCWSTR)` 0x575620
  - `SkipTo2(LPCWSTR&,LPCWSTR,LPWSTR)` 0x575770
  - `SkipSpace(LPCWSTR&)` 0x575880
  - `GetStrNum(LPCWSTR&,int&)` 0x575960
  - `GetNum(LPCWSTR&,int&)` 0x575ae0
  - `GetStrColor(LPCWSTR&,COLORREF&)` 0x575ba0
  - `GetNumFromCsv(LPCWSTR&,int&,bool=false)` 0x5766f0
  - `string GetNextStr(LPCWSTR&)` 0x5764a0, which returns a narrow string.

  My edited files will not compile until these exist.
- Callers of `CFont::SetText` outside my files must pass wide strings. yaneFPSLayer already does (mbstowcs).
- The GetNextMoji trail-byte checks `if (dwNext<0x40 && dwNext>0xfc) return 0;` are ported literally. The condition can never be true; it is probably Konami's typo for `||`.
- I could not tell how the game fills CTextDraw text (true UTF-16 or one byte per WCHAR). The engine itself only ever looks at low bytes.
- Field names m_nCharSet, m_nIndent and m_nLangMode are ours. m_nIndent's only reader in the yaneSDK is UpdateText; the game presumably sets it.
- Ghidra reported several "unreachable block removed" warnings inside GetNextMoji's `<Select>` vector-resize code. I treated these as STL inlining artifacts and checked the language branch against the disassembly.

### File layer
Files: yaneFile, yaneDir, yaneStringMap, yaneStringScanner, yaneSerialize, yaneLineParser, yaneLZSS, yaneMapIO.
`vtdiff.py CFile` = 27/27 slots, `vtdiff.py IFile` = 26/26 slots after the header changes.

Note: the matcher output for yaneStringMap, yaneSerialize and yaneStringScanner are misaligned (the `[order]`
names are shifted by the static-init stubs and by the added WCHAR functions). The real mapping is in the
table below.

| kind | Class::Function | exe address | what changed |
|---|---|---|---|
| layout | IFile | vtable slots 4,5 | two new pure virtuals between Close and GetFilePtr: `Seek(LONG)` and `Tell()` (names ours) |
| layout | CFile | ctor 0x525dc0, dtor 0x525e80 | new first member `vector<string> m_aszLocalPathList` at +0x04 (copy of the path list taken by Open/Read; name ours); everything else moves by 0x10; new `DWORD m_dwReadSize` +0x38 (bytes to read = packed size) and `DWORD m_dwStartPos` +0x3c (offset inside the archive); sizeof(CFile)=0x40 |
| layout | CFile::m_aszPathList | 0xd49598 | static is now a plain `vector<string>` (was `smart_ptr<vector<string> >`); inline SetPathList/GetPathList adapted. No game code touches it, so it is always empty |
| added | CFile::m_szLanguage | 0xc7f1d0 | `static char[3] = "ee"` (name ours). The game writes [0] = first letter of the selected language, [1] = 'j' (fn 0x626600) |
| added | CFile::ReadLineLF(string&) | 0x52b6d0 (vtable slot 26, CFile only) | copy of ReadLine(string&) that ends a line at LF only and skips 1 byte; called non-virtually by game code (0xa2e900, 0xa30c10). Name ours |
| modified | CFile::CFile | 0x525dc0 | initializes m_dwReadSize/m_dwStartPos to 0 |
| modified | CFile::Open | 0x5273e0 | rewritten: '?' in the name is replaced by m_szLanguage[0] (szName1) / [1] (szName2); for access=="rb" the path list is tried first (name1, then name2 remembered as fallback); then MakeFullName(name1), then MakeFullName(name2 or the remembered fallback); then the path list again |
| removed | CFile::InnerOpen (old fopen-only version) | none | moved/rewritten, see 0x529980 |
| added | CFile::ReplaceLanguage(string&) | 0x528690 (island) | static; replaces the first '?' with m_szLanguage[0]. Unreferenced. Name ours |
| added | file cache globals | 0xd49570, 0xd49560, 0xd49540 | `vector<smart_ptr<CPackFileCache> >` (archive indexes), `vector<smart_ptr<CFile> >` (files kept in memory), `CCriticalSection` (names ours; struct name CPackFileCache comes from RTTI) |
| added | CPackFileCache | (struct, 0x20 bytes) | `string m_szFileName; int m_nFileNum; auto_array<CFileInfoDx> m_aInfo;` (member names ours) |
| added | CFile::AddCache(string) | 0x528ab0 | static; lower-cases, only `.png`; if not in the cache: new CFile, Read(name), push_back under the lock; trace "AddCache %s\n" |
| added | CFile::FindCache(string) | 0x528d20 | static; key = "merge/" + ConvertSlash(name); returns the cached CFile* whose GetName()==key (under the lock); trace "☆FindCache %s\n" |
| added | CFile::RemoveCache(string) | 0x528f50 | static, unreferenced; erases the entry with GetName()==name, then (sic) deletes `it->get()` after the erase |
| added | CFile::AddCacheByPrefix(string) | 0x529170 | static, unreferenced; for every cached archive entry whose name starts with the (lower-cased, '\\'-converted) prefix: AddCache(entry) |
| added | CFile::ConvertSlash(string&) | 0x5293f0 | static; '/' -> '\\' in place, returns a copy |
| added | CFile::RemovePackCache(string) | 0x529640 | static, called by game code 0x6d99f0; removes the cached index of archive MakeFullName(name) (lower case); no lock |
| added | FileCacheTrace(LPCSTR,...) | 0x52c360 (1-byte ret) | empty variadic debug trace (name ours) |
| added | CFile::Seek(LONG) | 0x5298f0 (slot 4) | `fseek(m_lpFile, off, SEEK_CUR)` if open, else 0 |
| added | CFile::Tell() | 0x529920 (slot 5) | `ftell(m_lpFile) - m_dwStartPos` if open, else 0 |
| added | CFile::InnerClose() | 0x529950 | fclose the stream only (name ours) |
| modified | CFile::InnerOpen | 0x529980 | rewritten: does the old InnerRead lookup on a FILE* stream: "!%x,%x" memory image; fopen(filename as given); else climbs folders to `<dir>.dat`, archive ident is **"KCEJYUGI"** (only; yanepack/yanepkEx/yanepkDx removed), CFileInfoDx entries with nibble-swapped names, index cached in CPackFileCache (keyed by lower-case archive path), **binary search** over the sorted names, fseek to startpos. Sets m_dwFileSize=filesize, m_dwReadSize=arcsize, m_dwStartPos=startpos. Plain file: size via fseek/ftell |
| added | DecodeFileName (file static) | 0x52a450 | nibble swap of a NUL-terminated archive entry name (name ours) |
| modified | CFile::Read | 0x52a490 (slot 7) | rewritten: first FindCache(lower(name)) (hit: shares the cached memory, sets name/size/adr only); else same search as Open but with InnerRead (the fallback probe in the first loop uses InnerOpen(...,"rb")); no "rb" condition, and the second path-list pass does not re-copy the list |
| modified | CFile::InnerRead | 0x52ae30 | rewritten on top of InnerOpen(filename,"rb"): GlobalAlloc m_dwFileSize+1, ReadData(packed) + CLZSS::Decode when sizes differ, else ReadData directly; InnerClose; YPK1 decoding as before (now also runs for memory images) |
| modified | CFile::Reset | 0x52b440 | also `fseek(m_lpFile, m_dwStartPos, SEEK_SET)` when a stream is open |
| modified | CFile::ReadData | 0x52baa0 | when a stream is open: fread clipped to m_dwReadSize-Tell(); returns the fread count |
| modified | CDir::FindFile | 0x44bae0 | archive ident: only "KCEJYUGI" (sets m_nPackFile=2); yanepack/yanepkEx/yanepkDx idents removed; Dx entry names are nibble-decoded |
| added | DecodeFileName (yaneDir.cpp static) | 0x44c640 | same nibble swap as in yaneFile (separate copy) |
| added | CStringScanner::IsToken(LPCWSTR&,LPCWSTR) | 0x5755a0 | WCHAR version; case-insensitive via toupper (zero-extended WCHAR); unlike the CHAR one it does **not** SkipSpace first |
| added | CStringScanner::SkipTo(LPCWSTR&,LPCWSTR) | 0x575620 | WCHAR version; _ismbblead on the low byte, skips an extra WCHAR after a lead byte |
| added | CStringScanner::SkipTo2(LPCWSTR&,LPCWSTR,LPWSTR) | 0x575770 | WCHAR version; CopyMemory copies nSize *bytes* (nSize counts WCHARs), terminator at pSkipedStr[nSize] |
| added | CStringScanner::SkipSpace(LPCWSTR&) | 0x575880 | WCHAR version |
| added | CStringScanner::SkipSpace2(LPCWSTR&) | 0x575910 | WCHAR version |
| added | CStringScanner::GetStrNum(LPCWSTR&,int&) | 0x575960 | WCHAR version |
| added | CStringScanner::GetNum(LPCWSTR&,int&) | 0x575ae0 | WCHAR version |
| added | CStringScanner::GetStrColor(LPCWSTR&,COLORREF&) | 0x575ba0 | WCHAR version |
| added | CStringScanner::GetStr(LPCWSTR&,WCHAR) | 0x575ce0 | WCHAR version, returns wstring (not in the coordinator's list; used by GetStrFromCsv W) |
| added | CStringScanner::GetNextStr(LPCWSTR&) | 0x5764a0 | WCHAR input, returns narrow string of the **low byte** of each WCHAR (`CHAR c=(CHAR)*lp`), _ismbblead on that byte; only the opening `"` test compares the full WCHAR |
| added | CStringScanner::GetNumFromCsv(LPCWSTR&,int&,bool=false) | 0x5766f0 | WCHAR version (uses the W SkipSpace2/GetNum) |
| added | CStringScanner::GetStrFromCsv(LPCWSTR&) | 0x5767b0 | WCHAR version, returns wstring (GetStr(lp,L','); SkipTo(lp,L",")) |

No behaviour changes found in: CStringMap (all functions; Serialize=0x572460, Write=0x572960/0x572b70,
Append=0x572ce0/0x572ef0, Read=0x573060/0x573230, GetStr=0x573360, GetNum=0x573530, GetLongNum=0x573660,
Delete=0x573790, Clear=0x573870, ReadFromConfigFile=0x573940, Replace=0x573da0; the "883-byte Read" lead was a
misalignment, 0x573940 is ReadFromConfigFile), CSerialize, CLineParser, CLZSS (Decode checked), CMapIO, and the
remaining CFile functions (Close, Delete, CreateTemporary, Get*Dir, GetParentDir, GetSuffix*, ToLower,
MakeFullName, PathFileExists, Write x2, WriteBack, GetSize/GetMemory, Encode, GetName, ReadLine x2, ReadLine2,
Load, Save x2).

#### Unsure / not ported

- Narrow CStringScanner versions of IsToken, SkipTo, GetStrNum, GetStrColor, GetStr(LPCSTR&,CHAR),
  GetNumFromCsv and GetStrFromCsv are **absent from the exe** (while unreferenced narrow SkipTo2/SkipSpace2 are
  present as islands), so Konami probably converted those in place. Kept them as the coordinator asked; the
  wide ones are placed right after their narrow twin (exe order where both exist: narrow first).
- Linkage/placement of the cache globals: guard-bit patterns suggest d49560/d49540 might be class statics
  and d49570 a plain global; ported all three as file statics in yaneFile.cpp (only yaneFile functions use them).
- The "C:\yugionline\...\yaneDir.cpp" / "yaneFile.cpp" strings are __FILE__ arguments of the placement
  `operator delete(p,1,file,line)` (0x425370) in EH unwind funclets, i.e. Konami compiled with
  `#define new new(_NORMAL_BLOCK,__FILE__,__LINE__)` (crtdbg release inline operator new). Not a yaneSDK code
  change; belongs in stdafx.h (off limits). Line numbers: yaneDir.cpp:185 = `new CDir`, yaneFile.cpp:957 =
  `new CPackFileCache`.
- Bugs kept as in the exe: RemoveCache deletes the element after the erased one; cache hits in Read share
  the cached memory without m_bMemoryImage (Close() would GlobalFree it) and leave m_lpFileMemPos unset;
  wide SkipTo2 copies half the text.
- RemovePackCache's `if (!it->isNull())` before erase is my reading of a `cmp [esi+4],0` test; exact source
  form unknown.
- Seek returns fseek's int as LONG; Tell's const-ness unknown (non-const used).
- 0x44b3f0/0x44c980 (yaneDir) and similar 37/12-byte stubs with guard 0x12d3501 are header static-object
  init/atexit stubs, not yaneSDK code.

### Audio
Main finding: Konami added a **loop position** argument to every loop setter in the audio stack. It is set with
`SetLoopMode(bool, LONG)` on a CSoundBase, then `IkmLongSound::SetLoop(bool, LONG)`, then `IkmPCMstream::SetLoop(bool, LONG)`.
Each implementation stores the value in a new field placed right after its `m_bLoop`. The exe proves it: every
SetLoopMode/SetLoop implementation ends in `ret 8`, and object sizes grew by 4. The names `lLoopPos`/`m_lLoopPos` are ours.
The yaneSDK call sites (CBGMLoader, CSELoader, CSound::Load) all pass 0, so the source declares `=0` default arguments.
Konami also reworked the streaming path: kmLongSound, the DirectShow reader and kmMmioFile.

| kind | Class::Function | exe address | what changed |
|---|---|---|---|
| layout | IkmPCMstream::SetLoop | vtable slot 7 | added 2nd param `LONG lLoopPos` (mtknPcmreader.h) |
| layout | kmDirectShowAudio | 0x427de0 (new 0x48, was 0x40) | new fields `m_lLoopPos` (+0x38) and `m_hEvent` (+0x3c) |
| modified | kmDirectShowAudio::kmDirectShowAudio | 0x427de0 (inlined in CreateDirectShow) | `m_lLoopPos=0; m_hEvent=CreateEvent(NULL,FALSE,FALSE,NULL)` after `m_bLoop=true` |
| modified | kmDirectShowAudio::~kmDirectShowAudio | 0x427fd0 | `CloseHandle(m_hEvent)` after the COM releases |
| modified | kmDirectShowAudio::SetLoop | 0x428350 | stores lLoopPos |
| modified | kmDirectShowAudio::Read | 0x428100 | rewritten: `Update(0,m_hEvent,..)` + `WaitForSingleObject`, GetInfo; on MS_S_ENDOFSTREAM always `Seek(m_lLoopPos)`, Update+Wait+GetInfo again, return sum; the m_bLoop check, the recursion and the FAILED(hr) path are gone |
| layout | kmACMtoPCM | 0x427660 (new 0x48) | new `m_lLoopPos` (+0x3c), init 0; stored by SetLoop (0x4279c0), never read |
| layout | CkmRawWave | 0x428550 (CreateRAW, new 0x20) | new `m_lLoopPos` (+0x14), init 0; SetLoop 0x4289c0 stores it |
| modified | CkmRawWave::Read | 0x428820 | after `seekToTop()` on loop: `f->seek(GetFormat()->nBlockAlign * m_lLoopPos)` |
| layout | IkmLongSound::SetLoop | vtable slot 17 | added 2nd param `LONG lLoopPos` |
| layout | kmLongSound | 0x425fa0 (create, new 0x74) | new `m_lLoopPos` at +0x18 (after m_bSuspend); `m_CriticalSection` is now **static** (global object 0xd45078, static init 0x4264a0); removed `m_pDSNotify`, `m_aPosNotify`, `m_hNotificationEvent` |
| modified | kmLongSound::kmLongSound | 0x425fa0 | `m_lLoopPos=0`; no notify fields, no CreateEvent for m_hNotificationEvent |
| modified | kmLongSound::~kmLongSound | 0x4262d0 | no CloseHandle(m_hNotificationEvent) |
| modified | kmLongSound::SetLoop | 0x426f40 | stores lLoopPos, forwards `GetReader()->SetLoop(m_bLoop, lLoopPos)` |
| modified | kmLongSound::stop | 0x426940 | now only `if(!m_bOpen) return false; if(IsThreadValid()){ StopThread(); while(!ThreadSleep(100)); } return true;` (fadeOut, PulseEvent and m_aPosNotify parts removed) |
| modified | kmLongSound::close | 0x426cd0 | m_pDSNotify / m_aPosNotify release removed |
| modified | kmLongSound::inner_open | 0x4258c0 | `SetLoop(m_bLoop, m_lLoopPos)` |
| modified | kmLongSound::InitSoundData | inlined in 0x425da0 | `len = (getBufferSize()/8*7) & ~3` |
| modified | kmLongSound::GetNextSoundData | 0x425be0 | takes/releases the critical section itself; ThreadSleep 50 to 20; new clamp when playpos < write pos (wrap); `playpos >` changed to `>=`; `usedSize &= ~3`; returns 0 after ThreadSleep(20) if usedSize < nAvgBytesPerSec/2 |
| modified | kmLongSound::ThreadProc | 0x425da0 | no CS around GetNextSoundData; dead `if(false/*canUseNotify*/)` branch dropped (it referenced the removed event); inner ThreadSleep 50 to 20; after the final Stop() waits `while(IsThreadValid()) ThreadSleep(20)` |
| layout | kmMmioFile | 0x428c50 (createMMIO) | `HMMIO hmmio` removed |
| modified | kmMmioFile::open | 0x428e40 | rewritten: `m_file.Open(m_filename,"rb")`, then parses RIFF/WAVE/'fmt '/'data' with `CFile::ReadData` and skips other chunks with `CFile::Seek`; dwDataPos=`m_file.Tell()`; returns `m_pWaveFormat && dwDataLen` |
| modified | kmMmioFile::close | 0x428df0 | `m_file.Close(); free(m_pWaveFormat); m_pWaveFormat=NULL; return true;` |
| modified | kmMmioFile::getWaveFormat/read/seekToTop/seek/GetCurrentPos | 0x4297e0/0x4296e0/0x429720/0x429760/0x4297a0 | no hmmio; ReadData, Reset+Seek(dwDataPos), Seek, Tell()-dwDataPos (the "gcp" Err.Out is gone too) |
| layout | CSoundBase::SetLoopMode | vtable slot 9 | added `LONG lLoopPos=0` |
| layout | CSoundNullDevice / CMovieNull | 0x53fb10 / 0x543800 (new 0xc) | new `m_lLoopPos` (+8), stored by SetLoopMode, not initialized by the ctors |
| modified | CMIDIOutput::SetLoopMode / CMovie::SetLoopMode | 0x53f670 / 0x5433c0 | forward lLoopPos |
| layout | CSound | 0x56c0e0 (new 0x40) | new `m_lLoopPos` (+0x20, after m_bLoop) and `m_dwLoopStartPos` (+0x3c, after the factory) |
| modified | CSound::CSound | 0x56c0e0 | both new fields set to 0 |
| modified | CSound::SetLoopMode | 0x56d9d0 | stores lLoopPos |
| modified | CSound::Play() | 0x56d0c0 | looping branch: `if (m_dwLoopStartPos > 0) m_lpDSBuffer->SetCurrentPosition(m_dwLoopStartPos)` after a successful Play |
| layout | CStreamSound | 0x42eee0 (inlined ctor, new 0x54) | new `m_lLoopPos` (+0x50), init 0 |
| modified | CStreamSound::SetLoopMode | 0x42f870 | stores lLoopPos, `m_sound->SetLoop(bLoop, lLoopPos)` |
| layout | CCDDA | 0x4331f0 | new `m_lLoopPos` (+0x33c, after m_nEndPos); `SetLoopMode(bool, LONG)` stores it; never read |
| added | CDirectSound::m_lrInitResult | 0xc7f090 (.data, =1) | static LRESULT; the ctor (0x44da20) stores the Initialize() result in it; game code reads it (0x685a60) |
| modified | CMovieDS::SetLoopMode | (compiled out) | signature only, so it still overrides CSoundBase |

No change found (decompilation compared against v1.65):
- enraAudioPlugin, enraPCMReaderFactory
- mtknDshelper (kmStreamSoundHelper; buffer flags 0x18088 are unchanged), mtknWave, mtknWaveMp3, kmACMtoPCM::Open/Read/doConvert (the GlobalAlloc and acmStreamSize leads come from the inline srcAlloc/getReadBuffer)
- yaneAcm, yaneAudioMixer, yaneBGMLoader (the large functions are just inlined strings and vectors; calls pass `(x,0)`), yaneLoadCache, yaneMIDILoader, yaneMIDIOutput (only CSoundNullDevice is created)
- yaneSELoader (its ctor is at 0x566cc0, unchanged), yaneSoundLoader, yaneSoundBase.cpp, yaneSoundFader, yaneVolumeFader, yaneMovie, CDirectShow
- CSound::Load: the "CSound::Load " string is the argument of the upstream `Err.Out("CSound::Load "+filename+...)` call.

#### Unsure / not ported
- Name, type (LONG) and units of the loop position are guessed. The `=0` defaults are ours: the exe call sites always push an explicit 0.
- `CSound::m_dwLoopStartPos` (+0x3c) is only read (in Play). I found no write to it in yaneSDK or in the decompiled game code. Its meaning is a guess.
- `CDirectSound::m_lrInitResult` could just as well be a plain global. The name is ours.
- kmMmioFile depends on CFile changes owned by the yaneFile cluster: `Seek`/`Tell` (new vtable slots 4/5, already in yaneFile.h under those names), and stream-mode `ReadData`/`Reset`/`Close`.
- kmLongSound: the static CS definition is placed after `IkmLongSound::create()`, where its static-init code sits in the exe. Class-static versus file-static cannot be told apart.
- Files outside my list that still declare `SetLoopMode(bool)` and would no longer override if compiled in: yaneMIDIOutputMCI.h/.cpp, yaneMIDIOutputDM.h/.cpp, yaneMovieAVI.h/.cpp, yaneMovieAVIAUDIO.cpp, yaneMovieAVIVIDEO.cpp. All are compiled out.
- Not identified: 0x423110/0x423130/0x423150/0x423170 (tiny `return 1/0/1/1` functions at the start of the enraAudioPlugin block, unreferenced). They are probably header inlines or COMDAT; not ported.
- Sheet mislabels, for the record:
  - operator< is 0x423200
  - CreateDirectShow is 0x427de0 (0x4284d0 is GetPosToByte)
  - CreateRAW is 0x428550
  - IkmWaveFileReader::create is 0x428b80, createMMIO is 0x428c50, createMP3 is 0x42a130
  - IkmLongSound::create is 0x425fa0
  - IkmStreamSoundHelper::create is 0x425210
  - the CMIDIOutput ctor is 0x53f430

### Graphics
CFastPlane (57), CDIBDraw (2+28), CDIB32 (33), CGUIButton (11), CGUISlider (11), CMouseLayer (5), CGraphicLoader (11).

| kind | Class::Function | exe address | what changed |
|---|---|---|---|
| added | CFastDraw::SetEmulationOnly(bool) + static bool m_bEmulationOnly (names ours) | 0x44fcb0, data 0xc7f0e4 (initial value 1) | static setter for a new flag, placed between CWindowClipper::Clip and the CFastDraw ctor. Nothing in the exe calls it (isl) |
| modified | CFastDraw::CFastDraw() | 0x44fcd0 | `m_DirectDrawBase(true)` became `m_DirectDrawBase(m_bEmulationOnly)` |
| modified | CFastDraw::OnDraw(RECT*,bool) | 0x450c40 | new first statement `m_bMenuDrawing = false;` |
| modified | CFastDraw::InnerOnMenuDraw() | 0x450d60 | full-screen path only sets m_bMenuDrawing=true when the menu is shown; the `else m_bMenuDrawing=false` was removed |
| modified | CFastDraw::InnerOnDraw(RECT*) | 0x450e00 | after `SetRect(&r,...)`: returns when lpRect!=NULL and left/top/right/bottom are all 0 |
| modified | CFastDraw::WndProc | 0x451830 | new `case WM_ENTERMENULOOP: m_bMenuDrawing = IsFullScreen(); return 0;` |
| added | CFastPlane::GetTotalSurfaceSize() (static, name ours) | 0x4530b0 | walks m_lpPlaneList and sums GetSize() sx*sy*bytes by m_nSurfaceType (3,4:2; 5,6,10,11:3; 7,8,12,13:4). Placed between RestoreAll and ResetColorKey. Nothing in the exe calls it (isl) |
| modified | CFastPlane::InnerLoad(string,bool) | 0x453ca0 | YGA-use (m_bYGAUse) branch: `*dib.GetYGA() = true;` before `Blt(&dib,0,0)` |
| modified | CGraphicLoader::Render(DWORD*,LONG) | 0x5324d0 | new `case 32:` copies each source row (bottom-up) to the destination with a lPitch-byte memcpy |

#### Checked and found unchanged
- yaneDIB32 (all non-asm functions compared; P5/PMMX asm blitters sampled), yaneDIB32Alpha (sampled; no unmatched),
  yaneDIB32Effect, yaneDIBDraw (all; its USE_DIRECTX branches are compiled into the exe, so USE_DIRECTX was defined),
  yaneDIBitmap, yaneDirectDraw, yaneDirtyRect, yaneFastPlaneInfo, yaneGTL (InitTable/OnChangePalette compared,
  Clipping sampled), yaneGraphicLoader (apart from Render), yaneGUIButton, yaneGUISlider, yaneGUIParts (header only),
  yaneLayer, yaneMouseLayer, yaneMapLayer, yaneMorpher, yanePalette, yanePlaneBase, yanePlaneEffectBlt, yanePlaneTransiter,
  yaneRegion, yaneRegionHook, yaneRootCounter, yaneInteriorCounter, yaneSequencer, yaneSprite, yaneSpriteChara,
  yaneSpriteEx, yaneSpriteLoader, yaneBumpMap, yaneCellAutomaton, yaneGameObjectBase.
- Template blit instances: the UNMATCHED entries in yaneFastPlane2..4 (477) were scanned. None calls an API, uses a
  string or allocates memory. yaneFastPlane5 (51) allocates only the MorphBlt buffers, as upstream does. A sample of
  each kind matched yaneGTL.h. The out-of-line dispatchers (Clear, BltFast, Blt, BltTo, BlendBlt*, FadeEffect,
  MorphBlt, RotateBlt...) have the same prologue/switch structure as the source; Clear was compared in full.
- The leads with no exe match are all present and unchanged: CFastDraw::TestDisplayMode = 0x4506b0;
  CFastPlane::GetFileName = 0x453460; CFastPlane::InnerGetBpp = 0x455a20 (a 5-byte jmp; GetBpp is a jmp thunk next to it);
  CMorpherCalc::Set = 0x540ec0, SetRev = 0x5410e0; CPalette::Get = 0x544c10 (Get and Set are labelled the wrong way round
  in the sheet); CSpriteBase::GetSSprite = 0x56fe60; pointsort = 0x441e40; CMouseLayer(smart_ptr,..)/SetPlane = 0x542a10/0x542b70.
  CFastDraw::GetAllWindowRect uses GetWindow because the GetNextWindow macro expands to it.

#### Unsure / not ported
- yaneScene and yaneSceneTransiter seem not to be linked at all. The exe has no CScene/CSceneControl/CSceneTransiter
  vtable (the game has its own CSceneMng). The code in their sheets belongs to neighbouring objects: STL/smart_ptr
  instances from yaneScenarioView/yaneSELoader, and the CSELoader ctor at 0x566cc0. So nothing was changed there.
- Several sheets are misattributed at their edges:
  - The head of the yanePlaneTransiter sheet (0x553380..0x5576d0) is really the tail of yanePlaneEffectBlt: the static
    m_sin_table/m_blt_table, MakeBltTable 0x5534a0, BltTransTable ctor 0x5534e0, and transitions 55..68 (Diagonal..CellGatherBlt2).
    The real CPlaneTransiter::Inc/Dec/OnDraw are at 0x557750/0x557790/0x5577d0.
  - yaneBumpMap's 0x430d80..0x431a00 is other code (CAppIntervalTimer). The real CBumpMap::Resize/GetTable/GetStartTable
    are at 0x431ac0/0x431b50/0x431b70.
  - The head of the GUISlider sheet (0x534d50..0x535000) belongs to GUIButton.
  - In yanePlaneBase the matches are shifted: GetBackup is 0x544fe0, and the two factory Create functions are 0x545160 and 0x5451e0.
- yanePlaneEffectBlt: none of its 91 functions was matched. They were checked through the FuncList table at 0xc80070
  (83 entries, the same order as the source), CPlaneTransBlt::Blt 0x545780 (same switch), the sizes within each family
  being symmetric, and a few compared samples (MirrorBlt1, WaveBlt1, FadeBlt). They were not compared line by line.
- CDirtyRect::Refresh 0x44e2e0: Ghidra dropped part of the subtraction code as unreachable. The merge loop and the overall
  shape match, but the subtraction branches could not be fully verified.
- CFastPlane::GetTotalSurfaceSize: the exe groups the cases 5/11, 6/10 and 7/13, and that grouping was kept. Whether the
  function was a static member or a free function cannot be told, because nothing calls it; a static member was chosen.
- m_bEmulationOnly could be a file-static instead of a class static (its .data initial value is 1). Neither the setter
  nor any other code writes it (the only reference in the decompiled exe is the ctor), so in the shipped exe it is always 1.

## Not in yo2.exe (removed, or never linked)

- yaneScene.cpp, yaneSceneTransiter.cpp: not linked (no CScene/CSceneControl/CSceneTransiter vtables; the game has
  its own scene manager). yaneTextPlane, yanePlane, the movie AVI/DS, MIDI MCI/DM, saver files: compiled out by the
  configuration above. yaneMemory/yaneError: compiled out.
- CStringScanner's narrow IsToken, SkipTo, GetStrNum, GetStrColor, GetStr(LPCSTR&,CHAR), GetNumFromCsv,
  GetStrFromCsv: absent (Konami converted them to the wide versions in place); the narrow upstream versions are kept
  because upstream callers still use them.
- CFile::InnerOpen (old fopen-only form), CScenarioDraw's unknown-tag handling (GetNextMoji no longer collects
  unknown tags), most HTML tags of GetNextMoji, CDir/CFile's yanepack/yanepkEx/yanepkDx archive formats,
  CWindow::ChangeWindowStyle's CIMEBase::Hide() call: see the tables above.
- Source functions with no exe counterpart found: 11 (inline-in-.cpp helpers folded into callers, and
  FileCacheTrace, an empty inline function).

## Not Konami's: portability changes for g++

Marked `// [portable]`, behaviour-neutral, only so that `i686-w64-mingw32-g++` builds the library: MSVC6 for-scope,
iterator/NULL comparisons, `set::erase` result, const-ness of scanner arguments, temporaries bound to references,
`__int64(x)`, and a C equivalent for every MSVC `_asm` block (kept under `#ifdef _MSC_VER`; differential-tested
against the original asm: 141 blocks x 300 random cases, 0 mismatches).

Off Windows (phase 3, `platform/DESIGN.md` §7), also `[portable]` and identical on Win32, where `LONG_PTR`,
`DWORD_PTR` and `UINT_PTR` are the 32-bit types:
- **Pointers in 32-bit integers** (the pointer would not survive on a 64-bit host):
  - yaneWindow: `SetWindowLong(GWL_USERDATA/GWL_WNDPROC, (LONG_PTR)…)`, ×4.
  - yaneIntervalTimer:
    - `timeSetEvent(…, (DWORD_PTR)this, …)` and `StaticTimeProc[M]` take `DWORD_PTR`.
    - `SetTimer(…, (UINT_PTR)this, …)`, `StaticTimerProc` takes `UINT_PTR`, and `m_uTimer` is `UINT_PTR`.
  - yaneFindWindow: `EnumWindows` lParam.
  - yaneDebugWindow: `LB_ADDSTRING` lParam.
  - yaneMIDIInput: `midiInOpen` callback and instance.
- **yaneSound:** `CSound::SetVolumeAll(LONG)`. The definition said `long`, which is a different 64-bit type off
  Windows.
- **yaneMovieBase:** `CMovieNull::SetVolume(LONG)`. It said `long`, so off Windows it no longer overrode
  `CSoundBase::SetVolume(LONG)` and `new CMovieNull` (yaneMovie.cpp) was an abstract class.
- **yanePlaneEffectBlt:** `CPlaneTransBlt::Blt`'s `FuncList` function-pointer type lost its default arguments,
  which only MSVC accepted there. Its one call passes all eight.
- **yaneCPUID:** off x86 it reports "no MMX", so every blitter takes its C path.
- **mtknPcmDirectShow:** off Windows `CreateDirectShow` returns NULL (no DirectShow).

The non-Windows build itself is the `if(NOT WIN32)` branch of CMakeLists.txt. It needs `platform/win32` and
`platform/tools/sjis_for_clang.py`; see DESIGN.md §7.

Build: `cmake -S third_party/yanesdk -B build-yane -DCMAKE_TOOLCHAIN_FILE=$PWD/third_party/yanesdk/cmake/mingw-i686.cmake
&& cmake --build build-yane` (static library `yanesdk`, Windows-only for now). The root CMakeLists only picks it up
once `third_party/CMakeLists.txt` adds the subdirectory (not created here: third_party/ itself is not this phase's).
