<script module>
  // what each way in does (the game says only its name)
  const SAYS = { auto: 'The game finds you an opponent', create: 'Open a duel and wait for a challenger' };
  const ICON = { auto: 'search', create: 'duel' };
</script>

<script>
  // The lobby's Duel menu, modern (CWindowModelDuel, the dock's Duel; logic.js duelMenu): how busy the lobby is as three
  // figures (searching through Auto Duel, waiting in a created duel, duelling), then the two ways in as large cards that say what they do, Cancel. Before:
  // green labels with their counts far to the right, and two grey bars named only "Auto Duel" and "Create Duel". The
  // cards are the game's own switches. Keys: focus on Auto Duel; Left / Right between the cards, Enter, Esc Cancel.
  import { duelMenu, nice } from './logic.js';
  import { focusSoon } from './macro.js';
  import Icon from './Icon.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const d = $derived(duelMenu(win));
  const api = $derived(view.api);
  const shown = $derived(win.shown);
  let panel;
  $effect(() => shown ? focusSoon(panel, '.way') : undefined);
  function keys(e) {
    if (e.key === 'Escape' && d.cancel) { e.preventDefault(); api.click(d.cancel.id); return; }
    const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!k) return;
    e.preventDefault();
    const ws = [...panel.querySelectorAll('.way')];
    ws[Math.max(0, Math.min(ws.length - 1, ws.indexOf(document.activeElement) + k))]?.focus();
  }
  // keys on the plate itself (the bridge stops a key at the window root, where Svelte's delegated onkeydown would be)
  const keyed = el => { el.addEventListener('keydown', keys); return () => el.removeEventListener('keydown', keys); };
</script>

<div class="mu">
  <div class="scrim" style:left="{-win.x}px" style:top="{-win.y}px"></div>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="mu-plate panel" role="dialog" aria-modal="true" aria-label={d.title} style:width="{win.w}px" bind:this={panel} {@attach keyed}>
    <header class="mu-head"><Icon name="duel" class="lead" /><h2>{nice(d.title)}</h2></header>
    {#if d.counts.length}
      <dl class="figs">
        {#each d.counts as r (r.label)}<div title={r.game}><dt>{r.label}</dt><dd>{r.n ?? '—'}</dd></div>{/each}
      </dl>
    {/if}
    <div class="ways">
      {#each d.ways as w (w.c.id)}
        <button type="button" class="way" class:gold={w.kind === 'auto'} data-state={w.c.state} disabled={w.c.state === 'disabled'} onclick={() => api.click(w.c.id)}>
          <Icon name={ICON[w.kind] || 'duel'} size={22} />
          <b>{w.label}</b>
          {#if SAYS[w.kind]}<small>{SAYS[w.kind]}</small>{/if}
        </button>
      {/each}
    </div>
    {#if d.cancel}
      <footer><button type="button" class="mu-btn" data-state={d.cancel.state} onclick={() => api.click(d.cancel.id)}>{d.cancel.label}</button></footer>
    {/if}
  </section>
</div>

<style>
  .scrim { position: absolute; width: 1024px; height: 768px; background: rgba(10, 50, 120, .3); animation: fade .2s var(--ease) both; }
  @keyframes fade { from { opacity: 0; } }
  .panel { left: 0; top: 0; padding-bottom: 14px; }
  .panel :global(.lead) { color: var(--gold-300); }
  .figs { margin: 14px 18px 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .figs div { padding: 8px 12px; border-radius: var(--r-ctl); background: var(--well); box-shadow: var(--well-shadow); }
  dt { font-size: 11px; font-weight: 700; color: var(--ink-3); }
  dd { margin: 2px 0 0; font-size: 20px; font-weight: 800; color: var(--ink-strong); }
  .ways { margin: 12px 18px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .way { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 10px; align-items: center; padding: 12px 14px;
    border-radius: var(--r-ctl); text-align: left; color: var(--ink-strong); background: var(--btn);
    box-shadow: 0 0 0 1px var(--btn-edge), inset 0 1px 0 #fff, 0 2px 4px rgba(10, 35, 80, .12);
    transition: transform .14s var(--ease), box-shadow .14s, filter .14s; }
  .way :global(.mu-ico) { grid-row: span 2; color: var(--icon); }
  .way b { font-size: 15px; font-weight: 800; }
  .way small { font-size: 11.5px; font-weight: 600; color: var(--ink-3); }
  .way.gold { color: var(--gold-ink); background: var(--gold); box-shadow: 0 0 0 1px var(--gold-edge), inset 0 1px 0 rgba(255, 255, 255, .8), 0 2px 4px rgba(120, 70, 0, .22); }
  .way.gold small, .way.gold :global(.mu-ico) { color: var(--gold-ink); opacity: .8; }
  .way:hover, .way:focus-visible, .way[data-state='hover'] { transform: translateY(-2px); box-shadow: 0 0 0 1px var(--gold-edge), inset 0 1px 0 #fff, 0 8px 18px -8px rgba(140, 80, 0, .5); }
  .way:active, .way[data-state='pressed'] { transform: translateY(0); filter: brightness(.97); }
  .way:disabled { opacity: .5; transform: none; }
  footer { display: flex; justify-content: flex-end; padding: 12px 18px 0; }
  footer .mu-btn { min-width: 104px; }
</style>
