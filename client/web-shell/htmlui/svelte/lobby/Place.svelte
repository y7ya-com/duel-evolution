<script>
  // CWindowModelPlace (src/Game/yo2MenuPlace.cpp): the plate (FramePlace's size) and its ShadowTexts.
  // lobbyname_win_01_c01.png (256 x 52; the body stretched after its first 224 px) as CSS: a 1 px brown edge, a 3 px
  // gold bevel (light top / left, darker right / bottom), a #625d36 line, then the blue body, #0985ff to #7deffc over
  // its first 219 px, every other row lighter (the art's scan lines).
  import { shadowText, top } from './util.js';
  let { view } = $props();
  const f = $derived(view.win.controls.find(c => c.cls === 'CWindowTaskFramePlace'));
  const texts = $derived(view.win.controls.filter(c => c.cls === 'CWindowTaskShadowText' && top(c) && c.shown));
</script>

{#if f?.shown}
  <div class="place" style:left="{f.x}px" style:top="{f.y}px" style:width="{f.w}px"></div>
  {#each texts as c (c.id)}
    <div style="display: contents" {@attach shadowText(c)}></div>
  {/each}
{/if}

<style>
  .place { position: absolute; box-sizing: border-box; height: 52px; border: 1px solid; border-radius: 6px;
    border-color: #cbb598 #894009 #893b06 #a57f4e; background: #f2e14f;
    box-shadow: inset 1px 1px 0 #f6eb89, inset 2px 2px 0 #f4e563, inset -1px -1px 0 #f1b323, inset -2px -2px 0 #f1c42f; }
  .place::before { content: ''; position: absolute; inset: 3px; border: 1px solid #625d36; border-radius: 2px;
    background: repeating-linear-gradient(to bottom, transparent 0 1px, rgba(255, 255, 255, .12) 1px 2px),
      linear-gradient(to right, #0985ff 0, #7deffc 219px, #7deffc 100%); }
</style>
