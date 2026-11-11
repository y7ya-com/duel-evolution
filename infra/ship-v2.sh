#!/bin/bash
# ship-v2.sh: build the TS client rewrite (client/experimental-ts) and deploy ONLY the v2 front, infra/v2
# (Worker duel-evolution-v2 on v2.ygoevolution.com, README there). It never touches the production Worker
# (duel-evolution), its config, D1, R2 or routes: v2 reaches them only through its LIVE service binding.
#   infra/ship-v2.sh          # guarded: HEAD is a clean, pushed commit of t3/integ6 or t3/v2-site
#   DRY=1 infra/ship-v2.sh    # build + `wrangler deploy --dry-run` (any branch; the guard is reported, not enforced)
# No arguments are accepted (no --env, no other config): what it deploys is infra/v2/wrangler.jsonc, checked below.
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cfg="$root/infra/v2/wrangler.jsonc"
client="$root/client/experimental-ts"
wrangler=${WRANGLER:-$root/server/node_modules/.bin/wrangler}
BRANCHES="t3/integ6 t3/v2-site"
die() { echo "ship-v2: $*" >&2; exit 1; }
[ $# -eq 0 ] || die "takes no arguments (got: $*); it deploys infra/v2/wrangler.jsonc and nothing else"
case " ${WRANGLER_ENV:-} ${CLOUDFLARE_ENV:-} " in *[a-z]*) die "WRANGLER_ENV / CLOUDFLARE_ENV set: v2 has no environments";; esac
[ -x "$wrangler" ] || die "no wrangler at $wrangler (server/node_modules)"

# --- the config: v2's own Worker, nothing of production's ------------------------------------------------------------
node - "$cfg" <<'JS' || die "infra/v2/wrangler.jsonc refused (above)"
const fs = require('fs');
const text = fs.readFileSync(process.argv[2], 'utf8').replace(/(^|[\s,{\[])\/\/.*$/gm, '$1');
const c = JSON.parse(text.replace(/,(\s*[}\]])/g, '$1'));
const bad = [];
if (c.name !== 'duel-evolution-v2') bad.push(`name is ${JSON.stringify(c.name)}, not "duel-evolution-v2"`);
if (c.env) bad.push('has an "env" block (no --env production or any other environment here)');
for (const k of ['d1_databases', 'r2_buckets', 'durable_objects', 'kv_namespaces', 'queues', 'triggers', 'migrations'])
  if (c[k] && (Array.isArray(c[k]) ? c[k].length : Object.keys(c[k]).length)) bad.push(`has ${k}: v2 keeps no data of its own`);
const routes = c.routes ?? [];
if (routes.length !== 1 || routes[0].pattern !== 'v2.ygoevolution.com' || routes[0].custom_domain !== true) bad.push('routes must be exactly the custom domain v2.ygoevolution.com');
const svc = c.services ?? [];
if (svc.length !== 1 || svc[0].binding !== 'LIVE' || svc[0].service !== 'duel-evolution' || svc[0].environment) bad.push('services must be exactly LIVE -> duel-evolution');
if (c.vars?.PUBLIC_ORIGIN !== 'https://v2.ygoevolution.com' || c.vars?.LIVE_ORIGIN !== 'https://original.ygoevolution.com') bad.push('vars PUBLIC_ORIGIN / LIVE_ORIGIN are not v2 / original');
if (bad.length) { for (const b of bad) console.error('  - ' + b); process.exit(1); }
JS

# --- the commit: a clean, pushed head of one of the v2 branches -------------------------------------------------------
branch=$(git -C "$root" symbolic-ref -q --short HEAD || echo "(detached)")
head=$(git -C "$root" rev-parse HEAD)
guard() {
  case " $BRANCHES " in *" $branch "*) ;; *) echo "HEAD is on $branch, not one of: $BRANCHES"; return;; esac
  [ -z "$(git -C "$root" status --porcelain -uno)" ] || { echo "tracked files differ from HEAD (git status): commit them first"; return; }
  git -C "$root" fetch -q origin "$branch" 2>/dev/null || { echo "can't fetch origin/$branch"; return; }
  [ "$head" = "$(git -C "$root" rev-parse "origin/$branch")" ] || { echo "HEAD ${head:0:7} is not origin/$branch (push it first, so what is on v2 is on origin)"; return; }
}
problem=$(guard)
if [ -n "$problem" ]; then
  [ -n "${DRY:-}" ] || die "$problem"
  echo "ship-v2: DRY, guard would refuse: $problem"
else echo "ship-v2: $branch ${head:0:7}, clean and pushed"; fi
for f in card-catalog.json card-details.json card-texts.json deck-recipes.json duel-texts.json npc-data.json world-maps.json; do
  [ -s "$client/public/$f" ] || die "client/experimental-ts/public/$f is missing (ACCEPTANCE.md: copy public/*.json from the main checkout)"
done

# --- build: same-origin on v2 (the API, /net and live's /game/ files through the front) -------------------------------
echo "ship-v2: building client/experimental-ts (VITE_DE_ASSETS=/game/ VITE_DE_DISCORD_OAUTH=0)"
rm -rf "$client/dist"
(cd "$client" && VITE_DE_ASSETS=/game/ VITE_DE_DISCORD_OAUTH=0 npm run build --silent)
[ -s "$client/dist/index.html" ] || die "the build left no dist/index.html"
echo "ship-v2: dist $(du -sh "$client/dist" | cut -f1), $(find "$client/dist" -type f | wc -l) files"

cat <<MSG
ship-v2: will deploy
  Worker   duel-evolution-v2 (infra/v2/worker.ts), custom domain v2.ygoevolution.com
  assets   client/experimental-ts/dist (build of ${head:0:7}, $branch)
  binding  LIVE -> duel-evolution (production, unchanged); no D1 / R2 / Durable Objects of its own
MSG
if [ -n "${DRY:-}" ]; then
  (cd "$root/infra/v2" && "$wrangler" deploy -c wrangler.jsonc --dry-run --outdir "${OUTDIR:-$root/infra/v2/.dry}")
  echo "ship-v2: DRY run done, nothing deployed"
  exit 0
fi
(cd "$root/infra/v2" && "$wrangler" deploy -c wrangler.jsonc)
echo "ship-v2: deployed ${head:0:7} to https://v2.ygoevolution.com (rollback: README.md)"
