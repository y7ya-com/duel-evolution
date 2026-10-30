# htmlui: the snapshot contract (v1)

The bridge (bridge.js, owned by htmlui-bridge) reads the game's window tree out of wasm memory once per frame and hands
each screen module a plain-object **snapshot** of its window. Screen modules (screens/*.js, one owner each) turn
that into DOM. Nothing in a screen module reads wasm memory or calls into the game except through `api`.

Mock snapshots for building without the game: `mock/*.json` (one object per file: a whole `Snapshot`).
- `node client/web-shell/htmlui/serve.mjs` (ART=<dir> if the private art isn't in client/html-ui/assets; run
  infra/fetch-private.sh), then http://127.0.0.1:8941/htmlui/mock.html?s=playerselect renders it through the same
  layer the game uses, your screens/*.js included (`&mode=owned` is not wired yet: mock.html logs api calls).
- `node client/web-shell/htmlui/tools/mockshot.mjs <outdir> [names] [--dpr=2]`: headless screenshots of them.
- `node client/web-shell/htmlui/read_test.mjs`: the reader on a synthetic memory image.

## Snapshot

```js
Snapshot = {
  v: 1,
  frame: 1234,             // Present count
  scene: 7,                // SceneId (src/System/yo2SceneManager.h: 7 player select, 9 change avatar, 10 My Room, 11 lobby, 0x1c duel ...)
  mouse: { x, y, l, r },   // game pixels (1024 x 768), buttons down
  focus: 0x51a2c0 | 0,     // the focused control's id
  windows: [Window],       // the factory's order (back to front, roughly: for overlap use wz)
}

Window = {
  id: 0x51a000,            // guest address: stable while the window lives; may be reused after it dies (you get unmount + mount)
  cls: 'CWindowPlayerSelect',   // RTTI class name
  x, y, w, h,              // game pixels, top left (CWindowTaskModel +0x380..+0x38c)
  z,                       // the window's depth (z_ +0x34c): each window 50 above the one opened before it; larger = in front
  wz,                      // how deep the engine draws it: its frontmost drawn control's world z (larger = in front; 0 = none drawn)
  drawn,                   // where it draws: { x, y, w, h } around its shown, drawn top-level controls, or null (draws nothing)
  alpha,                   // 0..1 (fade-ins)
  shown,                   // false while the game hides it (CElement disp_ / a hidden parent)
  modal, topmost, active,  // CWindowTaskModel +0x350, +0x35c, +0x351
  controls: [Control],     // back to front as the engine draws them (world z, then z_); nested controls (a listbox's scroll bar) are listed too, with parent set
  extras: [{ id, cls }],   // the window's other CTask children (the waist-up avatar, plain sprites): for passthrough();
                           // a CSpriteElm also has its Sprite fields (below)
}

Control = {
  id, cls,
  name,                    // instance name (setInstName; often Japanese, e.g. 'プレイヤ選択ボタン'): a stable key
  parent: 0 | id,          // the control it belongs to, if it is part of another control
  x, y, w, h,              // WINDOW-LOCAL game pixels
  z, alpha, shown, enabled, focused,
  ...per-family fields (below)
}
```

Per-family fields (the bridge fills the family by class; a class it doesn't know yet gets only the base fields plus
`unknown: true`):

| family | classes | fields |
|---|---|---|
| text | Text, ShadowText, TextField, TextItem | `text` (string, '\n' between lines), `align` 0 left 1 centre 2 right, `fontSize`, `lineGap`, `firstLine`, `pageLines`, `color` [r,g,b,a] |
| button | Switch, TextSwitch, ButtonMain, ButtonDuel, PictureSwitch, CardWindow, ResultNext | `label`, `align` (the caption's: 0 left 1 centre 2 right), `state` 'normal' \| 'hover' \| 'pressed' \| 'disabled', `checked`, `focused`; PictureSwitch also `art` {normal, hover, pressed, checked: Sprite \| null} |
| checkbox | Checkbox | `checked` |
| tab | Tab | `label`, `active` |
| input | Input, InputDuel, MultiInput | `value`, `password`, `caret` {col, line}, `caretOn` (blink phase), `maxLen`, `multiLine` |
| list | Listbox, ActiveListbox, Textlist, Listbox* (card variants), NoBackList, DueldiskRearrengeListbox | `items` [string], `selected` (-1), `marks` [bool] (multi-select), `top` (first item shown), `topLine` (first wrapped line shown), `rows` (rows that fit) |
| scroll | Scroll, ScrollH, ScrollBalloon, DeckScroll, KabanScroll, ResultScroll | `value`, `max`, `page`, `thumb` {pos, len}, `length`, `horizontal` |
| frame | FrameThin, FrameBottomThick, FrameMain, FramePlane, PictureFrame*, BackPlane, BackStripe, ThinChop | `style` (windowFrameTexture), `band` (FrameBottomThick's band height), `rows`/`selected` (BackStripe) |
| icon | Iconbar, IconShow/Hide/Expand/Shrink | `active`, `pressed` |
| menubar | Menubar | `message`, `scroll` (px) |
| image | Image, Image* card variants | `texture` (game path), `src` {u, v, w, h}, `passthrough` (true: the engine keeps drawing it) |

Sprite = `{ id, name, tex, src: [u, v, w, h], x, y, z, wx, wy, wz, a, sx, sy, rgba, col, shown }`: the texture's game path as
the game holds it (`data/common/window/swich_01_c00.png`; a `?` is the loader's language letter), the source rect in
it (CElement +0x94), the local position (parent-relative) and the world one (wx, wy: worldPos_, as last drawn), the
scale (a stretched piece: drawn size = src w/h x sx/sy), the colour (rgba: its own; col: the drawn one, its own times
its parents', inheritColor4_ +0x168), the drawn alpha (a: the colour's alpha times
the parents', what the engine blends with), shown. Controls also carry wx, wy, wz (worldPos_). Label = `{ id, name, text, x, y, z, wx,
wy, shown }` (a raw CTextElm; '@n' style tags kept). Swf = `{ id, name, x, y, z, wx, wy, shown }` (a CSwfEngine:
draw it as passthrough). `parts` = `{ sprites: [Sprite], labels: [Label], swfs: [Swf] }`.

`name` is the instance name (CTask +0x4c, setInstName; cp932 decoded), else the control's name_ (+0x354).

Snapshot also has `tasks: [{ id, cls, x, y, z, wx, wy, w, h, alpha, shown, controls, extras, parts? }]`: factory
controls whose owner is not a window (the shop: CShop* tasks), grouped by that owner, shaped like windows. A screen
module whose `classes` lists a task cls claims it like a window: the bridge renders it (root at x, y, w x h) and hides
it from the engine (the hide table takes the task; the element walk reaches it). A task has no rect: return { w, h }
(and x, y if its own are not the box) from a read extension's `tasks: { Cls: t => fields }`. `parts` (with
`parts: true`) are the task's own raw children, stopping at controls and at other tasks.
`shown` (windows, tasks, controls) is false when it or any ancestor has a CTask lock bit (+0x20): the game hides the
shop that way, and a locked subtree is never drawn.

`cursor: { id, shown, mx, my, sprites: [Sprite + { wsx, wsy, col, add, mode }] } | null`: the game's mouse cursor
(g_app's CMouseManager: the hand's CSwfEngine animations, data/common/m_cursor, down to their CSpriteElm leaves;
`shown` per sprite = drawn this frame; mx, my: the mouse in game px). On every screen the bridge turns what the engine
would draw into the browser's own cursor (cursor.js: a CSS cursor on every element, built per state at the device's
size, exact to the engine's at 1x) and hides the engine's by that one element in the hide table. Screens never set a
CSS cursor (html.yo2c * overrides them). Off: htmlui.json "cursor": false, ?HTML_CURSOR=0, yo2Html.cursor(false).

**Read extensions:** `read/<group>.js` (owned by the screen session, like screens/<group>.js; the names are the
SCREENS list in bridge.js) default-exports `h => ({ controls: { Cls: c => fields }, windows: { Cls: w => fields },
tasks: { Cls: t => fields }, snapshot: () => fields })`; `h` holds read.js's helpers (u8 u32 i32 f32 ptr wstr str vec list cls outer shown vis
alpha name at spr label swf textCtl rectF rectI children generic locked; `h.generic(c)` is the base family's fields, to
extend: `CWindowTaskDeckScroll: c => ({ ...h.generic(c), maxLine: h.i32(c + 0x4c8) })`). Its fields are merged over the base ones (a control class
it lists replaces the generic family). Cite every offset to the src/ header that pins it. Tests beside it
(read/<group>_test.mjs, using read_test.mjs's synthetic image style).

More families arrive as screens need them (deck/kaban, trade, duel). Ask htmlui-bridge; until then read what you need
from `unknown` controls by `name` and geometry.

Ids are numbers (guest addresses). Strings are already UTF-16 decoded. Every coordinate is in game pixels; the
bridge scales the whole layer (`--s` CSS variable = canvas CSS px / 1024), so screens lay out at 1x.

## Screen module

```js
// screens/select.js
export default {
  classes: ['CWindowPlayerSelect'],   // the windows it renders
  mode: 'pass',                       // 'pass': pointer-events none, the game takes input (default, pixel-perfect phase)
                                      // 'owned': the DOM takes input and sends it through api
  passthrough: (x, ctl) => x.cls === 'CWaistUpAvatar', // what the ENGINE keeps drawing under your DOM: called with each
                                                       // control, extra and (with parts) each part (and its control)
  parts: false,                       // true: every control gets `parts` (its raw sprite / text / swf children)
  clip: true,                         // false: the window's root doesn't clip to w x h (controls laid out outside it)
  mount(win, root, api) { return state },              // root: a <div> already placed at win.x/y, sized w x h
  update(win, prev, root, api, state) {},              // every frame the window's snapshot changed (prev: last one)
  unmount(root, state) {},
  hide: (win, snap) => [ids],         // optional: other elements the engine must not draw while the window is owned
                                      // (its scene's backdrop pieces, not in any window); hide-table semantics
  backdrop(win, el, api, state) {},   // optional: draw into el, a layer under EVERY window root (a full-screen scene
                                      // backdrop); called each frame, DOM kept; cleared when no owned window has one
}
```

A window with no screen module is drawn from its controls by controls/*.js (the generic renderers). A screen module
may call `api.syncWindow(root, win, stateMap)` (the generic path: keyed per control, redrawn only when a control's own
data changes) or `api.renderControl(c, parentEl, opts)` (one control, once; `{ noText: true }` draws an Input
without its text and caret) for the controls it doesn't customise.

**Text (owner's rule):** all text is real DOM text, never glyph images: Arial, as the 2008 client asks GDI for it
(lfHeight 16 = a 16-pixel cell = 1.117 em: 14.3 px on 16-pixel lines), metric-compatible fallbacks after it. Use
controls/basic.js's `textBox(parent, s, { x, y, w, h, align, px, gap, color, white, wrap })` (or `fontCss(px)` and
`FONT` in your own CSS); the browser lays it out. Letter spacing (owner): textBox gives each text
`spacing(s, px)` (controls/basic.js): (the engine's line width, every glyph in a round(advance) + 1 cell, - Arial's)
/ characters, so lines are as wide as the game's; text you place yourself uses spacing() too, never a fixed value. A CTextElm's colour multiplies black glyphs, so game text is black
(alpha only) unless the glyphs are white (`white: true`). ui.js's glyph `text()` stays for the pixel-exact login
pages only. The flip test's text pixels differ from the engine's by design; the art around them stays exact.

**Skin (owner's rule, 2026-10-30, sharpened: "my problem is pixelated garbage"):** the test is the 2x DPR look. Any
art that looks pixelated or blurry at 2x (tabs, small icons, bevels, bars, button plates, title bars, banners) is
recreated in CSS / SVG with the original's sampled colours, with CSS hover / pressed states, so it is sharp at any DPR
and still looks like 2008. Bitmaps only for real pictures (avatars, card art, photos, logos). A 9-slice stays art only
where it stays crisp at 2x (smooth translucent frames). Text stays Arial DOM text (spaced by `spacing()`). The judgement
is "looks the same, sharper", not pixel-identical. Shared
components, so every screen looks alike: controls/skin.js `menuButton(parent, { x, y, w, h, label, state })` (the
yellow menu button; `.set({ label, state })`), `titleBar(parent, { x, y, w, title, close })` (the blue title bar,
`.close` its close box), `panel(parent, { x, y, w, h, band })` (the blue frame, translucent as the window draws it;
`band` the bottom-thick grey band). `state` is the snapshot's (hover / pressed / disabled: pass mode) or null to
follow the pointer (owned mode). Sample new pieces from the engine's own render (or the atlas texels) and add them to
skin.js with their colours cited; skin.html lays them out for a side-by-side.

**Scrolling (owner's rule, 2026-10-30: "the overflow scrollers are just so broken all across the game"):** every HTML
list or scroll area (chat log, trunk / card lists, file lists, player and NPC lists, mail ...) is a native scroller:
controls/scroll.js `scrollList(parent, { x, y, w, h, rowH, stick })`, a real overflow: auto box with the browser's own
scroll bar (styled by scrollbar-color / -width only): wheel, drag, touch momentum and keys are the browser's. The game's
scroll bar and arrows are not redrawn. `list.set(items, render, key)` keeps rows by key; `stick: true` (logs) keeps the
bottom in view while the player is there. Keep the game in step: a list whose rows the DOM draws in full needs nothing;
a list whose rows the engine still draws (card faces) follows the DOM through `list.onTop = i => ...` and
`wheelTo(api, ctl, i)` (one wheel notch per frame toward that top line); when the game moves its list (a search, a new
line), call `list.top(i)` or `set()` again and the scroll position stays sensible. The box takes the pointer (pointer-events: auto, even
in pass mode), so a row the game must see clicked forwards it (`api.click(ctl.id)` or the screen's own handler).

**Buttons (owner's rule):** every button is a real `<button>`. Its look is the original art (the sprite frames, one
per state: normal / hover / pressed / disabled / checked), its label real text (textBox) wherever the game draws the
text apart from the art; text baked into the art stays in the image. Use controls/basic.js's button (or the same pattern) in every
screen. `data-state` on the element carries the state for CSS.

## api (owned mode; also usable in pass mode)

```js
api.click(controlId)            // move, press, release at the control's centre: real canvas mouse events, 2 frames apart
api.hover(controlId)            // move the game mouse over it
api.key(vk, down = true)        // a WM_KEYDOWN/UP to the focused control
api.char(code)                  // a WM_CHAR to the focused control ('\r' submits an Input, '\b', Tab)
api.setText(controlId, string)  // an input's value (the control's setText at the next Present; IME/paste come from the DOM)
api.scroll(controlId, value)    // a scroll bar's value (not wired yet: use api.wheel)
api.wheel(controlId, delta)     // a wheel event over it (canvas)
// key / char / setText are queued and played at the next Present (in order); click resolves after the release.
// Keys typed into an owned window's DOM never reach the game on their own (the bridge stops them at the window root).
api.text(id)                    // the game's string table entry (for labels the game doesn't show)
api.art(path)                   // URL of a UI atlas on R2 (ui/<file>): never a path in git
```

## Kill switches

`?HTML_UI=0` all off; `?HTML_UI=-CChatWindow,-CWindowModelDeck` those off; `?HTML_UI=CWindowPlayerSelect` only
those on. Defaults: R2 `htmlui.json`. Live: `yo2Html.toggle('CWindowPlayerSelect')`. Off means the engine draws it
again in the same frame.

## Rules

- No Konami art or text dumps in git: atlases and glyphs come from R2 (`api.art`), mocks hold only short UI strings.
- Lay out in game pixels at 1x; the flip test (tools/flip.mjs) diffs your window against the engine's at 1x and 2x.
- One file per screen group, owned by one session. A control you need that isn't in controls/ goes in your screen
  file; htmlui-bridge promotes it.
