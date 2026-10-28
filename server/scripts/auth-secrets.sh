#!/usr/bin/env bash
# Prints (JSON, stdout) the generated auth secrets to set on the Worker of wrangler.jsonc. Use it in either of these ways:
#   first deploy:  npx wrangler deploy --secrets-file <(scripts/auth-secrets.sh)
#   later:         scripts/auth-secrets.sh | npx wrangler secret bulk
# An existing BETTER_AUTH_SECRET is kept (a new one signs everyone out); a new one is 48 random bytes. The Discord app's
# DISCORD_CLIENT_ID/SECRET (and staging's TEST_SIGNIN_SECRET) are set separately.
set -euo pipefail
cd "$(dirname "$0")/.."
have=$(npx wrangler secret list --format json "$@" 2>/dev/null || echo '[]')
if grep -q '"BETTER_AUTH_SECRET"' <<<"$have"; then echo '{}'; exit; fi
printf '{"BETTER_AUTH_SECRET":"%s"}\n' "$(openssl rand -base64 48 | tr -d '\n')"
