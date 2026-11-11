# Parity gaps: original scenes the rewrite does not have yet

What the 2008 client did, what server/src (the protocol truth) has for it today, and the work left. Checked
2026-11-11 against server/src and main's Legacy HTML UI (client/web-shell/htmlui).

## Done in the rewrite

- **NPC reward pack pick**: main's pack picker (`screens/packselect.js`, CWindowPackSelect) now takes the pick when the
  HTML UI is up (`src/ui/htmlui/npc-pack.ts`): a row chooses the pack, OK claims it (0x4802). Rows carry the
  original's completion column (packCompletionLine), read from `GET /api/de/shop/pack` (`collected`); a pack the shop
  does not list shows no percentage. The NPC panel keeps the dialogue, gifts and received cards.

## The server has it, the rewrite does not (client work only)

| Original | Server today | Rewrite work |
| --- | --- | --- |
| SCENE_TOURNAMENT: JoinGunsling (entry), the bracket, DuellogTour | `server/src/game/tournaments.ts`: 0x5100..0x5120 (INFO, START, LOTTERY, ROUND, REQENTRY, ENTRY_*, LIST, ENDRESULT, TIMER, STATUS, CHKDUELSTART) and AUTODUELSTART 0x43a0. Started by an admin only (`/admin` `tournament`); none runs by default | 0x51xx handlers in `src/network`, a tournament scene, and its windows. main's htmlui has no module for them: new screens in the Legacy look |
| Information / AboutEvent / GoEvent (CWindowModelInformation) | EVENTINFO 0x5000: three u32 (serial, world, state), sent after the NPC list request while an event is set (`/admin` `event`) | Read 0x5000 and show the window. The server sends only the event's state, no text: the information texts (see below) are server work |
| CARD_PACK_CHECK (what a pack holds) | `GET /api/de/shop/pack?id=` (shop-api.ts shopPackView: cards, odds, owned, pulls) | Mount main's `screens/pack-contents.js` (`openPackContents`) from the rewrite's Legacy shop pack window and from the pack picker. Today it opens only inside the new card shop |
| Duel help strips (CWindowModelHelp, CHelpDialog) | Not needed: the strips are client text (yo2text) | Draw them in the duel screen (the duel screen work owns that area). main's htmlui has no module |
| NPC duel record (CWindowResultNpc) | The NPC result arrives with the settlement | Mount main's `screens/result.js` (it lists CWindowResultNpc; layout in `mock/result-npc.json`) in the duel result (duel screen work) |
| NPC talk balloon (CWindowModelBalloon) | NPC dialogue lines (features/npc.ts) | Draw the NPC's lines in a balloon like the shop clerk's (`src/ui/htmlui/pictures.ts` `balloon`) in place of the panel text; update `tests/acceptance/harness.ts` claimNpcReward when the panel's buttons move |

## The server does not have it (server work first)

| Original | What it did | Server work needed |
| --- | --- | --- |
| SCENE_PRESENT (Present) | The present box: cards and items the operator sent the player, listed and claimed one by one | A present inbox: storage per character, a list message and a claim message (with the grant through the same paths as NPC gifts), and an admin way to send one. Nothing in server/src today |
| Tournament Points (TP scene) | The player's TP total and what it buys | `persist` keeps `rec.tp`, but `PRIZE_TP` is 0 in tournaments.ts, so nothing awards TP, and no message or endpoint reads it. Needs a TP award rule, a read (profile field or `/api/de/...`), and whatever TP exchanges for |
| Information texts / event pages | The news and event descriptions the Information and AboutEvent windows showed | EVENTINFO carries only (serial, world, state). An event text source (admin-set titles and bodies, per language) and a message or endpoint that serves them |
| NPC item gifts by name (CWindowModelItemGet) | "You got <item>" for each gift | The gifts arrive as bits (`giftBits`); the rewrite cannot name them. Needs the item table (name per bit) served, or sent with the grant |
