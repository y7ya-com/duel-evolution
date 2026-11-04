# Experimental TypeScript client gameplay acceptance

All flows below are **unverified**. The inventory defines acceptance, not a claim that a feature exists or works. Server tests, the reference translator, a successful build, and repeatable reduction of synthetic bytes cannot establish new-client gameplay parity.

The machine inventory is `src/parity/acceptance.ts`. A verified row needs dated evidence identifying the new client build, setup/account roles, input actions, expected result, actual observation and assertions. Link reproducible tests or a sanitized evidence artifact in that row's `evidence` array. Verify positive, failure and reconnect paths where applicable. Keep this table synchronized when adding evidence. Never put credentials, account tokens or private fixture contents in evidence.

## Run the checks

From `client/experimental-ts`:

```sh
node tools/run.mjs vitest run tests/parity-replay.test.ts tests/parity-duel.test.ts tests/parity-report.test.ts
node tools/parity.mjs --test
node tools/parity.mjs --report
node tools/parity.mjs --report --json
```

The helper reuses the repository's installed Vitest through `tools/run.mjs` (including `server/node_modules`). `--test` validates infrastructure and can succeed with zero verified gameplay flows. Default/`--report` runs those tests, prints actionable gaps and **exits 1 while any acceptance evidence is missing**. Test failures produce a nonzero result before a parity claim. `--json` writes only the JSON report to stdout, with test output on stderr. Reports use temporary files that are removed by the tool; they contain aggregate private-fixture diagnostics, never copied fixture data. No generated game tables enter source.

## Record and replay contract

`WireRecorder` accepts the network module's raw `WireMessage` shape. Capture is opt-in and in memory; the application already wires the higher-level `LiveCapture` at incoming/outgoing channel boundaries, with opt-in Start/Stop/Download controls in Options (see `src/parity/LIVE.md`). The following low-level example describes infrastructure, not missing application wiring. Use a monotonically allocated capture channel id, call `open(id, 'duel')` before subscribing to that channel, then `message(id, 'in', message)` in receive order and `close(id)` at final channel closure. A tunnel resume continues the same logical channel; a new channel needs a fresh capture id. A capture must start before duel initialization; a mid-duel trace alone does not reconstruct its prior state. Recording does not send responses or change the network lifecycle.

```ts
import { WireRecorder, compareReplay } from './parity/replay';
import { duelReplayAdapter } from './parity/duel-adapter';

const recording = new WireRecorder();
recording.open(1, 'duel');
// channel.subscribe(message => recording.message(1, 'in', message));
// After capture, without modifying the original records:
const result = compareReplay(recording.snapshot(), duelReplayAdapter);
// result.deterministic compares the same trace twice from fresh initial states.
```

Only inbound duel `0x6202`, `0x6461`, `0x6610`, `0x6611`, `0x6612`, `0x6613`, and `0x649b` bodies and wire params are allowlisted. All outgoing bodies, auth/login bodies, unknown opcodes and bodies on other streams are stripped, with their params zeroed. The schema has no URL, HTTP body, password, token, sid, free-text metadata or timestamp fields. Imported extra fields are rejected. This is a protocol allowlist: do not disguise secret data as a duel payload. These duel bytes are still game observations and should be handled as private until reviewed for sharing.

Limits are at most 20,000 records, 65,535 bytes per raw payload, 8 MiB retained payload, 20 MiB encoded trace JSON and 32 MiB retained canonical replay checkpoints. Callers can lower recorder/import limits. Overflow throws without appending that record; it never silently drops or truncates a trace. Reuse of a closed channel id, messages before open/after close, noncontiguous record sequences, malformed hex, invalid numbers, modified redactions and inconsistent streams are rejected. Trace sequences preserve arrival order; transport `param` validation remains the gateway's responsibility.

`replay` and `compareReplay` use a fresh reducer state for each duel channel and each run. They compare full canonical checkpoint states and presentation outputs, final states, and counts, rather than relying only on a hash. `stateDigest` is a stable FNV-1a diagnostic fingerprint, **not** a cryptographic integrity check. Imported packet checksums belong to the network codec; this JSON format is not a signed capture format.

The real duel adapter derives observed opcode counts from packets the browser reducer accepts without protocol errors, unsupported events or unsupported prompts. Clearing diagnostics in a separate per-command acceptance probe detects rejection even after rolling diagnostics fill or a later initialization command erases earlier diagnostics. A batch with any rejected/unsupported instruction receives no opcode credit. Counts are conservative and distinguish command record kind and command value; player bits are normalized for execute commands. There is no claimed total opcode denominator. A reducer accepting a packet can still interpret it incorrectly: independent expected-state and expected-response assertions remain necessary.

