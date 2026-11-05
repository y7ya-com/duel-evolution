# Shop meta rotation

Editable source: `server/data/shop-rotation.json`. Epoch: 2026-11-05 00:00 UTC (launch day). Updates last 14 days. Highlights last one update; two filler entrants last 28 days, overlapping the previous two. The 18 themes open with a combined 2008 showcase and Lightsworn, then interleave earlier and later engines for variety. All 34 rotating boosters get at least one filler turn every 252 days; support packs 43/44 receive two turns. Classics 1–14, Beginners and structure decks stay available. Highlights can include Classics (still permanently available) or overlap a filler (the later sale deadline wins). This gives four fillers plus up to three highlights, with duplicates reducing the total. Force overrides can change the count.

Core lists use the UR/SR format/deck groupings in `card-rarities.md` and the exact passcodes in `card-rarity-picks.json`; local `gamedata/ydc.json` supplies deck context. These are curated engine cores, not complete legal tournament lists. Dark Armed Return is used instead of promising Tele-DAD: Emergency Teleport, Krebons and Synchros are absent, as documented in the rarity guide. Cat Toolbox likewise describes only the available engine.

Highlights are reproducible greedy set coverage: count every core card in each booster 1–48, take the largest marginal coverage, remove covered cards, repeat up to each theme’s `highlightCount` (bounded by `highlightLimit`); real-set boosters win ties, then lower IDs. A second pack with no new coverage is omitted. The coverage table includes every booster with a nonzero match; unlisted boosters score zero. Numbers in parentheses below are core-card counts, not odds. Fillers are curated separately and do not affect highlight selection. The opening fillers 23/26/43/44 offer Moonlit Trap, Magical Library, Strike of Neos (including D.D. Crow) and Force of the Breaker (including Raiza); these complement the 46–48 engines. This is a path toward deckbuilding, not a claim that all complete 2008 lists can be pulled: the missing-core column identifies crafting gaps and existing structures may supply some of those cards.

## Coverage

| Theme | Highlights (individual counts) | Union coverage | No booster contains (crafting route) |
| --- | --- | --- | --- |
| 2008 Meta Showcase | 48 (9), 47 (5), 46 (4) | 18/24 | Allure of Darkness (1475311), Destiny HERO - Malicious (9411399), Dark Grepher (14536035), Return from the Different Dimension (27174286), Darklord Zerato (40921744), Test Tiger (92373006) |
| Lightsworn | 48 (8) | 8/8 | None |
| Gadget Stun | 40 (1), 4 (1) | 2/8 | Yellow Gadget (13839120), Green Gadget (41172955), Red Gadget (86445415) |
| Dark Armed Return | 47 (3) | 3/8 | Allure of Darkness (1475311), Destiny HERO - Malicious (9411399), Dark Grepher (14536035), Return from the Different Dimension (27174286), Darklord Zerato (40921744) |
| Monarch Control | 33 (1), 34 (1) | 2/7 | None |
| Gladiator Beasts | 46 (4), 47 (2) | 6/8 | Test Tiger (92373006) |
| Goat Control | 5 (1), 13 (1) | 2/8 | Thousand-Eyes Restrict (63519819) |
| Diamond Dude Turbo | 40 (1), 24 (1) | 2/8 | Destiny HERO - Malicious (9411399), Divine Sword - Phoenix Blade (31423101), Elemental HERO Stratos (40044918), Destiny Draw (45809008) |
| Cyber Dragon | 37 (3), 41 (3) | 6/8 | None |
| Perfect Circle | 41 (1), 44 (1) | 2/7 | Destiny HERO - Malicious (9411399), Destiny Draw (45809008), Light and Darkness Dragon (47297616), Destiny HERO - Disk Commander (56570271) |
| Chaos Control | 29 (3), 16 (2) | 5/7 | None |
| Zombie Revival | 23 (2), 45 (1) | 3/8 | Goblin Zombie (63665875), Il Blud (70595331), Mezuki (92826944) |
| Warrior Toolbox | 21 (2), 33 (1) | 3/7 | Blade Knight (39507162), D.D. Assailant (70074904) |
| OCG Cat Toolbox | 35 (1), 43 (1) | 2/6 | Summoner Monk (423585), Test Tiger (92373006) |
| Chaos Return | 37 (1), 20 (1) | 2/7 | Return from the Different Dimension (27174286), D.D. Assailant (70074904) |
| HERO Fusion | 37 (1), 38 (1) | 2/7 | Elemental HERO Ocean (37195861), Elemental HERO Stratos (40044918) |
| Hand Control | 15 (3), 23 (2) | 5/7 | None |
| Early Beatdown | 1 (2), 7 (2) | 4/7 | None |

