<script>
  // A duel's result, one card a player (CWindowResult; logic.js result; owner: "the W-L record page thing at the end
  // looks so bad"): a game panel at the engine's place, the WINNER (gold) / LOSER (steel) plaque in the display face,
  // the player's name, the record as big figures in a well. Pass mode: the game's own clicks move on.
  import { result } from './logic.js';
  let { view } = $props();
  const win = $derived(view.win);
  const r = $derived(result(win));
  const caption = label => label.toUpperCase() === 'WIN' ? 'Wins' : label.toUpperCase() === 'LOSE' ? 'Losses' : label;
</script>

<div class="mu">
  <section class="mu-plate card" class:npc={win.cls === "CWindowResultNpc"} style:left={win.cls === "CWindowResultNpc" ? `${292 - win.x}px` : "0px"} style:top={win.cls === "CWindowResultNpc" ? `${120 - win.y}px` : "0px"} class:won={r.winner === true} class:lost={r.winner === false} aria-label="{r.winner ? 'Winner' : r.winner === false ? 'Loser' : 'Result'}: {r.name}">
    <header class="plaque"><span>{r.winner ? 'Winner' : r.winner === false ? 'Loser' : win.cls === 'CWindowResultNpc' ? 'Duel record' : 'Result'}</span></header>
    <p class="name">{r.name}</p>
    <dl class="stats">
      {#each r.stats as s (s.label)}
        <div class="stat" class:score={/score/i.test(s.label)}><dt>{caption(s.label)}</dt><dd>{s.value === '' ? '—' : s.value}</dd></div>
      {/each}
    </dl>
  </section>
</div>

<style>

  .card { left:0; top:0; width:232px; max-width:100%; box-sizing:border-box; padding:7px 9px 12px; display:flex; flex-direction:column; gap:9px; }
  .card.npc { width:440px; max-width:none; }
  .plaque { position:relative; height:46px; display:grid; place-items:center; border:1px solid #2b6daa; border-radius:2px; background:var(--band); box-shadow:inset 0 1px #ddffff,inset 0 -2px #12498766; }
  .plaque span { font:italic 900 26px Arial,sans-serif; letter-spacing:.04em; text-transform:uppercase; color:#fff; text-shadow:1px 0 #244b7c,-1px 0 #244b7c,0 2px #244b7c; }
  .won .plaque { background:var(--gold); border-color:#bd8a29; }
  .won .plaque span { color:#fffde4; text-shadow:1px 0 #996719,-1px 0 #996719,0 2px #996719; }
  .lost .plaque { background:linear-gradient(#8cbadd,#508bc0 50%,#356da2); }
  .name { margin:0; padding:3px 2px; font-size:17px; font-weight:700; text-align:center; color:var(--ink-strong); overflow-wrap:anywhere; }
  .stats { margin:0; display:flex; flex-direction:column; padding:1px; border:1px solid #6096b8; background:#f0fcff; }
  .stat { display:flex; align-items:baseline; justify-content:space-between; gap:12px; min-height:33px; padding:4px 10px; border-bottom:1px solid #b4d8e9; }
  .stat:nth-child(even) { background:#d8eff9; }
  .stat:last-child { border-bottom:0; }
  dt { font-size:13px; font-weight:700; color:var(--ink-2); }
  dd { margin:0; font-size:21px; font-weight:700; font-variant-numeric:tabular-nums; color:var(--ink-strong); }
  .score dd { color:var(--p700); }

</style>
