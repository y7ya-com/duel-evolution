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
    color: var(--ink-strong); background: #fff; box-shadow: inset 0 1px 2px rgba(11, 42, 92, .2), 0 0 0 1px #e08a1e; }
  .mu-search :global(.dk-field:focus) { box-shadow: inset 0 1px 2px rgba(11, 42, 92, .2), 0 0 0 1px #0985ff, 0 0 0 3px rgba(0, 150, 255, .35); }
  .mu-search :global(.dk-field::placeholder) { color: #5b6f8c; }
  .mu-search :global(.dk-chip) { border: 0; border-radius: 10px; margin-right: 2px; color: var(--ink-strong); background: #fff;
    box-shadow: inset 0 0 0 1px rgba(58, 157, 230, .6); }
  /* the category's colour as a dot (no side stripe) */
  .mu-search :global(.dk-chip::before) { content: ''; display: inline-block; width: 6px; height: 6px; margin-right: 3px; border-radius: 50%;
    background: var(--c); vertical-align: 1px; box-shadow: 0 0 0 1px rgba(0, 0, 0, .2); }
  .mu-search :global(.dk-chip:hover) { background: #e2f7ff; }
  .mu-search :global(.dk-chip[aria-pressed=true]) { color: var(--gold-ink); background: linear-gradient(180deg, #ffffc8, #f4d558);
    box-shadow: 0 0 0 1px var(--gold-edge); font-weight: 700; }
  .mu-search :global(.dk-btn) { border-radius: var(--r-ctl) var(--r-ctl) var(--r-ctl) 4px; font: inherit; font-size: 12.5px; font-weight: 750; text-shadow: none; color: var(--gold-ink);
    background: linear-gradient(180deg, #ffffc8 0%, #fff97f 30%, #f9e45f 50%, #f4d558 62%, #f0be45 85%, #eca430 100%);
    box-shadow: 0 0 0 1px var(--gold-edge), inset 0 1px 0 #fff, 0 2px 4px rgba(160, 80, 0, .3); }
  .mu-search :global(.dk-btn:hover) { color: var(--gold-ink); text-shadow: none; background: linear-gradient(180deg, #ffffff, #ffffe2 30%, #fcf4b8 50%, #faeaac 62%, #f2b55e); }
  .mu-search :global(.dk-pop) { border: 0; border-radius: var(--r-plate) var(--r-plate) var(--r-plate) 6px;
    background: linear-gradient(180deg, rgba(255, 255, 255, .7), rgba(255, 255, 255, .1) 50%), linear-gradient(180deg, #e8fbff, #b9f1ff 50%, #8fe6fc);
    box-shadow: 0 0 0 1px #2f8fd6, inset 0 0 0 2px rgba(167, 255, 255, .9), 0 18px 36px -14px rgba(10, 60, 130, .55); }
  .mu-search :global(.dk-head), .mu-search :global(.dk-strip) { background: rgba(255, 255, 255, .6); border: 0; border-radius: 8px; }
  .mu-search :global(.dk-lbl), .mu-search :global(.dk-dash) { color: var(--ink-2); font: inherit; font-size: 12px; font-weight: 700; line-height: 24px; }
  .mu-search :global(.dk-count) { font: inherit; font-size: 12px; font-weight: 800; color: var(--warm); text-shadow: 0 1px 0 #fff; }
  .mu-search :global(.dk-x) { color: var(--ink-3); }
</style>
