<script>
  // The menu bar, modern (CWindowModelMenu + CWindowTaskMenubar): the command dock along the bottom.
  // - The scene's own picture switches (Menu; in lobbies Duel and Move) as labelled buttons, clicking the engine's.
  // - Quick actions (macro.js): one click to the Main Menu's most used entries (Deck, Profile, Friends, Mail, Duel Log,
  //   Options, Audio): the engine's menu opened and its button pressed, the menu kept out of sight. Each has a key
  //   (D P F M L O A), and Enter goes to the chat line; never while typing, nor while a game field has the focus.
  // - The engine's message text as the dock's status line.
  // - While an Auto Duel search runs (the game shows its CNoticeIconDuelroom then, a small icon with no words): a
  //   the Duel switch becomes a "Searching… Cancel" chip; it plays that switch, which asks the game's own "Cancel the Duel you created?".
  // The window is 384 wide at the bottom left; the dock spans the screen (clip: false).
  import Icon from './Icon.svelte';
  import { menu, QUICK, quickKey, menuSwitch } from './macro.js';
  import { openGeneric } from './Generic.svelte';
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
      // Enter is a generic window's while one is up (its primary: UX spec 1)
      if (e.key === 'Enter' && openGeneric.size) return;
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
      {#if searching && c === duelSwitch}
        <!-- a search running: the Duel switch says so (it is the way to cancel it) -->
        <button type="button" class="seek" title="Looking for a duel: cancel the search" data-state={c.state} onclick={() => view.api.click(c.id)}>
          <i aria-hidden="true"></i>Searching…<span aria-label="Cancel"><Icon name="close" size={11} /></span>
        </button>
      {:else}
        <button type="button" class="mu-btn menu" class:gold={label === 'Menu'} data-state={c.state} onclick={() => view.api.click(c.id)}>
          <Icon name={icon} size={16} /><span>{label}</span>
        </button>
      {/if}
    {/each}
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
    <!-- the status line only with a message: an empty one took the room a search chip needs -->
    <output class="status" class:empty={!msg} aria-live="polite">{msg}</output>
  </nav>
  {/if}
</div>

<style>
  /* the game's HUD bar: dark brushed blue under a gold hairline, the switches and quick actions as keycaps on it */
  .dock { position: absolute; left: 0; top: 0; width: 1024px; height: 32px; display: flex; align-items: center; gap: 6px; padding: 0 8px 0 6px;
    background: linear-gradient(180deg, rgba(255, 255, 255, .18), rgba(255, 255, 255, 0) 40%), linear-gradient(180deg, #2a66c2 0%, #1b4d9e 60%, #163f85 100%);
    box-shadow: inset 0 2px 0 var(--gold-400), inset 0 3px 0 rgba(255, 255, 255, .25), 0 -6px 16px -10px rgba(4, 18, 50, .6); }
  .menu { height: 24px; padding: 0 12px 0 9px; font-size: 12.5px; border-radius: 6px; gap: 6px; }
  .menu:not(.gold) { color: #fff; text-shadow: 0 1px 0 rgba(0, 20, 60, .5); background: linear-gradient(180deg, #4f8ee0, #2a62b8);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .4), 0 0 0 1px #10306a, 0 2px 0 #0d2a5c; }
  .menu.gold { box-shadow: inset 0 1px 0 #fffbe8, 0 0 0 1px var(--gold-edge), 0 2px 0 var(--lip-gold); }
  .status.empty { padding: 0; visibility: hidden; }
  .menu, .seek, .q { flex: none; white-space: nowrap; }   /* the status field gives way, never a key */
  .seek { display: inline-flex; align-items: center; gap: 7px; height: 24px; padding: 0 3px 0 9px; border-radius: 12px; font-size: 12px; font-weight: 700;
    color: var(--gold-ink); background: var(--gold); box-shadow: 0 0 0 1px var(--gold-edge), 0 2px 0 var(--lip-gold); white-space: nowrap; }
  .seek i { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); animation: seek 1.2s ease-in-out infinite; }
  .seek span { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; color: #fff; background: rgba(60, 35, 0, .35); }
  .seek:hover span { background: var(--bad); }
  @keyframes seek { 50% { opacity: .25; transform: scale(.7); } }
  .sep { width: 2px; height: 18px; margin: 0 2px; background: linear-gradient(90deg, rgba(0, 10, 40, .4) 50%, rgba(255, 255, 255, .25) 50%); }
  .quick { display: flex; gap: 3px; }
  .q { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 7px 0 6px; border-radius: 6px; font-size: 12px; font-weight: 700;
    color: #fff; text-shadow: 0 1px 0 rgba(0, 20, 60, .5); background: linear-gradient(180deg, rgba(255, 255, 255, .12), rgba(255, 255, 255, .03));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .22), 0 0 0 1px rgba(5, 25, 70, .55), 0 2px 0 rgba(5, 25, 70, .55);
    transition: transform .07s ease-out, box-shadow .07s, background .14s; }
  .q :global(.mu-ico) { color: rgba(255, 255, 255, .88); }
  .q:hover, .q:focus-visible { background: linear-gradient(180deg, rgba(255, 255, 255, .26), rgba(255, 255, 255, .08));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .35), 0 0 0 1px rgba(255, 220, 120, .6), 0 2px 0 rgba(5, 25, 70, .55), 0 0 10px rgba(120, 190, 255, .55); }
  .q:active { transform: translateY(2px); box-shadow: inset 0 1px 2px rgba(0, 10, 40, .4), 0 0 0 1px rgba(5, 25, 70, .55); }
  .q.busy { background: rgba(255, 229, 138, .3); box-shadow: inset 0 0 0 1px var(--gold-300), 0 2px 0 rgba(5, 25, 70, .55); }
  kbd { min-width: 15px; height: 15px; padding: 0 3px; border-radius: 3px; font-family: inherit; font-weight: 800; font-size: 9.5px; line-height: 15px;
    text-align: center; color: var(--gold-ink); text-shadow: none; background: linear-gradient(180deg, #fff3c0, #f0c24a); box-shadow: 0 1px 0 #8a5a0a; }
  .status { flex: 1; min-width: 0; height: 22px; line-height: 22px; padding: 0 12px; border-radius: 5px; font-size: 12.5px; color: #e9f3ff;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: rgba(4, 18, 50, .45); box-shadow: inset 0 2px 3px rgba(0, 0, 0, .35), 0 1px 0 rgba(255, 255, 255, .15); }
</style>
