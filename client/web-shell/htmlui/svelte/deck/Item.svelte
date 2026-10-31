<script>
  // One drawn item of a deck window (art.js plan): a layer clipped around every hole in front of it, from any deck window
  import { clip } from '../../screens/deck.js';
  import { deck } from './state.svelte.js';
  import Sprite from './Sprite.svelte';
  import Label from './Label.svelte';
  import Flow from './Flow.svelte';
  import List from './List.svelte';
  let { it, ox, oy } = $props();
  const cut = $derived(clip(it, deck.holes, ox, oy));
</script>

<div class="layer" style:width="100%" style:height="100%" style:clip-path={cut}>
  {#if it.kind === 'sprite'}
    <Sprite s={it.s} x={it.x} y={it.y} />
  {:else if it.kind === 'label'}
    <Label text={it.text} x={it.x} y={it.y} alpha={it.alpha} box={it.box} />
  {:else if it.kind === 'flow'}
    <Flow text={it.text} x={it.x} y={it.y} w={it.w} h={it.h} alpha={it.alpha} px={it.px} />
  {:else if it.kind === 'list'}
    <List x={it.x} y={it.y} w={it.w} rows={it.rows} items={it.items} selected={it.selected} bar={it.bar} box={it.box} />
  {:else if it.kind === 'button'}
    <!-- a real <button> over the button's art (its look is the art; the label is its accessible name) -->
    <button type="button" class="btn" disabled={!it.enabled} data-state={it.state} aria-label={it.label}
      style:position="absolute" style:left="{it.x}px" style:top="{it.y}px" style:width="{it.w}px" style:height="{it.h}px"
      style:background="none" style:border="0" style:padding="0" style:margin="0"></button>
  {/if}
</div>
