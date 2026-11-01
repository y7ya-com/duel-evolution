<script>
  // A duel's result, one card a player (CWindowResult; logic.js result; owner: "the W-L record page thing at the end
  // looks so bad"): a game panel at the engine's place, the WINNER (gold) / LOSER (steel) plaque in the display face,
  // the player's name, the record as big figures in a well. Pass mode: the game's own clicks move on.
  import { result } from './logic.js';
  let { view } = $props();
  const win = $derived(view.win);
  const r = $derived(result(win));
</script>

<div class="mu">
  <section class="mu-plate card" class:won={r.winner === true} class:lost={r.winner === false} aria-label="{r.winner ? 'Winner' : r.winner === false ? 'Loser' : 'Result'}: {r.name}">
    <header class="plaque"><span>{r.winner ? 'Winner' : r.winner === false ? 'Loser' : 'Result'}</span></header>
    <p class="name">{r.name}</p>
    <dl class="stats">
      {#each r.stats as s (s.label)}
        <div class="stat" class:score={/score/i.test(s.label)}><dt>{s.label}</dt><dd>{s.value || '—'}</dd></div>
      {/each}
    </dl>
  </section>
</div>

<style>
  .card { left: 0; top: 0; width: 232px; padding: 14px 14px 18px; display: flex; flex-direction: column; align-items: stretch; gap: 14px; }
  .plaque { position: relative; height: 54px; display: grid; place-items: center;
    clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
    background: linear-gradient(180deg, rgba(255, 255, 255, .35), rgba(255, 255, 255, 0) 50%), linear-gradient(180deg, #8da3c4, #5b7299);
    box-shadow: inset 0 -3px 0 rgba(0, 0, 0, .18); }
  .plaque span { font-family: var(--display); font-size: 26px; letter-spacing: .12em; text-transform: uppercase; color: #fff;
    text-shadow: 0 2px 0 rgba(10, 25, 60, .55), 0 0 14px rgba(200, 225, 255, .5); }
  .won .plaque { background: linear-gradient(180deg, rgba(255, 255, 255, .45), rgba(255, 255, 255, 0) 50%), linear-gradient(180deg, #ffe27a, #e49e22); }
  .won .plaque span { text-shadow: 0 2px 0 rgba(110, 50, 0, .6), 0 0 16px rgba(255, 220, 120, .9); }
  .won .plaque::after { content: ''; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, .7) 50%, transparent 65%) -160% 0 / 60% 100% no-repeat;
    animation: shine 2.4s ease-in-out .4s infinite; }
  @keyframes shine { 55%, 100% { background-position: 260% 0; } }
  .name { margin: 0; font-size: 18px; font-weight: 800; text-align: center; color: var(--ink-strong); overflow-wrap: anywhere; }
  .stats { margin: 0; display: grid; gap: 8px; }
  .stat { display: flex; align-items: baseline; justify-content: space-between; padding: 10px 14px; border-radius: 6px; background: var(--well);
    box-shadow: inset 0 2px 3px rgba(10, 35, 80, .16), inset 0 0 0 1px #8ea2bf; }
  dt { font-family: var(--display); font-size: 12px; letter-spacing: .1em; color: var(--p700); }
  dd { margin: 0; font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--ink-strong); }
  .score dd { color: var(--p700); }
  @media (prefers-reduced-motion: reduce) { .won .plaque::after { animation: none; } }
</style>
