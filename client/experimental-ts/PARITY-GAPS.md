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

## The server has it, the rewrite does not (client work only)

| Original | Server today | Rewrite work |
| --- | --- | --- |
| CARD_PACK_CHECK (what a pack holds) | `GET /api/de/shop/pack?id=` (shop-api.ts shopPackView: cards, odds, owned, pulls) | Mount main's `screens/pack-contents.js` (`openPackContents`) from the rewrite's Legacy shop pack window and from the pack picker. Today it opens only inside the new card shop |
| NPC duel record (CWindowResultNpc) | The NPC result arrives with the settlement | Mount main's `screens/result.js` (it lists CWindowResultNpc; layout in `mock/result-npc.json`) in the duel result (duel screen work) |
| NPC talk balloon (CWindowModelBalloon) | NPC dialogue lines (features/npc.ts) | Draw the NPC's lines in a balloon like the shop clerk's (`src/ui/htmlui/pictures.ts` `balloon`) in place of the panel text; update `tests/acceptance/harness.ts` claimNpcReward when the panel's buttons move |

## The server does not have it (server work first)

| Original | What it did | Server work needed |
| --- | --- | --- |
| SCENE_PRESENT (Present) | The present box: cards and items the operator sent the player, listed and claimed one by one | A present inbox: storage per character, a list message and a claim message (with the grant through the same paths as NPC gifts), and an admin way to send one. Nothing in server/src today |
| Tournament Points (TP scene) | The player's TP total and what it buys | The rewrite's profile row reads the player info's u32 TP (features/profile.ts), but the server writes 0 there. `persist` keeps `rec.tp`, but `PRIZE_TP` is 0 in tournaments.ts, so nothing awards TP, and no message or endpoint reads it. Needs a TP award rule, a read (profile field or `/api/de/...`), and whatever TP exchanges for |
| Information texts / event pages | The news and event descriptions the Information and AboutEvent windows showed; GoEvent's "go to the event" question. Missing texts: every event title and body, what each EVENTINFO state means, GoEvent's question | EVENTINFO carries only (serial, world, state). An event text source (admin-set titles and bodies, per language) and a message or endpoint that serves them |
| Duel Log replays (CWindowModelDuellogOperation's Play, the saved duellogs\\*.log; DuellogTour, the championship logs) | The duel record of a game, replayed in the duel screen, and the operator's championship logs downloaded from the site | The server sends the record (0x6010..0x6016, duel/duellog.ts) after a PvP game but does not keep it. Needs the records stored (per game, by the Duel Log line's id), a read for one, and a replay viewer in the rewrite (none today: the Duel Log lists the games without a Play button) |
| NPC item gifts by name (CWindowModelItemGet) | "You got <item>" for each gift | The gifts arrive as bits (`giftBits`); the rewrite cannot name them. Needs the item table (name per bit) served, or sent with the grant |
