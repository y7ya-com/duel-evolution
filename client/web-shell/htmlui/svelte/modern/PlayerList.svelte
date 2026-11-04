<script module>
  export function parts(win) {
    const cs = win.controls, list = cs.find(c => /Listbox$/.test(c.cls) && !c.parent);
    return { list, bar: list && cs.find(c => c.parent === list.id && /Scroll$/.test(c.cls)),
      search: cs.find(c => c.name === '検索ボタン' && c.shown),
      step: cs.find(c => /CWindowTaskIcon(Expand|Hide)$/.test(c.cls) && c.shown && c.enabled !== false) };
  }
</script>
<script>
  import Icon from './Icon.svelte';
  import { rowPoint, listItems } from './logic.js';
  let { view } = $props();
  const win = $derived(view.win), p = $derived(parts(win)), names = $derived(listItems(p.list));
  let open = $state(false), panel = $state();
  const toggle = () => { open = !open; };
  $effect(() => {
    if (!open) return;
    const close = e => { if (e.key === 'Escape') open = false; };
    addEventListener('keydown', close); return () => removeEventListener('keydown', close);
  });
  async function pick(i) {
    const l = p.list, rows = Math.max(1, l.rows || 6); let top = l.top || 0;
    if ((i < top || i >= top + rows) && p.bar) {
      top = Math.min(i, Math.max(0, names.length - rows)); view.api.setValue(p.bar.id, top);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    view.api.click(l.id, rowPoint(win, l, i, top));
  }
</script>
<div class="mu roster-root" style:left="{-win.x}px" style:top="{-win.y}px">
  <button type="button" class="launcher" title="Players here" aria-label="Players here" aria-expanded={open} onclick={toggle}><Icon name="people" size={16} /><span>Players</span><b>{names.length}</b></button>
  {#if open}
    <section class="roster" aria-label="Players here" bind:this={panel}>
      <header><h2>Players here</h2>{#if p.search}<button type="button" class="icon" title="Find a player" aria-label="Find a player" onclick={() => view.api.click(p.search.id)}><Icon name="search" size={13} /></button>{/if}<button type="button" class="icon" aria-label="Close player list" onclick={() => (open = false)}>×</button></header>
      <ul class="mu-scroll">{#each names as n, i (i)}<li><button type="button" class:on={p.list.selected === i} onclick={() => pick(i)}>{n}</button></li>{:else}<li class="empty">No other players here.</li>{/each}</ul>
    </section>
  {/if}
</div>
<style>

  .roster-root { width:1024px; height:768px; pointer-events:none; }
  .launcher { position:absolute; right:12px; top:45px; width:123px; height:26px; display:flex; align-items:center; gap:8px; padding:0 9px; border:1px solid #24689c; border-radius:2px; color:#fff; background:linear-gradient(#cafaff,#61cef0 20%,#269fd2 55%,#1a7bb6); box-shadow:inset 0 1px #fff,inset 0 -1px #8edbf4; pointer-events:auto; font-size:12px; font-weight:700; text-shadow:0 1px #14548c; }
  .launcher b { margin-left:auto; padding:0 6px; border-left:1px solid #b6edff; color:#fffbd2; }
  .launcher:hover,.launcher:focus-visible { filter:brightness(1.1); border-color:#e7ffff; color:#fff; }
  .roster { position:absolute; right:12px; top:77px; width:232px; height:200px; padding:3px; border:1px solid #1e6fb3; border-radius:3px; background:var(--plate); box-shadow:inset 0 0 0 2px #91e8ff,0 3px 8px #123d6c55; pointer-events:auto; }
  header { display:flex; align-items:center; gap:4px; height:27px; padding:0 3px 0 7px; background:var(--band); border-bottom:1px solid #1c64ac; }
  h2 { flex:1; margin:0; font:700 13px Arial,sans-serif; color:#fff; text-shadow:0 1px #155992; }
  .icon { display:grid; place-items:center; width:22px; height:20px; font-size:18px; color:#0b529a; background:var(--gold); border:1px solid #ac8b33; border-radius:2px; }
  ul { height:161px; overflow-y:auto; list-style:none; margin:3px 0 0; padding:1px; background:var(--well); box-shadow:var(--well-shadow); }
  li button { width:100%; height:27px; text-align:left; padding:0 8px; border-bottom:1px solid #b9ddec; font-size:13px; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  li:nth-child(even) button { background:#ddf1f9; }
  li button:hover { background:#bbebff; }
  li button.on { color:#fff; background:var(--sel); box-shadow:inset 3px 0 #fff091; }
  .empty { padding:12px 8px; font-size:12px; color:var(--ink-3); }

</style>
