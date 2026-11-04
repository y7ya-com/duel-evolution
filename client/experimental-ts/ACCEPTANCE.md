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

## Harness (`tests/acceptance/harness.ts`)

- `signIn(name)`: staging test sign-in (`Test` + 1-12 letters/digits); `testPassword(name)` for the real login form;
  `discordForward()` signs Discord /verify and /reset forwards; `resetRateLimits()` clears the local stack's auth limits.
- `openPage()`: the first page launches Chrome, later pages are isolated browser contexts (own cookies) in it.
  `openClient(page, cookies, {assets})`, `enterWorld(page, name)`, `click/press/type/until/text`, `pressAvatar`.
- Duels: `startNpcDuel`, `prepareDuel`, `duelBot` / `playDuel` (summons, sets, attacks through the duel screen),
  `surrender`, `claimNpcReward`, `earnCards` (tradeable cards: starter and starting-MP cards are soul-bound),
  `ownedCopies(page, name)` from the deck editor.
- `record(flow, {actions, expected, observed})`: one evidence line. `screenshot(page, name)` to `/tmp/acceptance/`.

`press` fails on a covered or disabled control rather than skipping it: that is usually a UI defect worth fixing.
Server logs: the stack's `log` path. Test sign-in and register/sign-in are rate limited like production.

## Setting up a separate worktree

A git worktree lacks untracked inputs. From the worktree root, link or copy them from the main checkout
(`/home/y7ya/Documents/repos/duel-evolution`):

```sh
M=/home/y7ya/Documents/repos/duel-evolution
ln -s $M/server/node_modules server/node_modules
ln -s $M/server/gamedata server/gamedata
[ -d $M/server/data ] && ln -s $M/server/data server/data
ln -s $M/client/web-shell/htmlui/node_modules client/web-shell/htmlui/node_modules
cp $M/client/experimental-ts/public/*.json client/experimental-ts/public/
```
