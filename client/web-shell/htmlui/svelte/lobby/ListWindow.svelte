<script>
  // A list window: the pick list over a click on the map (CWindowModelList, src/System/window/yo2WindowDialogs.cpp: the
  // characters under the pointer) and the player list's search menu (CFindMenu, src/Lobby/yo2FindMenu.cpp). Their pieces:
  // - Iconbar, ThinChop: controls/skin.js iconbar / chop (the chat's, window_base_01_c01, 70 %);
  // - FrameThin (style 1: the same texture's eight 8-pixel pieces, at the control's alpha): the chop with its top edge
  //   (3 rows #a7ffff, #79ffff, 3 rows #59c6ff, a white line; as drawn, each row the mean of two texel rows: #a7ffff x3,
  //   #90ffff, #69e2ff, #59c6ff x2, #ace2ff);
  // - each Listbox: its BackStripe's 16-pixel rows (window_base_01_c01's cells stretched, 70 %: white at 8,8; every
  //   other row from the first item's parity #eeeeed at 56,8; the selected one #0084ff at 72,16; the ends and the top
  //   line as svelte/deck/List.svelte sampled them), the items from the top line in black Arial (deck/Label.svelte:
  //   colour tags, the Text child's alignment and width), its scroll bar (shown past a page) a native box;
  // - IconHide: skin.js's close box.
  // Pass mode: a click goes on to the game's list (it selects, the ActiveListbox on hover), whose state comes back here.
  import { iconbar, chop } from '../../controls/skin.js';
  import Label from '../deck/Label.svelte';
  import NativeScroll from '../NativeScroll.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const top = c => !c.parent;
  const pieces = $derived(win.controls.filter(c => top(c) && c.shown && /(Iconbar|ThinChop|FrameThin)$/.test(c.cls)));
  const lists = $derived(win.controls.filter(c => top(c) && c.shown && /Listbox$/.test(c.cls)).map(l => {
    const kids = win.controls.filter(k => k.parent === l.id);
    const stripe = kids.find(k => k.cls.endsWith('BackStripe') && k.shown), text = kids.find(k => k.cls === 'CWindowTaskText' && k.shown);
    const bar = kids.find(k => /Scroll$/.test(k.cls) && k.shown), first = l.topLine ?? 0;
    return { l, stripe, first, rows: stripe?.rows ?? l.rows ?? 0, items: (l.items || []).slice(first, first + (stripe?.rows ?? l.rows ?? 0)),
      box: { align: text?.align ?? 0, w: text?.w ?? l.w - 16, px: 16 }, bar: bar && { ...bar, x: l.x + bar.x, y: l.y + bar.y } };
  }));
  const close = $derived(win.controls.find(c => c.cls === 'CWindowTaskIconHide' && c.shown));
  const piece = c => el => {
    const d = c.cls.endsWith('Iconbar') ? iconbar(el, c) : chop(el, c);
    if (c.cls.endsWith('FrameThin'))
      d.style.boxShadow = 'inset 0 3px #a7ffff, inset 0 4px #90ffff, inset 0 5px #69e2ff, inset 0 7px #59c6ff, inset 0 8px #ace2ff, ' + getComputedStyle(d).boxShadow;
    d.style.opacity = c.alpha;
    return () => d.remove();
  };
</script>

{#each pieces as c (c.id)}
  <div style="display: contents" {@attach piece(c)}></div>
{/each}
{#each lists as L (L.l.id)}
  {#if L.stripe}
    <div class="rows" style:left="{L.l.x}px" style:top="{L.l.y}px" style:width="{L.stripe.w}px" style:height="{L.rows * 16}px" style:opacity={L.stripe.alpha}>
      {#each { length: L.rows } as _, i}
        <div class="row" class:even={(i + L.first) % 2 === 0} class:sel={i === L.stripe.selected} style:top="{i * 16}px"></div>
      {/each}
    </div>
  {/if}
  <div class="items" style:left="{L.l.x}px" style:top="{L.l.y}px" style:width="{L.box.w}px" style:height="{L.rows * 16}px">
    {#each L.items as text, i (i)}
      <Label {text} x={0} y={i * 16} box={L.box} />
    {/each}
  </div>
  {#if L.bar}
    <NativeScroll bar={L.bar} api={view.api} />
  {/if}
{/each}
{#if close}
  <button type="button" tabindex="-1" aria-label="Close" class="yo2-close" data-state={close.pressed ? 'pressed' : 'normal'}
    style:left="{close.x}px" style:top="{close.y + 4}px" style:right="auto"></button>
{/if}

<style>
  .rows, .items { position: absolute; overflow: hidden; }
  .row { position: absolute; left: 0; right: 0; height: 16px; background: #fff; }
  .even { background: linear-gradient(to right, #f6f6f6, #eeeeed 42px, #eeeeed calc(100% - 42px), #f6f6f6); box-shadow: inset 0 1px #f6f6f6; }
  .sel { background: linear-gradient(to right, #2ea6ff, #0084ff 40px, #0084ff calc(100% - 42px), #7a87c7); box-shadow: inset 0 1px #3bc1ff; }
</style>
