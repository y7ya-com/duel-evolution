// The game cursor as the browser's own (a CSS cursor): native, over everything, at the display rate. Every frame the
// bridge hands over snapshot.cursor (what the engine would draw under g_app's CMouseManager: the hand's CSwfEngine
// sprites) and gets the CSS cursor value for it; the engine's is hidden by that one element in htmlui.c's hide table
// (never by texture). Each state is drawn once into an image at the device's size (stage scale x DPR), as the engine
// draws it: the half-texel shift and bilinear filter, colour x col + add, alpha; then cached by state as an object URL,
// decoded before its first use, so swapping states (the hand's animations, 30 Hz) costs a style change and never
// shows the browser's fallback while an image loads. A state seen for the first time keeps the last cursor up for the
// frame or two it takes to build.
const imgs = new Map();    // file name -> loaded Image (null while loading or failed)
const cache = new Map();   // state + size -> { v: CSS value } once decoded ({} while building)
const name = tex => tex.slice(tex.lastIndexOf('/') + 1).toLowerCase();
const drawn = s => s.shown && s.a > 0;
const MAX = 128;           // Chromium ignores a cursor over 128 x 128 CSS px
// Every state is drawn in ONE box around the mouse point (game px; it holds the hand at -16,-16 64 x 64 and the click
// ripple at its largest, about +-31 around the point): the same size and hotspot for every frame, so nothing can move
// between frames however the browser places a cursor image. A sprite reaching past it is clipped.
const BOX = { x: -32, y: -32, w: 81, h: 81 };
let imageSet;
let gl;
// its raw RGBA, as the engine's texture holds it (a 2D canvas would premultiply it and lose the colour of transparent
// texels, which GL's unpremultiplied bilinear still mixes into the edges): uploaded to WebGL as is and read back
const pixels = img => img.px ||= (() => {
  gl ||= document.createElement('canvas').getContext('webgl');
  const t = gl.createTexture(), fb = gl.createFramebuffer(), data = new Uint8Array(img.width * img.height * 4);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  gl.readPixels(0, 0, img.width, img.height, gl.RGBA, gl.UNSIGNED_BYTE, data);   // rows in image order (no flip)
  gl.deleteFramebuffer(fb); gl.deleteTexture(t);
  return { width: img.width, data };
})();
// One sprite exactly as the engine draws it at 1x (a whole-pixel place, unscaled): the quad covers its w x h pixels and
// samples half a texel up-left (D3D8 pixel centres): each pixel the average of the 2 x 2 texels up-left of it, clamped
// at the edge, per channel on unpremultiplied colour (GL's bilinear on RGBA8); then x col + add (the shader's).
function layer(img, [sx, sy, w, h], col, add) {
  const P = pixels(img), out = new ImageData(w, h), d = P.data, o = out.data;
  const at = (x, y) => 4 * ((sy + Math.max(y, 0)) * P.width + sx + Math.max(x, 0));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = at(x - 1, y - 1), b = at(x, y - 1), c = at(x - 1, y), e = at(x, y), i = 4 * (y * w + x);
    for (let ch = 0; ch < 4; ch++) {
      const v = (d[a + ch] + d[b + ch] + d[c + ch] + d[e + ch]) / 4;
      o[i + ch] = ch < 3 ? v * col[ch] + 255 * add[ch] : v;
    }
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h; c.getContext('2d').putImageData(out, 0, 0);
  return c;
}

