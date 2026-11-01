<script module>
  // The lobby's player list, modern (CPlayerListDlg, a CWindowModelInformation: an ActiveListbox of who is here, its
  // search switch '検索ボタン', taller / shorter). Every name is a button: clicking it clicks that row of the engine's list
  // (its row in view first: the list's scroll bar set to it), as a player's click on the row would.
  // Two sizes only (the owner: the game's three-stage taller / shorter was weird): small (the game's 128) and minimised
  // (its 32). The game's buttons step a cycle 128 -> 560 -> 32 -> 128; one toggle here steps it to the size asked for
  // (through 560 when it must), drawn at that size all along so nothing jumps, and a list left expanded (by Legacy UI)
  // comes back to small.
  export function parts(win) {
    const cs = win.controls, list = cs.find(c => /Listbox$/.test(c.cls) && !c.parent);
    return {
      list,
      bar: list && cs.find(c => c.parent === list.id && /Scroll$/.test(c.cls)),
      search: cs.find(c => c.name === '検索ボタン' && c.shown),
      // the size button the game takes now (of its two, the enabled one: both step the same cycle)
      step: cs.find(c => /CWindowTaskIcon(Expand|Hide)$/.test(c.cls) && c.shown && c.enabled !== false),
      title: cs.find(c => c.cls === 'CWindowTaskIconbar')?.label || '',
    };
  }
</script>

<script>
  import Icon from './Icon.svelte';
  import { rowPoint, listItems } from './logic.js';
  let { view } = $props();
  const win = $derived(view.win);
  const p = $derived(parts(win));
  const names = $derived(listItems(p.list));
  const api = $derived(view.api);
  const frames = n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); });
  const SMALL = 128, MIN = 32;
  const AT = { [SMALL]: 608, [MIN]: 712 };   // where the game puts each size (its minimised bar sits 8 px lower than the list's foot)
  let want = $state(null);   // the size being stepped to, drawn meanwhile
  const minimised = $derived((want ?? (win.h <= 40 ? MIN : SMALL)) === MIN);
  const h = $derived(minimised ? MIN : SMALL);
  let stepping = false;
  async function sizeTo(target) {
    if (stepping) return;
    stepping = true;
    want = target;
    try {
      for (let k = 0; k < 4 && Math.abs(view.win.h - target) > 8; k++) {
        const b = parts(view.win).step;
        if (!b) break;
        await api.click(b.id);
        for (let f = 0; f < 30 && parts(view.win).step?.id === b.id && Math.abs(view.win.h - target) > 8; f++) await frames(1);
        await frames(2);
      }
    } finally { stepping = false; want = null; }
  }
  // left expanded (Legacy UI's third size): back to small, once the window shows a button to step with (a window still
  // opening has none: tried again half a second later until it is back)
  let retry = $state(0);
  $effect(() => {
    retry;
    if (!(win.h > 200 && win.shown && p.step) || stepping) return;
    sizeTo(SMALL).then(() => { if (view.win.h > 200) setTimeout(() => retry++, 500); });
  });
  async function pick(i) {
    const l = p.list, rows = Math.max(1, l.rows || 6);
    let top = l.top || 0;
    if ((i < top || i >= top + rows) && p.bar) { top = Math.min(i, Math.max(0, names.length - rows)); api.setValue(p.bar.id, top); await frames(3); }
    api.click(l.id, rowPoint(win, l, i, top));
  }
</script>

<div class="mu">
  <!-- drawn where the game puts the size shown (the game's own window may be stepping through 560 meanwhile) -->
  <section class="mu-plate players" class:min={minimised} style:width="{win.w}px" style:height="{h}px" style:top="{AT[h] - win.y}px" aria-label="Players here">
    <header>
      <Icon name="people" size={16} class="lead" />
      <h2>Players <span class="n">{names.length}</span></h2>
      {#if p.search && !minimised}<button type="button" class="mu-icon-btn" aria-label="Find a player" title="Find a player" onclick={() => api.click(p.search.id)}><Icon name="search" size={16} /></button>{/if}
      {#if p.step}<button type="button" class="mu-icon-btn" aria-label={minimised ? 'Show the player list' : 'Minimise the player list'} aria-expanded={!minimised}
        title={minimised ? 'Show' : 'Minimise'} onclick={() => sizeTo(minimised ? SMALL : MIN)}>
        <svg class="mu-ico" viewBox="0 0 20 20"><path d={minimised ? 'M5 12.5 10 7.5l5 5' : 'M5 7.5 10 12.5l5-5'} /></svg></button>{/if}
    </header>
    {#if !minimised}<ul class="list mu-scroll">
      {#each names as n, i (i)}
        <li><button type="button" class:on={p.list.selected === i} onclick={() => pick(i)}><span class="dot" aria-hidden="true"></span>{n}</button></li>
      {:else}
        <li class="empty">Just you here for now.</li>
      {/each}
    </ul>{/if}
  </section>
</div>

<style>
  .players { left: 0; display: flex; flex-direction: column; border-radius: 16px 16px 16px 6px; animation: none; }
  header { display: flex; align-items: center; gap: 6px; height: 30px; padding: 4px 4px 0 12px; flex: none; }
  header :global(.lead) { color: var(--icon); }
  h2 { flex: 1; margin: 0; font-size: 12.5px; font-weight: 750; color: var(--ink-strong); }
  .n { margin-left: 4px; font-weight: 700; color: var(--azure-500); }
  header .mu-icon-btn { width: 28px; height: 24px; }
  .players.min header { padding-top: 1px; }
  .list { flex: 1; min-height: 0; list-style: none; margin: 2px 6px 6px; padding: 3px; border-radius: 8px;
    background: var(--well); box-shadow: var(--well-shadow); }
  .list button { display: flex; align-items: center; gap: 8px; width: 100%; height: 24px; padding: 0 8px; border-radius: 6px; font-size: 12.5px;
    font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: background .12s; }
  .list button:hover { background: var(--p50); }
  .list button.on { background: var(--sel); color: #fff; }
  .dot { width: 6px; height: 6px; border-radius: 50%; flex: none; background: #4ce38a; box-shadow: 0 0 6px rgba(76, 227, 138, .8); }
  .empty { padding: 6px 8px; font-size: 12px; color: var(--ink-3); }
</style>
