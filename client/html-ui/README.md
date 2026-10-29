# html-ui: the game's login UI in HTML/CSS, pixel for pixel

`login.html` is the in-game 2008 login dialog (CWindowLogin) rebuilt in HTML/CSS from the game's own textures and
glyphs, checked against frames read back from the recompiled web client by an automated pixel diff. The
assets and goldens are Konami's, so they are not committed: `tools/extract_assets.py` copies the textures out of
your own merge.dat, and `tools/capture_signin.py` / `tools/grab.py` re-capture the goldens from your own client build.

## Result (`node tools/diff.mjs`, Chrome for Testing 153, headless, 1024x768, DPR 1)

| state | dialog identical % | dialog within ±2 % | outside text: within ±2 % / max err |
|---|---|---|---|
| idle (caret in User ID) | 99.83 | 99.88 | 100 / 1 |
| hover-ok | 99.83 | 99.88 | 100 / 1 |
| hover-cancel | 99.83 | 99.88 | 100 / 1 |
| press-cancel | 99.76 | 99.88 | 100 / 1 |
| press-cancel-off (held, dragged off) | 99.77 | 99.88 | 100 / 1 |
| focus-pass | 99.84 | 99.88 | 100 / 1 |
| pass-typed (`********`) | 99.83 | 99.88 | 100 / 1 |
| user-typed | 99.83 | 99.88 | 100 / 1 |
| check-user-on | 99.75 | 99.88 | 100 / 2 |
| check-both-on | 99.69 | 99.88 | 100 / 2 |

"Dialog" is the union of the dialog's logged draw rects (122,496 px); whole-frame numbers (99.95–99.98 %) are in
`diff/report.md`, heatmaps in `diff/<state>-heat.png` (grey: identical, yellow: ±1–2, red: more). `node
tools/interact.mjs` drives the page with real mouse and keyboard events (type, Tab, click, press, drag off) and gets
the same numbers against the same goldens.

What is left:
- 143 px in 5 glyph cells (the red in the heatmaps). The game point-samples glyph cells exactly on texel boundaries
  (below), and in a few triangles the GPU's interpolated v lands just under the integer, so some rows read the texel
  above. Same 5 cells in every capture; it is the GPU's rounding, not the data.
- ±1–2 where a sprite needs the mask path (frame corners, checkbox): Chrome rounds the masked layer once more than GL.

## How the game draws it, and how the page matches it

Logged with `tools/hook.js` (a WebGL2 wrapper loaded before the client): every draw's texture, vertices (dst rect,
src rect, vertex colour), blend state and uniforms; textures read back from GL and matched texel for texel against
every PNG in merge.dat (`tools/findsrc.py`).

- **Textures** (`assets/`, copied byte for byte by `tools/extract_assets.py`): `data\common\window\`
  `window_base_01_c01.png` (frame + input field), `swich_01_c00.png` (buttons: normal, hover, pressed, 24 px apart),
  `check_01_c00.png` (box + check mark), `kasoru_01_c00.png` (caret).
- **Sampling.** Sprites are textured quads, LINEAR, drawn with D3D8's pixel centres (the recomp's vertex shader keeps
  them): every pixel reads its texture half a texel up-left, so 1:1 edges are 50/50 blends of neighbouring texels
  and stretched tiles blend into the next tile. `ui.js sprite()` puts the whole atlas, at natural size, in a box
  clipped to the dst rect and moves it with `translate(.5px,.5px) scale(kx,ky)` (transforms are sub-pixel exact;
  `background-size`/`-position` are pixel-snapped). `assets/clamp/` is each atlas with its top row and left column
  repeated once: the CLAMP_TO_EDGE texels a tile on the atlas edge reads.
- **Blending.** GL filters texels unpremultiplied (transparent texels here are white, and that white bleeds into the
  colour); Chrome filters premultiplied. Where every texel a sprite reads is opaque the two agree and the sprite is
  one image draw with its alpha folded in (exact). Elsewhere the opaque copy (`*.rgb.png`) is drawn under a
  `mask-image` of the real alpha: filtered colour × filtered alpha. The frame's 70 % is its vertex alpha 178/255.
- **Text.** The game asks GDI for `CreateFontIndirectA` "Arial", lfHeight 16, regular, DEFAULT_CHARSET (logged in the
  native build under lldb) and reads each glyph with `GetGlyphOutlineW(GGO_GRAY8_BITMAP)`. The web build's GDI
  stand-in has no Arial and uses DejaVu Sans through stb_truetype (cell = OS/2 winAscent+winDescent).
  `UpdateTextTexture` (FUN_0058d7a0) copies each glyph's whole black box (zeros too) into a 256x256 texture,
  alpha = ⌊level·251/64⌋, pen += gmCellIncX + 1, new row of 16 when the next cell would pass 256, then draws one
  1:1 quad per cell (POINT). `tools/glyphs/glyphs.c` runs the same stb_truetype calls on the same font file
  (`assets/glyphs-dejavu16.json`); `ui.js text()` rebuilds the texture and the cells on a canvas. Checked: all 16
  glyph textures captured from the game (every label, `********`, all of `[0-9A-Za-z]`) come out bit-identical.
- **Behaviour** (from the captures): buttons show pressed only while held over them, normal when dragged off; the
  caret blinks 15 frames on / 15 off at the game's 30 fps (500 ms); fields take `[0-9A-Za-z]`, 20 characters (what
  arrived through the game; symbols never did, with either driver), a click puts the caret at a cell boundary;
  checkboxes toggle on click. (Tab between fields and Enter = OK are the page's own, not captured.)

## Reproduce

Captures (needs the recomp web build and game data, `tools/serve.mjs` paths at the top):
1. `node tools/serve.mjs 8931`: the recomp/ build + game files, hook.js injected, updater HTTP forwarded to the live
   server. A CDP driver on :9400 (yo2-decomp-data `web/run/drive.mjs` under `emulock.py`), viewport 1024x768.
2. Open `http://127.0.0.1:8931/yo2rc.html?game=game/&fonts=fonts/&http=http://127.0.0.1:8931&gateway=wss://original.ygoevolution.com/net&server=127.0.0.1&YO2_PORT_OFFSET=1000`,
   click ONLINE (512,458) with a 0.5 s hover, then per state set the mouse/keys and run `python3 tools/grab.py
   <captures>/<state>`: one frame's draws + read-backs before the dialog's first draw (`snap_t21`, the backdrop) and
   before the cursor (`snap_t1` / `snap_t12`).
