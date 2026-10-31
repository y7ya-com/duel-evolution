<script>
  // An unlock or item announcement, modern (CWindowModelItemGet; logic.js itemGet): the engine keeps drawing its
  // portrait card (the window's sprite extras pass through); its lines become one ribbon across the card's foot, the
  // first line large, and its OK picture a gold button at its place. Pass mode (the game keeps the mouse over the
  // card); the OK alone takes the pointer and the focus, so Enter, Space or Esc dismisses it at once.
  import { itemGet } from './logic.js';
  import { focusSoon } from './macro.js';
  let { view } = $props();
  const win = $derived(view.win);
  const g = $derived(itemGet(win));
  const api = $derived(view.api);
  const shown = $derived(win.shown);
  let btn = $state();
  $effect(() => shown && btn ? focusSoon(btn.parentElement, 'button') : undefined);
  const ok = () => g.ok && api.click(g.ok.id);
  // keys on the button itself (the bridge stops a key at the window root, where Svelte's delegated onkeydown would be)
  const keyed = el => { const f = e => { if (e.key === 'Escape') { e.preventDefault(); ok(); } }; el.addEventListener('keydown', f); return () => el.removeEventListener('keydown', f); };
  const band = $derived(g.lines.length ? { x: Math.min(...g.lines.map(l => l.c.x)), y: Math.min(...g.lines.map(l => l.c.y)), w: Math.max(...g.lines.map(l => l.c.w)),
    h: Math.max(...g.lines.map(l => l.c.y + l.c.h)) - Math.min(...g.lines.map(l => l.c.y)) } : null);
</script>

<div class="mu">
  {#if band}
    <div class="ribbon" role="status" style:left="{band.x - 8}px" style:top="{band.y - 10}px" style:width="{band.w + 16}px" style:min-height="{band.h + 20}px">
      {#each g.lines as l, i (l.id)}<p class:lead={i === 0}>{l.text}</p>{/each}
    </div>
  {/if}
  {#if g.ok}
    <button type="button" class="mu-btn gold ok" bind:this={btn} {@attach keyed} data-state={g.ok.state} onclick={ok}
      style:left="{g.ok.x}px" style:top="{g.ok.y}px" style:width="{g.ok.w}px" style:height="{g.ok.h}px">{g.okLabel}</button>
  {/if}
</div>

<style>
  .ribbon { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 8px 14px;
    border-radius: 10px; background: var(--band); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .3), 0 0 0 1px var(--band-edge), 0 8px 18px -8px rgba(10, 35, 80, .6);
    animation: pop .32s var(--ease) both; }
  .ribbon p { margin: 0; font-size: 13px; font-weight: 650; color: #fff; text-align: center; text-shadow: 0 1px 0 rgba(0, 20, 60, .4); }
  .ribbon p.lead { font-size: 16px; font-weight: 800; letter-spacing: .01em; }
  .ok { position: absolute; pointer-events: auto; font-size: 18px; font-weight: 800; letter-spacing: .04em; }
  @keyframes pop { from { opacity: 0; transform: translateY(6px) scale(.97); } }
</style>
