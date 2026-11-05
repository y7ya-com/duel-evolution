import type { DuelCardView } from './contracts';

/** The badges the original draws on a face-up field card (CCard::drawCounterRoom and CCard::drawCounters,
 * client/src/duel/SceneCard.cpp), from data/y/duel/card/card.txt's sheets:
 * - the turn count: pas_eff_suna.png (6 frames of 13×13, an hourglass cycling frames 0..2 every 16 game frames) and
 *   its number;
 * - each counter kind: magic_counter.png (6 frames of 16×16, a spinning coin; a row per kind, DAT_00bebb4c below) and
 *   its number, one row per kind stacked from the badge row inward (16 px apart).
 * Numbers are duel_fontm_y.png digits (number sheet 8: 10 glyphs of 7×16), centred 6 px right of the icon. A badge's
 * centre is 5 px inside the card's edge toward its controller (the bottom of the player's cards, the top of the
 * opponent's), its left edge the card's; the badges stay upright whatever the card's position. A count that goes up or
 * down plays CCard::popCounter (flash 6 / 7, flashLevel 0x200 down by 0x10 a frame, 32 frames): the coin turns through
 * frames 5..0 (flashLevel / 64) and, for the first 16 frames, pas_eff.png (up) or pas_eff2.png (down: 8 frames of 24×24,
 * one a frame) bursts over the number.
 * All in the card's own 58×84 box. */

/** DAT_00bebb4c: the sheet row of counter kinds 0..22 (the translator's COUNTER_MAP kinds). */
export const COUNTER_ROWS = [1, 2, 5, 8, 18, 10, 11, 12, 13, 14, 15, 16, 17, 17, 17, 0, 3, 4, 6, 7, 9, 17, 17] as const;
const W = 58, H = 84, ROW = 16, EDGE = 5;
const pct = (v: number, of: number) => `${v / of * 100}%`;

export interface BadgeArt { image(path: string): HTMLImageElement }

/** Where a badge row's top-left corner sits in the card box: row `row` (0 = the edge row), `height` px tall. */
export function badgePlace(opponent: boolean, row: number, height: number): { left: number; top: number } {
  const centre = opponent ? EDGE + row * ROW : H - EDGE - row * ROW;
  return { left: 0, top: centre - Math.ceil(height / 2) };
}

/** The rows the card shows: the turn badge first (when the card counts turns), then each counter kind. */
export function badgeRows(card: Pick<DuelCardView, 'faceUp' | 'counters' | 'turnCounter'>): { kind: 'turns' | number; count: number }[] {
  if (!card.faceUp) return [];
  const rows: { kind: 'turns' | number; count: number }[] = [];
  if ((card.turnCounter ?? 0) > 0) rows.push({ kind: 'turns', count: card.turnCounter! });
  for (const c of card.counters ?? []) if (c.count > 0) rows.push({ kind: c.kind, count: c.count });
  return rows;
}

const previous = new Map<string, number>();

export function cardBadges(card: DuelCardView, art: BadgeArt): HTMLElement | null {
  const rows = badgeRows(card); if (!rows.length) return null;
  const layer = document.createElement('span'); layer.className = 'de-card-badges'; layer.setAttribute('aria-hidden', 'true');
  const opponent = card.controller === 1;
  rows.forEach((row, i) => {
    const turns = row.kind === 'turns', size = turns ? 13 : 16, at = badgePlace(opponent, i, size);
    const badge = document.createElement('span'); badge.className = `de-badge${turns ? ' de-badge-turns' : ''}`; badge.dataset.kind = String(row.kind); badge.dataset.count = String(row.count);
    badge.style.left = pct(at.left, W); badge.style.top = pct(at.top, H); badge.style.height = pct(size, H);
    const icon = document.createElement('span'); icon.className = 'de-badge-icon'; icon.style.width = pct(size, W); icon.style.height = '100%';
    const sheet = art.image(turns ? 'data/y/duel/card/pas_eff_suna.png' : 'data/y/duel/card/magic_counter.png');
    sheet.style.width = '600%'; sheet.style.height = turns ? '100%' : '2000%';
    if (!turns) sheet.style.top = `-${COUNTER_ROWS[row.kind as number] ?? 17}00%`;
    // A count that changed since the last frame spins its coin once (the original's flash 6 / 7).
    const key = `${card.id}/${row.kind}`, before = previous.get(key), changed = !turns && before !== undefined && before !== row.count;
    if (changed) sheet.className = 'de-badge-spin';
    previous.set(key, row.count);
    if (previous.size > 512) previous.delete(previous.keys().next().value!);
    icon.append(sheet); badge.append(icon);
    if (changed) {
      const pop = document.createElement('span'); pop.className = 'de-badge-pop';
      pop.style.left = pct(size + 6 - 12, W); pop.style.top = pct(size / 2 - 12, size); pop.style.width = pct(24, W); pop.style.height = pct(24, size);
      const burst = art.image(`data/y/duel/card/${row.count > before! ? 'pas_eff' : 'pas_eff2'}.png`); pop.append(burst); badge.append(pop);
    }
    const digits = String(row.count), number = document.createElement('span'); number.className = 'de-badge-number';
    number.style.left = pct(size + 6 - digits.length * 3.5, W); number.style.width = pct(digits.length * 7, W);
    number.style.top = pct(size / 2 - 8, size); number.style.height = pct(16, size);
    for (const d of digits) {
      const glyph = document.createElement('span'); glyph.className = 'de-badge-digit';
      const font = art.image('data/y/duel/font/duel_fontm_y.png'); font.style.left = `-${d}00%`; glyph.append(font); number.append(glyph);
    }
    badge.append(number); layer.append(badge);
  });
  return layer;
}

export const BADGE_CSS = `
.de-card-badges { position:absolute; inset:0; pointer-events:none; z-index:2; }
.de-badge { position:absolute; width:100%; overflow:visible; }
.de-badge-icon { position:absolute; left:0; top:0; overflow:hidden; }
.de-badge-icon img { position:absolute; left:0; top:0; max-width:none; image-rendering:pixelated; }
.de-badge-turns .de-badge-icon img { animation:de-badge-sand .8s steps(3) infinite; }
.de-badge-icon img.de-badge-spin { animation:de-badge-spin .4s steps(5) .133s 1 backwards; }
.de-badge-pop { position:absolute; overflow:hidden; animation:de-badge-gone 0s linear .267s forwards; }
.de-badge-pop img { position:absolute; left:0; top:0; width:800%; height:100%; max-width:none; animation:de-badge-burst .133s steps(8) 2; }
.de-badge-number { position:absolute; display:flex; }
.de-badge-digit { position:relative; flex:1; height:100%; overflow:hidden; }
.de-badge-digit img { position:absolute; top:0; height:100%; width:1000%; max-width:none; image-rendering:pixelated; }
@keyframes de-badge-sand { from { left:0; } to { left:-300%; } }
@keyframes de-badge-spin { from { left:-500%; } to { left:0; } }
@keyframes de-badge-burst { from { left:0; } to { left:-800%; } }
@keyframes de-badge-gone { to { visibility:hidden; } }
[data-motion=reduced] .de-badge-icon img { animation:none !important; }
[data-motion=reduced] .de-badge-pop { display:none; }
`;
