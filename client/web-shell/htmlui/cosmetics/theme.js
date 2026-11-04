// The cosmetics screens' shared look (the box shop, cosmetics/boxes*.js; the Wardrobe, cosmetics/wardrobe*.js): the
// rarity colours and labels, and the game-skin pieces as CSS, in the native shop's frame language (CShop* windows:
// shop_win_01_c01 and its side plates). Colours sampled from the engine's own 1x render of the shop's Avatar Parts
// category (window-local, the frame at 280, 3):
//  - title plate (34 high): #24b1ed > #3dc6f3 > #4ccbf3 > #5dcff4 > #6cd0f0 > #72d0ec, a light band #5cffff > #82ffff
//    under it, a #08292f line at the bottom; white caption outlined dark
//  - glass panel: body #a4afb6, a 3-px #d3d6da rim, the dark band over the top #85979f > #627580
//  - paging arrows: #ffb532, a light #ffd779 edge
//  - side plates (the MP plate, Back): #61d3f7 > #46cdf7 > #48dcf5, a #34a9ca split, #2bc0d5 lower half; the pill
//    plates #8eeaf3 > #52dfef > #39e5f6 > #32f3fc (light) and #1a82aa > #92d1e4 > #3cb7dc > #39c5ea > #58e4f9 (dark)
// The primary button is the orange of the game's OK plates (main_btn_01_c01's border, CONTRACT.md skin: #e36f08).
// Text is Arial (the owner's rule): the classes only colour and outline it.
export const RARITIES = ['common', 'rare', 'super', 'ultra'];
export const RARITY = {
  common: { label: 'Common', short: 'C', color: '#c9d3dc', ink: '#56636e', glow: 'rgba(225,235,245,.75)' },
  rare: { label: 'Rare', short: 'R', color: '#3fd0ff', ink: '#06709a', glow: 'rgba(63,208,255,.8)' },
  super: { label: 'Super Rare', short: 'SR', color: '#b98cff', ink: '#6a3fc0', glow: 'rgba(185,140,255,.85)' },
  ultra: { label: 'Ultra Rare', short: 'UR', color: '#ffc23d', ink: '#9a6200', glow: 'rgba(255,194,61,.9)' },
};
export const rarityColor = r => (RARITY[r] || RARITY.common).color;
export const rarityLabel = r => (RARITY[r] || RARITY.common).label;
export const KIND_LABEL = { hair: 'Hair', accessory: 'Accessory', outfit: 'Outfit', dueldisk: 'Duel Disk' };
export const WORLD_LABEL = { 0: 'Domino City', 1: 'Duel Academy' };
export const BODY_SIGN = { male: '♂', female: '♀' };
export const mp = n => `${Number(n || 0).toLocaleString('en-US')} MP`;

