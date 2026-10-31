<script>
  // An engine scroll bar the window's own screen hides, as a native box over its rect (owner: native scroll bars
  // everywhere; scrollbars.js does this for windows no screen owns, chat.js's ownScroll for owned ones): the box's
  // content stands for the bar's range (page lines in view of max + page), scrolling it sets the bar's value through the
  // game's setValue (the window relays its rows, as from a thumb drag), and the game moving its value moves the box.
  // Shared by the Svelte groups (the lobby's Move list, the deck's file list).
  import { inject } from '../controls/scroll.js';
  let { bar, api } = $props();
  inject();
  let el, at = -1;
  const range = () => el.scrollHeight - el.clientHeight;
  const inner = $derived(bar.length * (bar.max + Math.max(1, bar.page)) / Math.max(1, bar.page));
  $effect(() => {
    if (bar.value !== at) { at = bar.value; el.scrollTop = bar.max ? bar.value / bar.max * range() : 0; }
  });
  function scrolled() {
    const r = range(), v = r > 0 ? Math.round(el.scrollTop / r * bar.max) : 0;
    if (v !== at) { at = v; api.setValue(bar.id, v); }
  }
</script>

<div class="yo2-scroll-list" bind:this={el} onscroll={scrolled}
  style:left="{bar.x}px" style:top="{bar.y}px" style:width="{bar.w}px" style:height="{bar.length}px">
  <div style:height="{inner}px"></div>
</div>
