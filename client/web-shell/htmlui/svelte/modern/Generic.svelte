<script module>
  // the generic windows up now (their ids): the dock leaves Enter to them while one is
  export const openGeneric = new Set();
</script>

<script>
  // Any window with no bespoke modern screen (logic.js generic, GENERIC): its controls in the modern look at the engine's
  // own places. Pass mode: the engine keeps every input and its own focus, so this is paint only (no <button>s of its
  // own: the game's are what the pointer and keys reach). Pictures, Flash and unknown controls stay the engine's, cut
  // out of the plate.
  import { generic, genericKeys, family, duelPrompt } from './logic.js';
  import DuelPrompt from './DuelPrompt.svelte';
  import Icon from './Icon.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const g = $derived(generic(win));
  // an in-duel prompt waiting for a click on the field or hand: the banner and the ring instead (DuelPrompt)
  const prompt = $derived(duelPrompt(win));
  // everything drawn here with the engine's pictures cut out (evenodd: the window's box and a margin for the plate's
  // shadow, then each hole): nothing of the DOM ever covers what the engine still draws
  const cut = $derived.by(() => {
    if (!g.holes.length) return null;
    const m = 40, r = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;
    return `path(evenodd, '${r(-m, -m, win.w + 2 * m, win.h + 2 * m)}${g.holes.map(h => r(h.x, h.y, h.w, h.h)).join('')}')`;
  });
  // a button a little inside its rect: the engine's often touch (the Duel Log's tabs)
  const inset = c => c.w > 40 ? { x: c.x + 2, y: c.y + 1, w: c.w - 4, h: c.h - 2 } : c;
  const at = c => `left: ${c.x}px; top: ${c.y}px; width: ${c.w}px; height: ${c.h}px;`;
  // the engine lays text out on its own line pitch (fontSize + lineGap): kept, so pageLines fit where it put them
  const px = c => Math.min(13.5, (c.fontSize || 16) * .82);
  const lh = c => (c.fontSize || 16) + (c.lineGap || 0);
  // a caption's size: the button's height allows, shrunk until it fits its width (about .58 em a character), 9.5 px at least
  const fit = (s, c) => Math.max(9.5, Math.min(13, c.h * .42, (c.w - 20) / Math.max(1, s.length * .58)));
  // Esc its way out, Enter its primary (DESIGN.md UX spec 1): the game's own buttons pressed, from the topmost window
  // only, never while a field (the DOM's or the game's) has the focus
  const keys = $derived(genericKeys(g));
  const wid = $derived(win.id);   // a number: the listener isn't redone each frame the snapshot changes
  $effect(() => {
    const id = wid;
    openGeneric.add(id);
    const key = e => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.key !== 'Escape' && e.key !== 'Enter')) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable) return;
      const snap = globalThis.yo2Html?.snapshot?.();
      const top = snap?.windows.filter(w => w.shown).reduce((a, w) => !a || w.z > a.z ? w : a, null);
      if (!top || top.id !== id) return;
      const f = snap.focus && top.controls.find(c => c.id === snap.focus);
      if (f && family(f) === 'input') return;
      const b = e.key === 'Escape' ? keys.leave : keys.primary;
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();   // not the game's too
      view.api.click(b.id);
    };
    addEventListener('keydown', key, true);
    return () => { removeEventListener('keydown', key, true); openGeneric.delete(id); };
  });
  // a modal window's scrim (UX spec 2): the screen dimmed behind it, its own pictures' holes kept clear
  const scrimCut = $derived(g.holes.length
    ? `path(evenodd, 'M0 0h1024v768h-1024z${g.holes.map(h => `M${h.x + win.x} ${h.y + win.y}h${h.w}v${h.h}h${-h.w}z`).join('')}')` : null);
  const ICON = { Hide: 'close', Show: 'chevron', Expand: 'plus', Shrink: 'back' };
</script>