const FONT = `Arial, 'Liberation Sans', Arimo, Helvetica, sans-serif`;
const OUT = c => `1px 0 ${c}, -1px 0 ${c}, 0 1px ${c}, 0 -1px ${c}`;
export const THEME_CSS = `
.de-c { --de-common: ${RARITY.common.color}; --de-rare: ${RARITY.rare.color}; --de-super: ${RARITY.super.color};
  --de-ultra: ${RARITY.ultra.color}; --de-ink: #1c2b36; font-family: ${FONT}; color: var(--de-ink);
  -webkit-font-smoothing: antialiased; box-sizing: border-box; }
.de-c *, .de-c *::before, .de-c *::after { box-sizing: border-box; }
.de-c [data-rarity=common] { --rc: var(--de-common); --rk: ${RARITY.common.ink}; --rg: ${RARITY.common.glow}; }
.de-c [data-rarity=rare] { --rc: var(--de-rare); --rk: ${RARITY.rare.ink}; --rg: ${RARITY.rare.glow}; }
.de-c [data-rarity=super] { --rc: var(--de-super); --rk: ${RARITY.super.ink}; --rg: ${RARITY.super.glow}; }
.de-c [data-rarity=ultra] { --rc: var(--de-ultra); --rk: ${RARITY.ultra.ink}; --rg: ${RARITY.ultra.glow}; }

/* the cyan title plate (the shop's category plate) */
.de-title { position: absolute; height: 34px; display: flex; align-items: center; padding: 0 22px 2px; color: #fff;
  font: 900 21px/1 ${FONT}; letter-spacing: .5px; white-space: nowrap;
  text-shadow: ${OUT('#0a2a3a')}, 1px 1px #0a2a3a, 2px 2px 0 rgba(0,40,60,.45);
  background: linear-gradient(to bottom, #24b1ed 0 2px, #3dc6f3 4px, #4ccbf3 8px, #5dcff4 12px, #6cd0f0 16px, #72d0ec 19px,
    #5cffff 21px, #5afeff 25px, #82ffff 30px, #8fffff 32px, #08292f 32px);
  box-shadow: 0 0 0 1px #0b4f6d, inset 0 1px rgba(255,255,255,.7); }

/* the gray glass panel (the frame's body) and a sunk well inside it */
.de-glass { position: absolute; background: linear-gradient(to bottom, #b0bac0, #a4afb6 40%, #9da8b0);
  box-shadow: inset 0 0 0 3px #d3d6da, inset 0 0 0 4px #8a979f; }
.de-well { position: absolute; border-radius: 3px; background: linear-gradient(to bottom, #eef2f4, #dfe5e9);
  box-shadow: inset 0 1px 2px rgba(20,40,55,.35), 0 1px rgba(255,255,255,.65); border: 1px solid #7f8f99; }

/* a cyan side plate (the MP plate, Back) and its button form */
.de-plate { position: absolute; border-radius: 6px; color: #fff; text-shadow: ${OUT('#0b4a66')};
  background: linear-gradient(to bottom, #59b3cf 0, #61d3f7 3px, #46cdf7 18px, #48dcf5 34px, #34a9ca 36px, #6bc1da 38px,
    #56bcd9 50px, #2ba9c6 66px, #1ac0d5 100%);
  box-shadow: 0 0 0 1px #0f3f55, inset 0 1px rgba(255,255,255,.75), inset 0 -2px rgba(0,60,90,.35); }
.de-pill { position: absolute; margin: 0; padding: 0 22px; border: 0; border-radius: 999px; cursor: inherit; color: #fff;
  font: bold 15px/1 ${FONT}; text-shadow: ${OUT('#0b4a66')}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: linear-gradient(to bottom, #8eeaf3, #52dfef 30%, #39e5f6 62%, #32f3fc 85%, #7fe6f2);
  box-shadow: 0 0 0 1px #0f3f55, inset 0 1px #e8ffff, inset 0 -2px rgba(0,80,110,.35), 0 2px 3px rgba(0,0,0,.3);
  transition: filter .12s, transform .12s; }
.de-pill::before, .de-pill::after { content: ''; position: absolute; top: 50%; margin-top: -6px; border: 6px solid transparent; }
.de-pill::before { left: 8px; border-left: 7px solid #e9ffff; border-right: 0; }
.de-pill::after { right: 8px; border-right: 7px solid #e9ffff; border-left: 0; }
.de-pill[data-tone=dark] { background: linear-gradient(to bottom, #1a82aa, #92d1e4 12%, #3cb7dc 40%, #39c5ea 70%, #58e4f9); }
.de-pill:hover:not(:disabled) { filter: brightness(1.12) saturate(1.1); }
.de-pill:active:not(:disabled) { transform: translateY(1px); filter: brightness(.95); }
.de-pill:disabled { filter: grayscale(.85) brightness(.9); opacity: .75; }

/* the orange primary button (the game's OK plate, larger) */
.de-btn { position: absolute; margin: 0; padding: 0 30px; border: 1px solid #b35300; border-radius: 9px; cursor: inherit;
  color: #fff; font: 900 22px/1 ${FONT}; letter-spacing: 1.5px; white-space: nowrap; text-shadow: ${OUT('#7a3200')}, 0 2px 2px rgba(90,30,0,.5);
  background: linear-gradient(to bottom, #fff1b8 0, #ffd166 8%, #ffb12a 45%, #ff9a0a 55%, #f07d00 85%, #ffb03a);
  box-shadow: inset 0 1px #fffbe4, inset 0 -3px rgba(150,60,0,.45), 0 0 0 1px rgba(255,240,200,.5), 0 3px 6px rgba(0,0,0,.35);
  transition: filter .12s, transform .12s, box-shadow .12s; }
.de-btn::before, .de-btn::after { content: ''; position: absolute; top: 50%; margin-top: -7px; border: 7px solid transparent; }
.de-btn::before { left: 11px; border-left: 8px solid #fff8dc; border-right: 0; }
.de-btn::after { right: 11px; border-right: 8px solid #fff8dc; border-left: 0; }
.de-btn:hover:not(:disabled) { filter: brightness(1.08) saturate(1.1);
  box-shadow: inset 0 1px #fffbe4, inset 0 -3px rgba(150,60,0,.45), 0 0 0 1px rgba(255,240,200,.8), 0 0 14px rgba(255,190,60,.75), 0 3px 6px rgba(0,0,0,.35); }
.de-btn:active:not(:disabled) { transform: translateY(1px); filter: brightness(.94); }
.de-btn:disabled { color: #f3f3f3; text-shadow: ${OUT('#5c5c5c')}; border-color: #707070; filter: none;
  background: linear-gradient(to bottom, #f0f0f0, #c9c9c9 45%, #b4b4b4 55%, #a4a4a4 85%, #bdbdbd); }

/* the orange paging arrows (the shop's prev / next) */
.de-arrow { position: absolute; width: 30px; height: 60px; margin: 0; padding: 0; border: 0; background: none; cursor: inherit;
  filter: drop-shadow(0 0 1.5px #ffd779) drop-shadow(0 1px 1px rgba(0,0,0,.35)); transition: transform .12s, filter .12s; }
.de-arrow::before { content: ''; position: absolute; inset: 0; background: linear-gradient(to bottom, #ffd16a, #ffb532 45%, #f39a14);
  clip-path: polygon(100% 0, 0 50%, 100% 100%, 86% 50%); }
.de-arrow[data-dir=next]::before { clip-path: polygon(0 0, 100% 50%, 0 100%, 14% 50%); }
.de-arrow:hover:not(:disabled) { filter: drop-shadow(0 0 4px #ffe39a) drop-shadow(0 1px 1px rgba(0,0,0,.35)) brightness(1.1); }
.de-arrow[data-dir=prev]:active:not(:disabled) { transform: translateX(-2px); }
.de-arrow[data-dir=next]:active:not(:disabled) { transform: translateX(2px); }
.de-arrow:disabled { opacity: .35; filter: grayscale(1); }

/* a rarity chip ("ULTRA RARE") and the gender badges */
.de-chip { display: inline-flex; align-items: center; height: 16px; padding: 0 6px; border-radius: 8px; font: bold 10px/1 ${FONT};
  letter-spacing: .6px; text-transform: uppercase; white-space: nowrap; color: #fff; background: var(--rk, #56636e);
  box-shadow: inset 0 0 0 1px var(--rc, #c9d3dc); }
.de-chip[data-rarity=common] { color: #2c3740; background: #dfe5ea; box-shadow: inset 0 0 0 1px #9aa6b0; }
.de-chip[data-rarity=ultra] { color: #4a2c00; background: linear-gradient(#ffe7a0, #ffc23d); box-shadow: inset 0 0 0 1px #b07a10; }
.de-sex { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; padding: 0 3px;
  border-radius: 3px; font: bold 12px/1 ${FONT}; color: #fff; }
.de-sex[data-body=male] { background: #2f7fd6; }
.de-sex[data-body=female] { background: #e0569a; }
.de-sex[data-off] { background: #b8c0c6; color: #eef1f3; }

/* loading skeletons and the focus ring every control shares */
.de-skel { background: linear-gradient(100deg, rgba(255,255,255,.25) 30%, rgba(255,255,255,.7) 50%, rgba(255,255,255,.25) 70%) 0 0 / 300% 100%,
  rgba(160,175,185,.35); animation: de-skel 1.3s linear infinite; border-radius: 3px; }
@keyframes de-skel { from { background-position: 100% 0, 0 0; } to { background-position: -50% 0, 0 0; } }
.de-c :focus-visible { outline: 2px solid #fff; outline-offset: 2px; box-shadow: 0 0 0 4px #1593d6; }
.de-msg { position: absolute; display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 4px; font: bold 13px/1.3 ${FONT};
  color: #5a1200; background: linear-gradient(#fff4e6, #ffe0c2); border: 1px solid #e36f08; box-shadow: 0 2px 6px rgba(0,0,0,.3); }
.de-msg::before { content: '!'; flex: none; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center;
  color: #fff; background: #e36f08; font: 900 13px/1 ${FONT}; }
@media (prefers-reduced-motion: reduce) { .de-skel { animation: none; } .de-btn, .de-pill, .de-arrow { transition: none; } }
`;

/** Add THEME_CSS to the document once (idempotent). -> the <style>. Put class `de-c` on the screen's root. */
export function injectTheme(doc = globalThis.document) {
  if (!doc) return null;
  let s = doc.getElementById('de-cosmetics-theme');
  if (!s) { s = doc.createElement('style'); s.id = 'de-cosmetics-theme'; s.textContent = THEME_CSS; doc.head.appendChild(s); }
  return s;
}