### 2008 Meta Showcase

Core: Solar Recharge (691925), Allure of Darkness (1475311), Gladiator Beast Murmillo (5975022), Destiny HERO - Malicious (9411399), Dark Grepher (14536035), Ryko, Lightsworn Hunter (21502796), Lyla, Lightsworn Sorceress (22624373), Gladiator Beast Darius (25924653), Return from the Different Dimension (27174286), Gladiator Beast Heraklinos (27346636), Armageddon Knight (28985331), Gladiator Proving Ground (35224440), Honest (37742478), Darklord Zerato (40921744), Gladiator Beast Bestiari (41470137), Gladiator Beast Gyzarus (48156348), Judgment Dragon (57774843), Wulf, Lightsworn Beast (58996430), Dark Armed Dragon (65192027), Gladiator Beast Laquari (78868776), Test Tiger (92373006), The Dark Creator (92719314), Celestia, Lightsworn Angel (94381039), Lumina, Lightsworn Summoner (95503687).

Coverage by booster: 46: 4, 47: 5, 48: 9.

Closest local deck IDs (core matches; context only): 10038 (1), 10063 (1), 10071 (1).

### Lightsworn

Core: Solar Recharge (691925), Ryko, Lightsworn Hunter (21502796), Lyla, Lightsworn Sorceress (22624373), Honest (37742478), Judgment Dragon (57774843), Wulf, Lightsworn Beast (58996430), Celestia, Lightsworn Angel (94381039), Lumina, Lightsworn Summoner (95503687).

Coverage by booster: 48: 8.

Closest local deck IDs (core matches; context only): .

### Gadget Stun

Core: Yellow Gadget (13839120), Green Gadget (41172955), Sakuretsu Armor (56120475), Fissure (66788016), Red Gadget (86445415), Royal Oppression (93016201), Banisher of the Radiance (94853057), Smashing Ground (97169186).

Coverage by booster: 4: 1, 22: 1, 28: 1, 30: 1, 40: 1.

Closest local deck IDs (core matches; context only): 10098 (5), 7005 (3), 10011 (3).

### Dark Armed Return

Core: Allure of Darkness (1475311), Destiny HERO - Malicious (9411399), Dark Grepher (14536035), Return from the Different Dimension (27174286), Armageddon Knight (28985331), Darklord Zerato (40921744), Dark Armed Dragon (65192027), The Dark Creator (92719314).

Coverage by booster: 47: 3.

Closest local deck IDs (core matches; context only): 10038 (1), 10063 (1), 10071 (1).

### Monarch Control

Core: Mobius the Frost Monarch (4929256), Treeborn Frog (12538374), Thestalos the Firestorm Monarch (26205777), Zaborg the Thunder Monarch (51945556), Soul Exchange (68005187), Raiza the Storm Monarch (73125233), Brain Control (87910978).

Coverage by booster: 1: 1, 14: 1, 31: 1, 33: 1, 34: 1, 36: 1, 39: 1, 44: 1.

Closest local deck IDs (core matches; context only): 10003 (7), 8005 (5), 10021 (3).

### Gladiator Beasts

Core: Gladiator Beast Murmillo (5975022), Gladiator Beast Darius (25924653), Gladiator Beast Heraklinos (27346636), Gladiator Proving Ground (35224440), Gladiator Beast Bestiari (41470137), Gladiator Beast Gyzarus (48156348), Gladiator Beast Laquari (78868776), Test Tiger (92373006).

Coverage by booster: 46: 4, 47: 2, 48: 1.

Closest local deck IDs (core matches; context only): .

### Goat Control

Core: Sinister Serpent (8131171), Book of Moon (14087893), Magician of Faith (31560081), Tsukuyomi (34853266), Metamorphosis (46411259), Thousand-Eyes Restrict (63519819), Nobleman of Crossout (71044499), Scapegoat (73915051).

