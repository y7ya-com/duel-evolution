/** The duel's life point plates (CDuelScene, FUN_00791c50 / FUN_007dec10 / FUN_007da4d0 in yo2.exe): the player's at
 * the top left, the opponent's mirrored at the top right. Art:
 * - data/y2/duel_window_01_c01.png: the plates, 288×64 each, row 0 the player's (blue), row 1 the opponent's (pink);
 * - data/y2/duel_font_02_c01.png: the 'LP' (x 0..32) and 'TIME' (x 32..64) labels;
 * - data/y2/duel_gauge_02_c0{0,1}.png: the empty track, 32×16 (c00 the player's, c01 the opponent's, mirrored);
 * - data/y2/duel_gauge_01_c0{0,1}.png: the fill, 4 colour bands of 16 rows (green, orange, yellow, red);
 * - data/y/duel/life/duel_font_01_c01.png: the LP digits, 11 glyphs of 16×16 (0..9, ':'); duel/life/lifepoint.txt
 *   puts the number's top right at y 24, x 172 (1P) / 908 (2P).
 * Gauge spots are measured from the live game. Everything is in % of the 1024×768 board. */

const BOARD_W = 1024, BOARD_H = 768, PLATE_W = 288, PLATE_H = 64, FULL_LP = 8000;
const PLATE = 'data/y2/duel_window_01_c01.png', LABELS = 'data/y2/duel_font_02_c01.png';
const DIGITS = 'data/y/duel/life/duel_font_01_c01.png';
const track = (side: 0 | 1) => `data/y2/duel_gauge_02_c0${side}.png`;
const fill = (side: 0 | 1) => `data/y2/duel_gauge_01_c0${side}.png`;

/** Player-side spots in plate px; the opponent's are mirrored (x → 288 - x - w). */
const LP_BAR = { x: 40, y: 24, w: 218 }, TIME_BAR = { x: 40, y: 40, w: 202 };
const LP_LABEL = { x: 7, y: 24 }, TIME_LABEL = { x: 8, y: 40 }, DIGITS_RIGHT = 172, DIGITS_TOP = 24, DIGIT = 16;
/** 3-slice columns [left cap end, middle end] of the 32 px wide sheets; the middle column stretches. */
const TRACK_COLS = [[10, 11], [21, 22]] as const, FILL_COLS = [[4, 5], [27, 28]] as const;
/** The fill's half of duel_gauge_01: c00 draws it in x 0..16, c01 in x 16..32. */
const FILL_X = [0, 16] as const;

const pct = (v: number, of: number) => `${v / of * 100}%`;
type Image = (path: string, className?: string) => HTMLImageElement | null;

/** The colour band of duel_gauge_01 for a fraction left (0 green, 2 yellow, 3 red; the thresholds are a guess). */
export function gaugeBand(fraction: number): 0 | 2 | 3 { return fraction > 0.5 ? 0 : fraction > 0.25 ? 2 : 3; }
/** LP as drawn: whole, never negative, at most 99999. */
export function lpDigits(lp: number): string { return String(Math.min(99999, Math.max(0, Math.trunc(lp) || 0))); }
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A crop of a sheet: an overflow:hidden box holding the whole sheet, offset and scaled so (sx, sy, sw, sh) fills it.
 * The box stretches freely, so a 1 px column can be widened. */
function crop(image: Image, path: string, sheetW: number, sheetH: number, sx: number, sy: number, sw: number, sh: number): HTMLElement {
  const box = document.createElement('div'); box.className = 'de-lpp-crop';
  const img = image(path, 'de-lpp-sheet');
  if (img) {
    img.style.width = pct(sheetW, sw); img.style.height = pct(sheetH, sh);
    img.style.left = pct(-sx, sw); img.style.top = pct(-sy, sh); box.append(img);
  }
  return box;
}

