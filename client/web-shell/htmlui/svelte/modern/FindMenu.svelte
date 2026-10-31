<script module>
  // an entry's icon by its words (the game's labels: Search for Single Duels, Search for Match Duels, Display by Level,
  // Display by name, Search for Friends, Proximity Search, Show all)
  const ICON = [[/friend/i, 'friends'], [/proximity|near/i, 'pin'], [/duel/i, 'duel'], [/display/i, 'sort'], [/all/i, 'people']];
  const icon = l => ICON.find(([re]) => re.test(l))?.[1] || 'search';
</script>

<script>
  // The player list's search menu, modern (CFindMenu; logic.js findMenu): a menu rising from the player list, its
  // entries in two groups (what to show, how to order) with icons. Before: seven plain rows on a stripe, half over the
  // list it filters. An entry clicks the game's row. Focus opens on the first entry; Up / Down, Enter, Esc closes (a
  // click on the player list's title bar: the game closes the menu on a click elsewhere and has no key for it).
  import { findMenu } from './logic.js';
  import { pickRow } from './macro.js';
  import Icon from './Icon.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const f = $derived(findMenu(win));
  const api = $derived(view.api);
  const shown = $derived(win.shown);
  let panel;
  $effect(() => {
    if (!shown) return;
    const t = setTimeout(() => panel?.querySelector('.item')?.focus({ preventScroll: true }), 30);
    return () => clearTimeout(t);
  });
  const n = $derived(f.groups.reduce((k, g) => k + g[1].length, 0));
  const pick = i => pickRow(api, win, f.list, f.bar, i, n);
  function close() {
    const bar = globalThis.yo2Html?.snapshot?.().windows.find(w => w.cls === 'CPlayerListDlg' && w.shown)?.controls.find(c => c.shown && !c.parent && /Iconbar$/.test(c.cls));
    if (bar) api.click(bar.id);
  }
  function keys(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    const k = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!k) return;
    e.preventDefault();
    const rows = [...panel.querySelectorAll('.item')];
    rows[Math.max(0, Math.min(rows.length - 1, rows.indexOf(document.activeElement) + k))]?.focus();
  }
  // keys on the plate itself (the bridge stops a key at the window root, where Svelte's delegated onkeydown would be)
  const keyed = el => { el.addEventListener('keydown', keys); return () => el.removeEventListener('keydown', keys); };
</script>

<div class="mu">
  <!-- the game opens it over the player list's top; it rises above the list instead, beside its search button -->
  <nav class="mu-plate menu" aria-label="Find players" style:width="{win.w}px" style:bottom="{win.h + 16}px" bind:this={panel} {@attach keyed}>
    {#each f.groups as [name, items] (name)}
      <p class="group">{name}</p>
      {#each items as e (e.i)}
        <button type="button" class="item" class:on={f.list.selected === e.i} onclick={() => pick(e.i)}><Icon name={icon(e.label)} size={16} />{e.label}</button>
      {/each}
    {/each}
  </nav>
</div>

<style>
  .menu { left: 0; display: flex; flex-direction: column; gap: 1px; padding: 6px; border-radius: var(--r-plate) var(--r-plate) var(--r-plate) 4px; }
  .group { margin: 4px 8px 2px; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3); }
  .group:not(:first-child) { margin-top: 8px; padding-top: 8px; box-shadow: inset 0 1px 0 var(--n200); }
  .item { display: flex; align-items: center; gap: 10px; height: 30px; padding: 0 10px; border-radius: var(--r-row); font-weight: 650; color: var(--ink-strong);
    transition: background .12s, box-shadow .12s; }
  .item :global(.mu-ico) { color: var(--icon); }
  .item:hover, .item:focus-visible { background: var(--p50); box-shadow: inset 0 0 0 1px var(--gold-edge); }
  .item:focus { outline: none; }
  .item.on { color: var(--gold-ink); background: var(--gold); }
</style>
