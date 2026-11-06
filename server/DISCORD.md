# The Discord bot

The bot that runs `/verify` and `/reset` now lives here (`src/discord/`). It used to run in duelforge, the owner's
other game, which forwarded DE's codes to `/api/de/discord-forward`. The app, its token and the server stay the same;
only its Interactions Endpoint URL moves to `https://ygoevolution.com/api/discord/interactions`.

## What it does

- **`/verify <code>`, `/reset`, and the #verify and #reset-password buttons:** the same flows as before (AUTH.md).
  A verified name + password player gets the Verified and Password User roles.
- **All Chat ↔ #in-game** (#general stays Discord's own).
  - Every All Chat line is posted to #in-game through a webhook, under the player's name, with markdown and
    mentions inert.
  - Every #in-game message from a person (not bots or webhooks) appears in All Chat with the Discord logo, under the
    speaker's duelist when their Discord is linked (online: their character; offline: its name; chat bans and ignore
    lists apply), else as `Discord: their Discord name: text`.
    Mentions and custom emoji become names, attachments become `[image]` / `[file]`, emoji are dropped, and long
    messages are cut to three 128-character lines.
  - The game side of #in-game is the Discord gateway (an outbound WebSocket from the WorldDO, intents
    GUILD_MESSAGES + MESSAGE_CONTENT). It's up only while someone is in the game, and closes after 10 minutes
    with nobody online.
- **#duels.**
  - Every open duel (created with Create Duel, no opponent yet, not an autoduel search or a private invite) has
    one message with an **Accept duel** button. The message is deleted when the duel fills or closes, so the
    channel is the live list. Only the bot posts there.
  - At boot the bot sweeps its old duel messages: a deploy restarts the world and forgets them.
  - **Accept**, for a Discord account linked to a game account, answers privately with a one-time link
    (10 minutes): `GET /api/auth/de/duel-link?t=…` signs that player in and opens the game with `?duel=<room>`.
  - An unlinked Discord account gets the game's page with `?duel=<room>` and is told to sign in with Discord.
  - Once in the world, the game sends the duel request itself, and the creator accepts or declines as usual.
- **The chat's Duels tab** lists the same open duels in game (`GET /api/de/duels`). Join checks first
  (`POST /api/de/duels/join`), then sends the game's own duel request from the creator's card.
- Created duels no longer take a password: anyone can join any open duel. A direct duel is still the player
  card's Duel.

Joining needs both players in the same lobby block: the 2008 client challenges only a player in its own player list.
Different languages, an overflow block (48+ players) or My Room get a reason instead.

## Configuration

`wrangler.jsonc` `env.production.vars`: `DISCORD_GUILD_ID`, `DISCORD_VERIFIED_ROLE_ID`,
`DISCORD_PASSWORD_ROLE_ID`, `DISCORD_CHAT_CHANNEL_ID`, `DISCORD_DUELS_CHANNEL_ID`.

Secrets:
- `DISCORD_PUBLIC_KEY`: the app's public key (hex). It isn't sensitive, but the repo's leak guard refuses it in the repo.
- `DISCORD_BOT_TOKEN`: without it, everything above is off. `/verify` and `/reset` still answer, but grant no roles.
- `DISCORD_CHAT_WEBHOOK_URL`: without it, All Chat isn't posted to #in-game.

## Setup (once, idempotent)

```bash
cd server
DISCORD_BOT_TOKEN=... node scripts/setup-discord.mjs   # Message Content intent, #duels, #in-game's webhook, commands; ids into wrangler.jsonc
npx wrangler secret put DISCORD_BOT_TOKEN --env production
echo '<webhook url it printed>' | npx wrangler secret put DISCORD_CHAT_WEBHOOK_URL --env production
# deploy (DEPLOY.md), then point Discord's interactions here:
DISCORD_BOT_TOKEN=... node scripts/setup-discord.mjs --endpoint
```

Discord checks the endpoint when it's set (bad signatures must get a 401), so deploy first. Until `--endpoint` runs,
duelforge's endpoint still answers `/verify` and `/reset` and forwards DE's codes here, if it's still deployed.
