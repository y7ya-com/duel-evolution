# Window controls (yo2WindowControls.{h,cpp}): status

Range: CWindowTask.cpp's controls, 0x005a0f20..0x005d7600. Test: tests/game/window_controls_test.cpp.

## Done

CWindowTaskFrameThin, CWindowTaskFrameBottomThick, CWindowTaskBackPlane, CWindowTaskSwitch, CWindowTaskTextSwitch,
CWindowTaskShadowText, CWindowTaskTextField, CWindowTaskScrollBase + CWindowTaskScroll, CWindowTaskBackStripe,
CWindowTaskListbox (+ setPos 0x005ef1f0 / setSize 0x005ef240, CWindowTask.h inlines found in CWindowModelList's
object), CWindowTaskActiveListbox, CWindowTaskTextlist, CWindowTaskIconbar, CWindowTaskThinChop, CWindowTaskIconHide,
CWindowTaskIconExpand + CWindowTaskIconShrink (one shared base CWindowTaskIconArrow: the exe's two classes differ only
in texture row 48/72, kind 0xc/0xd and names), CWindowTaskFramePlane, CWindowTaskInput (HELD: phase2-system wrote one
too; this copy compiles and is tested, the coordinator picks one), CWindowTaskPictureSwitch (all of it, + the CTmWndObjEvent message it sends its owner), CWindowTaskPictureFrame
(onInit / layout now too; pieces_ is now Piece[9] {w, h, u, v}), CWindowTaskShadowText's CWindowTask.h inlines
(setPos, setArea, setAlign, setPageLines, setColors, showShadow), windowShowElement (public showElement),
CWindowTaskMenubar (shows g_helpTextMng's current text; reaches into src/Game for it, as the exe does),
CWindowTaskTab, CWindowTaskCheckbox, CWindowTaskSwitch::create (all functions), and of CWindowTaskText what is listed
below as not blocked. Window models of mine: CWindowModelChatWindow (+ CInformationCallback, yo2WindowChat.*),
CWindowModelThinImg (yo2WindowThinImg.*). WindowVector<T> generalizes WindowWStringList (now an alias). Helpers from CWindowTask.h:
windowNameTask (0x005a27a0), CWindowTaskFactory::dataDir (0x005a2510), windowFrameTexture (0x005a2690).

Names for the dialogs: FUN_00599930 = CTaskPtr<CWindowTaskText>::get, FUN_00599700 = CTaskPtr<CWindowTaskBackPlane>::get,
FUN_005af650 = CWindowTaskText::setColor, FUN_005af8a0 = CWindowTaskText::setAlign, FUN_005af590 = setFontSize,
FUN_005a72e0 = CWindowTaskBackPlane::setColor; control vtable +0x24 = setAlpha (slot 9), +0x34 = layout (slot 13),
+0x44 = setText (slot 17).

## Seams (declared in yo2WindowControls.h, stubbed in the test)

- CSpriteElm: windowSpriteCreate (0x0061f260 / 0x0061f030), windowSpriteTexture (0x0061f320). Everything else the
  controls do to sprites is CElement's.
- CTextElm: windowTextElmCreate (0x00634470), SetText (0x00634850), SetBox (0x0058bc60), Width (0x0058d460),
  LineCount (0x0058ea20 + its line list), LinesFrom (0x0058b270), and one named bridge per field CWindowTaskText
  sets (SetFontSize, SetLineGap, SetUnk748, SetAlign/Align, SetFirstLine/FirstLine, SetPageLines/PageLines,
  SetField430), each comment giving the exe offsets. Colour and the text box size are CElement's (color_, rect_).
- Sprite textures (PictureSwitch): windowSpriteTextureSize (0x0061ec80), windowSpriteTextureFormat (0x00589570),
  windowSpriteTexturePixel (0x00589590).
- CDupSprite: windowDupCreate (0x005934f0, and 0x00594100 without a texture), windowDupTexture (CSpriteElm::setTexture
  on it), windowDupClear (0x00593270), windowDupAddTile (0x00592fb0) with the
  0x24-byte WindowDupTile. The CDupSprite tile vector reserve(30) in BackStripe::onInit is left out.
- windowMouse: the app mouse (CApp + 0x148: CMouseEx::GetXY slot 1 / GetFlushedXY slot 14), windowMouseLeftPushed
  (CMouseEx::IsPushLButton, slot 16), TODO(yaneSDK). Keys: GetAsyncKeyState / GetKeyState.
- Wide <-> narrow: windowWiden (core); narrow() local, byte by byte (0x006056b0), TODO(System). Input's
  toMultiByte / fromMultiByte (0x006056f0 / 0x006054f0) and leadByte (CRT _mbctype) are byte-by-byte stand-ins too.
- CTextElm caret services (Input): windowTextElmCaretPos / CaretAt / CaretIndex / CaretFromIndex
  (0x0058bb80 / bbc0 / bc00 / bc30, CTextElm + 0x340's methods), wrapped by CWindowTaskText::caretPos / caretAt /
  caretIndex / caretFromIndex (0x005af400 / 480 / 510 / 550).
- Tab: windowTextElmFontHeight (CTextElm + 0x4b4). Chat window: windowSoundPlay (TODO(Swf), 0x00686560).
- CIME (Input): windowImeCreate (0x00595740), windowImeMessage (vslot 14), windowImeSetPos (0x005956b0), TODO(System).
- Clipboard (Input's Ctrl+V): plain Win32 (platform/win32 has it); the test stubs it in window_stubs.h.

## Not rewritten in the classes touched

| Address | What | Why not |
|---|---|---|
| 0x005a9aa0 | CWindowTaskPictureFrame tiled layout (whole repeated tiles) | no caller on the traced paths yet |
| 0x005af710 | CWindowTaskText wrapper of CTextElm 0x0058b180 | no caller needed it yet |
| 0x005af900 | CWindowTaskText::textElm (the CTextElm*) | CTextElm is opaque here |
| 0x005bae80 | D3DXVECTOR3 set(x, y, z) (inlined helper) | written inline in TextSwitch::layout |
| profiler 0x0058e7b0 / 0x00646380 / 0x006463c0 | "textFieldResize" scope in CWindowTaskTextField::layout | debug profiler, not ported |

Deviations (memory safety): BackStripe::applyLooks reads flags_ only for rows that have one (the exe reads past the
end when more rows show than there are items); BackStripe::handleMessage stops at the last row (the exe walks past it for a click below
all rows); Listbox::scrollToLine checks topItem_ + i against the flag count (the exe checks i). The std::wstring
items of the list box are a std::vector behind a 16-byte footprint (WindowWStringList).
Input: WM_CHAR's ctype tests only pass codes below 0x100 (the CRT table is indexed without a bound); the Down key
measures lines at the CWindowTaskText's own rect_ width, which nothing sets (as in the exe). Profiler scopes ("Resize@CWindowTaskListbox", "表示するテキスト作ってる", "ColleagueChanged") are left out.

Not mine now: CWindowTaskImage + card subclasses (coordinator, yo2WindowImage), (Picture / Progress: mine again).

Not started: CNoBackList (0x005b5f70.., the card-get list with a cursor sprite), ScrollH, TextItem, Help,
MultiInput (0x005c6740..), IconShow, Slider, CardWindow, PictureFrameSpread, Picture, Progress (now mine), and the
rest of phase0b's handover list.

## Header problems

Fixed by the coordinator (mediator slots take CWindowTaskControll* sender, z_ float at 0x34c, enabled_ true by
default). Still open: include/yo2/System/CWindowTaskPictureFrame.h says 0x470; the nine CTaskPtrs end at 0x474
(subclass FrameDuel is 0x478). CWindowTaskScrollBase slot 20 takes two ints (dx, dy), slot 21 an unused int.
