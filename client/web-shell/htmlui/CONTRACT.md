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
  windows: [Window],       // BACK TO FRONT (draw order)
}

Window = {
  id: 0x51a000,            // guest address: stable while the window lives; may be reused after it dies (you get unmount + mount)
  cls: 'CWindowPlayerSelect',   // RTTI class name
  x, y, w, h,              // game pixels, top left (CWindowTaskModel +0x380..+0x38c)
  z,                       // factory order (smaller = in front)
  alpha,                   // 0..1 (fade-ins)
  shown,                   // false while the game hides it (CElement disp_ / a hidden parent)
  modal, topmost, active,  // CWindowTaskModel +0x350, +0x35c, +0x351
  controls: [Control],     // back to front; nested controls (a listbox's scroll bar) are listed too, with parent set
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
| list | Listbox, ActiveListbox, Textlist, Listbox* (card variants), NoBackList, DueldiskRearrengeListbox | `items` [string], `selected` (-1), `marks` [bool] (multi-select), `top` (first item shown), `rows` (rows that fit) |
| scroll | Scroll, ScrollH, ScrollBalloon, DeckScroll, KabanScroll, ResultScroll | `value`, `max`, `page`, `thumb` {pos, len}, `length`, `horizontal` |
| frame | FrameThin, FrameBottomThick, FrameMain, FramePlane, PictureFrame*, BackPlane, BackStripe, ThinChop | `style` (windowFrameTexture), `band` (FrameBottomThick's band height), `rows`/`selected` (BackStripe) |
| icon | Iconbar, IconShow/Hide/Expand/Shrink | `active`, `pressed` |
| menubar | Menubar | `message`, `scroll` (px) |
| image | Image, Image* card variants | `texture` (game path), `src` {u, v, w, h}, `passthrough` (true: the engine keeps drawing it) |

Sprite = `{ tex, x, y, w, h, u, v, sw, sh, shown }`: the texture's game path (e.g. `data/common/window/swich_01_c00.png`;
`api.art(tex)` gives its URL once the atlas is on R2), its element position (window-local for a window's own
sprites), drawn size w x h, and the source rect u, v, sw, sh in the texture.

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
  passthrough: c => c.cls === 'CWaistUpAvatar',        // controls or extras the ENGINE keeps drawing under your DOM
  mount(win, root, api) { return state },              // root: a <div> already placed at win.x/y, sized w x h
  update(win, prev, root, api, state) {},              // every frame the window's snapshot changed (prev: last one)
  unmount(root, state) {},
}
```

A window with no screen module is drawn from its controls by controls/*.js (the generic renderers). A screen module
may call `api.syncWindow(root, win, stateMap)` (the generic path: keyed per control, redrawn only when a control's own
data changes) or `api.renderControl(c, parentEl, opts)` (one control, once; `{ noText: true }` draws an Input
without its text and caret) for the controls it doesn't customise.

**Buttons (owner's rule):** every button is a real `<button>`. Its look is the original art (the sprite frames, one
per state: normal / hover / pressed / disabled / checked), its label real text (a transparent `<span class="rt">`
over the game's glyphs, so it can be selected, found and read out) wherever the game draws the text apart from the
art; text baked into the art stays in the image. Use controls/basic.js's button (or the same pattern) in every
screen. `data-state` on the element carries the state for CSS.

## api (owned mode; also usable in pass mode)

```js
api.click(controlId)            // press + release at the control's centre (WM_LBUTTONDOWN/UP through the factory)
api.hover(controlId)            // move the game mouse over it
api.key(vk, down = true)        // a WM_KEYDOWN/UP to the focused control
api.char(code)                  // a WM_CHAR to the focused control ('\r' submits an Input, '\b', Tab)
api.setText(controlId, string)  // an input's value (commits through the control's setText; IME/paste come from the DOM)
api.scroll(controlId, value)    // a scroll bar's value
api.wheel(controlId, delta)     // WM_MOUSEWHEEL over it
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