/** A gauge drawn left cap / stretched middle column / right cap from a 32×16 cell at (cellX, cellY) of its sheet. */
class SlicedBar {
  readonly root = document.createElement('div');
  private parts: HTMLElement[] = [];
  private cuts: readonly [number, number, number, number];
  constructor(image: Image, path: string, sheetH: number, cellX: number, cols: readonly [number, number], cellW = 32) {
    this.root.className = 'de-lpp-bar';
    this.cuts = [cellX, cellX + cols[0], cellX + cols[1], cellX + cellW];
    this.setBand(image, path, sheetH, 0);
  }
  /** Rebuilds the slices from band row `band` (16 px rows). */
  setBand(image: Image, path: string, sheetH: number, band: number): void {
    const [a, b, c, d] = this.cuts;
    this.parts = [[a, b], [b, c], [c, d]].map(([from, to]) => crop(image, path, 32, sheetH, from, band * 16, to - from, 16));
    this.root.replaceChildren(...this.parts); this.layout();
  }
  /** Lays the caps at their own width; a bar narrower than both caps squeezes them. */
  layout(): void {
    const [a, b, c, d] = this.cuts, left = b - a, right = d - c, caps = left + right;
    // The bar's width in game px is kept on the element (data-px), so no layout read is needed.
    const px = Number(this.root.dataset.px) || caps, scale = Math.min(1, px / caps);
    const l = left * scale, r = right * scale, mid = Math.max(0, px - l - r);
    const place = (el: HTMLElement | undefined, x: number, w: number) => { if (el) { el.style.left = pct(x, px); el.style.width = pct(w, px); } };
    // the stretched middle overlaps both caps by half a game pixel, so no seam shows between the slices at any scale
    place(this.parts[0], 0, l); place(this.parts[1], Math.max(0, l - 0.5), Math.min(px, mid + 1)); place(this.parts[2], l + mid, r);
  }
}

export const LP_PLATE_CSS = `
.de-lpp{position:absolute;top:0;width:${pct(PLATE_W, BOARD_W)};height:${pct(PLATE_H, BOARD_H)};container-type:inline-size;pointer-events:none;user-select:none}
.de-lpp[data-side="0"]{left:0}.de-lpp[data-side="1"]{right:0}
.de-lpp-plate,.de-lpp-crop,.de-lpp-bar,.de-lpp-digits,.de-lpp-name{position:absolute}
.de-lpp-plate{inset:0;opacity:.6}
.de-lpp-crop{overflow:hidden;top:0;height:100%}
.de-lpp-plate.de-lpp-crop{height:100%}
.de-lpp-sheet{position:absolute;max-width:none;image-rendering:pixelated}
.de-lpp-label,.de-lpp-gauge{position:absolute;height:${pct(16, PLATE_H)}}
.de-lpp-label{width:${pct(32, PLATE_W)}}
.de-lpp-bar{inset:0}
.de-lpp-name{top:${pct(2, PLATE_H)};width:${pct(270, PLATE_W)};height:${pct(18, PLATE_H)};font:calc(14 / ${PLATE_W} * 100cqw)/1.25 Verdana,Tahoma,sans-serif;color:#eef2f5;text-shadow:0 0 1px #3a4a58,1px 1px 0 #3a4a58;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.de-lpp[data-side="0"] .de-lpp-name{left:${pct(8, PLATE_W)}}
.de-lpp[data-side="1"] .de-lpp-name{right:${pct(8, PLATE_W)};text-align:right}
.de-lpp-digits{top:${pct(DIGITS_TOP, PLATE_H)};right:${pct(PLATE_W - DIGITS_RIGHT, PLATE_W)};height:${pct(DIGIT, PLATE_H)};display:flex;justify-content:flex-end}
.de-lpp-digit{position:relative;overflow:hidden;width:calc(${DIGIT} / ${PLATE_W} * 100cqw);height:100%}
.de-lpp-digits.is-text{font:700 calc(12 / ${PLATE_W} * 100cqw)/1.35 Verdana,sans-serif;color:#fff;-webkit-text-stroke:.12em #222;paint-order:stroke}
.de-lpp-fallback{position:absolute;inset:${pct(3, 16)} 0;border-radius:6px;background:linear-gradient(#bfffc4,#2ed23a)}
.de-lpp-track-fallback{position:absolute;inset:${pct(1, 16)} 0;border-radius:6px;background:#555;box-shadow:0 0 0 1px #fff}
`;

export interface LpPlate { root: HTMLElement; setLp(lp: number): void; setTime(fraction: number | null): void }

