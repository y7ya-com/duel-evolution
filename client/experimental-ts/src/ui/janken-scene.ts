// Rock-paper-scissors as live's own scene (CJankenScene, before the duel field: livetour 39-janken): no field, no LP
// plates, no bar, no chat. The sky backdrop (data/y/janken jan_bg_01, its scan lines jan_bg_02 and hexagons jan_bg_03,
// stretched over the screen), both duelists' waist-up portraits (the duel's, duel-scene.ts), the opponent's three face-
// down cards cut by the screen's top (152 / 412 / 672, 200 x 290, their feet at y 190) with the thinking bubble on the
// middle one while it chooses, and the player's three janken cards (jan_card_01..03: rock, scissors, paper) at the same
// x from y 578, the one under the pointer framed (card_select_01_c01, 232 x 322). The hands shown, the opponent's card
// turns to its hand. The reveal (live's frames, de-scratch/duelwin/live/jk): the two hands played meet in the middle
// (x 412: the opponent's upright at y 36, the player's at 348), then the winner's alone (y 320), a tie's both go and the
// hands come again. The winner picks who goes first on the two plates of jan_dai_01_? at twice their size, no frame
// (704 x 128 at 160, 224 and 160, 416: "FIRST TO GO" rows 0-1, "SECOND TO GO" rows 2-3, the pointer's look the second
// row), nothing else of the scene's cards up. The cards and plates are real buttons (Rock / Scissors / Paper, Go First /
// Go Second). Positions measured on live's screen; the movie's slides between those steps are not ported.

export interface JankenView {
  phase: 'hand' | 'first' | 'wait';
  /** The hand this side played, once played (0 rock, 1 scissors, 2 paper). */
  mine: number | null;
  /** The opponent's hand once the server showed it. */
  theirs: number | null;
  busy: boolean;
  /** The opponent is choosing (the thinking bubble). */
  thinking: boolean;
  /** A tag partner's or a spectator's line while the captains choose. */
  message?: string;
  /** live's CJankenTimer at the top right (a duel this side asked for): the pink plate, its hourglass turning and a
   * clock that reads 00:00 (live's never counts in this scene). */
  timer?: boolean;
  /** The hands shown (live's reveal): both in the middle, then the winner's alone (null: a tie, none wins). */
  reveal?: { stage: 'both' | 'winner'; mine: number; theirs: number; mineWins: boolean | null };
}
/** Whose hand wins (0 rock, 1 scissors, 2 paper): true the player's, false the opponent's, null a tie. */
export const jankenWinner = (mine: number, theirs: number): boolean | null => mine === theirs ? null : (mine - theirs + 3) % 3 === 2;
export interface JankenActions { hand(hand: 0 | 1 | 2): void; first(first: boolean): void }

const CARD_X = [152, 412, 672] as const, CARD_W = 200, CARD_H = 290, THINK_K = 85 / 80;
const HANDS = ['Rock', 'Scissors', 'Paper'] as const;
const sr = (text: string) => { const t = document.createElement('span'); t.className = 'de-sr'; t.textContent = text; return t; };
const pct = (v: number, of: number) => `${v / of * 100}%`;
const place = (el: HTMLElement, x: number, y: number, w: number, h: number) => Object.assign(el.style, { position: 'absolute', left: pct(x, 1024), top: pct(y, 768), width: pct(w, 1024), height: pct(h, 768) });

export const JANKEN_CSS = `
.de-janken-scene { position:absolute; inset:0; overflow:hidden; background:#36b6f2; z-index:1; }
.de-janken-scene img { position:absolute; display:block; pointer-events:none; user-select:none; }
.de-janken-scene .de-janken-hex { animation:de-janken-hex 7s ease-in-out infinite alternate; }
@keyframes de-janken-hex { to { transform:translateY(-${62 / 830 * 100}%); } }
.de-client .de-janken-scene button { position:absolute; padding:0; margin:0; border:0; border-radius:0; background:none; box-shadow:none; filter:none; min-height:0; cursor:pointer; transform:none; }
.de-client .de-janken-scene button:disabled { cursor:default; opacity:1; filter:none; }
.de-janken-scene button>img { position:absolute; inset:0; width:100%; height:100%; }
.de-janken-scene .de-janken-frame { display:none; }
.de-janken-scene button:hover:not(:disabled)>.de-janken-frame { display:block; }
.de-janken-scene .de-janken-plate { overflow:hidden; }
.de-janken-scene .de-janken-message { position:absolute; left:0; right:0; top:48%; text-align:center; font:bold 18px Arial,sans-serif; color:#fff; text-shadow:0 1px 3px #000; }
.de-janken-scene .de-janken-plate>img.sheet { width:100%; height:400%; inset:auto; left:0; }
.de-janken-scene img.de-janken-think { opacity:0; animation:de-janken-think 1.6s step-end infinite; }
@keyframes de-janken-think { 0% { opacity:.8; } 25% { opacity:0; } }
/* the hourglass turns: its six green frames, then the six red ones (a frame each 250 ms) */
.de-janken-scene .de-janken-glass>img.sheet { animation:de-janken-glass 3s step-end infinite; }
@keyframes de-janken-glass { ${Array.from({ length: 12 }, (_, i) => `${(i / 12 * 100).toFixed(2)}% { left:${-(i % 6) * 100}%; top:${-Math.floor(i / 6) * 100}%; }`).join(' ')} }
@media (prefers-reduced-motion: reduce) { .de-janken-scene img.de-janken-think, .de-janken-scene .de-janken-hex, .de-janken-scene .de-janken-glass>img.sheet { animation:none; } .de-janken-scene img.de-janken-think.f0 { opacity:.8; } }
`;

