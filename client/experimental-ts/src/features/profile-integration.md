# Profile integration

Owned implementation: `features/profile.ts`, `features/profile-ui.ts`. No assets, HTTP, storage, server edits, original client edits, or dependencies. No AGENTS.md applies in this repository.

## Host contract

```ts
const profile = new ProfileController({
  send: (command: GameplayCommand) => { /* send through active gameplay service */ },
  onChange: (state: ProfileState) => { /* schedule host UI render */ },
});
profile.dispatch({ type: 'setSelf', pid: authenticatedPlayerId });
profile.dispatch({ type: 'open', pid: selectedPlayerId });
// Forward lobby messages only; receive accepts Pick<WireMessage, 'id' | 'data'>.
profile.receive(message);
const element = renderProfileFeature(profile.state, a => profile.dispatch(a), {
  onInteraction: (action, pid) => { /* route to social: friend/mail/trade/team/ignore */ },
  onCosmetics: () => { /* open existing online cosmetics */ },
  titleChoices: [{ bit: ownedCatalogueBit, label: titleLabel }], // optional
});
// Reset on connection/account/character/block-context replacement, BEFORE forwarding its packets.
profile.reset(); // clears identity, drafts, pending operations, selection
profile.dispose(); // terminal; later receives/dispatch/reset do nothing
```

Constructor does not notify or send. `state` is read-only by convention. `dispatch` is synchronous, catches validation/send exceptions into `state.error`; `receive` catches malformed packets. `onChange` receives the entire next state. Callbacks should not throw. Parent owns mounting/replacing nodes and preserving focus using stable `data-key` fields.

Actions:

- `setSelf {pid: number | null}`: authenticated session context only; never infer self from the selected player.
- `open {pid}` / `refresh`: bounded positive player id excluding broadcast sentinel. Requests identity/location/player summary/both comment lines.
- `editDraft {field: 'playerId' | 'comment' | 'title', value}`: fixed keys; id max 10, other fields max 31 characters; drafts survive responses and selection changes, clear on reset. Received comments never overwrite drafts. Empty edit intentionally clears a line when saved.
- `saveComment {line: 0 | 1}`: self selection only, printable Latin-1, 31 bytes plus terminator. Line 1 is the legacy free-text personal title, distinct from achievement title id.
- `setTitle {bit}`: self selection only, u16 ownership bit sent in a u32, **not** displayed title id. Server enforces title ownership/GM rights. Default UI offers clear (bit 224); optional trusted catalogue choices enable other titles. No invented catalogue/ownership claims.

## Exact wire/source behavior

- `worldCommands.playerInfo` 0x4150 u32 pid -> 0x4160: s32 result; success is exactly 137 bytes: pid u32, name[16], level u8, score/mp u32, 15 u16 counters, turns u32, surrender counts 2 u16, LP/side swaps 2 u32, 6 u16, 6 u32, comeback counts/unknown108 3 u16, unknown10c s32, unknown110/titleId/unknown116 3 u16, TP u32, displaced counter u16. Public `decodeProfileDetails` preserves unknowns with legacy names; `w0b0[11]` is the displaced final counter. Provenance: `NetLobby_Rooms.cpp::onPlayerInfo`, server `Lobby.hPlayerinfo`.
- Actual server writes result/pid/name then zero-fills the remaining profile. Name may be `Jugador <id>`. UI uses block summary first and never labels these placeholder zeroes as real progression or rankings.
- `worldCommands.avatarInfo` 0x5320 -> 0x5340: s32 result, pid u32, name[16], x/y u16, direction u8 (29 bytes success). `decodeProfileLocation` exposes raw direction. Server `avatarInfo` can supply own name/default 400,300 for missing targets; UI explicitly labels fallback possibility. This is location information, not avatar appearance metadata.
- `worldCommands.players` 0x4210 -> 0x4212 uses existing exact 36-byte `decodePlayers`; selected pid supplies current block identity/level/wins/losses/title/country/state/block. `decodePresence` 0x3112 updates selected joins/state/leaves. Summary source is never mixed into placeholder details.
- `worldCommands.comments` 0x4218/0x421c -> data 0x421a/0x421e: existing 36-byte pid+text[32] records. Server ignores target filtering and returns visible block peers (self may be omitted); unknown stays null. 0x4180 relay: pid u32, line u8, text[32]. Only selected pid is applied.
- `worldCommands.comment` 0x4172 -> 0x4173 s32 result. Confirmed text is copied from the pending submission only on zero; other clients see hub relay. Server stores comments in session memory, not persistent profile storage.
- Title 0x4174 u32 ownership bit -> 0x4175 s32 result. Source: `persist.ts::h_title/onTitle`. Success reports acceptance without inventing a new displayed title id; block summary may remain stale until refreshed/server publishes it. No rankings or status-setting protocol is fabricated.

## Staleness and limits

Identity and location each allow one outstanding request. Selecting another player immediately clears visible old data; old reply drains before requesting latest selected id. Unexpected pid replies are ignored. Mutations serialize across both comment lines/title, even when changing selection. Unsolicited result replies do nothing. Comment lists/relays filter by selected pid. Drafts do not get erased by acknowledgments/errors. A malformed reply changes error, not confirmed content.

There are no request ids on wire: same-pid duplicates, result-only failures, and late packets across a reset cannot be distinguished. Host must reset at a transport/context boundary and prevent old-connection delivery. A lost reply leaves its operation pending until connection reset; there is no unsafe timeout/retry that might apply an old acknowledgment to a new request. Only forward current lobby packets. Refresh reuses outstanding identity/location requests.

No full gameplay parity claim. No account-progression/PDU decoder is duplicated here; host can continue using its account state elsewhere. No appearance selection metadata duplicates online cosmetics; social interactions only invoke host callbacks.

## Verification

`node tools/run.mjs vitest run tests/profile.test.ts tests/profile-ui.test.ts tests/profile-server.test.ts`

Real server tests use existing `server/test/notes-harness.ts` (actual buildServer/world, framed messages through server connections), verifying placeholder identity vs real block summary, location, comment acceptance/readback/peer relay/both lines/clear, title clearing, and actual rejection of unowned title. Unit tests cover all profile field positions, strict length, stale target draining, Latin-1 and length validation, self-only writes, serialized acknowledgments, drafts, malformed replies, send failure, reset/dispose. DOM fixture tests verify literal server text, bounded draft persistence, self-only controls, and routing callbacks. They do not prove browser visual behavior or gameplay parity.
