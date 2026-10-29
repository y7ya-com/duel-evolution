#!/usr/bin/env bash
# After `wrangler deploy --env production` (DEPLOY.md): Workers Logs redacts query strings (the Discord callback's
# ?code=&state=). wrangler can't set this and every deploy resets it, so it is set again here through the API.
# Credentials from the environment: CLOUDFLARE_API_TOKEN, or CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL; and CLOUDFLARE_ACCOUNT_ID.
set -euo pipefail
A=${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID}
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then auth=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")
else auth=(-H "X-Auth-Key: ${CLOUDFLARE_API_KEY:?}" -H "X-Auth-Email: ${CLOUDFLARE_EMAIL:?}"); fi
curl -sf -X PATCH -H "Content-Type: application/json" "${auth[@]}" \
  "https://api.cloudflare.com/client/v4/accounts/$A/workers/scripts/duel-evolution/script-settings" \
  --data '{"observability":{"enabled":true,"head_sampling_rate":1,"redact_query_string":true,"logs":{"enabled":true,"head_sampling_rate":1,"persist":true,"invocation_logs":true}}}' \
  | python3 -c 'import json, sys; o = json.load(sys.stdin)["result"]["observability"]; print("OK   Workers Logs: query strings redacted" if o.get("redact_query_string") else "FAIL query strings not redacted"); sys.exit(0 if o.get("redact_query_string") else 1)'