/** A crop (sx, sy, sw, sh) of a sheet (sheetW x sheetH) at x, y, w, h on the screen. */
function crop(img: (path: string, cls?: string) => HTMLImageElement, path: string, sheetW: number, sheetH: number, sx: number, sy: number, sw: number, sh: number, x: number, y: number, w: number, h: number): HTMLElement {
  const box = document.createElement('div'); box.style.overflow = 'hidden'; place(box, x, y, w, h);
  const i = img(path); Object.assign(i.style, { position: 'absolute', width: `${sheetW / sw * 100}%`, height: `${sheetH / sh * 100}%`, left: `${-sx / sw * 100}%`, top: `${-sy / sh * 100}%`, imageRendering: 'pixelated' });
  box.append(i); return box;
}
/** live's janken timer (CJankenTimer, livetour2 60-pvp-janken, measured with the duel speed key hidden): the pink row of
 * duel_window_02_c01 (144 x 32 at 880, 0), the hourglass (duel_icon_02_c00: six 32 px frames, green row then red) at
 * 882, 0, the gauge track (duel_gauge_02_c00, 3-sliced) at 912, 8, 96 x 16 and "00:00" in the LP digits from 922, 8. */
function jankenTimer(img: (path: string, cls?: string) => HTMLImageElement): HTMLElement {
  const t = document.createElement('div'); t.className = 'de-janken-timer'; t.setAttribute('role', 'timer'); t.setAttribute('aria-label', '00:00');
  t.append(crop(img, 'data/y/duel/field/duel_window_02_c01.png', 144, 64, 0, 32, 144, 32, 880, 0, 144, 32));
  const glass = document.createElement('div'); glass.className = 'de-janken-glass'; place(glass, 882, 0, 32, 32); glass.style.overflow = 'hidden';
  const sheet = img('data/y2/duel_icon_02_c00.png', 'sheet'); Object.assign(sheet.style, { position: 'absolute', left: '0', top: '0', width: '600%', height: '200%', imageRendering: 'pixelated' });
  glass.append(sheet); t.append(glass);
  const TRACK = 'data/y2/duel_gauge_02_c00.png';
  t.append(crop(img, TRACK, 32, 16, 0, 0, 10, 16, 912, 8, 10, 16), crop(img, TRACK, 32, 16, 10, 0, 1, 16, 922, 8, 76, 16), crop(img, TRACK, 32, 16, 22, 0, 10, 16, 998, 8, 10, 16));
  [0, 0, 10, 0, 0].forEach((g, i) => t.append(crop(img, 'data/y/duel/life/duel_font_01_c01.png', 176, 16, g * 16, 0, 16, 16, 922 + 16 * i, 8, 16, 16)));
  return t;
}

