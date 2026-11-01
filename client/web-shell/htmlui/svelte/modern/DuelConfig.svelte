<script>
  // Duel Options, modern (CWindowModelDuelConfig; logic.js duelConfig): each setting a row of its options as one
  // segmented choice (the game's checked switch lit in gold), the hovered or focused option's help under them (the
  // engine writes it when its switch is hovered: api.hover), OK in gold. The game keeps a choice only on OK, so the
  // plate says how many settings changed since it opened. Keys: the arrows move within a setting (and choose, as
  // radio buttons do), Tab between settings, Enter is OK, Esc Cancel.
  import { duelConfig, duelFind, duelCreate, nice } from './logic.js';
  import GameField from './game/GameField.svelte';
  import { focusSoon } from './macro.js';
  import Icon from './Icon.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  // Auto Duel's settings (CWindowModelDuelFind) are the same kind of window: its choices, no help, no saved settings
  // and Create Duel's (CWindowModelDuelWait): its choices and a password field
  const d = $derived(win.cls === 'CWindowModelDuelFind' ? duelFind(win) : win.cls === 'CWindowModelDuelWait' ? duelCreate(win) : duelConfig(win));
  const api = $derived(view.api);
  const pick = s => s.options.find(o => o.c.checked);
  // what each setting was when the window opened (first snapshot that has it)
  const start = new Map();
  $effect(() => { for (const s of d.sections) if (!start.has(s.title) && pick(s)) start.set(s.title, pick(s).label); });
  const changed = $derived(d.sections.filter(s => start.has(s.title) && pick(s) && start.get(s.title) !== pick(s).label).length);
  let hover = $state('');
  let panel;
  // open on the first setting's choice, once the game shows the window (it opens hidden for its first frames, and a
  // hidden root takes no focus); its help asked of the engine then too (onfocus)
  const shown = $derived(win.shown);
  $effect(() => shown ? focusSoon(panel, '[role=radio][aria-checked=true]') : undefined);
  const choose = (o, focus) => { api.click(o.c.id); if (focus) panel?.querySelector(`[data-id="${o.c.id}"]`)?.focus(); };
  const show = (s, o) => { hover = `${s.title}: ${o.label}`; api.hover(o.c.id); };
  function arrows(e, s) {
    const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!k) return;
    e.preventDefault();
    const i = s.options.findIndex(o => o.c.id === +e.target.dataset.id), o = s.options[(i + k + s.options.length) % s.options.length];
    show(s, o); choose(o, true);
  }
  // keys on the plate itself, not Svelte's delegated onkeydown: the bridge stops a key at the window's root, which is
  // where Svelte would have handled it
  const keyed = el => { el.addEventListener('keydown', keys); return () => el.removeEventListener('keydown', keys); };
  function keys(e) {
    if (e.key === 'Escape' && d.cancel) { e.preventDefault(); api.click(d.cancel.id); }
    else if (e.key === 'Enter' && d.ok && !e.defaultPrevented && !e.target.closest('footer')) { e.preventDefault(); api.click(d.ok.id); }
  }
</script>

<div class="mu">
  <div class="scrim" style:left="{-win.x}px" style:top="{-win.y}px"></div>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="mu-plate panel" role="dialog" aria-modal="true" aria-label={nice(d.title)} style:width="{win.w}px" bind:this={panel} {@attach keyed}>
    <header class="mu-head"><Icon name="duel" class="lead" /><h2>{nice(d.title)}</h2></header>
    <div class="body">
      {#each d.sections as s (s.id)}
        <div class="setting">
          <span class="name" id="dc-{s.id}">{s.title}</span>
          <!-- svelte-ignore a11y_interactive_supports_focus -->
          <div class="seg" role="radiogroup" aria-labelledby="dc-{s.id}" style:--n={s.options.length}
            {@attach el => { const f = e => arrows(e, s); el.addEventListener('keydown', f); return () => el.removeEventListener('keydown', f); }}>
            {#each s.options as o (o.c.id)}
              <button type="button" role="radio" class="opt" class:on={o.c.checked} aria-checked={!!o.c.checked} data-id={o.c.id}
                tabindex={o.c.checked || (!pick(s) && o === s.options[0]) ? 0 : -1}
                onclick={() => choose(o)} onpointerenter={() => show(s, o)} onfocus={() => show(s, o)}>{o.label}</button>
            {/each}
          </div>
        </div>
      {/each}
      {#if d.field}
        <div class="setting">
          <span class="name">{d.field.label}</span>
          <GameField c={d.field.c} {api} label={d.field.label} placeholder="None: anyone can join" onenter={() => d.ok && api.click(d.ok.id)} />
        </div>
      {/if}
      {#if d.help !== undefined}<div class="help" aria-live="polite">
        <b>{hover || '\u00a0'}</b>   <!-- always there: a line put in on hover pushed the help down (a layout shift) -->
        <p>{d.help}</p>
      </div>{/if}
    </div>
    <footer>
      <span class="note" class:dirty={changed && !d.note}>{d.note || (changed ? `${changed} unsaved change${changed > 1 ? 's' : ''}` : 'Saved when you press OK')}</span>
      {#if d.cancel}<button type="button" class="mu-btn" data-state={d.cancel.state} onclick={() => api.click(d.cancel.id)}>{d.cancel.label}</button>{/if}
      {#if d.ok}<button type="button" class="mu-btn gold" data-state={d.ok.state} onclick={() => api.click(d.ok.id)}>{d.ok.label}</button>{/if}
    </footer>
  </section>
</div>

<style>
  .scrim { position: absolute; width: 1024px; height: 768px; background: rgba(10, 50, 120, .3); animation: fade .2s var(--ease) both; }
  @keyframes fade { from { opacity: 0; } }
  .panel { left: 0; top: 0; padding-bottom: 14px; }
  .panel :global(.lead) { color: var(--gold-300); }
  .body { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px 0; }
  .setting { display: flex; flex-direction: column; gap: 6px; }
  .name { font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-2); }
  .seg { display: grid; grid-template-columns: repeat(var(--n), 1fr); gap: 4px; padding: 4px; border-radius: calc(var(--r-ctl) + 4px);
    background: var(--well); box-shadow: var(--well-shadow); }
  .opt { height: 34px; padding: 0 10px; border-radius: var(--r-ctl); font-weight: 700; text-align: center; color: var(--ink-2);
    transition: background .14s, box-shadow .14s, color .14s, transform .14s var(--ease); }
  .opt:hover { color: var(--ink-strong); background: var(--p50); box-shadow: inset 0 0 0 1px var(--p200); }
  .opt:active { transform: translateY(1px); }
  .opt.on { color: var(--gold-ink); background: var(--gold); box-shadow: 0 0 0 1px var(--gold-edge), inset 0 1px 0 rgba(255, 255, 255, .8), 0 2px 4px rgba(120, 70, 0, .22); }
  .help { height: 108px; overflow-y: auto; padding: 10px 12px; border-radius: var(--r-ctl); background: var(--p50); box-shadow: inset 0 0 0 1px var(--p200); }
  .help b { display: block; margin-bottom: 4px; font-size: 12px; color: var(--link); }
  .help p { margin: 0; font-size: 13px; line-height: 1.45; color: var(--ink); white-space: pre-wrap; }
  footer { display: flex; align-items: center; gap: 8px; padding: 14px 18px 0; }
  footer .mu-btn { min-width: 104px; }
  .note { flex: 1; font-size: 12px; color: var(--ink-3); }
  .note.dirty { color: var(--warm); font-weight: 700; }
</style>
