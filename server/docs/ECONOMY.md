# The MP economy: data, findings and prices (2026-11-04)

A read-only study of production as of **2026-11-04 10:24Z**. Production was running live version 4424274d
(`origin/t3/prepare-cosmetics-release`, deployed 2026-11-03 23:35Z). The machine-readable proposal is
[`economy-prices.json`](economy-prices.json). The numbers come from `server/scripts/economy/` (see the
[Reproduce](#10-reproduce) section). This file holds aggregates only: no account ids, names or per-player rows.

## 1. Summary

- **Population.** 141 users and 112 player accounts (staff excluded). Activity: 98 accounts seen in the last 7 days,
  57 in the last 3 days, 25 in the last 24 hours. Only **40 accounts have actually played** (a duel or a purchase) in
  the last 7 days, and 28 in the last 3 days. Of those, 10 have 10 or more duels and 3 have 50 or more. The economy
  has existed for only 6.6 days (it went live 2026-10-28 20:46Z).
- **Faucet.** On a day with duels, the median player earns **525 MP** (p25 100, p75 1,110, p90 1,975; n = 44 measured
  account-days). The median duel day has 2 duels; the mean is 159 MP per duel. The first-win bonus is 20% of all MP
  earned. NPCs pay about 81% of earned MP, and only 2 account-days reached the 40-duel soft cap.
- **Sinks.** Players spend **2.2x what they earn**. They are drawing down the 5,000 MP starting grant on packs: the
  median spending day is 3,100 MP and about 7 pack units. Cosmetic boxes had been live for 11 hours at the snapshot,
  and **one box** had been opened. No admin price overrides are set (`shop_prices` and `admin_start` are empty).
- **Balances.** Per active account: median **1,675 MP**, p25 150, p75 5,110, p90 6,170, max 21,800. Only 2 accounts
  hold more than 10,000 MP. The top 10% hold 40% of the active supply. **No hoarding and no inflation:** the money
  supply is 71% of all grants ever issued, and 11% of the supply is spent each day.
- **Boxes.** The duel disk box is a wall. On the deployed catalog with the post-change pools, completing it costs
  **about 159,000 MP (about 300 median play days)**. On the reworked catalog in progress (7 ultras at 1%), it costs
  **about 313,000 MP (about 600 days)**. The cause is duplicates: 83-91% of disk boxes are duplicates, and changing
  odds and pity alone barely helps. **Drawing from the unowned items of the rolled tier** brings the disk box to
  about 50,000 MP.
- **Proposal.** Keep every card price. Keep the head & hair box at 500 and the duel disk box at 1,000. Cut the outfit
  box from 1,500 to **1,200**.
  - Use one odds and pity rule for every box: **55 / 30 / 11 / 4**, super-or-better every **8** boxes, ultra every
    **15** (the live boxes use 60 / 30 / 8 / 2 with 10 / 20; the reworked catalog uses 79 / 15 / 5 / 1).
  - Add **per-tier duplicate protection**.
  - Cap the disk box at **4 ultras** (the Gold colourways).
  - The full wardrobe then costs about **72,000 MP** (about 137 median play days, 65 at p75). The live boxes cost
    about 198,000 MP and the reworked placeholders about 368,000 MP.

| Purchasable | Current | Proposed | Median play days per purchase (525 MP/day) |
|---|---|---|---|
| Booster pack (48 sets, 5 random cards) | 200 | 200 | 0.38 |
| Beginner pack 1001-1003 | 100 | 100 | 0.19 |
| Structure deck 7001-8006 (9, 40-45 cards) | 1,000 | 1,000 | 1.9 |
| Single card (46) | 100 flat | N 100 / R 200 / SR 400 / UR 800 (optional, low priority) | 0.19-1.5 |
| Face mark / glasses, native shop (13) | 200 / 500 / 1,500 | withdrawn; the 3 two-body glasses move into the head & hair box | - |
| Hair box, becoming the Head & Hair box | 500 | 500 | 0.95 |
| Duel Disk box | 1,000 | 1,000 | 1.9 |
| Outfit box | 1,500 | **1,200** | 2.3 |
| Box odds c/r/s/u, super / ultra pity | 60/30/8/2 (hair 60/30/10/0), 10 / 20 | **55/30/11/4, 8 / 15**; empty tiers renormalise | - |
| Box duplicates | uniform within the tier, tradeable copy | **unowned items of the tier first**, then a tradeable copy | - |

## 2. Data and methodology

**Where the state lives.** The WorldDO keeps `state.json` in memory and projects it onto D1 (`src/db/project.ts`,
`src/db/game-schema.ts`). Everything below comes from D1 `duel-evolution-prod`, using SELECT statements only:

- `characters`: `rec.mp` (the total balance) and the record counters (duels, duels_won/lost/drawn, `pvp_n`).
- `state_extras`: JSON keys the tables do not model.
  - `mp_wallet` `{version: 1, bound}`, the soul-bound part of `rec.mp`.
  - The legacy `mp_bound`.
  - `econ`, the character's day counters `{day, duels, wins, earned, spent, packs, pairs}`.
  - `bound`, soul-bound card copies.
  - `starter`, the free structure deck that was claimed.
  - Per account: `cosmetics` (the wardrobe ledger: owned, copies, pity, receipts) and `shop_api` (HTML shop receipts).
- `npc_progress`: NPC wins, losses and draws per character (NPCBIN). Also `trunk_cards`, `titles` (PBIN bits),
  `deck_history`, `user_decks`, and better-auth `user` and `session`.
- The R2 `private/state.json` mentioned in DEPLOY.md is the import source of the pre-D1 state. It is not the live
  state, so it was not read.

**Activity.** No last-login column exists. An account's "seen" days are the union of these timestamps: session
creation or refresh, the `econ` day, `deck_history` first and last duel, the `user_decks` sync and the last PvP. That
is a **lower bound** on the days the account was active.

- *Seen (N days)* means any trace in the last N days.
- **Active** means seen in the last 7 days *and* has played, that is, has at least one duel or has spent MP. Seven
  days covers the whole history of the economy. I use the 3-day figure as the "current core".
- Excluded: the staff account (`role_grant`) and the GM account. 14 accounts were imported from the 2008/py era. Their
  records predate the economy, so they are dropped from the lifetime earnings model; they stay in the population and
  balance figures.

**Measuring MP per day.** No historical telemetry is available:

- Workers Logs holds the `[economia]` lines (one per reward and per purchase), but the deploy token has no Workers
  Observability access.
- `wrangler tail` is live only.
- `p.econ` keeps only each character's latest UTC day.

So two estimates are used:

1. **Measured (primary).** For each account, take its latest `econ` day, summed over its characters. That gives 48
   complete account-days (2026-10-29 to 11-03), 44 of them with duels; today's partial days are excluded. The ECON
   rules are applied exactly as the server applies them.
2. **Lifetime model (cross-check, upper bound).** ECON rates applied to each account's record since launch:
   150 per NPC win, 50 per NPC loss or draw, 250 per PvP win, 100 per PvP loss, and 300 for each seen day with a win.
   It ignores the short-duel, pair-cap and soft-cap guards and divides by the lower-bound active days, so it reads
   high. Result: median **700 MP per active day** (p25 340, p75 1,640, p90 3,550), and 455 MP per calendar day since
   signup.

**Benchmark used for pricing:** a *median play day* is **525 MP** and a *regular (p75) day* is **1,100 MP**.

## 3. Population (2026-11-04)

| | count |
|---|---|
| users (better-auth) | 141 |
| game accounts analysed (staff/GM excluded) | 112 (14 imported 2008 accounts) |
| live / archived characters | 136 / 9 |
| live characters per account | 100 have 1, 6 have 2, 2 have 3, 4 have 4 |
| seen last 24 h / 3 d / 7 d | 25 / 57 / 98 |
| **active**: played and seen last 7 d / 3 d | **40 / 28** |
| accounts with ≥1 / ≥10 / ≥50 duels | 31 / 10 / 3 |
| signups per day, 10-28 to 11-04 | 26, 28, 18, 23, 29, 10, 5, 2 |
| seen days per active account | median 2, p90 4, max 7 |

Signups are slowing down: 5 on 11-03 and 2 so far on 11-04. Most signups never duel. Each figure below stands on
roughly 30 to 45 players.

## 4. Faucets

All rules are in `persist.ts` ECON and have been unchanged since 2026-10-28 20:46Z:

| Source | Rate | Notes |
|---|---|---|
| Starting grant | 5,000 per character, for the account's first 6 (4 slots + 2 remakes) | Soul-bound (`mp_wallet.bound`) since 2026-11-02, for new characters only |
| NPC duel | win 150, loss or draw 50 | nothing if the player surrenders before turn 3 |
| PvP duel | win 250, loss 100 | nothing if under 3 turns *and* under 120 s; 5 rewarded duels a day per opponent account |
| First win of the UTC day | +300 | per account (shared by its characters) |
| Soft cap | ×0.25 after 40 rewarded duels a day | per account |
| Admin `set_wallet` | any amount | not used for this study |

There are no other faucets. Card trades and cosmetic trades move no MP, and NPC or PvP prize cards are cards, not MP.

| Measured, per account-day with duels (n = 44) | p25 | median | p75 | p90 | mean |
|---|---|---|---|---|---|
| MP earned | 100 | **525** | 1,110 | 1,975 | 1,015 |
| duels | 1 | 2 | 6 | 15 | 6.4 |

- Win rate on those days: 63%. MP per duel, with the first-win bonus included: 159.
- Split of the modelled MP since launch: NPC 81%, PvP 8%, first-win bonus 10%. PvP is 27% of duels but pays little,
  because many PvP duels are losses or end early.
- The economy as a whole earns about **23,000 MP per day** (lifetime model: 152,500 MP over 6.6 days). The busiest
  measured day, 11-03, was about 30,500 MP.
- The ECON comment's design goal, "a booster per about 1.3 NPC wins, about a pack per 10 minutes", matches the
  per-duel figure. Duel lengths are not stored, so the per-hour rate is not measured.

## 5. Sinks

The only places MP leaves the economy are `shop.ts` `shopBuy` (the native shop, plus the HTML shop through
`shop-api.ts`, which uses the same path) and `cosmetics.ts` `cosmeticOpen`. The live catalogue, from `shopCatalog`
with no admin overrides:

| Item | n | Price | Contents |
|---|---|---|---|
| Booster (`sobre`; packs 1-45 and 46-48) | 48 | 200 | 5 cards drawn uniformly from the pack's 44-60-card pool. Overall pool mix: 66% N, 24% R, 7% SR, 3% UR. |
| Beginner (`principiante`; 1001-1003) | 3 | 100 | 5 cards from a pool of about 150 |
| Structure deck (`estructura`; 7001, 7003, 7005, 8001-8006) | 9 | 1,000 | a fixed 40-45-card list plus its recipe right. One is free per character (`starter`). |
| Single card (`carta`) | 46 | 100 | mostly 2008 basics: 31 N, 9 R, 5 SR, 1 UR |
| Avatar item, slot 2 face mark | 1 | 200 | AVATAR_PRICES |
| Avatar item, slot 9 glasses | 10 + 2 | 500, or 1,500 for the ×3 "present" design | |
| Hair box | - | 500 | spends earned MP only |
| Duel Disk box | - | 1,000 | spends earned MP only |
| Outfit box | - | 1,500 | spends earned MP only |

Hair (slot 1), outfits (slot 6), back hair (slot 7) and disks (slot 8) are no longer sold directly. They come from
boxes. A change in progress in this worktree also withdraws slots 2 and 9 from the shop.

| Measured, per account-day with spending (n = 24) | p25 | median | p75 | p90 |
|---|---|---|---|---|
| MP spent | 900 | **3,100** | 5,000 | 8,640 |
| pack units bought (boosters + beginner + structure) | 2 | 7 | 18 | 30 |

- Spending on measured days was **2.26x** what was earned.
- Over the economy's life, new accounts spent about 334,500 MP against 152,500 MP earned: about 2.2x, the difference
  being the grant.
- Cards are the real sink so far. Active accounts hold a median of 198 card copies (p90 707), and their best
  character holds a median of 126 distinct cards.
- 5 avatar shop items are owned. One cosmetic box had been opened, and no box duplicates are held.

## 6. Balances, velocity and inflation

| MP balance | p10 | p25 | median | p75 | p90 | max |
|---|---|---|---|---|---|---|
| per live character (n = 134) | 50 | 2,325 | 5,000 | 5,000 | 5,405 | 6,750 |
| per active account (n = 40) | 0 | 150 | **1,675** | 5,110 | 6,170 | 21,800 |

- **The total supply is about 518,000 MP.** 67 characters (335,000 MP) are untouched 5,000 grants, mostly on dormant
  signups. Only 35,000 MP is tracked as soul-bound: the wallet ledger is new, and older characters have none.
- **Flow since launch (new accounts):** 630,000 MP granted and about 152,500 earned (model), against about 334,500
  spent; 448,000 MP remains.
  - The supply has fallen to **0.71x of all grants**.
  - Velocity is **0.11 of the supply spent per day**.
  - **Nothing is inflating.** The economy is still burning its starting grants on cards. Median active balances are
    already down to 1,675 MP, so spending will soon be limited by income (about 525 MP per day for the median
    player).
- **Hoarding:** none yet. Only 2 accounts hold more than 10,000 MP, and the top 10% of active accounts hold 40%.
- **Soul-bound gap.** `mpBalances` treats a character with no `mp_wallet` and no `mp_bound` as all earned. When a
  ledger is created later, it starts with `bound` 0. So every character from before 2026-11-02 can spend its starting
  grant on cosmetic boxes, against the intent of the 11-02 soul-bound rule.
  - 106 live characters (453,000 MP) have no ledger at all.
  - Every active account's whole balance is currently box-eligible.
  - The provably safe subset is characters with **`rec.duels == 0`, nothing tracked as bound, and 0 < `mp` ≤ 5,000**.
    They cannot have earned anything: **69 characters holding 330,750 MP**, on 64 accounts. 11 of those accounts are
    active, and 4 accounts have two or more such characters.
  - Recommendation: a one-off migration that sets `mp_wallet.bound = mp` on that subset. This is the owner's call; the
    11-02 decision was "going forward only".

## 7. Box maths

**Mechanics (`cosmetics.ts`):**

- One roll per box, with integer weights.
- Super pity: after `superAt − 1` misses, the roll is super or ultra, split by their weights.
- Ultra pity: after `ultraAt − 1` misses, ultra is guaranteed.
- Pity is per account and per box.
- The item is drawn uniformly within the tier, so a **duplicate becomes a tradeable copy, with no refund or dust**.
- Boxes spend earned MP only.
- In the reworked catalog, rarities with no item in the pool drop out and the remaining weights renormalise, and
  ultra pity only applies when the pool has an ultra. `boxes.ts` follows these semantics, which are identical to the
  deployed ones whenever every weighted tier has items.

**Pools after the change.** Two views:

- **Reworked catalog.** This is the `cosmetics-catalog.ts` rework in progress in this worktree, snapshot taken
  2026-11-04 about 10:50Z. Its header says its prices are placeholders pending this document. It already implements
  the change: only designs with both bodies can drop, there are no Duel Academy (`ac_*`) outfits, and the hair box
  becomes a "head" box of hair plus accessories. It also re-tiers outfits and disks after duelforge.
- **Deployed catalog.** These are my own projection rules, applied to the deployed rarities (`boxes.ts`
  `projectedPool`). They serve as a cross-check.

| Box | Reworked catalog: pool (c / r / s / u) | Deployed catalog, projected |
|---|---|---|
| Head & Hair | **7** (3 / 2 / 1 / 1): Afro I-IV (c, c, r, s); Green Specs (c), Sunglasses (r), Bakura's Eyepatch (u) | 7 (3 / 2 / 2 / 0). The glasses rarities were *assumed* from their 2008 price, with Bakura's Eyepatch as super. |
| Duel Disk | **27** (11 / 6 / 3 / **7**). All 4 Battle City Alpha colourways plus the 3 other Golds are ultra. | 27 (8 / 11 / 4 / 4) |
| Outfit | **6** (4 / 0 / 1 / 1): Street I-III and Black Suit (c), Qualifier's Robe (s), Marik's Costume (u) | 6 (3 / 1 / 1 / 1) |

Excluded for having only one body: Quiff I-III, Bald, Ponytail, Plaster (slot 2), the 6 one-body glasses,
Kaiba, Joey, the fitted-duelist (Yugi/Tea) design, and every `ac_*` costume. Every disk has both bodies, but 12 equip
only in Domino and 15 only in Academy (`worlds`). A player who only uses one world therefore cannot wear about half of
the disk drops there.
(Superseded on 2026-11-05: a character has one look for both worlds and every item is worn in either, so every disk
drop is wearable everywhere; see `WORLDS.md` section 5.)
(Since then single-body items drop for both bodies too, and on 2026-11-05 Shaved Hair became **Bald**, Rare, and
Bakura's Garms **Bakura's Eyepatch**: the live pool and its odds are `cosmetics-catalog.ts`'s, disclosed in the shop.)

**Expected cost.** Seeded Monte Carlo, 40,000 runs per row. "Days" uses the 525 MP median play day and the 1,100 MP
p75 day. "Prot." means duplicate protection: the item is drawn among the rolled tier's **unowned** items while any
remain, and otherwise as today (a tradeable copy).

Reworked catalog (the pools that will ship):

| Box, scenario | Price | 1st ultra (boxes) | Boxes to complete, mean (p90) | MP to complete | MP per new item | Duplicates | Median / p75 days |
|---|---|---|---|---|---|---|---|
| Head, catalog placeholder (79/15/5/1, super pity 10, **no ultra pity**) | 500 | 46.3 | 51.8 (103) | 25,900 | 3,700 | 87% | 49 / 24 |
| Head, proposed | 500 | 10.9 | 16.7 (24) | 8,350 | 1,190 | 58% | 16 / 8 |
| **Head, proposed + prot.** | 500 | 10.9 | **13.6 (16)** | **6,790** | **970** | 48% | **13 / 6** |
| Disk, catalog placeholder (79/15/5/1, 10 / 20) | 1,000 | 17.2 | 313.5 (482) | 313,500 | 11,610 | 91% | 597 / 285 |
| Disk, proposed | 1,000 | 10.9 | 198.2 (306) | 198,200 | 7,340 | 86% | 377 / 180 |
| Disk, proposed + prot. (7 ultras) | 1,000 | 10.9 | 76.1 (92) | 76,100 | 2,820 | 65% | 145 / 69 |
| **Disk, proposed + prot., Golds-only ultra (11 / 6 / 6 / 4)** | 1,000 | 10.9 | **50.8 (61)** | **50,800** | **1,880** | 47% | **97 / 46** |
| Outfit, catalog placeholder (79/15/5/1, 10 / 20) | 1,500 | 17.0 | 18.9 (20) | 28,340 | 4,720 | 68% | 54 / 26 |
| Outfit, proposed | 1,200 | 9.9 | 14.1 (19) | 16,960 | 2,830 | 58% | 32 / 15 |
| **Outfit, proposed + prot.** | 1,200 | 9.9 | **11.8 (15)** | **14,150** | **2,360** | 49% | **27 / 13** |

Deployed catalog, projected pools (cross-check):

| Box, scenario | Price | 1st ultra | Boxes to complete, mean (p90) | MP to complete | MP per new item | Duplicates | Median / p75 days |
|---|---|---|---|---|---|---|---|
| Hair, live box (60/30/10/0, 10) | 500 | - | 22.0 (35) | 10,990 | 1,570 | 68% | 21 / 10 |
| **Head & Hair, proposed + prot.** | 500 | - | **12.1 (16)** | **6,050** | **865** | 42% | **12 / 6** |
| Disk, live box (60/30/8/2, 10 / 20) | 1,000 | 15.8 | 159.2 (234) | 159,160 | 5,895 | 83% | 303 / 145 |
| Disk, proposed | 1,000 | 10.9 | 136.4 (199) | 136,430 | 5,050 | 80% | 260 / 124 |
| **Disk, proposed + prot.** | 1,000 | 10.9 | **48.6 (59)** | **48,600** | **1,800** | 44% | **93 / 44** |
| Outfit, live box | 1,500 | 15.8 | 18.3 (20) | 27,410 | 4,570 | 67% | 52 / 25 |
| **Outfit, proposed + prot.** | 1,200 | 10.9 | **13.1 (15)** | **15,720** | **2,620** | 54% | **30 / 14** |

**Reading the results.**

- **Duplicates, not price, are why the duel disk box is a wall.**
  - With N ultras drawn at random, a full set needs about N·H(N) ultra rolls: 8.3 rolls for 4 ultras, 18.2 for 7.
    With an ultra every 11-17 boxes, the ultras alone take 100-300 boxes.
  - In the sweep (`ECON_SWEEP=1`), every odds and pity combination without protection needs 128-314 boxes to
    complete the disk box. With protection, the same combinations need 43-120.
  - Protection is a one-line filter in `cosmeticOpen`: draw from
    `matches.filter((i) => !l.owned.includes(i.id))` when that list is non-empty.
- **Seven ultra disks** still cost 76 boxes even with protection, because every one of them waits on the ultra
  pity.
  - Golds-only ultra (Battle City Alpha, Alpha Silver and Alpha Black move to super) costs 51 boxes. It keeps the
    four Gold colourways as the chase items. Duelforge also makes the whole Alpha (Skywing) silhouette legendary,
    but it backs that up with shard picks.
  - If the seven ultras are kept, use `ultraAt 10` for the disk box instead (57.7 boxes).
- **The head box needs ultra pity once it has an ultra.** Bakura's Eyepatch at 1% with no ultra pity takes 46 boxes
  (23,000 MP) on average, and the p90 to complete the box is 103 boxes.
- **Outfits:** the single ultra gates the whole pool. Ultra pity at 15 with a 4% weight puts the first ultra at about
  10-11 boxes, instead of 17, and caps it at 15.
- **Avoid `superAt == ultraAt`.** With 10 and 10, the outfit p90 rises to 31-42 boxes, because the two pity counters
  collide.
- **Compared with buying directly at 2008 prices** (`AVATAR_PRICES`: hair 300, glasses 500 or 1,500, outfit 1,000 or
  3,000, disk 1,500), the protected boxes cost a 1.2-1.8x gacha premium:
  - Head & hair: 3,700 direct vs 6,050-6,790.
  - Disks: 40,500 direct vs 48,600-50,800.
  - Outfits: 10,000 direct vs 14,150-15,720.
  - Without protection, the premium is 1.7-4.9x, worst for the disk box.
- **If protection is not adopted:** use the proposed odds and pity anyway, and consider a disk box per world (Domino
  12, Academy 15). That halves the pool and also fixes the unwearable-drop problem. (Moot since 2026-11-05: no world
  rule, every disk is worn in both worlds.)

## 8. Recommendations

1. **Box prices:** Head & Hair **500** (unchanged; about one median play day per box), Duel Disk **1,000**
   (unchanged; 1.9 days), Outfit **1,200** (from 1,500; 2.3 days).
   - On the reworked pools, with protection and Golds-only ultras, the full wardrobe is about **71,700 MP**. That is
     about 137 median days, or 65 days for a regular player, which makes boxes a sink that lasts a season.
   - The first half of every pool comes quickly: about 550, 1,000 and 1,240 MP per new item respectively.
   - Prices are not raised, because balances are thin: the median active account has 1,675 MP, and boxes compete with
     packs.
2. **One odds and pity rule for every box:** common 55, rare 30, super 11, ultra 4, with `superAt 8` and
   `ultraAt 15`. Empty tiers renormalise away, as the reworked `boxWeights` does, and ultra pity applies only when the
   pool has an ultra.
   - Effective long-run rates are about 50 / 27 / 14 / 9.
   - This replaces 79 / 15 / 5 / 1. That placeholder (duelforge's flat odds) suits a pool of hundreds with a
     shard-pick backstop, not pools of 6-27 with none.
3. **Per-tier duplicate protection** (§7). This is the single most important change.
4. **Disk rarities:** at most 4 ultras, the Gold colourways; Battle City Alpha, Alpha Silver and Alpha Black become
   super. If seven are kept, set the disk box to `ultraAt 10`.
5. **Cards: unchanged.** Booster 200, beginner 100, structure deck 1,000.
   - The 2008 prices still fit the faucet: a median player buys 2.6 boosters a day once the grant is gone.
   - Structure decks are the best value per card (about 25 MP per card, against 40 for a booster) and are capped by
     their fixed lists.
   - Optional, low priority: price singles by `card-rarity.ts`, at N 100, R 200, SR 400, UR 800. Today one SR single
     costs as much as an N, while any *specific* card from boosters costs about 2,200 MP (5 draws from a pool of about
     55 cards). This needs a code change, because `carta` is a single admin key.
6. **Avatar shop items:** withdraw the face mark and glasses from the native shop, as the change in progress does.
   The glasses designs that exist for both bodies are in the head box. Single-body rows stay owned where already
   granted, but are no longer sold.
7. **Faucets: unchanged.** Earning is moderate (median 525 per duel day), the soft cap almost never binds, and the
   first-win bonus does its job (20% of earnings).
8. **Soul-bound gap:** the one-off migration for unearned pre-11-02 grants described in §6 (owner decision).
9. **Telemetry:**
   - Grant Workers Observability read access, or persist a per-day MP history (for example a small `econ_days` table,
     or keeping the last 14 `econ` days), so the next review can measure faucet and sink time series instead of one
     day per account.
   - The `[economia]` box line already logs the tier. Add the pool size and the pity counters, so first-ultra intervals
     can be checked against §7.

## 9. Reference: duelforge

The read-only clone at `/tmp/ref/duelforge`: `packs.ts`, `world-protocol` and `gachaCheck.ts`.

| | duelforge | Duel Evolution (proposed) |
|---|---|---|
| pack | 100 DP, 9 cards; UR pity at 20 packs | 200 MP, 5 cards; no pity |
| duel income | NPC win 100 DP; 1,500 DP a day cap then 10 per duel; login streak 200 to 1,000 DP a day | NPC win 150 / loss 50, PvP 250 / 100, first win +300, ×0.25 after 40 duels |
| box price | 600 DP (6 packs) | 500 / 1,000 / 1,200 (2.5 / 5 / 6 boosters) |
| odds | flat 79 / 15 / 5 / 1 | 55 / 30 / 11 / 4 with pity 8 / 15 (empty tiers renormalise) |
| duplicates | tradeable copy plus shards (N 1, R 5, SR 60, UR 200); spend shards to pick any unowned item (50 / 150 / 600 / 2,500) | tradeable copy; proposed per-tier protection |

Duelforge prices boxes at about 6 packs, and its hard guarantee is the shard pick rather than odds pity. Measured in
packs, the proposal matches it. Our pools are much smaller and we have no crafting currency, so odds pity plus
duplicate protection does the job of the shard pick. Adding a shard-style "spark" is the alternative if you want the
trade value of duplicates to stay high.

## 10. Reproduce

```sh
cd server
scripts/economy/dump.sh /tmp/econ-raw              # read-only SELECTs against duel-evolution-prod -> raw JSON (never commit)
python3 -I scripts/economy/analyze.py /tmp/econ-raw   # aggregates -> stdout and /tmp/econ-raw/aggregates.json
# box maths against the working tree's catalog (either generation) -> /tmp/econ-raw/boxes.json
node_modules/.pnpm/node_modules/.bin/vite-node scripts/economy/boxes.ts
ECON_SWEEP=1 node_modules/.pnpm/node_modules/.bin/vite-node scripts/economy/boxes.ts   # plus the odds/pity grid
# the deployed catalog: a `git archive` of the deployed commit, with the built gamedata/ and node_modules beside it
mkdir -p /tmp/econ-head && git archive HEAD src | tar -x -C /tmp/econ-head && cp -r gamedata /tmp/econ-head/ \
  && ln -sfn "$PWD/node_modules" /tmp/econ-head/node_modules
ECON_SRC=/tmp/econ-head/src ECON_OUT=/tmp/econ-raw/boxes-deployed.json node_modules/.pnpm/node_modules/.bin/vite-node scripts/economy/boxes.ts
```

The "deployed catalog" figures used `HEAD` (5d9295a, `origin/t3/prepare-cosmetics-release`, which is what version 4424274d runs). The "reworked catalog"
figures used a copy of the working tree's `src/` taken 2026-11-04 about 10:50Z, while the rework was in progress.
Re-run against the final catalog before shipping.

## 11. Caveats

- **Small, young sample.** The economy is 6.6 days old. There are about 40 active players and 31 with duels, and each
  account has one measured day. Quantiles move by ±30% with a handful of players. The 2.2x spend ratio is a launch
  effect of the grant, not a steady state. Re-run this after 2-4 weeks.
- **Box demand is unknown:** one box had been opened, 11 hours after launch. The box figures are model results, not
  observed behaviour.
- **Activity is a lower bound** (§2). The lifetime model reads high, because it ignores the reward guards and uses
  lower-bound active days. The measured `econ` day is the primary figure.
- **The pools are moving targets.** The reworked catalog was mid-edit at the snapshot, and the deployed-catalog
  projection rests on assumed accessory rarities. Completion cost is driven mostly by the **number of ultras** and by
  the duplicate rule, and less by the pool size. Re-run `boxes.ts` against the final catalog.
- No historical `[economia]` logs could be read (no Observability scope on the token), so per-hour earnings and duel
  durations are not measured.

## 12. Applied in this branch (2026-11-04)

`src/game/cosmetics-catalog.ts` `BOX_ECONOMY` carries §8's prices, odds and pity, with these owner decisions:

- **No duplicate protection (§8.3 is not applied), to encourage trading.** Pity guarantees a rarity, never a new
  item: the design is drawn from the whole tier, owned or not. Every duplicate is a tradable copy.
- The disk box keeps duelforge's seven ultra disks, so it takes §8.4's fallback, `ultraAt 10`.
- **Pools no longer depend on the player's body.** A male and a female variant are one item only when they are the
  same design. Mismatched pairs were split: the tracksuits and punk outfits, and Yami Yugi's and Téa's garms.
  Single-body items (Kaiba, Joey, the quiffs, the ponytail, single-body glasses) drop for everyone, carrying a
  "female/male version in progress" notice. Duel Academy outfits stay out of every box.

| Box | Price | Weights | superAt | ultraAt | Pool (c/r/s/u) | Single-body | Boxes to complete alone (mean, p90) | MP to complete alone |
|---|---|---|---|---|---|---|---|---|
| Head & Hair Accessory | 500 | 55/30/11/4 | 8 | 15 | 12/4/2/1 | 12 | 75, 111 | ~37,700 |
| Duel Disk | 1,000 | 55/30/11/4 | 8 | 10 | 8/6/6/7 | 0 | 166, 245 | ~165,600 |
| Outfit | 1,200 | 55/30/11/4 | 8 | 15 | 6/2/2/3 | 10 | 62, 99 | ~74,800 |

"Alone" assumes a player never trades: about 278,000 MP for everything, or about 530 median duel days. Trading
duplicates is meant to close the gap, and so is not needing the other body's single-body items. With 13 outfits
the outfit box no longer needs the price rise considered for its 6-item pool, so it stays at 1,200. Re-measure once
trades happen: if few duplicates change hands, cut the disk box's price before adding duplicate protection. Not
applied (owner decisions): rarity-priced single cards (§8.5) and the soul-bound migration for pre-11-02 grants (§6).
Packs and faucets are unchanged.
