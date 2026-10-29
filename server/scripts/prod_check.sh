#!/usr/bin/env bash
# Checks a deployed Duel Evolution server without an account (DEPLOY.md, Cutover step 5): the client page, the
# updater's files, and that the game WebSocket reaches THIS server's session gate (the old Worker has none).
#   scripts/prod_check.sh [base]     default: both hosts (the apex and original), and www -> the apex
set -uo pipefail
if [ $# -eq 0 ]; then
  r=0
  for h in https://ygoevolution.com https://original.ygoevolution.com; do echo "== $h"; "$0" "$h" || r=1; done
  w=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "https://www.ygoevolution.com/x?y=1")
  if [ "$w" = "301 https://ygoevolution.com/x?y=1" ]; then echo "OK   www 301s to the apex ($w)"; else echo "FAIL www 301s to the apex ($w)"; r=1; fi
  exit $r
fi
B=$1
O=$(sed -E 's#^(https?://[^/]+).*#\1#' <<<"$B")
UA="Mozilla/5.0 (duel-evolution check)"
fail=0
ok() { if [ "$1" = 1 ]; then echo "OK   $2"; else echo "FAIL $2"; fail=1; fi; }
code() { curl -s -o /dev/null -w '%{http_code}' -A "$UA" "$@"; }

c=$(code -L "$B/"); ok "$([ "$c" = 200 ] && echo 1)" "client page / ($c)"
r=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -A "$UA" -H "Sec-Fetch-Mode: navigate" "$B/yo2rc.html?online=1")
ok "$([ "$r" = "302 $B/?online=1" ] && echo 1)" "bare /yo2rc.html (Discord's return) goes back through the root ($r)"
c=$(code "$B/yo2rc.html?t=1"); ok "$([ "$c" = 200 ] && echo 1)" "a fetch of bare /yo2rc.html gets the file ($c)"
h=$(curl -sIL -A "$UA" "$B/" | tr -d '\r' | grep -i '^cross-origin-embedder-policy:' | cut -d' ' -f2)
ok "$([ "$h" = require-corp ] && echo 1)" "cross-origin isolated (COEP $h)"
h=$(curl -sIL -A "$UA" "$B/" | tr -d '\r' | grep -i '^content-security-policy:' | cut -d' ' -f2-)
ok "$([ "$h" = "frame-ancestors 'self'" ] && echo 1)" "no other site can frame the game (CSP $h)"
c=$(code "$B/game/files.txt"); ok "$([ "$c" = 200 ] && echo 1)" "game data /game/files.txt ($c)"
e=$(curl -sI -A "$UA" "$B/game/files.txt" | tr -d '\r' | grep -i '^etag:' | cut -d' ' -f2 | tr -d '"')
cc=$(curl -sI -A "$UA" "$B/game/files.txt?v=$e" | tr -d '\r' | grep -i '^cache-control:' | cut -d' ' -f2-)
ok "$([[ "$cc" == *immutable* ]] && echo 1)" "?v=<ETag> is cached for good ($cc)"
t=$(curl -s -A "$UA" "$B/yo2/root.txt"); ok "$([ -n "$t" ] && [ "$t" = "$(cat "$(dirname "$0")/../static/yo2/root.txt")" ] && echo 1)" "/yo2/root.txt serves the updater file"
for p in net boxedwine-network; do
  c=$(code -H "Origin: $O" -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" "$B/$p")
  ok "$([ "$c" = 401 ] && echo 1)" "/$p upgrade without a session reaches the session gate ($c, want 401)"
done
c=$(code "$B/api/de/session"); ok "$([ "$c" = 200 ] || [ "$c" = 401 ] && echo 1)" "/api/de/session answers ($c)"
c=$(code -X POST -H "content-type: application/json" --data '{"prod_check":true}' "$B/__crash"); ok "$([ "$c" = 204 ] || [ "$c" = 429 ] && echo 1)" "POST /__crash stores a report ($c, want 204, or 429: this IP's hourly limit; one marked prod_check)"
c=$(code "$B/__crash"); ok "$([ "$c" = 405 ] && echo 1)" "GET /__crash ($c, want 405)"
c=$(code "$B/__crashes"); ok "$([ "$c" = 401 ] && echo 1)" "/__crashes needs a session ($c, want 401)"
c=$(code -X POST -H "content-type: application/json" --data '{"prod_check":true}' "$B/__stall"); ok "$([ "$c" = 204 ] && echo 1)" "POST /__stall stores a batch ($c, want 204; one marked prod_check)"
c=$(code "$B/__stalls"); ok "$([ "$c" = 401 ] && echo 1)" "/__stalls needs a session ($c, want 401)"
c=$(code "$B/private/crashes/"); ok "$([ "$c" = 404 ] && echo 1)" "private/ is never served ($c, want 404)"
c=$(code "$B/api/de/prefetch/duel"); ok "$([ "$c" = 204 ] && echo 1)" "/api/de/prefetch/duel without a session ($c, want 204)"
c=$(code "$B/api/de/starter"); ok "$([ "$c" = 401 ] && echo 1)" "/api/de/starter without a session ($c, want 401)"
c=$(code -X POST -H "content-type: application/json" --data '{"id":8001}' "$B/api/de/starter/claim"); ok "$([ "$c" = 403 ] && echo 1)" "starter claim without our Origin ($c, want 403)"
v=$(curl -s -A "$UA" "$B/__version"); ok "$([[ "$v" == '{"v":"'*'"}' ]] && echo 1)" "/__version ($v)"
c=$(code "$B/__warm"); ok "$([ "$c" = 200 ] && echo 1)" "/__warm ($c)"
exit $fail
