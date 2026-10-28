# Deploying the TypeScript server

Only production is deployed: `wrangler.jsonc` `env.production`, live at `original.ygoevolution.com/*` since
2026-10-28 07:40Z.
- the Worker `duel-evolution` (its WorldDO holds the game);
- the D1 database `duel-evolution-prod`;
- the R2 bucket `ygo-original`: the client under `CLIENT_PREFIX` (`recomp-de/`), falling back to `recomp/` for the game
  data, and the duel engine data under `duel-evolution/engine/`.

The top level of wrangler.jsonc is for local `wrangler dev` only. The former staging Worker `duel-evolution-next` and its
D1 `duel-evolution` are idle with no route; they were kept, not deleted.

## The web client

`infra/ship-client.sh [--build] [prefix]` from the public repo: builds (or takes) `client/recomp/build-web/`, adds the
web shell (`client/web-shell/stage.js`, `loader.js`), the title and the build id to `yo2rc.html` and uploads it to R2
`ygo-original/<prefix>/` (default `recomp-de/`, the `CLIENT_PREFIX` production serves). `DRY=1` prepares
`infra/out/<prefix>/` and lists the uploads without uploading. Shipping to `recomp/` also uploads `index.html`,
`stage.js` and `loader.js`; the loading-screen art (`loader/`) and the game files there are uploaded by hand.

## Check locally, then deploy

1. **Locally** (localhost, where test accounts are fine):
   - `python3.12 -I parity/run.py base|ts|diff <scenario>` (parity with py);
   - `python3.12 -I parity/predeploy.py`, which starts its own `wrangler dev` (two signed-in players, an NPC duel, a PvP match).
2. **Deploy** from a clean worktree of the public repo (y7ya-com/duel-evolution) at the commit, so other sessions'
   unfinished edits stay out. `server/gamedata/` is not in the repo: fetch it first (maintainers, `wrangler login`).
   ```bash
   infra/fetch-private.sh                     # from the repo root: server/gamedata/ and the other private files
   cd server && pnpm install --frozen-lockfile
   npx wrangler deploy --env production --dry-run --outdir /tmp/de-dry   # optional: bundle + bindings, uploads nothing
   npx wrangler d1 migrations apply duel-evolution-prod --remote --env production   # only when migrations/ changed
   npx wrangler deploy --env production
   scripts/prod_check.sh
   ```
   A deploy restarts the WorldDO, which drops the open game connections. The state is safe: every save is written
   through to D1.

## Production values

| what | value | where |
|---|---|---|
| `BETTER_AUTH_SECRET` | generated (48 random bytes), its own | secret (set) |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | the owner's Discord app | secrets (set) |
| `DEPLOY_ENV` | `production`: the test sign-in is a 404 | `vars` |
| `PUBLIC_ORIGIN` | `https://original.ygoevolution.com` | `vars` |
| `NPC_AI` | `py` until the NPC AI's A/B is in | `vars` |
| `CLIENT_PREFIX` | `recomp-de/` | `vars` |
| `PROGRESSION` | `1`: the 2008 card progression (since 2026-10-28; every character before it restarted, after a D1 export to R2 `private/backups/`) | `vars` |

- **Discord redirect URI:** `https://original.ygoevolution.com/api/auth/callback/discord`, already added by the owner.
  The Discord API can't set it (`PATCH /applications/@me` returns 200 but ignores `redirect_uris`).
- **Never set** `TEST_SIGNIN_SECRET` or `DEV=1` in production. `DEV` opens `/__dev/*` and the parity bridge's
  unauthenticated WebSocket.
- **First admin**, after that user signs in:
  ```sql
  INSERT INTO role_grant (user_id, role) VALUES ('<user id>', 'admin');
  ```
  Run it with `npx wrangler d1 execute duel-evolution-prod --remote --env production --command "…"`.

Sign-in is Discord, or a name + password from the game's own login dialog (AUTH.md). There's no email, no captcha and no
account web page: D1 rate limits and a per-name lockout guard password sign-in.

## Cutover (done 2026-10-28)

The production route `original.ygoevolution.com/*` runs before the old Worker's (`ygo-original`) Custom Domain, so
deploying it was the switch. The old Worker, its container and its Custom Domain were not touched.
- **07:19Z**, rolled back at 07:21Z: the client crashed on the signed-out ONLINE (fixed in the client).
- **07:40Z**: live with client be0206cf.

