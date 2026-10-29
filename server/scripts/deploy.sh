#!/usr/bin/env bash
# The production deploy (DEPLOY.md): at most one per ~2 h, players warned first. A deploy restarts the WorldDO, which
# drops every game connection; this warns them in the game, then closes their sockets with 4012 "server-update"
# (the web client reconnects by itself), then deploys and checks.
#   DEPLOY_TOKEN=... [DEPLOY_TEXT=...] scripts/deploy.sh [warning seconds, default 120]
# DEPLOY_TOKEN is the Worker secret of the same name (wrangler secret put DEPLOY_TOKEN --env production).
set -euo pipefail
cd "$(dirname "$0")/.."
B=https://ygoevolution.com
W=${1:-120}
: "${DEPLOY_TOKEN:?DEPLOY_TOKEN}"
api() { local body=${2:-'{}'}; curl -sf -X POST -H "x-de-deploy: $DEPLOY_TOKEN" -H "content-type: application/json" --data "$body" "$B/__admin/$1"; }
echo "online now: $(api online)"
if [ "$W" -gt 0 ]; then
  # the web client reconnects by itself after a deploy (yo2-browser's shell, live since 77d9ed6); DEPLOY_TEXT changes it
  T=${DEPLOY_TEXT:-"Server update in $((W / 60)) min. You'll be reconnected automatically."}
  echo "warned: $(api announce "$(python3 -c 'import json, sys; print(json.dumps({"text": sys.argv[1]}))' "$T")")"
  # 0x4700 (the menu-bar maintenance icon + countdown, every scene but title/character select) doesn't survive a
  # reload or a new lobby: sent again every 30 s, so players who join during the wait get it too
  for ((left = W; left > 0; left -= 30)); do api maintenance "{\"seconds\":$left}" >/dev/null; sleep $((left < 30 ? left : 30)); done
fi
# DEPLOY_SECRETS_FILE (JSON or .env, kept outside the repo): secrets uploaded with this version, e.g. a new DEPLOY_TOKEN
out=$(npx wrangler deploy --env production ${DEPLOY_SECRETS_FILE:+--secrets-file "$DEPLOY_SECRETS_FILE"} 2>&1) || { echo "$out"; exit 1; }
echo "$out" | grep -E "Uploaded|Current Version ID"
# The old WorldDO instance keeps its sockets (and gets requests) for minutes after a deploy, running the old code: it
# closes them with 4012 now, so the clients come back to the new code, and the script waits until that is what answers.
new=$(echo "$out" | sed -n 's/.*Current Version ID: *//p' | tr -d '[:space:]')   # not /__version: the edge may still answer the old one
echo "closed with 4012: $(api shutdown || echo 'n/a (old code)')"
for i in $(seq 1 60); do
  v=$(api version 2>/dev/null | python3 -c 'import json, sys; print(json.load(sys.stdin).get("v", ""))' 2>/dev/null || true)
  [ "$v" = "$new" ] && { echo "WorldDO on $new after $((i * 10)) s"; break; }
  sleep 10
done
[ "$v" = "$new" ] || echo "WARNING: the WorldDO still answers ${v:-old code} after 10 min"
scripts/post_deploy.sh
scripts/prod_check.sh
