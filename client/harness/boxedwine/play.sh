#!/bin/bash
# Interactive native session for finding the game flow by hand: YOLaucher's server on a seeded state, the real yo2.exe
# under Boxedwine (all replacements unless YO2REP=off), no automation script, so real clicks and keys reach the game.
# Stopped after SECS (default 1800) or by run.sh's memory/RSS watchdog. State persists in $SRV between runs unless
# FRESH=1, so characters, decks and DP carry over.
#
#   harness/boxedwine/play.sh            # then drive the Boxedwine window; the server log is $SRV/2*.log
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
EMU=${YO2EMU_DIR:-/Users/y/Documents/GitHub/YOLaucher-web/tools/yo2emu}
SRV=${SRV:-$TMPDIR/yo2play}
USER_=qasmoke PASS_=qasmoke26                          # made-up test login, only ever seeded into $SRV/state.json

free=$(memory_pressure | tail -1 | grep -o '[0-9]*')
[ "$free" -ge ${MINFREE:-62} ] || { echo "PLAY SKIPPED: only $free% memory free"; exit 2; }
[ "${FRESH:-0}" = 1 ] && rm -rf "$SRV"
mkdir -p "$SRV"
[ -f "$SRV/state.json" ] || python3.12 -I "$HERE/make_state.py" "$SRV/state.json" "$USER_" "$PASS_"
# OFFSET (default 100): every server port + OFFSET, and the hook's YO2ONLINE_OFFSET to match, so this never collides
# with another run.py on the stock ports (the browser session's).
export OFFSET=${OFFSET:-100}
(cd "$EMU" && YO2_PORT_OFFSET=$OFFSET LOCALAPPDATA=$SRV YO2_NO_CLIENT=1 YO2_LOGDIR=$SRV YO2_STATE=$SRV/state.json exec python3.12 run.py 0) \
  > "$SRV/server.txt" 2>&1 &
spid=$!
trap 'kill $spid 2>/dev/null || true' EXIT
for _ in $(seq 60); do curl -s -m 1 -o /dev/null http://127.0.0.1:$((8730 + OFFSET))/yo2/root.txt && break; sleep 1; done
curl -s -m 1 -o /dev/null http://127.0.0.1:$((8730 + OFFSET))/yo2/root.txt || { echo "server didn't come up"; tail "$SRV/server.txt"; exit 1; }
SECS=${SECS:-1800} "$HERE/run.sh"
