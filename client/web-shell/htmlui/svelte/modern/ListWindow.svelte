<script module>
  // Friend List, Ignore List, Team List, modern (CWindowModelFriendlist / Blacklist / Teamlist: a FrameDuel, a Listbox,
  // ButtonDuels, its title ShadowText; logic.js listWindow). Rows click the engine's rows (in view first: the list's
  // scroll bar set), the buttons are the window's own; Esc is its Close.
  import { listWindow, listItems, rowPoint, leaveButton, primary, presence } from './logic.js';
  import { writeMail } from './macro.js';
</script>

<script>
  import Icon from './Icon.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const p = $derived(listWindow(win));
  const names = $derived(listItems(p.list));
  const api = $derived(view.api);
  const ICON = { CWindowModelFriendlist: 'friends', CWindowModelBlacklist: 'ignore', CWindowModelTeamlist: 'team' };
  // the Friend List: who is online and where (the site's /api/de/friends; none when it doesn't answer), and Mail
  const friends = $derived(win.cls === 'CWindowModelFriendlist');
  let here = $state(new Map());
  $effect(() => {
    if (!friends) return;
    const base = globalThis.ENV?.YO2_DE_HTTP || '';
    let live = true;
    const load = () => fetch(base + '/api/de/friends', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(j => { if (live && j) here = presence(j.friends ?? j); }).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { live = false; clearInterval(t); };
  });
  const status = n => here.get(n.trim().toLowerCase());
  const online = $derived([...here.values()].filter(f => f.online).length);
  async function mail() {
    const close = leaveButton(p.buttons);
    if (close) { await api.click(close.id); }
    await writeMail(api);
  }
  const frames = n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); });
  async function pick(i) {
    const l = p.list, rows = Math.max(1, l.rows || 6);
    let top = l.top || 0;
    if ((i < top || i >= top + rows) && p.bar) { top = Math.min(i, Math.max(0, names.length - rows)); api.setValue(p.bar.id, top); await frames(3); }
    api.click(l.id, rowPoint(win, l, i, top));
  }
  let panel;
  $effect(() => { panel?.querySelector('.list button, footer button')?.focus({ preventScroll: true }); });
  function keys(e) { if (e.key === 'Escape') { e.preventDefault(); const b = leaveButton(p.buttons); b && api.click(b.id); } }
</script>

<div class="mu">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="mu-plate panel" style:width="{win.w}px" aria-label={p.title} onkeydown={keys} bind:this={panel}>
    <header class="mu-head">
      <Icon name={ICON[win.cls] || 'people'} class="lead" />
      <h2>{p.title}</h2>
      <span class="count">{#if friends && here.size}{online} online · {/if}{names.length}</span>
    </header>
    <ul class="list mu-scroll">
      {#each names as n, i (i)}
        {@const st = status(n)}
        <li class="row"><button type="button" class:on={p.list.selected === i} aria-pressed={p.list.selected === i} onclick={() => pick(i)}>
          <span class="badge" aria-hidden="true">{n.trim().charAt(0).toUpperCase()}{#if st}<i class="dot" class:live={st.online}></i>{/if}</span>
          <span class="who"><span class="nm">{n}</span>{#if st}<span class="where">{st.online ? st.place || 'Online' : 'Offline'}</span>{/if}</span></button>
          {#if friends}<button type="button" class="mu-icon-btn act" title="Mail {n}" aria-label="Mail {n}" onclick={mail}><Icon name="mail" size={15} /></button>{/if}</li>
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
  .count { font-size: 12px; font-weight: 800; color: #fff; margin-right: 6px; text-shadow: 0 1px 0 rgba(0, 20, 60, .35); }
  .list { list-style: none; margin: 10px 14px 0; padding: 4px; height: 128px; border-radius: 10px; display: grid; grid-template-columns: repeat(3, 1fr);
    align-content: start; gap: 4px; background: var(--well); box-shadow: var(--well-shadow); }
  .list button { display: flex; align-items: center; gap: 8px; width: 100%; height: 28px; padding: 0 8px; border-radius: 8px; font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: background .12s, box-shadow .12s; }
  .list button:hover { background: var(--p50); }
  .list button.on { color: #fff; background: var(--sel); box-shadow: inset 0 0 0 1px var(--p900); }
  .row { position: relative; display: flex; align-items: center; gap: 2px; }
  .row > button:first-child { flex: 1; min-width: 0; }
  .act { width: 26px; height: 26px; min-width: 26px; flex: none; }
  .who { display: flex; flex-direction: column; min-width: 0; line-height: 1.15; }
  .nm { overflow: hidden; text-overflow: ellipsis; }
  .where { font-size: 10.5px; font-weight: 500; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; }
  .on .where { color: rgba(255, 255, 255, .85); }
  .dot { position: absolute; right: -2px; bottom: -2px; width: 8px; height: 8px; border-radius: 50%; background: var(--n500); box-shadow: 0 0 0 2px #fff; }
  .dot.live { background: #2fae55; }
  .badge { position: relative; display: grid; place-items: center; width: 20px; height: 20px; flex: none; border-radius: 50%; font-size: 11px; font-weight: 750; color: #fff;
    background: var(--sel); }
  .empty { grid-column: 1 / -1; padding: 10px; color: var(--ink-3); }
  footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 14px 0; }
</style>
