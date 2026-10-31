<script module>
  import * as ui from '../../../ui.js';
  import { FONT } from '../../controls/basic.js';
  // self-hosted with the art (ui/fonts/, the private set: the repo takes no binaries, players' browsers no Google)
  let fontReady = false;
  const loadFont = () => {
    if (fontReady) return;
    fontReady = true;
    const st = document.createElement('style');
    st.textContent = `@font-face { font-family: Audiowide; src: url(${ui.SHEET.window.url.replace(/[^/]*$/, '')}fonts/Audiowide-Regular.woff2) format('woff2'); }`;
    document.head.append(st);
  };
</script>
<script>
  // A glowing outline title as real text (the owner's rule): Audiowide, the art's white fill and sampled outline,
  // fitted to the art's ink box: an SVG <text> on its baseline, as tall as the box, stretched to its width.
  // art: [text, outline, x0, y0, x1, y1, italic, glow, outline width] (TEXT_ART's cells); fill: the hover's yellow
  let { art, x, y, alpha = 1, fill = '#fff' } = $props();
  loadFont();
  const [text, outline, x0, y0, x1, y1, italic, glow, ow = 2] = $derived(art);
  const foot = $derived(y + y1 - ow), h = $derived(y1 - y0 - 2 * ow), px = $derived(h / (/[bdfhklt]/.test(text) ? 0.751 : 0.70));
</script>

<svg width="1" height="1" style:position="absolute" style:left="0" style:top="0" style:overflow="visible"
  style:opacity={alpha === 1 ? '' : alpha} style:filter={glow ? `drop-shadow(0 0 1px ${outline})` : ''}>
  <text transform="translate({x + x0 + ow} {foot}){italic ? ' skewX(-12)' : ''}" textLength={x1 - x0 - 2 * ow - (italic ? h * Math.tan(Math.PI / 15) : 0)}
    lengthAdjust="spacingAndGlyphs" style:font="{px.toFixed(2)}px Audiowide, {FONT}" style:fill={fill} style:stroke={outline}
    style:stroke-width={2 * ow} style:stroke-linejoin="round" style:paint-order="stroke fill">{text}</text>
</svg>