3. `python3 tools/goldens.py <captures>` writes `golden/` (frame, backdrop, widget state read off the draws, draws).

Assets: `python3 tools/extract_assets.py <merge.dat> <dir with kcejyugi.py>`; glyphs: `cc -O1 -ffp-contract=off -I
<dir with stb_truetype.h> tools/glyphs/glyphs.c -o glyphs -lm && ./glyphs dejavusans.ttf 16 > assets/glyphs-dejavu16.json`.

`ui.js` is also what `client/web-shell/starter.js` (the starter-deck picker) draws with: `loadGlyphs(base)` takes the
art's folder, and buttons take keyboard focus (Tab; Enter/Space press; focus shows the hover tiles).

Check: `node tools/diff.mjs [page] [goldenDir] [outDir] [--tol=N]`, `node tools/interact.mjs`. Both refuse to start a
browser with under 20 % memory free. Numbers are for Chrome (GPU raster); other engines composite differently.

## The sign-in panel (`signin.html`)

The same pieces arranged as the other game's login: header "Authentication" / "Encrypted", a full-width "Sign in with
Discord" button, "or", Username and Password, a full-width "Sign in", "Create account · Reset password", a status line
(mark + text). Nothing new is drawn: the window, buttons, fields and glyphs are the ones above, and the geometry is the
in-game version's (phase2-net, recomp `rt/session.cpp`): the dialog's window at 256,256 with a 42 px header band, a
432 px column at x 272 centred on 488; button labels centred as the game centres them, header lines centred on 480,
the 432 x 26 buttons drawn 24 high about their centre (as the game draws its switch). `?header=greeting` swaps the
header for the in-game panel's greeting and drops the idle status, to diff against it. Events on `#stage`:
`discord`, `login` {user, pass}, `create`, `reset`; `window.setStatus(text, mark)` sets the status line.

Against the in-game panel, captured from phase2-net's commit a9a389e2 built for the web (`make web` from a `git
archive`, served by `tools/serve.mjs` with `PUB=<its build-web>`: `/api/de/session` answers signed out, so ONLINE opens
the panel; `tools/capture_signin.py`, then `tools/goldens.py <captures> signin golden-signin`), the whole panel
compared, translucent frame and text included (`node tools/diff.mjs "signin.html?header=greeting" golden-signin
diff-signin`):

| state | panel identical % | within ±2 % | outside text: within ±2 % / max err |
|---|---|---|---|
| idle | 99.71 | 99.74 | 100 / 1 |
| hover-discord | 99.71 | 99.74 | 100 / 1 |
| focus-pass (Username typed) | 99.71 | 99.74 | 100 / 1 |
| typed (`********`, caret) | 99.71 | 99.74 | 100 / 1 |
| press-signin (held) | 99.71 | 99.74 | 100 / 1 |

What is left is the GPU glyph artefact (8 glyphs, 321 px) and ±1 at the two masked frame corners. Every text item sits
where the game puts it. `golden-ingame/` is phase2-net's own native frame (no backdrop read-back): over its buttons and
fields, 99.94 % identical (22 px, the same artefact).
