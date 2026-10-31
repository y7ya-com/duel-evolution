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
  // the editor's keys: / the trunk's search; Ctrl (Cmd) + S Save Deck, + O Load Deck: the engine's click on that side button
  const KEYS = { s: 'SaveBtn', o: 'LoadBtn' };
  const press = b => {
    const cv = document.getElementById('canvas'), r = cv.getBoundingClientRect(), k = r.width / 1024;
    const p = { clientX: r.left + (b.wx + 80) * k, clientY: r.top + (b.wy + 13) * k, bubbles: true, cancelable: true, button: 0 };
    cv.dispatchEvent(new MouseEvent('mousemove', { ...p, buttons: 0 }));
    setTimeout(() => cv.dispatchEvent(new MouseEvent('mousedown', { ...p, buttons: 1 })), 70);
    setTimeout(() => cv.dispatchEvent(new MouseEvent('mouseup', { ...p, buttons: 0 })), 140);
  };
  $effect(() => {
    const key = e => {
      const typing = /^(INPUT|TEXTAREA)$/.test(e.target?.tagName || '');
      if (e.key === '/' && !typing) { const f = document.querySelector('.dk-field'); if (f) { e.preventDefault(); e.stopPropagation(); f.focus(); } return; }
      const name = (e.ctrlKey || e.metaKey) && !e.altKey && KEYS[e.key.toLowerCase()];
      const b = name && sc.menu.find(m => m.name === name && m.shown);
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      press(b);
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  });

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
      <div class="side" class:hover class:exit={b.name === 'ExitBtn'} style:left="{b.wx + 8}px" style:top="{b.wy + 1}px" style:width="{SIDE.w - 10}px" style:height="{SIDE.h - 3}px">
        <Icon name={t[1]} size={15} /><span>{t[0]}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .field { position: absolute; left: 0; top: 0; width: 1024px; height: 712px; overflow: hidden; background: var(--stage); }
  .field::after { content: ''; position: absolute; inset: 0; pointer-events: none;
    background: repeating-linear-gradient(180deg, rgba(255, 255, 255, .025) 0 1px, transparent 1px 3px); }
  .ring { position: absolute; right: -90px; bottom: -120px; width: 560px; height: 560px; fill: none; stroke: rgba(255, 255, 255, .07); stroke-width: 3; }
  /* the editor's name: the one logo-like header, in the 2008 word art's heavy italic */
  .title { position: absolute; display: flex; align-items: center; gap: 10px; margin: 0; font-size: 22px; font-weight: 900; font-style: italic; letter-spacing: .02em;
    color: #fff; white-space: nowrap; text-transform: uppercase; text-shadow: 0 2px 8px rgba(0, 15, 45, .45); }
  .title :global(.mu-emblem) { color: var(--gold-300); }
  .side { position: absolute; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-radius: 8px;
    font-size: 12.5px; font-weight: 650; letter-spacing: .02em; color: #fff; white-space: nowrap;
    background: rgba(255, 255, 255, .1); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .22), inset 0 1px 0 rgba(255, 255, 255, .18);
    transition: transform .14s var(--ease), background .14s, box-shadow .14s; }
  .side span { overflow: hidden; text-overflow: ellipsis; }
  .side :global(.mu-ico) { color: rgba(255, 255, 255, .85); }
  .side.hover { transform: translateX(3px); background: rgba(255, 255, 255, .2); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .45), 0 6px 14px -8px rgba(0, 15, 45, .6); }
  .side.exit { margin-top: 2px; }
</style>