/** The scene's elements, drawn anew for each view (`load` gives the archive's pictures). */
/** `art` loads an archive picture into an <img> (the screen's own art cache: index.ts loadArchiveArt). */
export function jankenScene(view: JankenView, act: JankenActions, art: ((path: string, image: HTMLImageElement) => void) | null, portraits: HTMLElement[]): HTMLElement {
  const root = document.createElement('section'); root.className = 'de-janken-scene'; root.setAttribute('aria-label', 'Rock-paper-scissors');
  const img = (path: string, cls = ''): HTMLImageElement => {
    const i = document.createElement('img'); i.alt = ''; i.draggable = false; i.className = cls; i.style.visibility = 'hidden';
    i.onload = () => { i.style.visibility = ''; }; art?.(path, i);
    return i;
  };
  const bg = img('data/y/janken/jan_bg_01.png'); place(bg, 0, 0, 1024, 768);
  // the scan lines and the hexagons drawn as their pictures' own alpha (live: crisp white lines, green at the sheet's top
  // and bottom rows), the hexagons drifting up and down by the sheet's 62 spare rows (live's moves between frames)
  const lines = img('data/y/janken/jan_bg_02.png'); place(lines, 0, 0, 1024, 768);
  const hex = img('data/y/janken/jan_bg_03.png', 'de-janken-hex'); place(hex, 0, 0, 1144, 830);
  root.append(bg, lines, hex, ...portraits);
  if (view.timer) root.append(jankenTimer(img));
  const reveal = view.reveal;
  if (reveal) {
    const card = (hand: number, y: number) => { const c = img(`data/y/janken/jan_card_0${hand + 1}.png`); place(c, 412, y, CARD_W, CARD_H); root.append(c); };
    if (reveal.stage === 'both') { card(reveal.theirs, 36); card(reveal.mine, 348); }
    else if (reveal.mineWins !== null) card(reveal.mineWins ? reveal.mine : reveal.theirs, 320);
    if (view.message) { const m = document.createElement('div'); m.className = 'de-janken-message'; m.setAttribute('role', 'status'); m.textContent = view.message; root.append(m); }
    return root;
  }
  // the opponent's cards: backs, the middle one its hand once shown (none once the hands are decided)
  if (view.phase !== 'first') CARD_X.forEach((x, i) => {
    const shown = i === 1 && view.theirs !== null ? img(`data/y/janken/jan_card_0${view.theirs + 1}.png`) : img('data/card/0000.png');
    place(shown, x, 190 - CARD_H, CARD_W, CARD_H); shown.style.transform = 'rotate(180deg)'; root.append(shown);
  });
  // the thinking bubble (the scene's own deck_treadicon_1_01_0..3, 136 x 150, its circle 80 px): its dots fill in turn,
  // a frame each 400 ms; live's circle is ~85 px across, centred at (506, 182) on the middle card's foot
  if (view.thinking && view.phase !== 'first') for (let f = 0; f < 4; f++) { const t = img(`data/y/janken/deck_treadicon_1_01_${f}_j.png`, `de-janken-think f${f}`); place(t, 506 - 54.5 * THINK_K, 182 - 54.5 * THINK_K, 136 * THINK_K, 150 * THINK_K); t.style.animationDelay = `${f * 0.4}s`; root.append(t); }
  if (view.phase === 'hand' || view.mine !== null && view.phase !== 'first') {
    HANDS.forEach((label, hand) => {
      // once played, live keeps the played card alone, in the middle (x 412), while the other side chooses
      if (view.mine !== null && view.mine !== hand) return;
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', label); b.dataset.key = `janken:${label.toLowerCase()}`;
      b.disabled = view.busy || view.phase !== 'hand' || view.mine !== null;
      if (view.mine === hand) b.className = 'chosen';
      place(b, view.mine === hand ? CARD_X[1] : CARD_X[hand]!, 578, CARD_W, CARD_H);
      const frame = img('data/y/janken/card_select_01_c01.png', 'de-janken-frame'); Object.assign(frame.style, { inset: 'auto', left: '-8%', top: '-5.5%', width: '116%', height: '111%' });
      b.append(img(`data/y/janken/jan_card_0${hand + 1}.png`), frame, sr(label));
      b.onclick = () => { if (!b.disabled) act.hand(hand as 0 | 1 | 2); };
      root.append(b);
    });
  }
  if (view.phase === 'first') {
    ([[true, 'Go First', 0], [false, 'Go Second', 2]] as const).forEach(([first, label, row], i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'de-janken-plate'; b.setAttribute('aria-label', label); b.dataset.key = `janken:${first ? 'first' : 'second'}`;
      b.disabled = view.busy; place(b, 160, 224 + i * 192, 704, 128);
      const sheet = img('data/y/janken/jan_dai_01_e.png', 'sheet'); sheet.style.top = `-${row * 100}%`;
      // the pointer's look: the plate's second row
      b.onpointerenter = () => { if (!b.disabled) sheet.style.top = `-${(row + 1) * 100}%`; }; b.onpointerleave = () => { sheet.style.top = `-${row * 100}%`; };
      b.append(sheet, sr(label)); b.onclick = () => { if (!b.disabled) act.first(first); };
      root.append(b);
    });
  }
  if (view.message) { const m = document.createElement('div'); m.className = 'de-janken-message'; m.setAttribute('role', 'status'); m.textContent = view.message; root.append(m); }
  return root;
}
