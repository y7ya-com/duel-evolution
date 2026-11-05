# Domino City and Duel Academy: how the original split the worlds, and options for the revival

Research note, 2026-11-04. Sources:

- the hand-decompiled client (`client/src`) and the recompiled client's overrides (`client/recomp`);
- the game text (`yo2text_e`, cited as `text NNNN`);
- the server's port of the YOLaucher Python emulator (`server/src`, comments cite `py yo2srv/...`);
- the sister project duelforge (`/tmp/ref/duelforge`, read-only);
- public web sources, cited by URL in section 4.

Paths below are repo-relative. "Inference" marks anything no source states.

**Two corrections to the brief.**

- Duel Evolution did not launch in 2008. Yugipedia and GameFAQs date it January 2007: Japan and North America on
  January 1 per Yugipedia, the US on January 11 per GameFAQs. The client we run is a 2008 build (`yo2.exe
  Ver.080912`, `client/recomp/audio-slots.md:1`), which is where "2008" comes from.
- The `py yo2srv` server is YOLaucher's community emulator, not Konami's server (`client/src/shop/yo2shopEntry.h:8`).
  For "what the 2008 server did", the evidence is the client, the game text and the emulator's research data. The
  emulator's own logic is not evidence.

## 1. Executive summary

- The original split the game into two **lobby worlds behind two doors in My Room**:
  - the **blue door, Domino City** (Duel Monsters era: Battle City, Kaiba Corp, Game Shop Kame);
  - the **red door, Duelist Academy** (the GX era: the Academy grounds, Store, Duel Space, Slifer Red dorm).
- Each world was its own set of lobby servers ("rooms", by room kind), with:
  - its own maps (5 Domino, 4 Academy, not connected to each other);
  - its own named cast and original NPCs (6 famous and 12 original each);
  - its own shop clerk, backdrop and area music;
  - its own event lobbies;
  - a world-specific outfit and duel disk.
- The character was **one** character in both worlds: one card collection, one MP wallet, one deck list, titles, friends.
- What changed per world was the **look**. Every character stored **two avatars**, one per world:
  - face, hair and other features were shared;
  - **outfit and disk were per world**, and each world allowed only its own series;
  - in the Academy the dorm uniforms were **level-gated**: Slifer Red at once, Ra Yellow at LV 10, Obelisk Blue at
    LV 20.
- Konami gave no rationale that I could find.
  - The evidence points to an **era/brand split, done as themed content and cosmetics**. The split was not economic.
  - It let one game serve both the DM nostalgia audience and the then-current GX audience.
  - It let Konami ship each era's cast, outfits and events as content drops. Domino's famous NPCs were added in
    2007-2008.
  - It gave the Academy a school-progression fantasy: start in the Beginner's Lobby, then dorm uniforms by level.
- The revival already merged the two into **one connected world**. Since 2026-11-05 it also has **one look**: a
  character wears the same look in both worlds (section 5).
- **Recommendation:** keep one character and one progression. Give each world a role:
  - **the Academy is the ranked school:** rated ladder, dorm uniforms by rating, the top 1% "star students" dress
    freely;
  - **Domino City is the casual and social hub:** free duels, trading, fun formats, and scheduled Battle City
    tournaments.

## 2. Mechanics per world (the original)

