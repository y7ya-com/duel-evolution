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
    background: radial-gradient(120% 90% at 30% 0%, #1b56c4 0%, #0d2e70 45%, #061733 100%); }
  .field::after { content: ''; position: absolute; inset: 0; pointer-events: none;
    background: repeating-linear-gradient(180deg, rgba(255, 255, 255, .025) 0 1px, transparent 1px 3px); }
  .ring { position: absolute; right: -90px; bottom: -120px; width: 560px; height: 560px; fill: none; stroke: rgba(125, 239, 252, .1); stroke-width: 3; }
  .title { position: absolute; display: flex; align-items: center; gap: 10px; margin: 0; font-size: 21px; font-weight: 750; letter-spacing: .02em;
    color: #fff; text-shadow: 0 2px 6px rgba(2, 10, 30, .6); white-space: nowrap; }
  .side { position: absolute; display: flex; align-items: center; gap: 9px; padding: 0 12px; border-radius: 9px 9px 9px 3px;
    font-size: 13px; font-weight: 650; color: var(--ink); text-shadow: 0 1px 1px rgba(4, 16, 44, .55);
    background: linear-gradient(180deg, rgba(125, 239, 252, .2), rgba(9, 133, 255, .14) 50%, rgba(9, 100, 220, .22));
    box-shadow: inset 0 0 0 1px rgba(160, 225, 255, .38), inset 0 1px 0 rgba(255, 255, 255, .28), 0 2px 4px rgba(2, 10, 30, .3);
    transition: transform .14s var(--ease), background .14s, box-shadow .14s; }
  .side :global(.mu-ico) { color: var(--gold-300); }
  .side.hover { transform: translateX(3px); color: var(--gold-ink); text-shadow: none;
    background: linear-gradient(180deg, var(--gold-200) 0%, var(--gold-300) 44%, var(--gold-400) 56%, var(--gold-500) 100%);
    box-shadow: 0 0 0 1px var(--gold-edge), inset 0 1px 0 rgba(255, 255, 255, .85), 0 6px 14px -6px rgba(120, 70, 0, .6); }
  .side.hover :global(.mu-ico) { color: var(--gold-ink); }
  .side.exit { margin-top: 6px; }
</style>
