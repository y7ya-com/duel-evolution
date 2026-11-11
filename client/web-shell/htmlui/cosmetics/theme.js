// The cosmetics screens' shared look (the box shop, cosmetics/boxes*.js; the Wardrobe, cosmetics/wardrobe.js): the
// rarity words and colours, and the rarity frame round an item's art. The rest of the skin is the native shop's own
// sprites (cosmetics/shopart.js). Rarity reads as a card's does: on the art's frame only (ultra a gold foil, super
// purple, rare cyan, common plain silver); the word appears in a detail line, never as a tag on a tile.
// Text is Arial (the owner's rule), regular weight, in the GDI cell sizes the converted windows use.
export const RARITIES = ['common', 'rare', 'super', 'ultra'];
export const RARITY = {
  common: { label: 'Common', short: 'C', color: '#b9c3ca', frame: 'linear-gradient(160deg, #f4f7f8, #c3ccd2 45%, #8d989f)' },
  rare: { label: 'Rare', short: 'R', color: '#2fc6f4', frame: 'linear-gradient(160deg, #c9f7ff, #3fd0ff 40%, #0f8fc4)' },
  super: { label: 'Super Rare', short: 'SR', color: '#a46cf0', frame: 'linear-gradient(160deg, #eedcff, #a46cf0 42%, #5a2aa8)' },
  ultra: { label: 'Ultra Rare', short: 'UR', color: '#e8b42a',
    frame: 'linear-gradient(135deg, #fff7cf 0%, #e2a625 22%, #fff3ad 42%, #b27a0c 60%, #ffe58a 78%, #c98f17 100%)' },
};
export const rarityColor = r => (RARITY[r] || RARITY.common).color;
export const rarityLabel = r => (RARITY[r] || RARITY.common).label;
export const KIND_LABEL = { hair: 'Hair', accessory: 'Accessory', outfit: 'Outfit', dueldisk: 'Duel Disk' };
export const WORLD_LABEL = { 0: 'Domino City', 1: 'Duel Academy' };
export const BODY_LABEL = { male: 'Male', female: 'Female' };
export const mp = n => `${Number(n || 0).toLocaleString('en-US')} MP`;
/** The digit font's form of an amount: "1200MP" (the native shop prints no separators). */
export const mpDigits = n => `${Math.max(0, Math.round(Number(n) || 0))}MP`;

const FONT = `Arial, 'Liberation Sans', Arimo, Helvetica, sans-serif`;
export const THEME_CSS = `
.de-c { font-family: ${FONT}; color: #000; -webkit-font-smoothing: antialiased; box-sizing: border-box; }
.de-c *, .de-c *::before, .de-c *::after { box-sizing: border-box; }
.de-c button { font-family: inherit; }

/* the rarity frame round an item's art: a 1-px dark rim, a 3-px band in the rarity's metal, the art on a light well */
.de-rf { position: absolute; padding: 3px; background: ${RARITY.common.frame}; box-shadow: 0 0 0 1px #1b252c; }
.de-rf[data-rarity=rare] { background: ${RARITY.rare.frame}; }
.de-rf[data-rarity=super] { background: ${RARITY.super.frame}; }
.de-rf[data-rarity=ultra] { background: ${RARITY.ultra.frame}; }
.de-rf > .well { position: relative; width: 100%; height: 100%; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(0,0,0,.35);
  background: radial-gradient(ellipse 75% 70% at 50% 45%, #ffffff, #e4ebef 70%, #cdd7dd); }
.de-rf[data-rarity=ultra] > .well { background: radial-gradient(ellipse 75% 70% at 50% 45%, #fffdf2, #f3ead0 70%, #dccb98); }
/* the foil: a still diagonal sheen over an ultra's art (the reveal sweeps it once) */
.de-rf[data-rarity=ultra] > .well::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(115deg, transparent 25%, rgba(255,246,200,.22) 42%, rgba(255,255,255,.34) 50%, rgba(255,246,200,.22) 58%, transparent 75%); }
.de-rf > .well > .de-art { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); }
/* an item this body can't wear: dimmed, nothing more */
.de-rf[data-dim] > .well > .de-art { opacity: .42; filter: saturate(.4); }

/* loading skeletons and the focus ring every control shares */
.de-skel { background: linear-gradient(100deg, rgba(255,255,255,.25) 30%, rgba(255,255,255,.7) 50%, rgba(255,255,255,.25) 70%) 0 0 / 300% 100%,
  rgba(160,175,185,.35); animation: de-skel 1.3s linear infinite; }
@keyframes de-skel { from { background-position: 100% 0, 0 0; } to { background-position: -50% 0, 0 0; } }
.de-c :focus-visible { outline: 2px solid #ffe600; outline-offset: 1px; }
@media (prefers-reduced-motion: reduce) { .de-skel { animation: none; } }
`;

/** Add THEME_CSS to the document once (idempotent). -> the <style>. Put class `de-c` on the screen's root. */
export function injectTheme(doc = globalThis.document) {
  if (!doc) return null;
  let s = doc.getElementById('de-cosmetics-theme');
  if (!s) { s = doc.createElement('style'); s.id = 'de-cosmetics-theme'; s.textContent = THEME_CSS; doc.head.appendChild(s); }
  return s;
}
