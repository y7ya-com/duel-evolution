# Rules for every session

## Only main ships (owner, 2026-11-06)

Live (the web client on R2 and the production Worker) is only ever built from `origin/main`. On 2026-11-06 sessions
shipped their own branches and hand-swapped single files. Each ship silently dropped the others' fixes (the deck
editor's Craft/Dismantle labels, the phone fullscreen fix, a server outfit fix).

- Branch from `origin/main`, never from another session's branch or from what you guess is live.
- To ship: merge (or rebase) your work into `main`, push `main`, then run `infra/ship-client.sh` or
  `server/scripts/deploy.sh` from a clean checkout of `main`. `infra/ship-guard.sh` refuses anything else: HEAD
  must be `origin/main`, with no edited tracked files, and must already contain the `live/client` / `live/server`
  tag (moved by every ship) and the live page's `yo2-build` commit.
- Never hand-upload or swap a single file on R2 (`wrangler r2 object put`), and never deploy with `wrangler deploy`
  directly. Small fixes go through main and the scripts like everything else.
- To undo a bad ship: revert on main, push, ship.
- `DRY=1 infra/ship-client.sh` (a local test page) works on any branch; only the upload is main-only.
- If `main` lacks something that is live, merge it into `main`. Never override the guard.
