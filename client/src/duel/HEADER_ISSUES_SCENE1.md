# Generated-header problems found while writing src/duel/Scene* (duel scene, first half)

All offsets are from the 32-bit exe. The stand-ins in src/duel/SceneDialogs.h / SceneCard.h / SceneCommon.h pin the
layouts below with YO2_AT / YO2_SIZEOF.

| class | offset | what include/yo2 gets wrong | evidence |
|---|---|---|---|
| CUDialogBaseOk | 0x428 | size given as 0x428 (min); the class has a `running` byte at +0x428 (set 1 by every constructor, cleared when the close finishes, read by the base update) so it is at least 0x42c (CUSelectNumDialog's first member starts at 0x430) | FUN_00778280 writes +0x428 = 1 and +0x400 = 0 next to the other base fields; FUN_00778d80 / FUN_00772aa0 |
| CUSelectNumDialog | 0x430, 0x440, 0x450 | three `std::wstring` members (message, title, unit format) are a 0x38-byte pad | FUN_00778280 (alloc byte + FUN_00530120 at each), FUN_007787f0 releases +0x434/+0x444/+0x454 |
| CUDiceDialog | 0x418, 0x46c | the CPlaneLoaderElm member at 0x418 (dice.txt sheets) is shown as pad + `f_0x434` (its sprite array pointer); the wstring at 0x46c is shown as `f_0x470` (its pointer) | FUN_0077b570 inlines the CPlaneLoaderElm constructor at +0x418 and builds a wstring at +0x46c; FUN_0077b8b0 |
| CUSelectCoinDialog, CURitualDialog | 0x418 | same CPlaneLoaderElm member (coin_new.txt / ritualdlg.txt) — only CULockOnDialog's header types it | FUN_007773f0, FUN_00779aa0 |
| CPlaneLoaderElm | 0x04..0x34 | all pad; layout: 0x04 std::string dir (alloc byte, ptr, len, res), 0x14 u8 = 1, 0x18 count, 0x1c CTaskPtr<CSpriteElmOlder>* sprites (0xc each), 0x20 auto_ptr (vtbl 0x00be65fc, 0x24 PlaneEntry{path, frames}* table, 0x28 owner), 0x2c auto_ptr (vtbl 0x00be65f0, 0x30, 0x34) | FUN_00757cd0 (its constructor), FUN_007d8840 / FUN_007d9030 index +0x1c / +0x24 |
| CCard | 0x10..0x7c | fields untyped; meaning: 0x04 active (hover tests), 0x0c draw flags (0x100, dialogs 0x701), 0x10 card id, 0x14 anim (0x100 = settled), 0x18/0x1c flash / level, 0x20 draw-now, 0x21 upright, 0x22 pinned, 0x24/0x26 mat code / previous code, 0x28 target, 0x30 from, 0x38 current, 0x40 rotation (0..0x1ff), 0x44 scale 16.16, 0x48 flip, 0x4c/0x50 ATK/DEF, 0x58 tick (mod 0xc0), 0x78 alpha | FUN_007579e0, FUN_00758540, FUN_00758210, FUN_007583d0 |
| CCardPlane | 0x00 | derives from CCardLoader (the CCardLoader constructor FUN_00757d40 runs on it first, then the vtable becomes 0x00bebbf0); +0x8 = -1 in CCard | FUN_007579e0 |
| CNumber | 0x04 | `f_0x4` is a float (100.0f), 0x8 value, 0xc digits (10) | FUN_007579e0 |
| CUGDialogBase | 0x3e8..0x410 | correct offsets, untyped; meaning: 0x3e8 closed, 0x3ec result, 0x3f0 fade (0x100 -> 0, < 0 closing), 0x3f4 dragging, 0x3f5 answered, 0x3f8/0x3fc centre, 0x400/0x404 grab, 0x408/0x40c size, 0x410 running (a byte; the header has int32) | FUN_007725a0, FUN_007727d0, every dialog constructor |
| CWindowModelListCardType / CardAttr | 0x3b0 | size 0x3b0 but CUSelectTypeDialog / CUSelectAttributeDialog keep `picks` at 0x3b0 (the factories write it): fine as the derived classes' first field, noted because the factories write it before construction finishes | FUN_0077a320, FUN_0077ad20 |
| CUSummonDialogSp | 0x3f8..0x498 | two int[20] arrays (command bit per row at 0x3f8, command id at 0x448) are pad; 0x4b0 is a 0x20-byte help-balloon object (FUN_00a5c410 / FUN_00a5c500 / FUN_00a5c530 / FUN_00a5c6a0), 0x4a0 is a CCard* | FUN_0077c940, FUN_0077c4b0 |
| CUPhaseSelectDialog | 0x418, 0x62c..0x65c | 0x418 is a wchar_t[0x100] title (wcscpy), 0x62c int[6] text ids, 0x644 int[6] phase per row | FUN_0077d330 |
| CDuelScene | 0x12c, 0x130, 0x197c, 0x1ec, 0xac4 | +0x12c (lock-on box open, byte), +0x130 (LP verdict 0/1/2), +0x1ec (frame counter), +0x197c (vector of 0x10-byte task entries, first at 0x1980) and +0xac4 + 0x44 * side (a per-side int) fall in pads | FUN_0077e880, FUN_00794f10, FUN_0077ce00, FUN_00790610, FUN_00794ec0 |

Not a header: `CNetDuel` (src/duel/NetDuel.h) +0x684 is the duel's BGM id (`_684[4]` there); FUN_00794cd0 picks it,
FUN_00794f10 plays it. SceneDuelScene.cpp reads/writes it through a byte offset until NetDuel.h names it.
