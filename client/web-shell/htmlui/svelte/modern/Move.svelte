<script module>
  // the last list seen from each place (the scene and the place banner's name): a reopening shows it at once while the
  // game asks the server again ("Connecting to server...", 1 to 1.5 s), counts dimmed until the fresh ones arrive
  const seen = new Map();
  const where = () => {
    const s = globalThis.yo2Html?.snapshot?.();
    const p = s?.windows.find(w => w.cls === 'CWindowModelPlace' && w.shown)?.controls.find(c => c.shown && !c.parent && c.text);
    return `${s?.scene}|${p?.text ?? ''}`;
  };
</script>

<script>
  // The Move window, modern (CWindowModelMove, the bar's door; logic.js moveWindow): "Where to?" and every place at
  // once, each with its name and how full it is (the game's "(n/cap)"), the ×. The game itself shows six places at a
  // time behind a scroll bar ("scroll for 3 more": the owner found it unintuitive and the six rows jumpy, their labels
  // changing under the pointer as the list moved). So the window reads the whole list first: it steps the game's own
  // list through every position (the engine's window is hidden behind this one) and keeps each place by its index; a
  // click scrolls the game's list to that place when it is out of its six, then presses the game's own button. Counts
  // refresh from whatever the game shows. Up to six places: one column; more: two. No movement on hover, only colour.
  // The plate shows once, complete: not during the game's "Connecting to server..." placeholder nor while the rest of
  // the list is read (a one-row plate jumping to the grid, tiles reading "…"), at most 0.7 s after the window opens;
  // a place opened before shows its last list at once (`seen`), its tiles waiting for the fresh list to take a click.
  // The game keeps the window between openings (hidden), so every opening starts its reading anew.
  // Keys: focus opens on the first place; the arrows move through the grid, Enter goes, Esc closes.
  import { moveWindow } from './logic.js';
  import { focusSoon } from './macro.js';
  import Icon from './Icon.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const m = $derived(moveWindow(win));
  const api = $derived(view.api);
  const shown = $derived(win.shown);
  const top = () => moveWindow(view.win).bar?.value || 0;
  const frames = n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); });
  // until the game's list shows position v (or ~1 s)
  async function at(v) {
    for (let k = 0; k < 60 && top() !== v; k++) await frames(1);
    await frames(2);
  }

  let all = $state([]);   // index -> { name, here, cap }, this opening
  let scanned = $state(false), scanning = $state(false), late = $state(false), cached = $state(null), key = '';
  $effect(() => {
    if (!shown) return;
    key = where();
    all = []; scanned = false; scanning = false; late = false;
    cached = seen.get(key) || null;
    const t = setTimeout(() => late = true, 700);
    return () => { clearTimeout(t); if (all.length) seen.set(key, all.map(p => p && { ...p })); };
  });
  // the game shows six at a time: a list of six may have more behind its bar, which shows a frame or two later
  const fresh = $derived(!m.loading && m.places.length > 0 && !scanning && (m.places.length < 6 || scanned));
  const ready = $derived(fresh || late || !!cached);
  // the places the game shows now, by index (its list's position + their order top to bottom)
  $effect(() => {
    if (!shown || m.loading) return;
    const v = m.bar?.value || 0;
    m.places.forEach((p, k) => { const i = v + k, o = all[i]; if (!o || o.name !== p.name || o.here !== p.here) all[i] = { name: p.name, here: p.here, cap: p.cap }; });
  });
  // once per opening: the rest of the list, read by stepping the game's list through it and back
  // (only once the game shows its scroll bar: a window still opening reads with none)
  $effect(() => {
    const bar = m.bar, max = bar?.max || 0;
    if (!shown || scanned || !m.places.length || !bar || max <= 0) return;
    scanned = true;
    scanning = true;
    (async () => {
      const start = bar.value || 0;
      for (let v = 0; v <= max; v++) {
        if (top() !== v) { api.setValue(bar.id, v); await at(v); }
        moveWindow(view.win).places.forEach((p, k) => { all[v + k] = { name: p.name, here: p.here, cap: p.cap }; });
      }
      if (top() !== start) api.setValue(bar.id, start);
      scanning = false;
    })();
  });
  const stale = $derived(!fresh && !!cached);
  const count = $derived(stale ? cached.length : Math.max(all.length, (m.bar?.max || 0) + m.places.length));
  const list = $derived(Array.from({ length: count }, (_, i) => (stale ? cached[i] : all[i]) || null));
  const wide = $derived(count > 6);

  let going = false;
  async function go(i) {
    if (going || !fresh) return;
    going = true;
    try {
      const bar = m.bar, rows = m.places.length || 6;
      let v = top();
      if (bar && (i < v || i >= v + rows)) {
        v = Math.min(i, bar.max || 0);
        api.setValue(bar.id, v);
        await at(v);
      }
      const b = moveWindow(view.win).places[i - v];
      if (b) await api.click(b.c.id);
    } finally { going = false; }
  }

  let panel;
  $effect(() => shown && ready ? focusSoon(panel, '.place') : undefined);
  const fill = p => p?.cap ? Math.min(1, +p.here / +p.cap) : 0;
  function keys(e) {
    if (e.key === 'Escape' && m.close) { e.preventDefault(); api.click(m.close.id); return; }
    const cols = wide ? 2 : 1;
    const k = { ArrowDown: cols, ArrowUp: -cols, ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!k) return;
    e.preventDefault();
    const tiles = [...panel.querySelectorAll('.place')], i = tiles.indexOf(document.activeElement);
    tiles[Math.max(0, Math.min(tiles.length - 1, i + k))]?.focus();
  }
  // keys on the plate itself (the bridge stops a key at the window root, where Svelte's delegated onkeydown would be)
  const keyed = el => { el.addEventListener('keydown', keys); return () => el.removeEventListener('keydown', keys); };
