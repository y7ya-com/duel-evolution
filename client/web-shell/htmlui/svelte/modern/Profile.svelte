<script module>
  // My Profile, modern (CWindowModelProfile): the engine's ten label / value rows (logic.js profile) as a duelist record:
  // the name, title and level on a blue band, the record in an inset table. OK (and Esc) is its own ButtonDuel.
  import { profile } from './logic.js';
  const TOP = new Set(['Name', 'Title', 'LV']);
</script>

<script>
  let { view } = $props();
  const win = $derived(view.win);
  const p = $derived(profile(win));
  const get = n => p.rows.find(r => r.name === n)?.value ?? '';
  const stats = $derived(p.rows.filter(r => !TOP.has(r.name)));
  const ok = () => p.ok && view.api.click(p.ok.id);
  const shown = v => !v || /^[-.%\s]+$/.test(v) ? '—' : v;
  let panel;
  $effect(() => { panel?.querySelector('.gold')?.focus({ preventScroll: true }); });
</script>

<div class="mu">
  <div class="scrim" style:left="{-win.x}px" style:top="{-win.y}px"></div>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="mu-plate card" role="dialog" aria-modal="true" style:width="{win.w}px" aria-label={p.title} bind:this={panel} onkeydown={e => e.key === 'Escape' && ok()}>
    <header class="mu-head"><h2>{p.title}</h2></header>
    <div class="who">
      <span class="badge" aria-hidden="true">{get('Name').charAt(0).toUpperCase()}</span>
      <div class="id">
        <span class="name">{get('Name')}</span>
        <span class="title">{get('Title')}</span>
      </div>
      {#if get('LV')}<span class="mu-chip lv">Lv <b>{get('LV')}</b></span>{/if}
    </div>
    <dl class="stats">
      {#each stats as r (r.id)}
        <div class="stat"><dt>{r.name}</dt><dd>{shown(r.value)}</dd></div>
      {/each}
    </dl>
    {#if p.ok}
      <footer><button type="button" class="mu-btn gold" data-state={p.ok.state} onclick={ok}>{p.ok.label}</button></footer>
    {/if}
  </section>
</div>

<style>

  .scrim { position:absolute; width:1024px; height:768px; background:#073a7055; }
  .card { left:0; top:0; padding-bottom:12px; }
  .who { display:flex; align-items:center; gap:12px; margin:12px 14px 0; padding:10px 12px; background:linear-gradient(90deg,#1269b9,#45a5de); border:1px solid #1e6aaa; box-shadow:inset 0 1px #b4ecff; }
  .badge { display:none; }
  .id { flex:1; min-width:0; display:flex; flex-direction:column; gap:3px; }
  .name { font-size:20px; font-weight:700; color:#fff; text-shadow:0 1px #134e87; }
  .title { font-size:13px; font-weight:600; color:#fff1aa; }
  .lv { background:var(--gold); border-color:var(--gold-edge); color:var(--gold-ink); text-shadow:0 1px #ffffd4; height:28px; line-height:26px; }
  .lv b { font-size:16px; }
  .stats { margin:10px 14px 0; display:grid; grid-template-columns:1fr 1fr; gap:1px; padding:1px; background:#74afcd; border:1px solid #5d96b9; }
  .stat { min-width:0; display:flex; align-items:center; justify-content:space-between; gap:7px; padding:9px 10px; background:var(--well); }
  .stat:nth-child(4n+3),.stat:nth-child(4n+4) { background:#d8f2fb; }
  .stat:last-child:nth-child(odd) { grid-column:1/-1; }
  dt { font-size:12px; color:var(--ink-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  dd { margin:0; font-size:17px; font-weight:700; color:var(--ink-strong); }
  footer { display:flex; justify-content:flex-end; padding:12px 14px 0; }
  footer .mu-btn { min-width:96px; }

</style>