| Aspect | Domino City (world 0, "DM" / 遊戯エリア) | Duelist Academy (world 1, "GX" / GXエリア) | Evidence |
|---|---|---|---|
| Entry | Blue door in My Room | Red door in My Room | text 7108-7109, 7116 (blue door, Domino server); text 7049, 7070 (red door, Academy server); `client/recomp/rt/gate.c:1-4` |
| Room kinds that select the world | 7, 8, 13, 15 | 1, 9, 10, 11, 14, 16, 17, 20 (12 = My Room keeps the current world) | `client/src/Game/yo2GameManager.cpp:141-151` (rankForLobbyKind); `server/src/config.ts:10-15` |
| Lobby names | Domino City Lobby, GUNSLINGER Lobby, CHAMPIONSHIP Lobby | Duelist Academy Lobby, Beginner's Lobby, TRIAL / ANNIVERSARY / Special lobbies | text 3050-3066; room kinds per `server/src/game/gate.ts:11-17`, `client/recomp/audio-slots.md:31-32` |
| Maps (areas) | d01 Clock Square, d02 Game Shop "Kame", d03 Domino Pier, d04 Kaiba Corporation, d05 Kaiba Corp. R&D Lab (areas 0, 1, 2, 3, 9) | a01 Duel Academy (entrance), a02 Store, a03 Duel Space, a04 Slifer Red Dormitory (areas 4-7) | `client/src/Game/yo2FieldMap.cpp:14-36` (exits only within each world); `client/src/Game/yo2GameManager.cpp:153-175`; text 8100-8104, 8150-8153 |
| Link between the worlds | None on the map: back to My Room and through the other door | (same) | `yo2FieldMap.cpp` exit tables: Domino maps lead only to Domino maps (and the duel room), Academy maps only to Academy maps |
| Famous NPCs (3 friendship tiers each) | Yami Yugi (Clock Sq.), Seto Kaiba (R&D Lab), Téa (Kame), Joey (Pier), Yami Marik (Pier), Yami Bakura (Clock Sq.) | Jaden (dorm), Jesse (dorm), Chazz (Duel Space), Hell Kaiser (Duel Space), Alexis (Store), Aster (entrance) | `server/src/game/npcs.ts:13-16` (py mundo/npc.py spots) with `gamedata/lobby.json npc_ids`; matches Yugipedia's NPC pages (section 4) |
| Original NPCs | 12 (areas 0-3, e.g. missbomb, gouk, bankara, BeeBee) | 12 (areas 4-7, e.g. Abigail, A-lien, AoJ, Queen Ryo) | `server/src/game/npcs.ts:19-26` (py research/mundo ORIGINALS); each has its own 5-win prize card |
| NPC friendship titles | e.g. Yami Yugi's title "KING OF DOMINO CITY" | e.g. Jaden's "KING OF DUEL ACADEMY" | text 9140, 9146 and 7640, 7646; pairing title to NPC by the parallel id order is inference; `server/src/game/persist.ts:657-660` TITLE_BITS |
| Character costumes (NPC prizes) | Yami Yugi's, Kaiba's, Joey's, Marik's, Téa's garms (series 2) | Jaden's, Chazz's, Jesse's, Kaiser's, Astor's garms (series 3) | `gamedata/lobby.json` avatar_pbin rows 121-124, 374-375 / 135-139; text 3319-3535 |
| Outfit slot | 19 Domino outfits (Domino High uniform default, tracksuits, punk, Black Suit) | 19 Academy outfits (Red / Yellow / Blue uniforms, "2" variants, tracksuit) | avatar_pbin slot 6, series 2 vs 3 (count over `gamedata/lobby.json`) |
| Duel disk slot | 26 Battle City-line disks (default "Battle City Model") | 32 Academy-line disks (default "Duel Academy Model", Cyclone, Blade) | avatar_pbin slot 8, series 2 vs 3; text 3410-3472 |
| Every other avatar slot | shared (series 1): hair, face, eyes, mouth, glasses, colours | shared | avatar_pbin slots 1-5, 7, 9 are all series 1 |
| Default look | Domino High uniform 0x70, Battle City disk 0xb0 | Academia red uniform 0x80, Academy disk 0xb8 | `client/src/Game/Avatar/yo2AvatarData.cpp:32-39`; `client/src/Game/yo2GameManager.cpp:83-89` |
| Dress code | Only series 1 or 2 parts. Anything else resets the avatar to the Domino default. | Only series 1 or 3 parts, else the Academy default | `avatarValidate`, `client/src/Game/yo2GameManager.cpp:43-90` (run on every drawn avatar, in the editor and at player select) |
| Rank uniforms | none | Slifer Red always; **Ra Yellow from LV 10, Obelisk Blue from LV 20** (base uniforms 0x81 / 0x82; the editor hides them below the level) | `client/src/ChangeAvatar/yo2ChangeAvatar.cpp:355-357, 415-427` |
| Uniform ownership | The 4 Domino High colours are initial items | All three dorm uniforms are **initial** (owned from the start); the gate is by level, not ownership | avatar_pbin column 2 (`initial`) = 1 for rows 112-115, 128-130 |
| Shop | Same MP and the same item list. Clerk with a "Ho ho" grandfather voice (Game Shop Kame), DM backdrop | Clerk from the Academy store, GX backdrop | `client/src/shop/yo2ShopText.cpp:13-34` (text 8350-8366 vs 8370-8385); `client/recomp/audio-slots.md:30-31` (shopbg_d / shopbg_a). The server's shop list has no world field (`server/src/game/shop.ts`). The avatar shop lists only the world's series (`client/recomp/ovr/worldparts.c:15-17`). |
| Packs and cards | No per-world packs found | (same) | `gamedata/shop.json` has one list; `0x5208` carries no world. Inference: packs were shared. |
| Area music | y_gx_05 "Yugi area" | y_gx_06 "GX area" | `client/recomp/audio-slots.md:30-31` |
| Events | GUNSLINGER (auto-matched singles, 60 s turns, 7-star streak badge); CHAMPIONSHIP (prelims and final, Domino server) | Beginner's Lobby; DUELIST TRIAL, ANNIVERSARY TRIAL, EVOLUTION MATCH, ULTIMATE MATCH (auto-matched; star badges) | text 7049, 7070, 7082, 7104, 7108, 7116; `client/src/Game/Avatar/yo2PlChibiAvatar.cpp:133-160`; `server/src/duel/pvpMatch.ts:40` |
| Level gate on entry | Not reachable at LV 0-1 ("Room not available") | At LV 0-1 only the Beginner's Lobby; at LV 2+ the main rooms, and the Beginner's Lobby disappears | `client/recomp/ovr/allrooms.c:1-5`; text 7111 (events: Level 2 and 35 duels) |
| Event prizes across worlds | CHAMPIONSHIP (a Domino event) awarded disks "a perfect match" for the Slifer / Ra / Obelisk uniforms | | text 7508, 7515, 7517: rewards crossed the worlds |
| Duel rules | By room kind (GUNSLINGER timers, event match formats), not by world. Same card pool and banlist. | (same) | `server/src/game/gate.ts:49-55` (rules follow the entry room) |
| Chat / visibility | Block chat per area within one room server. You saw only players in your room's block. | (same) | Inference from the protocol: a block = room + area (`server/src/game/hub.ts:33-40`, py bloques) |

