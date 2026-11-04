<script>
  // An NPC's speech bubble, modern (CWindowModelBalloon; logic.js balloon): a white bubble with its tail toward the
  // NPC's portrait (the engine keeps drawing that, beside the window), the speaker on a gold tag, the line in large
  // type and a "next" cue. Before: small text with a missing-glyph box for its '・' marks and no hint that a click goes
  // on. The game advances on a click anywhere (its window's backdrop covers the screen), so the bubble is a button
  // that takes the focus: Space or Enter goes on too.
  import { balloon } from './logic.js';
  import Icon from './Icon.svelte';
  import { focusSoon } from './macro.js';
  let { view } = $props();
  const win = $derived(view.win);
  const b = $derived(balloon(win));
  const api = $derived(view.api);
  const shown = $derived(win.shown);
  let el = $state();
  $effect(() => shown && el ? focusSoon(el.parentElement, 'button') : undefined);
  const next = () => b.frame && api.click(b.frame.id);
</script>

<div class="mu">
  {#key b.text}
    <button type="button" class="bubble" bind:this={el} onclick={next} style:width="{(b.frame?.w || win.w) - 18}px" style:height="{b.frame?.h || win.h}px" aria-label="{b.name}: {b.text}. Continue">
      {#if b.name}<span class="who">{b.name}</span>{/if}
      <span class="line">{b.text}</span>
      <span class="next" aria-hidden="true">Continue <Icon name="chevron" size={14} /></span>
    </button>
  {/key}
</div>

<style>
  .bubble { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; justify-content: center; padding: 18px 28px 22px; pointer-events: auto;
    border-radius: 22px; text-align: left; cursor: pointer; color: var(--ink-strong); background: var(--plate);
    box-shadow: 0 0 0 2px var(--plate-edge), inset 0 1px 0 #fff, 0 16px 32px -14px rgba(10, 35, 80, .5), 0 3px 8px rgba(10, 35, 80, .18);
    animation: say .24s var(--ease) both; }
  /* the tail, toward the portrait on the right */
  .bubble::after { content: ''; position: absolute; right: -14px; top: 58%; width: 22px; height: 22px; transform: rotate(45deg) skew(12deg, 12deg);
    background: #eef2f7; box-shadow: 2px -2px 0 0 var(--plate-edge); clip-path: polygon(0 0, 100% 0, 100% 100%); }
  .bubble:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
  .who { position: absolute; left: 18px; top: -12px; height: 24px; padding: 0 12px; border-radius: 12px; font-size: 13px; font-weight: 800; line-height: 24px;
    color: var(--gold-ink); background: var(--gold); box-shadow: 0 0 0 1px var(--gold-edge), 0 2px 4px rgba(120, 70, 0, .25); }
  .line { font-size: 16px; font-weight: 650; line-height: 1.4; white-space: pre-line; }
  .next { position: absolute; right: 20px; bottom: 8px; display: inline-flex; align-items: center; gap: 2px; font-size: 11px; font-weight: 700; color: var(--link);
    animation: nudge 1.2s ease-in-out infinite; }
  @keyframes say { from { opacity: 0; transform: translateY(4px) scale(.98); } }
  @keyframes nudge { 50% { transform: translateX(3px); } }
</style>
