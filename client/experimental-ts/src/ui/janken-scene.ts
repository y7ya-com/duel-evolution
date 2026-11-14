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
// Go Second). Positions measured on live's screen.
// The motions are live's too (its 30 fps films, de-scratch/jkn): the scene fades in from black with this side's portrait
// and a deck of backs in the middle; a second later the opponent's portrait comes and the deck deals both rows (each pair 2
// frames after the last, 53 px a frame, then a quarter of what is left). The card under the pointer rises 32 px and
// brightens. A pick gathers this side's three cards under the picked one (24.5 px a frame), the opponent's backs gather
// too, then the two hands meet in the middle (16 frames), the loser goes back where it came from and the winner creeps
// on (8 frames); a tie's two meet, back off, hold and go home, and the hands are dealt again from their two stacks. The
// winner's plates slide in from the sides; the one chosen keeps its lit row, the other fades, the chosen one goes to the
// middle. Each motion is placed by its moment (JankenTimes), so a render in the middle of one picks it up where it is.

export interface JankenView {
  phase: 'hand' | 'first' | 'wait';
  busy: boolean;
  /** The opponent is choosing (the thinking bubble, once the hands are dealt). */
  thinking: boolean;
  /** A tag partner's or a spectator's line while the captains choose. */
  message?: string;
  /** live's CJankenTimer at the top right (a duel this side asked for): the pink plate, its hourglass turning and a
   * clock that reads 00:00 (live's never counts in this scene). */
  timer?: boolean;
  /** The scene's moments (below) and the clock they are read against (Date.now(); Infinity: every motion at its end,
   * reduced motion). */
  times: JankenTimes;
  now: number;
}
/** When each of the scene's motions began (Date.now() ms); the scene is drawn anew on every render, each motion from
 * where its moment says it is by now (live's frames, 30 a second: de-scratch/jkn films). */
export interface JankenTimes {
  /** The scene came up: it fades in from black (8 frames), the opponent's portrait comes a second later. */
  scene: number;
  /** The hands dealt: from the deck in the middle (the first round) or, after a tie, from the two stacks they went back to. */
  deal: { at: number; from: 'deck' | 'stacks' };
  /** This side's pick (raised: the card was up under the pointer as live's is when clicked). */
  pick?: { hand: number; at: number; raised: boolean };
  /** Both hands known. */
  reveal?: { at: number; mine: number; theirs: number };
  /** The winner's plates came (they slide in from the sides). */
  plates?: number;
  /** The plate chosen. */
  choice?: { first: boolean; at: number };
}
/** Whose hand wins (0 rock, 1 scissors, 2 paper): true the player's, false the opponent's, null a tie. */
export const jankenWinner = (mine: number, theirs: number): boolean | null => mine === theirs ? null : (mine - theirs + 3) % 3 === 2;
export interface JankenActions { hand(hand: 0 | 1 | 2, raised: boolean): void; first(first: boolean): void }

