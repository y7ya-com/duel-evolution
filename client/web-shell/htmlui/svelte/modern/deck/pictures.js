// Card pictures for the modern deck editor: each card's big art (lazyfs.js Module.yo2Lazy.cardArt: merge.dat's
// data/card, or card.dat's 2x art; with an older runtime merge.dat's data/card read here), read in the background a
// few at a time and kept as blob URLs for the session.
// use:picture={id} on an <img>: its src once the image is near the screen (an IntersectionObserver), so scrolling the
// trunk reads only what is seen. Never a read on the game's frame.
// ponytail: ~100 KB a card through the chunk cache; mini.dat's thumbnails for the grid if the trunk feels slow
const urls = new Map(), loads = new Map(), queue = [];
let active = 0;
const MAX = 6;

// A runtime linked before lazyfs.js had cardArt: merge.dat's data/card read here, as lazyfs reads it (an HTTP range
// of the archive at yo2Lazy.files' version; files2: name -> [from, to, unpacked size], LZSS when packed), its
// list_card.txt naming each YO2 id's picture
function lzss(src, size) {   // lazyfs.js's: Okumura's LZSS, 4 KB ring from 0xFEE, flags LSB first (1 = byte)
  const ring = new Uint8Array(4096), out = new Uint8Array(size);
  let r = 0xfee, i = 0, o = 0;
  while (i < src.length && o < size) {
    const flags = src[i++];
    for (let bit = 0; bit < 8 && i < src.length && o < size; bit++)
      if (flags & (1 << bit)) { const c = src[i++]; out[o++] = c; ring[r] = c; r = (r + 1) & 0xfff; }
      else {
        const b1 = src[i++], b2 = src[i++], off = b1 | ((b2 & 0xf0) << 4), len = (b2 & 0x0f) + 3;
        for (let k = 0; k < len && o < size; k++) { const c = ring[(off + k) & 0xfff]; out[o++] = c; ring[r] = c; r = (r + 1) & 0xfff; }
      }
  }
  return out;
}
async function mergeEntry(name) {
  const L = globalThis.Module?.yo2Lazy, e = L?.files2?.get(name), url = L && [...L.files.keys()].find(u => /(^|\/)merge\.dat$/i.test(u));
  if (!e || !url) return null;
  const r = await fetch(url + (L.files.get(url).ver || ''), { headers: { Range: `bytes=${e[0]}-${e[1] - 1}` } });
  if (r.status !== 206) { r.body?.cancel(); return null; }   // never the whole archive
  const b = new Uint8Array(await r.arrayBuffer());
  return e[2] === undefined || b.length === e[2] ? b : lzss(b, e[2]);
}
let names = null;
async function mergeArt(id) {
  names ||= mergeEntry('data/card/list_card.txt').then(b => b && new TextDecoder('latin1').decode(b).split(/\r?\n/).map(x => x.trim().toLowerCase()));
  const n = (await names)?.[id];
  if (!(await names)) names = null;   // not read (the directory not in yet): asked again next time
  return n ? mergeEntry('data/card/' + n) : null;
}
const read = id => { const L = globalThis.Module?.yo2Lazy; return L?.cardArt ? L.cardArt(id) : mergeArt(id); };

function pump() {
  while (active < MAX && queue.length) {
    const [id, done] = queue.shift();
    active++;
    Promise.resolve().then(() => read(id)).catch(() => null)
      .then(b => { const u = b ? URL.createObjectURL(new Blob([b], { type: b[1] === 0x50 ? 'image/png' : 'image/jpeg' })) : null; if (u) urls.set(id, u); done(u); })
      .finally(() => { active--; pump(); });
  }
}
// the URL of card id's art (null: none), first ones asked first
export function art(id) {
  if (urls.has(id)) return Promise.resolve(urls.get(id));
  if (!loads.has(id)) loads.set(id, new Promise(done => { queue.push([id, done]); pump(); }).then(u => { if (!u) loads.delete(id); return u; }));
  return loads.get(id);
}
export const cached = id => urls.get(id) || null;

let io = null;
const seen = new WeakMap();
export function picture(img, id) {
  const show = () => {
    const u = cached(id);
    if (u) { img.src = u; return; }
    io ||= new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); seen.get(e.target)?.(); } }), { rootMargin: '240px' });
    seen.set(img, () => art(id).then(u => { if (u && seen.get(img)?.id === id) img.src = u; }));
    seen.get(img).id = id;
    img.removeAttribute('src');
    io.observe(img);
  };
  show();
  return { update(n) { if (n !== id) { id = n; show(); } }, destroy() { io?.unobserve(img); seen.delete(img); } };
}
