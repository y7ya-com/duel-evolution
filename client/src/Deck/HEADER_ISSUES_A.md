# include/yo2 layout issues found by src/Deck part A

Found while writing the part-A stand-ins (deckEntry, yo2DeckParts, yo2DeckUtil, yo2DeckWindow, yo2KabanWindow).
None changes a class size; they are field types / embedded objects the generator shows as loose fields or padding.
The stand-in that has it right is named after each item.

## Embedded containers and strings (shown as u8 + u32s or padding)

| Class | Offset | What it is | Stand-in |
|---|---|---|---|
| CDeckScene | 0x1ac..0x1bb | MSVC6 `std::string` (the deck file being saved) | DeckEntry.h `fileName` |
| CDeckScene | 0x1c0..0x1d7 | embedded object, destructor FUN_009215d0 | DeckEntry.h `sorter` |
| CWindowTaskCardArea | 0x484..0x4c3 | four MSVC6 `std::wstring` (the dtor tidies all four) | DeckParts.h |
| CSortList | 0x04..0x13 | `vector<CSortBase>`; the class is 0x14 (header has a lower bound) | DeckParts.h, KabanWindowList.h `SortItems` |
| CSortBase | 0x00..0x0f | {vtbl, key, value, extra = -1} | DeckParts.h |
| CWindowModelFileList | 0x4d0 / 0x508 | VC6 vectors (`vector<CWindowTaskStructureIcon*>`, a u32 vector) | DeckUtil.h |
| CWindowModelFileList | 0x4e8 / 0x4f8 / 0x518 | VC6 `std::wstring` | DeckUtil.h |
| CWindowModelFileList | 0x3b0 | `CTaskPtr<CSpriteElm>[18]` | DeckUtil.h |
| CDeckCardLoader | 0x3bc | `CDeckCardPicture[0xcb8]` (0x28 each), then 0x4c tail bytes | DeckUtil.h |
| CWindowTaskDeck | 0x400..0x43f | four `vector<CWindowTaskDeckCard*>` (main, side, extra, missing) | DeckWindow.h |
| CWindowTaskDeck | 0x444..0x467 | an embedded CSortList-like object (0x24) | DeckWindow.h `CSortListStandIn` |
| CWindowModelDeck | 0x3b8..0x3f7 | four VC6 `std::wstring` | DeckWindow.h |
| CWindowModelKaban | 0x3bc..0x3fb | four `std::wstring` | KabanWindowList.h |
| CWindowTaskKaban | 0x3d0..0x3f3 | embedded object (vtbl 0x00921800, ctor FUN_009215f0) | KabanWindowList.h `layoutObj` |
| CWindowTaskKabanList | 0x3f0 / 0x404 | two CSortList (0x14 each) | KabanWindowList.h `all` / `shown` |
| CWindowTaskKabanSearch | 0x454..0x463 | `vector<int>` (the search values) | KabanWindow.h |

## Pointers typed as integers

| Class | Offset | What it is |
|---|---|---|
| CDeckScene | 0x80 / 0x84 | `CDeckObject*`: the trunk (DAT_012714b4) and the edited deck (DAT_012b28c4) |
| CDeckScene | 0x1a0 | the pack catalogue (DAT_012b4100) |
| CSceneTask | 0x70 | the parent element the scene's root is created under (cleared after init) |
| CWindowTaskDeck | 0x3fc | `CWindowTaskDeckTab*` (the tab in front) |
| CWindowModelDeck / CWindowModelKaban | 0x3a4 | the card detail dialog (`CCardDetailViewDlg*`) |
| CWindowModelFileList | 0x394 | the owner mediator told about picks |
| CWindowTaskModel | 0x394 | a replaceable handler object (FUN_005df480 releases the old one, clones the new one) |
| CWindowModelInputValue | 0x400 | a key-handler callback object (FUN_005ff910 / FUN_005df480), with the result id at 0x404 (-1 = none, FUN_008e8520/8e8540) |

## Floats typed as u32 / i32

| Class | Offsets |
|---|---|
| CSpriteElm | 0x88 / 0x8c (draw scale / size), 0xa4..0xb0 (colour; 0xb0 alpha); 0x94..0xa0 is an `int[4]` source rect |
| CWindowTaskControll | 0x34c (depth) |
| CWindowTaskDeckFigure | 0x3a8 (alpha) |
| CWindowTaskDeckBar | 0x49c / 0x4a0 (width, height), 0x4a4 / 0x4a8 (row y), 0x4b0 (alpha) |
| CWindowTaskSwapIcon | 0x398 / 0x39c (width, height), 0x3b0 (alpha) |
| CWindowTaskDeckNumber | 0x444..0x47c (0x47c alpha) |
| CWindowTaskDeckCard | 0x380..0x390 |
| CWindowTaskDeckTab | 0x398..0x3a4 |
| CWindowModelDeck | 0x3a8 (32.0) |
| CWindowModelFileList | 0x528 (0.8) |
| CWindowTaskStructureIcon | 0x380..0x3a4 (icon / badge rects, z, alpha); 0x3a8 is the icon kind, 0x3ae the "new" flag |
| CWindowTaskKabanNumber | 0x394 (text x), 0x398 (scale) |
| CWindowTaskTextSwitch | 0x3d4..0x3e0 is a float rect {x, y, w, h} (missing from the header) |

## Other

- The deck-editor drag state (DAT_012b3230) has no class: {u32, state, from, grid (1 main / 2 side / 3 extra), card,
  index}. Part A has two stand-ins of it (`DragState` in KabanWindowList.h, `DeckDragState` in DeckWindow.h), pinned
  equal by a static_assert in DeckEntry.cpp; they should become one when System lands.
- CWindowModelInputValue: 0x3f8 is the style passed to the child widgets, 0x3fc the dialog kind (0..3).
- CWindowModelKaban: 0x350 (in the CWindowTaskModel base) is a "built" byte.
