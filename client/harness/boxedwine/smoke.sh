#!/bin/bash
# One repeatable in-game check of the replacement DLL: YOLaucher's server on a fresh state with a test account, the
# real yo2.exe under Boxedwine with every replacement patched in, Boxedwine's automation player clicking ONLINE ->
# rules -> login, and the server log saying how far the client got. Exit 0 when it reached $EXPECT (default lobby).
#
#   harness/boxedwine/smoke.sh                 # memory rules as run.sh: >= 60% free to start, one instance
#   YO2REP=off harness/boxedwine/smoke.sh      # the same run on the untouched original, for comparison
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
EMU=${YO2EMU_DIR:-/Users/y/Documents/GitHub/YOLaucher-web/tools/yo2emu}
A=~/Library/Containers/org.boxedwine/Data/yo2/smoke   # automation dir: must be inside the app's sandbox container
SRV=$TMPDIR/yo2smoke                                   # server state, log and token files (never the YOLaucher repo)
EXPECT=${EXPECT:-lobby}
USER_=qasmoke PASS_=qasmoke26                          # made-up test login, only ever seeded into $SRV/state.json

# Same rules as run.sh, checked before the server starts (it takes ~150 MB): exit 2 = skipped, nothing ran.
free=$(memory_pressure | tail -1 | grep -o '[0-9]*')
[ "$free" -ge 62 ] || { echo "SMOKE SKIPPED: only $free% memory free (need 62% so run.sh still sees 60%)"; exit 2; }
pgrep -x Boxedwine >/dev/null && { echo "SMOKE SKIPPED: Boxedwine already running"; exit 2; }
rm -rf "$A" "$SRV"
mkdir -p "$A" "$SRV"
python3.12 -I "$HERE/make_state.py" "$SRV/state.json" "$USER_" "$PASS_"
(cd "$EMU" && LOCALAPPDATA=$SRV YO2_NO_CLIENT=1 YO2_LOGDIR=$SRV YO2_STATE=$SRV/state.json exec python3.12 run.py 0) \
  > "$SRV/server.txt" 2>&1 &
spid=$!
trap 'kill $spid 2>/dev/null || true' EXIT
for _ in $(seq 60); do curl -s -m 1 -o /dev/null http://127.0.0.1:8730/yo2/root.txt && break; sleep 1; done
curl -s -m 1 -o /dev/null http://127.0.0.1:8730/yo2/root.txt || { echo "server didn't come up"; tail "$SRV/server.txt"; exit 1; }

# CAPTURE=rules|login|charsel: no smoke, just reach that screen and save the whole guest screen (see script.py).
mkdir -p "$HERE/ref"
cp "$HERE"/ref/*.bmp "$A/" 2>/dev/null || true
python3 -I "$HERE/script.py" "$USER_" "$PASS_" ${CAPTURE:+--capture "$CAPTURE"} > "$A/script.txt"
[ -z "${CAPTURE:-}" ] || python3 -I "$HERE/script.py" --never "$A/never.bmp"

AUTOMATION=$A SECS=${SECS:-600} "$HERE/run.sh" | tee "$A/run.txt" || true
if [ -n "${CAPTURE:-}" ]; then
  out=$(dirname "$A")/capture-$CAPTURE.bmp
  f=~/Library/Containers/org.boxedwine/Data/failed.bmp   # the sandboxed app writes it in its container home
  [ "$f" -nt "$A/script.txt" ] && mv "$f" "$out" && echo "CAPTURE saved $out" || echo "CAPTURE: no new failed.bmp"
  exit 0
fi

# How far the client got, from the server's own log (stage -> first line that proves it).
LOG=$(ls -t "$SRV"/2*.log 2>/dev/null | head -1)
reached=none
while read -r stage pattern; do
  grep -qE "$pattern" "$LOG" 2>/dev/null || break
  reached=$stage
done <<'EOF'
gate \[srv:5730\] <- 0x2005
login \[srv:5731\] -> 0x3004 #[0-9]+ len=12 00 00 00 00
charlist \[srv:5731\] -> 0x3012
character \[srv:5731\] -> 0x3103
lobby \[srv:5732\] -> 0x4101
room entra en el bloque
EOF
echo "--- server log: $LOG"
grep -E '^\[(srv|cuentas|hub)' "$LOG" | cut -c1-160 | tail -25 || true
bw=$(grep -o 'boxedwine-exit=[0-9a-z]*' "$A/run.txt" | tail -1)
echo "SMOKE reached=$reached expect=$EXPECT YO2REP=${YO2REP:-all} ${bw:-boxedwine-exit=?}"
order="none gate login charlist character lobby room"
pos() { local i=0; for s in $order; do [ "$s" = "$1" ] && echo $i; i=$((i + 1)); done; }
[ "$(pos "$reached")" -ge "$(pos "$EXPECT")" ]
