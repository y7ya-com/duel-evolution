// Rock-paper-scissors as live's own scene (CJankenScene, before the duel field: livetour 39-janken): no field, no LP
// plates, no bar, no chat. The sky backdrop (data/y/janken jan_bg_01, its scan lines jan_bg_02 and hexagons jan_bg_03,
// stretched over the screen), both duelists' waist-up portraits (the duel's, duel-scene.ts), the opponent's three face-
// down cards cut by the screen's top (152 / 412 / 672, 200 x 290, their feet at y 190) with the thinking bubble on the
// middle one while it chooses, and the player's three janken cards (jan_card_01..03: rock, scissors, paper) at the same
// x from y 578, the one under the pointer framed (card_select_01_c01, 232 x 322). The hands shown, the opponent's card
// turns to its hand. The winner picks who goes first on the two plates of jan_dai_01_? in their frame
// (jan_daiwaku_01_c01, 368 x 80: "FIRST TO GO" rows 0-1, "SECOND TO GO" rows 2-3, 64 high). The cards and plates are
// real buttons (Rock / Scissors / Paper, Go First / Go Second). Positions measured on live's screen; the scene's own
// movie (yo2_janken.txt) is not ported: no deal or reveal animation.

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
}
export interface JankenActions { hand(hand: 0 | 1 | 2): void; first(first: boolean): void }

const CARD_X = [152, 412, 672] as const, CARD_W = 200, CARD_H = 290;
const HANDS = ['Rock', 'Scissors', 'Paper'] as const;
const sr = (text: string) => { const t = document.createElement('span'); t.className = 'de-sr'; t.textContent = text; return t; };
const pct = (v: number, of: number) => `${v / of * 100}%`;
const place = (el: HTMLElement, x: number, y: number, w: number, h: number) => Object.assign(el.style, { position: 'absolute', left: pct(x, 1024), top: pct(y, 768), width: pct(w, 1024), height: pct(h, 768) });

export const JANKEN_CSS = `
.de-janken-scene { position:absolute; inset:0; overflow:hidden; background:#36b6f2; z-index:1; }
.de-janken-scene img { position:absolute; display:block; pointer-events:none; user-select:none; }
.de-janken-scene .de-janken-lines { opacity:.35; mix-blend-mode:multiply; }
.de-janken-scene .de-janken-hex { opacity:.55; mix-blend-mode:screen; }
.de-client .de-janken-scene button { position:absolute; padding:0; margin:0; border:0; border-radius:0; background:none; box-shadow:none; filter:none; min-height:0; cursor:pointer; transform:none; }
.de-janken-scene button:disabled { cursor:default; }
.de-janken-scene button>img { position:absolute; inset:0; width:100%; height:100%; }
.de-janken-scene .de-janken-frame { display:none; }
.de-janken-scene button:hover:not(:disabled)>.de-janken-frame, .de-janken-scene button.chosen>.de-janken-frame { display:block; }
.de-janken-scene .de-janken-plate { overflow:hidden; }
.de-janken-scene .de-janken-message { position:absolute; left:0; right:0; top:48%; text-align:center; font:bold 18px Arial,sans-serif; color:#fff; text-shadow:0 1px 3px #000; }
.de-janken-scene .de-janken-plate>img.sheet { width:100%; height:400%; inset:auto; left:0; }
`;

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
  const lines = img('data/y/janken/jan_bg_02.png', 'de-janken-lines'); place(lines, 0, 0, 1024, 768);
  const hex = img('data/y/janken/jan_bg_03.png', 'de-janken-hex'); place(hex, 0, 0, 1144, 830);
  root.append(bg, lines, hex, ...portraits);
  // the opponent's cards: backs, the middle one its hand once shown
  CARD_X.forEach((x, i) => {
    const shown = i === 1 && view.theirs !== null ? img(`data/y/janken/jan_card_0${view.theirs + 1}.png`) : img('data/card/0000.png');
    place(shown, x, 190 - CARD_H, CARD_W, CARD_H); shown.style.transform = 'rotate(180deg)'; root.append(shown);
  });
  if (view.thinking) { const t = img('data/deck/trade_icon101_0_j.png'); place(t, 462, 152, 92, 92); root.append(t); }
  if (view.phase === 'hand' || view.mine !== null && view.phase !== 'first') {
    HANDS.forEach((label, hand) => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', label); b.dataset.key = `janken:${label.toLowerCase()}`;
      b.disabled = view.busy || view.phase !== 'hand' || view.mine !== null;
      if (view.mine === hand) b.className = 'chosen';
      place(b, CARD_X[hand]!, 578, CARD_W, CARD_H);
      const frame = img('data/y/janken/card_select_01_c01.png', 'de-janken-frame'); Object.assign(frame.style, { inset: 'auto', left: '-8%', top: '-5.5%', width: '116%', height: '111%' });
      b.append(img(`data/y/janken/jan_card_0${hand + 1}.png`), frame, sr(label));
      b.onclick = () => { if (!b.disabled) act.hand(hand as 0 | 1 | 2); };
      root.append(b);
    });
  }
  if (view.phase === 'first') {
    ([[true, 'Go First', 0], [false, 'Go Second', 2]] as const).forEach(([first, label, row], i) => {
      const y = 292 + i * 96, frame = img('data/y/janken/jan_daiwaku_01_c01.png'); place(frame, 328, y - 8, 368, 80); root.append(frame);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'de-janken-plate'; b.setAttribute('aria-label', label); b.dataset.key = `janken:${first ? 'first' : 'second'}`;
      b.disabled = view.busy; place(b, 336, y, 352, 64);
      const sheet = img('data/y/janken/jan_dai_01_e.png', 'sheet'); sheet.style.top = `-${row * 100}%`;
      b.append(sheet, sr(label)); b.onclick = () => { if (!b.disabled) act.first(first); };
      root.append(b);
    });
  }
  if (view.message) { const m = document.createElement('div'); m.className = 'de-janken-message'; m.setAttribute('role', 'status'); m.textContent = view.message; root.append(m); }
  return root;
}
