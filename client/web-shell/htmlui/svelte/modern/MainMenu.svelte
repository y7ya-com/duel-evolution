<script module>
  // The Main Menu, modern (CMainMenu, src/Game/yo2MenuMain.cpp). The engine's one long list of twelve yellow buttons
  // becomes four groups of tiles, each with its icon; every tile clicks the engine's own ButtonMain (logic.js
  // menuGroups: by label, so a button the game adds or hides follows). The × and Esc click its IconHide. System also
  // carries the "Legacy UI" switch, off here (yo2Html.modern(false) when turned on: the legacy menu comes back in the same frame).
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
              <button type="button" class="mu-btn tile" class:quit={b.label === 'Return to Title'} data-state={b.state} disabled={b.state === 'disabled'}
                onclick={() => click(b)}>
                <Icon name={ICONS[b.label] || 'sparkle'} />
                <span>{nice(b.label)}</span>
              </button>
            {/each}
            {#if name === 'System'}
              <label class="mu-btn tile switch" title="Turn Legacy UI on: the original 2008 interface comes back at once">
                <Icon name="sparkle" />
                <span>Legacy UI</span>
                <input type="checkbox" role="switch" onchange={modern} />
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
  /* a quick action passing through the menu (macro.js): out of sight */
  :global(html.mu-macro) .panel { visibility: hidden; }
  .groups { padding: 6px 12px 0; display: flex; flex-direction: column; gap: 8px; }
  h3 { margin: 6px 4px 6px; font-family: var(--display); font-size: 10.5px; font-weight: 400; letter-spacing: .12em; text-transform: uppercase; color: var(--p700); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .grid > :last-child:nth-child(odd) { grid-column: 1 / -1; }
  /* each tile a game key (theme.js .mu-btn), its icon and label from the left */
  .tile { justify-content: flex-start; gap: 9px; height: 32px; padding: 0 10px; font-weight: 700; }
  .tile :global(.mu-ico) { color: var(--icon); transition: transform .14s var(--ease); }
  .quit :global(.mu-ico) { color: var(--ink-3); }
  .tile span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .tile:hover :global(.mu-ico) { transform: scale(1.12); }
  .grid { row-gap: 9px; }
  .switch input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
  .switch span:not(.track):not(.knob) { flex: 1; }
  /* off (the Modern UI): a grey track, the knob left; on (only for the moment before the legacy menu takes over): blue, right */
  .track { position: relative; width: 30px; height: 18px; flex: none; border-radius: 9px; background: var(--n500, #8a98ad); box-shadow: inset 0 1px 2px rgba(0, 20, 60, .3); transition: background .18s; }
  .switch input:checked + .track { background: var(--sel); }
  .switch input:checked + .track .knob { left: 14px; }
  .knob { position: absolute; left: 2px; top: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .3); transition: left .2s var(--ease); }
  .switch:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
