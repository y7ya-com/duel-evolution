<script>
  // CMainMenu (src/Game/yo2MenuMain.cpp): the frame (FrameMain: controls/skin.js panel with the bottom-thick band), the
  // title bar with the × (ShadowText, IconHide), a skin.js menuButton per shown ButtonMain, as screens/lobby.js draws
  // them, Modern UI last, the frame grown to hold it (menuFrame). The
  // buttons and the × take the pointer themselves (data-modern-owned): an entry's button sits where the engine's own
  // doesn't, so a press clicks its control (api.click), not the canvas there
  import { menuButton, titleBar, panel } from '../../controls/skin.js';
  import { menuFrame } from '../../screens/lobby.js';
  import { look, top } from './util.js';
  let { view } = $props();
  const win = $derived(view.win);
  const title = $derived(win.controls.find(c => c.cls === 'CWindowTaskShadowText' && top(c))?.text ?? '');
  const close = $derived(win.controls.find(c => c.cls === 'CWindowTaskIconHide'));
  const closeState = $derived(close?.pressed ? 'pressed' : 'normal');
  const { rows, h, pitch, height, y } = $derived(menuFrame(win));
  const entries = $derived.by(() => {
    const e = rows.map(c => ({ key: c.id, label: c.label, c }));
    e.push({ key: 'modern', label: 'Modern UI', action: () => globalThis.yo2Html?.modern(true) });
    return e;
  });
  const owned = (b, act) => { b.style.pointerEvents = 'auto'; b.dataset.modernOwned = ''; b.onclick = act; };
  let frame = $state(null);
</script>

<div style="display: contents" {@attach el => {
  const p = panel(el, { y, w: win.w, h: height, band: 6 }), t = titleBar(p, { w: win.w, title, close: !!close });
  if (close) { const id = close.id; owned(t.close, () => view.api.click(id)); }
  p.closeBox = t.close;
  frame = p;
  return () => { p.remove(); frame = null; };
}}></div>
<div style="display: contents" {@attach () => { if (frame?.closeBox) frame.closeBox.dataset.state = closeState; }}></div>
{#each entries as e, i (e.key)}
  <div style="display: contents" {@attach () => {
    if (!frame) return;
    const b = menuButton(frame, { x: rows[0]?.x ?? 12, y: 32 + i * pitch, w: rows[0]?.w ?? win.w - 24, h, label: e.label,
      state: e.c ? look(e.c) : 'normal' });
    b.disabled = e.c ? e.c.state === 'disabled' : false;
    const id = e.c?.id, act = e.action;
    owned(b, () => id != null ? view.api.click(id) : act());
    return () => b.remove();
  }}></div>
{/each}
