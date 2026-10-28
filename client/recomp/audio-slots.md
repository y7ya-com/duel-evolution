# YO2 background-audio slots (yo2.exe Ver.080912) — inventory

Author: side session yo2-lang-sound, 2026-10-28. Static analysis (capstone over every call to the sound entry
points, decompiled/*.c, data/etc/bgm.txt from merge.dat) plus native YO2_SOUND_TRACE runs. User-facing word: "audio".

## How the game plays sound

One API, `yo2.exe` sound manager (yaneSDK CBGMLoader + mtknLib streaming, `src/.../yaneBGMLoader.cpp`):

| Function | Does |
|---|---|
| `00686560 play(id, fadeFrames)` | `id>>28 == 2`: background audio → `00688380(&id,&fade,0)` (stops the previous one, fade ≥ 5 frames). `id>>28 == 1`: sound effect → `00686e10` |
| `006866a0 stop(id, fadeFrames)` | background if `00688590(&id)` → `00688460`; else effect → `006872a0`/`00687080` |
| `00686780 stopAll(fade)` | `006884f0` (background) + `00687190` (effects) |
| `00685a60` init | reads `data/etc/bgm.txt` (the table below) and Sound.dat's `/SE/` `/BGM/`; no Sound.dat = no sound at all |

Ids: background `0x20000000 + n` (n = line of bgm.txt), effects `0x10000000 + n`. 460 call sites: 385 effects
(untouched), the rest below. **Slot = n.** The hook goes in `00688380` / `00688460` / `006884f0` (background-only
internals), so the effect path never changes.

## The 46 slots (data/etc/bgm.txt: file, loop, volume 0–127, loop point in samples, original label)

| n | file | loop | context (label) | requested from (call site → function: scene) |
|---|---|---|---|---|
| 0 | y_gx_01 | yes | Title (タイトル) | 0x7f99c1 → 007f8f90 CTitleScene; 0x689122 → 00688ef0 sound test (TestData) |
| 1 | y_gx_02 | yes | Deck editor (デッキ) | 008d0400 deck title, 008da960 deckScene, 008eccb0 presentScene, 008f25b0 tpScene, 008f71d0 tradeScene |
| 2 | b_card | no | Card get (カードゲット): pack opening | 0084a7d0 card-get (cardget_won), 00850d90 ×3 CCardPackCheckScene |
| 3 | y_gx_03 | yes | Login / caution (ログイン) | 0x7fbe8e → 007fba60 CCautionScene (manners/info pages) |
| 4 | y_gx_04 | yes | My Room map (自分の部屋) | 00825720 room exit (go_legacy/go_gx buttons); 00a55c10 room type 12 |
| 5 | y_gx_05 | yes | Yugi (legacy) area map (遊戯エリア) | 00a55c10 type 13; 009fac60; shop 00afd0d0, 00b00540 (shopbg_d) |
| 6 | y_gx_06 | yes | GX area map (GXエリア) | 00a55c10 type 14 (Duel Academy); shop 00afd0d0, 00b00c10 (shopbg_a) |
| 7 | y_gx_07 | yes | Event lobby (イベントロビー) | 00a55c10 room types 10, 15, 16, 17, 20 (Anniversary, Trial, Evolution match, Last Battle) |
| 8 | y_gx_08 | yes | Tournament lobby (大会ロビー) | 00a55c10 type 8; 0099dcc0 tournament tree; 0099ff00 |
| 9 | y_gx_09 | yes | Event (イベント) | no direct call found (server/script-driven, or unused) |
| 10 | y_gx_17 | yes | Rock-paper-scissors before a duel (じゃんけん) | 0x7c4fa6 → 007c3be0 SwfEngine_Janken |
| 11–15 | b_du1_1..5 | yes | Duel 1–5 (デュエルBGM1–5) | duel base track set by the server: 00695430 (Net) copies packet +0xbc00 → duel+0x684 |
| 16–18 | y_gx_12..14 | yes | Duel 6–8 GX | 00794cd0: random one of 16/17/18 as the duel's base track (duel+0x684) |
| 19–20 | b_du2_1..2 | yes | Tournament/event duel (デュエルBGM大会用) | 00794cd0: random 19/20 in room types 7, 9, 10, 15, 16, 17, 20 |
| — | base track | | Duel, no field spell | 00794f10 case 0: plays duel+0x684 (one of 11–20) |
| 21 | b_gishi | no | Ritual summon jingle (儀式) | no direct call found (Swf/effect script?) |
| 22 | b_syou1 | yes | Summon 1 (召還１) | no direct call found |
| 23 | b_syou2 | no | Summon 2 (召還２) | no direct call found |
| 24 | y_gx_15 | yes | Duel: winning by ≥3000 LP (デュエル有利) | 0x794fec → 00794f10 (fade 15) |
| 25 | y_gx_16 | yes | Duel: losing by ≥3000 LP, pinch (デュエル不利) | 0x794f8c → 00794f10 (fade 15) |
| 26 | y_gx_18 | no | Duel result: draw (ドロー) | 007a5a10, 0x7b004b → 007afcb0 CDuelEndEffectTask |
| 27 | y_gx_19 | no | Duel result: lose (負け) | 0x7b01da → 007afcb0 CDuelEndEffectTask |
| 28 | y_gx_20 | no | Duel result: win (勝ち) | 0x7b045b → 007afcb0; 0x9a0aaa → 0099ff00 (tournament) |
| 29 | b_instal | yes | Patcher/updater (パッチ) | 0x6ddaa0 → 006dbb40 CPatchMgr |
| 30–45 | field themes | yes | Duel with a field spell active | 00794f10 switch on field id (0x12a9098): 1→34, 2→35, 3→32, 4→33, 5→31, 6→30, 7→43, 8→37, 9→38, 10→42, 11→41, 12→39, 13→40, 14→36, 0x16→44, other→45 |
| 30 | b_yami | | Yami | |
| 31 | b_umi | | Umi | |
| 32 | b_moun | | Mountain | |
| 33 | b_sogen | | Sogen | |
| 34 | b_forest | | Forest | |
| 35 | b_kouya | | Wasteland | |
| 36 | b_fusion | | Fusion Gate (also 0064cb40, a dev test scene, CTakanoEntryScene) | |
| 37 | b_gaia | | Gaia Power | |
| 38 | b_water | | Umiiruka / Water World | |
| 39 | b_shine | | Luminous Spark (シャインスパーク) | |
| 40 | b_dark | | Dark Zone | |
| 41 | b_desert | | Desert Storm (デザートストーム) | |
| 42 | b_burn | | Burning Blood | |
| 43 | b_seiiki | | Sanctuary song (聖域の歌声) | |
| 44 | y_gx_10 | | Skyscraper | |
| 45 | y_gx_11 | | Any other field spell (共通) | |

Stop-all (background + effects) on scene exits: 008c1a70 duel result window (fade 15), 008cf5c0 / 008d7f80 /
008df280 / 008f6f20 / 008fac30 (deck editor, save/load/trade dialogs). Plain background `stop` is only used by the
debug console 00689540 (`bgm_play/stop/next/back/rew`, `se_play/stop`).

Not found statically: 9 (event), 21–23 (ritual/summon jingles), and one register-id site 0x903053 in 009019c0
(trade scene, probably an effect). The runtime hook logs every request with its slot and caller, so these show up
in play (YO2_SOUND_TRACE=1).

## Empty slots

Every slot is silent until the player adds files, with two exceptions so a duel never goes quiet midway: an empty
"winning" (24), "pinch" (25) or field-spell slot (30–45) keeps the duel's own slot (the last of 10–20) playing, and an
empty summon jingle (21–23) leaves whatever plays alone. Same rules in web/audio.js and rt/audio.cpp.

## Suggested user-facing groups (web/audiopage.js groups them for the page)

Title · Login · Patcher · My Room · Yugi area · GX area · Event lobby · Tournament lobby · Event · Deck editor ·
Card pack · Rock-paper-scissors · Duel (base: 11–20, one slot or per track) · Duel winning · Duel pinch ·
Field spell (30–45, or one shared) · Duel win · Duel lose · Duel draw · Summon/ritual jingles.
Default for every slot: silence. Effects (`se\*.wav`) are never routed through slots.
