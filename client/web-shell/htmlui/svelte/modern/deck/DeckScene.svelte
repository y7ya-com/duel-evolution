<script>
  // The deck editor's scene in the modern skin (the bridge's backdrop layer, under every window): the deep blue field
  // with the duel disk's ring, the title, and the five side actions at the engine's own places (pass mode: the game
  // takes the click there; hover is the scene's mouse). Cut around every card face the engine draws.
  import { clip } from '../../../screens/deck.js';
  import { deck } from '../../deck/state.svelte.js';
  import { SIDE, TITLES, inSide } from '../../deck/art.js';
  import Icon from '../Icon.svelte';
  let { view } = $props();
  const sc = $derived(view.win);
  const cut = $derived(clip({ z: -Infinity, rect: { x: 0, y: 0, w: 1024, h: 712 } }, deck.holes, 0, 0));
  const n = $derived(+(sc.title?.tex.match(/deck_title_0(\d)/)?.[1] || 1));
  const title = $derived((TITLES[n - 1] || TITLES[0]).toLowerCase().replace(/\b\w/g, m => m.toUpperCase()));
  const SIDES = { LoadBtn: ['Load Deck', 'deck'], SaveBtn: ['Save Deck', 'log'], RecipeBtn: ['Structure Deck', 'team'], ClearBtn: ['Clear Deck', 'trash'], ExitBtn: ['Exit', 'exit'] };
  const buttons = $derived(sc.menu.filter(b => b.shown && SIDES[b.name]).map(b => ({ b, t: SIDES[b.name], hover: inSide(b, sc.mouse) })));
</script>

<div class="mu">
  <div class="field" style:clip-path={cut}>
    <svg class="ring" viewBox="0 0 400 400" aria-hidden="true">
      <circle cx="200" cy="200" r="182" /><circle cx="200" cy="200" r="150" /><circle cx="200" cy="200" r="60" />
      <path d="M200 18v64M200 318v64M18 200h64M318 200h64" />
    </svg>
    {#if sc.title?.shown}
      <h1 class="title" style:left="{sc.title.wx + 14}px" style:top="{sc.title.wy + 6}px">
        <svg class="mu-emblem" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" /><circle cx="12" cy="12" r="3.2" fill="currentColor" /></svg>
        {title}
      </h1>
    {/if}
    {#each buttons as { b, t, hover } (b.id)}
      <div class="side" class:hover class:exit={b.name === 'ExitBtn'} style:left="{b.wx + 8}px" style:top="{b.wy + 1}px" style:width="{SIDE.w - 20}px" style:height="{SIDE.h - 3}px">
        <Icon name={t[1]} size={15} /><span>{t[0]}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .field { position: absolute; left: 0; top: 0; width: 1024px; height: 712px; overflow: hidden;
    background: repeating-linear-gradient(90deg, rgba(255, 255, 255, .28) 0 1px, transparent 1px 3px),
      linear-gradient(180deg, #f6f9fc 0%, #dfe7f0 45%, #c7d3e1 100%); }
  .ring { position: absolute; right: -90px; bottom: -120px; width: 560px; height: 560px; fill: none; stroke: rgba(9, 133, 255, .12); stroke-width: 3; }
  .title { position: absolute; display: flex; align-items: center; gap: 10px; margin: 0; font-size: 24px; font-weight: 900; font-style: italic; letter-spacing: .02em;
    color: #fff; white-space: nowrap; text-transform: uppercase;
    text-shadow: -1.5px 0 #1059ff, 1.5px 0 #1059ff, 0 -1.5px #1059ff, 0 1.5px #1059ff, 0 2px 6px rgba(16, 89, 255, .5); }
  .title :global(.mu-emblem) { color: #fff97f; }
  .side { position: absolute; display: flex; align-items: center; gap: 9px; padding: 0 12px; border-radius: 4px 10px 10px 4px;
    font-size: 14px; font-weight: 900; font-style: italic; letter-spacing: .03em; color: #fff; text-transform: uppercase;
    text-shadow: -1px 0 #1059ff, 1px 0 #1059ff, 0 -1px #1059ff, 0 1px #1059ff;
    background: linear-gradient(180deg, #69ffff 0%, #50e4ff 18%, #3eb2ff 32%, #2578fe 72%, #065efe 82%, #0000fe 100%);
    box-shadow: 0 0 0 1px #fff, 0 2px 4px rgba(0, 0, 60, .35); clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%);
    transition: transform .14s var(--ease), filter .14s; }
  .side :global(.mu-ico) { color: #fff97f; filter: drop-shadow(0 0 1px #1059ff); }
  .side.hover { transform: translateX(4px); color: #fdff45; filter: brightness(1.12);
    text-shadow: -1px 0 #ff9d10, 1px 0 #ff9d10, 0 -1px #ff9d10, 0 1px #ff9d10; }
  .side.exit { margin-top: 2px; }
</style>
