# src/Net coverage (phase 2, round 1: gate / account / lobby message parse + build)

Check: `python3.12 -I tests/net_test.py` (plus the pilot `tests/test_ygpacket.py`).

There are 188 new `@yo2` markers (190 with the two pilot ones). `labels.tsv` counts most of them outside "Net",
because it assigns folders by `__FILE__` strings:

| labels.tsv says | done | what it really is |
|---|---|---|
| game/Sound 38/56 | 36 new | the packet codec, field reader/writer, Blowfish body cipher, connection record + sequence check (0x68a320..0x68bbb0). These are Net. |
| game/System 123/4167 | 123 | CMessageIOBase (0x68cba0..0x68d080), CNetAccount (0x68e040..0x68fc10), CNetGate (0x69a4b0..0x69a870, 0x68ec30/70), CNetLobby connect (0x6abe10) + 78 request builders (0x6cb940..0x6cf000), lobby login parsers (0x6b7e50..0x6b7ef0), PlayerData team setter 0x00ad7ed0. All Net except maybe 0xad7ed0. |
| game/Net 29/390 | 29 | yo2NetLobby_Parse.cpp: BLOCKLIST, ENTERBLOCK, LIST1-5 (decode + apply), 0x3112, 0x5300, 0x4171/3/5, getPlayer 0x6a5bc0, newPlayer 0x6c33d0 |

## Done (each one is tested by net_test.py)

- **Wire + fields**: `ygpacket.cpp` (Send/Recv pilot plus 25 field functions). Readers and writers have the exe's
  bounds and return codes. `ygCipher` is Blowfish-ECB with the exe's 56-byte key, and its output matches YOLaucher's `cifrado.py`.
- **Connection**: `MessageIO.cpp`. Sequence numbers (send `++seq`, receive check giving -203), keep-alive 0x0005
  every 60 s, 120 s timeout, goodbye 0x0003, packet buffer lifecycle.
- **Gate 5730** (`NetGate.cpp`): 0x2005 out; 0x2002, 0x2003 (accumulates across messages) and 0x2004 in; version refusal
  (-121); `list()` returns null while the list is still arriving; account and lobby server lookup.
- **Account 5731** (`NetAccount.cpp`): every builder (0x3001/3003/3010/3020/3030/3100/3110/3114) and every
  parser the exe has (0x3002/3004/3012/3022/3032/3101-3103/3111/3114/4234). The 0x3003 blob matches
  `cifrado.encrypt` for zero and non-zero challenges.
- **Lobby** (`NetLobby.cpp`, `NetLobby_Parse.cpp`): its own login, PSELECT/PSELECTRESULT (into the account's
  record), BLOCKLIST, ENTERBLOCK, LIST1-5 START/DATA/END, 0x3112 join/state/leave, 0x5300 (with move recording),
  0x4171/0x4173/0x4175, plus 78 of the 83 request builders.

## Blocked or deferred, with the reason

- **Lobby builders that need other subsystems** (wire part known, side effects not modelled): 0x6cc420 REQMATCH
  (copies the opponent out of the room list and player list), 0x6ccfa0 / 0x6cd550 0x3603 (friend ids from the Lobby/
  deck object, team member vector), 0x6cd670 SENDMAIL (mail object plus the global mailbox), 0x6cf000 ITEMGET (type 4
  writes into a global).
- **Lobby parsers for the other ~140 messages** (123 functions in yo2NetLobby_Parse.cpp): rooms 0x428x, matches
  0x43xx, chat 0x4402, friends/teams 0x45xx, mail 0x46xx, packs 0x48xx/0x49xx, tournaments 0x51xx, shop/mileage 0x52xx,
  trades 0x71xx, DUELPASS 0x8102/0x8204, presents 0x83xx/0x8402, 0x4140/0x4160/0x4180/0x4181/0x5340. Not blocked,
  just next round. The dispatcher `CNetLobby::onRecv` (FUN_006ac020) is therefore partial and has no marker.
- **STL template instances** (63 functions, 0x6c3400..0x6c7b30: vector/deque/list insert/erase/copy for the lobby's
  containers): replaced by std::vector/std::deque, no markers. Swapping them in-exe needs MSVC6 layouts (0b/1).
- **Platform (phase 3)**: socket connect thread 0x68b6c0/0x68b7e0, WSAAsyncSelect 0x68b9b0/0x68ce90, WSAStartup
  0x68b3e0 (its cipher key is done as `NET_KEY`). Net calls three hooks: `ygSocketTransport`, `ygSocketClose`,
  `ygConnectAsync` (MessageIO.h).
- **Task / UI layer** (the bulk of "Net" by bytes): CNetAccountTask 0x6a1d80 (12.5 KB), CNetLobbyTask 0x6d1840
  (6.4 KB), CNetGateTask, yo2ConnectLobby, yo2CheckDisconnectTask, CDownloadTask, OfferRoom task, My Room area pick
  0x6d3a50. These are state machines over the classes above. They need yo2TaskPtr / CSceneTask (System, 0b).
- **yo2NetDuel_DuelLog.cpp** (21 functions, 12 KB): duel log file writer/decoder. Next round, together with CNetDuel.
- **Header static-init copies** (about 40-54 functions: 677/634/715/12-byte bodies repeated in every Net .cpp): per-file
  initialisers and atexit stubs of a shared `std::string` table ("Japanese" ... "World"). They belong with that
  header's owner, implemented once.
- **Constructors and destructors** not done: CNetGate (0x69a3a0/0x69a3d0), CNetLobby (0x6aaf60), CLobbyPlayer
  defaults (0x6abb70 + 0x63c250; newPlayer zero-fills). Blocked on 0b's vtables and layouts.

## Layout notes (for 0b)

Pinned with `YO2_AT` and checked by an i686 build: CMessageIOBase 0x534, ServerEntry 0x38, CNetGate (+0x548/+0x54c),
CNetAccount (to +0x32e9; sub-objects at +0x121c and +0x3264), PlayerData 0x1a8, CLobbyPlayer 0x1ac, CNetLobby
(scattered fields to +0xdb94). Containers (gate server list +0x534, lobby players +0x9a0, blocks +0x9dc, cart +0x11a0,
moves deque +0xdb6c) and the std::strings (+0x004, PlayerData +0x180) are portable stand-ins, so functions that touch
them can't be hot-swapped into the exe yet.

## YOLaucher findings

- `fake_client.account()` reads 0x3012 records with a 73-byte stride. The client (FUN_0068f520) and
  `personajes.player_entry` use 76, so names after the first character come out wrong.
- The client's 0x3020 has a trailing u8 0 (18 B). fake_client sends 17 B. The server only reads [1:17], so no harm.
- The client Blowfish-encrypts 0x8101 and fake_client.dpauth sends it plain. `duelpass.norm` accepts both.
