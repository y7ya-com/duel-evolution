# src/Game/Avatar: what is not rewritten, and why

Blocks are the original .obj blocks (link order). Header static-init copies (the four string tables of
`System/yo2Lang.h`: initialiser + atexit stub per table, at each block's start and end) are System's and already
marked there; they are not repeated below.

## yo2AvatarData.cpp (0x009bce70..0x009bdd20)
- Rewritten: all of it. 0x009bce70 and 0x009bcea0 (CAvatarData::set / equals) are labelled "Tournament" in
  labels.tsv but are this block's head. The inline ctor/dtor (0x0063c250 / 0x0063c280 / 0x0063c2a0) sit in a System
  block (CPlayerInfo's .obj) and are marked in yo2AvatarData.h.
- **Header problem / coordinator decision:** `src/Net/NetAccount.h` defines its own `struct CAvatarData`
  (`_vtbl` + 16 bytes) for CPlayerInfo::avatar. That is this file's class; the two can't be in one translation unit.
  Proposed: Net includes `Game/Avatar/yo2AvatarData.h` (same 0x14 layout on i686, with the real vtable), or Avatar
  code reads Net's bytes and Net's struct goes. Until then avatar tests avoid NetAccount.h (and so yo2PlayerBin.h).
- include/yo2/System/CAvatarData.h files the class under System; its code is Game/Avatar.

## yo2NationFlag.cpp (0x009d5a90..0x009d6390)
- Rewritten: create, ~CNationFlag + deleting dtor, onInit, setNation, isKnown, and the 148-row flag table (data at
  0x00d0b788, ids 1..148; "ER" appears twice, ids 78 and 118, the first wins).
- The block runs from after yo2ChibiAvatarManager's std::map/list template instances (0x009d4b00..0x009d5a10, counted
  with that block) to the yo2Lang.h statics at 0x009d6420. The coordinator's count of "1" was the one function citing
  the path string (an EH unwind); 0x009ddc90 / 0x009ddd60, which the path-string heuristic files here, are
  yo2PlChibiAvatar.cpp's create / onInit (they start that block, after its yo2Lang.h statics).
- CSpriteElm (the base, System) is declared in yo2AvatarExtern.h with `TODO(System)`; tests stub it.

## yo2AvatarTexMaker.cpp (0x009bed30..0x009c19a0)
- Rewritten: create, ctor, dtor + deleting dtor, onInit, onMain, onDestroy, the worker (0x009bff90, an island
  Ghidra never made a function of), setDestSprites, addClearRect, setLayers, start, compose, blendLayer, and the
  vector<ClearRect>/vector<Layer> instances (markers listed at the top of the .cpp).
- Not rewritten: **0x009c0a80** "CreateSrcSurface" (CreateImageSurface + D3DXLoadSurfaceFromFileInMemory): no
  caller anywhere in the exe (dead; layers come decoded from the texture manager).
- Deviations: the destructor joins the worker instead of spinning on m_bDrawOrder (the exe never joins, and spins
  forever if the worker quit first); `drawn_` is cleared before `drawOrder_` is raised; the D3D device mutex the
  exe takes around device calls is left to the texture/sprite functions; source pixels past the source's edge are
  skipped (the exe reads them).
- Depends on (declared in yo2AvatarExtern.h): CTextureManager (textureRequest/Loaded/Image/Release, System),
  spriteLoadImage (D3DX surface copy into a CSpriteElm's texture, System), yo2BeginThread/JoinThread/Sleep
  (platform). The canvas is an `ArgbImage` instead of a D3D image surface.
- vc6::vector only takes PODs; vector<Layer> (Layer holds a string) uses `ObjVector` (yo2ObjVector.h, footprint
  only, like vc6::map). TODO(System): a vc6::vector for class types.
- 0x009be140..0x009bec40 at the head of this block are **yo2AvatarNetSupport.cpp** (CAvatarNetSupport: queue of
  avatar-info requests to CNetLobby, answers fed to CChibiAvatarMng). Not in this assignment's list; it needs
  CNetLobby's avatar fields (+0x26/+0xd4c/+0xd68/+0xd74, player vector +0x9a4) and CChibiAvatarMng. Left for after
  yo2ChibiAvatarManager.cpp (coordinator: confirm it is mine).
- 0x009c1a40..0x009c21f0 at the tail are CChibiAvatar's (yo2ChibiAvatar.cpp).

## yo2ChibiAvatar.cpp (0x009c1a40..0x009c2ec0)
- Rewritten: all of CChibiAvatar (ctor, dtor + deleting dtor, reset, requestLoad, show, hide, onIdle, onLoading,
  onLoaded, onShown, onMain, createElm, setAvatar, setPosition, name, onScreen) and the inlined
  ~CChibiAvatarEffect (0x009c2bb0). The block starts at 0x009c1a40 (no path string; the TexMaker block's tail).
- Template instances, already marked in System/yo2TaskPtr.h: 0x009c2e90 (CTaskPtr<CChibiAvatarElm> deleting dtor),
  0x009c2ec0 (CTaskPtr<CChibiAvatarElm>::set).
- Pulled forward from later blocks because this one calls them: CChibiAvatarMng::lockLoader/unlockLoader
  (0x009d37b0/0x009d37f0, yo2ChibiAvatarManager.cpp) and CChibiAvatarEffect ctor/fadeIn/fadeOut
  (0x009d0160/0x009d0120/0x009d0140, yo2ChibiAvatarElm.cpp). yo2ChibiAvatarElm.h / yo2ChibiAvatarManager.h are
  partial until those files; the CChibiAvatarElm methods used here are test stand-ins in tests/game/avatar_pending.h.
- CTextElm (System) declared in yo2AvatarExtern.h. The constructor leaves state_ (0x84) unset in the exe; here 0.

## yo2PlChibiAvatar.cpp (0x009ddc90..0x009e0bc0)
- Rewritten: create (0x009ddc90) and reset (0x009ddd60), which sit before the block's path string, setup,
  setPlayer, setTeam, setNameColor, ctor, dtor + deleting dtor, onInit, onShown.
- Template instances, already marked in System/yo2TaskPtr.h: 0x009e0d90 (CTaskPtr<CTeamFlag>::get), 0x009e0fc0
  (deleting dtor), 0x009e0ff0 (set).
- Pulled forward: ChibiStateTable::allows (0x009d4ee0, yo2ChibiAvatarManager.cpp) and CChibiAvatarEffect::update
  (0x009d0030, yo2ChibiAvatarElm.cpp). The table at CChibiAvatar+0x7c is {rows, count} of {state, flags}.
- setPlayer/setTeam take CPlayerInfo by value in the exe; here by const reference, read through accessor functions
  declared in yo2AvatarExtern.h (TODO(Net)): playerPid/Country/State/Avatar/Stars/TeamId/TeamName/TeamCode, plus
  the existing playerNameString and g_lobbyWorld, and lobbyFindPlayer/lobbyRoomKind (CGameMng's CNetLobby). Net
  needs to provide these (its CPlayerInfo has all the fields) - or the coordinator decides Avatar includes
  NetAccount.h once the CAvatarData clash is settled.
- Also declared (other owners): CTeamFlag (team folder), sjisToUtf16 (0x005977b0) and playerStateColor
  (0x0088d170) (System), CTextElm::create. CNpcStar (yo2NpcIcon.h) is partial; its two methods are test stand-ins.
- Faithful oddity kept: setPlayer names the task "pid[player]" and then, via the team label code, "pid[team]".
- Layout note: a member after a derived class's base must not be a byte array when the base ends in padding
  (g++/i686 reuses the tail padding; MSVC doesn't) - unke4_ is a uint32_t for that.

## yo2ChibiAvatarElm.cpp (0x009c7dd0..0x009d0160)
- Rewritten: everything except the two Swf record helpers below (static motion-file tables + their inits, the
  record arrays' inits, loadMotions, ctor/dtor, receive, onInit/onMain/onDestroy, clear/enable/disable, the
  setParts family, createParts/createAllParts/createEngine/switchEngine, texture request/release/loaded, part-name
  rules (male, female, NPC, replaceFirst), motion queue, walking (walkTo/velocity/pause/stop/warp/walkStep/moveStep),
  foot probes, CTmAvatarOnExit, CChibiAvatarEffect). Tested: avatar_elm_test (544 avatars + 19 NPC looks against
  every chibi PNG in merge.dat: 0 missing).
- Not rewritten: 0x009c9430 / 0x009c95b0, the 0x4c-byte Swf motion record's inline ctor/dtor (Swf's type; here an
  opaque SwfMotion from swfLoadMotion).
- Exe quirk kept: texturesLoaded asks the texture manager by bare PNG name while the requests carry the folder.
- TODO(System): no public way to lock another task (onInit locks "LockTask"); reached via a pointer to member.
- Declared for other owners (yo2AvatarExtern.h): CSwfEngine + SwfMotion (Swf), isFieldMap / fieldHeightAt /
  fieldProbeWalls (yo2FieldMap.cpp), avatarValidate (0x00a58cc0, yo2GameManager.cpp).
