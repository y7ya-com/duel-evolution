# Gameplay integration

Pure browser TypeScript; no dependencies, sockets, fetch calls, DOM, timers, or application state. Import from `./gameplay` (extensionless). Every binary builder returns `{ channel: 'lobby', id, data: Uint8Array }`, structurally within the requested account/lobby/duel command contract. The parent owns transport and sequence numbers; do not wrap `data` in a packet header twice. No account login or duel-engine commands are implemented here.

## Binary API

- `worldCommands`: block list/entry; LIST1 players, LIST2 avatars, LIST3/4 comments, LIST5 teams; NPC list; player/avatar lookup; world-specific outfit registration; comments; movement and marks.
- `duelCommands`: room list/create/delete, NPC challenge, room challenge, accept/reject incoming offer, cancel outgoing challenge, spectate by duelist PID, reset autoduel wait.
- `socialCommands`: name lookup, friendship request/reply, ignore/unignore, online lookup for known friend PIDs, mail send/receive/count, team create/disband/invite/reply/banish/leave/list.
- `tradeCommands`: request/accept/reject/cancel, collection loading, trade start, add passcode/remove offer index, acknowledge peer movement, ready, final confirm/back, exit and abort.
- `chatCommand`: supported server chat kinds 0/1 global, 2 trade, 3 whisper, 5 team. Text is Latin-1 with `?` replacement for non-Latin-1 codepoints, not UTF-8. Ordinary chat is capped at 128 codepoints. `tagChatCommands` provides the server's compatibility `/tag invite` and `/tag accept` commands.

Password fields accept **precomputed 16-byte legacy MD5 digests**, never plaintext. An unlocked room uses zero bytes and does not check the challenger's digest. Password hashing is intentionally not duplicated in this module. Default room fields (style 3, watch 0, match state 0, rule bytes 1/1/1) match the server's private invite room. NPC ids are 1..98; fake social PIDs such as 100051 must not be passed to `challengeNpc`.

`decodeGameplayMessage(id, data)` returns a typed event, or `null` when another feature should handle the opcode. Malformed known messages throw `RangeError`/`TypeError`; the parent must surface or contain that failure. No partially decoded list is returned. Individual decoders are also exported. Typed-array subviews are supported; byte fields are copied so subsequent network-buffer reuse cannot alter decoded data.

Start/data/end list events must be collected by the parent. Start values are preserved without assuming they are row counts: LIST1 currently begins with 1 even when multiple players follow. Room lists begin with the actual count. Start/end opcodes: players `4211/4213`, avatars `4215/4217`, comments `4219/421b` and `421d/421f`, team appearances `4222/4224`, NPCs `4231/4233`, duel rooms `4282/4286`, mail `4611/4613`; team list uses header `4564`, member chunks `4559`, end `4565`. Full room snapshots replace a room collection; `3113` updates a room, and host/guest PIDs both zero mean removal. `3112` supports full joins, compact duel-state updates, and leaves.

## Exact duel flows

NPC: send `duelCommands.challengeNpc(npc.id)` => `4288` with raw id at offset 24. `Lobby.hCreateroom` returns false for NPCs, allowing `lobbyReply` to call `duelBegin`, then send `428a` result, `43a0` opponent card (42 bytes, final npcWindow byte 0), and `4306` host15/port16. Connect the duel transport only after the successful result and endpoint. The endpoint is server configuration, not a hardcoded port. No separate invented NPC-start command exists.

Hosted PvP: a host sends `createRoom`; challenger sends `challengeRoom(room.id)`, which is `4300` room-id32/digest16. Host receives `4302` (42-byte offer: pid32/name16/flags8/level8/title16/reserved16/parts16). Host sends `acceptInvite` or `rejectInvite` (`4303`, u32 1/0). Acceptance sends challenger `4301` result 0 and both peers `4306`. Rejection sends challenger `4301` signed -618; timeout sends -616, host `4308`; caller cancellation `4304` sends target `4305`, caller `4309`. A `4301` success alone is not a duel endpoint.

Direct PvP against a player without a room: execute the HTTP descriptor from `gameplayHttp.inviteDuel(pid)` with the existing authenticated service. Decode successful JSON with `decodeDuelInvite`, then send `challengeRoom(response.room)`. HTTP success only creates a private room; it does not challenge or start the duel. Incoming accept/reject still uses `4303` above. HTTP rejection retains its server error/cooldown; do not automatically retry it.

Spectate: `spectate(duelistPid)` => `4320` pid32; `4321` returns signed result, host15, port16. Only result 0 authorizes opening the returned duel endpoint; result 1 has an empty host/zero port. Actual watcher duel initialization is owned by the duel module.

## HTTP and tag

`gameplayHttp` returns a distinct `{ method, path, body? }` descriptor. It deliberately has no channel/id because there is no binary opcode for these routes. The existing HTTP service must supply same-origin authenticated requests. Descriptor routes are GET `/api/de/friends`, POST `/api/de/duel/challenge`, GET `/api/de/tag`, POST `/api/de/tag/invite`, and POST `/api/de/tag/{accept,decline,cancel}`. JSON decoders: `decodeFriends`, `decodeDuelInvite`, `decodeTagState`. These can be supplied to `HttpClient.request`. The services owner's API may already expose the same routes; reuse its transport rather than creating another session.

