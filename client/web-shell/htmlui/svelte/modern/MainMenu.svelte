<script module>
  // The Main Menu, modern (CMainMenu, src/Game/yo2MenuMain.cpp). The engine's one long list of twelve yellow buttons
  // becomes four groups of tiles, each with its icon; every tile clicks the engine's own ButtonMain (logic.js
  // menuGroups: by label, so a button the game adds or hides follows). The × and Esc click its IconHide. System also
  // carries the Modern UI switch (yo2Html.modern: off puts the legacy menu back in the same frame).
  import { menuGroups, ICONS, nice } from './logic.js';
</script>

<script>
  import Icon from './Icon.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const close = $derived(win.controls.find(c => c.cls === 'CWindowTaskIconHide'));
  const title = $derived(win.controls.find(c => c.cls === 'CWindowTaskShadowText' && !c.parent)?.text || 'Main Menu');
  const list = $derived(menuGroups(win));
  const click = c => c && c.state !== 'disabled' && view.api.click(c.id);
  const modern = () => window.yo2Html?.modern(false);
  let panel;
  $effect(() => { panel?.querySelector('button.tile')?.focus({ preventScroll: true }); });
  function keys(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); click(close); return; }
    const ts = [...panel.querySelectorAll('button.tile, .switch input')], i = ts.indexOf(document.activeElement);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[ev.key];
    if (step && i >= 0) { ev.preventDefault(); ts[Math.max(0, Math.min(ts.length - 1, i + step))].focus(); }
  }
</script>

<div class="mu">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="mu-plate panel" aria-label={title} bind:this={panel} onkeydown={keys}>
    <header class="mu-head">
      <svg class="mu-emblem" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" /><circle cx="12" cy="12" r="3.2" fill="currentColor" /></svg>
      <h2>{title}</h2>
      {#if close}<button type="button" class="mu-icon-btn" aria-label="Close" title="Close (Esc)" onclick={() => click(close)}><Icon name="close" /></button>{/if}
    </header>
    <div class="groups">
      {#each list as [name, items] (name)}
        <div class="group" role="group" aria-label={name}>
          <h3>{name}</h3>
          <div class="grid">
            {#each items as b (b.id)}
              <button type="button" class="tile" class:gold={name !== 'System'} class:quit={b.label === 'Return to Title'} data-state={b.state} disabled={b.state === 'disabled'}
                onclick={() => click(b)}>
                <Icon name={ICONS[b.label] || 'sparkle'} />
                <span>{nice(b.label)}</span>
              </button>
            {/each}
            {#if name === 'System'}
              <label class="tile switch" title="Turn the Modern UI off: the 2008 interface comes back at once">
                <Icon name="sparkle" />
                <span>Modern UI</span>
                <input type="checkbox" role="switch" checked onchange={modern} />
                <span class="track" aria-hidden="true"><span class="knob"></span></span>
              </label>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .panel { left: 6px; bottom: 8px; width: 372px; padding: 0 0 12px; }
  .groups { padding: 6px 12px 0; display: flex; flex-direction: column; gap: 8px; }
  h3 { margin: 6px 4px 6px; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .grid > :last-child:nth-child(odd) { grid-column: 1 / -1; }
  /* a tile: the 2008 menu's gold bar (System: sky glass) */
  .tile { position: relative; display: flex; align-items: center; gap: 9px; height: 34px; padding: 0 10px; border-radius: 10px 10px 10px 4px;
    font-weight: 700; color: var(--ink-strong); background: var(--sky-glass);
    box-shadow: 0 0 0 1px #3a9de6, inset 0 1px 0 #fff, 0 2px 3px rgba(10, 60, 130, .2);
    transition: transform .14s var(--ease), background .14s, box-shadow .14s; }
  .tile.gold { color: var(--gold-ink);
    background: linear-gradient(180deg, #ffffc8 0%, #fff97f 30%, #f9e45f 50%, #f4d558 62%, #f0be45 85%, #eca430 100%);
    box-shadow: 0 0 0 1px var(--gold-edge), inset 0 1px 0 #fff, inset 0 -2px 0 rgba(200, 100, 0, .22), 0 2px 3px rgba(160, 80, 0, .25); }
  .tile :global(.mu-ico) { color: #c25a00; transition: transform .14s var(--ease); }
  .tile:not(.gold) :global(.mu-ico) { color: var(--azure-500); }
  .tile span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .tile:hover, .tile[data-state='hover'] { transform: translateY(-1px); background: var(--sky-glass-hover);
    box-shadow: 0 0 0 1px #2a8fe0, 0 0 0 3px rgba(0, 180, 255, .25), inset 0 1px 0 #fff, 0 6px 12px -5px rgba(0, 120, 230, .45); }
  .tile.gold:hover, .tile.gold[data-state='hover'] {
    background: linear-gradient(180deg, #ffffff 0%, #ffffe2 30%, #fcf4b8 50%, #faeaac 62%, #f6d086 85%, #f2b55e 100%);
    box-shadow: 0 0 0 1px var(--gold-edge), 0 0 0 3px rgba(255, 200, 40, .35), inset 0 1px 0 #fff, 0 6px 12px -5px rgba(180, 90, 0, .4); }
  .tile:hover :global(.mu-ico) { transform: scale(1.08); }
  .tile:focus-visible { outline: 2px solid var(--azure-500); outline-offset: 2px; }
  .tile:active { transform: translateY(0); filter: brightness(.96); }
  .tile:disabled { opacity: .45; transform: none; }
  .switch input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
  .switch span:not(.track):not(.knob) { flex: 1; }
  .track { position: relative; width: 30px; height: 18px; flex: none; border-radius: 9px; background: linear-gradient(180deg, var(--gold-500), var(--gold-300));
    box-shadow: inset 0 1px 2px rgba(120, 60, 0, .35), 0 0 0 1px var(--gold-edge); }
  .knob { position: absolute; left: 14px; top: 2px; width: 14px; height: 14px; border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff, #e8eef5 55%, #b6c4d6); box-shadow: 0 1px 2px rgba(0, 0, 0, .35); transition: left .2s var(--ease); }
  .switch:has(input:focus-visible) { outline: 2px solid var(--azure-500); outline-offset: 2px; }
</style>
