<script module>
  // The place banner, modern (CWindowModelPlace, src/Game/yo2MenuPlace.cpp): a location chip, a line per row of its
  // ShadowTexts (logic.js placeRows): the place's name and its "(here/capacity)" as a count.
  import { placeRows } from './logic.js';
</script>

<script>
  import Icon from './Icon.svelte';
  let { view } = $props();
  const f = $derived(view.win.controls.find(c => c.cls === 'CWindowTaskFramePlace'));
  const lines = $derived(placeRows(view.win));
</script>

{#if f?.shown && lines.length}
  <div class="mu">
    <div class="mu-plate chip" style:left="{f.x + 8}px" style:top="{f.y + 8}px">
      <Icon name="pin" size={20} class="pin" />
      <div class="lines">
        {#each lines as l, i (l.id)}
          <div class="line" class:first={i === 0}>
            <span class="name">{l.name}</span>
            {#if l.cap}<span class="count" title="{l.here} here of {l.cap}"><Icon name="people" size={13} />{l.here}<i>/</i>{l.cap}</span>{/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .chip { display: flex; align-items: center; gap: 10px; padding: 6px 14px 7px 10px; border-radius: 14px 14px 14px 5px; min-width: 190px; }
  .chip :global(.pin) { color: var(--icon); }
  .lines { display: grid; grid-template-columns: auto auto; column-gap: 14px; row-gap: 1px; align-items: baseline; }
  .line { display: contents; }
  .count { justify-self: end; }
  .name { font-size: 12px; font-weight: 600; color: var(--ink-2); white-space: nowrap; }
  .first .name { font-size: 14.5px; font-weight: 800; color: var(--ink-strong); }
  .count { display: inline-flex; align-items: center; gap: 3px; font-size: 11.5px; font-weight: 700; color: var(--azure-500); }
  .count i { font-style: normal; opacity: .5; }
</style>