// c: snapshot.cursor; base: the art (ui/); scale: canvas CSS px per game px. Returns the CSS cursor ('auto' outside the
// game, where it shows the system one; 'none' when the game draws none), undefined while this state's image is being
// built (keep the current cursor), or null when it cannot be drawn exactly (art loading, a draw mode other than linear
// alpha-blend): the engine keeps drawing it then.
export function cursorCss(c, base, scale, dpr) {
  if (!c) return null;
  for (const s of c.sprites) {   // every state's art loads the first time the manager is seen (all are built up front)
    const n = name(s.tex);
    if (n && !imgs.has(n)) { imgs.set(n, null); const i = new Image(); i.onload = () => imgs.set(n, i); i.src = base + n; }
  }
  if (!c.shown) return 'auto';
  const on = c.sprites.filter(drawn).sort((a, b) => a.wz - b.wz);   // back to front
  if (!on.length) return 'none';
  if (!on.every(s => imgs.get(name(s.tex)) && (s.mode === 2 || s.mode === 6))) return null;
  const at = on.map(s => ({ s, x: s.wx - c.mx, y: s.wy - c.my, w: s.src[2] * s.wsx, h: s.src[3] * s.wsy }));
  const bw = BOX.w, bh = BOX.h;
  const css = Math.min(scale, MAX / bw, MAX / bh);   // CSS px per game px
  // the hotspot (the mouse point) on a whole CSS pixel (a browser floors it): the sprites drawn from that point
  const hx = Math.round(-BOX.x * css), hy = Math.round(-BOX.y * css), x0 = -hx / css, y0 = -hy / css;
  imageSet ??= ['image-set', '-webkit-image-set'].find(f => CSS.supports('cursor', `${f}(url(x.png) 1x) 0 0, auto`)) || '';   // Safari: prefixed
  const k = css * (imageSet ? dpr : 1);              // image px per game px
  const key = JSON.stringify([k, css, at.map(a => [name(a.s.tex), a.x, a.y, a.w, a.h, a.s.src, a.s.a, a.s.col, a.s.add])]);
  let e = cache.get(key);
  if (e) return e.v;
  if (cache.size > 400) { for (const o of cache.values()) if (o.url) URL.revokeObjectURL(o.url); cache.clear(); }   // ponytail: never evicted one by one
  cache.set(key, e = {});
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  cv.width = Math.ceil(bw * k); cv.height = Math.ceil(bh * k);
  for (const a of at) {
    const [sx, sy, sw, sh] = a.s.src, img = imgs.get(name(a.s.tex));
    g.globalAlpha = a.s.a;
    if (k === 1 && a.w === sw && a.h === sh && Number.isInteger(a.x) && Number.isInteger(a.y)) {   // exact: the engine's 1x
      g.drawImage(layer(img, a.s.src, a.s.col, a.s.add), a.x - x0, a.y - y0);
      continue;
    }
    // any other size: the art scaled straight to it (crisp, not the 1x frame upscaled), half a game px down-right as the
    // engine's sampling puts it
    const dx = (a.x - x0 + 0.5) * k, dy = (a.y - y0 + 0.5) * k;
    const tinted = a.s.col.slice(0, 3).some(v => v !== 1) || a.s.add.slice(0, 3).some(v => v !== 0);
    let src = img;
    if (tinted) {   // the white-flash frames: texel x col + add, unpremultiplied, before filtering (the engine's order)
      const t = document.createElement('canvas'), tg = t.getContext('2d');
      t.width = sw; t.height = sh;
      tg.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const d = tg.getImageData(0, 0, sw, sh);
      for (let i = 0; i < d.data.length; i += 4) for (let ch = 0; ch < 3; ch++) d.data[i + ch] = d.data[i + ch] * a.s.col[ch] + 255 * a.s.add[ch];
      tg.putImageData(d, 0, 0);
      src = t;
    }
    g.drawImage(src, tinted ? 0 : sx, tinted ? 0 : sy, sw, sh, dx, dy, a.w * k, a.h * k);
  }
  cv.toBlob(async blob => {
    const url = e.url = URL.createObjectURL(blob), img = new Image();
    img.src = url;
    await img.decode().catch(() => {});
    e.v = `${imageSet ? `${imageSet}(url(${url}) ${dpr}x)` : `url(${url})`} ${hx} ${hy}, auto`;
  }, 'image/png');
  return undefined;
}
