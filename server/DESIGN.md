# YO2 server on Cloudflare: design

This is a TypeScript port of YOLaucher's Python emulator (`YOLaucher-web/tools/yo2emu`, called "py" below) for Duel
Evolution. It must match py byte for byte on the wire. Parity applies to game behaviour, not to the 2008 security
model (see Auth).

## Shape

```
client (recomp, winsock stand-in) ──1 WebSocket /boxedwine-network (gateway framing)──▶ Worker ──▶ WorldDO (singleton)
                                                                                                    │  RPC
Worker HTTP: /yo2/root.txt, /yo2/merge.txt, /stoplogin/*, /health                                    ▼
                                                                                         MatchDO (one per duel)
D1 (drizzle): accounts, characters, cards, decks, …  ◀── WorldDO and MatchDO
```

- **Transport (`src/net/gateway.ts`).** This uses the same framing as `network-gateway.mjs` and the client's
  `platform/net/net_ws.cpp`. One WebSocket per client carries many TCP sockets:
  - a text frame `{"type":"open","id","host","port"}` gets the reply `{"type":"open","id","status":0}`; an unknown port
    gets `-111`;
  - `{"type":"close","id"}` works in both directions;
  - a binary frame is `[1][id u32 BE][stream bytes]`.

  The WorldDO terminates the WebSocket and runs one `Conn` per virtual socket. `Conn` handles the YO2 codec (24-byte
  header, XOR `5aa55a55`, MD5, the per-connection seq rules from `red/conexion.py`) and a paced send queue (py sleeps
  0.25 s, or the per-call pause, between messages). The port decides the service; `PORT_OFFSET` is 1000 on the live
  site:

  | port (+offset) | service | where |
  |---|---|---|
  | 5730 | gate (server list) | WorldDO |
  | 5731 | accounts / characters | WorldDO |
  | 5732, 5740-5750, 5800-5876 | lobby, rooms (blocks, chat, avatar, shop, trade, mail, teams…) | WorldDO |
  | 5760 | duel | WorldDO (duels in-process, see Duels) |

  The WorldDO is resident, not hibernating (a hibernated DO would keep the sockets but lose this memory). All the
  shared state lives in memory
  there: sessions, blocks, rooms and presence. A "peer" is the WebSocket, not the IP: on the live site every player
  comes from the same IP.
- **Read model.** py's reader thread blocks on its own paced sends, so a connection's next request is handled only
  after the replies to the previous one went out (0.25 s each). The World keeps one inbound queue per virtual socket
  for that. All handlers run one at a time, which keeps the game code synchronous like py's.
- **Duels.** They run in-process in the WorldDO: one `DuelCore` (src/duel/engine, a synchronous port of duelcore over
  ocgcore-wasm 0.1.2, the same version py uses) hosts every duel, the same way py's one duelcore process does. On
  top of it sit the TS ports of the translator (`research/traductor`), the NPC brain (`research/ia/brain.py`,
  falling back to bot.ts), and duelfin/lockstep/pvp_match. Everything is runtime-agnostic, so vitest drives it in
  Node. *Changed from the first draft*: no MatchDO per duel. One shared engine needs less memory than one wasm
  instance and one script pack per Durable Object. We can split duels out later if one DO's CPU ever becomes the
  bottleneck.
- **The NPC AI** (`src/duel/ai`) is Duel Evolution's own NPC player and the code's default one (the deployed Workers
  still set `NPC_AI=py` in wrangler.jsonc until the owner switches): a heuristic player with
  per-card rules (generic staples, rules from the card-text tags, an empty per-NPC map for tuning). It has three tiers
  by the NPC's level in `npc_profiles.json` (1-3 easy, with occasional random lines; 4-6 hard; 7-9 elite), which
  `TIER_BY_NPC` can override. The elite tier adds lookahead: it forks the duel (a new duel in the same `DuelCore` with
  the same seed, replaying the recorded commands) and scores each candidate line with a short rollout, within a CPU
  budget per decision. Play is honest by default: the AI uses only the select's `view`, and the elite's rollouts stop
  at the end of its own main phase, with the opponent never answering optionally. `NPC_AI_SPY=1` (off) lets the elite
  read the opponent's hidden cards and look through the opponent's turn. The py-parity brain (`src/duel/brain`) plays
  with `NPC_AI=py`, which `parity/run.py` also sets so that the `npc` scenario stays byte-equal to py. When the AI has
  no answer, the engine's `auto` decides.