Tag invitation body names are `teammatePid`, `opponentPid`, `opponentTeammatePid`. Responses order seats captain/opponent/teammate/opponent-teammate. The host is accepted initially; all three other players must accept the invitation id. Decline belongs to invitees; cancel belongs to the host. All four receive `4306` when accepted. Tag `expires` and event `at` are **epoch seconds**. Server seat ordering, play-mode/location eligibility, identity checks and cooldown remain authoritative. No binary decline/cancel opcode was invented: full controls require HTTP; the compatibility chat path implements only invite/accept.

## Trade integration

All outbound operations are inside `7000`: u16 subcommand followed by fields. Inbound responses use top-level `71xx` ids, not another `7000` wrapper. Current-server ADDCARD is u32 **passcode** (legacy C++ sends u16 before its old cardwire translation); DELETECARD is u16 zero-based offer index. `tradeCommands.confirm` sends the one choice byte the current server reads, without the legacy ignored 20-card snapshot.

After an offer is accepted, each player calls `loadCollection` (7132: trunk/limit tables) and then `start` (7101). Every `move` event (7116: u32 value/u8 add-or-remove) must be applied and acknowledged with `acknowledgeMove` (7122), or the server holds subsequent queued peer moves. `reduceTradeView` projects peer offer, readiness and collection tables without sending anything. It does not own one's locally submitted offer or infer success from add/remove result 0: the server can acknowledge those requests without applying an illegal or locked mutation. Track pending local actions explicitly.

Either player's `ready` locks offer edits. Both ready produce `allReady`; final `confirm(true)` is an explicit user choice. `confirm(false)` sends 2, causing confirmResult 2 and clearing readiness while retaining offers. ConfirmResult 3 means settlement finished, **not success**: wait for `end.success` from 7121. Refresh collection after settlement; server sends updated trunk tables on success. Bound-card and minimum-40-card checks remain authoritative. `abort` (7128 CLEAR) aborts the whole trade; it does not clear just the offer. `exit`/cancellation close the projection. Start a fresh `initialTradeView()` for each new trade.

## Provenance and evidence

Wire/source references:

- `server/src/net/proto.ts` W/R, big-endian values and fixed Latin-1 strings.
- `server/src/game/lobby.ts`: roomEntry, hCreateroom, hReqmatch/challenge/challengeReply, duelInvite, hWatch, friends/mail/ignore, lobbyReply NPC path.
- `server/src/game/hub.ts`: list1Entry/list2Body/listChunks/joinMsg/stateMsg and movement. Current duel LIST2 extra is 23 bytes, and a LIST2 chunk can mix record sizes.
- `server/src/game/npcs.ts` npcEntry: 61-byte records with threshold, spot and previous-NPC chain id.
- `server/src/game/teams.ts` overrides fallback lobby team handlers. TEAMJOIN 4554 targets a player PID, and 4568 is yes/team-id/inviter-pid.
- `server/src/game/trade.ts` SUB and incoming M encodings; `persist.ts` pairTable uses u32 passcode/u8 count.
- `server/src/duel/tagRelay.ts` chat/tagApi/state; worker.ts and do.ts authenticated HTTP routes.
- `client/src/Net/NetLobby.cpp`, `NetLobby_Rooms.cpp`, `NetLobby_Social.cpp` give legacy builder field order. Current server encodings take precedence where cardwire translation differs.

Validation at implementation handoff: strict gameplay-only typecheck passed; 16 focused Vitest tests passed (8 payload/decoder tests, 8 real-server harness tests, including two settlement cases). Harness tests exercise NPC list/startup, private PvP decline and hosted PvP acceptance, friend/ignore/team actions, mail, trade movement/acknowledgement, successful persisted card exchange and rejection of a bound card, tag decline/cancel/unanimous start, and spectate refusal. Payload tests use the real server W encoder, test signed failures, mixed LIST2 sizes, subview offsets, copied data and truncated-packet rejection. Test commands from `client/experimental-ts`: `node tools/run.mjs vitest run tests/gameplay.test.ts tests/gameplay-server.test.ts`; `node tools/run.mjs tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM,DOM.Iterable --skipLibCheck --verbatimModuleSyntax src/gameplay/index.ts`. The whole-project `tsc --noEmit` passed earlier, but at 07:27 UTC concurrent parent changes introduced an unrelated `src/presentation.ts:35` tuple-conversion TS2352 error; it remains outside this module's ownership and was not edited here.

## Unsupported / unverified

This is not full legacy parity. No browser E2E or live-server session was run. Successful live watcher connection, duel transport/engine startup, actual NPC/PvP/tag play and return-to-lobby recovery remain unverified here. Parent must integrate commands, list accumulation, HTTP polling, error presentation and UI actions. Team disband/banish/leave, online-friend query, outfit persistence, ordinary chat delivery and all trade failure variants are not individually exercised end-to-end in this module's tests. Real server tests are in-memory Node tests with fake timers, not deployment validation.

Player-info request 4150 is exposed but the full 137-byte 4160 profile response is not decoded. No binary friend-list enumeration/removal or ignore-list enumeration command has been inferred; use the proven friends HTTP endpoint for current real-player list data. No mail deletion/read-marking commands are invented; receiveMail returns server mail without an exposed internal id. No tournaments, chatroom creation, packs, legacy retired rewards, moderation, ranking, NPC conversation trees, quests, complete avatar catalog or undocumented opcodes are implemented. Login/character session/deck/shop/card assets and duel play belong to other modules.
