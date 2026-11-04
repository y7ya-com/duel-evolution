import type { CardGetView, CardView } from '../contracts';

/** The original card-get presentation after a purchase (CCardGetPackScene / CCardGetOpener / CCardGetResultScene):
 * the data/y/result board, a "WON A CARD!" / "WON CARDS!" banner, each card opened face down then turned over in its
 * light frame, NEW!! on cards the collection did not have and SPECIAL CARD! on Super and Ultra Rares, the left/right
 * arrows to look back through the pack and EXIT. Without original art the same layout is drawn with CSS. */
export const CARD_GET_ART = {
  board: 'data/y/result/cardget_base.png', light: 'data/y/result/light.tif.png', left: 'data/y/result/hidari.tif.png', right: 'data/y/result/migi.tif.png',
  exit: 'data/y/result/exit_e.png', one: 'data/card_get/cardget_won_01_c01_j.png', many: 'data/card_get/cardget_won_02_c01_j.png',
  fresh: 'data/card_get/cardget_mark_01_j.png', special: 'data/card_get/cardget_mark_02_j.png',
} as const;
export const RARITY_LABELS: Readonly<Record<string, string>> = { N: 'Common', R: 'Rare', SR: 'Super Rare', UR: 'Ultra Rare' };
interface Progress { revealed: Set<number>; index: number; closed: boolean; }
// Per receipt: re-renders (wallet, chat, presence) keep which cards were turned over.
const progress = new WeakMap<CardGetView, Progress>();
export interface CardGetDeps {
  drawCard(card: CardView, showName: boolean, faceUp: boolean): HTMLElement;
  art: ((path: string, className?: string) => HTMLImageElement) | null;
  reducedMotion: boolean;
  rerender(): void;
}
export const cardGetClosed = (view: CardGetView): boolean => progress.get(view)?.closed ?? false;
export function renderCardGet(view: CardGetView, deps: CardGetDeps): HTMLElement | null {
  if (!view.cards.length) return null;
  let state = progress.get(view); if (!state) { state = { revealed: new Set(), index: 0, closed: false }; progress.set(view, state); }
  if (state.closed) return null;
  const s = state, total = view.cards.length, el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
  const button = (label: string, action: () => void, className = '') => { const b = el('button', className, label); b.type = 'button'; b.onclick = action; return b; };
  const reveal = (i: number) => { s.revealed.add(i); s.index = i; deps.rerender(); };
  const root = el('div', 'de-card-get'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Card Get');
  root.dataset.motion = String(!deps.reducedMotion);
  const board = el('div', 'de-card-get-board'); root.append(board);
  if (deps.art) board.append(deps.art(CARD_GET_ART.board, 'de-card-get-backdrop'));
  const banner = el('h2', 'de-card-get-banner'); banner.setAttribute('aria-label', total === 1 ? 'Won a card!' : 'Won cards!');
  if (deps.art) banner.append(deps.art(total === 1 ? CARD_GET_ART.one : CARD_GET_ART.many)); else banner.textContent = total === 1 ? 'WON A CARD!' : 'WON CARDS!';
  board.append(banner);
  const i = s.index, card = view.cards[i]!, open = s.revealed.has(i), rarity = view.rarities[i] ?? null;
  const stage = el('div', 'de-card-get-stage');
  const left = button('', () => { s.index = Math.max(0, i - 1); deps.rerender(); }, 'de-card-get-arrow'), right = button('', () => { s.index = Math.min(total - 1, i + 1); deps.rerender(); }, 'de-card-get-arrow');
  left.setAttribute('aria-label', 'Previous card'); right.setAttribute('aria-label', 'Next card'); left.disabled = i === 0; right.disabled = i + 1 >= total;
  if (deps.art) { left.append(deps.art(CARD_GET_ART.left)); right.append(deps.art(CARD_GET_ART.right)); } else { left.textContent = '◀'; right.textContent = '▶'; }
  const figure = el('figure', 'de-card-get-card'); figure.dataset.revealed = String(open); figure.dataset.key = `card-get-card:${i}`;
  if (deps.art) figure.append(deps.art(CARD_GET_ART.light, 'de-card-get-light'));
  const face = button('', () => { if (!open) reveal(i); }, 'de-card-get-face'); face.append(deps.drawCard(card, false, open));
  face.setAttribute('aria-label', open ? `${card.name}${rarity ? `, ${RARITY_LABELS[rarity] ?? rarity}` : ''}${view.fresh[i] ? ', new' : ''}` : `Turn over card ${i + 1} of ${total}`);
  figure.append(face);
  if (open && view.fresh[i]) { const mark = el('span', 'de-card-get-mark de-card-get-new'); mark.dataset.key = 'card-get-new'; if (deps.art) mark.append(deps.art(CARD_GET_ART.fresh)); else mark.textContent = 'NEW!!'; mark.setAttribute('aria-label', 'New card'); figure.append(mark); }
  if (open && (rarity === 'SR' || rarity === 'UR')) { const mark = el('span', 'de-card-get-mark de-card-get-special'); if (deps.art) mark.append(deps.art(CARD_GET_ART.special)); else mark.textContent = 'SPECIAL CARD!'; mark.setAttribute('aria-label', 'Special card'); figure.append(mark); }
  stage.append(left, figure, right); board.append(stage);
  const caption = el('div', 'de-card-get-caption'); caption.setAttribute('aria-live', 'polite');
  caption.append(el('strong', '', open ? card.name : 'Click the card to turn it over'), el('span', '', open ? [card.type, rarity ? RARITY_LABELS[rarity] ?? rarity : ''].filter(Boolean).join(' · ') : `Card ${i + 1} of ${total}`));
  board.append(caption);
  const strip = el('div', 'de-card-get-strip');
  view.cards.forEach((c, k) => {
    const shown = s.revealed.has(k), thumb = button('', () => { if (shown) { s.index = k; deps.rerender(); } else reveal(k); }, 'de-card-get-thumb');
    thumb.append(deps.drawCard(c, false, shown)); thumb.dataset.key = `card-get-thumb:${k}`; thumb.setAttribute('aria-pressed', String(k === i));
    thumb.setAttribute('aria-label', shown ? `${c.name}${view.fresh[k] ? ', new' : ''}` : `Card ${k + 1}, face down`); strip.append(thumb);
  });
  board.append(strip);
  const all = s.revealed.size >= total, footer = el('div', 'de-card-get-actions');
  footer.append(el('span', 'de-card-get-count', `${s.revealed.size}/${total} opened · ${view.fresh.filter(Boolean).length} new`));
  if (!all) {
    footer.append(button('Open Next', () => { let k = view.cards.findIndex((_, n) => n >= i && !s.revealed.has(n)); if (k < 0) k = view.cards.findIndex((_, n) => !s.revealed.has(n)); reveal(k); }, 'de-card-get-next'),
      button('Open All', () => { view.cards.forEach((_, n) => s.revealed.add(n)); deps.rerender(); }));
  }
  const exit = button('', () => { s.closed = true; deps.rerender(); }, 'de-card-get-exit'); exit.setAttribute('aria-label', 'Exit');
  if (deps.art) { const sheet = el('span', 'de-card-get-exit-art'); sheet.append(deps.art(CARD_GET_ART.exit)); exit.append(sheet); } else exit.textContent = 'EXIT';
  footer.append(exit); board.append(footer);
  root.onkeydown = e => {
    if (e.key === 'Escape') { e.preventDefault(); exit.click(); }
    else if (e.key === 'ArrowLeft' && !left.disabled) { e.preventDefault(); left.click(); }
    else if (e.key === 'ArrowRight' && !right.disabled) { e.preventDefault(); right.click(); }
    else if ((e.key === 'Enter' || e.key === ' ') && e.target === root) { e.preventDefault(); face.click(); }
  };
  root.tabIndex = -1; queueMicrotask(() => { if (root.isConnected && !root.contains(document.activeElement)) root.focus({ preventScroll: true }); });
  return root;
}

export const CARD_GET_CSS = `
.de-card-get { position:absolute; inset:0; z-index:40; display:flex; align-items:center; justify-content:center; background:rgba(4,8,30,.62); }
.de-card-get-board { position:relative; width:min(800px,96%); aspect-ratio:4/3; max-height:96%; display:grid; grid-template-rows:auto 1fr auto auto auto; justify-items:center; gap:6px; padding:10px 18px 14px; box-sizing:border-box; overflow:hidden;
  background:linear-gradient(90deg,#b897c9 0 27%,#3c3f9c 27% 100%); border:2px solid #9fe7ff; box-shadow:0 0 0 1px #1d3f86,0 14px 40px #000a; color:#fff; }
.de-card-get-backdrop { position:absolute; inset:0; width:100%; height:100%; object-fit:fill; z-index:0; pointer-events:none; }
.de-card-get-board > :not(.de-card-get-backdrop) { position:relative; z-index:1; }
.de-card-get-banner { margin:0; height:clamp(44px,9vw,96px); display:flex; align-items:center; font:900 clamp(24px,5vw,48px)/1 Arial,sans-serif; color:#ffd23a; -webkit-text-stroke:2px #1757c6; letter-spacing:.04em; }
.de-card-get-banner img { height:100%; }
.de-card-get-stage { display:flex; align-items:center; justify-content:center; gap:clamp(8px,3vw,30px); min-height:0; }
.de-client button.de-card-get-arrow { background:none; border:0; box-shadow:none; padding:0; width:clamp(44px,8vw,80px); font-size:28px; color:#7ff; }
.de-card-get-arrow img { width:100%; }
.de-card-get-arrow:disabled { opacity:.25; }
.de-card-get-card { position:relative; margin:0; height:100%; max-height:300px; aspect-ratio:380/500; display:flex; align-items:center; justify-content:center; }
.de-card-get-light { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
.de-card-get-card:not(:has(.de-card-get-light)) { border-radius:14px; box-shadow:0 0 0 6px #22d3e0,0 0 22px 8px #6ff3ff88; background:#fff2; }
.de-client button.de-card-get-face { position:relative; width:84%; height:86%; padding:0; border:0; background:none; box-shadow:none; }
.de-card-get-face > * { width:100%; height:100%; }
.de-card-get[data-motion=true] .de-card-get-card[data-revealed=true] .de-card-get-face { animation:de-card-turn .42s ease-out both; }
@keyframes de-card-turn { 0% { transform:perspective(600px) rotateY(90deg) scale(.92); filter:brightness(3); } 60% { filter:brightness(1.6); } 100% { transform:none; filter:none; } }
.de-card-get-mark { position:absolute; right:-18%; top:-6%; width:44%; pointer-events:none; font:900 18px/1 Arial,sans-serif; color:#fff; text-shadow:0 0 3px #d00,0 0 6px #f80; }
.de-card-get-mark img { width:100%; }
.de-card-get-special { top:auto; bottom:-4%; left:-18%; right:auto; }
.de-card-get[data-motion=true] .de-card-get-mark { animation:de-mark-pop .35s .3s ease-out both; }
@keyframes de-mark-pop { from { transform:scale(.2); opacity:0; } }
.de-card-get-caption { display:flex; flex-direction:column; align-items:center; text-shadow:0 1px 2px #000; min-height:2.6em; }
.de-card-get-caption strong { font-size:clamp(14px,2.2vw,20px); }
.de-card-get-strip { display:flex; gap:4px; max-width:100%; overflow-x:auto; padding:2px; }
.de-client button.de-card-get-thumb { width:38px; height:54px; padding:0; border:2px solid transparent; background:none; box-shadow:none; flex:none; }
.de-client button.de-card-get-thumb[aria-pressed=true] { border-color:#fff99c; }
.de-card-get-thumb > * { width:100%; height:100%; }
.de-card-get-actions { display:flex; align-items:center; gap:10px; }
.de-card-get-count { font-weight:bold; text-shadow:0 1px 2px #000; }
.de-client button.de-card-get-exit { padding:0; width:85px; height:46px; background:none; border:0; box-shadow:none; overflow:hidden; font:700 18px Georgia,serif; color:#fff; }
.de-card-get-exit-art { display:block; width:85px; height:46px; overflow:hidden; }
/* exit_e.png: pressed, plain and lit cells of 85 x 46; the lit one reads on the dark board. */
.de-card-get-exit-art img { display:block; height:46px; margin-left:-170px; }
.de-card-get-exit:hover .de-card-get-exit-art img { filter:brightness(1.25); }
.de-card-get-exit:active .de-card-get-exit-art img { margin-left:0; }
`;