- **HTTP: Hono.** The Worker (`src/worker.ts`) is a Hono app:
  - `/yo2/root.txt` and `/yo2/merge.txt` (py `www/`, plain text, committed);
  - `/__warm` (the landing page's ping);
  - `/boxedwine-network`, the WebSocket handoff to the WorldDO, behind the session gate (see Auth);
  - `/__admin/*`, with the admin role;
  - `/__dev/*`, DEV only;
  - the account pages and APIs (`src/auth`);
  - the site's files from R2 when a `BUCKET` is bound.

  Everything else is a 404, as in py; that includes the client's `/app/english/stoplogin.html` and `info*.html`. The
  Durable Objects stay plain `DurableObject` classes speaking the YO2 binary protocol over WebSockets.
- **Auth** (details in [AUTH.md](AUTH.md), owned by the auth work). Duel Evolution has its own accounts: better-auth
  with its drizzle adapter on our D1, mounted in Hono at `/api/auth/*`.
  - It provides email + password (scrypt), verification and reset, httpOnly Secure session cookies, rate limits,
    Turnstile, roles in `role_grant`, and a one-time claim flow for imported legacy accounts.
  - The `/boxedwine-network` upgrade needs an allowed Origin and a live session. The Worker sets `x-de-user`; any
    client-sent value is dropped.
  - The WorldDO binds every virtual socket on that WebSocket to the user. 0x3003 is only "which account": the user's
    own (`accounts.user_id`), created as `u:<userId>` on the first game login. The 2008 blob, a Blowfish+MD5
    password equivalent, is ignored, so neither a replay nor a typo can reach or create another account.
  - The legacy blob login runs only without a user, i.e. on the DEV parity bridge.
  - Hook for the client side: the recomp's login dialog can be skipped or auto-filled from the web session (e.g. a
    short-lived single-use token in the 0x3003 blob). The server already ignores the blob on a bound channel.
- **Admin.** `POST /__admin/<action>` (the Worker requires the admin role and sets `x-de-admin`): status,
  ban/unban/kick, GM, sanction flags, shop prices, start values, maintenance notice, tournaments,
  events.
- **Storage.** D1 through drizzle (`src/db/schema.ts` = auth tables + `game-schema.ts`), with one migration set from
  drizzle-kit (`migrations/`). The tables are relational, with no JSON blobs for core data:
  - `accounts` (key `acct`, `user_id` → `user.id`, idx, active slot), plus logins and aliases;
  - `characters` (every `rec` stat as a column), `trunk_cards`, `titles`, `npc_progress`, `claims`, pending prizes;
  - last-duel decks and deck history, archived characters;
  - mail, friends, black list, teams + members;
  - admin tables (bans, GM, flags, shop prices, start values).

  At boot the WorldDO loads the state from D1 (`blockConcurrencyWhile`) and keeps it in memory in py's state.json
  shape. Every save is diffed against the rows last written, and only the changed rows go out, in one ordered batch.
- **Importer.** `scripts/import_state.ts state.json > import.sql`, then `wrangler d1 execute --file`. Live accounts
  carry over with `user_id` NULL; their owners claim them. The importer refuses any state that wouldn't come back
  exactly.
- **Config.** The py "vanilla" profile is the only profile. Env vars cover only what is really switched:
  `PORT_OFFSET`, `PUBLIC_IP`, `SINGLE_LOBBY` (py `YO2_SINGLE_LOBBY`: the gate announces only the world Duel Academy
  room), `DEV` (wrangler dev only) and `PARITY_SEED`.
- **Game data.** The tables derived from the client (Konami) and from EDOPro's cards.cdb are generated into
  `gamedata/` (not committed: Konami-derived), with their provenance and generators in `gamedata/README.md`. The 20 MB EDOPro scripts
  pack is rebuilt by `scripts/engine_gamedata.mjs` and kept in R2. Raw game assets are never in the repo.

## Parity

- `parity/bridge.mjs`: TCP listeners on `5730+off…` → one gateway WebSocket per client → `wrangler dev`. With it,
  py's own `fake_client.py` scenarios (`dos`, `basura`, `npc`, `pvp`, `sondeo`, …) run unchanged against both
  servers; we import them read-only from YOLaucher-web. Our own scenarios live in `parity/scenarios.py` (`tienda`).
  `parity/e2e.py` runs the native recompiled client against `wrangler dev`.
