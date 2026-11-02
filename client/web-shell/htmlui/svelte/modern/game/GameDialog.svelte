<script>
  // A game dialog: the screen dimmed behind a GamePanel, its message, an optional body, the game's buttons along the
  // foot (the primary gold). Enter presses the primary, Esc the way out; the first button (the primary if any) has the
  // focus. buttons: [{ label, gold, onclick, disabled }]; win: the window (the scrim covers the screen around it).
  import GamePanel from './GamePanel.svelte';
  import GameButton from './GameButton.svelte';
  import { focusSoon } from '../macro.js';
  let { win, title = '', text = '', buttons = [], onleave = null, onprimary = null, width = null, children } = $props();
  let panel = $state();
  // the first control takes the focus once the game shows the window (it opens hidden for a few frames, and a hidden
  // root takes none: a duel request's Enter went nowhere and the request timed out)
  const shown = $derived(!!win?.shown);
  $effect(() => shown ? focusSoon(panel, 'input, textarea, .gold, button') : undefined);
  function keys(e) {
    if (e.key === 'Escape' && onleave) { e.preventDefault(); onleave(); }
    else if (e.key === 'Enter' && onprimary && !/^(TEXTAREA|BUTTON)$/.test(e.target?.tagName || '')) { e.preventDefault(); onprimary(); }
  }
</script>

<div class="scrim" style:left="{-win.x}px" style:top="{-win.y}px"></div>
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="at" onkeydown={keys}>
  <GamePanel {title} role="alertdialog" modal width={width ?? win.w} bind:panel>
    <div class="body">
      {#if text}<p>{text}</p>{/if}
      {@render children?.()}
    </div>
    {#if buttons.length}
      <footer>
        {#each buttons as b, i (i)}<GameButton label={b.label} gold={b.gold} disabled={b.disabled} onclick={b.onclick} />{/each}
      </footer>
    {/if}
  </GamePanel>
</div>

<style>
  .scrim { position: absolute; width: 1024px; height: 768px; background: rgba(6, 30, 80, .32); }
  .at { position: absolute; left: 0; top: 0; }
  .body { padding: 20px 24px 6px; }
  p { margin: 0; font-size: 14px; line-height: 1.5; text-align: center; color: var(--ink-strong); white-space: pre-wrap; }
  footer { display: flex; justify-content: center; gap: 12px; padding: 14px 20px 20px; }
  footer :global(.mu-btn) { min-width: 104px; }
</style>