Coverage by booster: 5: 1, 13: 1, 14: 1, 17: 1, 23: 1, 24: 1, 28: 1.

Closest local deck IDs (core matches; context only): 7003 (3), 8004 (2), 10055 (2).

### Diamond Dude Turbo

Core: Destiny HERO - Malicious (9411399), Destiny HERO - Diamond Dude (13093792), Dimension Fusion (23557835), Divine Sword - Phoenix Blade (31423101), Elemental HERO Stratos (40044918), Monster Gate (43040603), Destiny Draw (45809008), Reasoning (58577036).

Coverage by booster: 24: 1, 30: 1, 31: 1, 40: 1.

Closest local deck IDs (core matches; context only): 7009 (3), 10024 (3), 10038 (3).

### Cyber Dragon

Core: Cyber End Dragon (1546123), Cyber Phoenix (3370104), Overload Fusion (3659803), Limiter Removal (23171610), Chimeratech Overdragon (64599569), Cyber Dragon (70095154), Cyber Twin Dragon (74157028), Future Fusion (77565204).

Coverage by booster: 18: 1, 37: 3, 40: 1, 41: 3.

Closest local deck IDs (core matches; context only): 10078 (5), 10080 (5), 7005 (1).

### Perfect Circle

Core: Destiny HERO - Malicious (9411399), Destiny Draw (45809008), Light and Darkness Dragon (47297616), Destiny HERO - Disk Commander (56570271), Raiza the Storm Monarch (73125233), Destiny HERO - Fear Monger (80744121), Foolish Burial (81439173).

Coverage by booster: 28: 1, 41: 1, 44: 1.

Closest local deck IDs (core matches; context only): 10085 (3), 10086 (3), 8005 (1).

### Chaos Control

Core: D.D. Warrior Lady (7572887), Chaos Sorcerer (9596126), Breaker the Magical Warrior (71413901), Black Luster Soldier - Envoy of the Beginning (72989439), Chaos Emperor Dragon - Envoy of the End (82301904), Mystic Tomato (83011277), Shining Angel (95956346).

Coverage by booster: 16: 2, 26: 1, 27: 1, 29: 3.

Closest local deck IDs (core matches; context only): 10059 (2), 7003 (1), 7013 (1).

### Zombie Revival

Core: Book of Life (2204140), Zombie Master (17259470), Ryu Kokki (57281778), Card of Safe Return (57953380), Goblin Zombie (63665875), Il Blud (70595331), Pyramid Turtle (77044671), Mezuki (92826944).

Coverage by booster: 19: 1, 23: 2, 30: 1, 45: 1.

Closest local deck IDs (core matches; context only): 10077 (5), 7015 (2), 8003 (2).

### Warrior Toolbox

Core: Ninja Grandmaster Sasuke (4041838), D.D. Warrior Lady (7572887), Reinforcement of the Army (32807846), Blade Knight (39507162), D.D. Assailant (70074904), Exiled Force (74131780), Don Zaloog (76922029).

Coverage by booster: 21: 2, 23: 1, 27: 1, 33: 1.

Closest local deck IDs (core matches; context only): 10009 (5), 10016 (4), 8005 (3).

### OCG Cat Toolbox

Core: Summoner Monk (423585), Rescue Cat (14878871), D.D. Crow (24508238), Gladiator Beast Bestiari (41470137), Cold Wave (60682203), Test Tiger (92373006).

Coverage by booster: 18: 1, 35: 1, 43: 1, 46: 1.

Closest local deck IDs (core matches; context only): 7011 (1), 10002 (1), 10024 (1).

### Chaos Return

Core: D.D. Warrior Lady (7572887), Chaos Sorcerer (9596126), Dimension Fusion (23557835), Return from the Different Dimension (27174286), D.D. Assailant (70074904), Cyber Dragon (70095154), Kycoo the Ghost Destroyer (88240808).

Coverage by booster: 20: 1, 27: 1, 29: 1, 30: 1, 37: 1.

Closest local deck IDs (core matches; context only): 10071 (3), 10003 (2), 10005 (2).

### HERO Fusion