const CARD_X = [152, 412, 672] as const, CARD_W = 200, CARD_H = 290, THINK_K = 85 / 80;
const HANDS = ['Rock', 'Scissors', 'Paper'] as const;
// live's places and speeds (game px; a frame 1/30 s), measured on its janken films (de-scratch/jkn):
const F = 1000 / 30, MID = 412, MINE_Y = 578, THEIRS_Y = 190 - CARD_H, DECK: readonly [number, number] = [412, 236];
/** the fade from black as the scene comes; the opponent's portrait; the deal (each pair of cards 2 frames after the last) */
const FADE_MS = 8 * F, OPPONENT_MS = 1000, DEAL_V = 53, DEAL_STAGGER = 2, SPREAD_V = 32;
/** the three cards (and the opponent's backs) slide together at 24.5 px a frame; then 4 frames; then the two hands meet */
const GATHER_V = 24.5, HOLD = 4, APPROACH = 16, OUTCOME = 8, TIE_HOLD = 8, TIE_BACK = 16;
/** the meeting: the player's card up to 382 in 8 frames, to 336 in 8 more; the opponent's (its face) down to -8, 38 */
// (the two edges touch at 336; live's film pick-L: the opponent's card's foot 190, 289 at 8 frames, 336 at 16)
const MINE_MEET = [382, 336] as const, THEIRS_MEET = [0, 46] as const;
/** the winner holds this long before the plates come; the plates slide 126 px in 7 frames (live's eased steps) */
const WINNER_HOLD_MS = 1050, PLATE_IN = [0, 0.056, 0.151, 0.278, 0.429, 0.611, 0.802, 1] as const, PLATE_SLIDE = 126;
/** a plate chosen: the other fades (15 frames), then the chosen one goes to the middle (y 320) at 6 px a frame */
// (live's first-L / second-L: the other plate fades 2474-2970 ms, the chosen one moves 3003-3506; the field came 0.73 s
// after at the soonest)
const CHOICE_FADE = 15, CHOICE_MOVE_MS = CHOICE_FADE * F, CHOICE_MOVE = 16, PLATE_Y = [224, 416] as const, PLATE_MID = 320;
/** The chosen plate stays this long in the middle before the duel's field comes. */
export const JANKEN_CHOSEN_HOLD_MS = 700;

/** The deal begins this long after the scene comes (index.ts sets JankenTimes.deal). */
export const JANKEN_DEAL_MS = 1050;
/** The moments the scene's motions end (absent: not yet known): index.ts holds the scene and wakes its renders on them. */
export interface JankenMoments { dealt: number; approach?: number; met?: number; settled?: number; redeal?: number; plates?: number; chosen?: number; tie?: boolean; mineWins?: boolean | null }
const gatherMs = (hand: number) => Math.abs(CARD_X[hand]! - MID) / GATHER_V * F;
function dealFrames(from: 'deck' | 'stacks'): number {
  let most = 0;
  for (let i = 0; i < 3; i++) for (const y of [MINE_Y, THEIRS_Y]) {
    const start: [number, number] = from === 'deck' ? [DECK[0], DECK[1]] : [MID, y];
    most = Math.max(most, i * DEAL_STAGGER + new Track(0, ...start).glide(CARD_X[i]!, y, from === 'deck' ? DEAL_V : SPREAD_V).frames);
  }
  return most;
}
export function jankenMoments(t: JankenTimes): JankenMoments {
  const m: JankenMoments = { dealt: t.deal.at + dealFrames(t.deal.from) * F };
  if (t.pick && t.reveal) {
    m.approach = Math.max(t.pick.at + gatherMs(t.pick.hand), t.reveal.at + gatherMs(0)) + HOLD * F;
    m.met = m.approach + APPROACH * F;
    m.mineWins = jankenWinner(t.reveal.mine, t.reveal.theirs); m.tie = m.mineWins === null;
    if (m.tie) m.redeal = m.met + (OUTCOME + TIE_HOLD + TIE_BACK) * F;
    else { m.settled = m.met + OUTCOME * F; m.plates = m.settled + WINNER_HOLD_MS; }
  }
  if (t.choice) m.chosen = t.choice.at + CHOICE_MOVE_MS + CHOICE_MOVE * F;
  return m;
}

