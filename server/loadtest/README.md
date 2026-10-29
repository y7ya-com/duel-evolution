# Load test

Simulated players against a throwaway copy of the server, never production. `sim.ts` is one player on its own gateway
WebSocket (py fake_client.py's flows: gate, account, lobby, walking, block chat, NPC duels, PvP pairs) and times what
a player waits for: the echo of a move (0x5300) and of a chat line (0x4402), login, duel start, the answer -> next
prompt time in a duel. `driver.ts` is a Worker that fans the players out over Durable Objects (4 each), so the load
comes from Cloudflare, not from this Mac.

- `target.jsonc`: the load server, `duel-evolution-load`: the production code, its own empty D1, no route and no
  workers.dev (only the driver reaches it, by service binding), the test sign-in on, PROGRESSION as production,
  PVP_TEST (PvP players auto-play with 0x7ffe and may surrender at any turn) and DECK_CHECK off.
- `driver.jsonc`: `duel-evolution-loadgen`, POST /run with the header x-load-key.
- `run.py`: one step from this Mac; `metrics.py`: D1 per minute (and DO per minute, where Cloudflare reports it).
- `local.ts`: a smoke run from Node against a local `wrangler dev` (bundle it with esbuild first).

Set up (wrangler logged in; `<id>` from the create):

    npx wrangler d1 create duel-evolution-load --location weur   # put the id in target.jsonc (D1_ID)
    npx wrangler d1 migrations apply duel-evolution-load --remote -c loadtest/target.jsonc
    openssl rand -base64 36 | tr -d '\n' > /tmp/s   # the test sign-in secret, for both Workers
    npx wrangler secret put TEST_SIGNIN_SECRET -c loadtest/target.jsonc < /tmp/s
    openssl rand -base64 48 | tr -d '\n' | npx wrangler secret put BETTER_AUTH_SECRET -c loadtest/target.jsonc
    npx wrangler deploy -c loadtest/target.jsonc
    npx wrangler deploy -c loadtest/driver.jsonc
    npx wrangler secret put TEST_SIGNIN_SECRET -c loadtest/driver.jsonc < /tmp/s
    npx wrangler secret put LOAD_KEY -c loadtest/driver.jsonc

Run a step (n players, 180 s, a fifth in PvP pairs and a fifth duelling NPCs, logged in over 60 s); the same TAG
reuses the players of the earlier steps:

    TAG=p LOAD_KEY=... python3.12 -I loadtest/run.py https://duel-evolution-loadgen.<subdomain>.workers.dev 100 180 20 20 60

Tear down:

    npx wrangler delete -c loadtest/driver.jsonc
    npx wrangler delete -c loadtest/target.jsonc
    npx wrangler d1 delete duel-evolution-load