- `parity/run.py base|ts|diff <scenario>`:
  1. py on offset +4300 with a copied frozen state, `random.seed(1)` (py's `paridad/semilla`) and `YO2_TAP`;
  2. TS on the same offset, from a source snapshot, seeded through `/__dev/state` (DEV only), with `PARITY_SEED=1`;
  3. a diff of the two taps per (client, port, connection, rx index), with the masks from `paridad/mascaras.json`
     (clock and turn-timer bytes).
- **Randomness.** `src/util/pyrandom.ts` is CPython's MT19937 plus `random/randrange/randint/choice/shuffle/sample`,
  with the same call order as py. Packs, rock-paper-scissors, duel seeds and the brain then match bit for bit.
- A module lands only when its scenarios come out EQUAL. vitest covers the units (codec, pyrandom, importer, the
  translator against recorded OCG traces).

## Order

gate/login → accounts/characters → lobby/chat/avatar → shop/packs → decks → NPC duel → PvP duel →
trade/mail/friends/teams/admin. Then an end-to-end run: the native recomp client against `wrangler dev`.
Live at `original.ygoevolution.com` since 2026-10-28 (DEPLOY.md). Only production is deployed; pre-deploy checks run
against a local `wrangler dev`. The old container stays as the fallback.

## Deliberate changes from 2008

Parity covers game behaviour; these differences are intended. The parity harness masks them (`parity/run.py`
INTENTIONAL):
- **PvP is free.** There is no duel-point economy: no room or match gates, no per-duel charge, and no starting
  grants. The client's balance fields (0x4101, 0x4140) carry the one neutral `WIRE_UNUSED_DP`.
- **No DUELPASS.** There are no codes and no passes: 0x3111 carries `WIRE_UNUSED_DP`, 0x8102 always answers
  "invalid code", and 0x4903 always answers "no pack".
- **Login is the web session, not 0x3003** (see Auth).
- **Picking several cards from a pile shows the cards** (translator `unselect_list`). An OCGcore SELECT_UNSELECT_CARD
  (`aux.SelectUnselectGroup`: Chaos Sorcerer, Black Luster Soldier - Envoy, Dark Necrofear, Future Fusion…) with
  candidates in the deck, graveyard, banished zone or extra deck opens the client's card list (0x6610 + 0x1b B=0x33,
  as SELECT_CARD already did), not py's bare mask on the pile, which showed no card. Several cards can be marked in
  one list; the next prompts of the same pick take them in order. The py-parity replays set `unselect_list: false`.
- **Automatic card placement goes centre-first**, as on the official server: OCGcore zones 2, 1, 3, 0, 4 (the
  centre, the two next to it, then the edges), per player from their own side, so the opponent needs no mirroring.
  One helper, `src/duel/zones.ts`, orders every zone picker: the engine's `auto` (bot.ts), the translator's answer
  for "Auto Card Placing", the NPC AI and the py brain (which already used it). py's engine and translator fill from
  the left; `parity/run.py` sets `PLACE_ORDER=py` to keep that order (and the `npc` scenario byte-equal), and the
  engine/translator fixture tests replay with it.
- **Fusion material markers only when a Fusion Summon follows** (translator `fusion_needs_summon`). The client's
  engine 0x4b (view 0x2c) sets a "fusing" flag that only 0x4d RUN_FUSION (view 0x36) clears. While it is set, every
  card move snaps into place with no animation (draws, summons, Sets, destructions), and the markers stay on screen.
  py marked every monster sent after HINT 511, so Future Fusion (materials now, summon two turns later and without
  the hint) left the client fusing for the rest of the duel. The translator now marks materials only when the batch
  reaches the extra deck -> monster zone MOVE (or a decision ends the batch first). The translator fixture tests
  replay py with it off, and a named test checks that only the summonless materials change. The `npc` scenario has
  no fusion, so `parity/run.py` needs no mask.
- **No blank NPC gifts** (`persist.ts` `bitShown`). The client's item-get window (CCardPackCheckScene state 0x21)
  draws a page only for avatar parts, 挑戦権, recipes and titles (PBIN classes 1-3, 7, 8, 10). Any other bit gets an
  empty page. py put the 途中景品 GET済み flag (class 6) in every 5-win NPC prize, so each one showed a blank page. Yami
  Marik's (75-77) has no card, so his prize was nothing but a blank page. Such flags are now stored but left out of
  0x5205, and the client gets them with the next 0x3114. A prize with nothing left to show is no present (no 0x4237).
  `test/npc-rewards.test.ts` walks every NPC's prizes. No parity scenario reaches an NPC prize, so `parity/run.py`
  needs no mask.
- **NPC outfit prizes ignore gender.** Completing a famous NPC's chain gives every outfit variant (both of a boy/girl
  pair, or the only one), not just the player's own as py did. The client stores both, and the avatar editor lists
  the other gender's after switching gender (`persist.ts` `presentClothes`, test/npc-rewards.test.ts).

## Not ported

The launcher, Frida, the 5799 Python console, hot reload (`hot.py`, `recarga.py`, `hot_*`), the profile/flag
registry, the SQLite event chain (D1 plus Time Travel replaces it), Boxedwine room/UDP peering in the gateway (the
recomp client does not use it), and research that is not on the runtime path.
