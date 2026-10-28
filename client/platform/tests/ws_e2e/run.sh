#!/bin/sh
# Starts network-gateway.mjs (:8001) + run.py (:5730), runs gate_hello_ws.js under Node, stops both.
#   GATEWAY=/path/to/network-gateway.mjs platform/tests/ws_e2e/run.sh
# Env: GATEWAY (required), YO2EMU (default ../YOLaucher-web/tools/yo2emu next to the worktree's parent),
#      NODE (default node), BUILD (default <repo>/build-web).
set -u
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
: "${GATEWAY:?set GATEWAY to network-gateway.mjs}"
YO2EMU=${YO2EMU:-/Users/y/Documents/GitHub/YOLaucher-web/tools/yo2emu}
NODE=${NODE:-node}
BUILD=${BUILD:-$REPO/build-web}
LOG=${TMPDIR:-/tmp}/ws_e2e.$$
mkdir -p "$LOG"

for p in 5730 8001; do
  if lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null; then echo "port $p already in use"; exit 2; fi
done

"$NODE" "$GATEWAY" --port 8001 --allow-origin none >"$LOG/gateway.log" 2>&1 & GW=$!
(cd "$YO2EMU" && YO2_NO_CLIENT=1 PYTHONUNBUFFERED=1 exec python3.12 run.py 0) >"$LOG/server.log" 2>&1 & SRV=$!
stop() { kill $GW $SRV 2>/dev/null; wait $GW $SRV 2>/dev/null; }
trap stop EXIT INT TERM

i=0; until lsof -nP -iTCP:5730 -sTCP:LISTEN >/dev/null && lsof -nP -iTCP:8001 -sTCP:LISTEN >/dev/null; do
  i=$((i+1)); [ $i -gt 300 ] && { echo "FAIL servers did not start (logs in $LOG)"; exit 1; }; sleep 0.1
done

"$NODE" "$BUILD/platform/gate_hello_ws.js" ws://127.0.0.1:8001/boxedwine-network 127.0.0.1 5730; rc=$?
echo "--- gateway ($LOG/gateway.log)"; cat "$LOG/gateway.log"
echo "--- server ($LOG/server.log, gate lines)"; grep '5730' "$LOG/server.log"
exit $rc
