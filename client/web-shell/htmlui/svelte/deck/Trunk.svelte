<script>
  // The trunk's native scroller (owner: "native HTML scrollers"): a transparent overflow box over the trunk's rows,
  // as tall as the game's list (56 px a card): the browser's own bar, wheel, drag and touch. The engine keeps drawing
  // the rows; the box moves the game's list (api.wheel at a game point: the pointer over the rows, else their middle)
  // and follows it (a search, a filter). It takes the pointer: hover, a press (picking a card up), the drag into the
  // deck, right / double clicks go on to the canvas as the same mouse events (capture keeps a drag going outside).
  import { inject } from '../../controls/scroll.js';
  let { list, api } = $props();
  const ROW_H = 56;
  inject();
  let el = $state(), byUser = true, last = null, target = null, pend = null, wait = 0;
  const canvas = () => document.getElementById('canvas');
  const point = () => {
    const r = canvas()?.getBoundingClientRect(), k = r ? r.width / 1024 : 1;
    const g = r && last && [(last[0] - r.left) / k, (last[1] - r.top) / k];
    return g && g[0] >= 744 && g[0] < 1000 && g[1] >= 88 && g[1] < 88 + 11 * ROW_H ? g : [872, 396];
  };
  // the whole way in one burst: the game takes every wheel message queued for a frame (a line each). pend: the line
  // already asked for (a drag scrolls several times a frame); not there 10 frames on: again from where the game is
  const toward = i => {
    const n = i - (pend ?? list.top), gp = point();
    for (let k = 0; k < Math.abs(n); k++) api.wheel(list.id, n > 0 ? 120 : -120, gp);
    pend = i;
    wait = 10;
  };
  const top = i => { byUser = false; el.scrollTop = i * ROW_H; };
  // the game's list as the snapshot has it, every changed frame
  $effect(() => {
    if (target === null) { if (Math.round(el.scrollTop / ROW_H) !== list.top) top(list.top); }
    else if (list.top === target) target = pend = null;
    else if (wait-- <= 0) { pend = null; toward(target); }
  });
  // a press anywhere else drops a catch-up still running
  $effect(() => {
    const drop = e => { if (!el.contains(e.target)) target = pend = null; };
    document.addEventListener('pointerdown', drop, true);
    return () => document.removeEventListener('pointerdown', drop, true);
  });
  const fwd = (type, e) => canvas()?.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true,
    clientX: e.clientX, clientY: e.clientY, button: e.button, buttons: e.buttons }));
  const onscroll = () => {
    if (!byUser) { byUser = true; return; }   // the first event after top() is ours
    target = Math.round(el.scrollTop / ROW_H);
    toward(target);
  };
  const keys = e => e.stopPropagation();   // the list's keys while it has focus, not the game's (SDL listens on window)
</script>

<!-- svelte-ignore a11y_no_static_element_interactions (it hands the pointer on to the canvas: the game picks the card) -->
<div bind:this={el} class="yo2-scroll-list" style:left="8px" style:top="88px" style:width="272px" style:height="{11 * ROW_H}px"
  {onscroll} onkeydown={keys} onkeyup={keys} onkeypress={keys}
  onwheel={e => { byUser = true; last = [e.clientX, e.clientY]; }}
  onpointerdown={e => {
    byUser = true;
    if (e.offsetX >= el.clientWidth - 14) return;   // the scroll bar is the browser's (an overlay one is 0 wide: its strip)
    el.setPointerCapture(e.pointerId);
    fwd('mousedown', e);
  }}
  onpointermove={e => { last = [e.clientX, e.clientY]; fwd('mousemove', e); }}
  onpointerup={e => { fwd('mouseup', e); if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); }}
  oncontextmenu={e => { e.preventDefault(); fwd('contextmenu', e); }}
  ondblclick={e => { e.preventDefault(); fwd('dblclick', e); }}>
  <div class="yo2-rows" style:height="{list.hits * ROW_H}px"></div>
</div>
