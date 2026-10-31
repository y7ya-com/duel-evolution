<script>
  // A list's rows as the engine draws them (CWindowTaskBackStripe + CWindowTaskListbox, sampled from its 1x render of
  // the file list): 16-pixel rows, the even ones #eeeeed under a #f6f6f6 top line and lighter at both ends (to #f6f6f6
  // over ~42 px), the odd ones white; the selected one #0084ff under a #3bc1ff line, its left end from #2ba4ff, its
  // right end to #7a87c7. The items are black Arial (Label: tags, the pen, the row counter's alignment). It takes no
  // input: a click goes on to the game's list (pass mode), which selects.
  // Its scroll bar (past 8 rows): a native one over the bar's column (NativeScroll: the browser's bar sets the game's
  // value, the game's moves it).
  import Label from './Label.svelte';
  import NativeScroll from '../NativeScroll.svelte';
  import { deck } from './state.svelte.js';
  let { x, y, w, rows, items, selected, bar, box } = $props();
</script>

<div style:position="absolute" style:left="{x}px" style:top="{y}px" style:width="{w}px" style:height="{rows * 16}px" style:overflow="hidden">
  {#each { length: rows } as _, i}
    <div class="row" class:even={i % 2 === 0} class:sel={i === selected} style:top="{i * 16}px"></div>
  {/each}
  {#each items as text, i}
    <Label {text} x={0} y={i * 16} {box} />
  {/each}
  {#if bar && deck.api}
    <NativeScroll {bar} api={deck.api} />
  {/if}
</div>

<style>
  .row { position: absolute; left: 0; right: 0; height: 16px; background: #fff; }
  .even { background: linear-gradient(to right, #f6f6f6, #eeeeed 42px, #eeeeed calc(100% - 42px), #f6f6f6); box-shadow: inset 0 1px #f6f6f6; }
  .sel { background: linear-gradient(to right, #2ea6ff, #0084ff 40px, #0084ff calc(100% - 42px), #7a87c7); box-shadow: inset 0 1px #3bc1ff; }
</style>
