<script>
  // Only the scene's original Menu/Duel/Move entry controls remain here.
  // Other actions live in the Main Menu; the world needs no duplicated shortcut taskbar.
  import Icon from './Icon.svelte';
  import { waitFor } from './macro.js';
  let { view } = $props();
  const win = $derived(view.win);
  const icons = $derived(win.controls.filter(c => c.cls === 'CWindowTaskPictureSwitch' && c.shown).sort((a, b) => a.x - b.x));
  const NAMES = [['MENU_DUEL', 'Duel', 'duel'], ['MENU_MOVE', 'Move', 'pin'], ['MENU', 'Menu', 'menu']];
  const named = c => (NAMES.find(([k]) => c.name?.includes(k)) || NAMES[2]).slice(1);
  const searching = $derived(win.controls.some(c => c.cls === 'CNoticeIconDuelroom' && c.shown));
  const duelSwitch = $derived(icons.find(c => c.name?.includes('MENU_DUEL')));
  // Keep the native request pending until its Move window arrives, preventing duplicate requests.
  let moving = $state(false);
  async function press(c, label) {
    if (label !== 'Move') return view.api.click(c.id);
    if (moving) return;
    moving = true;
    try {
      await view.api.click(c.id);
      await waitFor(s => s.windows.some(w => w.cls === 'CWindowModelMove' && w.shown), 6000);
    } finally { moving = false; }
  }
</script>

<div class="mu">
  {#if icons.length}
    <nav class="controls" aria-label="World controls">
      {#each icons as c (c.id)}
        {@const [label, icon] = named(c)}
        {#if searching && c === duelSwitch}
          <button type="button" class="seek" title="Your duel is open (Auto Duel or Create Duel): cancel it" data-state={c.state} onclick={() => view.api.click(c.id)}>
            <i aria-hidden="true"></i>Awaiting duel<span aria-label="Cancel"><Icon name="close" size={11} /></span>
          </button>
        {:else}
          <button type="button" class="mu-btn menu" class:gold={label === 'Menu'} class:busy={label === 'Move' && moving} aria-busy={label === 'Move' && moving}
            data-state={c.state} onclick={() => press(c, label)}>
            <Icon name={icon} size={16} /><span>{label}</span>
          </button>
        {/if}
      {/each}
    </nav>
  {/if}
</div>

<style>
  .controls { position:absolute; left:12px; top:0; display:inline-flex; align-items:center; gap:6px; width:max-content; max-width:calc(100% - 24px); height:28px; }
  .menu { flex:none; height:26px; padding:0 10px; font-size:13px; border-radius:3px; gap:6px; white-space:nowrap; }
  .menu:not(.gold) { background:var(--btn); color:var(--ink-strong); text-shadow:0 1px #ecffff; }
  .menu.busy { cursor:progress; box-shadow:inset 0 2px 3px #16578f55; }
  .menu.busy :global(.mu-ico) { animation:busy .9s ease-in-out infinite; }
  @keyframes busy { 50% { opacity:.4; } }
  .seek { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 6px; border:1px solid var(--gold-edge); border-radius:3px; font-size:13px; font-weight:700; color:var(--gold-ink); background:var(--gold); white-space:nowrap; }
  .seek i { width:7px; height:7px; border-radius:50%; background:var(--ok); }
  .seek span { display:grid; place-items:center; width:16px; height:16px; border:1px solid #b38a2b; background:#fff4b4; }
  .seek:hover span { color:#fff; background:var(--bad); }
  @media(prefers-reduced-motion:reduce) { .menu.busy :global(.mu-ico) { animation:none; } }
</style>
