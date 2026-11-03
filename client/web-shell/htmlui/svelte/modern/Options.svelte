<script>
  // The title's Options, modern (COptionDlg; logic.js options): the game's own layout, painted. Pass mode: the game keeps
  // every click and the volume drag; the flag and screen pictures stay its own. Before: a cream card of flags with no
  // names; now in the game frame with an OPTIONS plaque above the game's layout and two monitor pictures with no words. Now the sections are named on the plate, the chosen flag and screen
  // are ringed in gold, a flag or screen under the pointer says what it is on its section's line (the language's own
  // name, "Full screen" / "Window"); the plate has a hole over each picture, the volume is a modern track with - / + at its ends, OK is gold. OK and Cancel take the pointer and the
  // focus: Enter is OK, Esc Cancel.
  import { options } from './logic.js';
  import { focusSoon } from './macro.js';
  import GameButton from './game/GameButton.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const o = $derived(options(win));
  const api = $derived(view.api);
  const shown = $derived(win.shown);
  let panel;
  $effect(() => shown ? focusSoon(panel, '.ok') : undefined);
  const hoverFlag = $derived(o.flags.find(f => f.c.state === 'hover'));
  const hoverScreen = $derived(o.screens.find(f => f.c.state === 'hover'));
  const value = [() => hoverFlag?.name || o.lang, () => hoverScreen?.name || o.screen];
  function keys(e) {
    if (e.key === 'Escape' && o.cancel) { e.preventDefault(); api.click(o.cancel.id); }
  }
  // keys on the panel itself (the bridge stops a key at the window root, where Svelte's delegated onkeydown would be)
  const keyed = el => { el.addEventListener('keydown', keys); return () => el.removeEventListener('keydown', keys); };
  // the game frame (theme.js .mu-plate) grown by its plaque above the game's own layout (PLAQUE px), with a hole over
  // each picture the game keeps drawing (the DOM is over the canvas). The clip's outer edge is 40 px out, so the
  // plate's drop shadow stays; its holes cut the frame's field (its ::after) too
  const PLAQUE = 44, FOOT = 10;   // and a foot under the game's OK / Cancel (they end 5 px from its window's edge)
  const holes = $derived(`path(evenodd, "M-40 -40H${win.w + 40}V${win.h + PLAQUE + FOOT + 40}H-40Z${[...o.flags, ...o.screens].map(({ c }) => `M${c.x} ${c.y + PLAQUE}h${c.w}v${c.h}h${-c.w}Z`).join('')}")`);
  const ring = c => `left:${c.x - 4}px;top:${c.y - 4}px;width:${c.w + 8}px;height:${c.h + 8}px`;
</script>

<div class="mu" bind:this={panel} {@attach keyed}>
  <div class="mu-plate" style:left="0" style:top="{-PLAQUE}px" style:width="{win.w}px" style:height="{win.h + PLAQUE + FOOT}px" style:clip-path={holes}>
    <header class="mu-head"><h2>Options</h2></header>
  </div>
  {#each o.heads as h, i (h.c.id)}
    <p class="head" style:top="{h.c.y - 2}px" style:width="{win.w}px">{h.text}{#if i < 2 && value[i]()}<span class="val">{value[i]()}</span>{/if}</p>
  {/each}
  {#each [...o.flags, ...o.screens] as f (f.c.id)}
    <span class="ring" class:on={f.c.checked} class:hover={f.c.state === 'hover'} style={ring(f.c)}></span>
  {/each}
  {#if o.slider}
    <div class="track" style:left="{o.slider.c.x}px" style:top="{o.slider.c.y + o.slider.c.h / 2 - 3}px" style:width="{o.slider.c.w}px">
      <i style:width="{(o.slider.knob?.frac ?? 0) * 100}%"></i>
      {#if o.slider.knob}<b style:left="{o.slider.knob.x}px"></b>{/if}
    </div>
  {/if}
  {#each [[o.down, '−'], [o.up, '+']] as [b, t] (t)}
    {#if b}<span class="step" data-state={b.state} style:left="{b.x}px" style:top="{b.y}px" style:width="{b.w}px" style:height="{b.h}px">{t}</span>{/if}
  {/each}
  {#each [o.ok, o.cancel] as b (b?.id)}
    {#if b}
      <GameButton ctl={b} {api} gold={b === o.ok} class={b === o.ok ? 'ok' : ''} label={b.label}
        style="position: absolute; left: {b.x}px; top: {b.y - 2}px; width: {b.w}px; height: 28px; pointer-events: auto" />
    {/if}
  {/each}
</div>

<style>
  .head { position: absolute; left: 0; margin: 0; display: flex; justify-content: center; align-items: baseline; gap: 8px; font-family: var(--display); font-size: 11px; font-weight: 400;
    letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
  .val { font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif; font-size: 13px; font-weight: 750; letter-spacing: 0; text-transform: none; color: var(--ink-strong); }
  .ring { position: absolute; border-radius: 3px; box-shadow: 0 0 0 1px var(--n200); transition: box-shadow .14s; }
  .ring.hover { box-shadow: 0 0 0 2px var(--p500); }
  .ring.on { box-shadow: 0 0 0 3px var(--gold-400), 0 0 0 4px var(--gold-edge), 0 4px 10px -4px rgba(140, 80, 0, .5); }
  .track { position: absolute; height: 6px; border-radius: 3px; background: var(--n200); box-shadow: inset 0 1px 1px rgba(10, 35, 80, .15); }
  .track i { display: block; height: 100%; border-radius: 3px; background: var(--sel); }
  .track b { position: absolute; top: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; background: var(--gold);
    box-shadow: 0 0 0 1px var(--gold-edge), 0 2px 4px rgba(120, 70, 0, .3); }
  .step { position: absolute; display: grid; place-items: center; border-radius: 50%; font-size: 16px; font-weight: 800; color: var(--icon); background: var(--btn);
    box-shadow: 0 0 0 1px var(--btn-edge); }
  .step[data-state='hover'] { box-shadow: 0 0 0 1px var(--gold-edge); color: var(--icon-warm); }
  .step[data-state='pressed'] { background: var(--gold); }
</style>
