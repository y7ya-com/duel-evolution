# World share: status

Functions of each original file's block that are NOT rewritten, and why. Tests: `tests/game/world_*_test.cpp`
(link stand-ins for D3D8 / `yo2LoadFile` in `tests/game/world_stubs.h`: CElement pulls in CZSort -> CD3DDevice).

## yo2EventManager.cpp (0x00a4c5a0..0x00a4f9e0, 18 functions: 17 rewritten)

| Address | What | Why not |
|---|---|---|
| 0x00a4d150 | CEventPlayer::onMain (5.6 KB) | blocked: window framework (CWindowModelBalloon) + Avatar (CNpcChibiAvatar) |

Notes for whoever ports onMain later (read from the disassembly; Ghidra drops its arguments):
- Runs only while `state_ == PLAYING` and `g_eventScript[step_].event == event_`. With `hasTimeout_`, `timeout_`
  counts down; at 0 it destroys `npc_` and `balloon_` and sets `state_ = DONE`.
- SPAWN_NPC: first frame creates the NPC (0x009eed20, CNpcChibiAvatar under `baseElm_`) into `npc_`, asserts
  "m_npc NULL error", inst name "NPCアバター", calls 0x009efc30 and 0x009f2030 on it, `npcKind_ = step.arg`. Later
  frames wait for `npc->[+0x1c88] == 0` (NPC busy flag), then `stepLeftEvent()` ? DONE : next step.
- NPC_LEAVE: first frame calls 0x009f2150 on the NPC; later frames wait for `+0x1c88 == 0`, advance as above and
  destroy the NPC.
- BALLOON: first frame creates CWindowModelBalloon (0x005fa4e0) under `baseElm_` into `balloon_` ("Fuki Error!"),
  0x005fd190(0), `npcNameText_ = npcNameText(npcKind_)`; then for each consecutive BALLOON step builds the text from
  CStringDB (DAT_01271840) of `step.arg` with "@@d" -> `number_` ("%d") and "@@s" -> `name_`, five 0x80-byte lines
  each, joined by "%s\n%s\n%s\n%s\n%s" and the name text, handed to 0x005fcea0; `step_` ends on the last BALLOON.
  Later frames poll 0x005fd150 (balloon closed) and then advance and destroy the balloon.

The CTaskPtr<T> get/set copies right before the block (0x00a4b4c0..0x00a4c380) are the previous file's template
instances; they are already counted under src/System/yo2TaskPtr.h.

Deviation: CFukiDictionary::load asserts "FUKI_DATA MAX LOW OVER" before parsing a 121st NPC instead of after (the
exe writes that NPC over `count_` first).

