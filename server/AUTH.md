# Duel Evolution accounts

DE has its own accounts, separate from any other service. The 2008 in-game login blob (0x3003: Blowfish/MD5 with a
key hardcoded in the exe) is never treated as identity. Players never see a web page, and no email is collected or
sent anywhere. The game boots straight to its own title, and its own UI drives the endpoints below.

## Two ways in, as on the owner's other game (`src/auth/`, `src/db/auth-schema.ts`)

- **Discord, passwordless.** better-auth's Discord provider with the `identify` scope only (no email, no guilds). A
  first sign-in creates the account, keyed by the Discord account id (`account.account_id`). The callback is always
  `https://original.ygoevolution.com/api/auth/callback/discord`, the one URI registered with Discord.
- **Name + password, verified through Discord**, for the game's own login dialog (User ID / Password). The better-auth
  username plugin, scrypt, 10-128 chars.
  1. The game registers: `POST /api/de/register {username, password}` answers `{code, inviteUrl}`. The code is 6
     unambiguous chars, valid 1 h, stored as SHA-256.
  2. The player joins the Discord server and runs `/verify <code>` (or the Verify button) on the shared bot. The bot's
     interactions endpoint (the other game's Worker) checks Discord's signature and forwards here
     (`POST /api/de/discord-forward`, HMAC-signed).
  3. Verification marks the user verified, links that Discord account (so "Sign in with Discord" reaches the same
     user), and the bot grants the Verified role. One Discord account per game account.
  4. Until then, sign-in answers **403 `EMAIL_NOT_VERIFIED`** ("verify first"). Registering the same unverified name
     with its own password reissues the code; anyone else gets a 409.
- **Reset:** `/reset` in Discord answers (through the forward) a 6-char code, valid 15 minutes, for the game account
  linked to that Discord. The game posts `POST /api/de/reset {code, newPassword}`, which sets the password, revokes
  every session and signs in.
- **A Discord account adds a password** with `POST /api/de/password {newPassword, username}` (session less than 10
  minutes old). Its Discord already vouches for it, so it's verified at once.
- The server sets `user.email` itself: a unique `…@users.duel-evolution.invalid` placeholder, never collected.
  `emailVerified` means "verified through Discord".
- **No captcha**, because the game can't show one; Discord is the gate. Password sign-in has D1 rate limits per IP and
  a per-name lockout (10 failures in 15 minutes). Register is limited to 5/h per IP and reset to 10 per 15 minutes per
  IP.
- **Names** are 3-16 chars: a letter first, then letters, digits, `_` or `-`. They're unique ignoring case, and
  reserved staff-like words and a profanity list are refused (`names.ts`). A name never changes through
  `/update-user`.
- **Linking is explicit**: OAuth never attaches itself to an existing user. Every email-shaped endpoint is disabled.
- **Character names** come from the game's own Create Player step. The game server enforces that they're unique.
- **Sessions**: `__Secure-de.session_token` is HttpOnly, Secure, SameSite=Lax, Path=/, so the same cookie serves the
  page, the API and the game WebSocket. Every sign-in mints a new token. Expiry is 7 days, sliding (extended at most once a
  day). There's no cookie cache, so sign-out and revocation take effect on the next request.
- **Rate limits**: better-auth's limiter with `storage: "database"` (D1 `rate_limit`), per `cf-connecting-ip`:

  | endpoint | limit |
  |---|---|
  | password sign-in | 5/min |
  | change password | 5/10 min |
  | everything else | 100/min |
- **Roles**: the `role_grant (user_id, role ∈ {admin, moderator})` table is the only source of rights.
- **Legacy accounts**: imported accounts have `accounts.user_id` NULL. An admin issues a one-time code
  (`POST /api/de/admin/legacy-claims`), and the owner redeems it (`POST /api/de/claim`). The WorldDO's `claim` action
  binds the account atomically, and only then is the code spent.

## Client contract (the game's UI)

| call | what it does |
|---|---|
| `GET /api/de/session` | `{ signedIn: false }`, or `{ signedIn: true, userId, name, roles, discord, password }` |
| `GET /api/auth/sign-in/discord?return=/` | Discord → callback (sets the cookie) → `return?online=1`. Failure: `return?online=0&error=…`. `return` must be a same-site path. |
| `GET /api/de/discord-invite` | `{ inviteUrl }` (the Discord server invite, or null), for the game's "Open Discord" buttons |
| `POST /api/de/register {username, password}` | `{ok, code, inviteUrl, expiresInMinutes}`. 400 `BAD_NAME` / `BAD_PASSWORD`, 409 `NAME_TAKEN`, 429 |
| `POST /api/auth/sign-in/username {username, password}` | 200 + the cookie. 401 for a wrong name or password, 403 `EMAIL_NOT_VERIFIED` (verify first: the dialog's "Continue" just retries), 429 for rate limits or the lockout |
| `POST /api/de/reset {code, newPassword}` | 200 + the cookie (signed in), 400 `BAD_CODE` / `BAD_PASSWORD`, 429 |
| `POST /api/de/password {newPassword, username?}` | a Discord account adds (or resets) its name + password; needs a session less than 10 minutes old |
| `POST /api/auth/sign-out` | ends the session |

The bot side: `POST /api/de/discord-forward` with JSON `{action: "verify"|"reset", code?, discord: {id, username},
ts}` and header `x-de-signature` = hex HMAC-SHA256(`DE_FORWARD_SECRET`, raw body), with `ts` within 60 s. It answers
`{ok, message, grantVerified?}`, and `ok: false` lets the bot say "invalid or expired". It's a 404 without a 32+ char
secret.

All calls are same-origin (cookies are sent automatically). A POST needs an `Origin` that equals the site.

The game WebSocket (`/boxedwine-network`) is the identity:
- the upgrade needs a live session and an exact `Origin`, or it gets 401/403;
- the Worker sets the user id itself and drops any client-sent `x-de-user`;
- on a bound channel the hub ignores what 0x3003 contains, so after an HTTP sign-in the client may send anything there.

The account is the user's own (`accounts.user_id`), or `u:<userId>`, created on the first game login.

**Local and pre-deploy checks only (automation):** `POST /api/de/test-sign-in {name}` with header `x-test-signin: TEST_SIGNIN_SECRET`
signs in (creating on first use) a `Test*` name + password user. It's a 404 unless `DEPLOY_ENV` is `staging` and the
secret (32+ chars) matches. Production's config sets `DEPLOY_ENV=production` and has no
such secret, and a test checks both.

## Tests

`test/auth.test.ts` runs vitest against a real miniflare D1 (`getPlatformProxy`) with the generated migrations, with
Discord mocked. It covers:
- the cookie flags, rotation and revocation;
- no client-sent email or name, generic errors, no email endpoints, no pages;
- the lockout and D1 rate limits;
- Discord sign-in, `return` validation, re-sign-in, linking, adding a password;
- the test sign-in and its refusal unless `DEPLOY_ENV=staging`;
- the WS session and Origin checks, a forged `x-de-user`, 0x3003;
- admin by table only, and the claim flow.
