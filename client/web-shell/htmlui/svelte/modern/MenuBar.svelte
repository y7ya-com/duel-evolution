<script>
  // The menu bar, modern (CWindowModelMenu + CWindowTaskMenubar): the command dock along the bottom.
  // - The scene's own picture switches (Menu; in lobbies Duel and Move) as labelled buttons, clicking the engine's.
  // - Quick actions (macro.js): one click to the Main Menu's most used entries (Deck, Profile, Friends, Mail, Duel Log,
  //   Options, Audio): the engine's menu opened and its button pressed, the menu kept out of sight. Each has a key
  //   (D P F M L O A), and Enter goes to the chat line; never while typing, nor while a game field has the focus.
  // - The engine's message text as the dock's status line.
  // - While an Auto Duel search runs (the game shows its CNoticeIconDuelroom then, a small icon with no words): a
  //   "Looking for a duel" chip; it plays the Duel switch, which asks the game's own "Cancel the Duel you created?".
  // The window is 384 wide at the bottom left; the dock spans the screen (clip: false).
  import Icon from './Icon.svelte';
  import { menu, QUICK, quickKey, menuSwitch } from './macro.js';
  let { view } = $props();
  const win = $derived(view.win);
  const icons = $derived(win.controls.filter(c => c.cls === 'CWindowTaskPictureSwitch' && c.shown).sort((a, b) => a.x - b.x));
  const msg = $derived(win.controls.find(c => c.cls === 'CWindowTaskText' && !c.parent && c.shown)?.text
    || win.controls.find(c => c.cls === 'CWindowTaskMenubar')?.message || '');
  // the switches by instance name (CWindowModelMenu's MENUBAR_MENU_* buttons: My Room has the first only)
  const NAMES = [['MENU_DUEL', 'Duel', 'duel'], ['MENU_MOVE', 'Move', 'pin'], ['MENU', 'Menu', 'menu']];
  const named = c => (NAMES.find(([k]) => c.name?.includes(k)) || NAMES[2]).slice(1);
  const searching = $derived(win.controls.some(c => c.cls === 'CNoticeIconDuelroom' && c.shown));
  const duelSwitch = $derived(icons.find(c => c.name?.includes('MENU_DUEL')));
  // quick actions only where the scene has the Main Menu
  const quick = $derived(!!menuSwitch({ windows: [win] }));
  let pending = $state('');
  async function run(q) {
    pending = q[0];
    await menu(view.api, q[1]);
    pending = '';
  }
  $effect(() => {
    if (!quick) return;
    const key = e => {
      // a game field being typed into: one in a window whose input is the game's (the engine's own, or a pass-mode modern
      // one: the generic windows). An owned modern window's fields are DOM: the chat's line keeps the game's focus after
      // Enter, which must not eat the keys
      const snap = globalThis.yo2Html?.snapshot?.(), f = snap?.focus;
      const owner = f && snap.windows.find(w => w.controls.some(c => c.id === f));
      if (f && globalThis.yo2Html?.modernScreens?.get(owner?.cls)?.mode !== 'owned') return;
      if (e.key === 'Enter' && !/^(INPUT|TEXTAREA|BUTTON)$/.test(e.target?.tagName || '')) {
        const line = document.querySelector('.mu .composer input');
        if (line) { e.preventDefault(); e.stopPropagation(); line.focus(); }
        return;
      }
      const q = quickKey(e);
      if (!q) return;
      e.preventDefault();
      e.stopPropagation();   // not the game's too (SDL listens on window, bubbling)
      run(q);
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  });
</script>

<div class="mu">
  {#if icons.length || msg}
  <nav class="dock" aria-label="Menu bar">
    {#each icons as c (c.id)}
      {@const [label, icon] = named(c)}
      <button type="button" class="mu-btn menu" class:gold={label === 'Menu'} data-state={c.state} onclick={() => view.api.click(c.id)}>
        <Icon name={icon} size={16} /><span>{label}</span>
      </button>
    {/each}
    {#if searching}
      <button type="button" class="seek" title="Cancel the search" onclick={() => duelSwitch && view.api.click(duelSwitch.id)}>
        <i aria-hidden="true"></i>Looking for a duel…<span>Cancel</span>
      </button>
    {/if}
    {#if quick}
      <span class="sep" aria-hidden="true"></span>
      <div class="quick" role="toolbar" aria-label="Quick actions">
        {#each QUICK as q (q[0])}
          <button type="button" class="q" class:busy={pending === q[0]} title="{q[0]} ({q[3]})" aria-keyshortcuts={q[3]} onclick={() => run(q)}>
            <Icon name={q[2]} size={15} /><span>{q[0]}</span><kbd>{q[3]}</kbd>
          </button>
        {/each}
      </div>
    {/if}
    <output class="status" aria-live="polite">{msg}</output>
  </nav>
  {/if}
</div>

<style>
  .dock { position: absolute; left: 0; top: 0; width: 1024px; height: 32px; display: flex; align-items: center; gap: 6px; padding: 0 8px 0 6px;
    background: var(--dock); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .3), 0 -1px 0 var(--band-edge), 0 -6px 16px -10px rgba(10, 35, 80, .5); }
  .menu { height: 24px; padding: 0 12px 0 9px; font-size: 12.5px; border-radius: 8px; gap: 6px; }
  .menu:not(.gold) { background: rgba(255, 255, 255, .14); color: #fff; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .3); }
  .menu:not(.gold):hover { background: rgba(255, 255, 255, .24); }
  .seek { display: inline-flex; align-items: center; gap: 7px; height: 24px; padding: 0 4px 0 10px; border-radius: 12px; font-size: 12px; font-weight: 700;
    color: var(--gold-ink); background: var(--gold); box-shadow: 0 0 0 1px var(--gold-edge); white-space: nowrap; }
  .seek i { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); animation: seek 1.2s ease-in-out infinite; }
  .seek span { height: 18px; padding: 0 8px; border-radius: 9px; line-height: 18px; font-size: 11px; color: #fff; background: rgba(60, 35, 0, .35); }
  .seek:hover span { background: var(--bad); }
  @keyframes seek { 50% { opacity: .25; transform: scale(.7); } }
  .sep { width: 1px; height: 18px; margin: 0 2px; background: rgba(255, 255, 255, .3); }
  .quick { display: flex; gap: 2px; }
  .q { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 7px 0 6px; border-radius: 7px; font-size: 12px; font-weight: 600;
    color: #fff; transition: background .12s, box-shadow .12s, transform .12s; }
  .q :global(.mu-ico) { color: rgba(255, 255, 255, .85); }
  .q:hover, .q:focus-visible { background: rgba(255, 255, 255, .16); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .3); transform: translateY(-1px); }
  .q.busy { background: rgba(255, 229, 138, .3); box-shadow: inset 0 0 0 1px var(--gold-300); }
  kbd { min-width: 15px; height: 15px; padding: 0 3px; border-radius: 4px; font-family: inherit; font-weight: 700; font-size: 9.5px; line-height: 15px;
    text-align: center; color: #fff; background: rgba(255, 255, 255, .18); box-shadow: inset 0 -1px 0 rgba(0, 20, 60, .25); }
  .status { flex: 1; min-width: 0; height: 22px; line-height: 22px; padding: 0 12px; border-radius: 7px; font-size: 12.5px; color: var(--ink-strong);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: var(--dock-field); box-shadow: inset 0 1px 2px rgba(10, 35, 80, .2); }
</style>