## 3. Moving between worlds, identity, and what carries over

**Moving (original).**

- To change worlds you went back to **My Room** and took the other door. The door's list offered that world's rooms
  (servers by language and kind).
- Entering a room set the client's world from the room kind (`CGameMng::setLobbyRankFor`,
  `client/src/Game/yo2GameManager.h:46-54`).
- That switched which of your two avatars was drawn and sent (`0x4170` carries the world and the 16 avatar bytes).
- There was no walkway between the maps. My Room (kind 12) kept whatever world you last had.
- Free Duel and Deck Editor modes are revival additions (`client/recomp/ovr/freemode.c:1`).

**Identity.**

- One character (account slot) held **two avatar records**, `avatar[0]` Domino and `avatar[1]` Academy:
  - client: `client/src/Net/NetLobby_Parse.cpp:259`, `client/src/duel/NetDuel.h:33` (`parts[3]`, the third unused);
  - server: `server/src/db/game-schema.ts:70-71` (`avatar_a`, `avatar_b`).
- The appearance editor dresses the current world's avatar. On OK it copies everything except **outfit and disk** to
  the other avatar (`avatarCopyLooks`, `client/src/Game/yo2GameManager.cpp:92-97`; `yo2ChangeAvatar.cpp:550-556`). Your
  face and hair are you; the outfit and disk are your world look.
- Other players see you in **their** world's look: LIST2 fills the receiver's slot (`NetLobby.h:788-790`). Duel
  portraits carry both looks (`NetDuel.h:33`).
- My Room's disk shelf has two disk switches, "the DM disk and the GX disk"
  (`client/src/MyRoom/yo2DuelDiscShelf.h:1-3`).

**What carries over:** everything except the look.

