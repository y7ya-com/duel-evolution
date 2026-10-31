<script>
  // An owned window (screens/chat.js owned(), as components): its controls back to front (parts()), each drawn by
  // draw() when its key changes (Ctl); the log and lists (List: native scrollers), a lone scroll bar (Scroll) and the
  // inputs (Input) owned by the DOM, stacked as drawn. background(win, el): what the window draws under its controls.
  import { parts, injectCss } from '../../screens/chat.js';
  import Ctl from './Ctl.svelte';
  import List from './List.svelte';
  import Scroll from './Scroll.svelte';
  import Input from './Input.svelte';
  let { view, draw, background = null } = $props();
  injectCss();
  const ps = $derived(parts(view.win));
  const owned = $derived(ps.filter(p => p.own));
  const bg = $derived(background && [view.win.cls, view.win.w, view.win.h].join(' '));   // redrawn when one changes
  function paintBg(el) {
    const [cls, w, h] = bg.split(' ');
    background({ cls, w: +w, h: +h }, el);
    return () => el.replaceChildren();
  }
</script>

<div class="htmlui-own" style="display: contents">
  {#if bg}<div {@attach paintBg}></div>{/if}
  <div>
    {#each ps as p (p.c.id)}<Ctl k={p.k} c={p.c} {draw} {view} />{/each}
  </div>
  <div>
    {#each owned as p (p.c.id)}
      {#if p.own === 'input'}
        <Input c={p.c} n={p.n} api={view.api} />
      {:else if p.own === 'scroll'}
        <Scroll c={p.c} n={p.n} api={view.api} />
      {:else}
        <List c={p.c} n={p.n} stick={p.own === 'log'} stripes={p.own === 'list'} />
      {/if}
    {/each}
  </div>
</div>
