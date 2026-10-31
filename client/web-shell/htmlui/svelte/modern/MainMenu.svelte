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
  $effect(() => { panel?.querySelector('.tile')?.focus({ preventScroll: true }); });
  function keys(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); click(close); return; }
    const ts = [...panel.querySelectorAll('.tile')], i = ts.indexOf(document.activeElement);
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
              <button type="button" class="tile" class:quit={b.label === 'Return to Title'} data-state={b.state} disabled={b.state === 'disabled'}
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
  h3 { margin: 6px 4px 6px; font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--sky-300); opacity: .85; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .tile { position: relative; display: flex; align-items: center; gap: 9px; height: 34px; padding: 0 10px; border-radius: 10px 10px 10px 4px;
    font-weight: 600; color: var(--ink); text-shadow: 0 1px 1px rgba(2, 10, 30, .45);
    background: linear-gradient(180deg, rgba(255, 255, 255, .09), rgba(255, 255, 255, .03));
    box-shadow: inset 0 0 0 1px rgba(150, 205, 255, .22), inset 0 1px 0 rgba(255, 255, 255, .12);
    transition: transform .14s var(--ease), background .14s, box-shadow .14s; }
  .tile :global(.mu-ico) { color: var(--gold-300); transition: transform .14s var(--ease); }
  .tile span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .tile:hover, .tile:focus-visible, .tile[data-state='hover'] { outline: none; transform: translateY(-1px);
    background: linear-gradient(180deg, rgba(125, 239, 252, .26), rgba(9, 133, 255, .2));
    box-shadow: inset 0 0 0 1px rgba(190, 240, 255, .72), inset 0 1px 0 rgba(255, 255, 255, .3), 0 6px 14px -6px rgba(0, 170, 255, .7); }
  .tile:hover :global(.mu-ico), .tile:focus-visible :global(.mu-ico) { transform: scale(1.08); }
  .tile:active { transform: translateY(0); }
  .tile:disabled { opacity: .4; transform: none; }
  .quit :global(.mu-ico) { color: var(--ink-2); }
  .switch input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
  .switch span:not(.track):not(.knob) { flex: 1; }
  .track { position: relative; width: 30px; height: 18px; flex: none; border-radius: 9px; background: linear-gradient(180deg, var(--gold-400), var(--gold-300));
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, .35), 0 0 0 1px rgba(4, 17, 43, .7); transition: background .18s; }
  .knob { position: absolute; left: 14px; top: 2px; width: 14px; height: 14px; border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff, #dfe8f3 55%, #9fb3cc); box-shadow: 0 1px 2px rgba(0, 0, 0, .45);
    transition: left .2s var(--ease); }
  .switch:has(input:focus-visible) { outline: 2px solid var(--cyan); outline-offset: 2px; }
</style>
