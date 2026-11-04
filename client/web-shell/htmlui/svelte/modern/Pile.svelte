<script>
  import { picture } from './deck/pictures.js';
  let { view } = $props();
  const win = $derived(view.win), p = $derived(win.pile || { kind: 3, cards: [], count: 0, offset: 0 });
  let panel = $state();
  const visible = $derived(win.shown);
  $effect(() => { if (visible) panel?.focus({ preventScroll: true }); });
  const inspect = $derived(p.kind < 6);
  const title = $derived(p.title || ({ 1: 'Fusion Deck', 2: 'Deck', 3: 'Graveyard', 4: 'Banished' })[p.kind] || 'Choose a card');
  const close = () => inspect && view.api.rightClick([win.x + win.w / 2, win.y + win.h / 2]);
  const browse = n => p.bar && view.api.setValue(p.bar, Math.max(0, Math.min(Math.max(0, p.count - 5), p.offset + n)));
  function keys(e) {
    if (e.key === 'Escape' && inspect) { e.preventDefault(); close(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); browse(-5); }
    if (e.key === 'ArrowRight') { e.preventDefault(); browse(5); }
  }
</script>

<div class="mu pile-root">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="mu-plate pile" role="dialog" aria-label={title} tabindex="-1" bind:this={panel} onkeydown={keys} style:width="{Math.max(400, win.w)}px">
    <header class="mu-head"><h2>{title}</h2><span class="count">{p.count} cards</span>{#if inspect}<button type="button" class="mu-icon-btn" aria-label="Close {title}" onclick={close}>×</button>{/if}</header>
    <div class="cards">
      {#each p.cards as c, i (i)}
        {@const known = c.faceUp && globalThis.yo2Deck?.card(c.id)}
        <button type="button" class="card" title={known?.name || 'Face-down card'} aria-label={known?.name || 'Face-down card'}
          onpointerenter={() => view.api.hoverAt([c.x, c.y])} onfocus={() => view.api.hoverAt([c.x, c.y])} onclick={() => view.api.click(win.id, [c.x, c.y])}>
          {#if known}<img use:picture={c.id} alt={known.name} draggable="false" />{:else}<span class="back">?</span>{/if}
          <span class="name">{known?.name || 'Face-down'}</span>
        </button>
      {:else}<p class="empty">{p.count === 0 ? 'No cards here.' : 'Loading cards…'}</p>{/each}
    </div>
    <footer>
      <button type="button" class="mu-btn" disabled={!p.bar || p.offset <= 0} onclick={() => browse(-5)}>‹ Previous</button>
      <span>{p.count ? `${p.offset + 1}–${Math.min(p.count, p.offset + 5)} of ${p.count}` : 'Empty'}</span>
      <button type="button" class="mu-btn" disabled={!p.bar || p.offset + 5 >= p.count} onclick={() => browse(5)}>Next ›</button>
      {#if inspect}<button type="button" class="mu-btn" onclick={close}>Close</button>{/if}
    </footer>
  </section>
</div>

<style>
  .pile-root { pointer-events: none; }
  .pile { position: absolute; left: 0; top: 0; pointer-events: auto; }
  .pile::after { background: var(--plate); }
  .count { font-size: 11px; color: white; white-space: nowrap; }
  .cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; padding: 12px 10px; min-height: 138px; }
  .card { min-width: 0; display: flex; flex-direction: column; gap: 5px; align-items: center; pointer-events: auto; }
  .card:hover img, .card:focus-visible img { outline: 2px solid var(--gold-400); }
  img, .back { width: 54px; height: 78px; object-fit: contain; border-radius: 3px; background: var(--p900); }
  .back { display: grid; place-items: center; color: white; font-size: 24px; }
  .name { width: 100%; font-size: 10px; line-height: 1.25; text-align: center; overflow-wrap: anywhere; }
  .empty { grid-column: 1 / -1; text-align: center; color: var(--ink-3); }
  footer { display: flex; align-items: center; gap: 6px; justify-content: space-between; padding: 0 10px 10px; }
  footer span { font-size: 10px; color: var(--ink-3); }
  footer button { font-size: 11px; padding: 0 8px; }
</style>
