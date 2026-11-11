# Parity gaps: original scenes the rewrite does not have yet

What the 2008 client did, what server/src (the protocol truth) has for it today, and the work left. Checked
2026-11-11 against server/src and main's Legacy HTML UI (client/web-shell/htmlui).

## Done in the rewrite

- **NPC reward pack pick**: main's pack picker (`screens/packselect.js`, CWindowPackSelect) now takes the pick when the
  HTML UI is up (`src/ui/htmlui/npc-pack.ts`): a row chooses the pack, OK claims it (0x4802). Rows carry the
  original's completion column (packCompletionLine), read from `GET /api/de/shop/pack` (`collected`); a pack the shop
  does not list shows no percentage. The NPC panel keeps the dialogue, gifts and received cards.
- **Duel Log** (CWindowModelDuellogTop / List / Search): the Main Menu's Duel Log entry opens it
  (`src/ui/htmlui/duellog.ts`, the list windows' Legacy frame). Top shows the character's duels, wins, losses, draws
  and win rate; Duel History pages the games (date, opponent, result, turns, how it was paired, ranked, match);
  Search narrows by opponent name, result and a date range. Read from `GET /api/de/duellog`
  (server/src/game/duellogList.ts): the server keeps one line per PvP game played on the character's profile
  (newest first, the last 200). The 2008 client kept the list itself (duellogs\\list.txt, written and searched
  locally; no list or search message existed), so the route is the rewrite's own.

- **Tournaments** (SCENE_TOURNAMENT): `src/network/tournament.ts` decodes every 0x51xx message as
  `server/src/game/tournaments.ts` encodes it (INFO, START, END, LOTTERY, LOTRESULT, PHASE, ROUND, ENTRY_START / DATA /
  END, LIST pages, ENDRESULT, TIMER, PCOUNTER, STATUS, CHKDUELSTART) into `SessionState.tournament`;
  `GameSession.requestTournament()` sends the empty requests (STATUS / REQENTRY enter while entry is open: the server's
  AUTO_ENTRY). A pairing's AUTODUELSTART 0x43a0 names the opponent and its 0x4306 is the normal PvP duel offer, so the
  match runs in the usual duel flow (an admin tournament is unranked on the server). Windows (`src/ui/htmlui/tournament.ts`,
  Main Menu > Tournament): JoinGunsling (main's dialog.js box, mock/dialog-gunsling.json's layout), the bracket (the duel
  frame list window: status, round / subtitle, countdown, entries / remaining / watching, the seats with wins and
  Duelling / Waiting / Out, the opponent or walkover line), the end result in AboutEvent (champion, runner-up). Tests:
  `tests/tournament.test.ts` drives the server's Tournaments class (entry, draw, round, report, end) and folds its
  real bytes. Not done: the original drew the bracket as a picture tree (here a list), DuellogTour (the tournament
  duel log), and a TP shop.
- **Event information** (CWindowModelInformation): EVENTINFO 0x5000 (serial, world, state) is read into
  `SessionState.eventInfo` and shown in main's Information window (icon bar, chop, list, the ×) until closed; a running
  tournament adds its line. AboutEvent / GoEvent's texts are not there (see below: the server sends no text).
- **Duel help strip** (CWindowModelHelp): while the duel screen's own panel asks (card, place and declaration
  prompts), a thin-framed strip at the top of the field shows the prompt's first line, the original duel texts the
  prompt already carries (DuelTextCatalog). The strip's exact place in the original is not captured (here 262, 6,
  500 x 32); the phase-by-phase help lines (yo2text's CHelpDialog strings) are not in the rewrite's gamedata, so only
  prompts get a strip.

- **NPC duel record** (CWindowResultNpc): after an NPC duel the duel result shows main's `screens/result.js` NPC
  record (`src/ui/htmlui/duel-result.ts` npcResultWindow: the 512 board npc_result_dai_01_c01 at 256, 64, the NPC's
  name, the result, Wins / Losses / Draws with their 1, 1 shadow) in place of the two player records. The counts are
  the server's NPCBIN entry (0x4234, bytes 0..2 of the NPC's 4: server persist.ts npcResult) read when the talk opens,
  plus this duel's server result (the server counts the same result, capped at 255). The rewrite does not re-read
  NPCBIN after the duel: the server's 0x4233 GETPBIN clears pending prizes (persist.ts h_getpbin pendingClear), so
  asking for it before the gift is claimed would lose the gift. The title is ShadowText (the engine drew
  npc_result_title_01_? art). Tests: `tests/npc-result-record.test.ts`.
- **NPC talk balloon** (CWindowModelBalloon): the NPC's lines are drawn in the shop clerk's balloon look
  (`src/ui/npc.ts` BALLOON_CSS).
