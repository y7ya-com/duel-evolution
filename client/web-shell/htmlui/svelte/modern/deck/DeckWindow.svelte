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
</script>

<div class="mu">
  {#if win.modal}<div class="scrim" style:left="{-win.x}px" style:top="{-win.y}px"></div>{/if}
  <div class="mu-plate dplate" class:detail={win.cls === 'CCardDetailViewDlg'} style:width="{box.w}px" style:height="{box.h}px" style:clip-path={cut}>
    {#if head}<div class="band" style:height="{head}px"></div>{/if}
    <!-- the switches' plates (the game's state: pass mode), under every item: their captions are items above -->
    {#each buttons as b (b.id)}
      <div class="mu-btn sw" data-state={b.enabled ? b.state : 'disabled'} style:left="{b.x}px" style:top="{b.y}px" style:width="{b.w}px" style:height="{b.h}px"></div>
    {/each}
  </div>
  <div class="layer">
    {#if L}
      {#each L.plan.items as it (it.kind + it.id)}
        <DeckItem {it} ox={L.win.x} oy={L.win.y} {holes} />
      {/each}
    {/if}
  </div>
</div>

<style>
  .scrim { position: absolute; width: 1024px; height: 768px; background: rgba(2, 10, 30, .45); animation: mu-fade .2s var(--ease) both; }
  @keyframes mu-fade { from { opacity: 0; } }
  .dplate { left: 0; top: 0; border-radius: 14px 14px 14px 5px; animation: none; }
  .detail { border-radius: 14px 14px 5px 14px; }
  .band { position: absolute; left: 0; right: 0; top: 0; border-radius: 14px 14px 0 0;
    background: linear-gradient(180deg, rgba(125, 239, 252, .16), rgba(9, 133, 255, .06)); }
  .band::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: 0; height: 1px;
    background: linear-gradient(90deg, rgba(117, 255, 255, .7), rgba(117, 255, 255, .1) 75%, transparent); }
  .sw { position: absolute; padding: 0; z-index: 2; }
  .layer { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
</style>
