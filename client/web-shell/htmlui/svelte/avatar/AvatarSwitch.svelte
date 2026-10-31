<script>
  // Character creation (CWindowDialogAvatarSwitch, src/ChangeAvatar/yo2ChangeAvatar.cpp): the 13 category buttons, the
  // 14 item buttons of a page, the page arrows, Confirm / Back, the item panel and the line from the chosen category to
  // it. The window is 336 x 550 at 0, 0 with its frame hidden (setVisible(false), which the snapshot's shown does not
  // see); everything it shows sits outside that box. The owner's skin rule (sharp at 2x):
  // - the plates are CSS (plates.js, tools/plates.py): each look of each atlas sampled as the engine draws the 1:1
  //   sprite (abmake_btn_01_c01..04: categories 324 x 44, looks normal / hover / chosen; abmake_btn_02_01: items
  //   254 x 34; abmake_btn_03_01: Confirm / Back 162 x 42);
  // - the panel (abmake_win_01, 292 x 612 at 703, 60: a 4 px #f4828d edge round a 50 % white body) and the line
  //   (abmake_line_01: 4 px of #f4828d, rows 14..17 of a 32 x 32 sprite at x 672, y the chosen category's middle - 16;
  //   69 before a choice) are CSS too;
  // - the page arrows (shop_arrow_04..06 next, 10..12 previous: normal, hover, pressed) are inline SVG: a triangle
  //   (3, 4) (31, 32) (3, 60) in their 32 x 64 box, its outer band #fa9f00 round an inner #ffb532 one 6 px in, a
  //   two-column light bevel down the left (#ffd282, #ffd996); hover the same in a white glow; pressed pale (the band
  //   #fff5d1 to #fde060 top to bottom, the inside #ffd575, the left #facf00); previous the mirror.
  // Labels: Arial (textBox), 32 px on the categories, 24 px on the items and Confirm / Back.
  import PLATES from './plates.js';
  import { text, top, shownArt } from '../lobby/util.js';
  let { view } = $props();
  const uid = $props.id();   // the arrows' SVG ids, unique in the document
  const PLATE = /^abmake_btn_0[123]_/, ARROW = /^shop_arrow_(\d\d)_/;
  const OUTER = '3,4 31,32 3,60', INNER = '3,10 25,32 3,54';
  const switches = $derived(view.win.controls.filter(c => c.cls === 'CWindowTaskPictureSwitch' && c.shown).map(c => {
    const a = shownArt(c);
    const tex = a && a.tex.split('/').pop().replace(/\.png$/, ''), arrow = tex && ARROW.exec(tex);
    if (arrow) { const k = +arrow[1]; return { c, look: ['normal', 'hover', 'pressed'][(k - 4) % 6] || 'normal', dir: k >= 10 ? 'prev' : 'next' }; }
    return tex && PLATE.test(tex) ? { c, plate: PLATES[tex]?.[Math.round(a.src[0] / a.src[2])] ?? '' } : null;
  }).filter(Boolean));
  // the line follows the chosen category (a checked category switch), 69 before one is chosen
  const chosen = $derived(view.win.controls.find(c => c.cls === 'CWindowTaskPictureSwitch' && c.checked && c.w === 324));
  const linkTop = $derived((chosen ? chosen.y + chosen.h / 2 - 16 : 69) + 14);
  // the labels: the window's own texts (the categories', the items', Confirm / Back), over the plates
  const texts = $derived(view.win.controls.filter(c => c.cls === 'CWindowTaskText' && top(c) && c.shown && c.text));
</script>

<div class="panel"></div>
<div class="link" style:top="{linkTop}px"></div>
{#each switches as p (p.c.id)}
  {@const c = p.c}
  <button type="button" tabindex="-1" aria-hidden="true" class="btn {p.plate === undefined ? 'arrow' : 'plate'}" data-state={c.state} data-dir={p.dir} data-look={p.look}
    style="left: {c.x}px; top: {c.y}px; width: {c.w}px; height: {c.h}px; {p.plate ?? ''}">
    {#if p.plate === undefined}
      {@const pr = p.look === 'pressed'}
      {@const id = `av-${uid}-${c.id}`}
      <svg viewBox="0 0 32 64" aria-hidden="true">
        {#if pr}<defs><linearGradient id="{id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff5d1" /><stop offset="1" stop-color="#fde060" /></linearGradient></defs>{/if}
        <polygon points={OUTER} fill={pr ? `url(#${id}-g)` : '#fa9f00'} /><polygon points={INNER} fill={pr ? '#ffd575' : '#ffb532'} />
        <clipPath id="{id}-c"><polygon points={OUTER} /></clipPath>
        <g clip-path="url(#{id}-c)">
          <rect x="3" y="0" width="2" height="64" fill={pr ? '#facf00' : '#ffd282'} /><rect x="5" y="0" width="2" height="64" fill={pr ? '#facf00' : '#ffd996'} />
        </g>
      </svg>
    {/if}
  </button>
{/each}
{#each texts as c (c.id)}
  <div style="display: contents" {@attach text(c.text, { x: c.x, y: c.y, w: c.w, align: c.align, px: c.fontSize || 16, color: c.color })}></div>
{/each}

<style>
  .plate, .arrow { position: absolute; box-sizing: border-box; margin: 0; padding: 0; border: 0; cursor: inherit; }
  .arrow > svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .arrow[data-dir=prev] > svg { transform: scaleX(-1); }
  .arrow[data-look=hover] > svg { filter: drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff); }
  .panel { position: absolute; left: 704px; top: 61px; width: 290px; height: 610px; box-sizing: border-box;
    border: 4px solid #f4828d; border-radius: 6px; background: rgba(255, 255, 255, .5); }
  .link { position: absolute; left: 672px; width: 32px; height: 4px; background: #f4828d; }
</style>
