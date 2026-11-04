#!/bin/bash
# tools/acceptance.sh <test file> [vitest args]: one browser acceptance run against the local stack. Waits for memory
# headroom (the shared Chromium launcher refuses below 25% free) and retries memory refusals; output in $ACC_LOG.
cd "$(dirname "$0")/.."
ACC_LOG=${ACC_LOG:-/tmp/acc-$(basename "$PWD")-$$.log}
for attempt in 1 2 3 4 5 6 7 8; do
  for i in $(seq 1 180); do f=$(awk '/MemAvailable/{a=$2}/MemTotal/{t=$2}END{print int(a*100/t)}' /proc/meminfo); [ "$f" -ge 30 ] && break; sleep 10; done
  ACCEPTANCE=1 node tools/run.mjs vitest run "$@" --reporter=verbose > "$ACC_LOG" 2>&1
  grep -q "memory free" "$ACC_LOG" || break
done
grep -E "✓|×|→" "$ACC_LOG" | cut -c1-300; echo "log: $ACC_LOG"
