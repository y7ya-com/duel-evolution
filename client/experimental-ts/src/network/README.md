# Browser-native game transport

`GameSession` uses the existing authenticated `/net` WebSocket gateway. It does not load the executable, guest
memory, Emscripten, the native card codec, or generated recompilation output. Live identity comes from the browser's
same-origin session cookie. The legacy 32-byte login field is zero-filled and is not an authentication credential.
A custom `loginBlob` exists only for DEV fixture parity.

The client uses the server's v2 passcodes directly. It echoes the server's CA01 version/table hash in CA02 because
it performs no conversion to the old client's card indices. Integrity (MD5), byte order, XOR, and per-channel
sequence numbers follow `server/src/net/proto.ts` and `conn.ts` exactly. MD5 is protocol compatibility, not security.

## Integration

```ts
const session = new GameSession({
  url: new URL('/net', location.href).href,
  portOffset: 1000, // Match server configuration; local tests use zero.
  onState: state => render(state),
  onMessage: (channel, packet) => {
    if (channel === session.duel) feedDuelReducer(packet);
  },
});
await session.start(); // Opens gate/accounts and obtains real character list.
await session.selectCharacter(0); // Trunk, profile, room, presence, NPCs, duel rooms.
```

`state.collection` maps passcodes to owned counts. It updates on a complete trunk transaction, including account
pushes after a purchase. Keep the accounts channel open alongside the lobby; reopening it after lobby login is
refused as a duplicate account login. `refreshCollection()` uses this existing account channel.

`state.areas` is the advertised block table. `enterArea(area)` finds its block id and sends `[block, 1]` (the second
byte is a transition flag, not an area id). `state.area` resolves from that block table, since the historical
0x4203 area's byte alone does not identify cross-world transitions correctly.

`startNpcDuel(npcId, {main,extra})` reserves, attaches, uploads the passcode deck and obtains actual preparation/RPS
responses. `chooseHand(0|1|2)` means Rock/Scissors/Paper. A win offers `chooseFirst(true|false)`. In either case,
`state.duelFirst !== null` means a server first-player choice has arrived; call `beginDuel()` once. The separate duel
reducer and UI own selections and commands, sent through `sendDuel(id,data)`. `finishDuel()` closes the old channel
and refreshes lobby presence/rooms so another duel can start.

## Resource and reconnect behavior

Each channel has a 1 MiB receive limit, 256 KiB unacknowledged-send limit, 64 pending-request limit, and no packet
history. Request timers are released on completion/close. The WebSocket send buffer is limited to 1 MiB.
The gateway uses the server's sid/byte-ack resume protocol for interruptions up to its 40-second retry window,
preserving virtual channels, byte offsets and packet sequence counters. It does not silently start a replacement
game session after a refused resume. Intentional disposal sends game goodbye messages and releases listeners,
parser buffers, queued bytes, timers, maps and connection references.

## Evidence and scope

`tests/network-session.test.ts` drives the real `buildServer`/`World` through an in-process WebSocket boundary:
account/character boot, trunk, NPCs, movement, cross-world transitions, free-mode segregation, and tunnel resume.
It also exercises real OCGcore NPC-duel preparation and surrender. These tests require locally generated
`server/gamedata/`, as the server's own integration suite does.

These checks establish protocol/lifecycle behavior only. They do not establish presentation parity, avatar
collision/pathfinding, all social/trade/team flows, all duel prompts or all failure cases. Additional PvP, MATCH and relay evidence is described below.
Low-level lobby/duel sends remain available for features as their dedicated models and UI are implemented.

## PvP, invitations and spectators

`createDuelRoom({style:3|4,password,allowSurrender,timeLimit})`, `challengeRoom(roomId,password)`,
`replyToChallenge(accept)`, `cancelChallenge()` and `deleteDuelRoom()` implement the real lobby messages.
`state.challenge` retains incoming 0x4302 with player identity. An accepted invitation's unsolicited 0x4306 becomes
`state.duelOffer`, and optionally calls `onDuelOffer(offer)`; it is not discarded while the application selects a
deck. Call `acceptDuelOffer(deck)` once for a PvP reservation. Its preparation waits for both players' decks.
A direct HTTP invitation returns a private room id: use the existing API's `/api/de/duel/challenge`, then
`challengeRoom(response.room)`; HTTP consent alone does not start a duel.

