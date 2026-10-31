// Card pictures for the modern deck editor: each card's big art (lazyfs.js Module.yo2Lazy.cardArt: merge.dat's
// data/card, or card.dat's 2x art), read in the background a few at a time and kept as blob URLs for the session.
// use:picture={id} on an <img>: its src once the image is near the screen (an IntersectionObserver), so scrolling the
// trunk reads only what is seen. Never a read on the game's frame.
// ponytail: ~100 KB a card through the chunk cache; mini.dat's thumbnails for the grid if the trunk feels slow
const urls = new Map(), loads = new Map(), queue = [];
let active = 0;
const MAX = 6;

let warned = false;
function pump() {
  if (!warned && globalThis.Module?.yo2Lazy && !Module.yo2Lazy.cardArt) {
    warned = true;   // a runtime linked before lazyfs.js had cardArt: the faces stay blank (relink yo2rc.js)
    console.warn('htmlui modern deck: no card pictures, this runtime has no Module.yo2Lazy.cardArt (relink with lazyfs.js from modern-ui)');
  }
  while (active < MAX && queue.length) {
    const [id, done] = queue.shift();
    active++;
    Promise.resolve(globalThis.Module?.yo2Lazy?.cardArt?.(id)).catch(() => null)
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