| Item | Per world? | Evidence |
|---|---|---|
| Cards (trunk), decks, MP | Shared | One character record; no world field in the shop, deck or trade messages |
| Titles, friendship progress with NPCs | Shared (the NPCs live in one world, the reward is yours everywhere) | persist TITLE_BITS / NPC_PRIZE_BITS keyed by NPC |
| Avatar items owned (PBIN bits) | Shared ownership, per-world wearability | `avatarValidate` series check |
| Outfit + disk worn | Per world | the two avatar records |
| Friends, mail, ignore list | Shared | friend location shows "Domino City" / "Duel Academy" / "My Room" (`server/src/game/lobby.ts:716-717`) |
| Chat | Per room block originally. Now server-wide Global and Trade (`server/DESIGN.md:205`) | |
| Level / duel record | Shared, and it gates both worlds' entry and the Academy dorm uniforms | `allrooms.c`; `yo2ChangeAvatar.cpp:415-427` |

## 4. Why Konami split them: sourced versus inferred

**From sources (web; Yugipedia's normal pages, Wayback and Reddit refused automated access, so this is thin):**

- Duel Evolution was a major update of Yu-Gi-Oh! Online (launched April 2005). It went live around January 2007 and
  added avatars, a redesigned duel screen and deck editor, and a Duel Shop. Duel Accelerator replaced it on
  2009-12-18, and the service closed on 2012-09-30.
  - https://yugipedia.com/index.php?title=Yu-Gi-Oh!_Online:_Duel_Evolution&action=raw
  - https://yugipedia.com/index.php?title=Yu-Gi-Oh!_Online:_Duel_Accelerator&action=raw
  - https://gamefaqs.gamespot.com/pc/942981-yu-gi-oh-online-duel-evolution/data
- Avatars could explore parts of Domino City (original series) and Duel Academy (GX), with series characters and
  original NPCs placed in both. Each NPC page ties the character to "Domino City"-themed or "Duelist Academy"-themed
  lobbies.
  - https://lutris.net/games/yu-gi-oh-online-duel-evolution/
  - https://backloggd.com/games/yu-gi-oh-online-duel-evolution/
  - Yugipedia NPC pages through its API, e.g. "Jaden Yuki (Online)".
- NPC add dates on those pages:
  - Kaiba, Téa and Yami Yugi: 2007-09-06;
  - Joey and Jesse: 2008-01-24;
  - Hell Kaiser and Yami Bakura: 2008-02-28;
  - Aster: 2008-05-22;
  - Jaden, Alexis and Chazz: no date given.
- New players stayed in a beginner lobby until Level 2 (about 36 duels). Kaiba could be challenged only after
  beating other NPCs 5 times (Yugipedia).
- **No Konami statement, FAQ or patch note explaining the split was found.**

**From the game itself (primary, but it shows what was done, not why):**

- The Japanese labels name the worlds **遊戯エリア "Yugi area"** and **GXエリア "GX area"**
  (`client/recomp/audio-slots.md:30-31`). Internally the split was the two anime series.
- The Academy was the **newcomer's world**: the Beginner's Lobby is an Academy room kind, the default world is the
  Academy, and Domino City opened only at LV 2.
- The Academy also had **school progression** in the dress code (dorm uniforms by level). Domino was where the
  **CHAMPIONSHIP** (the Battle City tournament fantasy) and GUNSLINGER ran.
- The economy was not split. One wallet, one collection and one shop list served both worlds. Prizes from a Domino
  event were Academy cosmetics (text 7508, 7515, 7517).

**Inferred rationale (mine):**

1. **Two audiences, one game.** In 2007 the GX anime (2004-2008) was current, and the DM cast was the nostalgia
   brand. Two themed worlds let each audience live in its era without forking the card game.
2. **Content cadence.** Each world is a container for drops: a famous NPC with a friendship chain, its costume and
   title, a disk line, an event lobby. The staggered 2007-2008 NPC dates fit a schedule that fed both worlds.
3. **Load and community sharding.** Rooms were separate servers per language and kind. Two worlds doubled the
   themed places to fill and gave event rooms a home. This is technical inference from the room architecture.
4. **Onboarding fantasy.** You start as a student at the Academy (Slifer Red, the bottom dorm), climb dorms by level,
   then "graduate" into Battle City's tournaments. This follows the GX premise, where Jaden starts in Slifer Red
   (text 8904). Konami may not have framed it so explicitly.
5. **Cosmetic scarcity.** Per-world outfits and disks double the wardrobe a completionist wants, and make each era's
   look visible only in its own place.

## 5. How the revival treats the worlds today, and where it diverges

| Area | Revival | Original | Where |
|---|---|---|---|
| Topology | **One world.** Every room port leads into one block that lists all nine areas, so both worlds' players see each other and share block chat. The door only picks the start area. | Two separate sets of room servers | `server/src/game/gate.ts:10-17`; `server/src/game/hub.ts:23-25, 297-309`; commit e2da43c |
| Travel | **Ship crossing:** Domino Pier's gangway lands on the Slifer Red dorm's sea cliff, and back. The blocklist gives each other-world area that world's main kind, so walking across switches the avatar's world. | My Room doors only | `client/recomp/ovr/crossing.c:1-9`; `hub.ts:305-308` |
| Doors | One room per door, entered straight from My Room. CHAMPIONSHIP is announced only while a tournament runs. GUNSLINGER and the Beginner's Lobby are no longer announced (their ports still work). | Lists of rooms per world | `client/recomp/rt/gate.c`; `server/src/game/gate.ts:11-17` |
| Level gates on rooms | Removed: every room shows at any level | LV 0-1 Beginner's Lobby only | `client/recomp/ovr/allrooms.c` |
| One look | **Changed** (owner, 2026-11-05): a character has one look for both worlds. `avatar_a` / `avatar_b` (the protocol's world 0 and 1 copies) are always the same; any change, from either world, writes both (`persist.ts` `setLook`; `avatar.w` records the world it was made in), and the others get a 0x4181 for both worlds. A character saved with two different looks keeps the one of the world it was last in (`avatar.w`), else Domino's; one saved look is copied to the other (`persist.ts` `unifyLook`). | Two looks, one per world | `server/src/game/persist.ts` (`unifyLook`, `setLook`, `avatarParts`); `hub.ts` (`select`, 0x4170) |
| Dress code | **Changed** (owner, 2026-11-05): no world rule. Anything owned (and made for the body) is worn in either world, Domino outfits in the Academy included. The one remaining rule is the rank gate on the dorm uniforms: Slifer Red for everyone, Ra Yellow and Obelisk Blue once that school was reached. Graduation is a status only, it unlocks no outfit. (2026-11-04 had a per-world rule, Domino outfits Domino only.) | Strict per series | `server/src/game/cosmetics-catalog.ts` (every variant `worlds: [0, 1]`); `server/src/game/ranking.ts` `rankRowAllowed` |
| Rank uniforms | **In progress in this worktree** (untracked `ranking.ts`): <ul><li>Glicko-2 from duelforge; schools Slifer / Ra / Obelisk / Master from rating;</li><li>Slifer is open to everyone; a 50-point demotion buffer;</li><li>the top 1% of the active ladder (once it has 20 or more players) may wear any owned outfit in the Academy;</li><li>enforcement: `0x3114` masks uniforms not yet unlocked, and flag bits 1022 / 1023 tell the client editor to drop its LV gate and allow leeway.</li></ul> | Uniforms by LV 10 / 20, owned by default | `server/src/game/ranking.ts:1-11, 48-112, 170-209`; `server/src/game/persist.ts:409-421`; `server/src/game/cosmetics.ts:138` |
| Cosmetic boxes | Paid pools exclude school uniforms and ac_* costumes. Every drop is wearable in both worlds (one look). | Shop sold per-world items | `server/docs/ECONOMY.md:223-237, 297` |
| NPCs | Same cast and placement as 2008. Normal NPCs get a look valid in the asker's world (NPC looks still use the per-row worlds, `avatarRowWorlds`). | Same | `server/src/game/npcs.ts:84-93, 141-170` |
| Progression | One per character, as the original. PROGRESSION mode: cards from the shop, prizes and trades; one free starter deck, no era choice. | Same shape | `server/src/game/persist.ts:177-195`; `server/src/game/starter.ts:1-29` |
| Chat | Global and Trade are server-wide; whispers and team chat work across areas | Per room block | `server/DESIGN.md:205` |
| Free Duel | Runs in Academy-kind blocks of its own | n/a | `client/recomp/ovr/freemode.c:4`; `server/src/game/freemode.ts` |

**Divergences worth noting.**

- **The dorm uniforms are "initial" PBIN items.** Ownership alone can never gate them. The rank gate has to stay
  rule-based, and it does: `uniformAllowed` plus the `0x3114` masks.
- **The native editor applied its LV gate only when dressing in the Academy** (`world_ == 1`). The new rule lists
  Academy outfits in Domino too, so the **server** rule must cover Domino as well. As written, `0x3114` masking does
  that. It is worth a test: a low-rank character opens the editor in Domino and must not see Ra or Obelisk.
- **duelforge, the sister redesign, made different choices:**
  - one connected overworld (My Room opens onto the Domino hub, which warps to the Academy:
    `clients/web/src/lib/world/mapGraph.ts:1-6`);
  - the cast kept to its region (`clients/web/src/lib/world/npcs.ts:1-12`);
  - **era-split card shops**: Kame Game sells DM-era boosters (before 2005), the Academy shop sells GX-era ones
    (`packages/world-protocol/src/index.ts:841-845`; `apps/world/src/packs.ts:80-96`);
  - starter decks, one from each era (`index.ts:85, 864`);
  - one Glicko rating shown as GX dorm tiers, with uniforms granted by school and only from the World ladder, never
    Free Duel (`apps/world/src/ranking.ts:8-10, 160-166`);
  - disks with a DM or Academy art slot and a selling shop, but no world-restricted wearing that I found.

## 6. Design options

(Written 2026-11-04. Since 2026-11-05 the owner chose one look for both worlds with no world dress code, only the
dorm uniforms' rank gate (section 5); the options below that rely on per-world looks or dress codes are superseded on
that point.)

### A. Keep the strict 2008 split

What it means: two door-only worlds, per-world dress code, no crossing.

- **For:**
  - the most faithful option;
  - each world keeps a strong identity;
  - doubles the wardrobe goal.
- **Against:**
  - splits a small population in two;
  - the revival already undid it (the crossing, the one block, and the owner's "Academy outfits anywhere");
  - per-world outfits that drop from boxes feel like dead items;
  - no gameplay reason to choose a world.
- **Verdict:** not recommended. It restores friction without restoring the reason, which was a larger population and
  a content cadence.

### B. One shared progression, world-flavoured content (the status quo, made explicit)

What it means: one character, one wallet, one connected world, and each world has its own flavour:

- the cast, costumes and titles of its era;
- its own shop clerk;
- optionally era-split packs, as duelforge did: Kame for DM-era boosters, the Academy for GX-era ones;
- seasonal events tied to a world.

- **For:**
  - matches what the original actually did with the economy (shared);
  - cheap: mostly done already;
  - era packs give a reason to walk to the other world.
- **Against:**
  - flavour alone gives the worlds no different *purpose*;
  - the two looks become a chore if neither world matters.

### C. The Academy as the ranked/competitive space

What it means: rated PvP queues are started from (or only count in) Academy rooms.

- Dorm uniforms follow the rating (as `ranking.ts` does).
- The nameplate shows the school.
- The top 1% are "star students": free to wear any owned outfit in the Academy.
- Academy events (DUELIST TRIAL, EVOLUTION / ULTIMATE MATCH) become ranked seasons or trials.

- **For:**
  - the dorm system is literally a ranking (Slifer, then Ra, then Obelisk);
  - it reuses the original's level-gated uniforms, upgraded from level (grind) to rating (skill);
  - the uniform becomes a visible status signal where it is meaningful;
  - the top-1% dress freedom is the "you've earned the right to break the dress code" reward the owner wants.
- **Against:**
  - the original's Academy was also the beginners' world (the Beginner's Lobby), so new players land in the
    competitive space unless onboarding is moved;
  - casual players may feel pushed out of half the map;
  - uniform loss on demotion needs care (the 50-point buffer exists).

### D. Domino City as the casual and social hub

What it means:

- My Room's main exit goes to Domino;
- free and unrated duels, trading, GUNSLINGER-style fun formats and NPC friendship chains live there;
- Domino outfits are the "street clothes" you wear to hang out;
- scheduled tournaments run in Domino (the CHAMPIONSHIP lived on the Domino server, and Battle City is a tournament
  city).

- **For:**
  - matches the DM fantasy (town, shops, rivals) and the original's CHAMPIONSHIP placement;
  - gives Domino outfits a natural home under the owner's existing rule (Domino outfits outside the Academy only).
- **Against:**
  - tournaments in Domino and the ladder in the Academy split "competitive" across both worlds. That is fine if
    presented as "ladder = school, tournaments = the city".

### Recommendation: B as the base, plus C and D as the two worlds' roles

**One character, one wallet, one collection, one connected world** (as now). Each world gets a *function*, not just a
skin:

- **Duel Academy, the school (ranked).**
  - The rated ladder lives here.
  - Dorm uniforms come from rating: Slifer for everyone, Ra and Obelisk by school, Master for the top tier.
  - The top 1% may dress freely inside the Academy.
  - Academy events are the ranked trials.
  - Keep the Academy's academic tone: placement matches as the "entrance exam".
- **Domino City, the town (casual, social and tournaments).**
  - Unrated duels and NPC friendship chains.
  - Trading, the social plaza and fun formats (GUNSLINGER).
  - Scheduled Battle City / CHAMPIONSHIP tournaments.
  - Domino outfits are worn here, and anywhere outside the Academy.
- **Onboarding.**
  - Start new players in Domino (the hub) with a "go enrol at the Academy" pointer once they have a legal deck.
  - The original did the reverse; flip it so that ranked is opt-in.
  - Alternatively, keep a Beginner's Lobby inside the Academy for unrated practice.
- **Optional flavour:** era-split pack rotations (DM-era boosters at Kame, GX-era at the Academy store). This gives
  both worlds a reason to visit, and duelforge already validated the idea.

Why this one:

1. It is what the existing cosmetic rules already imply. Academy clothes are universal (school pride); Domino clothes
   stay in town; uniforms are tied to rating.
2. It reuses the original's own patterns: dorm uniforms gated by progression, the Academy as a school, the
   CHAMPIONSHIP in Domino.
3. It keeps the population whole.
4. It gives the two-looks system a reason to exist: one look for school, one for town.

## 7. Open questions for the owner

1. **Where do new characters start?**
   - Domino as the hub, with the Academy opt-in for ranked; or
   - the Academy as in 2008 (Beginner's Lobby, then dorms)?
2. **Does ranked play have to be started in the Academy?** Or can it be queued anywhere and only *shown* in the
   Academy (uniforms, nameplate)? Queueing from anywhere is friendlier; Academy-only is more thematic.
3. **Do dorm uniforms come off on demotion?** Or does peak school stay wearable (duelforge grants cumulatively and
   never revokes)? `ranking.ts` currently derives the school from the stored record, with a buffer.
4. **Master tier:** a uniform of its own (new art), or only the leeway? Should top-1% leeway also allow Domino-only
   *disks*? Disks are already universal, so this is about outfits only.
5. **Is the free Slifer Red uniform the Academy default?** It has to be, because of the client's reset to 0x80. Or
   should unplaced players wear a distinct "applicant" look, such as the Academy tracksuit?
6. **Era-split packs:** adopt duelforge's DM / GX shop split, or keep one shop list?
7. **Should chat or presence be scoped per world** (block chat per area is already the case), or stay fully global?
8. **Restore the Beginner's Lobby** as a protected space for unrated new-player duels, or leave it unannounced?
9. **Tournaments:** keep the CHAMPIONSHIP in Domino (faithful) even though the ladder is in the Academy?
10. **NPC cast growth:** add later-era characters per world? Mai and Jim Crocodile Cook already have friendship
    titles (text 7652-7653) but no 2008 spot.
