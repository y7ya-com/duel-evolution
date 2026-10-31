<script>
  // A lone scroll bar (one no list owns: the profile's rows) as a native box over its rect (screens/chat.js
  // ownScroll): its content stands for the bar's range, scrolling it sets the bar's value (setValue), the game moving
  // its value moves the box.
  import { inject } from '../../controls/scroll.js';
  let { c, n, api } = $props();
  inject();
  let el, at = -1;
  const range = () => el.scrollHeight - el.clientHeight;
  const inner = $derived(c.length * (c.max + Math.max(1, c.page)) / Math.max(1, c.page));
  function onscroll() {
    const r = range(), v = r > 0 ? Math.round(el.scrollTop / r * c.max) : 0;
    if (v !== at) { at = v; api.setValue(c.id, v); }
  }
  $effect(() => {
    const v = c.value, max = c.max;
    inner;
    if (v !== at) { at = v; el.scrollTop = max ? v / max * range() : 0; }
  });
</script>

<div bind:this={el} class="own yo2-scroll-list" {onscroll} style:left="{c.x}px" style:top="{c.y}px" style:width="{c.w}px"
  style:height="{c.length}px" style:z-index={n} style:display={c.shown ? '' : 'none'}>
  <div style:height="{inner}px"></div>
</div>
