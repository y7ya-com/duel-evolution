#!/usr/bin/env bash
# The NPC card rules' live overlay (src/duel/ai/ruleSet.ts): change how the NPCs play a card with no deploy and no
# restart. The overlay sits on top of src/duel/ai/rules.json, per card: its fields replace the bundled ones (a field set
# to null removes it, a card set to null removes its rule). The format is in src/duel/ai/ruleExpr.ts. Example
# overlay.json:
#   { "staples": { "ring of destruction": { "chainReact": { "attacked": 2000 } } },
#     "npcs": { "84": { "elemental hero stratos": { "summonScore": 1200 } } } }
#
#   scripts/ai-rules.sh show                       the version played, the cards it changes, the last 20 versions
#   scripts/ai-rules.sh pull [file]                the live overlay into a file (default ai-rules.json), to edit
#   scripts/ai-rules.sh check <file>               the server checks it against the rules.json it runs (nothing changes)
#   scripts/ai-rules.sh push <file> "<note>"       checks, then makes it live: the next NPC duel plays by it
#   scripts/ai-rules.sh revert <version> ["<note>"]   an older version again (as a new version)
#   scripts/ai-rules.sh lab <file> [duels per NPC] [npc ids]   the NPC lab, rules.json alone vs with the overlay (needs
#       NPC_LAB_DECKS=<players.json>; this checkout's rules.json should be the live one: origin/main)
#   scripts/ai-rules.sh replay <file> [days]       the production NPC duels of the last days (default 3), asking at every
#       NPC decision what this checkout's AI would do with the overlay, shown under each decision that changes (needs
#       wrangler's Cloudflare login); traces in ./ai-rules-replay/
#
# DEPLOY_TOKEN: the Worker secret of that name (~/.config/duel-evolution/deploy.env); every version records who pushed it.
set -euo pipefail
here=$PWD
abs() { case $1 in /*) echo "$1" ;; *) echo "$here/$1" ;; esac; }   # file arguments: from where the script was called
cd "$(dirname "$0")/.."
B=${AI_RULES_BASE:-https://ygoevolution.com}
api() { curl -sS --fail-with-body -X "$1" -H "x-de-deploy: ${DEPLOY_TOKEN:?DEPLOY_TOKEN}" -H "content-type: application/json" ${2:+--data-binary "$2"} "$B/__admin/ai-rules"; echo; }
# { "overlay": <the file>, ...extra } as a request body
body() { python3 -c 'import json, sys; o = json.load(open(sys.argv[1])); o = o["overlay"] if isinstance(o, dict) and "overlay" in o else o; print(json.dumps({"overlay": o, **json.loads(sys.argv[2])}))' "$1" "$2"; }
cmd=${1:-show}
case "$cmd" in
  show) api GET ;;
  pull)
    f=$(abs "${2:-ai-rules.json}")
    api GET | python3 -c 'import json, sys; v = json.load(sys.stdin); json.dump(v["overlay"], open(sys.argv[1], "w"), indent=2); print("version", v["version"], "->", sys.argv[1])' "$f" ;;
  check) api POST "$(body "$(abs "${2:?file}")" '{"dryRun": true}')" ;;
  push)
    f=$(abs "${2:?file}"); note=${3:?"a note: what this changes and why"}
    api POST "$(body "$f" '{"dryRun": true}')" >/dev/null || { api POST "$(body "$f" '{"dryRun": true}')" || true; exit 1; }
    api POST "$(body "$f" "$(python3 -c 'import json, sys; print(json.dumps({"note": sys.argv[1]}))' "$note")")" ;;
  revert)
    api POST "$(python3 -c 'import json, sys; print(json.dumps({"revert": int(sys.argv[1]), "note": sys.argv[2]}))' "${2:?version}" "${3:-}")" ;;
  lab)
    f=$(abs "${2:?file}"); n=${3:-12}; : "${NPC_LAB_DECKS:?NPC_LAB_DECKS=<players.json>}"
    export NPC_LAB=$n ${4:+NPC_LAB_NPCS=$4}
    (npx vitest run test/npc-lab.test.ts 2>&1 | grep -A200 "^NPC lab (" > /tmp/ai-rules-lab-a.$$) &
    (NPC_LAB_RULES=$f npx vitest run test/npc-lab.test.ts 2>&1 | grep -A200 "^NPC lab (" > /tmp/ai-rules-lab-b.$$) &
    wait
    head -1 /tmp/ai-rules-lab-a.$$; head -1 /tmp/ai-rules-lab-b.$$
    echo; echo "NPC wins per NPC: rules.json -> with the overlay"
    python3 - /tmp/ai-rules-lab-a.$$ /tmp/ai-rules-lab-b.$$ <<'PY'
import re, sys
row = re.compile(r"^npc +(\d+) (L\d+ \w+) *: NPC (\d+)-(\d+)")
a, b = ({m[1]: m for m in map(row.match, open(f)) if m} for f in sys.argv[1:3])
for k in a:
    x, y = a[k], b.get(k)
    if y: print(f"  npc {k:>2} {x[2]:<11} {x[3]}-{x[4]} -> {y[3]}-{y[4]}{'' if x[3] == y[3] else '   *'}")
PY
    rm -f /tmp/ai-rules-lab-[ab].$$ ;;
  replay)
    f=$(abs "${2:?file}"); days=${3:-3}; rows=$(mktemp --suffix=.json)
    npx wrangler d1 execute duel-evolution-prod --env production --remote --json \
      --command "select * from duel_archive where kind = 'npc' and commands is not null and at > unixepoch() - $days*86400" > "$rows"
    rm -rf "$here/ai-rules-replay"
    NPC_LAB_REPLAY=$rows NPC_LAB_TRACE="$here/ai-rules-replay" NPC_LAB_ASK="ai,ai@$f" npx vitest run test/npc-lab.test.ts 2>&1 | grep "^NPC duels recorded"
    rm -f "$rows"
    # per NPC decision: what rules.json alone answers (ai>, else as recorded) against the overlay (ai@...>, else as recorded)
    python3 - "$here/ai-rules-replay" <<'PY'
import glob, os, sys
n = 0
for f in sorted(glob.glob(os.path.join(sys.argv[1], "*.txt"))):
    lines = open(f).read().split("\n")
    for i, l in enumerate(lines):
        if not l.startswith("    npc> ") or " -> " not in l: continue
        rec = l.rsplit(" -> ", 1)[1]
        base = over = rec
        for x in lines[i + 1:i + 3]:
            if x.startswith("    ai> "): base = x[8:]
            elif x.startswith("    ai@"): over = x.split("> ", 1)[1]
        if base != over:
            n += 1
            print(f"{os.path.basename(f)}:{i + 1}\n  {l.strip()[5:].rsplit(' -> ', 1)[0][:220]}\n  rules.json: {base}\n  overlay:    {over}")
print(f"\n{n} NPC decisions change with the overlay (traces: ai-rules-replay/<file>:<line>)")
PY
    ;;
  *) sed -n '2,23p' "$0"; exit 2 ;;
esac
