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
collision/pathfinding, all social/trade/team flows, all duel prompts, PvP/spectator behavior, or all failure cases.
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
