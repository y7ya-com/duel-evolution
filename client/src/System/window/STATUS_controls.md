# Window controls (yo2WindowControls.{h,cpp}): status

Range: CWindowTask.cpp's controls, 0x005a0f20..0x005d7600. Test: tests/game/window_controls_test.cpp.

## Done

CWindowTaskFrameThin, CWindowTaskFrameBottomThick, CWindowTaskBackPlane, CWindowTaskSwitch, CWindowTaskTextSwitch,
CWindowTaskShadowText, CWindowTaskTextField, CWindowTaskScrollBase + CWindowTaskScroll, CWindowTaskBackStripe,
CWindowTaskListbox (+ setPos 0x005ef1f0 / setSize 0x005ef240, CWindowTask.h inlines found in CWindowModelList's
object), CWindowTaskActiveListbox, CWindowTaskTextlist, CWindowTaskIconbar, CWindowTaskThinChop, CWindowTaskIconHide,
CWindowTaskSwitch::create (all functions), and of
CWindowTaskPictureFrame / CWindowTaskText what is listed below as not blocked. Helpers from CWindowTask.h:
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
- CDupSprite: windowDupCreate (0x005934f0), windowDupClear (0x00593270), windowDupAddTile (0x00592fb0) with the
  0x24-byte WindowDupTile. The CDupSprite tile vector reserve(30) in BackStripe::onInit is left out.
- windowMouse: the app mouse (CApp + 0x148: CMouseEx::GetXY slot 1 / GetFlushedXY slot 14), windowMouseLeftPushed
  (CMouseEx::IsPushLButton, slot 16), TODO(yaneSDK). Keys: GetAsyncKeyState / GetKeyState.
- Wide <-> narrow: windowWiden (core); narrow() local, byte by byte (0x006056b0), TODO(System).

## Not rewritten in the classes touched

| Address | What | Why not |
|---|---|---|
| 0x005a9150 | CWindowTaskPictureFrame::onInit | CDupSprite (0x00594100) |
| 0x005a94c0 | CWindowTaskPictureFrame::layout | CDupSprite tiling (0x00592fb0 / 0x00593270) |
| 0x005a9aa0 | CWindowTaskPictureFrame tiled layout | CDupSprite tiling |
| 0x005af400, 0x005af480, 0x005af510, 0x005af550, 0x005af710 | CWindowTaskText wrappers of CTextElm 0x0058bb80 / bbc0 / bc00 / bc30 / b180 | no caller needed them yet; each needs one more CTextElm seam |
| 0x005af870 | CWindowTaskText: CTextElm + 0x51c (byte) | as above (trivial through windowTextElmByte) |
| 0x005af900 | CWindowTaskText::textElm (the CTextElm*) | CTextElm is opaque here |
| 0x005bae80 | D3DXVECTOR3 set(x, y, z) (inlined helper) | written inline in TextSwitch::layout |
| profiler 0x0058e7b0 / 0x00646380 / 0x006463c0 | "textFieldResize" scope in CWindowTaskTextField::layout | debug profiler, not ported |

Deviations (memory safety): BackStripe::handleMessage stops at the last row (the exe walks past it for a click below
all rows); Listbox::scrollToLine checks topItem_ + i against the flag count (the exe checks i). The std::wstring
items of the list box are a std::vector behind a 16-byte footprint (WindowWStringList).
Profiler scopes ("Resize@CWindowTaskListbox", "表示するテキスト作ってる", "ColleagueChanged") are left out.

Not started: CNoBackList (0x005b5f70.., the card-get list with a cursor sprite), CWindowTaskInput, ScrollH, TextItem, Help, Checkbox, FramePlane,
MultiInput, Progress, IconShow/IconExpand/IconShrink, Tab, Slider, Menubar, CardWindow, Image, PictureSwitch.

## Header problems

Fixed by the coordinator (mediator slots take CWindowTaskControll* sender, z_ float at 0x34c, enabled_ true by
default). Still open: include/yo2/System/CWindowTaskPictureFrame.h says 0x470; the nine CTaskPtrs end at 0x474
(subclass FrameDuel is 0x478). CWindowTaskScrollBase slot 20 takes two ints (dx, dy), slot 21 an unused int.