Output comparisons cover the reducer's bounded presentation queue. They do not prove every transient event survives queue overflow, outbound response bytes match the legacy client, animation timing matches, or the rendered UI/audio is correct. Redacted packets are counted as skipped and do not influence duel state. Auth, HTTP APIs, trade, social, shops, settings and audio require dedicated assertions outside this replay adapter.

## Private fixture diagnostics

When available, `tests/parity-report.test.ts` reads at most the first three sorted `server/gamedata/fixtures/translator/*.json.gz` files and up to 100 view-zero output packets per file. Gzip expansion is capped at 16 MiB per file. It replays each bounded prefix twice and reports determinism, recognition/rejection and observed opcode counts. It never invokes or credits the server's translator parity suite.

These reference outputs contain legacy card indices and 40-byte commands, rather than authenticated current-client passcode-wire captures. Even recognized packets do not establish correct card identities, complete starting state, complete duel behavior or gameplay parity. **Zero gameplay flows are credited from this probe.** Missing fixtures are reported explicitly, not treated as coverage. Full translator/engine/brain suites and every private recording have not been run as part of this focused client check.

## Acceptance inventory

Every status starts unverified until qualifying new-client evidence is linked.

| ID | Area / flow | Required observation | Status |
| --- | --- | --- | --- |
| `auth.login` | auth / Password login | Valid credentials bind the correct account; credentials never enter traces or logs. | unverified |
| `auth.register` | auth / Register account | Create a valid account and handle duplicate/invalid credentials. | unverified |
| `auth.invalid` | auth / Rejected login | Wrong credentials show an actionable failure and permit retry. | unverified |
| `auth.session` | auth / Session and logout | Restore an authorized session; logout clears identity and access. | unverified |
| `auth.binding` | auth / Account binding | An account cannot select another account’s character or reuse a stale session. | unverified |
| `character.list` | character / Character list | Render every occupied and empty slot with correct identity. | unverified |
| `character.create` | character / Create character | Create a valid name, report collisions/invalid names, refresh slots. | unverified |
| `character.select` | character / Select character | Load the selected player and enter the correct world. | unverified |
| `character.delete` | character / Delete character | Confirm deletion, update slots and reject invalid ownership. | unverified |
| `character.starter` | character / Starter and progression | Claim eligible starter once; reflect deck, inventory, level and wallet updates. | unverified |
| `lobby.enter` | lobby / Enter and leave lobby | Load correct world, room, occupants and transition without stale listeners. | unverified |
| `lobby.move` | lobby / Movement | Send legal coordinates and reconcile authoritative positions. | unverified |
| `lobby.presence` | lobby / Presence updates | Join, departure and movement update the correct avatar once. | unverified |
| `lobby.rooms` | lobby / World and room navigation | Change rooms/worlds and refresh player and NPC lists. | unverified |
| `lobby.interact` | lobby / Player/NPC interaction | Select an occupant, show profile and valid available actions. | unverified |
| `avatars.appearance` | avatars / Avatar appearance | Render self/others with sex, face, hair, clothing and accessories. | unverified |
| `avatars.edit` | avatars / Avatar editor | Preview, apply and reload permitted appearance parts. | unverified |
| `avatars.titles` | avatars / Titles and profile | Read and change owned titles/profile; reject unowned choices. | unverified |
| `npc.start` | npc / NPC duel start | Choose NPC/deck, validate eligibility, establish correct first turn and initial field. | unverified |
| `npc.play` | npc / NPC complete duel | Play a full duel with server-issued actions and win/lose/draw result. | unverified |
| `npc.rewards` | npc / NPC rewards/rematch | Apply correct rewards, unlocks and rematch lifecycle exactly once. | unverified |
| `pvp.invite` | pvp / PvP invitation | Challenge, accept, decline, cancel and expire invitations without stale state. | unverified |
| `pvp.matchmaking` | pvp / Auto duel matchmaking | Find/cancel single or match opponents with level filters and correct searching/waiting counts. | unverified |
| `pvp.host` | pvp / Hosted duel options | Create/join a duel with time, spectator, surrender and password options; never record the password. | unverified |
| `pvp.match` | pvp / Match and sideboarding | Preserve match score, permit legal sideboarding, continue rounds and resolve the overall result. | unverified |
| `pvp.start` | pvp / PvP setup | Select legal decks and establish both perspectives with correct hidden information. | unverified |
| `pvp.play` | pvp / PvP complete duel | Two clients agree on field, LP, phases, timers and final result. | unverified |
| `pvp.end` | pvp / Surrender/timeout/disconnect | Resolve each termination path and return both players to a usable lobby. | unverified |
| `tag.party` | tag / Tag formation | Invite, join, leave and validate a four-player team with correct seats. | unverified |
| `tag.relay` | tag / Tag relay duel | Turn relay, shared field, perspective, prompts and teammate visibility remain correct. | unverified |
| `tag.end` | tag / Tag termination | Surrender, disconnect and result release all seats and update rewards once. | unverified |
| `spectate.join` | spectate / Spectator join | Find/join an NPC, PvP or tag duel and reconstruct the current visible state. | unverified |
| `spectate.visibility` | spectate / Spectator privacy | Hide private cards and prohibit player responses from observers. | unverified |
| `spectate.leave` | spectate / Spectator lifecycle | Live updates, late join, duel end and leave clean up the view/channel. | unverified |
| `duel.field` | duel / Field and card movement | Deck, hand, monster, spell, grave, banish and extra zones preserve order and ownership. | unverified |
| `duel.visibility` | duel / Card identities | Reveal/hide cards, tokens, control changes, shuffles and positions match server state. | unverified |
| `duel.combat` | duel / Turns and combat | Render phases, chains, battle, LP, stats, counters and destruction correctly. | unverified |
| `duel.actions` | duel / Legal actions | Only current server-issued card/phase actions can generate valid responses. | unverified |
| `duel.prompts` | duel / Choice prompts | Yes/no, options, position, race, attribute, number and announce-card map to correct bytes. | unverified |
| `duel.selection` | duel / Selection prompts | Card, field, ritual and discard selection respect bounds, cancellation and hidden identities. | unverified |
| `duel.stale` | duel / Stale/unsupported prompts | Reject stale input and display unsupported prompts without fabricating a valid action. | unverified |
| `duel.presentation` | duel / Presentation | Animations, card inspection and logs remain ordered while input waits appropriately. | unverified |
| `deck.list` | deck / Load/select decks | Show saved decks, active deck and inventory counts from authoritative data. | unverified |
| `deck.edit` | deck / Deck editing | Add/remove/reorder main, side and extra cards; enforce ownership and card limits. | unverified |
| `deck.persist` | deck / Deck lifecycle | Create, rename, save, reload and delete decks with correct active selection. | unverified |
| `deck.test` | deck / Deck test | Start and leave supported deck testing without spending cards or altering the saved deck. | unverified |
| `deck.validate` | deck / Deck legality | Report size, format and forbidden/limited-card violations before a duel. | unverified |
| `deck.recipes` | deck / Deck recipes and import/export | Load supported recipes and round-trip supported deck formats without losing identities. | unverified |
| `cards.collection` | cards / Collection/search | Owned counts, filtering, sorting and pagination match inventory. | unverified |
| `cards.inspect` | cards / Card details and art | Passcode, text, type, stats, rarity, alternate art and image fallback are correct. | unverified |
| `cards.hidden` | cards / Hidden/unknown cards | Card backs and unknown assets reveal no private identity and remain usable. | unverified |
| `shops.catalog` | shops / Shop catalog | Load packs, decks and singles with correct price, availability and ownership. | unverified |
| `shops.purchase` | shops / Purchase and opening | Purchase/open products, update inventory/wallet once and render acquired cards. | unverified |
| `shops.constraints` | shops / Purchase failures | Insufficient funds, invalid counts, sold-out items and duplicate submissions fail clearly. | unverified |
| `cosmetics.catalog` | cosmetics / Cosmetic catalog/preview | Browse categories and preview supported owned/unowned appearances. | unverified |
| `cosmetics.purchase` | cosmetics / Cosmetic purchase/equip | Spend correct wallet funds, grant once, equip only owned items and persist selection. | unverified |
| `cosmetics.wallet` | cosmetics / Bound/earned wallet | Balances, eligibility and purchase restrictions match authoritative wallet semantics. | unverified |
| `trade.invite` | trade / Trade invitation | Invite, accept, decline, cancel and handle busy partners. | unverified |
| `trade.offers` | trade / Trade offer/confirmation | Both sides see current cards/counts; offer changes invalidate confirmations. | unverified |
| `trade.commit` | trade / Trade completion | Exchange only eligible owned cards atomically and refresh both inventories. | unverified |
| `trade.failure` | trade / Trade failures | Disconnect, stale inventory, bound items and cancellation cause no loss or duplication. | unverified |
| `social.chat` | social / Chat channels | Public, room, private and team messages respect channel, ordering and duplicate suppression. | unverified |
| `social.chat-policy` | social / Chat restrictions | Length/rate limits, mute/ignore, blocked targets and errors are handled without leaking private messages. | unverified |
| `social.friends` | social / Friends | List/add/remove friends, online state and invitations persist correctly. | unverified |
| `social.ignore` | social / Ignore list | Add/remove ignored users and apply visibility/contact rules. | unverified |
| `social.mail` | social / Mail | List/read/send/delete supported messages and show failure/empty states. | unverified |
| `social.teams` | social / Team list and membership | List/create/join/leave supported teams with correct membership, presence and team-chat permissions. | unverified |
| `social.profile` | social / Profiles and player lists | View correct identity, progression, title, status and supported rankings. | unverified |
| `duel.log` | duel / Duel log/history | Open supported duel logs, retain ordering and card references, and close without affecting active prompts. | unverified |
| `settings.language-screen` | settings / Language and display mode | Supported language/fullscreen choices apply correctly, persist where promised, and recover if browser access is refused. | unverified |
| `settings.persist` | settings / Settings persistence | Change supported display/input preferences and restore them after reload. | unverified |
| `settings.accessibility` | settings / Accessibility | Keyboard focus, modal escape, readable feedback and reduced motion remain usable. | unverified |
| `audio.volume` | audio / Volume and mute | Sound/music levels and mute persist and affect their respective playback. | unverified |
| `audio.lifecycle` | audio / Audio lifecycle | User gesture unlock, scene transitions, duel cues and cleanup avoid overlapping/stuck playback. | unverified |
| `reconnect.resume` | reconnect / Tunnel resume | Resume active channels/sequences without duplicate moves, purchases, chat or duel input. | unverified |
| `reconnect.expired` | reconnect / Resume expiry | Expired or rejected resume clears stale channels and offers a valid new connection. | unverified |
| `reconnect.scenes` | reconnect / Scene lifecycle | Reconnect/re-enter/reload during lobby, shop, deck and duel without stale subscriptions. | unverified |
| `errors.network` | errors / Transport failures | Timeout, refusal, truncated packets, invalid digest and sequence gaps surface actionable errors. | unverified |
| `errors.protocol` | errors / Protocol failures | Malformed/unsupported payloads fail transactionally without partial board or inventory mutation. | unverified |
| `errors.api` | errors / API and assets | HTTP/auth failures, unavailable data and missing assets show usable retry/fallback states. | unverified |
| `errors.concurrency` | errors / Concurrent and stale operations | Busy state, duplicate clicks, navigation and late replies cannot apply to the wrong session. | unverified |

