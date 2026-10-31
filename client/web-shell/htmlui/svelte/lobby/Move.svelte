<script>
  // CWindowModelMove (src/Game/yo2MenuMove.cpp, the bar's door: where to go): the frame (CWindowTaskFrameMove,
  // move_win_01_c01.png), up to 6 choice buttons (CWindowTaskButtonDuel, 258 wide or their caption's width, 26 apart from y 24: white 16-pixel
  // captions on a black shadow), the × (IconHide at frameW - 24), the scroll bar (ResultScroll at frameW - 24, 22; shown
  // past 6 places) as a native box. The frame is the widest row + 38 by 188: 296 x 188 for 258-wide buttons, wider for a longer place name.
  // move_win_01_c01 (72 x 72, a 24-pixel nine-slice, point-sampled) as CSS, sampled from the art: a green bevel (6 px
  // at the sides and bottom, 19 at the top: a vertical gradient #dbfae2 to #7ff720 over the top 19 rows, on down to
  // #36ed56, then darker to the bottom row; its left 4 columns lighter, its right 4 darker), a 1 px #7e877e edge round
  // the well; in the well a blue to white gradient (#456f83, #5894b0, #74c0e3, #84d9fe rows on top, #88daff to
  // #dff8ff stretched, #f4ffff at the bottom), its left 3 columns shaded; the bar's gutter (#d4e2e4, a #7e8da7 line on
  // its left) in the well's last 17 columns. The window draws it at 0.9.
  import { duelButton } from '../../controls/skin.js';
  import { textColor } from '../../controls/basic.js';
  import { look } from './util.js';
  import NativeScroll from './NativeScroll.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const items = $derived(win.controls.filter(c => c.cls === 'CWindowTaskButtonDuel' && c.shown));
  const close = $derived(win.controls.find(c => c.cls === 'CWindowTaskIconHide' && c.shown));
  const bar = $derived(win.controls.find(c => c.cls === 'CWindowResultScroll' && c.shown));
  const frame = $derived(win.controls.find(c => c.cls === 'CWindowTaskFrameMove'));
  // layout(): the frame is the widest row + 38 (a row is as wide as its caption, 258 at least), the × and the bar at its
  // right edge - 24; the window's own w_ stays 296. The FrameMove reads 0 x 0, so its width is the ×'s place + 24.
  const frameW = $derived(close ? close.x + 24 : Math.max(win.w, ...items.map(c => c.x + c.w + 27)));
  // a button (skin.js duelButton) with its caption in the game's colour and shadow
  const button = c => el => {
    const b = duelButton(el, { x: c.x, y: c.y, w: c.w, h: c.h, label: c.label, state: look(c) });
    b.classList.add('lb-dbtn');
    const t = b.querySelector('.txt');
    if (t) Object.assign(t.style, { color: textColor(c.color, true), textShadow: c.shadow ? `${c.shadow.dx}px ${c.shadow.dy}px 0 ${textColor(c.shadow.color, true)}` : '' });
    return () => b.remove();
  };
</script>

{#if frame?.shown}
  <div class="frame" style:width="{frameW}px" style:height="{win.h}px" style:opacity={frame.alpha}></div>
{/if}
{#each items as c (c.id)}
  <div style="display: contents" {@attach button(c)}></div>
{/each}
{#if close}
  <!-- skin.js's close box (as on the Main Menu's title bar), where the game draws its sprite: 4 down in the control -->
  <button type="button" tabindex="-1" aria-label="Close" class="yo2-close" data-state={close.pressed ? 'pressed' : 'normal'}
    style:left="{close.x}px" style:top="{close.y + 4}px" style:right="auto"></button>
{/if}
{#if bar}
  <NativeScroll {bar} api={view.api} />
{/if}

<style>
  /* the hovered button: the engine's orange look (sampled live; skin.js's duelButton only brightens): for skin.js once
     promoted */
  :global(.lb-dbtn.yo2-dbtn[data-state=hover]) { filter: none; border-color: #e36f08 #e98b29 #e98b29 #e36f08; background: #faeaac;
    box-shadow: inset 1px 1px #f1b783, inset -1px -1px #f2b55e, inset 2px 2px #fff, inset -2px -2px #f6d086, inset 3px 3px #ffffe1,
      inset -3px -3px #f9e4a4, inset 4px 4px #fcf4b8; }
  .frame { position: absolute; left: 0; top: 0;
    background:
      linear-gradient(to right, rgba(255, 255, 255, .3) 0 1px, rgba(255, 255, 255, .23) 1px 2px, rgba(255, 255, 255, .19) 2px 3px,
        rgba(255, 255, 255, .09) 3px 4px, transparent 4px calc(100% - 4px), rgba(0, 0, 0, .03) calc(100% - 4px) calc(100% - 3px),
        rgba(0, 0, 0, .08) calc(100% - 3px) calc(100% - 2px), rgba(0, 0, 0, .13) calc(100% - 2px) calc(100% - 1px), rgba(0, 0, 0, .15) calc(100% - 1px)),
      linear-gradient(to bottom, #dbfae2 0 1px, #d1f9d8 1px 2px, #c5f7ca 2px 3px, #b2f6b1 3px 4px, #a3f49b 4px 5px, #9ef584 6.5px,
        #95f656 10.5px, #89f72f 14.5px, #7ff720 18.5px, #79f620 23.5px, #64f427 94px, #52f138 161px, #50f13a 164.5px, #43ef48 172.5px,
        #39ed53 180.5px, #36ed56 calc(100% - 6px) calc(100% - 5px), #35ec56 calc(100% - 5px) calc(100% - 4px), #33e14a calc(100% - 4px) calc(100% - 3px),
        #2fcd30 calc(100% - 3px) calc(100% - 2px), #2dbc19 calc(100% - 2px) calc(100% - 1px), #3abf26 calc(100% - 1px)); }
  .frame::before { content: ''; position: absolute; left: 6px; top: 19px; right: 6px; bottom: 6px; border: 1px solid #7e877e;
    background:
      linear-gradient(#4c5f85 0 1px, #9faebf 1px 2px, #d1dfe2 2px 3px, transparent 3px) right / 17px 100% no-repeat,
      linear-gradient(to right, #7e8da7 0 1px, #b8c7d0 1px 2px, #d4e2e4 2px 15px, #d9e5e7 15px 16px, #dde8ea 16px) right / 17px 100% no-repeat,
      linear-gradient(to right, rgba(0, 0, 0, .3) 0 1px, rgba(0, 0, 0, .19) 1px 2px, rgba(0, 0, 0, .06) 2px 3px, transparent 3px),
      linear-gradient(to bottom, #456f83 0 1px, #5894b0 1px 2px, #74c0e3 2px 3px, #84d9fe 3px 4px, #88daff 4.5px, #b6eaff 74.5px,
        #dff8ff 141.5px, #e2f9ff 144.5px, #edfdff 148.5px, #f4ffff 152.5px, #f4ffff 157.5px, #f5ffff 158.5px, #f7ffff 159.5px, #eff6f6 160.5px); }
</style>
