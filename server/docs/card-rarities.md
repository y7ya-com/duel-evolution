# Duel Evolution competitive-era rarities

This is a game economy design for the native YO2 pool, informed by 2002–2008 TCG and OCG competition. It is not original printing rarity, Master Duel rarity, monetary valuation, or a replacement Forbidden & Limited list. N means **Normal**, R Rare, SR Super Rare, and UR Ultra Rare. The wire/storage keys remain N/R/SR/UR.

## Method and reproduction

Run from the repository root:

```sh
node server/scripts/generate-card-rarities.mjs
node server/scripts/generate-card-rarities.mjs --check
```

The offline generator reads `gamedata/cards.json`, `gamedata/duel.json` (token kind 20), `gamedata/shop.json`, and the hand-curated `scripts/card-rarity-picks.json`. Every curated pick identifies an exact passcode, its native English name, tier, format/deck group, and one-line design reason. Alternate native passcodes for the same named card receive the same tier. Names are validated against the native catalogue; the unnamed championship prize is identified explicitly by passcode. No Master Duel table, automated popularity rank, original foil, or live service participates in generation.

UR rewards the era's strongest power cards, key competitive engines, and the best Monarch/Gadget/Cyber Dragon-level staples. SR covers strong staples, premium side-deck cards and meaningful engine cores. R includes solid playables, secondary theme threats and situational support. Unselected cards default to N, including weak effects and vanilla filler. A vanilla can still merit a higher tier for early competitive relevance (Summoned Skull, Mechanicalchaser) or explicit collection prestige (Blue-Eyes, Dark Magician). Egyptian Gods and native championship trophies are intentional UR collection exceptions, not assertions of tournament viability. R supports varied decks without implying that every themed card topped an event. Group reasons are design judgments, not claims that each card appeared in each source deck.

The target is approximately 3–4% UR, 8–9% SR, 25% R and the rest N, measured over collectible native passcodes. Quality takes precedence. The complete generated table assigns all 3,259 native rows a baseline tier, including 44 non-collectible tokens. `nonCollectible` preserves token exclusion in the runtime catalogue and `cardRarity`; tokens still return null rather than becoming tradeable cards. Unknown passcodes also return null. The previously uncovered Beast Machine King Barbaros Ür is now classified. The generated section below is checked byte-for-byte by `--check` alongside the JSON table.

Historical peak strength matters across the whole interval, so a card forbidden in the shipped snapshot can still be UR. No card is promoted solely for being limited: niche restricted combo pieces can be SR or R. Historical pre-errata impact informs the design; this change does not alter engine effects or deck legality. The native `duel.json.cards` row's second field remains the actual game's limit (0 forbidden, 1 limited, 2 semi-limited, 3 unrestricted; special native values remain untouched). `ydc.json` and `duel.json.npc_decks` provide local deck context, not a tournament popularity survey.

## Historical scope and evidence

Sources were consulted on 2026-11-05. The links below support the format context; the tier assignments are our design choices. Contemporary event coverage is preferred where available. TCG and OCG release dates and lists differ; this pool is a YO2 snapshot, not every card released anywhere by December 2008.

