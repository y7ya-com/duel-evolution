<script>
  // A deck window (the deck panel, the file list, the card detail): its items back to front, from its plan in the store
  import { deck } from './state.svelte.js';
  import Item from './Item.svelte';
  let { view } = $props();
  const L = $derived(deck.wins.get(view.win.id));
</script>

<div class="layer">
  {#if L}
    {#each L.plan.items as it (it.kind + it.id)}
      <Item {it} ox={L.win.x} oy={L.win.y} />
    {/each}
  {/if}
</div>
