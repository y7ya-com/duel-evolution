<script>
  // An in-duel prompt that only waits for a click on the field or the hand (logic.js duelPrompt; DESIGN.md "Duel
  // prompts"): the engine's small box becomes a banner across the top of the field (a game panel, its plaque, the
  // instruction in plain words, the game's own line under it) and a gold ring round the zone to click. No scrim: the
  // hand and field stay bright. After a few seconds with no move both pulse. Pass mode: the click is the engine's own,
  // on its card.
  let { p, win } = $props();
</script>

<div class="screen" style:left="{-win.x}px" style:top="{-win.y}px" aria-live="assertive">
  {#if p.zone}
    <div class="ring" style:left="{p.zone.x}px" style:top="{p.zone.y}px" style:width="{p.zone.w}px" style:height="{p.zone.h}px">
      <span class="tag">{p.kind === 'discard' ? 'Your hand' : 'The field'}</span>
    </div>
  {/if}
  <section class="mu-plate banner" role="alert">
    <header class="mu-head"><h2>{p.title}</h2></header>
    <p class="say">{p.say}</p>
    {#if p.line}<p class="line">{p.line}</p>{/if}
  </section>
</div>

<style>
  .screen { position: absolute; width: 1024px; height: 768px; pointer-events: none; }
  .banner { left: 302px; top: 70px; width: 420px; padding-bottom: 12px; animation: mu-arrive .32s ease-out, nudge 1.4s ease-in-out 5s infinite; }
  .say { margin: 10px 18px 0; font-size: 15px; font-weight: 750; line-height: 1.4; text-align: center; color: var(--ink-strong); }
  .line { margin: 4px 18px 0; font-size: 12px; text-align: center; color: var(--ink-3); }
  .ring { position: absolute; border-radius: 10px;
    box-shadow: 0 0 0 3px var(--gold-300), 0 0 0 5px rgba(140, 80, 0, .45), 0 0 22px 6px rgba(255, 200, 70, .55), inset 0 0 18px rgba(255, 210, 90, .35);
    animation: ring 1.4s ease-in-out 5s infinite; }
  .tag { position: absolute; left: 50%; top: -14px; translate: -50% 0; padding: 2px 12px; border-radius: 6px; font-family: var(--display); font-size: 11px;
    letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; color: var(--gold-ink);
    background: linear-gradient(180deg, #fff3c0, #f0c24a); box-shadow: 0 0 0 1px var(--gold-edge), 0 2px 0 var(--lip-gold); }
  @keyframes nudge { 50% { filter: drop-shadow(0 14px 18px rgba(6, 24, 64, .42)) drop-shadow(0 0 16px rgba(255, 200, 70, .9)) brightness(1.06); } }
  @keyframes ring { 50% { box-shadow: 0 0 0 4px #fff2a8, 0 0 0 6px rgba(140, 80, 0, .5), 0 0 34px 12px rgba(255, 200, 70, .8), inset 0 0 26px rgba(255, 210, 90, .5); } }
  @media (prefers-reduced-motion: reduce) { .banner, .ring { animation: none; } }
</style>
