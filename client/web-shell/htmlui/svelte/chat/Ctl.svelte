<script>
  // A control as draw() builds it (the skin's CSS pieces, real <button>s), rebuilt only when its key changes; a
  // button that had the keyboard's focus gets it back
  import { untrack } from 'svelte';
  let { k, c, draw, view } = $props();
  let refocus = false;
  function paint(el) {
    k;
    untrack(() => {
      if (c.shown && !c.inMulti) draw(c, el, view.api, view.win);   // a MultiInput's field is its window's picture (white)
      if (refocus) el.querySelector('button')?.focus();
    });
    return () => { refocus = el.contains(document.activeElement); el.replaceChildren(); };
  }
</script>

<div class="ctl" {@attach paint}></div>
