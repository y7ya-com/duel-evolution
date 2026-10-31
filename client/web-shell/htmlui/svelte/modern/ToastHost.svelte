<script>
  // The toasts, top centre over the game: newest last, each dismissed by a click (or after its time)
  import { list, dismiss } from './toasts.svelte.js';
</script>

<div class="mu" aria-live="polite">
  <ol class="stack">
    {#each list as t (t.id)}
      <li><button type="button" class="toast" onclick={() => dismiss(t.id)} title="Dismiss">
        <svg class="mu-ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM10 9v4.5M10 6.5v.5" /></svg>
        <span>{t.text}</span>
      </button></li>
    {/each}
  </ol>
</div>

<style>
  .stack { position: absolute; left: 50%; top: 64px; transform: translateX(-50%); width: 420px; margin: 0; padding: 0; list-style: none;
    display: flex; flex-direction: column; gap: 8px; pointer-events: none; z-index: 2147483000; }
  .toast { pointer-events: auto; display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 12px 14px; border-radius: var(--r-ctl);
    font-size: 13px; font-weight: 600; line-height: 1.4; color: var(--ink-strong); text-align: left; white-space: pre-wrap;
    background: var(--plate); box-shadow: 0 0 0 1px var(--plate-edge), inset 3px 0 0 var(--p700), 0 14px 28px -12px rgba(10, 35, 80, .5);
    animation: in .28s var(--ease) both; }
  .toast .mu-ico { color: var(--p700); margin-top: 1px; }
  @keyframes in { from { opacity: 0; transform: translateY(-8px); } }
  @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
</style>
