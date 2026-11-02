<script>
  // The trunk (CWindowModelKaban) in the modern skin: the window as DeckWindow, and in the deck editor the legacy deck's
  // native scroller over its rows and its search panel (svelte/deck: the same behaviour), the panel restyled here
  import DeckWindow from './DeckWindow.svelte';
  import Trunk from '../../deck/Trunk.svelte';
  import Search from '../../deck/Search.svelte';
  import { inEditor } from '../../deck/art.js';
  let { view } = $props();
  const editor = inEditor();
  const list = $derived(view.win.controls.find(c => c.cls === 'CWindowTaskKabanList'));
</script>

<DeckWindow {view} />
{#if editor && list}
  <div class="mu mu-search">
    <Trunk {list} api={view.api} />
    <Search hits={list.hits} apply={f => globalThis.Module?.yo2KabanFilter?.(list.id, f)} />
  </div>
{/if}

<style>
  /* the search panel (Search.svelte's dk-* pieces) in the modern look */
  .mu-search { pointer-events: none; }
  .mu-search :global(.dk-field) { height: 24px; border: 0; border-radius: 12px; padding: 0 22px 0 10px; font: inherit; font-size: 12.5px;
    color: var(--ink-strong); background: #fff; box-shadow: inset 0 1px 2px rgba(11, 42, 92, .12), 0 0 0 1px var(--btn-edge); }
  .mu-search :global(.dk-field:focus) { box-shadow: inset 0 1px 2px rgba(11, 42, 92, .2), 0 0 0 1px var(--p500), 0 0 0 3px var(--p200); }
  .mu-search :global(.dk-field::placeholder) { color: #5b6f8c; }
  .mu-search :global(.dk-chip) { border: 0; border-radius: 10px; margin-right: 2px; color: var(--ink-strong); background: #fff;
    box-shadow: inset 0 0 0 1px var(--btn-edge); }
  /* the category's colour as a dot (no side stripe) */
  .mu-search :global(.dk-chip::before) { content: ''; display: inline-block; width: 6px; height: 6px; margin-right: 3px; border-radius: 50%;
    background: var(--c); vertical-align: 1px; box-shadow: 0 0 0 1px rgba(0, 0, 0, .2); }
  .mu-search :global(.dk-chip:hover) { background: var(--p50); }
  .mu-search :global(.dk-chip[aria-pressed=true]) { color: #fff; background: var(--sel); box-shadow: 0 0 0 1px var(--p900); font-weight: 700; }
  .mu-search :global(.dk-btn) { border-radius: var(--r-ctl) var(--r-ctl) var(--r-ctl) 4px; font: inherit; font-size: 12.5px; font-weight: 750; text-shadow: none; color: var(--ink-strong);
    background: var(--btn); box-shadow: 0 0 0 1px var(--btn-edge), inset 0 1px 0 #fff; }
  .mu-search :global(.dk-btn:hover) { color: var(--ink-strong); text-shadow: none; background: var(--btn-hover); }
  .mu-search :global(.dk-pop) { border: 0; border-radius: var(--r-plate) var(--r-plate) var(--r-plate) 6px;
    background: var(--plate); box-shadow: 0 0 0 1px var(--plate-edge), inset 0 1px 0 #fff, 0 16px 32px -14px rgba(10, 35, 80, .45); }
  .mu-search :global(.dk-head), .mu-search :global(.dk-strip) { background: rgba(255, 255, 255, .6); border: 0; border-radius: 8px; }
  .mu-search :global(.dk-lbl), .mu-search :global(.dk-dash) { color: var(--ink-2); font: inherit; font-size: 12px; font-weight: 700; line-height: 24px; }
  .mu-search :global(.dk-count) { font: inherit; font-size: 12px; font-weight: 700; color: var(--ink-3); text-shadow: none; }
  .mu-search :global(.dk-x) { color: var(--ink-3); }
</style>
