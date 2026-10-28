# include/yo2 issues found while switching src/Net over (for the include/ owner)

src/Net keeps named, portable structs with the RTTI names (CMessageIOBase, CNetGate, CServerInfo, CNetAccount,
CMyUser, CPlayerBinData, CPlayerInfo, CAvatarData, COnlinePlayer, CNetLobby). `tests/net_layout.cpp` checks every
named field against the generated header on i686: 60 offset/width checks pass, and none of them disagree. What's
below is what the generated headers are missing or get wrong. Evidence is the decompiled cache or the disassembly at
the address given.

## 1. Pointers are typed as u32: blocks a 64-bit native build

`CMessageIOBase::f_0xf0` (the connection record, `YgConn*`), `CNetGate::f_0x53c/0x540/0x544` (vector begin/end/cap),
`CPlayerInfo::f_0x184` (string data), and every other vector/string member are `uint32_t`/`int32_t`. On a 64-bit host
they can't hold a pointer, so code can't use these classes directly outside 32-bit builds. Suggestion: emit
pointer-typed members (the 32-bit layout asserts don't change).

## 2. Sizes that are too small

| Class | Generated | Real | Evidence |
|---|---|---|---|
| CMessageIOBase | 0xf4 (min) | 0x534 | Every base method uses the 0x440-byte packet at +0xf4: send 0x68cf30, sendBye 0x68cf60, keepAlive 0x68cff0. Derived headers carry it as `_pad_0xf4[0x440]`. |
| CMyUser | 0x6d4 (min) | 0x2048 | CNetAccount+0x121c..0x3264. Holds `CPlayerInfo[4]` at +0x30 (eh-vector ctor at CNetAccount+0x124c in 0x68e040, stride 0x1a8), trunk at +0x6d1 and trunk2 at +0x1389 (0xcb8 each; cleared by CMyUser_vf01 0x68e470), and region char[4] + u8 at +0x2041 (0x68f480). |
| CPlayerBinData | 0x4 (iface) | 0x288 | pbin[0x81] at +0x4 and npcBin[0x201] at +0x85, written by its thiscall methods 0xad68a0 / 0xad68d0 (this = CNetAccount+0x3264, disasm 0x68fb55 / 0x68fbd5). |
| CServerList, CLobbyPlayerList, CBlockList | 0x4 (iface) | 0x14 | Each is {vptr, VC6 vector{alloc, first, last, end}} of 8-byte yaneSDK smart_ptr {u8 owner, T*}. CNetGate shows the vector as loose f_0x538..f_0x544; CNetLobby players: first/last at +0x9a4/+0x9a8 (0x6b88d0); blocks at +0x9e0/+0x9e4 (0x6b8580). |

## 3. Fields missing because the methods were decompiled as `__fastcall(int param_1)`

Ghidra typed most CNetLobby / CNetAccount handlers and builders as `__fastcall` with `param_1` = ECX = this. The
analyzer seems to read only `__thiscall` this-accesses, so these are `_pad_`. Treating a fastcall `param_1` as `this`
(when the function is a vtable slot, or its caller passes the object in ECX) should recover them:

- **CNetAccount**: challenge u8[17] +0x534; authResult s32 +0x548; regResult s32 +0x54c; delResult s32 +0x550;
  trunkIn u8[0xcb9] +0x555.
- **CNetLobby**: dpAuthTries s32 +0x544; challenge u8[17] +0x7cc; u8 +0x7dd; authOk u8 +0x7de; authResult s32 +0x7e4;
  pselectResult +0x7e8; enterBlockResult +0x7f0; LIST1-4 counts s32[4] +0x7f4; regAvatarResult +0x80c;
  commentResult +0x810; dpAuthResult +0x90c; usbDpAuthResult +0x958; list5Count +0x994; titleResult +0x998;
  rgn/rank/area/block/block2/block3 u8 +0x9ec..+0x9f1; blockChange u8 +0x9f2 (0x6d3d50); watchState u8 +0xd8a; mileageSel s32 +0xda4; mileageItem
  u32[100] +0xda8; mileageA/B/C u16[100] +0xf38/+0x1000/+0x10c8; recordMoves u8 +0xdb65; moves (VC6 deque, 0x28)
  +0xdb6c; moveCount s32 +0xdb94.
- **CMessageIOBase**: the request-state bytes are one u8[0xc8] at +0x1c (0x68cba0 zeroes 0x32 dwords). Today they're
  scattered f_0x21..f_0x89 bytes, pulled up from the subclasses.

## 4. Widths and kinds that are off

- `CMessageIOBase` +0x4..+0x13 is an MSVC6 `std::string` {alloc u8, ptr, len, res} (host name; assigned through
  0x68ea60). Generated: u8 + 3 × u32.
- `CPlayerInfo`: x u16 +0x15c, y u16 +0x15e, dir u8 +0x160 (generated: one u32 at +0x15c, u16 at +0x160; from the
  inlined copies). +0x180 is an MSVC6 `std::string` (team name, 0x6b9370). Strings are char arrays: name[17] +0x10,
  comment[33] +0x62, title[33] +0x83, country[4] +0x12c (generated u32), duelName[17] +0x162, teamCode[17] +0x190.
  Missing: duelLevel u8 +0x173, duelStats u16[3] +0x174.
- `CMyUser` user / password are char[17] at +0x8 / +0x19 (generated: 4 × u32 + u8, and u8[4] × 4 + u8).
- `CServerInfo` (0x38) is all padding. From 0x69a6a0 / 0x69a870: id s32 +0x4, kind s32 +0x8, name char[17] +0xc,
  ip char[17] +0x1d, port u16 +0x2e, players u16 +0x30, lang/rank/area s8 +0x32/+0x33/+0x34 (default 0xff),
  u16 +0x36.
- `COnlinePlayer`: u8 +0x1a8 and u8 +0x1a9 (set by its constructor in 0x6c33d0).
- `CChampsData` (at CNetLobby+0x35fc) is generated as 0x4 (iface); it is 0xe0 (the tournament parsers 0x5100..0x5119
  fill it up to +0x36dc, where the 0x48-byte bracket pages start).
- More CNetLobby ranges the generated header leaves as padding (all used by the lobby parsers; names and offsets in
  src/Net/NetLobby.h): +0x534..+0x7cb (pack/present bookkeeping, deck NPCBIN/PBIN copies), +0x8a4..+0x97c (results
  of mileage, packs, SD, TP, presents, NPC info, shop), +0x1210..+0x139f (cards just received), +0x35ec..+0x35f5
  (DUELPASS result), +0xdb64 and +0xdbc4..+0xdbd4 (tournament / USB / NPC-present bytes). CNetLobby ends at 0xdbd8.

## 5. Names (in case the generator gets a naming table)

Use src/Net's field names: NetGate.h, NetAccount.h, NetLobby.h and MessageIO.h. Every field there has its offset in a
comment, and its meaning where a message or YOLaucher says what it is.
