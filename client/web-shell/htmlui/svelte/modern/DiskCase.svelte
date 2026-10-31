<script>
  // My Room's duel disk case, modern (CDuelDiskList; logic.js diskCase): a plate framing the game's own grid of disks
  // (its sprites, which the engine keeps drawing and dragging: a disk dragged onto a lit shelf slot goes on show
  // there), the page arrows as chevrons at the game's places, the hovered disk's name and text in a well, Close.
  // Before: the same grid with no word on what to do with it. Pass mode: the game keeps the mouse (hover, drag, the
  // arrows); Close and the text's well take the pointer. Keys: Close takes the focus, so Esc and Enter close; the left /
  // right arrows turn the page.
  import { diskCase } from './logic.js';
  import { focusSoon } from './macro.js';
  import Icon from './Icon.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const d = $derived(diskCase(win));
  const api = $derived(view.api);
  const shown = $derived(win.shown);
  let panel;
  $effect(() => shown ? focusSoon(panel, '.close') : undefined);
  function keys(e) {
    const a = { ArrowLeft: d.prev, ArrowRight: d.next }[e.key];
    if (a) { e.preventDefault(); api.click(a.id); }
    else if (e.key === 'Escape' && d.close) { e.preventDefault(); api.click(d.close.id); }
  }
  // keys on the plate itself (the bridge stops a key at the window root, where Svelte's delegated onkeydown would be)
  const keyed = el => { el.addEventListener('keydown', keys); return () => el.removeEventListener('keydown', keys); };
  const g = $derived(d.grid || { x: 8, y: 8, w: win.w - 16, h: 144 });
</script>

<div class="mu" bind:this={panel} {@attach keyed}>
  <div class="shade" style:width="{win.w}px" style:height="{win.h}px"></div>
  <div class="plate" style:width="{win.w}px" style:height="{win.h}px"
    style:--hx="{g.x + 32}px" style:--hy="{g.y}px" style:--hw="{g.w - 64}px" style:--hh="{g.h}px"></div>
  <header class="tab"><Icon name="deck" size={16} />Duel Disks</header>
  <div class="hole" style:left="{g.x + 32}px" style:top="{g.y}px" style:width="{g.w - 64}px" style:height="{g.h}px"></div>
  {#each [d.prev, d.next] as a, i (i)}
    {#if a}
      <span class="arrow" data-state={a.state} style:left="{a.x}px" style:top="{a.y}px" style:width="{a.w}px" style:height="{a.h}px">
        <Icon name={i ? 'chevron' : 'back'} size={22} /></span>
    {/if}
  {/each}
  <div class="about mu-scroll" style:top="{g.y + g.h + 10}px" style:width="{win.w - 24}px">
    {#if d.name}<b>{d.name}</b>{d.text}{:else}<span class="hint">Drag a disk onto a lit slot on the shelf to put it on show. Point at one to read about it.</span>{/if}
  </div>
  {#if d.close}
    <button type="button" class="mu-btn gold close" data-state={d.close.state} onclick={() => api.click(d.close.id)}
      style:left="{d.close.x}px" style:top="{d.close.y - 2}px" style:width="{d.close.w}px">{d.close.label}</button>
  {/if}
</div>

<style>
  .shade, .plate { position: absolute; left: 0; top: 0; border-radius: var(--r-plate); }
  .shade { box-shadow: 0 0 0 1px var(--plate-edge), 0 16px 32px -14px rgba(10, 35, 80, .45), 0 3px 8px rgba(10, 35, 80, .16); }
  /* the plate with a window over the game's grid of disks */
  .plate { background: var(--plate); box-shadow: inset 0 1px 0 var(--plate-hi);
    -webkit-mask: linear-gradient(#000 0 0), linear-gradient(#000 0 0) var(--hx) var(--hy) / var(--hw) var(--hh) no-repeat;
    -webkit-mask-composite: xor; mask-composite: exclude; }
  .hole { position: absolute; border-radius: 4px; box-shadow: 0 0 0 1px var(--plate-edge), 0 0 0 4px var(--n100); pointer-events: none; }
  .tab { position: absolute; left: 14px; top: -30px; display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 14px; border-radius: 10px 10px 0 0;
    font-size: 13px; font-weight: 800; color: #fff; background: var(--band); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .28); }
  .tab :global(.mu-ico) { color: var(--gold-300); }
  .arrow { position: absolute; display: grid; place-items: center; border-radius: var(--r-ctl); color: var(--icon); background: var(--btn);
    box-shadow: 0 0 0 1px var(--btn-edge), inset 0 1px 0 #fff; transition: background .14s, box-shadow .14s; }
  .arrow[data-state='hover'] { background: var(--btn-hover); box-shadow: 0 0 0 1px var(--gold-edge), inset 0 1px 0 #fff; color: var(--icon-warm); }
  .arrow[data-state='pressed'] { background: var(--gold); }
  .arrow[data-state='disabled'] { opacity: .4; }
  .about { position: absolute; left: 12px; height: 54px; padding: 6px 10px; border-radius: var(--r-ctl); font-size: 12px; line-height: 1.4; color: var(--ink);
    background: var(--well); box-shadow: var(--well-shadow); pointer-events: auto; }
  .about b { margin-right: 6px; color: var(--ink-strong); }
  .hint { color: var(--ink-3); }
  .close { position: absolute; height: 28px; pointer-events: auto; }
</style>
