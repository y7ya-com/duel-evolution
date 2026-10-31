<script>
  // A Yes / No dialog, modern (CWindowModelDialogYesNo: a FrameThin, its message TextField, two TextSwitches; logic.js
  // dialog): the message and the game's own switches, Yes the primary; Enter is the primary, Esc the way out.
  import { dialog, leaveButton, primary } from './logic.js';
  let { view } = $props();
  const win = $derived(view.win);
  const d = $derived(dialog(win));
  const api = $derived(view.api);
  let panel;
  $effect(() => { panel?.querySelector('.gold, button')?.focus({ preventScroll: true }); });
  function keys(e) {
    if (e.key === 'Escape') { e.preventDefault(); const b = leaveButton(d.buttons); b && api.click(b.id); }
  }
</script>

<div class="mu">
  <div class="scrim" style:left="{-win.x}px" style:top="{-win.y}px"></div>
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <section class="mu-plate box" role="alertdialog" aria-modal="true" aria-label={d.text} style:width="{win.w}px" bind:this={panel} onkeydown={keys}>
    <p>{d.text}</p>
    <footer>
      {#each d.buttons as b (b.id)}
        <button type="button" class="mu-btn" class:gold={primary(b)} data-state={b.state} disabled={b.state === 'disabled'} onclick={() => api.click(b.id)}>{b.label}</button>
      {/each}
    </footer>
  </section>
</div>

<style>
  .scrim { position: absolute; width: 1024px; height: 768px; background: rgba(2, 10, 30, .45); animation: fade .2s var(--ease) both; }
  @keyframes fade { from { opacity: 0; } }
  .box { left: 0; top: 0; padding: 22px 22px 18px; }
  p { margin: 0; min-height: 56px; font-size: 15px; font-weight: 600; line-height: 1.45; color: #fff; text-align: center; white-space: pre-wrap;
    text-shadow: 0 1px 2px rgba(2, 10, 30, .5); text-wrap: balance; }
  footer { display: flex; justify-content: center; gap: 12px; margin-top: 14px; }
  footer .mu-btn { min-width: 110px; }
</style>
