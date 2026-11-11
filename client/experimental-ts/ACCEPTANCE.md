# Browser acceptance against the real local stack

The parity gate (`src/parity/acceptance.ts`, `npm run parity`) needs dated new-client browser evidence per flow. These
tests produce it: Chromium drives the client (Vite dev server) against a real local server (wrangler dev of `server/`:
real Worker, better-auth, D1, WorldDO, duel engine). Each asserted flow appends a line to
`acceptance-evidence/runs.jsonl` (`record()`), with the commit and run time. Evidence must describe what was observed.

## Running

1. The local server: `python3.12 -I client/experimental-ts/tools/local-stack.py 8899` (from the repo root, with
   `YO2EMU=$HOME/.cache/YOLaucher/tools/yo2emu`). It prints `{"origin","secret","forward","log"}` on one line; save it
   to the file named by `ACCEPTANCE_STACK` (default `/tmp/local-stack.json`). One stack serves every checkout: test
   users and characters are unique per run (`RUN` in the harness). Do not restart a stack another session uses.
2. The client: `DE_SERVER=<origin> DE_PUBLIC_ORIGIN=<origin> YO2_ASSET_URL=https://original.ygoevolution.com/game/
   DE_CLIENT_PORT=<port> node tools/run.mjs vite --host 127.0.0.1` from `client/experimental-ts` (default port 5174; a
   second checkout picks another). Tests reach it at `ACCEPTANCE_CLIENT` (default `http://localhost:5174`). Use
   `localhost`, not 127.0.0.1, in that URL.
3. A test: `ACCEPTANCE_CLIENT=http://localhost:<port> tools/acceptance.sh tests/acceptance/<file>.test.ts`. It waits for
   memory (the shared Chromium launcher refuses below 25% free; other sessions run browsers too) and prints the result.
   Run one browser workload at a time per checkout and always close pages (`closeAll()` in `finally`).
4. Many files: `ACCEPTANCE_STACK=<file> ACCEPTANCE_CLIENT=http://localhost:<port> tools/acceptance-parallel.sh -j 3
   tests/acceptance/*.test.ts` runs them N at a time against one stack and client (files are independent: accounts are
   per process). Each waits for 30% free memory; logs go to ~/.cache/de-scratch/acceptance (/tmp is RAM here).
   Speed: start the stack with `STACK_VARS=SEND_PACE:0,DUEL_PAUSE:0.001` (no send pacing, near-zero duel pauses); the
   harness already turns reduced motion on.

## Harness (`tests/acceptance/harness.ts`)

- `signIn(name)`: staging test sign-in (`Test` + 1-12 letters/digits); `testPassword(name)` for the real login form;
  `discordForward()` signs Discord /verify and /reset forwards; `resetRateLimits()` clears the local stack's auth limits.
- `openPage()`: the first page launches Chrome, later pages are isolated browser contexts (own cookies) in it.
  `openClient(page, cookies, {assets})`, `enterWorld(page, name)`, `click/press/type/until/text`, `pressAvatar`.
- Duels: `startNpcDuel`, `prepareDuel`, `duelBot` / `playDuel` (summons, sets, attacks through the duel screen),
  `surrender`, `claimNpcReward`, `earnCards` (tradeable cards: starter and starting-MP cards are soul-bound),
  `ownedCopies(page, name)` from the deck editor.
- `click(page, text)` presses the visible control with that text; a Main Menu entry (Lobby, Edit Deck, Shop, Friends & Mail,
  Options, Disconnect) is reached through the menu bar's Menu key (`[data-key="main-menu"]`), as a player would.
  `skin.test.ts` is a screenshot tour of every out-of-duel screen (`SKIN_SHOT=<set>` names the files).
- `record(flow, {actions, expected, observed})`: one evidence line. `screenshot(page, name)` to `/tmp/acceptance/`.

`press` fails on a covered or disabled control rather than skipping it: that is usually a UI defect worth fixing.
Server logs: the stack's `log` path. Test sign-in and register/sign-in are rate limited like production.

## Trades (`trade.test.ts`)

Live refuses a trade that gives cards from a character with fewer than 20 rewarded duels (server persist.ts
`TRADE_GIVE_MIN_DUELS`, the anti-alt rule). The test's characters are new, so it needs a stack of its own with that
minimum lowered: `STACK_VARS=SEND_PACE:0,DUEL_PAUSE:0.001,DEV:1,TRADE_GIVE_MIN_DUELS:0`. The server honours
`TRADE_GIVE_MIN_DUELS` only with `DEV=1` outside production (config.ts); on a stack without it the test's trades end
"Trade cancelled: a character can give cards after 20 rewarded duels." Each player still plays two rewarded NPC duels:
a new character's first prize is soul-bound, the second is tradeable.

## Scenario duels (`duel-scenarios.test.ts`)

Cases ordinary play rarely reaches (card/number/attribute/type declarations, control changes, tokens, counters,
ritual and discard selections, cancels) are forced with tiny decks: a 6-card deck is a player's whole hand on its first
turn, so both players hold known cards. The test rewrites the server state (`POST /__dev/state` gives the two characters
the cards), so it needs a stack of its own, never a shared one: `STACK_VARS=DEV:1,SEND_PACE:0,DUEL_PAUSE:0.001,DECK_CHECK:avisar`
(`DECK_CHECK:avisar` lets a PvP duel start with a deck under 40 cards; progression otherwise blocks it). Run it with
`ACCEPTANCE_SCENARIO=1`; without that it is skipped.

## Setting up a separate worktree

A git worktree lacks untracked inputs. From the worktree root, link or copy them from the main checkout
(`/home/y7ya/Documents/repos/duel-evolution`):

```sh
M=/home/y7ya/Documents/repos/duel-evolution
ln -s $M/server/node_modules server/node_modules
# server/gamedata is tracked (its README): link its entries, not the directory
for f in $M/server/gamedata/*; do [ "${f##*/}" = README.md ] || ln -s "$f" server/gamedata/; done
[ -d $M/server/data ] && ln -s $M/server/data server/data
ln -s $M/client/web-shell/htmlui/node_modules client/web-shell/htmlui/node_modules
cp $M/client/experimental-ts/public/*.json client/experimental-ts/public/
```