{#if prompt}
<div class="mu"><DuelPrompt p={prompt} {win} /></div>
{:else}
{#if win.modal}<div class="scrim" aria-hidden="true" style:left="{-win.x}px" style:top="{-win.y}px" style:clip-path={scrimCut} style:opacity={win.alpha ?? 1}></div>{/if}
<div class="mu" aria-hidden="true" style:opacity={win.alpha ?? 1} style:clip-path={cut}>
  {#if g.plate}
    <div class="mu-plate plate" style={at(g.plate)}>
      {#if g.band}<div class="mu-plaque band" style:height="{g.band.h - 5}px"><span>{g.band.title}</span></div>{/if}
    </div>
  {/if}
  {#each g.items as it (it.kind + it.c.id)}
    {@const c = it.c}
    {#if it.kind === 'well'}
      <div class="well" style={at(c)}></div>
    {:else if it.kind === 'text'}
      <div class="text" class:heading={it.heading && !it.well} class:inwell={it.well} style={at(c)} style:font-size="{px(c)}px" style:line-height="{lh(c)}px"
        style:text-align={['left', 'center', 'right'][c.align] || 'left'}>{it.text}</div>
    {:else if it.kind === 'button'}
      <span class="mu-btn gbtn" class:gold={it.gold} class:on={c.checked} data-state={c.enabled === false ? 'disabled' : c.state}
        style={at(inset(c))} style:font-size="{fit(it.label, c)}px"><span class="lbl">{it.label}</span></span>
    {:else if it.kind === 'check'}
      <span class="check" class:on={c.checked} style={at(c)}><span class="box">{#if c.checked}<Icon name="chevron" size={12} />{/if}</span></span>
    {:else if it.kind === 'tab'}
      <span class="mu-tab tab" class:on={c.active} style={at(c)}>{c.label || ''}</span>
    {:else if it.kind === 'input'}
      <span class="mu-field field" class:focus={c.focused} class:multi={c.multiLine} style={at(c)}>{c.password ? '•'.repeat((c.value || '').length) : c.value || ''}{#if c.focused && c.caretOn !== false}<i class="caret"></i>{/if}</span>
    {:else if it.kind === 'list'}
      <div class="mu-list list" style={at(c)}>
        {#each it.rows as r (r.i)}
          <div class="mu-row row" class:on={r.selected} class:marked={r.marked} style:height="{c.h / Math.max(1, c.rows || it.rows.length)}px">{r.text}</div>
        {/each}
      </div>
    {:else if it.kind === 'scroll'}
      <div class="scroll" class:h={c.horizontal} style={at(c)}>
        <span class="thumb" style={c.horizontal ? `left: ${it.thumb.at * 100}%; width: ${it.thumb.len * 100}%` : `top: ${it.thumb.at * 100}%; height: ${it.thumb.len * 100}%`}></span>
      </div>
    {:else if it.kind === 'slider'}
      <div class="slider" style={at(c)}>
        <span class="track"><span class="fill" style:width="{(it.knob?.frac ?? 0) * 100}%"></span></span>
        {#if it.knob}<span class="knob" style:left="{it.knob.x}px"></span>{/if}
      </div>
    {:else if it.kind === 'icon'}
      <span class="icon" class:onband={g.band && c.y < g.plate.y + g.band.h} data-state={c.pressed ? 'pressed' : ''} style={at(c)}><Icon name={ICON[c.cls.replace(/^CWindowTaskIcon/, '')] || 'dot'} size={Math.min(16, c.h)} /></span>
    {/if}
  {/each}
</div>
{/if}

<style>
  .mu > * { position: absolute; }
  .scrim { position: absolute; width: 1024px; height: 768px; background: rgba(10, 50, 120, .22); pointer-events: none; }
  .plate { overflow: hidden; }
  .band { position: absolute; left: 0; right: 0; top: 0; }
  .well { border-radius: 6px; background: var(--well); box-shadow: inset 0 2px 3px rgba(10, 35, 80, .18), inset 0 0 0 1px #8ea2bf, 0 1px 0 rgba(255, 255, 255, .8); }
  .text { color: var(--ink); white-space: pre-wrap; word-break: break-word; overflow: hidden; }
  .text.heading { font-weight: 700; color: var(--ink-strong); }
  .text.inwell { padding: 8px 12px; }
  .gbtn { height: auto; padding: 0 8px; }
  .lbl { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gbtn.on { color: #fff; background: var(--sel); box-shadow: 0 0 0 1px var(--p700); }
  .check { display: flex; align-items: center; }
  .box { display: grid; place-items: center; width: 16px; height: 16px; border-radius: 5px; background: #fff;
    box-shadow: inset 0 1px 2px rgba(11, 42, 92, .15), 0 0 0 1px var(--btn-edge); color: #fff; }
  .check.on .box { background: var(--sel); box-shadow: 0 0 0 1px var(--p700); }
  .box :global(.mu-ico) { transform: rotate(90deg); }
  .tab { display: grid; place-items: center; height: auto; white-space: nowrap; overflow: hidden; }
  .field { display: flex; align-items: center; height: auto; padding: 0 8px; white-space: pre; overflow: hidden; }
  .field.multi { align-items: flex-start; padding-top: 4px; white-space: pre-wrap; }
  .field.focus { box-shadow: inset 0 2px 3px rgba(10, 35, 80, .22), inset 0 0 0 1px var(--gold-edge), 0 0 0 2px rgba(255, 200, 70, .55); }
  .caret { display: inline-block; width: 1.5px; height: 15px; margin-left: 1px; background: var(--ink-strong); }
  .list { overflow: hidden; }
  .row { min-height: 0; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row.marked { font-weight: 700; }
  .scroll { display: flex; justify-content: center; }
  .scroll::before { content: ''; position: absolute; inset: 2px calc(50% - 2px); border-radius: 2px; background: rgba(20, 60, 120, .1); }
  .scroll.h::before { inset: calc(50% - 2px) 2px; }
  .thumb { position: absolute; left: calc(50% - 3px); width: 6px; border-radius: 3px; background: var(--n500); }
  .scroll.h .thumb { top: calc(50% - 3px); height: 6px; left: auto; }
  .slider { display: flex; align-items: center; }
  .track { position: relative; flex: 1; height: 6px; border-radius: 3px; background: var(--n200); box-shadow: inset 0 1px 1px rgba(11, 42, 92, .15); overflow: hidden; }
  .fill { position: absolute; inset: 0 auto 0 0; background: var(--sel); }
  .knob { position: absolute; top: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 3px rgba(11, 42, 92, .35), 0 0 0 1px var(--btn-edge); }
  .icon { display: grid; place-items: center; border-radius: 50%; color: var(--ink-2); }
  .icon[data-state='pressed'] { background: rgba(20, 60, 120, .12); }
  .icon.onband { color: rgba(255, 255, 255, .92); }
</style>
