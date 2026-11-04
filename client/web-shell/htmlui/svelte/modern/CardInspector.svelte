<script>
  import { picture } from './deck/pictures.js';
  import { typeLine, group } from './deck/editor.js';
  import CardRarity from './CardRarity.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const cardId = $derived(win.card);
  const card = $derived(globalThis.yo2Deck?.card(cardId));
  let pinned = $state(null), hidden = $state(false), collapsed = $state(false);
  let x = $state(18), y = $state(100), drag = null;
  const shown = $derived(pinned || card);
  $effect(() => { cardId; hidden = false; });
  const text = $derived(shown ? globalThis.yo2Deck?.desc(shown.id) || '' : '');
  function down(e) {
    if (e.button || e.target.closest('button')) return;
    const scale = document.getElementById('canvas').getBoundingClientRect().width / 1024;
    drag = { x: e.clientX, y: e.clientY, left: x, top: y, scale, height: e.currentTarget.closest('section').getBoundingClientRect().height / scale };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e) {
    if (!drag) return;
    x = Math.max(0, Math.min(784, drag.left + (e.clientX - drag.x) / drag.scale));
    y = Math.max(0, Math.min(Math.max(0, 768 - drag.height), drag.top + (e.clientY - drag.y) / drag.scale));
  }
</script>

{#if shown && !hidden}
  <div class="mu inspector" style:left="{x - win.x}px" style:top="{y - win.y}px">
    <section class="mu-plate panel" aria-label="Card details">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <header class="mu-head" onpointerdown={down} onpointermove={move} onpointerup={() => (drag = null)} onpointercancel={() => (drag = null)}>
        <h2>Card details</h2>
        <button type="button" class="mu-icon-btn" class:active={!!pinned} aria-label={pinned ? 'Unpin card' : 'Pin card'} aria-pressed={!!pinned} onclick={() => (pinned = pinned ? null : shown)}>⌖</button>
        <button type="button" class="mu-icon-btn" aria-label={collapsed ? 'Expand card details' : 'Collapse card details'} onclick={() => (collapsed = !collapsed)}>{collapsed ? '+' : '−'}</button>
        <button type="button" class="mu-icon-btn" aria-label="Close card details" onclick={() => (hidden = true)}>×</button>
      </header>
      {#if !collapsed}
        <div class="body">
          <img use:picture={shown.id} alt={shown.name} draggable="false" />
          <h3>{shown.name} <CardRarity id={shown.id} /></h3><p class="kind">{typeLine(shown)}</p>
          {#if group(shown) === 'monster'}<p class="stats">ATK <b>{shown.atk < 0 ? '?' : shown.atk}</b> <span>DEF <b>{shown.def < 0 ? '?' : shown.def}</b></span></p>{/if}
          <div class="description mu-scroll">{text}</div>
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .inspector { position: absolute; width: 232px; pointer-events: none; }
  .panel { position: relative; width: 232px; pointer-events: auto; animation: none; }
  .panel::after { background: var(--plate); }
  .panel::before { background: var(--frame); }
  header { cursor: grab; touch-action: none; gap: 3px; }
  header:active { cursor: grabbing; }
  header h2 { flex: 1; font-size: 13px; letter-spacing: 0; }
  header button { width: 23px; height: 23px; font-size: 17px; flex-shrink: 0; }
  .active { color: var(--gold-400); }
  .body { padding: 10px; display: grid; gap: 6px; }
  img { width: 132px; height: 191px; object-fit: contain; justify-self: center; border-radius: 2px; background: var(--well); }
  h3 { margin: 0; font-size: 14px; overflow-wrap: anywhere; }
  p { margin: 0; font-size: 12px; color: var(--ink-3); }
  .stats { color: var(--ink-strong); font-variant-numeric: tabular-nums; }
  .stats span { margin-left: 14px; }
  .description { max-height: 150px; overflow-y: auto; white-space: pre-wrap; font-size: 12px; line-height: 1.5; }
</style>
