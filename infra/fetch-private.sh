#!/bin/bash
# fetch-private.sh [put]: the Konami-derived files this repo leaves out, for maintainers with access to the site's
# Cloudflare account (`wrangler login`). They live in R2 as one archive, ygo-original/private/dev/de-private-data.tgz
# (private/ is never served), plus R2 duel-evolution/engine/scripts.pack: server/gamedata/ (tables + parity fixtures), client/html-ui/ assets, goldens and diffs,
# client/web-shell/loader/ (loading-screen art). No argument: download and unpack it over the tree. `put`: pack those
# paths from this tree and upload them. Everyone else regenerates them from their own game files (root README).
set -euo pipefail
R=$(cd "$(dirname "$0")/.." && pwd); T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; K=ygo-original/private/dev/de-private-data.tgz
cd $R/server
if [ "${1:-}" = put ]; then
  (cd $R && COPYFILE_DISABLE=1 tar -czf "$T/d.tgz" --exclude README.md server/gamedata \
    $(cd $R && ls -d client/html-ui/assets client/html-ui/golden* client/html-ui/diff* client/web-shell/loader 2>/dev/null))
  npx wrangler r2 object put $K --file "$T/d.tgz" --remote
else
  npx wrangler r2 object get $K --file "$T/d.tgz" --remote
  tar -xzf "$T/d.tgz" -C $R
  # the duel engine's scripts pack (~20 MB, rebuilt by scripts/engine_gamedata.mjs) lives where production reads it
  npx wrangler r2 object get ygo-original/duel-evolution/engine/scripts.pack --file $R/server/gamedata/engine/scripts.pack --remote
fi
