<script>
  // The trunk (CWindowModelKaban): its items, and in the deck editor (not Card Swap, which reuses the window) the
  // native scroller over its rows and the search panel over its header (its Filters popup opens over the list)
  import Window from './Window.svelte';
  import Trunk from './Trunk.svelte';
  import Search from './Search.svelte';
  import { inEditor } from './art.js';
  let { view } = $props();
  const editor = inEditor();
  const list = $derived(view.win.controls.find(c => c.cls === 'CWindowTaskKabanList'));
</script>

<Window {view} />
{#if editor && list}
  <Trunk {list} api={view.api} />
  <!-- the game's filter: ovr/decksearch.c's Module.yo2KabanFilter on the trunk list (an older runtime: none) -->
  <Search hits={list.hits} apply={f => globalThis.Module?.yo2KabanFilter?.(list.id, f)} />
{/if}
