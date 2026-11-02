<script>
  // The scene around the windows (CDeckScene), under every window root (the bridge's backdrop layer): the brushed
  // metal background (deck.js deckBackdrop: sampled gradients under SVG noise), the title strip and the five side
  // buttons as CSS bevels with Audiowide text (the owner's rule: no background photo, no text in art). Down to the
  // windows' foot (712): below is the game's menu bar. Clipped around every deck hole (the engine draws those).
  import { deckBackdrop, clip } from '../../screens/deck.js';
  import { deck } from './state.svelte.js';
  import { STRIP, SIDE, SIDE_HOVER, TITLES, SIDE_TEXT, inSide } from './art.js';
  import TextArt from './TextArt.svelte';
  let { view } = $props();
  const sc = $derived(view.win);
  const cut = $derived(clip({ z: -Infinity, rect: { x: 0, y: 0, w: 1024, h: 712 } }, deck.holes, 0, 0));
  const n = $derived(+(sc.title?.tex.match(/deck_title_0(\d)/)?.[1] || 1));
  const poly = ({ w, h, cut }, i) => `polygon(0 ${i}px, ${w - 3 - i}px ${i}px, ${w - i}px ${3 + i}px, ${w - i}px ${cut}px, ${w - i * 1.4 - (h - cut)}px ${h - i}px, 0 ${h - i}px)`;
  const grad = stops => `linear-gradient(to bottom, ${stops.map(([c, at]) => `rgb(${c}) ${at}px`).join(', ')})`;
  const buttons = $derived(sc.menu.filter(b => b.shown && SIDE_TEXT[b.name]).map(b => ({ b, t: SIDE_TEXT[b.name], hover: inSide(b, sc.mouse) })));
</script>

{#snippet bevel(look, x, y)}
  <div style:position="absolute" style:left="{x}px" style:top="{y}px" style:width="{look.w}px" style:height="{look.h}px" style:background="#fff" style:clip-path={poly(look, 0)}>
    <div style:position="absolute" style:inset="0" style:clip-path={poly(look, 1)} style:background={grad(look.stops)}></div>
  </div>
{/snippet}

<div style:position="absolute" style:left="0" style:top="0" style:width="1024px" style:height="712px" style:overflow="hidden" style:clip-path={cut}>
  <div style="display: contents" {@attach el => { const d = deckBackdrop(el); return () => d.remove(); }}></div>
  {#if sc.title?.shown}
    {@render bevel(STRIP, sc.title.wx, sc.title.wy)}
    <TextArt art={[TITLES[n - 1] || TITLES[0], '#1059ff', 6, 9, n === 3 ? 169 : 201, 32, 1, 0, 1]} x={sc.title.wx} y={sc.title.wy} />
  {/if}
  {#each buttons as { b, t, hover } (b.id)}
    {@render bevel(hover ? SIDE_HOVER : SIDE, b.wx, b.wy)}
    <TextArt art={[t[0], hover ? '#ff9d10' : '#1059ff', t[1], 5, t[2], 23, 1, 0, 2]} x={b.wx} y={b.wy} fill={hover ? '#fdff45' : '#fff'} />
  {/each}
</div>
