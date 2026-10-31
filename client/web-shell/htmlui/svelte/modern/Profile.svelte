<script module>
  // My Profile, modern (CWindowModelProfile): the engine's ten label / value rows (logic.js profile) as a profile card:
  // the name, title and level up top, the record as a grid of figures. OK (and Esc) is its own ButtonDuel.
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
</script>

<div class="mu">
  <div class="scrim" style:left="{-win.x}px" style:top="{-win.y}px"></div>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="mu-plate card" style:width="{win.w}px" aria-label={p.title} onkeydown={e => e.key === 'Escape' && ok()}>
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
        <div class="stat"><dt>{r.name}</dt><dd>{r.value || '—'}</dd></div>
      {/each}
    </dl>
    {#if p.ok}
      <footer><button type="button" class="mu-btn gold" data-state={p.ok.state} onclick={ok}>{p.ok.label}</button></footer>
    {/if}
  </section>
</div>

<style>
  .scrim { position: absolute; width: 1024px; height: 768px; background: rgba(2, 10, 30, .45); }
  .card { left: 0; top: 0; padding-bottom: 14px; }
  .who { display: flex; align-items: center; gap: 14px; padding: 16px 18px 8px; }
  .badge { display: grid; place-items: center; width: 52px; height: 52px; flex: none; border-radius: 50%; font-weight: 800; font-size: 22px;
    color: var(--gold-ink); background: radial-gradient(circle at 35% 30%, var(--gold-200), var(--gold-400) 60%, var(--gold-500));
    box-shadow: 0 0 0 2px rgba(4, 17, 43, .65), 0 0 0 4px rgba(247, 228, 108, .5), 0 4px 10px rgba(2, 10, 30, .45); }
  .id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .name { font-size: 20px; font-weight: 750; color: #fff; text-shadow: 0 1px 2px rgba(2, 10, 30, .6); }
  .title { font-size: 13px; font-weight: 600; color: var(--sky-300); }
  .lv { height: 24px; line-height: 24px; font-size: 12px; padding: 0 10px; border-radius: 12px; }
  .lv b { font-size: 14px; }
  .stats { margin: 8px 18px 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .stat { padding: 10px 12px; border-radius: 10px 10px 10px 4px; background: rgba(4, 17, 43, .38);
    box-shadow: inset 0 0 0 1px rgba(150, 205, 255, .16), inset 0 1px 0 rgba(255, 255, 255, .06); }
  dt { font-size: 11px; font-weight: 600; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  dd { margin: 4px 0 0; font-size: 18px; font-weight: 700; color: #fff; }
  footer { display: flex; justify-content: flex-end; padding: 14px 18px 0; }
  footer .mu-btn { min-width: 96px; }
</style>