- **2002–03 beatdown and hand control:** efficient attackers, Summoned Skull/Jinzo, removal, and hand disruption explain early staples that later lost ground. The contemporary [Pojo comparison of the 2003 and 2004 championship decks](https://www.pojo.com/yu-gi-oh/FeaturedWriters/napay/2005/4-8.shtml) documents the shift toward Chaos and the enduring power-spell suite. Early strength is considered alongside later formats, rather than rating all vanilla attackers as filler.
- **2004 Chaos:** [Dave Brent's March 2004 contemporary analysis](https://kperovic.com/metagame/yugioh8fe4.html?ArticleId=49&tabid=33) describes Invasion of Chaos and Chaos Emperor Dragon's impending impact. [Battle City Amsterdam coverage](https://kperovic.com/metagame/yugioh4248.html?ArticleId=482&tabid=33) reports Chaos as the leading competitive strategy. This supports premium Chaos bosses and their LIGHT/DARK control shell.
- **2005 Goat:** the [Goat Format history and banlist](https://beta.goatformat.com/learn/goat-format-history) defines the summer 2005 pool using the April 2005 TCG list; Cybernetic Revolution/Cyber Dragon is outside that particular format. [The archived April 2005 list](https://ygo.anihelp.co.uk/2005-04-01/) separates forbidden power from limited staples. Scapegoat, Metamorphosis and Thousand-Eyes Restrict anchor our Goat engine picks; BLS, Faith and spell/trap staples explain the surrounding premiums. This pool also contains cards outside Goat and does not apply Goat legality globally.
- **2005–06 Chaos Return and Monarchs:** [the May 2006 Columbus championship report](https://kperovic.com/metagame/yugioha2d9.html?EventId=127&tabid=61) records Chaos/Return alongside Monarch Control. [September 2006 analysis](https://kperovic.com/metagame/yugioha4c7.html?ArticleId=6910&tabid=33) describes Chaos Sorcerer, Return, self-replacing monsters and Cyber-Stein. Cyber Dragon, Treeborn Frog and tribute-control pieces receive premiums for their role in this transition.
- **2007 Gadgets/Stun:** [Paul Levitin's March 2007 Gadget list](https://kperovic.com/metagame/yugioh2317.html?ArticleId=8133&tabid=33) shows all three Gadgets, Cyber Dragon, Trooper, Rat, Exiled Force and a dense removal suite. [January 2007 Macro analysis](https://kperovic.com/metagame/yugioh2a66-2.html?ArticleId=7944&tabid=33) describes Gadgets and Monarchs as key opponents. Gadgets are deliberately UR; Smashing Ground, Fissure and battle traps are strong SR rather than anonymous filler. Stun tech is rated for practical disruption, not just attack points.
- **2007–early 2008 Perfect Circle and Diamond Dude Turbo:** these are related Destiny-engine families, not interchangeable decklists. [July 2007 Monarch analysis](https://kperovic.com/metagame/yugioha99f.html?ArticleId=8760&tabid=33) contrasts Monarchs, T-Hero and Perfect Circle. [The February 2007 DDT finals](https://kperovic.com/metagame/yugioh0b32.html?ArticleId=8099&tabid=33) and [April 2007 DDT mirror](https://kperovic.com/metagame/yugioh8e40.html?ArticleId=8301&tabid=33) demonstrate Stratos, Malicious, Destiny Draw, Reasoning, Monster Gate and Dimension Fusion. Disk Commander and Light and Darkness Dragon represent the premium revival/tribute branch.
- **2008 Dark Armed Return:** [March 2008 event coverage](https://kperovic.com/metagame/yugioh5eef.html?EventId=195&tabid=61) records the Dark Armed Return environment. [May 2008 analysis of the emergency changes](https://kperovic.com/metagame/yugioh61b7.html?ArticleId=9586&tabid=33) distinguishes DAD's power from the explosive Dimension Fusion/Return finishers. Those engines and Allure receive UR treatment; supporting DARK threats are SR or R.
- **2008 Gladiator Beasts and Lightsworn:** [contemporary June 2008 feature coverage](https://kperovic.com/metagame/yugiohce00.html?ArticleId=9802&tabid=33) documents Lightsworn cards and attribute mirrors in play. [The OCG March–August 2008 tournament compilation](https://roadoftheking.com/ocg-2008-03-metagame/) places Cat Synchro, Lightsworn and Gladiator Beasts among its leaders, and identifies Gyzarus as the Gladiator breakthrough. Our available Gyzarus/Bestiari and Judgment Dragon/Lumina/Recharge engines therefore receive the largest premiums. It also explains why OCG Summoner Monk/Rescue Cat have a higher ceiling than a purely pre-Synchro TCG view suggests.
- **Late 2008 Tele-DAD boundary:** [September 2008 tournament analysis](https://kperovic.com/metagame/yugiohca74.html?ArticleId=10194&tabid=33) treats Emergency Teleport as format-defining. DAD, Malicious and Destiny Draw connect the existing pool to that later strategy, but Emergency Teleport, Krebons, Stardust Dragon and the Synchro roster are absent here. We classify no absent cards. Later Gladiator Equeste/War Chariot and Charge of the Light Brigade are also outside this native pool.
- **Side decks:** [December 2008 side-deck guidance](https://kperovic.com/metagame/yugioh54c0.html?ArticleId=10439&tabid=33) discusses Bottomless, attribute mirrors, Dust Tornado, Twister and Royal Decree. The [Gladiator side-deck analysis](https://kperovic.com/metagame/yugioh77ce.html?ArticleId=10487&tabid=33) discusses Oppression versus Tele-DAD and the danger of disrupting one's own engine. D.D. Crow, Pulling the Rug, Cipher Soldier (historically Kinetic Soldier), Prohibition, Skill Drain and Macro/Dimensional Fissure round out premium or situational matchup tools in this design. Side tech is not assumed universally correct in a main deck.
- **Forbidden & Limited context:** [Konami's official September 2008 OCG list](https://www.yugioh-card.com/japan/event/limitregulation/?list=200809) records forbidden DMOC, Disk Commander, Dimension Fusion and Premature Burial, limited Cyber Dragon/Return, and semi-limited DAD/Judgment Dragon. It also records restrictions on older power and control cards. This supports historical demand while illustrating why one late list cannot define the entire era. Its OCG status is not silently substituted for the shipped YO2 list or the April 2005 TCG list.
- **Too late:** [Konami's Hidden Arsenal 3 product page](https://www.yugioh-card.com/en/products/past_products/ha03/) dates the TCG Dragunity arrival to December 2010. Dragunity is not a 2002–08 strategy or a native-pool classification. Later-era archetypes are not used to justify premiums here.

## Runtime and pack behavior

`card-rarity.ts` remains the canonical lookup for shop, collection metadata and card displays. Its public N label is **Normal**. There is no N-to-C migration. Shop slot weights remain N 70 / R 25 / SR 4 / UR 1 for slots 1–4 and R 75 / SR 20 / UR 5 for slot 5. Missing tiers are renormalized by the existing runtime; a pool with no R+ falls back to its highest available tier. The report flags sparse pools rather than upgrading filler merely to hide scarcity. Changing rarity affects which cards share each weighted bucket, not the advertised tier weights.

Trade card legs and stored audit card rows contain passcode arrays, not serialized card rarity keys. They retain their existing one-card/one-unit accounting and resolve card display rarity through the canonical catalogue where needed. Stored cosmetic rarity is a separate common/rare/super/ultra vocabulary and is unchanged. No stored-value migration is needed because N is retained. The word “common” for cosmetics is unrelated to the card tier label.

<!-- BEGIN GENERATED RARITIES -->

Version: `de-meta-2008-v1`. Native rows: 3259; collectible passcodes: 3215; non-collectible token rows: 44 (N baseline, excluded from economy and counts below).

| Tier | Label | Collectible cards | Share |
| --- | --- | ---: | ---: |
| N | Normal | 1977 | 61.49% |
| R | Rare | 835 | 25.97% |
| SR | Super Rare | 282 | 8.77% |
| UR | Ultra Rare | 121 | 3.76% |

## Full UR list

### Destiny, Return and Dark Armed

| Card (passcode) | Design reason |
| --- | --- |
| Allure of Darkness (1475311) | Premium DARK draw engine powering the 2008 Dark Armed family. |
| Card Trooper (85087012) | Central draw engine or explosive finisher defining 2007–08 combo decks. |
| Dark Armed Dragon (65192027) | 2008 DARK boss anchoring Dark Armed Return and later Tele-DAD. |
| Dark Grepher (14536035) | Premium DARK graveyard setup card for explosive 2008 engines. |
| Darklord Zerato (40921744) | Central draw engine or explosive finisher defining 2007–08 combo decks. |
| Destiny Draw (45809008) | Premium draw engine linking Diamond Dude Turbo, Perfect Circle and DARK decks. |
| Destiny HERO - Disk Commander (56570271) | Explosive revival-driven draw engine at the heart of Perfect Circle. |
| Destiny HERO - Malicious (9411399) | Free tribute material and central Destiny engine piece; later bridges to Tele-DAD. |
| Dimension Fusion (23557835) | Explosive DDT and Return finisher with a lasting restriction history. |
| Elemental HERO Stratos (40044918) | Key HERO searcher that makes Destiny engines consistent. |
| Foolish Burial (81439173) | Universal graveyard setup for Treeborn, Destiny and 2008 mill engines. |
| Gold Sarcophagus (75500286) | Central draw engine or explosive finisher defining 2007–08 combo decks. |
| Light and Darkness Dragon (47297616) | Signature Perfect Circle-era tribute boss backed by Destiny resources. |
| Return from the Different Dimension (27174286) | Mass revival payoff defining Chaos Return and Dark Armed Return. |

### Early power and Chaos

| Card (passcode) | Design reason |
| --- | --- |
| Black Luster Soldier - Envoy of the Beginning (72989439) | Defining Chaos finisher and premier Goat-format boss. |
| Butterfly Dagger - Elma (69243953) | Era-defining restricted power or dominant Chaos-era staple. |
| Call of the Haunted (97077563) | Era-defining restricted power or dominant Chaos-era staple. |
| Change of Heart (4031928) | Era-defining restricted power or dominant Chaos-era staple. |
| Chaos Emperor Dragon - Envoy of the End (82301904) | Pre-errata Chaos power defines the 2004 ceiling; rated for historical impact. |
| Chaos Sorcerer (9596126) | Central Chaos Return threat during the 2005–06 transition. |
| Confiscation (17375316) | Era-defining restricted power or dominant Chaos-era staple. |
| Cyber Jar (34124316) | Era-defining restricted power or dominant Chaos-era staple. |
| Cyber-Stein (69015963) | Era-defining restricted power or dominant Chaos-era staple. |
| Dark Hole (53129443) | Era-defining restricted power or dominant Chaos-era staple. |
| Dark Magician of Chaos (40737112) | Era-defining restricted power or dominant Chaos-era staple. |
| Delinquent Duo (44763025) | Era-defining restricted power or dominant Chaos-era staple. |
| Exchange of the Spirit (17484499) | Era-defining restricted power or dominant Chaos-era staple. |
| Fiber Jar (78706415) | Era-defining restricted power or dominant Chaos-era staple. |
| Graceful Charity (79571449) | Premier draw and graveyard setup card across early Chaos and combo strategies. |
| Harpie's Feather Duster (18144506) | Era-defining restricted power or dominant Chaos-era staple. |
| Harpie's Feather Duster (18144507) | Era-defining restricted power or dominant Chaos-era staple. |
| Heavy Storm (19613556) | Era-defining restricted power or dominant Chaos-era staple. |
| Imperial Order (61740673) | Era-defining restricted power or dominant Chaos-era staple. |
| Jinzo (77585513) | Era-defining restricted power or dominant Chaos-era staple. |
| Last Will (85602018) | Era-defining restricted power or dominant Chaos-era staple. |
| Magical Scientist (34206604) | Era-defining restricted power or dominant Chaos-era staple. |
| Makyura the Destructor (21593977) | Era-defining restricted power or dominant Chaos-era staple. |
| Mirage of Nightmare (41482598) | Era-defining restricted power or dominant Chaos-era staple. |
| Mirror Force (44095762) | Era-defining restricted power or dominant Chaos-era staple. |
| Monster Reborn (83764718) | Era-defining restricted power or dominant Chaos-era staple. |
| Mystical Space Typhoon (5318639) | Era-defining restricted power or dominant Chaos-era staple. |
| Painful Choice (74191942) | Era-defining restricted power or dominant Chaos-era staple. |
| Pot of Greed (55144522) | Universal early-format draw staple; forbidden status preserves its historical chase value. |
| Premature Burial (70828912) | Era-defining restricted power or dominant Chaos-era staple. |
| Raigeki (12580477) | Era-defining restricted power or dominant Chaos-era staple. |
| Ring of Destruction (83555666) | Era-defining restricted power or dominant Chaos-era staple. |
| Sangan (26202165) | Era-defining restricted power or dominant Chaos-era staple. |
| Sixth Sense (3280747) | Era-defining restricted power or dominant Chaos-era staple. |
| Snatch Steal (45986603) | Era-defining restricted power or dominant Chaos-era staple. |
| Temple of the Kings (29762407) | Era-defining restricted power or dominant Chaos-era staple. |
| The Forceful Sentry (42829885) | Era-defining restricted power or dominant Chaos-era staple. |
| Torrential Tribute (53582587) | Era-defining restricted power or dominant Chaos-era staple. |
| Witch of the Black Forest (78010363) | Era-defining restricted power or dominant Chaos-era staple. |
| Yata-Garasu (3078576) | Era-defining restricted power or dominant Chaos-era staple. |

### Gladiator Beasts and Lightsworn

| Card (passcode) | Design reason |
| --- | --- |
| Gladiator Beast Bestiari (41470137) | Essential Gyzarus material and central Gladiator Beast removal toolbox piece. |
| Gladiator Beast Gyzarus (48156348) | 2008 Gladiator Beast breakthrough boss enabling decisive contact-fusion swings. |
| Gladiator Beast Heraklinos (27346636) | Premium Gladiator Beast finishing lock and alternate contact-fusion payoff. |
| Honest (37742478) | Premium LIGHT combat staple making 2008 LIGHT strategies threatening. |
| Judgment Dragon (57774843) | Signature Lightsworn boss and defining arrival-of-2008 payoff. |
| Lumina, Lightsworn Summoner (95503687) | Core Lightsworn revival engine that turns milling into field presence. |
| Rescue Cat (14878871) | Historic Beast combo enabler; later OCG Cat Synchro impact informs its ceiling. |
| Solar Recharge (691925) | Central Lightsworn consistency and graveyard-development engine. |
| Summoner Monk (423585) | Powerful OCG recruitment engine; TCG availability differs from the 2008 OCG context. |
| Test Tiger (92373006) | Deck-defining boss or essential engine centerpiece at the 2008 transition. |

### Goat and control

| Card (passcode) | Design reason |
| --- | --- |
| Book of Moon (14087893) | Defining control engine or highly sought-after staple across early formats. |
| Breaker the Magical Warrior (71413901) | Defining control engine or highly sought-after staple across early formats. |
| Crush Card Virus (57728570) | Sought-after power trap with major contemporary tournament impact. |
| Crush Card Virus (57728571) | Sought-after power trap with major contemporary tournament impact. |
| D.D. Warrior Lady (7572887) | Defining control engine or highly sought-after staple across early formats. |
| Magician of Faith (31560081) | Defining control engine or highly sought-after staple across early formats. |
| Metamorphosis (46411259) | Defines Goat control through its Thousand-Eyes Restrict toolbox. |
| Morphing Jar (33508719) | Defining control engine or highly sought-after staple across early formats. |
| Nobleman of Crossout (71044499) | Defining control engine or highly sought-after staple across early formats. |
| Reinforcement of the Army (32807846) | Defining control engine or highly sought-after staple across early formats. |
| Scapegoat (73915051) | Namesake Goat engine and widely desired defensive tribute-era resource. |
| Sinister Serpent (8131171) | Defining control engine or highly sought-after staple across early formats. |
| Solemn Judgment (41420027) | Defining control engine or highly sought-after staple across early formats. |
| Thousand-Eyes Restrict (63519819) | Signature Goat control fusion and central Metamorphosis payoff. |
| Trap Dustshoot (64697231) | Defining control engine or highly sought-after staple across early formats. |
| Tribe-Infecting Virus (33184167) | Defining control engine or highly sought-after staple across early formats. |
| Tsukuyomi (34853266) | Defining control engine or highly sought-after staple across early formats. |

### Iconic collection bosses

| Card (passcode) | Design reason |
| --- | --- |
| Blue-Eyes Ultimate Dragon (23995346) | Iconic chase monster; collection prestige is an explicit exception to competitive strength. |
| Blue-Eyes Ultimate Dragon (23995347) | Iconic chase monster; collection prestige is an explicit exception to competitive strength. |
| Blue-Eyes White Dragon (89631139) | Iconic collection chase monster; explicitly UR independent of tournament strength. |
| Blue-Eyes White Dragon (89631140) | Iconic collection chase monster; explicitly UR independent of tournament strength. |
| Blue-Eyes White Dragon (89631141) | Iconic collection chase monster; explicitly UR independent of tournament strength. |
| Blue-Eyes White Dragon (89631142) | Iconic collection chase monster; explicitly UR independent of tournament strength. |
| Dark Magician (36996508) | Iconic collection chase monster; explicitly UR independent of tournament strength. |
| Dark Magician (46986414) | Iconic collection chase monster; explicitly UR independent of tournament strength. |
| Dark Magician (46986415) | Iconic collection chase monster; explicitly UR independent of tournament strength. |
| Dark Magician (46986416) | Iconic collection chase monster; explicitly UR independent of tournament strength. |
| Exodia the Forbidden One (33396948) | Iconic chase monster; collection prestige is an explicit exception to competitive strength. |
| Obelisk the Tormentor (10000000) | Iconic chase monster; collection prestige is an explicit exception to competitive strength. |
| Red-Eyes Black Dragon (74677422) | Iconic chase monster; collection prestige is an explicit exception to competitive strength. |
| Red-Eyes Black Dragon (74677424) | Iconic chase monster; collection prestige is an explicit exception to competitive strength. |
| Red-Eyes Black Dragon (74677425) | Iconic chase monster; collection prestige is an explicit exception to competitive strength. |
| Red-Eyes Black Dragon (74677426) | Iconic chase monster; collection prestige is an explicit exception to competitive strength. |
| Slifer the Sky Dragon (10000020) | Iconic chase monster; collection prestige is an explicit exception to competitive strength. |
| The Winged Dragon of Ra (10000010) | Iconic chase monster; collection prestige is an explicit exception to competitive strength. |

### Monarch, Gadget and Stun

| Card (passcode) | Design reason |
| --- | --- |
| Brain Control (87910978) | Premier tribute engine, self-replacing Gadget, or Cyber Dragon-level competitive staple. |
| Caius the Shadow Monarch (9748752) | Premier 2008 Monarch with broad removal utility. |
| Cyber Dragon (70095154) | Era-changing free threat, tribute enabler and machine staple. |
| Cyber Dragon (70095155) | Era-changing free threat, tribute enabler and machine staple. |
| Doomcaliber Knight (78700060) | Premier tribute engine, self-replacing Gadget, or Cyber Dragon-level competitive staple. |
| Green Gadget (41172955) | One-third of the self-replacing Gadget engine driving 2007 control. |
| Raiza the Storm Monarch (73125233) | Format-leading Monarch that converts a tribute into tempo and draw denial. |
| Red Gadget (86445415) | One-third of the self-replacing Gadget engine driving 2007 control. |
| Royal Oppression (93016201) | High-impact anti-special-summon staple for Gadget and Stun strategies. |
| Thestalos the Firestorm Monarch (26205777) | Premium hand-pressure Monarch in tribute-control shells. |
| Thunder King Rai-Oh (71564252) | Premium late-era anti-search and summon-interaction threat. |
| Treeborn Frog (12538374) | Premier tribute engine, self-replacing Gadget, or Cyber Dragon-level competitive staple. |
| Yellow Gadget (13839120) | One-third of the self-replacing Gadget engine driving 2007 control. |
| Zaborg the Thunder Monarch (51945556) | Leading early Monarch removal threat before later tribute bosses. |

### World Championship collection prizes

| Card (passcode) | Design reason |
| --- | --- |
| Chimaera, the Master of Beasts (501000006) | Native championship prize; scarce collection trophy rather than a claim of tournament legality. |
| Emperor of Lightning (501000007) | Native championship prize; scarce collection trophy rather than a claim of tournament legality. |
| King of Destruction - Xexex (501000002) | Native championship prize; scarce collection trophy rather than a claim of tournament legality. |
| Meteo the Matchless (501000001) | Native championship prize; scarce collection trophy rather than a claim of tournament legality. |
| Queen of Fate - Eternia (501000003) | Native championship prize; scarce collection trophy rather than a claim of tournament legality. |
| Testament of the Arcane Lords (501000004) | Native championship prize; scarce collection trophy rather than a claim of tournament legality. |
| Ulevo (501000000) | Native championship prize; scarce collection trophy rather than a claim of tournament legality. |
| Unnamed World Championship prize (501000005) | Native championship prize; scarce collection trophy rather than a claim of tournament legality. |


## Full SR list

### Destiny, Return and Dark Armed

| Card (passcode) | Design reason |
| --- | --- |
| Advanced Ritual Art (46052429) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Armageddon Knight (28985331) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Chain Strike (91623717) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| D.D.R. - Different Dimension Reincarnation (9622164) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Dark Horus (66214679) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Dark Master - Zorc (97642679) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Dark Nephthys (38107923) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Demise, King of Armageddon (72426662) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Destiny HERO - Dasher (81866673) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Destiny HERO - Diamond Dude (13093792) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Destiny HERO - Dogma (17132130) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Destiny HERO - Fear Monger (80744121) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Destiny HERO - Plasma (83965310) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Divine Sword - Phoenix Blade (31423101) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Doom Dozer (76039636) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| E - Emergency Call (213326) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Elemental HERO Captain Gold (80908502) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Elemental HERO Neos Alius (69884162) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Elemental HERO Ocean (37195861) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Elemental HERO Prisma (89312388) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Elemental HERO Wildheart (86188410) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Escape from the Dark Dimension (31550470) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Hidden Armory (52105192) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Magical Explosion (32723153) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Magical Mallet (85852291) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Manju of the Ten Thousand Hands (95492061) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Miracle Fusion (45906428) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Phantom of Chaos (30312361) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Royal Magical Library (70791313) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Senju of the Thousand Hands (23401839) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Sonic Bird (57617178) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Strike Ninja (41006930) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| The Dark Creator (92719314) | Strong Destiny/Chaos/Return engine core or high-value combo support. |
| Trade-In (38120068) | Strong Destiny/Chaos/Return engine core or high-value combo support. |

### Early beatdown and alternate strategies

| Card (passcode) | Design reason |
| --- | --- |
| Mechanicalchaser (7359741) | Premier early 1850-ATK tournament-era beatdown body. |
| Reversal Quiz (5990062) | Restricted combo/alternate-win enabler with a narrow but powerful ceiling. |
| Summoned Skull (70781052) | Defining early beatdown tribute threat in the 2002–03 game. |
| Summoned Skull (70781053) | Defining early beatdown tribute threat in the 2002–03 game. |
| Summoned Skull (70781054) | Defining early beatdown tribute threat in the 2002–03 game. |

### Gladiator Beasts and Lightsworn

| Card (passcode) | Design reason |
| --- | --- |
| Aurkus, Lightsworn Druid (7183277) | Competitive archetype core or premium support from the available 2008 pool. |
| Beckoning Light (16255442) | Premium Lightsworn recovery tech that reassembles LIGHT threats. |
| Celestia, Lightsworn Angel (94381039) | Competitive archetype core or premium support from the available 2008 pool. |
| Ehren, Lightsworn Monk (44178886) | Competitive archetype core or premium support from the available 2008 pool. |
| Garoth, Lightsworn Warrior (59019082) | Competitive archetype core or premium support from the available 2008 pool. |
| Gladiator Beast Darius (25924653) | Competitive archetype core or premium support from the available 2008 pool. |
| Gladiator Beast Hoplomus (4253484) | Competitive archetype core or premium support from the available 2008 pool. |
| Gladiator Beast Laquari (78868776) | Competitive archetype core or premium support from the available 2008 pool. |
| Gladiator Beast Murmillo (5975022) | Competitive archetype core or premium support from the available 2008 pool. |
| Gladiator Beast Octavius (29590752) | Competitive archetype core or premium support from the available 2008 pool. |
| Gladiator Beast Secutor (77642288) | Competitive archetype core or premium support from the available 2008 pool. |
| Gladiator Proving Ground (35224440) | Competitive archetype core or premium support from the available 2008 pool. |
| Glorious Illusion (61962135) | Competitive archetype core or premium support from the available 2008 pool. |
| Jain, Lightsworn Paladin (96235275) | Competitive archetype core or premium support from the available 2008 pool. |
| Limit Reverse (27551) | Competitive archetype core or premium support from the available 2008 pool. |
| Lyla, Lightsworn Sorceress (22624373) | Competitive archetype core or premium support from the available 2008 pool. |
| Monster Reincarnation (74848038) | Competitive archetype core or premium support from the available 2008 pool. |
| Ryko, Lightsworn Hunter (21502796) | Competitive archetype core or premium support from the available 2008 pool. |
| Wulf, Lightsworn Beast (58996430) | Competitive archetype core or premium support from the available 2008 pool. |

### Goat, Chaos and general control

| Card (passcode) | Design reason |
| --- | --- |
| Abyss Soldier (18318842) | Premium WATER toolbox threat that converts discard resources into tempo. |
| Airknight Parshath (18036057) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Apprentice Magician (9156135) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Asura Priest (2134346) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Berserk Gorilla (39168895) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Blade Knight (39507162) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| D.D. Assailant (70074904) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| D.D. Warrior (37043180) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Dark Balter the Terrible (80071763) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Dark Blade the Dragon Knight (86805855) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Dark Dust Spirit (89111398) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Dark Ruler Ha Des (53982768) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Dekoichi the Battlechanted Locomotive (87621407) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Des Koala (69579761) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Des Lacooda (2326738) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Don Zaloog (76922029) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Enraged Battle Ox (76909279) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Exiled Force (74131780) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Fiend Skull Dragon (66235877) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Flying Kamakiri #1 (84834865) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Gemini Elf (69140098) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Gemini Elf (69140099) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Giant Rat (97017120) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Goblin Attack Force (78658564) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Gravekeeper's Guard (37101832) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Gravekeeper's Spy (24317029) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Hino-Kagu-Tsuchi (75745607) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Injection Fairy Lily (79575620) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| King Dragun (13756293) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Kycoo the Ghost Destroyer (88240808) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Luster Dragon (11091375) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Magical Merchant (32362575) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Mask of Darkness (28933734) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Mother Grizzly (57839750) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Mystic Tomato (83011277) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Newdoria (4335645) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Night Assailant (16226786) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Ninja Grandmaster Sasuke (4041838) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Old Vindictive Magician (45141844) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Penguin Soldier (93920745) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Pyramid Turtle (77044671) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Reaper on the Nightmare (85684223) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Ryu Senshi (49868263) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Sacred Phoenix of Nephthys (61441708) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Sasuke Samurai (16222645) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Shining Angel (95956346) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Skilled Dark Magician (73752131) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Slate Warrior (78636495) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Spear Dragon (31553716) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Spirit Reaper (23205979) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Stealth Bird (3510565) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Swarm of Locusts (41872150) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| Swarm of Scarabs (15383415) | Strong control staple, recruiter, or premium toolbox option in the early formats. |
| The Creator (61505339) | Strong control staple, recruiter, or premium toolbox option in the early formats. |

### Monarch, Gadget and Stun

| Card (passcode) | Design reason |
| --- | --- |
| Ancient Gear Gadjiltron Dragon (50933533) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Ancient Gear Golem (83104731) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Banisher of the Light (61528025) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Beast King Barbaros (78651105) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Chimeratech Fortress Dragon (79229522) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Chimeratech Overdragon (64599569) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Cipher Soldier (79853073) | Premium anti-Warrior side-deck threat, historically named Kinetic Soldier. |
| Cyber Phoenix (3370104) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Cyber Twin Dragon (74157028) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Cyber Valley (3657444) | Strong machine draw and defensive utility engine. |
| Dandylion (15341821) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Drillroid (71218746) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Fossil Dyna Pachycephalo (42009836) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Fusilier Dragon, the Dual-Mode Beast (51632798) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Future Fusion (77565204) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Gilasaurus (45894482) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Gorz the Emissary of Darkness (44330098) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Green Baboon, Defender of the Forest (46668237) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Hydrogeddon (22587018) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Hyper Hammerhead (2671330) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Jowgen the Spiritualist (41855169) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| King Tiger Wanghu (83986578) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Kuraz the Light Monarch (57666212) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Legendary Jujitsu Master (25773409) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Marshmallon (31305911) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Megamorph (22046459) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Mobius the Frost Monarch (4929256) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Neo-Spacian Grand Mole (80344569) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Overload Fusion (3659803) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Reflect Bounder (2851070) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Sabersaurus (37265642) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Snipe Hunter (84290642) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Soul Exchange (68005187) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Steamroid (44729197) | Strong tribute, machine, or anti-meta engine card and supporting tech. |
| Ultimate Tyranno (15894048) | Strong tribute, machine, or anti-meta engine card and supporting tech. |

### Spells and traps across formats

| Card (passcode) | Design reason |
| --- | --- |
| Banisher of the Radiance (94853057) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Bottomless Trap Hole (29401950) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Card Destruction (72892473) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Card of Safe Return (57953380) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Ceasefire (36468556) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Chain Disappearance (57139487) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Cold Wave (60682203) | Powerful protection for decisive monster-based combo turns. |
| Compulsory Evacuation Device (94192409) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Creature Swap (31036355) | High-impact staple or premium interaction, consistency, or combo enabler. |
| D.D. Crow (24508238) | High-impact staple or premium interaction, consistency, or combo enabler. |
| D.D. Scout Plane (3773196) | High-impact staple or premium interaction, consistency, or combo enabler. |
| D.D. Survivor (48092532) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Dark Bribe (77538567) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Deck Devastation Virus (35027493) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Deck Lockdown (1149109) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Dimensional Fissure (81674782) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Dimensional Prison (70342110) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Divine Wrath (49010598) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Dust Tornado (60082869) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Enemy Controller (98045062) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Eradicator Epidemic Virus (54974237) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Fissure (66788016) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Forced Back (43340443) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Giant Trunade (42703248) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Gravity Bind (85742772) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Last Turn (28566710) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Level Limit - Area B (3136426) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Light-Imprisoning Mirror (53341729) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Lightning Vortex (69162969) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Limiter Removal (23171610) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Macro Cosmos (30241314) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Mage Power (83746708) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Magic Cylinder (62279055) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Magic Drain (59344077) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Magical Stone Excavation (98494543) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Mask of Restrict (29549364) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Messenger of Peace (44656491) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Mind Control (37520316) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Mind Crush (15800838) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Monster Gate (43040603) | High-impact staple or premium interaction, consistency, or combo enabler. |
| My Body as a Shield (69279219) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Necrovalley (47355498) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Nobleman of Extermination (17449108) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Phoenix Wing Wind Blast (63356631) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Pot of Avarice (67169062) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Prohibition (43711255) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Pulling the Rug (34717238) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Reasoning (58577036) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Reckless Greed (37576645) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Reload (22589918) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Rivalry of Warlords (90846359) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Royal Decree (51452091) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Royal Tribute (72405967) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Sakuretsu Armor (56120475) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Seven Tools of the Bandit (3819470) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Shadow-Imprisoning Mirror (99735427) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Shrink (55713623) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Skill Drain (82732705) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Smashing Ground (97169186) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Soul Release (5758500) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Spell Reproduction (29228529) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Summon Limit (23516703) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Swords of Revealing Light (72302403) | High-impact staple or premium interaction, consistency, or combo enabler. |
| System Down (18895832) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Terraforming (73628505) | High-impact staple or premium interaction, consistency, or combo enabler. |
| The Transmigration Prophecy (46652477) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Threatening Roar (36361633) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Time Seal (35316708) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Toon Table of Contents (89997728) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Ultimate Offering (80604091) | High-impact staple or premium interaction, consistency, or combo enabler. |
| United We Stand (56747793) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Upstart Goblin (70368879) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Waboku (12607053) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Wave-Motion Cannon (38992735) | High-impact staple or premium interaction, consistency, or combo enabler. |
| Widespread Ruin (77754944) | High-impact staple or premium interaction, consistency, or combo enabler. |

### Zombies, Machines and alternate engines

| Card (passcode) | Design reason |
| --- | --- |
| A Legendary Ocean (295517) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Batteryman AA (63142001) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Batteryman Charger (83446909) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Batteryman Industrial Strength (19441018) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Batteryman Micro-Cell (56839613) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Beiige, Vanguard of Dark World (33731070) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Book of Life (2204140) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Broww, Huntsman of Dark World (79126789) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Cannon Soldier (11384280) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Catapult Turtle (95727991) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Crystal Abundance (72881007) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Crystal Beast Ruby Carbuncle (32710364) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Crystal Beast Sapphire Pegasus (7093411) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Cyber End Dragon (1546123) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Cyber End Dragon (1546124) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Dark Mimic LV1 (74713516) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Dark Mimic LV3 (1102515) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Dark Simorgh (11366199) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Dark World Dealings (74117290) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Deep Diver (17559367) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Des Volstgalph (81059524) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Doom Shaman (94944637) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Final Countdown (95308449) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Gateway to Dark World (93431518) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Gigaplant (53257892) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Goblin Zombie (63665875) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Goldd, Wu-Lord of Dark World (78004197) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Grandmaster of the Six Samurai (83039729) | Central Six Samurai extender and resilient searchable threat. |
| Great Shogun Shien (63176202) | Six Samurai payoff restricting opposing spell and trap development. |
| Horus the Black Flame Dragon LV6 (11224103) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Horus the Black Flame Dragon LV8 (48229808) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Il Blud (70595331) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Inferno Reckless Summon (12247206) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Left Arm of the Forbidden One (7902349) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Left Leg of the Forbidden One (44519536) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Levia-Dragon - Daedalus (37721209) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Lonefire Blossom (48686504) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Manticore of Darkness (77121851) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Mass Driver (34906152) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Mezuki (92826944) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Morphing Jar #2 (79106360) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Necroface (28297833) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Ocean Dragon Lord - Neo-Daedalus (10485110) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Ojama Trio (29843091) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Rare Value (60876124) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Red-Eyes Darkness Metal Dragon (88264978) | Available OCG-era promotional Dragon engine payoff; not treated as a TCG 2008 staple. |
| Right Arm of the Forbidden One (70903634) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Right Leg of the Forbidden One (8124921) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Ryu Kokki (57281778) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Salvage (96947648) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Short Circuit (75967082) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Sillva, Warlord of Dark World (32619583) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Swing of Memories (96765646) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Symbol of Heritage (45305419) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Toon Cannon Soldier (79875176) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Vampire Lord (53839837) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Victory Dragon (44910027) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Volcanic Rocket (76459806) | Premium Volcanic engine searcher and efficient attacking body. |
| Wall of Revealing Light (17078030) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |
| Zombie Master (17259470) | Strong contemporary engine core, searchable threat, or niche tournament win condition. |

## Per-pack rarity spread

All `shop.json.iid` pools, including reward/special pools. IDs are pack parameters, not catalogue item indices. Entries are already passcodes, as consumed by `packContents`/`shopPurchase`; no translator conversion applies. Counts are unique passcodes, matching runtime rarity buckets. Fixed `ydc` decks are not random packs. Pool 8999 is an aggregate special pool. This report does not change pack membership or shop availability.

| Pack param | Total | N | R | SR | UR | Spread |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 44 | 39 | 2 | 2 | 1 | OK |
| 2 | 44 | 37 | 4 | 1 | 2 | OK |
| 3 | 44 | 38 | 4 | 1 | 1 | Thin: at most 2 SR/UR |
| 4 | 44 | 38 | 3 | 2 | 1 | OK |
| 5 | 51 | 44 | 1 | 5 | 1 | OK |
| 6 | 51 | 44 | 4 | 1 | 2 | OK |
| 7 | 55 | 49 | 2 | 2 | 2 | OK |
| 8 | 55 | 53 | 1 | 1 | 0 | Thin: at most 2 SR/UR |
| 9 | 55 | 45 | 7 | 1 | 2 | OK |
| 10 | 55 | 47 | 4 | 2 | 2 | OK |
| 11 | 45 | 39 | 5 | 0 | 1 | Thin: at most 2 SR/UR |
| 12 | 45 | 37 | 5 | 2 | 1 | OK |
| 13 | 45 | 35 | 6 | 3 | 1 | OK |
| 14 | 45 | 35 | 6 | 2 | 2 | OK |
| 15 | 54 | 34 | 10 | 2 | 8 | OK |
| 16 | 52 | 30 | 12 | 10 | 0 | OK |
| 17 | 52 | 32 | 10 | 5 | 5 | OK |
| 18 | 52 | 36 | 10 | 6 | 0 | OK |
| 19 | 52 | 35 | 12 | 4 | 1 | OK |
| 20 | 52 | 37 | 12 | 3 | 0 | OK |
| 21 | 51 | 25 | 20 | 5 | 1 | OK |
| 22 | 53 | 27 | 15 | 8 | 3 | OK |
| 23 | 53 | 27 | 12 | 11 | 3 | OK |
| 24 | 57 | 26 | 19 | 11 | 1 | OK |
| 25 | 53 | 37 | 15 | 1 | 0 | Thin: at most 2 SR/UR |
| 26 | 56 | 32 | 13 | 8 | 3 | OK |
| 27 | 55 | 31 | 19 | 3 | 2 | OK |
| 28 | 50 | 20 | 24 | 4 | 2 | OK |
| 29 | 50 | 31 | 12 | 4 | 3 | OK |
| 30 | 51 | 20 | 19 | 10 | 2 | OK |
| 31 | 56 | 31 | 19 | 5 | 1 | OK |
| 32 | 56 | 40 | 14 | 2 | 0 | Thin: at most 2 SR/UR |
| 33 | 60 | 31 | 22 | 7 | 0 | OK |
| 34 | 60 | 32 | 21 | 6 | 1 | OK |
| 35 | 59 | 29 | 23 | 6 | 1 | OK |
| 36 | 59 | 25 | 30 | 3 | 1 | OK |
| 37 | 59 | 21 | 30 | 7 | 1 | OK |
| 38 | 60 | 24 | 28 | 8 | 0 | OK |
| 39 | 60 | 29 | 27 | 3 | 1 | OK |
| 40 | 60 | 30 | 23 | 7 | 0 | OK |
| 41 | 60 | 29 | 23 | 8 | 0 | OK |
| 42 | 60 | 49 | 9 | 2 | 0 | Thin: at most 2 SR/UR |
| 43 | 60 | 37 | 16 | 7 | 0 | OK |
| 44 | 60 | 29 | 25 | 5 | 1 | OK |
| 45 | 80 | 49 | 28 | 3 | 0 | OK |
| 46 | 80 | 40 | 31 | 7 | 2 | OK |
| 47 | 80 | 50 | 20 | 9 | 1 | OK |
| 48 | 90 | 43 | 26 | 16 | 5 | OK |
| 1001 | 150 | 79 | 39 | 24 | 8 | OK |
| 1002 | 156 | 88 | 44 | 19 | 5 | OK |
| 1003 | 155 | 88 | 41 | 20 | 6 | OK |
| 8999 | 2369 | 1518 | 594 | 194 | 63 | OK |
| 9001 | 2743 | 1731 | 713 | 225 | 74 | OK |
| 9002 | 1469 | 1016 | 283 | 117 | 53 | OK |
| 11001 | 10 | 2 | 8 | 0 | 0 | NO SR/UR |
| 11002 | 10 | 4 | 2 | 4 | 0 | OK |
| 11003 | 10 | 0 | 5 | 5 | 0 | OK |
| 11004 | 10 | 0 | 6 | 3 | 1 | OK |
| 11005 | 10 | 4 | 3 | 3 | 0 | OK |
| 11006 | 10 | 3 | 3 | 4 | 0 | OK |
| 11007 | 10 | 3 | 7 | 0 | 0 | NO SR/UR |
| 11008 | 10 | 5 | 4 | 1 | 0 | Thin: at most 2 SR/UR |
| 11009 | 10 | 5 | 3 | 2 | 0 | Thin: at most 2 SR/UR |
| 11010 | 10 | 5 | 5 | 0 | 0 | NO SR/UR |
| 11011 | 10 | 8 | 1 | 1 | 0 | Thin: at most 2 SR/UR |
| 11012 | 10 | 5 | 2 | 3 | 0 | OK |
| 11500 | 20 | 0 | 5 | 13 | 2 | OK |
| 12001 | 40 | 11 | 24 | 4 | 1 | OK |
| 12002 | 40 | 16 | 17 | 7 | 0 | OK |
| 12003 | 40 | 25 | 10 | 4 | 1 | OK |
| 12004 | 40 | 12 | 17 | 10 | 1 | OK |
| 12005 | 40 | 19 | 11 | 8 | 2 | OK |
| 12006 | 40 | 15 | 20 | 5 | 0 | OK |
| 12007 | 40 | 20 | 12 | 6 | 2 | OK |
| 12008 | 40 | 13 | 15 | 11 | 1 | OK |
| 12009 | 40 | 20 | 13 | 7 | 0 | OK |
| 12010 | 40 | 18 | 12 | 7 | 3 | OK |
| 12011 | 40 | 17 | 22 | 1 | 0 | Thin: at most 2 SR/UR |

No R+: none.

No SR/UR: 11001, 11007, 11010.

Thin premium spread (1–2 SR/UR): 3 (1 SR, 1 UR); 8 (1 SR, 0 UR); 11 (0 SR, 1 UR); 25 (1 SR, 0 UR); 32 (2 SR, 0 UR); 42 (2 SR, 0 UR); 11008 (1 SR, 0 UR); 11009 (2 SR, 0 UR); 11011 (1 SR, 0 UR); 12011 (1 SR, 0 UR).

<!-- END GENERATED RARITIES -->
