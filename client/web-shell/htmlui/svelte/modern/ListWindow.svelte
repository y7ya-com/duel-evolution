<script module>
  // Friend List, Ignore List, Team List, modern (CWindowModelFriendlist / Blacklist / Teamlist: a FrameDuel, a Listbox,
  // ButtonDuels, its title ShadowText; logic.js listWindow). Rows click the engine's rows (in view first: the list's
  // scroll bar set), the buttons are the window's own; Esc is its Close.
  import { listWindow, listItems, rowPoint, leaveButton, primary } from './logic.js';
</script>

<script>
  import Icon from './Icon.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const p = $derived(listWindow(win));
  const names = $derived(listItems(p.list));
  const api = $derived(view.api);
  const ICON = { CWindowModelFriendlist: 'friends', CWindowModelBlacklist: 'ignore', CWindowModelTeamlist: 'team' };
  const frames = n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); });
  async function pick(i) {
    const l = p.list, rows = Math.max(1, l.rows || 6);
    let top = l.top || 0;
    if ((i < top || i >= top + rows) && p.bar) { top = Math.min(i, Math.max(0, names.length - rows)); api.setValue(p.bar.id, top); await frames(3); }
    api.click(l.id, rowPoint(win, l, i, top));
  }
  function keys(e) { if (e.key === 'Escape') { e.preventDefault(); const b = leaveButton(p.buttons); b && api.click(b.id); } }
</script>

<div class="mu">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="mu-plate panel" style:width="{win.w}px" aria-label={p.title} onkeydown={keys}>
    <header class="mu-head">
      <Icon name={ICON[win.cls] || 'people'} class="lead" />
      <h2>{p.title}</h2>
      <span class="count">{names.length}</span>
    </header>
    <ul class="list mu-scroll">
      {#each names as n, i (i)}
        <li><button type="button" class:on={p.list.selected === i} aria-pressed={p.list.selected === i} onclick={() => pick(i)}>
          <span class="badge" aria-hidden="true">{n.trim().charAt(0).toUpperCase()}</span>{n}</button></li>
      {:else}
        <li class="empty">Nobody on this list yet.</li>
      {/each}
    </ul>
    <footer>
      {#each p.buttons as b (b.id)}
        <button type="button" class="mu-btn" class:gold={primary(b)} data-state={b.state} disabled={b.state === 'disabled'} onclick={() => api.click(b.id)}>{b.label}</button>
      {/each}
    </footer>
  </section>
</div>

<style>
  .panel { left: 0; top: -8px; display: flex; flex-direction: column; padding-bottom: 12px; }
  .panel :global(.lead) { color: var(--gold-300); }
  .count { font-size: 12px; font-weight: 650; color: var(--sky-300); margin-right: 6px; }
  .list { list-style: none; margin: 10px 14px 0; padding: 4px; height: 128px; border-radius: 10px; display: grid; grid-template-columns: repeat(3, 1fr);
    align-content: start; gap: 4px; background: rgba(4, 17, 43, .42); box-shadow: inset 0 1px 3px rgba(0, 0, 0, .45), inset 0 0 0 1px rgba(150, 205, 255, .12); }
  .list button { display: flex; align-items: center; gap: 8px; width: 100%; height: 28px; padding: 0 8px; border-radius: 8px; font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: background .12s, box-shadow .12s; }
  .list button:hover { background: rgba(150, 205, 255, .14); }
  .list button.on { background: linear-gradient(180deg, rgba(125, 239, 252, .3), rgba(9, 133, 255, .22)); box-shadow: inset 0 0 0 1px rgba(190, 240, 255, .7); }
  .badge { display: grid; place-items: center; width: 20px; height: 20px; flex: none; border-radius: 50%; font-size: 11px; font-weight: 750; color: var(--gold-ink);
    background: radial-gradient(circle at 35% 30%, var(--gold-200), var(--gold-400) 60%, var(--gold-500)); }
  .empty { grid-column: 1 / -1; padding: 10px; color: var(--ink-3); }
  footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 14px 0; }
</style>
