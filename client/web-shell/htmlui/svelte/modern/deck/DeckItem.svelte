<script module>
  // One drawn item of a deck window in the modern skin. The plan (svelte/deck/art.js, the legacy deck's) stays the
  // source: where the engine draws what. Content keeps its own look (card faces are the engine's holes; attribute,
  // type, limit and star icons, copy counts and the count chips as the legacy deck draws them). The frame pieces
  // become the modern plate the window draws (nothing here), the word art real text, the tabs and the trunk's row
  // plates modern CSS.
  import { artName, textArt } from '../../../screens/deck.js';
  // frame pieces: the window bases, the title bar and its icons' plates, the side bars, the native-scrolled bar
  export const FRAME = /^(window_base_01_c0[178]|iconbar_01|deckbar_01|scroll_01|swich_01)/;   // + the switches' plates (a modern button instead)
  export const kind = s => {
    const n = artName(s.tex);
    if (FRAME.test(n)) return 'frame';
    if (/^deck_carddai_01/.test(n)) return 'row';
    if (/^decktab_01/.test(n)) return 'tab';
    if (/^icon_01_c01/.test(n)) return 'icon';
    if (/^deck_(moji|tabmoji)_01/.test(n)) return 'word';
    return 'content';
  };
  // the trunk row plates by variant (c01 monsters' grey-green, c02 spells', c04 traps', c00 the list's foot)
  export const ROW = { c00: 'rgba(4, 17, 43, .0)', c01: 'rgba(255, 255, 255, .07)', c02: 'rgba(70, 230, 160, .10)', c04: 'rgba(230, 90, 200, .10)' };
</script>

<script>
  import { clip } from '../../../screens/deck.js';
  import { deck } from '../../deck/state.svelte.js';
  import Sprite from '../../deck/Sprite.svelte';
  import Label from '../../deck/Label.svelte';
  import Flow from '../../deck/Flow.svelte';
  // holes: the card faces that cut this item (a modal window: its own only; the engine draws it over the rest)
  let { it, ox, oy, holes = deck.holes } = $props();
  const cut = $derived(clip(it, holes, ox, oy));
  const k = $derived(it.kind === 'sprite' ? kind(it.s) : it.kind);
  const W = $derived(it.kind === 'sprite' ? it.s.src[2] * (it.s.sx ?? 1) : 0), H = $derived(it.kind === 'sprite' ? it.s.src[3] * (it.s.sy ?? 1) : 0);
  const word = $derived(k === 'word' ? textArt(it.s) : null);
  const front = $derived(k === 'word' && /tabmoji/.test(artName(it.s.tex)) && it.s.src[0] > 0);
  const variant = $derived(k === 'row' ? /_(c0\d)/.exec(artName(it.s.tex))?.[1] : '');
</script>

{#if k !== 'frame' && k !== 'tab'}
  <div class="layer" style:width="100%" style:height="100%" style:clip-path={cut}>
    {#if k === 'row'}
      <div class="row" style:left="{it.x}px" style:top="{it.y}px" style:width="{W}px" style:height="{H}px" style:background={ROW[variant] || ROW.c01}></div>
    {:else if k === 'icon'}
      <svg class="chev" viewBox="0 0 16 24" style:left="{it.x}px" style:top="{it.y}px" aria-hidden="true"><path d={it.s.src[1] >= 48 ? 'M4 10l4 4 4-4' : 'M4 14l4-4 4 4'} /></svg>
    {:else if word}
      <span class="word" class:tab={/^(Main|Fusion)$/.test(word[0])} class:front style:left="{it.x + word[2]}px" style:top="{it.y}px" style:height="{H}px" style:opacity={it.s.a ?? 1}>{word[0]}</span>
    {:else if it.kind === 'sprite'}
      <Sprite s={it.s} x={it.x} y={it.y} />
    {:else if it.kind === 'label'}
      <Label text={it.text} x={it.x} y={it.y} alpha={it.alpha} box={{ ...it.box, ink: it.box.ink ?? 0xeaf6ff }} />
    {:else if it.kind === 'flow'}
      <div class="flow"><Flow text={it.text} x={it.x} y={it.y} w={it.w} h={it.h} alpha={it.alpha} px={it.px} /></div>
    {:else if it.kind === 'button'}
      <!-- the switch: its plate is DeckWindow's (under every item); here the real <button> over it -->
      <button type="button" class="btn" disabled={!it.enabled} data-state={it.state} aria-label={it.label}
        style:position="absolute" style:left="{it.x}px" style:top="{it.y}px" style:width="{it.w}px" style:height="{it.h}px"
        style:background="none" style:border="0" style:padding="0" style:margin="0"></button>
    {/if}
  </div>
{/if}

<style>
  .row { position: absolute; }
  .chev { position: absolute; width: 16px; height: 24px; fill: none; stroke: var(--ink-2); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .word { position: absolute; display: flex; align-items: center; white-space: nowrap; font-size: 15px; font-weight: 700; letter-spacing: .01em; color: #fff;
    text-shadow: 0 1px 2px rgba(2, 10, 30, .7); }
  .word.tab { font-size: 13px; font-weight: 650; color: var(--ink-3); }
  .word.tab.front { color: #fff; }
  /* the card text's plain (black) runs light on the plate; coloured runs keep their colour */
  .flow :global(span[style*='color: rgb(0, 0, 0)']) { color: var(--ink) !important; }
</style>
