<script>
  // The pick list, modern (CWindowModelList: who is under the click, before their card opens; logic.js pickList): a
  // small popover at the game's place, a row per name with an initial badge. Before: a bare list on a stripe. A row
  // clicks the game's row (scrolled into view first); focus opens on the first row, so Enter picks it at once.
  // Keys: Up / Down, Enter, Esc closes.
  import { pickList } from './logic.js';
  import { pickRow } from './macro.js';
  import Icon from './Icon.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const p = $derived(pickList(win));
  const api = $derived(view.api);
  const shown = $derived(win.shown);
  let panel;
  $effect(() => {
    if (!shown) return;
    const t = setTimeout(() => panel?.querySelector('.row')?.focus({ preventScroll: true }), 30);
    return () => clearTimeout(t);
  });
  const pick = i => pickRow(api, win, p.list, p.bar, i, p.names.length);
  function keys(e) {
    if (e.key === 'Escape' && p.close) { e.preventDefault(); api.click(p.close.id); return; }
    const k = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!k) return;
    e.preventDefault();
    const rows = [...panel.querySelectorAll('.row')];
    rows[Math.max(0, Math.min(rows.length - 1, rows.indexOf(document.activeElement) + k))]?.focus();
  }
  // keys on the plate itself (the bridge stops a key at the window root, where Svelte's delegated onkeydown would be)
  const keyed = el => { el.addEventListener('keydown', keys); return () => el.removeEventListener('keydown', keys); };
</script>

<div class="mu">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="mu-plate pop" style:width="{win.w}px" aria-label={p.title || 'Choose'} bind:this={panel} {@attach keyed}>
    <header class="mu-head">
      <h2>{p.title || 'Choose'}</h2>
      {#if p.close}<button type="button" class="mu-icon-btn" aria-label="Close" onclick={() => api.click(p.close.id)}><Icon name="close" /></button>{/if}
    </header>
    <ul class="mu-scroll">
      {#each p.names as n, i (i)}
        <li><button type="button" class="row" class:on={p.list.selected === i} onclick={() => pick(i)}>
          <span class="badge" aria-hidden="true">{n.charAt(0).toUpperCase()}</span><span class="nm">{n}</span><Icon name="chevron" size={14} class="go" />
        </button></li>
      {/each}
    </ul>
  </section>
</div>

<style>
  .pop { left: 0; top: 0; padding-bottom: 6px; }
  .pop :global(.mu-head) { height: 30px; }
  .pop :global(.mu-head h2) { font-size: 13px; }
  ul { list-style: none; margin: 0; padding: 6px; max-height: 196px; display: flex; flex-direction: column; gap: 2px; }
  .row { display: flex; align-items: center; gap: 8px; width: 100%; height: 30px; padding: 0 8px; border-radius: var(--r-row); font-weight: 700; color: var(--ink-strong);
    transition: background .12s, box-shadow .12s; }
  .row:hover, .row:focus-visible { background: var(--p50); box-shadow: inset 0 0 0 1px var(--gold-edge); }
  .row:focus { outline: none; }
  .row.on { background: var(--p50); }
  .badge { display: grid; place-items: center; width: 20px; height: 20px; flex: none; border-radius: 50%; font-size: 11px; font-weight: 800; color: #fff; background: var(--sel); }
  .nm { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row :global(.go) { color: var(--icon-warm); opacity: 0; transition: opacity .12s; }
  .row:hover :global(.go), .row:focus-visible :global(.go) { opacity: 1; }
</style>
