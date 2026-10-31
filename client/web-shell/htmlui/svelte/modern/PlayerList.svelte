<script module>
  // The lobby's player list, modern (CPlayerListDlg, a CWindowModelInformation: an ActiveListbox of who is here, its
  // search switch '検索ボタン', taller / shorter). Every name is a button: clicking it clicks that row of the engine's list
  // (its row in view first: the list's scroll bar set to it), as a player's click on the row would.
  export function parts(win) {
    const cs = win.controls, list = cs.find(c => /Listbox$/.test(c.cls) && !c.parent);
    return {
      list,
      bar: list && cs.find(c => c.parent === list.id && /Scroll$/.test(c.cls)),
      search: cs.find(c => c.name === '検索ボタン' && c.shown),
      taller: cs.find(c => c.cls === 'CWindowTaskIconExpand' && c.shown),
      shorter: cs.find(c => c.cls === 'CWindowTaskIconHide' && c.shown),
      title: cs.find(c => c.cls === 'CWindowTaskIconbar')?.label || '',
    };
  }
  // the game point of row i of list (in window win), with the list showing rows from top
  export const rowPoint = (win, list, i, top = list.top || 0) => {
    const rows = Math.max(1, list.rows || 6), h = list.h / rows;
    return [win.x + list.x + Math.min(40, list.w / 2), win.y + list.y + h * (i - top) + h / 2];
  };
</script>

<script>
  import Icon from './Icon.svelte';
  import { untag } from '../../controls/basic.js';
  let { view } = $props();
  const win = $derived(view.win);
  const p = $derived(parts(win));
  const names = $derived((p.list?.items || []).map(untag));
  const api = $derived(view.api);
  const frames = n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); });
  async function pick(i) {
    const l = p.list, rows = Math.max(1, l.rows || 6);
    let top = l.top || 0;
    if ((i < top || i >= top + rows) && p.bar) { top = Math.min(i, Math.max(0, names.length - rows)); api.setValue(p.bar.id, top); await frames(3); }
    api.click(l.id, rowPoint(win, l, i, top));
  }
</script>

<div class="mu">
  <section class="mu-plate players" style:width="{win.w}px" style:height="{win.h}px" aria-label="Players here">
    <header>
      <Icon name="people" size={16} class="lead" />
      <h2>Here <span class="n">{names.length}</span></h2>
      {#if p.search}<button type="button" class="mu-icon-btn" aria-label="Find a player" title="Find a player" onclick={() => api.click(p.search.id)}><Icon name="search" size={16} /></button>{/if}
      {#if p.taller}<button type="button" class="mu-icon-btn" aria-label="Taller" title="Taller" disabled={!p.taller.enabled} onclick={() => api.click(p.taller.id)}><svg class="mu-ico" viewBox="0 0 20 20"><path d="M5 12.5 10 7.5l5 5" /></svg></button>{/if}
      {#if p.shorter}<button type="button" class="mu-icon-btn" aria-label="Shorter" title="Shorter" disabled={!p.shorter.enabled} onclick={() => api.click(p.shorter.id)}><svg class="mu-ico" viewBox="0 0 20 20"><path d="M5 7.5 10 12.5l5-5" /></svg></button>{/if}
    </header>
    <ul class="list mu-scroll">
      {#each names as n, i (i)}
        <li><button type="button" class:on={p.list.selected === i} onclick={() => pick(i)}><span class="dot" aria-hidden="true"></span>{n}</button></li>
      {:else}
        <li class="empty">No one else is here yet.</li>
      {/each}
    </ul>
  </section>
</div>

<style>
  .players { left: 0; top: 0; display: flex; flex-direction: column; border-radius: 16px 16px 16px 6px; animation: none; }
  header { display: flex; align-items: center; gap: 6px; height: 30px; padding: 4px 4px 0 12px; flex: none; }
  header :global(.lead) { color: var(--gold-300); }
  h2 { flex: 1; margin: 0; font-size: 12.5px; font-weight: 650; color: #fff; }
  .n { margin-left: 4px; font-weight: 600; color: var(--sky-300); }
  header .mu-icon-btn { width: 24px; height: 22px; }
  header .mu-icon-btn:disabled { opacity: .35; }
  .list { flex: 1; min-height: 0; list-style: none; margin: 2px 6px 6px; padding: 3px; border-radius: 8px;
    background: rgba(4, 17, 43, .42); box-shadow: inset 0 1px 3px rgba(0, 0, 0, .45), inset 0 0 0 1px rgba(150, 205, 255, .12); }
  .list button { display: flex; align-items: center; gap: 8px; width: 100%; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 12.5px;
    font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: background .12s; }
  .list button:hover { background: rgba(150, 205, 255, .14); }
  .list button.on { background: linear-gradient(180deg, rgba(125, 239, 252, .26), rgba(9, 133, 255, .2)); color: #fff; }
  .dot { width: 6px; height: 6px; border-radius: 50%; flex: none; background: #4ce38a; box-shadow: 0 0 6px rgba(76, 227, 138, .8); }
  .empty { padding: 6px 8px; font-size: 12px; color: var(--ink-3); }
</style>