Core: E - Emergency Call (213326), Elemental HERO Ocean (37195861), Elemental HERO Stratos (40044918), Miracle Fusion (45906428), Elemental HERO Neos Alius (69884162), Elemental HERO Captain Gold (80908502), Elemental HERO Wildheart (86188410).

Coverage by booster: 37: 1, 38: 1, 40: 1, 44: 1, 45: 1.

Closest local deck IDs (core matches; context only): 10061 (4), 7001 (3), 10024 (2).

### Hand Control

Core: Yata-Garasu (3078576), Confiscation (17375316), Spirit Reaper (23205979), The Forceful Sentry (42829885), Delinquent Duo (44763025), Trap Dustshoot (64697231), Don Zaloog (76922029).

Coverage by booster: 15: 3, 22: 1, 23: 2, 24: 1.

Closest local deck IDs (core matches; context only): 10009 (3), 7015 (1), 8005 (1).

### Early Beatdown

Core: Mechanicalchaser (7359741), Raigeki (12580477), Mirror Force (44095762), Gemini Elf (69140098), Summoned Skull (70781052), Jinzo (77585513), Goblin Attack Force (78658564).

Coverage by booster: 1: 2, 6: 1, 7: 2, 14: 1, 17: 1, 18: 1.

Closest local deck IDs (core matches; context only): 7003 (2), 7005 (2), 10051 (2).

## First six months (UTC)

Update indices below are one-based; the API index is zero-based. End dates are exclusive. Fillers include the previous cohort, including the deterministic pre-epoch cohort at launch. No future theme or pack list is returned by the API.

| Update | From | Until | Theme | Highlights | Fillers |
| --- | --- | --- | --- | --- | --- |
| 1 | 2026-11-05 | 2026-11-19 | 2008 Meta Showcase | 48, 47, 46 | 26, 43, 23, 44 |
| 2 | 2026-11-19 | 2026-12-03 | Lightsworn | 48 | 23, 44, 32, 48 |
| 3 | 2026-12-03 | 2026-12-17 | Gadget Stun | 40, 4 | 32, 48, 27, 42 |
| 4 | 2026-12-17 | 2026-12-31 | Dark Armed Return | 47 | 27, 42, 22, 47 |
| 5 | 2026-12-31 | 2027-01-14 | Monarch Control | 33, 34 | 22, 47, 31, 39 |
| 6 | 2027-01-14 | 2027-01-28 | Gladiator Beasts | 46, 47 | 31, 39, 24, 46 |
| 7 | 2027-01-28 | 2027-02-11 | Goat Control | 5, 13 | 24, 46, 28, 34 |
| 8 | 2027-02-11 | 2027-02-25 | Diamond Dude Turbo | 40, 24 | 28, 34, 21, 41 |
| 9 | 2027-02-25 | 2027-03-11 | Cyber Dragon | 37, 41 | 21, 41, 37, 25 |
| 10 | 2027-03-11 | 2027-03-25 | Perfect Circle | 41, 44 | 37, 25, 16, 43 |
| 11 | 2027-03-25 | 2027-04-08 | Chaos Control | 29, 16 | 16, 43, 29, 33 |
| 12 | 2027-04-08 | 2027-04-22 | Zombie Revival | 23, 45 | 29, 33, 20, 45 |
| 13 | 2027-04-22 | 2027-05-06 | Warrior Toolbox | 21, 33 | 20, 45, 19, 35 |

## Operations

Keys: `epoch`, `updateDays`, `fillerDays`, `leavingDays`, `highlightLimit`, `classics`, `beginnerPacks`, `pool`, `forceOn`, `forceOff`, `themes` (`theme`, `blurb`, `core`, `highlightCount`, `highlighted`, `filler`). `comment` records the selection method. Every timing and selection parameter lives in this file. Keep filler cohorts disjoint between adjacent updates and ensure the union covers `pool`. The core/highlight consistency test catches stale coverage after edits.

No admin action was added: durable admin overrides would require schema/persistence work outside this change. Edit `forceOn`/`forceOff` and deploy/reload. Overrides take effect on the next evaluation, without waiting for a swap; forceOff wins. Overrides apply only to rotating boosters, preserving permanent shelves. Secret Pack unlocks still bypass an out-of-rotation result, including forceOff.
