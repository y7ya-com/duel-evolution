<script module>
  // A deck window in the modern skin: the plate (the window's rect, cut around every card face the engine draws), a
  // header rule where the engine's header band ends, then its items (DeckItem). The deck panel and the trunk have an
  // 88 px header band (deckbar_01), the card detail a 24 px title bar.
  export const HEAD = { CWindowModelDeck: 88, CWindowModelKaban: 88, CCardDetailViewDlg: 24, CWindowModelFileList: 24 };
</script>

<script>
  import { clip } from '../../../screens/deck.js';
  import { deck } from '../../deck/state.svelte.js';
  import DeckItem from './DeckItem.svelte';
  import { deckCheck } from '../logic.js';
  import { inEditor } from '../../deck/art.js';
  let { view } = $props();
  const L = $derived(deck.wins.get(view.win.id));
  const win = $derived(view.win);
  const head = $derived(HEAD[win.cls] ?? 0);
  // the plate around every shown control (the file list's OK / Cancel sit below its nominal rect)
  const box = $derived(win.controls.filter(c => c.shown && !c.parent && c.w && c.x < 9999).reduce((b, c) =>
    ({ w: Math.max(b.w, c.x + c.w), h: Math.max(b.h, c.y + c.h) }), { w: win.w, h: win.h }));
  // a modal window (the file list's dialogs) is in front of every other deck window: only its own card faces cut it
  const holes = $derived(win.modal && L ? L.plan.holes : deck.holes);
  const cut = $derived(clip({ z: win.modal ? 0 : -Infinity, rect: { x: win.x, y: win.y, w: box.w, h: box.h } }, holes, win.x, win.y));
  const buttons = $derived(L ? L.plan.items.filter(it => it.kind === 'button') : []);
  // the deck panel in the editor: the deck's check, live (its counts from the engine every frame)
  const check = $derived(win.cls === 'CWindowModelDeck' && inEditor() ? deckCheck(win.controls.find(c => c.cls === 'CWindowTaskDeck')?.counts) : null);
</script>

<div class="mu">
  {#if win.modal && win.cls === 'CWindowModelFileList'}<div class="scrim" style:left="{-win.x}px" style:top="{-win.y}px"></div>{/if}
  <div class="mu-plate dplate" class:detail={win.cls === 'CCardDetailViewDlg'} style:width="{box.w}px" style:height="{box.h}px" style:clip-path={cut}>
    {#if head}<div class="band" class:trunk={win.cls === 'CWindowModelKaban'} class:detail={head === 24} style:height="{head}px"></div>{/if}
    <!-- the switches' plates (the game's state: pass mode), under every item: their captions are items above -->
    {#each buttons as b (b.id)}
      <div class="mu-btn sw" data-state={b.enabled ? b.state : 'disabled'} style:left="{b.x}px" style:top="{b.y}px" style:width="{b.w}px" style:height="{b.h}px"></div>
    {/each}
  </div>
  {#if check}
    <div class="check" class:ok={check.ok} role="status" aria-label={check.ok ? 'The deck is legal' : 'The deck is not legal yet'}>
      <span class="verdict">{#if check.ok}<svg class="mu-ico" viewBox="0 0 20 20"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>Ready to duel{:else}<svg class="mu-ico" viewBox="0 0 20 20"><path d="M10 5v6M10 14.5v.5" /></svg>Not legal yet{/if}</span>
      {#each check.parts as part (part.key)}
        <span class="part" class:bad={!part.ok} title="{part.label}: {part.rule}"><b>{part.n}</b> {part.label}</span>
      {/each}
      <span class="keys"><kbd>/</kbd> search · <kbd>Ctrl</kbd><kbd>S</kbd> save · <kbd>Ctrl</kbd><kbd>O</kbd> load</span>
    </div>
  {/if}
  <!-- the file list's dialogs: their texts let the press through to the engine's rows (pass mode) -->
  <div class="layer" class:through={win.cls === 'CWindowModelFileList'}>
    {#if L}
      {#each L.plan.items as it (it.kind + it.id)}
        <DeckItem {it} ox={L.win.x} oy={L.win.y} {holes} />
      {/each}
    {/if}
  </div>
</div>

<style>
  .scrim { position: absolute; width: 1024px; height: 768px; background: rgba(10, 50, 120, .3); animation: mu-fade .2s var(--ease) both; }
  @keyframes mu-fade { from { opacity: 0; } }
  .dplate { left: 0; top: 0; border-radius: var(--r-plate) var(--r-plate) var(--r-plate) 6px; animation: none; }
  .detail { border-radius: 14px 14px 5px 14px; }
  .band { position: absolute; left: 0; right: 0; top: 0; border-radius: var(--r-plate) var(--r-plate) 0 0;
    background: linear-gradient(180deg, #ffffff, var(--n100)); box-shadow: inset 0 -1px 0 var(--n200), inset 0 -2px 0 var(--p200); }
  .band.trunk { background: linear-gradient(180deg, #ffffff, var(--n100)); }
  .band.detail { background: var(--band); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .28), inset 0 -1px 0 var(--band-edge); }
  .sw { position: absolute; padding: 0; z-index: 2; }
  /* the deck's check: a strip along the panel's foot */
  .check { position: absolute; left: 10px; right: 10px; bottom: 8px; height: 26px; display: flex; align-items: center; gap: 10px; padding: 0 10px;
    border-radius: 13px; font-size: 12px; color: var(--ink-2); background: #fff; box-shadow: 0 0 0 1px #e8b4b8, inset 3px 0 0 var(--bad); z-index: 3; }
  .check.ok { box-shadow: 0 0 0 1px #b6dcc2, inset 3px 0 0 var(--ok); }
  .verdict { display: inline-flex; align-items: center; gap: 4px; font-weight: 800; color: var(--bad); white-space: nowrap; }
  .ok .verdict { color: var(--ok); }
  .verdict .mu-ico { width: 16px; height: 16px; stroke-width: 2.6; }
  .part { white-space: nowrap; }
  .part b { font-weight: 800; color: var(--ink-strong); }
  .part.bad b { color: var(--bad); }
  .keys { margin-left: auto; font-size: 11px; color: var(--ink-3); white-space: nowrap; }
  .keys kbd { display: inline-block; min-width: 14px; padding: 0 3px; margin-right: 1px; border-radius: 3px; font: inherit; font-weight: 800; font-size: 10px;
    line-height: 14px; text-align: center; color: var(--ink-2); background: #fff; box-shadow: inset 0 -1px 0 rgba(10, 60, 140, .3), 0 0 0 1px rgba(10, 60, 140, .2); }
  .through :global(div) { pointer-events: none !important; }
  .layer { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
</style>