`watchDuel(pid)` uses 0x4320/0x4321 and the spectator's own 0x6700/0x6006 lifecycle. It requests public batches
through 0x6702 once per second, and `state.spectating` disables all gameplay submissions locally. The server also
rejects spectator actions and filters hidden cards/decision prompts. `finishDuel()` stops spectator polling and
returns to the lobby. A spectator does not upload a deck or enter rock-paper-scissors.

Additional live-server evidence: a complete two-player PvP reservation, RPS/first selection, public spectator
stream, same-channel tunnel resume at a pending gameplay prompt, and return to lobby. The early-surrender finish
in that PvP test uses the server's explicit PVP_TEST mode; normal server rules still disallow surrender before turn
10. A separate NPC test runs real OCGcore to a natural loss through exposed phase and selection prompts, without
surrender or test commands, and asserts zero duel-model errors/unsupported records. It is one gameplay scenario,
not proof of every card interaction or prompt.


## MATCH and sideboarding

Creating/challenging a style-4 room records MATCH context for both participants. `state.match` exposes `round`,
`scores: [wins, losses, draws]` from the local perspective, `stage`, `chooser`, `complete`, `sideboardDeadline`,
`original` and the currently submitted `deck`. `chooser` is true for the preceding game's loser, false for its
winner, and null after a draw. Scores come from 36-byte 0x6613 packets. A per-game 0x4d finish enters sideboarding;
only the lobby's 0x4800 confirms whole-match completion. The server applies the original client's rule: two more
wins than losses, or three games including draws.

Call `submitSideboard(deck)` on the existing duel channel. The application must reset its per-game duel reducer
before submission. Main/Side/Extra counts must equal the original deck's counts, Main+Side must conserve every
copy of the original pool, and Extra's multiset stays unchanged. This follows the 2008 editor's Main/Side swapping;
the protocol does not transmit side-card identities. There is no second reservation or repeated 600b preparation.
The next game's loser chooses first directly (6102/6103); draws repeat RPS. The local round advances only after
6100 acknowledgement. A timeout preserves sideboarding and allows the same upload to be retried after tunnel
resume; disconnected submissions are rejected before mutation. `finishDuel()` refuses an incomplete MATCH.

`sideboardDeadline` is epoch milliseconds, derived from the server's global 6461 timer, and becomes null when
paused/submitted/complete. The server's current clock is 190 seconds. It can end the MATCH while a player is siding;
its final 4800 remains authoritative. The session does not manufacture readiness or a score-derived final result.

`tests/network-match.test.ts` covers exact pool/multiplicity checks, real three-game 1–0/1–1/2–1 flow, a genuine
Main/Side swap, loser first choice, retained channel/reservation, siding reconnect, timeout-before-ack then retry,
sideboard-clock expiration, two straight wins, and creating another room. Lifecycle finishes use confirmed
surrenders with PVP_TEST permitting early surrender; these tests are separate from natural gameplay outcomes.

Server limitations remain explicit: deckCheck can run in warning mode, and the server never receives the side
pool, so it cannot enforce sideboard conservation against a modified client. Client validation improves this
client's behavior and is not a server security boundary. No server code was changed.

## Four-player casual relay

Relay invitation HTTP calls remain in the online feature service. All four accepted participants receive ordinary
4306 reservations. `state.duelRole` is player/partner/spectator; buffered 600c captain IDs identify a partner before
RPS. A partner's 6005 can arrive before 6007, so the session installs its preparation waiter before booking. Only
captains perform RPS; partners await the same 6103 and send their own 61fe. The server waits for all four.

