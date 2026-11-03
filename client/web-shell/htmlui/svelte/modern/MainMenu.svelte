<script module>
  // The Main Menu, modern (CMainMenu, src/Game/yo2MenuMain.cpp). The engine's one long list of twelve yellow buttons
  // becomes four groups of yellow command rows, each with its icon; every tile clicks the engine's own ButtonMain (logic.js
  // menuGroups: by label, so a button the game adds or hides follows). The × and Esc click its IconHide. System also
  // carries the "Legacy UI" switch, off here (yo2Html.modern(false) when turned on: the legacy menu comes back in the same frame).
  import { menuGroups, ICONS, nice } from './logic.js';
</script>

<script>
  import Icon from './Icon.svelte';
  import { openCosmetics } from '../../cosmetic-shop.js';
  let { view } = $props();
  const win = $derived(view.win);
  const close = $derived(win.controls.find(c => c.cls === 'CWindowTaskIconHide'));
  const title = $derived(win.controls.find(c => c.cls === 'CWindowTaskShadowText' && !c.parent)?.text || 'Main Menu');
  const list = $derived.by(() => {
    const groups = menuGroups(win);
    if (!groups.some(([name]) => name === 'You')) {
      const before = groups.findIndex(([name]) => name === 'Social' || name === 'System');
      groups.splice(before < 0 ? groups.length : before, 0, ['You', []]);
    }
    return groups;
  });
  const appearanceAvailable = () => [10, 11, 12, 14].includes(window.yo2Html?.snapshot?.()?.scene);
  const click = c => c && c.state !== 'disabled' && view.api.click(c.id);
  const modern = () => window.yo2Html?.modern(false);
  let panel;
  $effect(() => { panel?.querySelector('button.tile')?.focus({ preventScroll: true }); });
  function keys(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); click(close); return; }
    const ts = [...panel.querySelectorAll('button.tile, .switch input')], i = ts.indexOf(document.activeElement);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[ev.key];
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
            {#if name === 'You'}
              <button type="button" class="mu-btn tile" disabled={!appearanceAvailable()} onclick={() => openCosmetics('wardrobe')}><Icon name="profile" /><span>Appearance</span></button>
              <button type="button" class="mu-btn tile" disabled={!appearanceAvailable()} onclick={() => openCosmetics('boxes')}><Icon name="sparkle" /><span>Cosmetic Boxes</span></button>
            {/if}
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

  .panel { left:6px; bottom:8px; width:282px; padding-bottom:10px; }
  :global(html.mu-macro) .panel { visibility:hidden; }
  .groups { padding:4px 10px 0; display:flex; flex-direction:column; gap:4px; }
  h3 { margin:4px 0; padding:3px 7px; font:700 11px Arial,sans-serif; text-transform:uppercase; letter-spacing:.04em; color:#285d8a; border-bottom:1px solid #6db3d3; }
  .grid { display:flex; flex-direction:column; gap:4px; }
  .tile { justify-content:flex-start; gap:9px; height:28px; padding:0 10px; background:var(--gold); border-color:var(--gold-edge); color:#fff; text-shadow:1px 0 #675220,-1px 0 #675220,0 1px #675220,0 -1px #675220; font-size:14px; font-weight:700; }
  .tile:hover { background:linear-gradient(#ffffed,#fff7b3 50%,#f8d679); }
  .tile :global(.mu-ico) { width:17px; height:17px; color:#604a16; filter:drop-shadow(0 1px #ffffc8); }
  .tile span { min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .quit { background:var(--btn); border-color:var(--btn-edge); color:var(--ink); text-shadow:0 1px #eaffff; }
  .switch { color:var(--ink); background:var(--btn); border-color:var(--btn-edge); text-shadow:0 1px #eaffff; }
  .switch input { position:absolute; opacity:0; width:1px; height:1px; }
  .switch span:not(.track):not(.knob) { flex:1; }
  .track { position:relative; width:30px; height:17px; flex:none; border:1px solid #457f9f; border-radius:3px; background:#8ab2c9; box-shadow:inset 0 1px 2px #184e7355; }
  .knob { position:absolute; left:2px; top:2px; width:12px; height:11px; border-radius:1px; background:linear-gradient(#fff,#bce8f7); border:1px solid #ecffff; box-shadow:0 1px #24638e; }
  .switch input:checked + .track { background:var(--sel); }
  .switch input:checked + .track .knob { left:14px; }
  .switch:has(input:focus-visible) { outline:2px solid var(--focus); outline-offset:2px; }

</style>