A fresh copy of the live state goes into an empty production D1 like this (a temp dir; the file holds the players' data):
```bash
T=$(mktemp -d); (umask 077
  npx wrangler r2 object get ygo-original/private/state.json --remote --file $T/state.json
  node --experimental-strip-types scripts/import_state.ts $T/state.json > $T/import.sql)
npx wrangler d1 execute duel-evolution-prod --remote --env production --file $T/import.sql
rm -rf $T
```
The importer refuses a state that wouldn't come back exactly. Imported accounts have no owner (`user_id` NULL): each
player signs in and claims theirs.

## Rollback

Delete the production route `original.ygoevolution.com/*`; the host goes back to the old Worker's Custom Domain and its
container. Don't redeploy without the route: a deploy with no routes doesn't remove existing ones. Never run
`wrangler delete` either: it destroys the WorldDO. Delete the route in one of two ways:
- the dashboard: ygoevolution.com → Workers Routes → `original.ygoevolution.com/*` → Remove;
- the API, with a token that has Workers Routes edit:
  ```bash
  Z=$(curl -s -H "Authorization: Bearer $CF_TOKEN" "https://api.cloudflare.com/client/v4/zones?name=ygoevolution.com" | jq -r '.result[0].id')
  R=$(curl -s -H "Authorization: Bearer $CF_TOKEN" "https://api.cloudflare.com/client/v4/zones/$Z/workers/routes" | jq -r '.result[] | select(.pattern=="original.ygoevolution.com/*") | .id')
  curl -s -X DELETE -H "Authorization: Bearer $CF_TOKEN" "https://api.cloudflare.com/client/v4/zones/$Z/workers/routes/$R"
  ```
Check that `https://original.ygoevolution.com/` loads the old client and that a login reaches the container. Keep the
container warm, and don't delete `ygo-original` or its Custom Domain for a week after cutover.

The old container fetches its bundle from `SITE/__bundle` on boot, which only the old Worker answers. So it can boot
only while the production route is gone: roll back first, then restart it.

Game progress made on the new server after the switch is not in the old `state.json`. A rollback loses it unless it is
exported: `GET /__admin/status` and the D1 tables, by hand.

## Routes of the old Worker (ygo-original)

Every path the old Worker (`ygo-original`, with its container) answered, and what the new server does with it:

| old path | new server |
|---|---|
| `/` and the client's files (R2 `recomp/`) | ported: R2 `CLIENT_PREFIX` (production: `recomp-de/`), falling back to `recomp/` (game data, fonts); `?v=<ETag>` is cached immutable |
| `/net`, `/boxedwine-network` (game WebSocket → container gateway) | ported: the WorldDO, behind the session gate (401 without a session) |
| `/yo2/*` (the updater: root.txt, merge.txt, via the container) | ported: `/yo2/root.txt`, `/yo2/merge.txt` (static, committed) |
| `/app/*` (the client's info pages, via the container) | dropped: a 404, as py answered for everything but the updater files |
| `/__warm` | ported: `ok` (nothing to warm up) |
| `/__crash` (client crash reports → R2 `private/crashes/`) | ported: same storage, same limits (64 KB, 10 per IP per hour) |
| `/__crashes` (crash report list, BUNDLE_SECRET) | ported: needs the admin role instead of BUNDLE_SECRET |
| `/__stall`, `/__stalls` (web/stall.js long-frame batches → R2 `private/stalls/`) | new: 16 KB, 30 per IP per hour; the list needs the admin role. Stall and crash rows (JSON objects) get `ip_family` (`v4`/`v6`); every Range response logs `[range] <v4/v6> <hit/miss/r2> <file> <bytes> <ms until its last byte left the Worker>` (`wrangler tail duel-evolution`; the edge buffers, so a slow route to the player isn't in it) |
| `/recomp`, `/recomp/*` (301 to the root) | ported |
| `/__bundle`, `/__state`, `/__log`, `/__restart` | dropped by design: the container's bundle, state backup, log and restart |
| `/__upload/*` (multipart R2 upload, UPLOAD_SECRET) | dropped: files are uploaded with wrangler |
