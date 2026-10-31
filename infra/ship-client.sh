#!/bin/bash
# ship-client.sh [--build] [prefix]: put a web build of client/ live in R2 ygo-original/<prefix>/ (default recomp-de/,
# the server's CLIENT_PREFIX). recomp/ is the base the server falls back to for anything missing under the prefix
# (loader/, game/, fonts/). The web shell files (index.html, stage.js, loader.js, starter.js + ui.js, ui/ art, the
# HTML UI under h-<hash>/) go up with every prefix.
#   --build  first run `make web web-async web-ios` in client/recomp (through tools/buildslot.py), else ship its existing build-web/
# yo2rc.html gets client/web-shell/stage.js (fit-to-window + fullscreen) and loader.js (loading screen; NOLOADER=1
# leaves it out) just before the runtime script, the product name as its title and the build id for crash reports.
# Atomic: every runtime file (yo2rc*.js/.wasm, stage.js, loader.js) goes up under a content-hashed name
# (yo2rc-ios-<hash>.js loads yo2rc-ios-<hash>.wasm), those are checked live, and only then the page (yo2rc.html,
# index.html) that names them. A tab that loads mid-ship gets one whole build, old or new. Earlier hashed files stay in
# R2, so open tabs keep working. Needs `wrangler login` on the site's Cloudflare account.
# DRY=1: prepare infra/out/<prefix>/ and list the uploads, upload nothing. SITE: where <prefix> is live (checked after
# the hashed uploads; default https://original.ygoevolution.com for recomp-de, none for other prefixes).
set -euo pipefail
R=$(cd "$(dirname "$0")/.." && pwd); BUILD=0
[ "${1:-}" = --build ] && { BUILD=1; shift; }
X=${1:-recomp-de}; X=${X%/}; C=$R/client; B=$C/recomp/build-web; O=$R/infra/out/$X
[ $BUILD = 1 ] && (cd $C/recomp && python3 -I ../tools/buildslot.py make -j2 web web-async web-ios)
# JSPI (Chrome), ASYNCIFY (Safari/Firefox, `make web-async`) and the 1 GB ASYNCIFY build (`make web-ios`: iPhone/iPad,
# whose Safari refuses a 2 GB shared memory, and any browser that can't reserve the JSPI build's 2 GB): yo2rc.html picks
for f in yo2rc.html yo2rc.js yo2rc.wasm yo2rc-async.js yo2rc-async.wasm yo2rc-ios.js yo2rc-ios.wasm; do
  [ -s $B/$f ] || { echo "no $B/$f (build it, or pass --build)"; exit 1; }
done
rm -rf $O; mkdir -p $O; cp $B/yo2rc.html $O/
# the HTML UI's Svelte screens (htmlui/gen/, gitignored): built here, shipped with the rest of htmlui/ below
(cd $C/web-shell/htmlui && npm ci --no-audit --no-fund --silent && npm run --silent build)
BUILDID=$(git -C $R rev-parse --short HEAD) NOLOADER=${NOLOADER:-} python3 - $B $C/web-shell $O <<'PY' > $O/HASHED
import hashlib, os, re, sys; b, shell, o = sys.argv[1:]
rd = lambda p: open(p, 'rb').read()
def put(name, data):
    os.makedirs(os.path.dirname(os.path.join(o, name)), exist_ok=True)
    open(os.path.join(o, name), 'wb').write(data); print(name)
h = lambda *d: hashlib.md5(b''.join(d)).hexdigest()[:10]
names = {}
for n in ('yo2rc', 'yo2rc-async', 'yo2rc-ios'):
    js, wasm = rd(f'{b}/{n}.js'), rd(f'{b}/{n}.wasm'); k = h(js, wasm)
    q = f"'{n}.wasm'".encode(); assert js.count(q) == 1, n   # Emscripten's locateFile('<n>.wasm')
    put(f'{n}-{k}.wasm', wasm); put(f'{n}-{k}.js', js.replace(q, f"'{n}-{k}.wasm'".encode())); names[n] = f'{n}-{k}.js'
for n in ('stage', 'loader'):
    js = rd(f'{shell}/{n}.js'); names[n] = f'{n}-{h(js)}.js'; put(names[n], js)
# the starter-deck picker and the html-ui widgets it imports (its art goes up under ui/, below)
js = rd(f'{shell}/../html-ui/ui.js'); names['ui'] = f'ui-{h(js)}.js'; put(names['ui'], js)
js = rd(f'{shell}/starter.js'); q = b'"./ui.js"'; assert js.count(q) == 1
js = js.replace(q, f'"./{names["ui"]}"'.encode()); names['starter'] = f'starter-{h(js)}.js'; put(names['starter'], js)
# the HTML UI (web-shell/htmlui, ES modules with relative imports): every file under one content-hashed folder,
# h-<hash>/htmlui/... beside h-<hash>/ui.js (bridge.js and controls/ import ../ui.js), started by one inline module.
# Its kill switch is the unhashed htmlui.json beside the page (?HTML_UI= overrides it), never shipped from here.
hu = os.path.join(shell, 'htmlui')
mods = sorted(os.path.relpath(os.path.join(d, f), hu) for d, _, fs in os.walk(hu) for f in fs
              if f.endswith('.js') and os.path.relpath(d, hu).split(os.sep)[0] in ('.', 'controls', 'screens', 'read', 'gen'))
