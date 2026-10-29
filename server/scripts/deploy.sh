#!/usr/bin/env bash
# The production deploy (DEPLOY.md): at most one per ~2 h, players warned first. A deploy restarts the WorldDO, which
# drops every game connection; this warns them in the game, then closes their sockets with 4012 "server-update"
# (the web client reconnects by itself), then deploys and checks.
#   DEPLOY_TOKEN=... scripts/deploy.sh [warning seconds, default 120]
# DEPLOY_TOKEN is the Worker secret of the same name (wrangler secret put DEPLOY_TOKEN --env production).
set -euo pipefail
cd "$(dirname "$0")/.."
B=https://ygoevolution.com
W=${1:-120}
: "${DEPLOY_TOKEN:?DEPLOY_TOKEN}"
api() { local body=${2:-'{}'}; curl -sf -X POST -H "x-de-deploy: $DEPLOY_TOKEN" -H "content-type: application/json" --data "$body" "$B/__admin/$1"; }
echo "online now: $(api online)"
if [ "$W" -gt 0 ]; then
  api maintenance "{\"seconds\":$W}" >/dev/null
  echo "warned: $(api announce "{\"text\":\"Server update in $((W / 60)) min. You'll be reconnected automatically.\"}")"
  sleep "$W"
fi
echo "closed with 4012: $(api shutdown)"
npx wrangler deploy --env production
scripts/post_deploy.sh
scripts/prod_check.sh
