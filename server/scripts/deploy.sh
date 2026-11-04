#!/usr/bin/env bash
# The production deploy (DEPLOY.md): at most one per ~2 h, players warned first. A deploy restarts the WorldDO, which
# drops every game connection; this warns players, voids unfinished duels and flushes saves,
# closes sockets with 4012 "server-update", then deploys and checks.
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
# One drop per deploy: the WorldDO closes every game socket with 4012 (the web client then waits for the new
# version), ends their duels with no result, flushes D1 and refuses new game sockets; the deploy then swaps the DO's
# code at once (immediate code update, not Cloudflare's default 300 s deferral, during which reconnecting clients would
# land on the old instance and drop a second time).
# deploys wait for no duel, not for no player (owner, 2026-11-02): one that started during the countdown aborts it
# (/__admin/online's duels; a server from before it reports none)
d=$(api online | python3 -c 'import json, sys; print(json.load(sys.stdin).get("duels", 0))' 2>/dev/null || echo 0)
if [ "${d:-0}" != 0 ]; then
  echo "ABORTED: $d duels in progress after the countdown, nothing deployed"
  api announce '{"text":"Server update postponed: carry on."}' >/dev/null || true
  exit 3
fi
# First retire live duels without recording a result. This must happen on the OLD WorldDO, before a code update
# can evict it. Older servers without prepare-restart refuse the request: stop rather than silently award losses.
if ! prepared=$(api prepare-restart); then
  echo "Refusing deployment: live server could not prepare a restart without duel losses." >&2
  exit 1
fi
python3 -c 'import json, sys; r=json.load(sys.stdin); sys.exit(0 if r.get("ready") is True and r.get("duelsVoided") is True else 1)' <<<"$prepared"
echo "prepared: $prepared"
closed=$(api shutdown)
python3 -c 'import json, sys; r=json.load(sys.stdin); sys.exit(0 if r.get("duelsVoided") is True else 1)' <<<"$closed"
echo "closed with 4012 (duels exempt): $closed"
# DEPLOY_SECRETS_FILE (JSON or .env, kept outside the repo): secrets uploaded with this version, e.g. a new DEPLOY_TOKEN
# the upload retried: the sockets are already closed and refused (a network blip once failed it: "fetch failed")
for try in 1 2 3; do
  out=$(npx wrangler deploy --env production --durable-objects-code-update-mode immediate ${DEPLOY_SECRETS_FILE:+--secrets-file "$DEPLOY_SECRETS_FILE"} 2>&1) && break
  echo "wrangler deploy failed (try $try of 3)"; [ $try = 3 ] && { echo "$out"; exit 1; }; sleep 10
done
echo "$out" | grep -E "Uploaded|Current Version ID"
# The old WorldDO can keep serving for minutes after the deploy. It is already quiescent and has no live duels;
# wait until the new instance answers before reporting success.
new=$(echo "$out" | sed -n 's/.*Current Version ID: *//p' | tr -d '[:space:]')   # not /__version: the edge may still answer the old one
for i in $(seq 1 60); do
  v=$(api version 2>/dev/null | python3 -c 'import json, sys; print(json.load(sys.stdin).get("v", ""))' 2>/dev/null || true)
  [ "$v" = "$new" ] && { echo "WorldDO on $new after $((i * 10)) s"; break; }
  sleep 10
done
[ "$v" = "$new" ] || { echo "FAIL: the WorldDO still answers ${v:-old code} after 10 min" >&2; exit 1; }
scripts/post_deploy.sh
scripts/prod_check.sh
