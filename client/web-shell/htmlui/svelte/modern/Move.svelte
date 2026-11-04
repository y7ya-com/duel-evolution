<script>
  // The Move window, modern (CWindowModelMove, the bar's door; logic.js moveWindow): "Where to?" and a row per place,
  // its name and how full it is (the game's "(n/cap)"), the ×. Before: plain buttons on a green frame, the count
  // squeezed into the caption. The rows are the game's own buttons (a click goes there); past six places the game shows
  // six at a time and its scroll bar: the wheel, or the arrows past either end, scroll it. Keys: focus opens on the
  // first place, Up / Down move, Enter goes, Esc closes.
  import { moveWindow } from './logic.js';
  import { focusSoon } from './macro.js';
  import Icon from './Icon.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const m = $derived(moveWindow(win));
  const api = $derived(view.api);
  const shown = $derived(win.shown);
  let panel;
  $effect(() => shown ? focusSoon(panel, '.place') : undefined);
  const fill = p => p.cap ? Math.min(1, +p.here / +p.cap) : 0;
  const scrollBy = k => { const b = m.bar; if (!b) return false; const v = Math.max(0, Math.min(b.max || 0, (b.value || 0) + k)); if (v === (b.value || 0)) return false; api.setValue(b.id, v); return true; };
  function keys(e) {
    if (e.key === 'Escape' && m.close) { e.preventDefault(); api.click(m.close.id); return; }
    const k = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!k) return;
    e.preventDefault();
    const rows = [...panel.querySelectorAll('.place')], i = rows.indexOf(document.activeElement);
    if (rows[i + k]) rows[i + k].focus();
    else scrollBy(k);   // past the shown six: the game's list moves under the focus
  }
  // keys on the plate itself (the bridge stops a key at the window root, where Svelte's delegated onkeydown would be)
  const keyed = el => { el.addEventListener('keydown', keys); return () => el.removeEventListener('keydown', keys); };
</script>

<div class="mu">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="mu-plate panel" role="dialog" aria-label="Where to?" bind:this={panel} {@attach keyed}
    onwheel={e => { if (scrollBy(Math.sign(e.deltaY))) e.preventDefault(); }}>
    <header class="mu-head">
      <Icon name="pin" class="lead" /><h2>Where to?</h2>
      {#if m.close}<button type="button" class="mu-icon-btn" aria-label="Close" onclick={() => api.click(m.close.id)}><Icon name="close" /></button>{/if}
    </header>
    <ul class="list">
      {#each m.places as p (p.c.id)}
        <li><button type="button" class="place" data-state={p.c.state} disabled={p.c.state === 'disabled'} onclick={() => api.click(p.c.id)}>
          <span class="nm">{p.name}</span>
          {#if p.cap}
            <span class="count" class:full={+p.here >= +p.cap}><span class="meter" aria-hidden="true"><i style:width="{fill(p) * 100}%"></i></span>{+p.here} / {p.cap}</span>
          {/if}
          <Icon name="chevron" size={16} class="go" />
        </button></li>
      {:else}
        <li class="empty">Nowhere to go from here.</li>
      {/each}
    </ul>
    {#if m.bar && m.bar.max > 0}<p class="more">Scroll for {m.bar.max} more</p>{/if}
  </section>
</div>

<style>
  .panel { left: 0; bottom: 0; width: 372px; padding-bottom: 12px; }   /* rising from the window's foot: the bar's door opens it over the dock */
  .panel :global(.lead) { color: var(--gold-300); }
  .list { list-style: none; margin: 0; padding: 10px 12px 0; display: flex; flex-direction: column; gap: 5px; }
  .place { display: flex; align-items: center; gap: 10px; width: 100%; height: 34px; padding: 0 10px 0 14px; border-radius: var(--r-ctl);
    font-weight: 700; color: var(--ink-strong); background: var(--btn); box-shadow: 0 0 0 1px var(--btn-edge), inset 0 1px 0 #fff, 0 1px 2px rgba(10, 35, 80, .12);
    transition: transform .14s var(--ease), box-shadow .14s, background .14s; }
  .place:hover, .place:focus-visible, .place[data-state='hover'] { transform: translateY(-1px); background: var(--btn-hover);
    box-shadow: 0 0 0 1px var(--gold-edge), inset 0 1px 0 #fff, 0 6px 14px -6px rgba(140, 80, 0, .45); }
  .place:active, .place[data-state='pressed'] { transform: translateY(0); background: var(--gold); }
  .place:disabled { opacity: .5; transform: none; }
  .nm { flex: 1; min-width: 0; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .count { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: var(--ink-3); }
  .meter { width: 36px; height: 5px; border-radius: 3px; background: var(--n200); overflow: hidden; }
  .meter i { display: block; height: 100%; background: var(--ok); }
  .count.full { color: var(--bad); }
  .count.full .meter i { background: var(--bad); }
  .place :global(.go) { color: var(--icon-warm); }
  .empty { padding: 10px; color: var(--ink-3); }
  .more { margin: 8px 14px 0; font-size: 11px; color: var(--ink-3); text-align: center; }
</style>
