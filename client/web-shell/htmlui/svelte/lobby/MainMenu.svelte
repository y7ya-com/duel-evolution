<script>
  // CMainMenu (src/Game/yo2MenuMain.cpp): the frame (FrameMain, the window's size: controls/skin.js panel with the
  // bottom-thick band), the title bar with the × (ShadowText, IconHide), a skin.js menuButton per shown ButtonMain
  import { menuButton, titleBar, panel } from '../../controls/skin.js';
  import { look, top } from './util.js';
  let { view } = $props();
  const win = $derived(view.win);
  const title = $derived(win.controls.find(c => c.cls === 'CWindowTaskShadowText' && top(c))?.text ?? '');
  const close = $derived(win.controls.find(c => c.cls === 'CWindowTaskIconHide'));
  const closeState = $derived(close?.pressed ? 'pressed' : 'normal');
  const buttons = $derived(win.controls.filter(c => c.cls === 'CWindowTaskButtonMain' && c.shown));
</script>

<div style="display: contents" {@attach el => {
  const p = panel(el, { w: win.w, h: win.h, band: 6 });
  titleBar(p, { w: win.w, title, close: !!close, closeState });
  return () => p.remove();
}}></div>
{#each buttons as c (c.id)}
  <div style="display: contents" {@attach el => {
    const b = menuButton(el, { x: c.x, y: c.y, w: c.w, h: c.h, label: c.label, state: look(c) });
    return () => b.remove();
  }}></div>
{/each}
