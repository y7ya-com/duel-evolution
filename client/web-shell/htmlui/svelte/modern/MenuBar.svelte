<script>
  // The menu bar, modern (CWindowModelMenu + CWindowTaskMenubar): the dock along the bottom. Its picture switches (the
  // Main Menu's, and any other the scene shows) are labelled buttons that click the engine's own; its message text is
  // the dock's status line. The window is 384 wide at the bottom left; the dock spans the screen (clip: false).
  import Icon from './Icon.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const icons = $derived(win.controls.filter(c => c.cls === 'CWindowTaskPictureSwitch' && c.shown).sort((a, b) => a.x - b.x));
  const msg = $derived(win.controls.find(c => c.cls === 'CWindowTaskText' && !c.parent && c.shown)?.text
    || win.controls.find(c => c.cls === 'CWindowTaskMenubar')?.message || '');
  // the switches by instance name (CWindowModelMenu's MENUBAR_MENU_* buttons: My Room has the first only)
  const NAMES = [['MENU_DUEL', 'Duel', 'duel'], ['MENU_MOVE', 'Move', 'pin'], ['MENU', 'Menu', 'menu']];
  const named = c => (NAMES.find(([k]) => c.name?.includes(k)) || NAMES[2]).slice(1);
</script>

<div class="mu">
  <nav class="dock" aria-label="Menu bar">
    {#each icons as c (c.id)}
      {@const [label, icon] = named(c)}
      <button type="button" class="mu-btn menu" class:gold={label === 'Menu'} data-state={c.state} onclick={() => view.api.click(c.id)} aria-label={label}>
        <Icon name={icon} size={16} /><span>{label}</span>
      </button>
    {/each}
    <output class="status" aria-live="polite">{msg}</output>
  </nav>
</div>

<style>
  .dock { position: absolute; left: 0; top: 0; width: 1024px; height: 32px; display: flex; align-items: center; gap: 10px; padding: 0 8px 0 6px;
    background: linear-gradient(180deg, rgba(255, 255, 255, .12), rgba(255, 255, 255, 0) 50%),
      linear-gradient(90deg, #0e3d8f 0%, #0a2a66 45%, #082052 100%);
    box-shadow: 0 -1px 0 rgba(4, 17, 43, .9), inset 0 1px 0 rgba(117, 255, 255, .55), 0 -8px 20px -10px rgba(2, 10, 30, .6); }
  .dock::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1px;
    background: linear-gradient(90deg, var(--cyan), rgba(117, 255, 255, .2) 60%, rgba(117, 255, 255, .05)); }
  .menu { height: 24px; padding: 0 12px 0 9px; font-size: 12.5px; border-radius: 8px 8px 8px 3px; gap: 6px; }
  .status { flex: 1; min-width: 0; height: 22px; line-height: 22px; padding: 0 12px; border-radius: 7px; font-size: 12.5px; color: var(--ink);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    background: rgba(4, 17, 43, .55); box-shadow: inset 0 1px 2px rgba(0, 0, 0, .45), inset 0 0 0 1px rgba(150, 205, 255, .16); }
</style>