/** A card's way across the screen: points in time (ms) and place (game px), played as one animation. */
class Track {
  pts: { at: number; x: number; y: number }[];
  constructor(at: number, x: number, y: number) { this.pts = [{ at, x, y }]; }
  get last() { return this.pts[this.pts.length - 1]!; }
  get frames() { return Math.round((this.last.at - this.pts[0]!.at) / F); }
  /** stays put until `at` */
  hold(at: number): this { if (at > this.last.at) this.pts.push({ ...this.last, at }); return this; }
  /** straight there in `frames` frames, at an even speed */
  line(x: number, y: number, frames: number): this { this.pts.push({ at: this.last.at + frames * F, x, y }); return this; }
  /** live's card glide: `v` px a frame along the line while twice that is left, then a quarter of what is left a frame
   * (at least a pixel) */
  glide(x: number, y: number, v: number): this {
    for (let i = 0; i < 120; i++) {
      const p = this.last, dx = x - p.x, dy = y - p.y, rem = Math.hypot(dx, dy); if (rem < 0.5) break;
      const step = rem >= 2 * v ? v : Math.max(1, Math.ceil(rem / 4)), k = Math.min(1, step / rem);
      this.pts.push({ at: p.at + F, x: p.x + dx * k, y: p.y + dy * k });
    }
    return this;
  }
  /** the gather: across at `v` px a frame, and down (a raised card) by quarters */
  gather(x: number, y: number, v: number): this {
    for (let i = 0; i < 120; i++) {
      const p = this.last, dx = x - p.x, dy = y - p.y; if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break;
      const sx = Math.sign(dx) * Math.min(Math.abs(dx), v), sy = Math.abs(dy) < 0.5 ? 0 : Math.sign(dy) * Math.min(Math.abs(dy), Math.max(1, Math.ceil(Math.abs(dy) / 4)));
      this.pts.push({ at: p.at + F, x: p.x + sx, y: p.y + sy });
    }
    return this;
  }
}
const canAnimate = (el: Element): boolean => typeof (el as HTMLElement).animate === 'function';
/** Puts `el` where its track is at `now`, its motion running from there: unseen before the track begins, and (`hide`)
 * once it is done. */
function play(el: HTMLElement, track: Track, now: number, hide = false): void {
  const first = track.pts[0]!, last = track.last;
  Object.assign(el.style, { left: pct(last.x, 1024), top: pct(last.y, 768) });
  if (hide) el.style.visibility = 'hidden';
  if (now >= last.at || !canAnimate(el)) { if (hide && now < last.at) el.style.visibility = ''; return; }
  const dur = Math.max(1, last.at - first.at);
  const a = el.animate(track.pts.map(p => ({ offset: (p.at - first.at) / dur, left: pct(p.x, 1024), top: pct(p.y, 768), visibility: 'visible' })),
    { duration: dur, delay: Math.max(0, first.at - now), fill: 'backwards', easing: 'linear' });
  if (now > first.at) a.currentTime = now - first.at;
  else later(el, first.at, now);
}
/** `el` hidden until `at` */
function later(el: HTMLElement, at: number, now: number): void {
  if (at <= now) return;
  if (!canAnimate(el)) { el.style.visibility = 'hidden'; return; }
  el.animate([{ visibility: 'hidden' }, { visibility: 'hidden' }], { duration: at - now, easing: 'linear' });
}
/** `el`'s opacity from `from` to `to` over `frames` frames from `at` (then held) */
function fade(el: HTMLElement, at: number, frames: number, from: number, to: number, now: number): void {
  el.style.opacity = String(to);
  const end = at + frames * F; if (now >= end || !canAnimate(el)) return;
  const a = el.animate([{ opacity: from }, { opacity: to }], { duration: end - at, delay: Math.max(0, at - now), fill: 'backwards', easing: 'linear' });
  if (now > at) a.currentTime = now - at;
}
const sr = (text: string) => { const t = document.createElement('span'); t.className = 'de-sr'; t.textContent = text; return t; };
const pct = (v: number, of: number) => `${v / of * 100}%`;
const place = (el: HTMLElement, x: number, y: number, w: number, h: number) => Object.assign(el.style, { position: 'absolute', left: pct(x, 1024), top: pct(y, 768), width: pct(w, 1024), height: pct(h, 768) });

