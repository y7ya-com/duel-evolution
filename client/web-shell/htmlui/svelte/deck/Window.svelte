<script>
  // A deck window (the deck panel, the file list, the card detail): its items back to front, from its plan in the store
  import { deck } from './state.svelte.js';
  import Item from './Item.svelte';
  let { view } = $props();
  const L = $derived(deck.wins.get(view.win.id));
  // the card detail draws nothing past its own drawn rect (its text can't run over the bottom bar or off the screen)
  const clip = $derived.by(() => {
    const w = view.win, r = w.cls === 'CCardDetailViewDlg' && (w.drawn || w), at = (x, y) => `${x - w.x}px ${y - w.y}px`;
    return r ? `polygon(${at(r.x, r.y)}, ${at(r.x + r.w, r.y)}, ${at(r.x + r.w, r.y + r.h)}, ${at(r.x, r.y + r.h)})` : null;
  });
</script>

<div class="layer" style:clip-path={clip}>
  {#if L}
    {#each L.plan.items as it (it.kind + it.id)}
      <Item {it} ox={L.win.x} oy={L.win.y} />
    {/each}
  {/if}
</div>
