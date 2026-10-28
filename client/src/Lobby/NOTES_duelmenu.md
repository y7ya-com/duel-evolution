# src/Lobby: FriendBase, CDuelMenuTask, LobbyError — notes for other files' owners

## src/Net (phase2-net)
- `appPSelectDeck()` in NetUi.h is not a deck: the object at *(DAT_012711ac + 0xc50) is **CFBlistManager**
  (src/Lobby/yo2FriendBase.h), its +0xcbdc is the black list's count and FUN_0085e1e0 is
  `CFBlistManager::blackPid(i)`. PSELECT (0x4100) sends the black list's pids. Suggest renaming the hook (e.g.
  `appBlackListPids()`) and implementing it as `for i < fb.blacks.count: fb.blackPid(i)`.
- `lobbyFriendCount()` / `lobbyFriendId(i)` (NetLobby_Rooms.h) are `fb.friends.count` / `fb.friendPid(i)` on the
  same object.

## The lobby scene (yo2LobbyEntry.cpp, CLobbyScene)
- `lobbyErrorState<Scene>(s)` (src/Lobby/yo2LobbyError.h, FUN_00884b70) is the scene's error state as a template:
  the header lists the members it needs (state/prevState/nextState/stateFrames at +0x9c/+0x98/+0xa0/+0x90,
  errorCode +0x94, errChoice +0xb4, errDlg +0x144, errUrl +0x254, the dialog callback `onErrorDialog` = 0x00863340,
  and `errorClosed()` = the player list's +0x13f0 = 1 through the CTaskPtr<CPlayerListDlg> at +0x10c).
- Left to the scene (Lobby-labelled, in the range I was given but scene code): 0x87c900, 0x87ca70, 0x87e260,
  0x87e640, 0x87e810, 0x87e9c0 (state handlers on +0x9c, the scene's CNetLobbyTask via 0x82a6a0), 0x87eab0 (a
  CTextElm label maker nothing calls), 0x880e30 (string assign), 0x8811f0 / 0x881220 / 0x881260 (CTaskPtr
  comparisons), 0x882f10 / 0x882f50 (vector<TeamApplication> size / clear), 0x8833f0 / 0x883b70 (smart_ptr
  vector destroy / copy).

## Windows (System / phase2-game)
- Seams in src/Lobby/yo2DuelMenu.h for CWindowModelDuel / DuelFind / DuelWait / JoinGunsling (New + result,
  0x00a38140..0x00a445c0, cw-system-b's range) and `windowMouseRightPushed()` (CMouseEx vslot 15).
- `windowModelDialogErrorCreate()` (yo2LobbyError.h) stands for CWindowModelDialogError::create (0x005f7b90),
  which exists on game-b's yo2WindowDialogs.h: once merged, return that.
- tests/game/platform_stubs.cpp declares `void ygConnectAsync(...)`, but Net's MessageIO.h now returns int32_t;
  tests/game won't compile against phase2-net's Net until that stub returns int32_t (tests/lobby has its own).

## System (CCryptFile, user folder)
- `fblistFileRead` / `fblistFileWrite` (yo2FriendBase.h) are CCryptFile with the default key (phase2-system's
  yo2CryptFile); `fblistUserDir()` is FUN_00618600 on *DAT_012714c4 (unlabeled); `g_usrDirRoot` is DAT_012aeef8,
  defined here (its static init 0x0085e540), set by whoever knows the app folder.