hk = h(rd(f'{shell}/../html-ui/ui.js'), *(m.encode() + rd(os.path.join(hu, m)) for m in mods))
put(f'h-{hk}/ui.js', rd(f'{shell}/../html-ui/ui.js'))
for m in mods: put(f'h-{hk}/htmlui/{m}', rd(os.path.join(hu, m)))
p = os.path.join(o, 'yo2rc.html'); s = open(p).read()
tag = f'<script src="{names["stage"]}"></script>\n' + ('' if os.environ.get('NOLOADER') else f'<script src="{names["loader"]}"></script>\n') \
    + f'<script src="{names["starter"]}"></script>\n' \
    + f'<script type="module">import("./h-{hk}/htmlui/bridge.js").then(m => m.start(Module)).catch(e => console.warn("htmlui", e));</script>\n'
i = s.find('<script id="pick">'); assert i > 0 and '<script src="stage' not in s; s = s[:i] + tag + s[i:]
# the picker's script names (and its endsWith("/yo2rc.js") check) -> the hashed ones
for n in ('yo2rc-ios', 'yo2rc-async', 'yo2rc'):
    assert f'{n}.js"' in s, n; s = s.replace(f'{n}.js"', f'{names[n]}"')
# user-facing name only: no build or engine names in the tab title. The title, description, canonical and share tags
# are index.html's (its <!-- seo --> block), so both pages say the same to search engines and link previews
seo = re.search(r'<!-- seo.*?<!-- /seo -->\n', open(f'{shell}/index.html').read(), re.S).group(0)
s, n = re.subn(r'<title>[^<]*</title>\n', lambda m: seo, s, count=1)
assert n == 1
# the build id for crash reports (shell.html's /__crash payload)
s = s.replace('</title>', '</title>\n<meta name="yo2-build" content="%s">' % os.environ['BUILDID'], 1)
open(p, 'w').write(s)
PY
echo "$(git -C $R rev-parse --short HEAD) $(git -C $R branch --show-current) dirty: $(git -C $R status --short -uno | tr '\n' ' ') built $(stat -f %Sm $B/yo2rc.wasm 2>/dev/null || stat -c %y $B/yo2rc.wasm)" > $O/BUILD.txt
cat $O/BUILD.txt
cp $C/web-shell/index.html $O/
# for search engines: Cloudflare's managed robots.txt (its content signals) goes out ahead of ours, which adds the sitemap
cp $C/web-shell/robots.txt $C/web-shell/sitemap.txt $O/
# the UI art (the starter picker's and the HTML UI's): html-ui/assets, atlases + clamp/ + glyphs (Konami-derived:
# from infra/fetch-private.sh, never in git)
# every file in it goes up: a screen that needs another atlas drops it (and its clamp/ + .rgb.png) in there
UI=$(cd $C/html-ui/assets && find . -type f ! -name '.*' | sed 's#^\./##' | sort)
[ -n "$UI" ] && [ -s $C/html-ui/assets/glyphs-dejavu16.json ] || { echo "no html-ui/assets (run infra/fetch-private.sh)"; exit 1; }
for f in $UI; do mkdir -p $(dirname $O/ui/$f); cp $C/html-ui/assets/$f $O/ui/$f; done
# ponytail: old hashed files are never deleted (~120 MB a ship); prune by hand when R2 storage matters
up() {
  for f in "$@"; do
    [ -n "${DRY:-}" ] && { echo "would upload $X/$f ($(wc -c < $O/$f | tr -d ' ') bytes)"; continue; }
    (cd $R/server && npx wrangler r2 object put "ygo-original/$X/$f" --file $O/$f --remote 2>&1) | grep -q "Upload complete" || { echo "upload $f failed"; exit 1; }
    echo "uploaded $X/$f"
  done
}
# each wasm's pre-compressed sidecar (server/src/worker.ts sends <name>.wasm.br as is to a br client): brotli -q 9 is
# ~30% under the edge's own brotli (yo2rc: 6.3 -> 4.5 MB). Up before the page, checked live below like the rest.
for f in $(grep '\.wasm$' $O/HASHED); do [ -n "${DRY:-}" ] || nice brotli -q 9 -f -o $O/$f.br $O/$f; done
up $(grep '\.wasm$' $O/HASHED | sed 's/$/.br/') $(grep '\.wasm$' $O/HASHED) $(grep '\.js$' $O/HASHED) $(for f in $UI; do echo ui/$f; done)
SITE=${SITE-$([ $X = recomp-de ] && echo https://original.ygoevolution.com)}
md5() { python3 -c 'import hashlib, sys; print(hashlib.md5(sys.stdin.buffer.read()).hexdigest())'; }
if [ -z "${DRY:-}" ] && [ -n "$SITE" ]; then
  for f in $(cat $O/HASHED); do
    [ "$(curl -sf "$SITE/$f" | md5)" = "$(md5 < $O/$f)" ] || { echo "live $SITE/$f does not match: page not swapped"; exit 1; }
    case $f in *.wasm) [ "$(curl -sf -H 'Accept-Encoding: br' "$SITE/$f" | brotli -dc | md5)" = "$(md5 < $O/$f)" ] \
      || { echo "live $SITE/$f (br) does not match: page not swapped"; exit 1; };; esac
  done
  echo "hashed files live and checked"
fi
# the page last: yo2rc.html names the hashed files; index.html is what lets new browsers (phones) in
up BUILD.txt robots.txt sitemap.txt yo2rc.html index.html
