// The game's login widgets in HTML, drawn the way the recompiled client draws them (see README.md):
// - sprites are the game's own PNGs from merge.dat, placed with the logged dst rects; a stretched piece is the same
//   atlas scaled with CSS (bilinear, like the game's LINEAR sampler), so it samples the same neighbouring texels;
// - text is the game's glyph texture rebuilt texel for texel (UpdateTextTexture, FUN_0058d7a0) from the GDI
//   stand-in's glyphs (stb_truetype, DejaVu Sans for "Arial" lfHeight 16, GGO_GRAY8), drawn as 1:1 cells on a canvas.
const A = 'assets/';
export const SHEET = {
  window: { url: A + 'window_base_01_c01.png', w: 96, h: 24 },
  button: { url: A + 'swich_01_c00.png', w: 120, h: 24 },
  check: { url: A + 'check_01_c00.png', w: 32, h: 16 },
  caret: { url: A + 'kasoru_01_c00.png', w: 16, h: 16 },
};
export const WINDOW_ALPHA = 178 / 255;   // the frame's vertex alpha

let G;   // glyph atlas: { ascent, height, glyphs: { code: { adv, x0, y0, w, h, lv[] } } }
export async function loadGlyphs() {
  G = await (await fetch(A + 'glyphs-dejavu16.json')).json();
  const img = u => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u; });
  await Promise.all(Object.values(SHEET).map(async s => {
    const clamp = s.url.replace(A, A + 'clamp/'), [m] = await Promise.all([img(clamp), img(clamp.replace('.png', '.rgb.png'))]);
    const c = new OffscreenCanvas(m.width, m.height).getContext('2d');
    c.drawImage(m, 0, 0);
    s.alpha = c.getImageData(0, 0, m.width, m.height).data.filter((_, i) => i % 4 === 3);   // exact: alpha is stored as is
  }));
}
const glyph = ch => G.glyphs[ch.charCodeAt(0)] || G.glyphs[63];   // '?' for anything the atlas lacks
export const advance = ch => glyph(ch).adv + 1;                     // the game's cell: gmCellIncX + 1
export const measure = s => [...s].reduce((w, ch) => w + advance(ch), 0);