// the card under the pointer rises 32 px (a quarter of what is left each frame: live's 8, 14, 19, 23, 26, 28, 29, 30, 31,
// 32 over 10 frames) and brightens; leaving, it settles the same way
const RISE = `linear(0, .25, .44, .59, .72, .81, .875, .906, .94, .97, 1)`;
export const JANKEN_CSS = `
.de-janken-scene { position:absolute; inset:0; overflow:hidden; background:#36b6f2; z-index:1; }
.de-janken-scene img { position:absolute; display:block; pointer-events:none; user-select:none; }
.de-janken-scene .de-janken-hex { animation:de-janken-hex 7s ease-in-out infinite alternate; }
@keyframes de-janken-hex { to { transform:translateY(-${62 / 830 * 100}%); } }
.de-client .de-janken-scene button { position:absolute; padding:0; margin:0; border:0; border-radius:0; background:none; box-shadow:none; filter:none; min-height:0; cursor:pointer; transform:none; }
.de-client .de-janken-scene button:disabled { cursor:default; opacity:1; filter:none; }
.de-janken-scene button>img, .de-janken-scene .de-janken-face>img, .de-janken-scene .de-janken-card>img { position:absolute; inset:0; width:100%; height:100%; }
.de-janken-scene .de-janken-face { position:absolute; inset:0; transition:transform ${10 * F}ms cubic-bezier(.2,.7,.3,1); transition:transform ${10 * F}ms ${RISE}; }
.de-janken-scene button:hover:not(:disabled) .de-janken-face { transform:translateY(-${32 / CARD_H * 100}%); filter:brightness(1.18); }
.de-janken-scene .de-janken-frame { display:none; }
.de-janken-scene button:hover:not(:disabled) .de-janken-frame { display:block; }
.de-janken-scene .de-janken-plate { overflow:hidden; }
.de-janken-scene .de-janken-message { position:absolute; left:0; right:0; top:48%; text-align:center; font:bold 18px Arial,sans-serif; color:#fff; text-shadow:0 1px 3px #000; }
.de-janken-scene .de-janken-plate>img.sheet { width:100%; height:400%; inset:auto; left:0; }
.de-janken-scene .de-janken-black { position:absolute; inset:0; background:#000; pointer-events:none; }
/* the opponent's portrait comes a second after the scene (live's): hidden for what is left of that second */
.de-janken-scene>.de-duel-portrait.side-1 { animation:de-janken-later ${OPPONENT_MS}ms step-end; animation-delay:var(--de-janken-opponent, -${OPPONENT_MS}ms); }
@keyframes de-janken-later { from, to { visibility:hidden; } }
.de-janken-scene img.de-janken-think { opacity:0; animation:de-janken-think 1.6s step-end infinite; }
@keyframes de-janken-think { 0% { opacity:.8; } 25% { opacity:0; } }
/* the hourglass turns: its six green frames, then the six red ones (a frame each 250 ms) */
.de-janken-scene .de-janken-glass>img.sheet { animation:de-janken-glass 3s step-end infinite; }
@keyframes de-janken-glass { ${Array.from({ length: 12 }, (_, i) => `${(i / 12 * 100).toFixed(2)}% { left:${-(i % 6) * 100}%; top:${-Math.floor(i / 6) * 100}%; }`).join(' ')} }
@media (prefers-reduced-motion: reduce) { .de-janken-scene img.de-janken-think, .de-janken-scene .de-janken-hex, .de-janken-scene .de-janken-glass>img.sheet { animation:none; } .de-janken-scene img.de-janken-think.f0 { opacity:.8; } .de-janken-scene .de-janken-face { transition:none; } .de-janken-scene>.de-duel-portrait.side-1 { animation:none; } }
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
  const t = view.times, now = view.now, m = jankenMoments(t);
  // the opponent's portrait comes a second after the scene (the CSS above hides it for what is left of that second)
  root.style.setProperty('--de-janken-opponent', `${-Math.min(OPPONENT_MS, Math.max(0, now - t.scene))}ms`);
  // (a card is a box with its picture in it: the picture's load shows the picture, the box's own visibility is the motion's)
  const card = (path: string, rotate = false) => {
    const c = document.createElement('div'); c.className = 'de-janken-card'; place(c, 0, 0, CARD_W, CARD_H); if (rotate) c.style.transform = 'rotate(180deg)';
    c.append(img(path)); return c;
  };
  const BACK = 'data/card/0000.png', face = (hand: number) => `data/y/janken/jan_card_0${hand + 1}.png`;
  const plates = t.plates !== undefined ? now >= t.plates : !!t.choice;
  const pick = t.pick, reveal = t.reveal;
  // the plates' sheet loaded from the start, so the plates come in the frame the winner's card goes (unseen until then)
  if (!plates) { const pre = img('data/y/janken/jan_dai_01_e.png'); place(pre, 160, 224, 704, 512); pre.style.opacity = '0'; root.append(pre); }

  // the deck in the middle while the first deal takes its cards (the last pair leaves it 4 frames in)
  if (t.deal.from === 'deck' && now < t.deal.at + 2 * DEAL_STAGGER * F) { const d = card(BACK); play(d, new Track(t.scene, ...DECK).hold(t.deal.at + 2 * DEAL_STAGGER * F), now, true); root.append(d); }
  // where each card is dealt from and when (each pair 2 frames after the last)
  const dealt = (i: number, y: number): Track => {
    const at = t.deal.at + i * DEAL_STAGGER * F;
    return t.deal.from === 'deck' ? new Track(at, ...DECK).glide(CARD_X[i]!, y, DEAL_V) : new Track(at, MID, y).glide(CARD_X[i]!, y, SPREAD_V);
  };
  const outcome = (track: Track, mine: boolean): void => {
    if (m.met === undefined) return;
    const home = mine ? MINE_Y : THEIRS_Y, up = mine ? -1 : 1, wins = mine ? m.mineWins : m.mineWins === false;
    track.hold(m.met);
    if (m.tie) { const p = track.last; track.line(p.x, p.y - up * 48, OUTCOME).hold(m.met + (OUTCOME + TIE_HOLD) * F).line(p.x, home, TIE_BACK); }
    else if (wins) { const p = track.last; track.line(p.x, p.y + up * 16, OUTCOME); }
    else track.line(MID, home, OUTCOME);
  };

  // the opponent's cards: backs dealt up to the screen's top; the hands known, they gather to the middle and its face
  // comes down to meet this side's card
  if (!plates) {
    if (!reveal || m.approach === undefined || now < m.approach) CARD_X.forEach((x, i) => {
      const b = card(BACK, true), tr = dealt(i, THEIRS_Y);
      if (reveal) tr.hold(reveal.at).gather(MID, THEIRS_Y, GATHER_V);
      play(b, tr, now);
      root.append(b);
    });
    else if (m.met !== undefined) {
      const f = card(face(reveal.theirs), true), tr = new Track(m.approach, MID, THEIRS_Y).line(MID, THEIRS_MEET[0], APPROACH / 2).line(MID, THEIRS_MEET[1], APPROACH / 2);
      outcome(tr, false); play(f, tr, now, m.mineWins === true || !!m.tie); root.append(f);
    }
    // the thinking bubble (the scene's own deck_treadicon_1_01_0..3, 136 x 150, its circle 80 px): its dots fill in turn,
    // a frame each 400 ms; live's circle is ~85 px across, centred at (506, 182) on the middle card's foot, once dealt
    if (view.thinking && !reveal) for (let f = 0; f < 4; f++) { const th = img(`data/y/janken/deck_treadicon_1_01_${f}_j.png`, `de-janken-think f${f}`); place(th, 506 - 54.5 * THINK_K, 182 - 54.5 * THINK_K, 136 * THINK_K, 150 * THINK_K); th.style.animationDelay = `${f * 0.4}s`; later(th, m.dealt, now); root.append(th); }
  }
  // this side's three cards (buttons: Rock / Scissors / Paper), dealt to the bottom; the one under the pointer rises; the
  // pick gathers all three under the picked one in the middle, which then goes up to meet the opponent's
  const dealing = now < m.dealt;
  if (!plates && (view.phase === 'hand' || pick)) {
    const order = [0, 1, 2].sort((a, b) => (a === pick?.hand ? 1 : 0) - (b === pick?.hand ? 1 : 0));
    for (const hand of order) {
      const label = HANDS[hand]!, picked = pick?.hand === hand;
      if (pick && !picked && now >= pick.at + gatherMs(hand)) continue;
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', label); b.dataset.key = `janken:${label.toLowerCase()}`;
      b.disabled = view.busy || view.phase !== 'hand' || !!pick || dealing;
      if (picked) b.className = 'chosen';
      place(b, CARD_X[hand]!, MINE_Y, CARD_W, CARD_H);
      const tr = dealt(hand, MINE_Y);
      if (pick) {
        // (the picked card was up under the pointer: it settles back as it goes)
        tr.hold(pick.at); if (picked && pick.raised) tr.pts.push({ ...tr.last, at: pick.at + 1, y: tr.last.y - 32 });
        tr.gather(MID, MINE_Y, GATHER_V);
      }
      if (picked && m.approach !== undefined) { tr.hold(m.approach).line(MID, MINE_MEET[0], APPROACH / 2).line(MID, MINE_MEET[1], APPROACH / 2); outcome(tr, true); }
      play(b, tr, now, picked ? m.mineWins === false || !!m.tie : !!pick);
      const inner = document.createElement('span'); inner.className = 'de-janken-face';
      const frame = img('data/y/janken/card_select_01_c01.png', 'de-janken-frame'); Object.assign(frame.style, { inset: 'auto', left: '-8%', top: '-5.5%', width: '116%', height: '111%' });
      inner.append(img(face(hand)), frame); b.append(inner, sr(label));
      b.onclick = () => { if (!b.disabled) act.hand(hand as 0 | 1 | 2, b.matches(':hover')); };
      root.append(b);
    }
  }
  // the winner's plates: FIRST TO GO slides in from the left, SECOND TO GO from the right (7 frames); the one chosen
  // keeps its lit row, the other fades, and the chosen one goes to the middle
  if (plates && (view.phase === 'first' || t.choice)) {
    const at = t.plates ?? now;
    ([[true, 'Go First', 0], [false, 'Go Second', 2]] as const).forEach(([first, label, row], i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'de-janken-plate'; b.setAttribute('aria-label', label); b.dataset.key = `janken:${first ? 'first' : 'second'}`;
      const chosen = t.choice?.first === first && now >= t.choice.at;
      b.disabled = view.busy || !!t.choice || view.phase !== 'first'; place(b, 160, PLATE_Y[i]!, 704, 128);
      const from = 160 + (first ? -PLATE_SLIDE : PLATE_SLIDE), tr = new Track(at, from, PLATE_Y[i]!);
      PLATE_IN.slice(1).forEach(k => tr.line(from + (160 - from) * k, PLATE_Y[i]!, 1));
      if (t.choice?.first === first) tr.hold(t.choice.at + CHOICE_MOVE_MS).line(160, PLATE_MID, CHOICE_MOVE);
      play(b, tr, now);
      if (t.choice && t.choice.first !== first) fade(b, t.choice.at, CHOICE_FADE, 1, 0, now);
      const sheet = img('data/y/janken/jan_dai_01_e.png', 'sheet'); sheet.style.top = `-${(row + (chosen ? 1 : 0)) * 100}%`;
      // the pointer's look: the plate's second row
      b.onpointerenter = () => { if (!b.disabled) sheet.style.top = `-${(row + 1) * 100}%`; }; b.onpointerleave = () => { if (!chosen) sheet.style.top = `-${row * 100}%`; };
      b.append(sheet, sr(label)); b.onclick = () => { if (!b.disabled) act.first(first); };
      root.append(b);
    });
  }
  if (view.message) { const msg = document.createElement('div'); msg.className = 'de-janken-message'; msg.setAttribute('role', 'status'); msg.textContent = view.message; root.append(msg); }
  // the scene comes in from black (8 frames)
  if (now - t.scene < FADE_MS) { const k = document.createElement('div'); k.className = 'de-janken-black'; fade(k, t.scene, FADE_MS / F, 1, 0, now); root.append(k); }
  return root;
}
