# v2.ygoevolution.com: the TS client rewrite in front of live

`duel-evolution-v2` is a **front only**: a small Worker (`worker.ts`) that serves the rewrite's build
(`client/experimental-ts/dist`, Workers static assets) and passes every other request to LIVE's production Worker
`duel-evolution` through a service binding (`LIVE`). It has no D1, R2 or Durable Object of its own, so v2 players use
live's accounts, characters, cards, MP, decks, chat and world (WorldDO): the same server code and the same data as
original.ygoevolution.com. Production's config is not changed by any of this.

## What the front does

- `/`, `/index.html`, `/assets/*` and the build's root files (`card-catalog.json`, ...): the rewrite's build.
- Everything else (`/api/*`, `/api/auth/*`, `/net` the game WebSocket, `/game/*` and `/ui/*` game files, `/replays`,
  `/__version`, ...): forwarded to LIVE with the URL's host set to `original.ygoevolution.com` (`LIVE_ORIGIN`).
  `/game-assets/*` (the dev server's name) is live's `/game/*`.
- `Origin: https://v2.ygoevolution.com` (exactly v2's own) becomes `https://original.ygoevolution.com`; any other
  Origin, or none, passes unchanged, so live's CSRF and WebSocket Origin checks still refuse other sites.
- Responses pass through; `Set-Cookie` stays host-only for v2 (any `Domain=` naming original is dropped), a `Location`
  on original's origin points back at v2 (except the Discord OAuth paths), `X-Robots-Tag: noindex` everywhere and
  `/robots.txt` disallows all.
- The build is same-origin: `VITE_DE_ASSETS=/game/` (game files through the front) and `VITE_DE_DISCORD_OAUTH=0`
  (`client/experimental-ts/src/site.ts`).

## Discord limitation

Live's server takes its public origin from the request host only for `GAME_HOSTS` (server/src/worker.ts), and the
Discord app's redirect URI names original, so **Sign in with Discord and Link Discord cannot finish on v2**. The v2 build
hides both; the sign-in window says "No Discord sign-in here yet: use your username and password." Password sign-in,
Create account with /verify in Discord, and Reset password with /reset in Discord all work (they don't redirect). A
Discord-only account sets a password with /reset first.

To lift it (a production change, not part of this): add `v2.ygoevolution.com` to `GAME_HOSTS` in
server/src/worker.ts (then live answers v2 as its own origin; the front's Origin rewrite becomes unnecessary) and add
`https://v2.ygoevolution.com/api/auth/callback/discord` to the Discord application's redirect URIs; ship the server
from main as usual.

## Deploy, rollback

    infra/ship-v2.sh          # from a clean, pushed t3/integ6 or t3/v2-site
    DRY=1 infra/ship-v2.sh    # build + wrangler deploy --dry-run, nothing uploaded

It deploys only `infra/v2/wrangler.jsonc` and refuses arguments, an `env` block, any config whose name isn't
`duel-evolution-v2`, or data bindings. Rollback: delete the v2 Worker (`wrangler delete -c infra/v2/wrangler.jsonc`, or
the dashboard); its custom domain goes with it and live is untouched.

## Local check

A live-server stack (`PARITY_SRC=<checkout of live/server>/server python3.12 -I client/experimental-ts/tools/local-stack.py 8895`),
a v2 build (`DRY=1 infra/ship-v2.sh`), then from infra/v2:

    ../../server/node_modules/.bin/wrangler dev -c wrangler.jsonc -c dev/live-stub.jsonc --port 8796 \
      --var PUBLIC_ORIGIN:http://localhost:8796 --var LIVE_ORIGIN:http://127.0.0.1:8895

`dev/live-stub.ts` stands in for `duel-evolution` (it forwards to the stack, and reads /game/, /ui/ files from original,
read-only). Browser check: `V2_FRONT=1 ACCEPTANCE_CLIENT=http://localhost:8796 ACCEPTANCE_STACK=<stack json>
tools/acceptance.sh tests/acceptance/v2-front.test.ts` from client/experimental-ts.
