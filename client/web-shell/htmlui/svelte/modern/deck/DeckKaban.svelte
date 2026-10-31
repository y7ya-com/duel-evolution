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
    color: var(--navy-900); background: linear-gradient(180deg, #fff, var(--silver-50));
    box-shadow: inset 0 1px 2px rgba(4, 17, 43, .35), 0 0 0 1px rgba(4, 17, 43, .6); }
  .mu-search :global(.dk-field:focus) { box-shadow: inset 0 1px 2px rgba(4, 17, 43, .35), 0 0 0 1px rgba(4, 17, 43, .6), 0 0 0 3px rgba(117, 255, 255, .55); }
  .mu-search :global(.dk-chip) { border: 0; border-radius: 6px; padding-left: 7px !important; margin-right: 2px;
    color: var(--ink); background: rgba(255, 255, 255, .08); box-shadow: inset 0 0 0 1px rgba(150, 205, 255, .3), inset 3px 0 0 var(--c); }
  .mu-search :global(.dk-chip:hover) { background: rgba(150, 205, 255, .18); }
  .mu-search :global(.dk-chip[aria-pressed=true]) { color: var(--navy-900); background: linear-gradient(180deg, var(--gold-200), var(--gold-300));
    box-shadow: 0 0 0 1px var(--gold-edge), inset 3px 0 0 var(--c); font-weight: 700; }
  .mu-search :global(.dk-btn) { border-radius: 10px 10px 10px 4px; font: inherit; font-size: 12.5px; font-weight: 650; text-shadow: none; color: var(--gold-ink);
    background: linear-gradient(180deg, var(--gold-200) 0%, var(--gold-300) 44%, var(--gold-400) 56%, var(--gold-500) 100%);
    box-shadow: 0 0 0 1px var(--gold-edge), inset 0 1px 0 rgba(255, 255, 255, .85), 0 2px 4px rgba(40, 20, 0, .35); }
  .mu-search :global(.dk-btn:hover) { color: var(--gold-ink); text-shadow: none; background: linear-gradient(180deg, #fffbd9, #f9ea80 44%, #f4cc3e 56%, #eaae22); }
  .mu-search :global(.dk-pop) { border: 0; border-radius: 14px 14px 14px 5px;
    background: linear-gradient(180deg, rgba(255, 255, 255, .12), rgba(255, 255, 255, 0) 34%), linear-gradient(160deg, #1b51b6, var(--navy-700) 52%, var(--navy-800));
    box-shadow: 0 0 0 1px rgba(4, 17, 43, .92), inset 0 0 0 1px rgba(150, 205, 255, .3), 0 18px 40px -14px rgba(2, 10, 30, .75); }
  .mu-search :global(.dk-head), .mu-search :global(.dk-strip) { background: rgba(255, 255, 255, .06); border: 0; border-radius: 8px; }
  .mu-search :global(.dk-lbl), .mu-search :global(.dk-dash) { color: var(--ink-2); font: inherit; font-size: 12px; font-weight: 600; line-height: 24px; }
  .mu-search :global(.dk-count) { font: inherit; font-size: 12px; font-weight: 600; color: var(--sky-300); text-shadow: none; }
  .mu-search :global(.dk-x) { color: var(--silver-400); }
</style>