Reserved server chat channel 10 carries bounded TAG1 control records, decoded into `state.relay`:
`active:[ownPilot, opposingPilot]`, `self:0|1|255`, `players` (own captain/partner, opposing captain/partner), and
`canAct`. Each player includes pid/name/two avatar parts. These records are not displayed as public chat. Public
chat cannot supply pilot authority. A nonactive pilot's gameplay submissions fail locally, and the application
must also disable any stale rendered prompt. The server rotates control on the team's turns and independently
rejects inactive actions. Relay has shared captain decks/LP, one game, and no ranked/card/MP rewards or sideboarding.

`tests/network-relay.test.ts` uses four real GameSessions and the actual tag API handler (the HTTP request wrapper
is outside that test boundary), captain and partner preparation, four-way readiness, ordinary phase responses
through turn 3, pilot rotation, inactive-input rejection, partner prompt delivery, confirmed surrender and all-four
result/lobby return. It does not use engine auto-actions or test opcodes. PVP_TEST only permits early surrender.

## Browser input evidence

`tests/browser-e2e.test.ts` drives actual Chromium mouse/touch inputs through a real WebSocket into buildServer/World,
plays NPC51 to a natural defeat and verifies recording download/replay. Its authentication and HTTP deck storage
are fixture-only boundaries, not production cookie/D1 evidence. Raw CDP pointer events wait for hit testing and
queue ordered down/up before acknowledgements to avoid replacing a button between separate round trips. Recording
stop waits for a stopped positive-record UI state; a missing panel is never mistaken for an empty recording.

## Automatic opponent search

`startMatchmaking({style:3|6,similarLevel,allowSurrender,timeLimit})` creates the real automatic room (4288,
room-state byte 1); style 3 is Single and 6 is Either. `state.matchmaking` exposes idle/searching/matched, selected
style/filter, rival identity from 43a0, visible waiting-room counts (single/match/either), and `matchSupported:false`.
`refreshMatchmaking()` refreshes the room list; `retryMatchmaking()` uses the existing 42a0/42a2 reset to request
another server pairing attempt. `cancelMatchmaking()` removes the queued room through 4290/4292. Once 4306 arrives,
cancellation refuses because a real reservation exists; accept it through the normal duel-offer API. Lobby return
resets the search status. Counts describe visible queues, not server-calculated eligibility or wait-time estimates.

The current server's `autoStyle()` pairs only Single, resolving Either to Single. Native style-4 automatic rooms
can be listed but never pair; this client rejects starting that unsupported search and directs the user to a normal
Match room. It does not invent automatic MATCH support. The five-level filter applies if either participant asks
for it. Free and MMO searches are separated by their actual block keys (the free suffix is `|f`).

`tests/network-matchmaking.test.ts` verifies queue counts/reset/cancel without fabricated reservations, Single with
Either into real duel preparation/result/lobby return, unsupported native MATCH queue behavior, five-level filtering
and both-off pairing, and actual Free/MMO block isolation. The test-only server clock/configuration is unchanged.

An all-zero 16-byte account-list appearance is an uninitialized new-character slot. Before 4170 upload,
`selectCharacter()` and `enterArea()` use the original `CAvatarData::setDefault` appearance for the target world
(`client/src/Game/Avatar/yo2AvatarData.cpp`). Every nonzero custom appearance is preserved verbatim, including
partial/unknown values; server ownership validation remains authoritative. A real-session regression checks both
world uploads, stored/presence parts, and preservation of a nonempty partial appearance. This prevents an empty
slot from producing negative part filenames in the independent avatar renderer.

The optional original-media browser check is explicit opt-in:

```sh
YO2_ASSET_URL=https://original.ygoevolution.com/game/ npm test -- tests/browser-assets.test.ts
```

It uses the built client, real game WebSocket/World, the fixture's own authentication/deck HTTP boundary, and the
same bounded remote Range middleware as local development. Ordinary browser tests do not download original media.
After three warm-up cycles it measures 30 lobby/deck cycles, real PNG/JPEG/avatar decoding, authoritative movement,
DOM nodes/listeners, JavaScript heap after collection, object URLs, ImageBitmap close counts, and actual non-BFCache
pagehide disposal. Reports and screenshots stay under `/tmp`; no original media bytes are tracked. GPU byte usage,
production cookies/D1 and every map/card are outside this check. The existing browser-launch memory guard remains
active.