// src rect (sx,sy,sw,sh) of a sheet onto dst rect (x,y,w,h), sampled as the game samples it: the quad covers exactly
// dst, its texture is read half a pixel up-left (D3D8 pixel centres), bilinear, clamped at the atlas's top-left edge.
// So: a box clipped to dst holding the whole atlas (assets/clamp/: the clamp texels written out) at natural size, put
// in place by transform (sub-pixel exact; background-size/-position get pixel-snapped). Where the sampled texels are
// all opaque that is one image draw, alpha folded in: exact. Where some are not, GL filters unpremultiplied (a
// transparent texel's RGB, often white, bleeds into the colour) and Chrome premultiplied, so the atlas is drawn opaque
// (.rgb.png) under a mask of its own alpha: filtered colour x filtered alpha, GL's blend (+-1: the mask is a layer).
export function sprite(parent, sheet, sx, sy, sw, sh, x, y, w, h, alpha = 1) {
  const e = document.createElement('i'), img = document.createElement('b'), kx = w / sw, ky = h / sh;
  const clamp = sheet.url.replace(A, A + 'clamp/'), W = sheet.w + 1;
  e.className = 'sp';
  Object.assign(e.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  Object.assign(img.style, { width: W + 'px', height: sheet.h + 1 + 'px', opacity: alpha === 1 ? '' : alpha });
  e.src = (sx, sy) => {
    let opaque = true;   // texels read: clamp-atlas columns sx..sx+sw, rows sy..sy+sh (one up-left of the src rect)
    for (let ty = sy; ty <= sy + sh; ty++) for (let tx = sx; tx <= sx + sw; tx++) opaque &&= sheet.alpha[ty * W + tx] === 255;
    img.style.backgroundImage = `url(${opaque ? clamp : clamp.replace('.png', '.rgb.png')})`;
    img.style.maskImage = opaque ? '' : `url(${clamp})`;
    img.style.transform = `translate(${0.5 - (sx + 1) * kx}px, ${0.5 - (sy + 1) * ky}px) scale(${kx}, ${ky})`;
  };
  e.src(sx, sy);
  e.append(img);
  parent.append(e);
  return e;
}

// a 3x3 grid of 8x8 tiles at (ox,oy) stretched over x,y,w,h (rows: the tiles' top, middle, bottom)
export function nine(parent, sheet, ox, oy, x, y, w, h, alpha = 1, rows = [[0, 8], [8, h - 16], [16, 8]]) {
  const out = [];
  let ty = y;
  for (const [sy, rh] of rows) {
    out.push(sprite(parent, sheet, ox, oy + sy, 8, 8, x, ty, 8, rh, alpha),
      sprite(parent, sheet, ox + 8, oy + sy, 8, 8, x + 8, ty, w - 16, rh, alpha),
      sprite(parent, sheet, ox + 16, oy + sy, 8, 8, x + w - 8, ty, 8, rh, alpha));
    ty += rh;
  }
  return out;
}

// The game's window (CWindow frame): a header box (tiles at 0,0) over a body (tiles at 24,0), split by a divider row
export function windowFrame(parent, x, y, w, h, headerH) {
  const W = SHEET.window, a = WINDOW_ALPHA, f = document.createElement('div');
  f.className = 'frame';
  parent.append(f);
  nine(f, W, 0, 0, x, y, w, 8 + headerH, a, [[0, 8], [8, headerH]]);
  sprite(f, W, 72, 8, 8, 8, x, y + 8 + headerH, 8, 8, a);
  sprite(f, W, 56, 16, 8, 8, x + 8, y + 8 + headerH, w - 16, 8, a);
  sprite(f, W, 80, 8, 8, 8, x + w - 8, y + 8 + headerH, 8, 8, a);
  nine(f, W, 24, 0, x, y + 16 + headerH, w, h - 16 - headerH, a, [[8, h - 24 - headerH], [16, 8]]);
  return f;
}

// Text: one glyph texture per text object (256x256, rows of 16), cells drawn 1:1 at the screen pen.
// lines: [[string, x, y], ...] sharing one texture, as the game's multi-line text does.
export function text(parent, lines, cls = '') {
  const TW = 256, TH = 256, tex = new Uint8Array(TW * TH), cells = [];
  let pen = 0, row = 0;
  for (const [s, x, y] of lines) {
    let dx = x;
    for (const ch of s) {
      const g = glyph(ch), adv = g.adv + 1;
      if (pen + adv > TW) { row += 16; pen = 0; }
      if (g.w) {   // the whole black box is written (zeros too), flat addressing like the locked texture
        const base = (G.ascent + g.y0 + row) * TW + g.x0 + pen;
        for (let gy = 0; gy < g.h; gy++)
          for (let gx = 0; gx < g.w; gx++) {
            const i = base + gy * TW + gx;
            if (i >= 0 && i < tex.length) tex[i] = Math.floor(g.lv[gy * g.w + gx] * 251 / 64);
          }
      }
      cells.push([pen, row, adv, dx, y]);
      pen += adv; dx += adv;
    }
  }
  const x0 = Math.min(...lines.map(l => l[1])), y0 = Math.min(...lines.map(l => l[2]));
  const x1 = Math.max(x0 + 1, ...cells.map(c => c[3] + c[2])), y1 = Math.max(...lines.map(l => l[2])) + 16;
  const c = document.createElement('canvas');
  c.className = 'tx ' + cls;
  c.width = x1 - x0; c.height = y1 - y0;
  Object.assign(c.style, { left: x0 + 'px', top: y0 + 'px' });
  const img = new ImageData(c.width, c.height);
  for (const [px, py, adv, dx, dy] of cells)
    for (let yy = 0; yy < 16; yy++)
      for (let xx = 0; xx < adv; xx++)
        img.data[((dy - y0 + yy) * c.width + dx - x0 + xx) * 4 + 3] = py + yy < TH ? tex[(py + yy) * TW + px + xx] : 0;
  c.getContext('2d').putImageData(img, 0, 0);   // black (0,0,0,a): premultiplied storage is lossless
  parent.append(c);
  return c;
}

// The game's push button (swich_01_c00: 24x24 9-slice per state; 0 normal, 1 hover, 2 pressed) with a centred label;
// taller than 24, the middle row stretches
export function button(parent, x, y, w, label, onClick, h = 24) {
  const b = document.createElement('div');
  b.className = 'btn';
  Object.assign(b.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  parent.append(b);
  const tiles = nine(b, SHEET.button, 0, 0, 0, 0, w, h);
  text(b, [[label, Math.floor((w - measure(label)) / 2), (h - 16) / 2]]);
  const set = st => tiles.forEach((t, i) => t.src(st * 24 + (i % 3) * 8, Math.floor(i / 3) * 8));
  let over = false, down = false;
  const upd = () => set(down && over ? 2 : over ? 1 : 0);
  b.addEventListener('pointerenter', () => { over = true; upd(); });
  b.addEventListener('pointerleave', () => { over = false; upd(); });
  b.addEventListener('pointerdown', e => { down = true; b.setPointerCapture(e.pointerId); upd(); });
  b.addEventListener('pointerup', e => {
    const hit = document.elementsFromPoint(e.clientX, e.clientY).includes(b);
    down = false; over = hit; upd();
    if (hit && onClick) onClick();
  });
  b.state = set;
  b.press = () => onClick?.();
  return b;
}

export function checkbox(parent, x, y, on = false, onChange) {
  const b = document.createElement('div');
  b.className = 'chk';
  Object.assign(b.style, { left: x + 'px', top: y + 'px', width: '16px', height: '16px' });
  parent.append(b);
  sprite(b, SHEET.check, 0, 0, 16, 16, 0, 0, 16, 16);
  const mark = sprite(b, SHEET.check, 16, 0, 16, 16, 0, 0, 16, 16);
  b.set = v => { b.checked = v; mark.style.visibility = v ? '' : 'hidden'; };
  b.set(on);
  b.addEventListener('click', () => { b.set(!b.checked); onChange?.(b.checked); });
  return b;
}

// The game's input field: frame tile stretched, inner tile 1 px in, black text from x, a 2x16 caret blinking
// 15 frames on / 15 off (the game's 30 fps). Accepts what the game's fields accept: [0-9A-Za-z], 20 characters.
export const BLINK_MS = 500;
export function input(parent, x, y, w, { mask = false, max = 20, value = '' } = {}) {
  const f = document.createElement('div');
  f.className = 'field';
  Object.assign(f.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: '16px' });
  parent.append(f);
  sprite(f, SHEET.window, 80, 16, 8, 8, 0, 0, w, 16);
  sprite(f, SHEET.window, 56, 8, 8, 8, 1, 1, w - 1, 15);
  const layer = document.createElement('div');
  layer.className = 'layer';
  f.append(layer);
  const caret = sprite(f, SHEET.caret, 0, 0, 2, 16, 0, 0, 2, 16);
  const el = document.createElement('input');   // the real input: keyboard, IME off, autofill, a11y; never painted
  Object.assign(el, { maxLength: max, autocomplete: mask ? 'current-password' : 'username', spellcheck: false });
  el.type = mask ? 'password' : 'text';
  el.className = 'native';
  f.append(el);
  f.value = value;
  f.focused = false;
  f.caretOn = true;
  const draw = () => {
    layer.replaceChildren();
    const shown = mask ? '*'.repeat(f.value.length) : f.value, pos = Math.min(el.selectionStart ?? shown.length, shown.length);
    if (shown) text(layer, [[shown, 0, 0]]);
    caret.style.left = measure(shown.slice(0, pos)) + 'px';
    caret.style.visibility = f.focused && f.caretOn ? '' : 'hidden';
  };
  el.addEventListener('input', () => {
    const pos = el.selectionStart, clean = el.value.replace(/[^0-9A-Za-z]/g, '').slice(0, max);
    if (clean !== el.value) { el.value = clean; el.setSelectionRange(Math.min(pos, clean.length), Math.min(pos, clean.length)); }
    f.value = el.value; f.caretOn = true; draw();
  });
  el.addEventListener('keydown', () => requestAnimationFrame(() => { f.caretOn = true; draw(); }));   // arrows, Home, End
  el.addEventListener('focus', () => { f.focused = true; f.caretOn = true; draw(); });
  el.addEventListener('blur', () => { f.focused = false; draw(); });
  f.addEventListener('pointerdown', e => {   // a click puts the caret at the nearest cell boundary, as in the game
    e.preventDefault(); el.focus();
    const shown = mask ? '*'.repeat(f.value.length) : f.value, x = e.clientX - f.getBoundingClientRect().left;
    let i = 0, w = 0;
    while (i < shown.length && w + advance(shown[i]) / 2 < x) w += advance(shown[i++]);
    el.setSelectionRange(i, i); f.caretOn = true; draw();
  });
  f.set = (v, focused, caretOn = true) => { f.value = el.value = v; f.focused = focused; f.caretOn = caretOn; draw(); };
  f.focus = () => el.focus();
  f.native = el;
  f.blink = () => { f.caretOn = !f.caretOn; draw(); };
  draw();
  return f;
}
export function blinkAll(fields) {   // ponytail: one timer for every field, like the game's frame counter
  return setInterval(() => fields.forEach(f => f.focused && f.blink()), BLINK_MS);
}