- **NPC item gifts by name, in part** (CWindowModelItemGet): "You got <item>!" per gifted bit the rewrite can name
  (`src/npcs/gift-names.ts`): titles (class 10) from the server's title table (features/titles.ts). The rest are
  counted ("N item rewards confirmed. Item names are unavailable."): see the server table below.

- **What a pack holds** (CARD_PACK_CHECK): main's `screens/pack-contents.js` from the legacy shop's Booster Packs
  window (its art hotspots: the window carries its packs' ids, `ShopItem.packId`) and from the NPC pack picker's
  Contents key, as well as inside the card shop (`GET /api/de/shop/pack`).
- **Account sanctions** (0x3004 flags 0x20 chat, 0x40 trade): decoded at login (`network/session.ts` decodeSanctions);
  the chat line is greyed out, Card Swap (player card, Find a Player) disabled.
- **Forbidden / limited list** (0x5600): decoded (`network/banlist.ts`) and used for the deck's limits, marks and checks.
- **HD game cursor**: main's `cursor.js` (CSS cursor, HD art, the click ripple layer) on every screen.

## The server has it, the rewrite does not (client work only)

| Original | Server today | Rewrite work |
| --- | --- | --- |
| The HD cursor's hover and busy looks | nothing (client art: data/common/m_cursor, ui/hd/) | `src/ui/htmlui/cursor.ts` builds the hand's sprites for main's `cursor.js` itself (no engine): plain n01, over a control n02, busy t01..t08 at 12 Hz, the e01 ripple growing and fading over 330 ms. Which mausuk set the original's CHandCursorTask shows on hover / while waiting, and its frame timing, is not decompiled yet: match them once it is. Over a Booster Packs art (main's hotspot) the band no longer follows the hover (main forwards it to the engine's canvas) |
| The sanctions' notices | chat.ts "Chat is disabled for this account.", trade.ts / cosmetics.ts refuse a barred trade | The rewrite greys the chat line out with the server's wording and disables Card Swap (its label says "Card Swap is disabled for this account."); the original's own notice text for 0x3004's 0x20 / 0x40 is not found in the decomp data |

## The server does not have it (server work first)

| Original | What it did | Server work needed |
| --- | --- | --- |
| Shop pack names in the game-text language | The original's shop named its packs in the chosen language (its yo2text tables). Main's card shop (`[data-key="card-shop"]`, shop/index.js) reads `/api/de/shop` without a language and shows the server's names, so switching the language leaves them (and the featured cards' names, English from `gamedata/cards.json`) as they are: `server/src/game/shop-api.ts` takes no language (checked 2026-11-11), so the rewrite cannot ask for them. The rest of the UI follows the language (src/ui/LANGUAGE.md); the settings acceptance case "shop pack names follow the language" is cut until it does | The shop API taking the language (or the client mapping pack ids through the game-text tables) |
| SCENE_PRESENT (Present) | The present box: cards and items the operator sent the player, listed and claimed one by one | A present inbox: storage per character, a list message and a claim message (with the grant through the same paths as NPC gifts), and an admin way to send one. Nothing in server/src today |
| Tournament Points (TP scene) | The player's TP total and what it buys | The rewrite's profile row reads the player info's u32 TP (features/profile.ts), but the server writes 0 there. `persist` keeps `rec.tp`, but `PRIZE_TP` is 0 in tournaments.ts, so nothing awards TP, and no message or endpoint reads it. Needs a TP award rule, a read (profile field or `/api/de/...`), and whatever TP exchanges for |
| Information texts / event pages | The news and event descriptions the Information and AboutEvent windows showed; GoEvent's "go to the event" question. Missing texts: every event title and body, what each EVENTINFO state means, GoEvent's question | EVENTINFO carries only (serial, world, state). An event text source (admin-set titles and bodies, per language) and a message or endpoint that serves them |
| Duel Log replays (CWindowModelDuellogOperation's Play, the saved duellogs\\*.log; DuellogTour, the championship logs) | The duel record of a game, replayed in the duel screen, and the operator's championship logs downloaded from the site | The server sends the record (0x6010..0x6016, duel/duellog.ts) after a PvP game but does not keep it. Needs the records stored (per game, by the Duel Log line's id), a read for one, and a replay viewer in the rewrite (none today: the Duel Log lists the games without a Play button) |
| NPC item gifts by name (CWindowModelItemGet) | "You got <item>" for each gift, with the item's picture | The gifts arrive as PBIN bits only (0x5205; persist.ts pendingAdd keeps classes 1/2/3 avatar parts, 7 challenge rights, 8 recipes, 10 titles). Titles are named client-side; avatar parts and challenge rights have no name table in the rewrite's gamedata, and recipe bits are named only where the deck recipe catalogue carries the bit (`giftItemName`'s recipe lookup is not wired into the panel yet). Needs the item table (name and picture per bit) served, or sent with the grant |