The check found a Chromium lifecycle issue: removing `src` from an already detached decoded image retained its
native fallback/shadow nodes. An independent minimal reproduction distinguished it from application references.
The renderer now clears displayed sources while connected before swapping layers, and keeps pending images in a
hidden connected staging layer until decode/cancellation completes. The 30-cycle check detects renewed growth;
raising its threshold is not the fix.

## Ownership and NPC rights

`state.pbin` and `state.npcbin` remain undefined until full account replies arrive. PBIN 3114 is exactly 128 bytes;
NPCBIN 4234 is exactly 512 bytes. Each snapshot owns a detached copy of its packet body. For a known NPCBIN,
`npcbin[npcId * 4 + 3]` is the source helper's rank/context byte; a missing snapshot must not be treated as rank zero.
`refreshPlayerBits()` requests both current-character snapshots. Character loading and disposal clear stale rights.

Account PBIN pushes after actual shop purchases update ownership immediately. They convey no NPCBIN change, so
progression remains at its previous known snapshot until its own complete reply. The app refreshes after acknowledged
grants/settlement as needed. `tests/network-rights.test.ts` checks actual profile snapshots and a real shop account
push, observer-buffer isolation, explicit refresh and malformed-size rejection without manufactured rights.

Concurrent `refreshPlayerBits()` calls for the same account/character share one promise and one wire query.
Character selection invalidates old snapshot epochs and queues its new query behind the preceding query; a
superseded selection cannot publish stale rights or overwrite the new scene with an error. Native replies have
no request identifiers, so a failed/timed-out refresh uses an ordered 3001/3002 account ping before retrying 3114.
This drains stale responses before installing the new 4234 waiter. Disposal invalidates pending work. Actual-server
regressions cover concurrent coalescing, timeout plus tunnel resume/retry, held old-character replies and disposal.

## My Room and world-port handoff

`enterMyRoom()` and `leaveMyRoom()` retain the authenticated account channel, selected character/PID, collection
and rights snapshots. `state.location` is world/my-room; `lobbyTransition` is entering-my-room/leaving-my-room until
the native handshake finishes; `appearanceWorld` retains the last world's clothing in My Room; `returnArea` is the
cached world destination. The phase is changing-lobby during handoff. Duplicate requests for the same transition
share its promise; active duels, invitations and automatic searches must finish/cancel first.

The source world manager sends 5310 before leaving a world block, closes the old lobby, then the net task connects
to the gate's advertised kind-12 My Room port. The session drains old messages through the still-open account
channel, authenticates/selects the same character, reads/enters its block, and registers both 4170 appearances
(other clothing world first). Raw My Room 4203 carries kind 12; `CWorldMng::waitMyRoom` sets the actual scene map
8, which this session exposes. My Room is private: only the owner's presence is listed, NPC queries are suppressed,
and the authoritative room list is empty. The server stores private movement on the connection; a local My Room
position snapshot prevents subsequent list replies from restoring an old world coordinate.

Leaving My Room reconnects to the cached world port and exact area. If the initial character selection explicitly
used the My Room port, leaving uses an advertised world port's own default block response, then caches that actual
area. The application must use source arrival **from map 8** both when opening My Room and re-entering the world;
My Room's door is a lobby handoff, not a world-area-0 command. FREE mode retains its CA10 flag and returns to its
separate `|f` block. Disposal invalidates pending transitions; reconnect can resume the account while the server
closes the omitted old lobby. Post-duel return also refreshes 4214 poses so avatars retain their parts.

`tests/network-myroom.test.ts` covers two private owners, public departure/rejoin, both looks, cached return,
private position refresh, no collection/economy changes, initial My Room selection, search/challenge guards,
dormant-room cleanup, a real socket drop after 5310, FREE isolation and disposal during the account-list wait.
This establishes navigation/session behavior. The original duel-disk shelf reads local player.bin slots in
`client/src/MyRoom/yo2DuelDiscShelf.cpp`; that local UI/storage feature is not implemented by this transport and
must not be mislabeled as an unsupported server API.
