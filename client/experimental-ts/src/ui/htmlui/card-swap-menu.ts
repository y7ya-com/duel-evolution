// Card Swap's left column (the trade scene: live's deck screen title strip and side menu, the engine's own drawing
// there, livetour 98-trade-window): the "CARD SWAP" strip (deck_title_02, 248 x 40 at 0, 0), the five side buttons at
// 0, 40 + 27 i (176 x 27), LOAD / SAVE / STRUCTURE / CLEAR DECK greyed (no deck in a trade) and EXIT lit, which leaves
// the trade. The look is main's deck screen's (screens/deck.js drawScene: the CSS bevels with the art's sampled
// gradients, Audiowide text art); main's module draws it only in the deck editor (scene 0x24), the engine elsewhere,
// so the rewrite draws it here as main's would, with the greyed buttons as live shows them.
import { WindowBuilder, type Ids, type WindowSpec } from './snapshot';

type Stops = [string, number][];
const STRIP = { w: 248, h: 40, cut: 8, stops: [['105 255 255', 2.5], ['83 231 255', 5.5], ['66 185 255', 8.5], ['36 115 254', 30.5], ['0 67 254', 34.5], ['0 0 254', 37.5]] as Stops };
const SIDE = { w: 176, h: 27, cut: 6, stops: [['105 255 255', 1.5], ['80 228 255', 4.5], ['62 178 255', 7.5], ['37 120 254', 19.5], ['6 94 254', 21.5], ['0 0 254', 25.5]] as Stops };
const SIDE_HOVER = { ...SIDE, stops: [['207 255 255', 1.5], ['152 255 255', 5.5], ['134 237 255', 7.5], ['118 221 255', 19.5], ['81 209 255', 22.5], ['12 188 255', 25.5]] as Stops };
// a greyed button (live: the deck menu's disabled look, a dark teal plate without the white rim, its words grey)
const SIDE_OFF = { ...SIDE, stops: [['70 120 128', 1.5], ['46 96 112', 7.5], ['30 72 96', 19.5], ['20 52 84', 25.5]] as Stops, rim: false };
const SIDE_TEXT: [string, string, number, number][] = [['LoadBtn', 'LOAD DECK', 9, 134], ['SaveBtn', 'SAVE DECK', 7, 133], ['RecipeBtn', 'STRUCTURE DECK', 8, 150],
  ['ClearBtn', 'CLEAR DECK', 8, 144], ['ExitBtn', 'EXIT', 8, 61]];
const SVG = 'http://www.w3.org/2000/svg', FONT = "Arial, 'Liberation Sans', sans-serif";

function bevel(el: HTMLElement, b: { w: number; h: number; cut: number; stops: Stops; rim?: boolean }, x: number, y: number): HTMLElement {
  const { w, h, cut, stops } = b;
  const poly = (i: number) => `polygon(0 ${i}px, ${w - 3 - i}px ${i}px, ${w - i}px ${3 + i}px, ${w - i}px ${cut}px, ${w - i * 1.4 - (h - cut)}px ${h - i}px, 0 ${h - i}px)`;
  const o = document.createElement('div'), g = document.createElement('div');
  Object.assign(o.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', background: b.rim === false ? 'transparent' : '#fff', clipPath: poly(0) });
  Object.assign(g.style, { position: 'absolute', inset: '0', clipPath: poly(b.rim === false ? 0 : 1), background: `linear-gradient(to bottom, ${stops.map(([c, at]) => `rgb(${c}) ${at}px`).join(', ')})` });
  o.append(g); el.append(o);
  return o;
}
/** main's drawTextArt: white Audiowide words, outlined, leaning, fitted to the art's ink box (x0, y0 .. x1, y1). */
function textArt(el: HTMLElement, text: string, outline: string, box: [number, number, number, number], x: number, y: number, ow: number, fill = '#fff'): SVGSVGElement {
  const [x0, y0, x1, y1] = box, foot = y + y1 - ow, h = y1 - y0 - 2 * ow, px = h / (/[bdfhklt]/.test(text) ? 0.751 : 0.70);
  const svg = document.createElementNS(SVG, 'svg'), t = document.createElementNS(SVG, 'text');
  Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', overflow: 'visible', pointerEvents: 'none' });
  svg.setAttribute('width', '1'); svg.setAttribute('height', '1');
  t.setAttribute('transform', `translate(${x + x0 + ow} ${foot}) skewX(-12)`);
  t.setAttribute('textLength', String(x1 - x0 - 2 * ow - h * Math.tan(Math.PI / 15)));
  t.setAttribute('lengthAdjust', 'spacingAndGlyphs');
  Object.assign(t.style, { font: `${px.toFixed(2)}px Audiowide, ${FONT}`, fill, stroke: outline, strokeWidth: String(2 * ow), strokeLinejoin: 'round', paintOrder: 'stroke fill' });
  t.textContent = text; svg.append(t); el.append(svg);
  return svg;
}

/** The column's window (over the trade's ground, beside the card detail): the strip, the buttons, EXIT's look on hover. */
export function cardSwapMenu(ids: Ids, o: { exit(): void; disabled?: boolean }): WindowSpec {
  const b = new WindowBuilder(ids, 'cardswap-menu', 'CCardSwapMenu', { x: 0, y: 0, w: 248, h: 175 }, { z: 51102 });
  const spec = b.spec();
  spec.after = root => {
    if (root.querySelector('[data-key="trade-exit"]')) { (root.querySelector('[data-key="trade-exit"]') as HTMLButtonElement).disabled = !!o.disabled; return; }
    const box = document.createElement('div'); Object.assign(box.style, { position: 'absolute', left: '0', top: '0', width: '248px', height: '175px' });
    bevel(box, STRIP, 0, 0); textArt(box, 'CARD SWAP', '#1059ff', [6, 9, 201, 32], 0, 0, 1);
    SIDE_TEXT.forEach(([name, label, x0, x1], i) => {
      const y = 40 + 27 * i;
      if (name !== 'ExitBtn') { bevel(box, SIDE_OFF, 0, y); textArt(box, label, '#1c2c3c', [x0, 5, x1, 23], 0, y, 2, '#7d8890'); return; }
      const btn = document.createElement('button'); btn.type = 'button'; btn.dataset.key = 'trade-exit'; btn.setAttribute('aria-label', 'Exit'); btn.disabled = !!o.disabled;
      Object.assign(btn.style, { position: 'absolute', left: '0', top: y + 'px', width: '176px', height: '27px', padding: '0', margin: '0', border: '0', background: 'none', cursor: 'pointer' });
      const draw = (hover: boolean) => { btn.replaceChildren(); bevel(btn, hover ? SIDE_HOVER : SIDE, 0, 0); const svg = textArt(btn, label, hover ? '#ff9d10' : '#1059ff', [x0, 5, x1, 23], 0, 0, 2, hover ? '#fdff45' : '#fff'); svg.style.pointerEvents = 'none'; };
      draw(false);
      btn.onmouseenter = () => draw(true); btn.onmouseleave = () => draw(false);
      btn.onclick = e => { e.stopPropagation(); if (!btn.disabled) o.exit(); };
      box.append(btn);
    });
    root.append(box);
  };
  // the driver and assistive tools find EXIT by its key
  const c = b.add('CCardSwapExit', 'exit', { x: 0, y: 148, w: 176, h: 27 }, { shown: true });
  b.on(c, { key: 'trade-exit', label: 'Exit', click: () => { if (!o.disabled) o.exit(); } });
  return spec;
}
