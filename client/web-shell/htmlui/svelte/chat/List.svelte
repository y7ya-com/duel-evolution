<script>
  // A list (the chat log, a name list) as a native scroller (screens/chat.js ownList): every item one block of Arial
  // text wrapping by words; a log (stick) stays at the bottom while the player is there. Rows keep their keys while
  // the items only gain lines at the end or lose them at the top (itemsDelta), so a selection in the rest survives.
  import { untag, spacing } from '../../controls/basic.js';
  import { inject } from '../../controls/scroll.js';
  import { itemsDelta } from '../../screens/chat.js';
  let { c, n, stick = false, stripes = false } = $props();
  inject();
  let el, shown = [], keys = [], next = 0, prev = [], bottom = true;
  const rows = $derived.by(() => {
    const now = (c.items || []).map(untag), d = itemsDelta(shown, now);
    if (d && !d[0] && !d[1].length) return prev;
    keys = d ? keys.slice(d[0]).concat(d[1].map(() => next++)) : now.map(() => next++);
    shown = now;
    return prev = now.map((s, i) => ({ k: keys[i], s, ls: spacing(s) }));
  });
  $effect.pre(() => { rows; if (el) bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 2; });
  $effect(() => { rows; if (stick && bottom) el.scrollTop = el.scrollHeight; });
</script>

<div bind:this={el} class="own list yo2-scroll-list" class:yo2-stripes={stripes} role={stick ? 'log' : 'list'}
  style:left="{c.x}px" style:top="{c.y}px" style:width="{c.w}px" style:height="{c.h}px" style:z-index={n}
  style:display={c.shown ? '' : 'none'}>
  {#each rows as r (r.k)}<div class="row" style:letter-spacing="{r.ls}px">{r.s}</div>{/each}
</div>
