<script>
  // A small form window, modern (CWindowModelSetComment: Create Comment's Duel Message and Greeting; logic.js mail reads
  // its fields and their labels): its title, a field per game input (through setText), its own buttons, OK in gold;
  // Esc is Cancel.
  import { mail, leaveButton, primary } from './logic.js';
  import Field from './Field.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const m = $derived(mail(win));
  // the title: the window's first text that names no field
  const title = $derived(win.controls.find(c => c.shown && !c.parent && /CWindowTask(Shadow)?Text$/.test(c.cls) && c.text && !m.fields.some(f => f.label === c.text.replace(/[:：]\s*$/, '')))?.text || 'Settings');
  const api = $derived(view.api);
  let panel;
  $effect(() => { panel?.querySelector('input, textarea')?.focus({ preventScroll: true }); });
  const ok = () => { const b = m.buttons.find(primary); b && api.click(b.id); };
  function keys(e) { if (e.key === 'Escape') { e.preventDefault(); const b = leaveButton(m.buttons); b && api.click(b.id); } }
</script>

<div class="mu">
  <div class="scrim" style:left="{-win.x}px" style:top="{-win.y}px"></div>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="mu-plate box" role="dialog" aria-modal="true" aria-label={title} style:width="{Math.max(win.w, 360)}px" bind:this={panel} onkeydown={keys}>
    <header class="mu-head"><h2>{title}</h2></header>
    <div class="form">
      {#each m.fields as f (f.c.id)}
        <label><span>{f.label || 'Text'}</span><Field c={f.c} {api} label={f.label} area={f.area} rows={4} onenter={ok} /></label>
      {/each}
    </div>
    <footer>
      {#each [...m.buttons].sort((a, b) => primary(a) - primary(b)) as b (b.id)}
        <button type="button" class="mu-btn" class:gold={primary(b)} data-state={b.state} disabled={b.state === 'disabled'} onclick={() => api.click(b.id)}>{b.label}</button>
      {/each}
    </footer>
  </section>
</div>

<style>
  .scrim { position: absolute; width: 1024px; height: 768px; background: rgba(10, 50, 120, .3); }
  .box { left: 0; top: 0; padding-bottom: 14px; }
  .form { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px 0; }
  label { display: flex; flex-direction: column; gap: 5px; }
  span { font-size: 11.5px; font-weight: 700; color: var(--ink-2); letter-spacing: .02em; }
  footer { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 16px 0; }
  footer .mu-btn { min-width: 96px; }
</style>
