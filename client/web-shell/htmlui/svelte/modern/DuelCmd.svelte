<script>
  // A duel command menu (logic.js duelCmd: Summon / Set, Activate, Attack ...; owner: "I can pick between set and normal
  // summon, it's so buggy and weird"): a compact translucent panel where the engine put its list (by the card), one
  // real button per option the engine offers. A press is the engine's own choice: its row clicked at the row's centre
  // (the pointer first over the list: the engine ignores a press where its mouse already rests), once.
  let { m, win, api } = $props();
  let busy = $state(false), panel = $state();
  const dismiss = () => { globalThis.__yo2ModernCardSelection = 0; dispatchEvent(new CustomEvent('yo2-card-actions', { detail: 0 })); };
  const cardName = $derived(globalThis.yo2Deck?.card(win.commandCard)?.name || 'Card actions');
  const menuKey = $derived(m.options.map(o => o.label).join('|'));
  const visible = $derived(win.shown);
  $effect(() => { menuKey; if (visible) panel?.querySelector('button')?.focus({ preventScroll: true }); });
  function keys(e) {
    const buttons = [...panel.querySelectorAll('button')], at = buttons.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); buttons[(at + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
    } else if (e.key === 'Escape') { api.key(27); api.key(27, false); }
  }
  async function pick(o) {
    if (busy) return;
    busy = true;
    api.hover(m.list.id);
    try { await api.click(m.list.id, o.gp); dismiss(); } finally { busy = false; }
  }
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="mu-plate cmd" role="menu" aria-label="Card actions" bind:this={panel} onkeydown={keys}>
  <div class="caption">{cardName}<button type="button" class="close" aria-label="Close card actions" onclick={dismiss}>×</button></div>
  {#each m.options as o, i (o.label + i)}
    <button type="button" class="mu-btn opt"  role="menuitem" disabled={busy} onclick={() => pick(o)}>{o.label}</button>
  {/each}
</div>

<style>
  .cmd { left: 0; top: 0; min-width: 178px; display: flex; flex-direction: column; gap: 4px; padding: 8px; pointer-events: auto; }
  .cmd::after { background: var(--plate) !important; }
  .close { float: right; width: 20px; font-size: 16px; margin-left: 6px; }
  .caption { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 2px 6px 6px; font-size: 12px; font-weight: 700; letter-spacing: 0; color: var(--ink-3); text-transform: uppercase; }
  .opt { height: 32px; font-size: 14px; pointer-events: auto; }
</style>