Header problems: none (CEventPlayer 0xd0 has an unused dword at 0xcc; CFukiDictionary's 0x13d54 is unused).

## yo2FieldMap.cpp (0x00a4fe00..0x00a53860, 32 functions + 6 yo2Lang.h static inits: 3 rewritten)

Rewritten: the static map table (`g_fieldMaps`, DAT_00d2d4d0) and its three static lookups (mapName, initPos,
initDir). CFieldMap itself is **blocked: System sprite/texture classes** (the 0x4d1c-byte sprite at 0x00588b80 /
0x00588cd0 / 0x00588dd0 / 0x00588a50 pixel read, the 0x59axxx texture manager, CD3DDevice::setMode, D3DX matrix
helpers 0x00b41f32 / 0x00b4152c). Its layout (0x9a6f78 bytes) is 16x16 tiles of 0x9a6c bytes, each {bool used,
bool, vc6::string, sprite, vc6::string, sprite}, then a vector of 0x4d9c-byte object sprites at 0x9a6f54, view
offset at 0x9a6f68, margins (300, 300) at 0x9a6f60. Not rewritten:

| Address | What | Why not |
|---|---|---|
| 0x00a504b0 | CFieldMap::create (new 0x9a6f78 + create) | blocked: System sprite |
| 0x00a505a0 | CFieldMap::scrollTo (clamp view to player, margins, map size) | blocked: System sprite (calls 0x00a52920) |
| 0x00a508c0 | CFieldMap::addObject (load one object sprite) | blocked: System sprite |
| 0x00a50a00 | CFieldMap::isWall: hit-map pixel is 0xff0064ff / 0xff000000 / 0xff0000ff / 0xff00ffff / 0xff6400ff | blocked: sprite pixel read 0x00588a50 |
| 0x00a50ad0 | CFieldMap::hitPixel (0xff000000 off the map) | blocked: sprite pixel read |
| 0x00a50b60 | CFieldMap::draw(arg): -1 tiles, -2 nothing, n object n | blocked: System sprite |
| 0x00a50ba0 | CFieldMap::load(name): FieldMapData.txt, finds "MapName;<name>" | blocked: calls 0x00a50ec0 |
| 0x00a50ec0 | CFieldMap::loadSection: BaseMap / BasePartsW / BasePartsH / BaseNumX / BaseNumY / HitMap / FrontObjMapNum / ObjMapNum ... "MapData::End"; tiles "%s%s_%d_%d.png" | blocked: System sprite |
| 0x00a51e30 | CFieldMap::heightAt (red hit pixel 0xffff0000 -> one constant, else another) | blocked: sprite pixel read |
| 0x00a51e70 | CFieldMap::probeWalls (16 directions, "all_hit:%d...") | blocked: isWall + 0x009cb280 / 0x009caed0 (avatar move helpers) |
| 0x00a52120 | CFieldMap::CFieldMap | blocked: System sprite |
| 0x00a52300, 0x00a524c0 | CFieldMap deleting dtor / dtor | blocked: System sprite |
| 0x00a52330, 0x00a523d0 | tile ctor / dtor | blocked: System sprite |
| 0x00a52730 | CFieldMap::receive (CTmCapUtil code 1 toggles the hit-map debug view, DAT_012bb3f0) | blocked: class |
| 0x00a527a0 | CFieldMap::onInit (setDrawMode(BLEND)) | blocked: class |
| 0x00a527c0 | CFieldMap::onMain (queue tiles, objects, debug layer) | blocked: class |
| 0x00a528b0 | CFieldMap::onDestroy (release both sprites of each used tile, 0x0059c1f0) | blocked: System sprite |
| 0x00a52920 | CFieldMap::updateTiles (load/unload the tiles around the view) | blocked: System sprite |
| 0x00a52d50, 0x00a52ec0, 0x00a52f10 | draw tiles / draw object n / draw nothing | blocked: System sprite + D3D |
| 0x00a52f30, 0x00a52f80, 0x00a53130, 0x00a535e0, 0x00a53770, 0x00a53860 | std::vector<object sprite> clear / erase / insert, element copy-ctor / assign / sprite assign | MSVC6 STL instances over the sprite type; go with the class |

The six static initialisers 0x00a53940..0x00a54800 are yo2Lang.h copies, counted under src/System.

Deviation: initPos / initDir assert when no entry matches (the exe divides by zero).

## yo2HelpText.cpp (0x00a5c410..0x00a5e6d0 + islands 0x00a5c770..0x00a5c890: all rewritten)

No RTTI classes: `HelpText` (0x1c, embedded in UI classes) and the global `HelpTextMng` (DAT_012bb7d0, 0x14) are our
names. Read by System at 0x005d4980 (the menu bar calls HelpTextMng::current()).

Not marked: the compiler's static-init plumbing islands 0x00a5c770 (jmp), 0x00a5c7e0, 0x00a5c800 (empty),
0x00a5c820 (atexit registration); they are not in labels.tsv. 0x00a5c390 (a 20-byte uninitialized_copy) sits at the
head of this block but is called only from yo2GameManager.cpp (0x00a56120): handled with that file.

Header problems / decisions for the coordinator:
- Item and handle hold an MSVC6 `std::wstring`; vc6.h has no wide string, so `HelpWString` (yo2HelpText.h) keeps the
  16-byte footprint with a std::u16string behind the pointer slot. TODO(System): a vc6::wstring.
- HelpTextMng's vector of non-POD items is a std::vector behind the `first` slot (vc6::vector only takes PODs).

## yo2InfoDlgCommon.cpp (0x00a5e890..0x00a60540, 11 functions: 9 rewritten)

CInfoDlgCommon is a CEasyTask (not a window class); its creation side is rewritten (six create overloads with the
constructor inlined, destructors, receive). The message text comes from System's CStringDB (g_stringDB).

| Address | What | Why not |
|---|---|---|

The CTaskPtr<CWindowModelDialogWithBtns> get / deleting dtor copies after the block (0x00a60560, 0x00a60790) are
System template instances.

## yo2TgtAvaListDlg.cpp (0x00ad8ec0..0x00adaf50)

Rewritten completely by game-b (CTgtAvaListDlg: tests/game/gameb_tgtava_test.cpp). GameCtrl, its own object right
after this one in the exe, moved to yo2GameCtrl.{h,cpp}; yo2TgtAvaListDlg.h still includes it for older callers.
