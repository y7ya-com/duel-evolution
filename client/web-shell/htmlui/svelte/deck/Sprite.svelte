<script>
  // One of the engine's sprites: a title as text art, a copy-count digit as CSS + Arial, an icon as vector, else its
  // atlas cell as the game samples it (ui.js sprite(): shared with the starter picker), once the atlas has loaded.
  import * as ui from '../../../ui.js';
  import { fontCss } from '../../controls/basic.js';
  import { textArt, vectorArt, artName } from '../../screens/deck.js';
  import { deck } from './state.svelte.js';
  import TextArt from './TextArt.svelte';
  import Vector from './Vector.svelte';
  let { s, x, y } = $props();
  const alpha = $derived(s.a ?? s.rgba?.[3] ?? 1);
  const t = $derived(textArt(s));
  // deck_font_01 (the trunk's copy counts): 8 x 12 cells, digits 0-9 then a ×, white on a black box (c02: red)
  const g = $derived(!t && /^deck_font_01_c0([12])/.exec(artName(s.tex)));
  const vec = $derived(!t && !g && vectorArt(s));
  const sheet = $derived(!t && !g && !vec && deck.sheet(s.tex));
  const W = $derived(s.src[2] * (s.sx ?? 1)), H = $derived(s.src[3] * (s.sy ?? 1));
  const cell = $derived(g && s.src[0] / 8);
  function draw(el) {
    const [u, v, w, h] = s.src, rgba = s.rgba || [1, 1, 1, 1];
    const e = ui.sprite(el, sheet, u, v, w, h, x, y, W, H, s.a ?? rgba[3]);
    const c = s.col || rgba;   // the vertex colour as drawn (inherited: a back plane's grey), else its own
    if (c[0] !== 1 || c[1] !== 1 || c[2] !== 1) e.style.filter = c[0] === c[1] && c[1] === c[2] ? `brightness(${c[0]})` : '';
    return () => e.remove();
  }
</script>

{#if t}
  <TextArt art={t} {x} {y} {alpha} />
{:else if g}
  <div style:position="absolute" style:left="{x}px" style:top="{y}px" style:width="8px" style:height="12px"
    style:background={cell >= 10 ? 'none' : g[1] === '2' ? '#ff0000' : '#000'} style:color="#fff" style:font="bold {fontCss(13, 12)}"
    style:text-align="center" style:opacity={(s.a ?? 1) === 1 ? '' : s.a}
    style:text-shadow={cell >= 10 ? '0 0 1px #000, 0 0 1px #000' : ''}>{cell >= 10 ? '×' : String(cell)}</div>
{:else if vec}
  <Vector a={vec} {x} {y} w={W} h={H} {alpha} />
{:else if sheet}
  <div style="display: contents" {@attach draw}></div>
{/if}
