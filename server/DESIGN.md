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
- **The NPC AI** (`src/duel/ai`) is Duel Evolution's own NPC player and the deployed default (`NPC_AI=ai`): a heuristic player with
  per-card rules (generic staples, rules from the card-text tags, per-NPC plans for the fusion and Destiny HERO decks). It has three tiers
  by the NPC's level in `npc_profiles.json` (1-3 easy, with occasional main-phase random lines; 4-6 hard; 7-9 elite), which
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
- **DUELPASS removed.** There are no codes and no passes: 0x3111 carries `WIRE_UNUSED_DP`, 0x8102 always answers
  "invalid code", and 0x4903 always answers "no pack".
- **Cards are earned, as in 2008, but MP comes from duels** (`PROGRESSION=1`, persist.ts). py started every
  character with every card (×3). Now a character starts with no cards and claims ONE free structure deck (one of
  the shop's nine, made legal for the 2008 list) on the web client's picker (`GET /api/de/starter`,
  `POST /api/de/starter/claim`, game/starter.ts; once per character, `p.starter`), buys packs with MP, gets NPC
  chain prize cards, and the deck check blocks a deck with unowned cards (0x649b code 1: the client goes back to the
  map). The 2008 Startup Present (0x8401, a free pick of ANY 40 cards) is refused; characters that claimed it keep
  those cards and get no starter deck. 2008's MP amounts are not known, so the economy
  is the owner's MVP (`persist.ts` ECON, every value explained there): 5000 MP to start, NPC win 150 / loss 50, PvP
  win 250 / loss 100, +300 for the day's first win, nothing for a PvP duel under 3 turns and 2 minutes, at most 5
  rewarded duels a day against the same account, and 25% after 40 rewarded duels a day. Each reward and purchase is
  an `[economia]` log line with the day's totals. Parity runs keep it off.
- **Starting MP is soulbound.** New-character and progression-reset grants track their promotional balance in
  `p.mp_wallet`; `rec.mp` remains the native protocol's total. The shop spends bound MP first. Any pack, deck or
  single-card unit paid partly with bound MP gives soulbound cards; earned-MP purchases stay tradeable. Ordinary
  accessories consume either balance; cosmetic boxes consume earned MP only. Cart rows are combined before allocation, and an unaffordable
  cart changes neither balance nor inventory. `GET /api/de/wallet` exposes total/bound/earned to the shop UI.
  Existing `mp_bound` balances migrate idempotently into the wallet, including archived characters.
  The ledger persists in D1 `state_extras` without a schema migration. Existing balances with no provenance ledger
  are grandfathered as unbound: daily economy totals cannot reliably separate earlier grants from earned savings.
- **Alt accounts can't feed a main** (owner, 2026-11-04: alts on VPN accounts moved 261 cards onto one main in four
  days, relayed through a second account). `p.earned.duels` counts the duels that paid MP (estimated once for older
  characters from their PvP games and NPC results). A character gives cards in a trade only from 20 rewarded duels
  (`TRADE_GIVE_MIN_DUELS`; receiving needs none), and an account takes in at most 30 net cards a day through trades
  (`TRADE_IN_DAY_MAX`; balanced swaps don't count). A one-off bind (`legacyBind`, `p.bind_v` 1) soul-binds the whole
  trunk of every character under 20 rewarded duels at its first load: cards its free grant bought before soul-bound MP
  were otherwise tradeable. Cosmetics in a trade obey the same rules: giving one needs the 20 rewarded duels too, and
  the cap counts one budget in card units (`trade-units.ts`: a card 1, a cosmetic copy 2/5/15/30 for Common/Rare/
  Super/Ultra, about what a copy costs out of the earned-MP boxes, an Ultra the whole day), so an equal-units swap of
  cards for cosmetics counts nothing. The legacy bind has no cosmetic side: only spare copies trade, and legacy PBIN
  ownership is never a copy. Each refusal has its own chat line. Every confirmed trade, done or refused, goes to D1
  `trade_log` (a mixed trade's lines in `a_cos` / `b_cos`, the report weighing them in card units); each game connection records the user's IP (an IPv6 /64), network and country in `login_ip` (90 days).
  A daily cron (04:17 UTC, `db/audit.ts`) flags relays (A → B → C within 2 h), one-way flows (20+ net cards at 4:1),
  accounts sharing an IP that trade, and repeated refusals, marks accounts seen only on hosting/VPN networks, keeps
  the report in R2 (`GET /__trade-report`, admin) and posts a summary to `REPORT_WEBHOOK` when set. It flags; a
  person decides.
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
- **The die and the coin are drawn on the card that tosses** (translator `toss_on_card`). The client draws them at
  (command player, zone). py sent the roller with the resolving chain link's zone, so an Archfiend rolling on the
  opponent's Megamorph showed its die over the opponent's empty S/T zone. The translator now uses the card a HINT_CARD
  right before the toss names (a continuous effect: Archfiends, Second Coin Toss), else the chain link, player and
  zone both. The py-parity replays turn it off.
- **No blank NPC gifts** (`persist.ts` `bitShown`). The client's item-get window (CCardPackCheckScene state 0x21)
  draws a page only for avatar parts, 挑戦権, recipes and titles (PBIN classes 1-3, 7, 8, 10). Any other bit gets an
  empty page. py put the 途中景品 GET済み flag (class 6) in every 5-win NPC prize, so each one showed a blank page. Yami
  Marik's (75-77) has no card, so his prize was nothing but a blank page. Such flags are now stored but left out of
  0x5205, and the client gets them with the next 0x3114. A prize with nothing left to show is no present (no 0x4237).
  `test/npc-rewards.test.ts` walks every NPC's prizes. No parity scenario reaches an NPC prize, so `parity/run.py`
  needs no mask.
- **Cosmetics come from boxes and player trades.** Outfit, Duel Disk and Hair Boxes cost 1500, 1000 and 500 earned
  MP. Starter MP cannot fund them. Outfits/disks have Common/Rare/Super/Ultra odds of 60/30/8/2%; hair uses
  60/30/10/0%. A Super-or-better arrives within ten openings; outfits/disks guarantee an Ultra within twenty.
  The UI discloses base and next-opening odds, including each item's probability. Server-side cryptographic rolls,
  per-account pity, monotonic opening tokens and persisted receipts prevent rerolls or duplicate payment on retries.
  The account wardrobe keeps its first unlock permanently; later copies can be traded through escrow with explicit
  recipient acceptance, or inside Card Swap with cards (below). Native PBIN ownership migrates without manufacturing tradable copies. Design families use
  verified native artwork identities, so all real body variants share ownership. New Outfit Box drops require both
  male and female artwork; school uniforms and one-body costumes stay outside the paid pool. Yugi/Téa also stay
  out: sharing an internal artwork index does not establish matching-body versions of the same named costume.
  Existing owners keep their items. There are no wear-location restrictions any more (owner, 2026-11-05): a character
  has one look for both worlds, and anything owned is worn in either.
  NPC chains retain card, title, recipe and other non-outfit rewards; future outfit rewards are retired.
- **Rank uniforms follow a PvP rating, not LV** (`game/ranking.ts`, after duelforge's `ranking.ts`/`glicko2.ts`
  and its world-protocol tier table). 2008 gated Ra Yellow at LV 10 and Obelisk Blue at LV 20. Now every finished
  ranked match is one Glicko-2 rating period: a single duel, or a Bo3 as a whole. Players start at 1500/350/0.06, the
  floor is 100, and they are placed after 5 rated results. Thresholds are duelforge's: Slifer Red below 1550, Ra
  Yellow from 1550, Obelisk Blue from 1850, Master from 2150 (it wears what Obelisk wears).
  - **Ranked = Autoduel only; rooms, invites and tournaments are unranked** (owner, 2026-11-04;
    `ranking.ts` `isRankedOrigin`). In Autoduel nobody chooses the opponent, so trading wins with a friend or an alt
    is much harder than in a room, a direct invite (the player card's Duel) or a tournament bracket. Every PvP match
    has an origin (`autoduel`, `room`, `invite`, `tournament`), given by the server code that made the pairing
    (`lobby.ts` `autoPair` and `challengeReply`, `tournaments.ts` `pair`, through `Matches.reserve`). No client
    message carries it, and an autoduel room cannot be challenged (−602). An unranked match leaves `p.rank`, the
    rank uniforms and graduation's qualifying wins alone. MP, XP/LV (with their own guards), the win/loss record,
    stats and card offers work as in any PvP match. The match's log lines say `ranked` or `unranked` and its origin.
  - **Autoduel pairs by rating** (`lobby.ts` `autoTryMatch`, `ranking.ts` `autoPick`). Among the block's searchers
    with a compatible duel style, it picks the closest rating first (ties: who searched longest). The rating window
    starts at ±150 (`AUTO_WINDOW_START`) and widens by 50 (`AUTO_WINDOW_STEP`) every 10 s searched
    (`AUTO_WINDOW_STEP_S`), up to ±400 (`AUTO_WINDOW_MAX`). The wider of the two players' windows counts, and a
    search is retried each time its window widens. An unplaced player counts as 1500 (its own RD still goes into
    the rating update). Never the same account. The pair that just played each other (either side's previous
    Autoduel opponent) only when nobody else fits. The Auto Duel window's own "Level Limit ON" (room `x[2]`) still
    keeps that player's opponents within 5 LV (`AUTODUEL_LV_DIFF`): the client offers it, so it is honoured.
  - A higher school also unlocks the lower uniforms, as duelforge's `unlockedUniforms` does.
  - Slifer Red is everyone's, unplaced Beginners included. It is the client's default Academy outfit: avatarValidate
    resets to it.
  - **Uniforms are kept for good** (owner, 2026-11-04). They follow `best`, the best school ever reached while
    placed, not the current one: a demotion takes nothing back and re-dresses nobody. The rating, school and division
    shown still go up and down; the school shown is demoted only 50 points below its threshold, so the badge does not
    flicker.
  - The "2" variants (Red/Yellow/Blue 2) follow the same schools and still have to be owned.
  - Both worlds: a ranked (Autoduel) match is rated wherever it was made, and the rank is the same in both. A
    character has one look for both worlds (owner, 2026-11-05), so the uniforms are worn in both. The rank gate on
    the dorm uniforms (Slifer Red for everyone; Ra Yellow and Obelisk Blue once reached) is the only rule on a look
    besides ownership and body.
  - Rating is per character slot (`p.rank`), not per account.
  - NPC duels, free mode (an autoduel there included), unranked PvP matches and server-restart voids are never
    rated.
  - Draws count 0.5.
  - Leaving costs the leaver rating: a surrender, a time-out, a disconnection past the grace period or leaving a
    Bo3. If the match was also short (under 3 turns and 2 minutes), only the leaver is rated.
  - After 5 rated results in one UTC day between the same two accounts, nothing more is rated that day.

  **Graduation** is a status only (owner, 2026-11-05). It used to let a graduate wear Domino outfits in the Academy;
  with one look for both worlds anyone may, so it unlocks nothing. It is a placeholder until a story lets players
  finish the GX story and graduate. Owner, 2026-11-04: "it needs to be wins but not abusable
  win trading with alts etc." A character graduates once it has **both** (`ranking.ts` "graduation", every number
  a named constant there):
  - **character LV 20** (`GRADUATION_LEVEL`): where the 2008 editor gave the last school's uniform. On the XP curve
    (cap LV 30) it is 40,000 score, about 1,000 PvP wins (any PvP match, ranked or not, gives XP). The LV XP is guarded like MP and the rating
    (`persist.ts` `xpBlocked`, per game, with `ECON`'s numbers):
    - a short game (under `PVP_MIN_TURNS` 3 turns and `PVP_MIN_S` 120 seconds: an instant surrender, disconnect or
      time-out) gives the winner, or a draw, nothing. The loser still takes its normal penalty (0 to -16, never a
      gain): leaving at once still costs, and costs only the leaver, as with the rating. A short game doesn't count
      toward the pair cap;
    - after `PAIR_DAY_MAX` (5) full-XP games in one UTC day against the same account, nobody gets XP from that pair
      that day (`p.xp_pairs`, per character: LV is a character's);
    - the same account on both sides gets no XP.
  - **25 distinct qualifying opponents** (`GRAD_OPPONENTS`). A qualifying win (`gradQualifies`) is a rated match
    win, so a ranked Autoduel win, never a room, invite or tournament one. The rating's guards hold (not the same
    account, at most `RATED_PAIR_DAY_MAX` 5 a day per pair), and the win isn't short. The opponent:
    - was placed before the match (`GRAD_OPP_MIN_GAMES` = 5 rated results);
    - has a DE account at least 7 days old (`GRAD_OPP_MIN_AGE_MS`). The age is better-auth's `user.createdAt` in D1,
      which the Worker reads with the session check at the game WebSocket upgrade (`auth/binding.ts`
      `CREATED_HEADER`). A game account claimed from 2008 counts from the DE user that claimed it. Unknown: no;
    - shares none of the winner's network tags. The Worker sends the WorldDO an HMAC-SHA-256 (keyed with
      `BETTER_AUTH_SECRET`, 16 hex) of the connection's IP bucket (`auth.ts` `ipBucketTag`: the IPv4 address, or
      the IPv6 /64), `IPB_HEADER`. Each login adds it to the session (`hub.ts` `Session.ipbs`, the last 8, in
      memory only). Unknown (the DEV parity bridge): no.
    At most 3 qualifying wins count per opponent, ever (`GRAD_WINS_PER_OPP`). A new opponent counts only from a
    network no counted opponent was on, so a ring of alts behind one IP is one opponent wherever the winner plays
    from. The record is `p.grad = { opp: {key: wins}, net: [key], n }` per character (`state_extras`, no
    migration). The keys are truncated SHA-256 of the account (12 hex) and of the network tag (8 hex): no account
    id, IP or reusable tag is stored. New opponents stop at 25, so the record stays small.

  Graduation is for good (`p.graduated = 1`, set by `gradUpdate` from `pvpXp` and from a counted win): LV can fall
  back with lost score. An admin-set LV no longer graduates anyone. On 2026-11-04 production had 152 characters, the
  highest LV 9, none at LV 20 and no `graduated` mark, so there were no graduates to carry over. It replaced a
  "top 1%" ladder.

  What this does **not** stop, and what could come next (not implemented):
  - Many alts, each on its own network (VPNs, mobile data), each at least 7 days old and placed with 5 rated
    games, each beaten up to 3 times. It costs 25 such accounts plus the main's ~1,000 guarded wins, but it is
    possible.
  - Account sharing or a bought/boosted account: the rules see accounts and networks, not people.
  - Real friends throwing games for each other on their own networks.
  - Legitimate opponents behind one carrier-grade NAT or household IP count as one network; such a player needs
    other opponents.
  Next steps could be: a minimum Discord account age, or a linked Discord account, for an opponent to count; requiring
  that an opponent's own rated games be against several other accounts (not only the winner, or a closed ring);
  weighting by the opponent's rating or RD; keeping a few network tags per account across sessions (today only the
  match's sessions are compared); and an admin report of the opponents behind each graduation.

  The record is `p.rank` per character, kept in D1 `state_extras` like `p.econ`, so it needs no migration. The
  server enforces the rank rule wherever a look is accepted: the wardrobe API, the native 0x4170 and character
  select. A look a player may not wear is not refused. A uniform of a school not reached is replaced by the slot's
  default, kept and shown that way, and the player's own client gets a 0x4181. As unlocks are for good, a look
  accepted once is never taken back. `/api/de/cosmetics` returns `rank`: rating, rd, games, wins, losses, draws, peak, placed,
  school, division, label, placementLeft, `bestSchool`, `uniforms` (unlocked by `bestSchool`), `graduated`,
  `graduationLevel` and `graduation: { level, levelRequired, opponents, opponentsRequired }` (progress). The 0x3114 bits tell the recompiled client the rank (`client/recomp/README.md`).
- **Every look change reaches everyone in the block** (`test/look-visibility.test.ts`). A character has one look for
  both worlds (owner, 2026-11-05; `persist.ts` `setLook`, `unifyLook`). The native 0x4170 (after the rank check),
  the wardrobe's equip and appearance edits, character select and a world switch all update the session's looks
  (`partsW` for both worlds, `parts`), the saved look in both copies (the duel, watch and log screens read it) and
  the other players: a 0x4181 for both worlds, since the client keeps every player's look per world and draws its
  own world's. The 2008 client never redraws a chibi already on screen from a 0x4181 (seen live 2026-11-04: the other
  player kept the old look until it left and came back), so a changed look in the world the player is in also goes
  to everyone in that world as a leave and a join (0x3112 op 0, op 1: new parts, same position and state;
  `Hub.redraw`), which the client draws anew. An unchanged 0x4170 (room entry) sends neither. A 0x3112 join carries
  the joiner's look for the receiver's world, as LIST2 does: one block lists both worlds' areas, and the client files
  the parts under its own world.
