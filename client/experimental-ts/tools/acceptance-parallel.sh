#!/bin/bash
# acceptance-parallel.sh [-j N] <test file>...: the browser acceptance files N at a time (default 3) against one stack
# and one client. Each file is its own vitest process with its own Chrome (the harness's port is per pid) and its own
# accounts (RUN is per process), so files don't share state; record() appends whole lines to runs.jsonl. A file
# waits for 30% free memory before it starts (the harness refuses below 25%; other sessions run browsers too) and is
# retried once if Chrome was refused for memory. Logs: $ACCEPTANCE_LOGS (default ~/.cache/de-scratch/acceptance),
# one per file; a summary line per file as it ends.
#   ACCEPTANCE_STACK=... ACCEPTANCE_CLIENT=http://localhost:5174 tools/acceptance-parallel.sh -j 3 tests/acceptance/*.test.ts
cd "$(dirname "$0")/.." || exit 1
jobs=3
[ "$1" = "-j" ] && { jobs=$2; shift 2; }
logs=${ACCEPTANCE_LOGS:-$HOME/.cache/de-scratch/acceptance}
mkdir -p "$logs"
free() { awk '/MemAvailable/{a=$2}/MemTotal/{t=$2}END{print int(a*100/t)}' /proc/meminfo; }
one() {
  local file=$1 log="$logs/$(basename "$1" .test.ts).log" start=$SECONDS
  for attempt in 1 2; do
    until [ "$(free)" -ge 30 ]; do sleep 5; done
    ACCEPTANCE=1 node tools/run.mjs vitest run "$file" --reporter=verbose > "$log" 2>&1
    grep -q "memory free" "$log" || break
  done
  echo "$(basename "$file"): $(grep -cE '^ +✓' "$log") passed, $(grep -cE '^ +×' "$log") failed, $((SECONDS - start)) s ($log)"
}
for file in "$@"; do
  while [ "$(jobs -rp | wc -l)" -ge "$jobs" ]; do wait -n; done
  one "$file" &
  sleep 8   # stagger the Chrome launches and sign-ins
done
wait
