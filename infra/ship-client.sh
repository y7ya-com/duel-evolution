#!/bin/bash
# ship-client.sh [--build] [prefix]: put a web build of client/ live in R2 ygo-original/<prefix>/ (default recomp-de/,
# the server's CLIENT_PREFIX). recomp/ is the base the server falls back to for anything missing under the prefix
# (loader/, game/, fonts/). The web shell files (index.html, stage.js, loader.js) go up with every prefix.
#   --build  first run `make web web-async web-ios` in client/recomp (through tools/buildslot.py), else ship its existing build-web/
# yo2rc.html gets client/web-shell/stage.js (fit-to-window + fullscreen) and loader.js (loading screen; NOLOADER=1
# leaves it out) just before the runtime script, the product name as its title and the build id for crash reports.
# The wasm goes up first, so a new js never meets an old wasm. Needs `wrangler login` on the site's Cloudflare account.
# DRY=1: prepare infra/out/<prefix>/ and list the uploads, upload nothing.
set -euo pipefail
R=$(cd "$(dirname "$0")/.." && pwd); BUILD=0
[ "${1:-}" = --build ] && { BUILD=1; shift; }
X=${1:-recomp-de}; X=${X%/}; C=$R/client; B=$C/recomp/build-web; O=$R/infra/out/$X
[ $BUILD = 1 ] && (cd $C/recomp && python3 -I ../tools/buildslot.py make -j2 web web-async web-ios)
for f in yo2rc.html yo2rc.js yo2rc.wasm yo2rc-ios.js yo2rc-ios.wasm; do [ -s $B/$f ] || { echo "no $B/$f (build it, or pass --build)"; exit 1; }; done
mkdir -p $O; cp $B/yo2rc.html $B/yo2rc.js $B/yo2rc.wasm $O/
# the ASYNCIFY fallback (Safari/Firefox, `make web-async`), when built: the page picks it when the browser has no JSPI
ASYNC=; [ -s $B/yo2rc-async.js ] && [ -s $B/yo2rc-async.wasm ] && { cp $B/yo2rc-async.js $B/yo2rc-async.wasm $O/; ASYNC="yo2rc-async.wasm yo2rc-async.js"; }
# the 1 GB ASYNCIFY build (`make web-ios`): iPhone/iPad (iOS Safari refuses a 2 GB shared memory) and any browser that
# can't reserve the JSPI build's 2 GB (yo2rc.html picks it)
cp $B/yo2rc-ios.js $B/yo2rc-ios.wasm $O/; IOS="yo2rc-ios.wasm yo2rc-ios.js"
BUILDID=$(git -C $R rev-parse --short HEAD) NOLOADER=${NOLOADER:-} python3 - $O/yo2rc.html <<'PY'
import os, re, sys; p = sys.argv[1]; s = open(p).read()
tag = '<script src="stage.js"></script>\n' + ('' if os.environ.get('NOLOADER') else '<script src="loader.js"></script>\n')
i = s.find('<script id="pick">'); assert i > 0 and 'stage.js' not in s; s = s[:i] + tag + s[i:]
# user-facing name only: no build or engine names in the tab title
s, n = re.subn(r'<title>[^<]*</title>', '<title>Duel Evolution</title>\n<meta name="description" content="Duel Evolution: the online card-dueling game, in your browser.">', s, 1)
assert n == 1
# the build id for crash reports (shell.html's /__crash payload)
s = s.replace('</title>', '</title>\n<meta name="yo2-build" content="%s">' % os.environ['BUILDID'], 1)
open(p, 'w').write(s)
PY
echo "$(git -C $R rev-parse --short HEAD) $(git -C $R branch --show-current) dirty: $(git -C $R status --short -uno | tr '\n' ' ') built $(stat -f %Sm $B/yo2rc.wasm 2>/dev/null || stat -c %y $B/yo2rc.wasm)" > $O/BUILD.txt
cat $O/BUILD.txt
FILES="$ASYNC $IOS yo2rc.wasm yo2rc.js yo2rc.html BUILD.txt"
# the web shell goes with every prefix: the live root page is recomp-de/index.html, and a prefix's own stage.js /
# loader.js must match its yo2rc.html. index.html last: it is what lets new browsers (phones) in.
cp $C/web-shell/index.html $C/web-shell/stage.js $C/web-shell/loader.js $O/; FILES="$FILES stage.js loader.js index.html"
cd $R/server
for f in $FILES; do
  [ -n "${DRY:-}" ] && { echo "would upload $X/$f ($(wc -c < $O/$f | tr -d ' ') bytes)"; continue; }
  npx wrangler r2 object put "ygo-original/$X/$f" --file $O/$f --remote 2>&1 | grep -q "Upload complete" || { echo "upload $f failed"; exit 1; }
  echo "uploaded $X/$f"
done