- **Afro I, II and III are one item, Afro** (owner, 2026-11-04): three sizes of one design, so they read as one
  hairstyle in-game. Afro IV (with horns) stays its own item. Afro is common. It equips Afro I's row (male 10,
  female 5) and owns all six rows, so a saved look with any size still validates. The ledger migrates once
  (`merged: 1`): the old ids' ownership, copies, receipts and offer lines become Afro's and add up. Owning two or
  three sizes was owning that many items, so each one past the first becomes a tradable copy. Legacy PBIN bits count
  as ownership only, as before. In production on 2026-11-04 no ledger held an Afro and one character had the Afro I
  bit.
- **Card Swap trades cosmetics too, in the same trade** (`trade.ts`, `game/trade-cosmetics.ts`, the htmlui's
  `cosmetics/trade-cosmetics.js`). Each side's spare copies (at most 6 items) are lines on the in-memory trade session,
  set through `POST /api/de/trade/cosmetics {give}`; the server finds the trade from the caller's game session. Nothing
  is escrowed: a cancel, a disconnect or a restart has nothing to give back, and the commit checks every line again. The
  commit writes both accounts' cards, cosmetics and intake counters in one store commit; any refusal moves nothing. The
  2008 client draws only cards, so the HTML panel registers itself per trade (`/panel`); lines need both registered,
  and a commit with lines while either is not is refused. Like cards, lines lock once one side pressed Ready; at the
  final question (0x7118) a change withdraws it, as a No does: both votes and lamps reset, 0x7120 2 to both, and a vote
  counts only for the question asked (a late answer to a withdrawn one is dropped).