## Validation record

Focused check on 2026-11-04 (UTC): the three parity files passed 18 tests. The synthetic trace exercised 12 packets through the real browser reducer: initialization, turn change, draw phase, LP set/loss, timer, empty lists, field/hand masks, score, server notice and result. Final state and presentation outputs matched across fresh runs. Assertions check LP, turn, phase, status, timer, list, score event, result and measured opcode counts. Malformed-family payloads, missing-source movement, unsupported commands, diagnostic saturation and an unsupported command followed by a resetting initialization all receive no credit.

The private diagnostic found 75 translator recordings and read 300 output packets from three files; 298 were legacy 40-byte command packets. These prefixes replayed deterministically, with 300 recognized packets and zero gameplay flow credits. This sampling does not establish complete-duel or current-client UI equivalence.

A broader concurrent-checkout run completed 20 test files with **318 passing and two failing tests** (320 total). Its 72 private recorded-duel reducer/translator board comparison cases passed; those assert zone contents, exposed identities, positions and LP, and remain component evidence rather than full gameplay acceptance. Both failures were in the network-owned `tests/network-gateway.test.ts`: socket construction throws and `connect()` returns null rather than a rejected promise; failure to send an open control leaves a channel registered. These files were not changed by this focused task.

Strict TypeScript initially passed, and a final strict compile restricted to the four parity source modules and their dependencies passed. A later check, after fixing the parity adapter's own inferred-empty-array type, reported an external `src/presentation.ts:35` array-to-two-player-tuple cast error in the concurrently edited parent scope. No files outside the assigned parity paths were edited to address it. Re-run typecheck after parent integration; this validation record does not claim the shared checkout is currently green.

The parity gate intentionally fails with **0/81 verified acceptance flows**. No live browser acceptance session, real new-client wire capture, multiplayer end-to-end run, response oracle, UI/audio comparison or complete server engine/brain/reference parity sweep was performed.

Historical next steps from the focused parity task (recorder integration has since landed): acquire sanitized current-wire traces from complete NPC, PvP, tag and spectate sessions; add independent expected state/response assertions; perform the listed browser acceptance flows; record evidence without promoting rows merely because infrastructure checks pass.

## Current checkpoint clarification

The validation narrative above records the earlier focused parity-task snapshot. Parent integration subsequently fixed the reported type/gateway failures, wired safe live recording and downloads, and passed 564 tests plus typecheck/build. Desktop mouse and mobile touch NPC51 runs download captures that replay to the same natural loss. The complete 81-flow gate still fails; these scoped results do not establish all gameplay or presentation parity. Recorded-duel corpus checks state and response representability; byte equality is checked for action/phase packets, not every selection/answer/announcement/cancellation packet. See STATUS.md for the current evidence and limitations.
