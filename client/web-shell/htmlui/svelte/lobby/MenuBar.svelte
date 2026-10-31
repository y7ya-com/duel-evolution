<script>
  // CWindowModelMenu + CWindowTaskMenubar (src/Game/yo2MenuBar.cpp.wip, yo2WindowControls.cpp): the strip and its
  // message field, the picture buttons (menuicon_02_c01.png: the look the engine shows), the message text.
  // menuber_01_c01.png (1024 x 32, over menuber_02_c01.png's white field at 0.7) as CSS: a cyan to blue strip, its top
  // 3 rows lighter, its bottom 3 darker; the message field x 392..1016, y 8..24: menuber_02's white panel at 0.698 (the
  // strip's texels there are transparent: live in My Room, over the black backdrop, the engine's field reads #b2b2b2),
  // its edge a pixel of half white blended into the strip. Measured with htmlui-chat in My Room.
  import { SHEET, sprite } from '../../../ui.js';
  import { look, top, shownArt, text } from './util.js';
  let { view } = $props();
  const icons = $derived(view.win.controls.filter(c => c.cls === 'CWindowTaskPictureSwitch' && c.shown));
  const msg = $derived(view.win.controls.find(c => c.cls === 'CWindowTaskText' && top(c)));
  let sheet = $state.raw(null);
  loadIcons().then(s => { sheet = s; });
</script>

<script module>
  // the bar's picture atlas (not in ui.js's SHEET), loaded as ui.js loads one: its clamp copy's alpha says where
  // sprite() needs the .rgb copy under a mask
  let loading;
  const loadIcons = () => loading ||= (async () => {
    const base = SHEET.window.url.slice(0, SHEET.window.url.lastIndexOf('/') + 1), m = new Image();
    m.src = base + 'clamp/menuicon_02_c01.png';
    await m.decode();
    const g = new OffscreenCanvas(m.width, m.height).getContext('2d', { willReadFrequently: true });
    g.drawImage(m, 0, 0);
    const d = g.getImageData(0, 0, m.width, m.height).data, a = new Uint8Array(m.width * m.height);
    for (let i = 0; i < a.length; i++) a[i] = d[4 * i + 3];
    return { url: base + 'menuicon_02_c01.png', w: 240, h: 192, alpha: a };
  })();
</script>

<div class="bar"></div>
<div class="field"></div>
{#if sheet}
  {#each icons as c (c.id)}
    {@const uv = shownArt(c)?.src.join() ?? '0,0'}
    <button type="button" class="btn icon" tabindex="-1" aria-hidden="true" data-state={look(c)} style:left="{c.x}px" style:top="{c.y}px"
      {@attach el => { const [u, v] = uv.split(',').map(Number), sp = sprite(el, sheet, u, v, 80, 32, 0, 0, 80, 32); return () => sp.remove(); }}></button>
  {/each}
{/if}
{#if msg?.shown && msg.text}
  <div style="display: contents" {@attach text(msg.text, { x: msg.x, y: msg.y })}></div>
{/if}

<style>
  .bar { position: absolute; left: 0; top: 0; width: 1024px; height: 32px;
    background: linear-gradient(to right, #75ffff 0, #caffff 60px, #fff 150px, #e5ffff 300px, #a7ffff 385px, #47bcff 700px,
        #0f8dff 1016px, #005eff 1024px) 0 0 / 100% 3px no-repeat,
      linear-gradient(to right, #56d4f6 0, #51a1c2 60px, #86b3be 150px, #5ea8c0 300px, #347fbc 385px, #0049bc 700px,
        #0028b9 1024px) 0 29px / 100% 3px no-repeat,
      linear-gradient(to right, #70ffff 0, #6cdbff 32px, #8ae4ff 64px, #a7eeff 96px, #c1f8ff 128px, #cdfeff 160px,
        #c4feff 224px, #aefeff 256px, #a0f3ff 288px, #8ee4ff 320px, #77d3fe 352px, #64c0fe 384px, #2279fd 700px,
        #0053fb 1016px, #003dd4 1024px);
    -webkit-mask: linear-gradient(#000 0 0), linear-gradient(#000 0 0) 392px 8px / 625px 17px no-repeat;
    -webkit-mask-composite: xor; mask-composite: exclude; }
  .field { position: absolute; left: 392px; top: 8px; width: 625px; height: 17px;
    background: rgba(255, 255, 255, .698); box-shadow: 0 0 0 1px rgba(255, 255, 255, .5); }
  .icon { position: absolute; width: 80px; height: 32px; }
</style>