- **The HTML shop uses authenticated game APIs.** `/api/de/shop` lists the native catalogue and buys through the
  same validated purchase path, with persisted retry tokens. `/api/de/cosmetics` handles boxes, wardrobe, appearance
  and duplicate trades. The Worker verifies the session and mutation Origin; the WorldDO serializes mutations and
  waits for D1 before acknowledging purchases. Appearance edits update the one look (both world copies) and native client
  caches. The menu provides Appearance and Cosmetic Boxes shortcuts in both UI modes.
- **Chat is server-wide.** Global and Trade work in rooms and across lobby areas. Whisper and Team recipients are
  enforced server-side, including ignores and account restrictions. Proximity chat is removed. The HTML chat uses
  a bounded in-memory stream and adds short-lived public speech bubbles anchored to actual character name labels;
  private channels never produce public bubbles. It does not persist or write chat polling to D1.
- **Cards have a visible trading rarity.** `/api/de/card-rarities` supplies N/R/SR/UR design classifications seeded
  from the owner's DuelForge catalogue, with explicit source/version metadata in `data/card-rarities.json`.
  These labels are not historical printing grades and do not alter pack drop probabilities. Tokens and unknown
  cards remain unclassified. Collection, deck, detail and trade views map native IDs and passcodes explicitly.

## Not ported

The launcher, Frida, the 5799 Python console, hot reload (`hot.py`, `recarga.py`, `hot_*`), the profile/flag
registry, the SQLite event chain (D1 plus Time Travel replaces it), Boxedwine room/UDP peering in the gateway (the
recomp client does not use it), and research that is not on the runtime path.