/** One side's plate. `image` makes an <img> of an archive file (null: no original art, a plain fallback is drawn). */
export function lpPlate(opts: { side: 0 | 1; name: string; lp: number; time: number | null; image: Image | null }): LpPlate {
  const { side, name } = opts, image = opts.image;
  const root = document.createElement('div'); root.className = 'de-lpp'; root.dataset.side = String(side); root.setAttribute('role', 'group');
  const mirror = (x: number, w: number) => side ? PLATE_W - x - w : x;
  const at = (el: HTMLElement, x: number, y: number, w: number) => { el.style.left = pct(mirror(x, w), PLATE_W); el.style.top = pct(y, PLATE_H); el.style.width = pct(w, PLATE_W); };

  const visual = document.createElement('div'); visual.setAttribute('aria-hidden', 'true');
  if (image) { const plate = crop(image, PLATE, PLATE_W, 128, 0, side * PLATE_H, PLATE_W, PLATE_H); plate.className += ' de-lpp-plate'; visual.append(plate); }
  const nameEl = document.createElement('div'); nameEl.className = 'de-lpp-name'; nameEl.textContent = name; visual.append(nameEl);

  // 'LP' and 'TIME' are not mirrored, only placed.
  for (const [spot, sx] of [[LP_LABEL, 0], [TIME_LABEL, 32]] as const) {
    if (!image) break;
    const label = crop(image, LABELS, 64, 16, sx, 0, 32, 16); label.className += ' de-lpp-label'; at(label, spot.x, spot.y, 32); label.style.height = pct(16, PLATE_H); visual.append(label);
  }

  /** A gauge: the track, and a fill anchored at the plate's outer edge whose width follows the fraction. */
  const gauge = (spot: { x: number; y: number; w: number }) => {
    const box = document.createElement('div'); box.className = 'de-lpp-gauge'; at(box, spot.x, spot.y, spot.w); visual.append(box);
    const fillBox = document.createElement('div'); fillBox.className = 'de-lpp-gauge'; fillBox.style.top = '0'; fillBox.style.height = '100%';
    let trackBar: SlicedBar | null = null, fillBar: SlicedBar | null = null, band = -1;
    if (image) {
      trackBar = new SlicedBar(image, track(side), 16, 0, TRACK_COLS[side]); trackBar.root.dataset.px = String(spot.w); trackBar.layout();
      box.append(trackBar.root);
      fillBar = new SlicedBar(image, fill(side), 64, FILL_X[side], [FILL_COLS[side][0] - FILL_X[side], FILL_COLS[side][1] - FILL_X[side]], 16);
      fillBox.append(fillBar.root);
    } else {
      const t = document.createElement('div'); t.className = 'de-lpp-track-fallback'; box.append(t);
      const f = document.createElement('div'); f.className = 'de-lpp-fallback'; fillBox.append(f);
    }
    box.append(fillBox);
    return (fraction: number | null) => {
      const f = fraction === null ? 0 : clamp01(fraction), px = Math.round(f * spot.w);   // full: the fill's slanted end on the track's (live)
      fillBox.hidden = px <= 0;
      fillBox.style.width = pct(px, spot.w); fillBox.style.left = side ? pct(spot.w - px, spot.w) : '0';
      if (fillBar && image) {
        fillBar.root.dataset.px = String(px);
        const next = gaugeBand(f); if (next !== band) { band = next; fillBar.setBand(image, fill(side), 64, band); } else fillBar.layout();
      }
    };
  };
  const setLpBar = gauge(LP_BAR), setTimeBar = gauge(TIME_BAR);

  const digits = document.createElement('div'); digits.className = 'de-lpp-digits';
  const drawDigits = (lp: number) => {
    const text = lpDigits(lp);
    if (!image) { digits.className = 'de-lpp-digits is-text'; digits.textContent = text; return; }
    digits.replaceChildren(...[...text].map(ch => { const d = crop(image, DIGITS, 176, 16, Number(ch) * DIGIT, 0, DIGIT, 16); d.className = 'de-lpp-digit'; return d; }));
  };
  visual.append(digits);
  root.append(visual);

  let shown: string | null = null;
  const setLp = (lp: number) => {
    const text = lpDigits(lp);
    root.setAttribute('aria-label', `${name}: ${text} life points`);
    setLpBar(lp / FULL_LP);
    if (text !== shown) { drawDigits(lp); shown = text; }
  };
  setLp(opts.lp); setTimeBar(opts.time);
  return { root, setLp, setTime: setTimeBar };
}