</script>

<div class="mu">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="mu-plate panel" class:wide class:pending={!ready} class:stale aria-busy={!fresh} role="dialog" aria-label="Where to?" bind:this={panel} {@attach keyed}>
    <header class="mu-head">
      <Icon name="pin" class="lead" /><h2>Where to?</h2>
      {#if m.close}<button type="button" class="mu-icon-btn" aria-label="Close" onclick={() => api.click(m.close.id)}><Icon name="close" /></button>{/if}
    </header>
    <ul class="grid">
      {#each list as p, i (i)}
        <li><button type="button" class="place" disabled={!p} onclick={() => go(i)} aria-label={p ? `${p.name}${p.cap ? `, ${+p.here} of ${p.cap}` : ''}` : 'Loading'}>
          <span class="nm">{p?.name ?? '…'}</span>
          <span class="meta">
            {#if p?.cap}
              <span class="meter" class:full={+p.here >= +p.cap} aria-hidden="true"><i style:width="{fill(p) * 100}%"></i></span>
              <span class="count" class:full={+p.here >= +p.cap}>{+p.here} / {p.cap}</span>
            {/if}
          </span>
          <Icon name="chevron" size={16} class="go" />
        </button></li>
      {:else}
        <li class="empty">Nowhere to go from here.</li>
      {/each}
    </ul>
  </section>
</div>

<style>
  /* rising from the window's foot: the bar's door opens it over the dock */
  .panel { left: 0; bottom: 0; width: 372px; padding-bottom: 12px; }
  .panel.wide { width: 560px; }
  .panel.pending { visibility: hidden; }
  .stale .meta { opacity: .45; }   /* last time's counts, until the game's fresh ones */
  .stale .place { cursor: progress; }
  .panel :global(.lead) { color: var(--gold-300); }
  .grid { list-style: none; margin: 0; padding: 10px 12px 0; display: grid; grid-template-columns: 1fr; gap: 6px; }
  .wide .grid { grid-template-columns: 1fr 1fr; }
  /* a tile: the name on top, how full under it; a fixed size, and hover / press change only colour (nothing moves) */
  .place { display: grid; grid-template-columns: 1fr auto; grid-template-rows: 22px 15px; align-items: center; column-gap: 8px;
    width: 100%; height: 52px; padding: 0 10px 0 14px; border-radius: var(--r-ctl); text-align: left; color: var(--ink-strong);
    background: var(--btn); box-shadow: 0 0 0 1px var(--btn-edge), inset 0 1px 0 #fff, 0 1px 2px rgba(10, 35, 80, .12);
    transition: background .12s, box-shadow .12s; }
  .place:hover, .place:focus-visible { background: var(--btn-hover); box-shadow: 0 0 0 2px var(--gold-edge), inset 0 1px 0 #fff; }
  .place:focus { outline: none; }
  .place:active { background: var(--gold); box-shadow: 0 0 0 2px var(--gold-edge), inset 0 1px 3px rgba(120, 70, 0, .3); }
  .place:disabled { opacity: .55; }
  .nm { grid-column: 1; grid-row: 1; min-width: 0; font-weight: 700; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { grid-column: 1; grid-row: 2; display: flex; align-items: center; gap: 6px; height: 14px; }
  .place :global(.go) { grid-column: 2; grid-row: 1 / span 2; color: var(--icon-warm); }
  .meter { width: 48px; height: 5px; border-radius: 1px; background: #9bc3db; overflow: hidden; }
  .meter i { display: block; height: 100%; background: var(--ok); }
  .meter.full i { background: var(--bad); }
  .count { min-width: 56px; font-size: 11px; font-weight: 700; color: var(--ink-3); font-variant-numeric: tabular-nums; }
  .count.full { color: var(--bad); }
  .empty { padding: 10px; color: var(--ink-3); }
</style>
