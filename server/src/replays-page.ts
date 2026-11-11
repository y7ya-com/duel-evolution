// GET /replays: the signed-in player's duel replays (GET /api/de/replays), each a download of its EDOPro replay
// (.yrpX). One self-contained page: no build, no outside files.
export const REPLAYS_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>My Replays · Duel Evolution</title>
<link rel="icon" type="image/png" href="/favicon.png">
<style>
  :root { --bg: #0d1117; --panel: #161b22; --line: #2a313c; --text: #e6e9ee; --dim: #9aa4b2; --accent: #e3b341; --win: #3fb950; --lose: #f85149; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .lead { color: var(--dim); margin: 0 0 24px; }
  .help { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; color: var(--dim); font-size: 14px; }
  .help b { color: var(--text); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  th { color: var(--dim); font-weight: 500; font-size: 13px; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .win { color: var(--win); } .lose { color: var(--lose); } .draw, .abandon { color: var(--dim); }
  .kind { font-size: 12px; color: var(--dim); border: 1px solid var(--line); border-radius: 4px; padding: 1px 6px; margin-right: 6px; }
  a.dl { color: var(--bg); background: var(--accent); text-decoration: none; padding: 5px 12px; border-radius: 6px; font-weight: 600; font-size: 13px; white-space: nowrap; }
  a.dl:hover { filter: brightness(1.1); }
  a { color: var(--accent); }
  .empty { color: var(--dim); padding: 24px 0; }
  @media (max-width: 600px) { .hide-s { display: none; } th, td { padding: 8px 4px; } }
</style>
</head>
<body>
<main>
  <h1>My Replays</h1>
  <p class="lead">Your duels from the last 90 days, against NPCs and players.</p>
  <div class="help">Each file is an <b>EDOPro replay (.yrpX)</b>. To watch one, drag it onto the EDOPro window, or put it in EDOPro's
    <b>replay</b> folder and open it from <b>Replays</b>. Your duels are also saved in the game's own <b>Duel Record</b>.</div>
  <div id="out"><p class="empty">Loading…</p></div>
</main>
<script>
  const out = document.getElementById("out");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const label = { win: "Win", lose: "Loss", draw: "Draw", abandon: "Unfinished" };
  fetch("/api/de/replays", { credentials: "same-origin" }).then(async (r) => {
    if (r.status === 401) { out.innerHTML = '<p class="empty">Sign in to see your replays. <a href="/">Go to the game</a></p>'; return; }
    if (!r.ok) { out.innerHTML = '<p class="empty">Your replays could not be loaded. Try again later.</p>'; return; }
    const { replays } = await r.json();
    if (!replays.length) { out.innerHTML = '<p class="empty">No replays yet. Every duel you finish from now on is saved here.</p>'; return; }
    out.innerHTML = '<table><thead><tr><th>Date</th><th>Opponent</th><th>Result</th><th class="num hide-s">Turns</th><th class="num hide-s">Time</th><th></th></tr></thead><tbody>'
      + replays.map((x) => {
        const d = new Date(x.at * 1000);
        const when = d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        const mins = Math.floor(x.secs / 60) + ":" + String(x.secs % 60).padStart(2, "0");
        return '<tr><td>' + esc(when) + '</td><td><span class="kind">' + (x.kind === "npc" ? "NPC" : "PvP") + '</span>' + esc(x.opponent || "?")
          + (x.game > 1 ? ' <span class="kind">Game ' + x.game + '</span>' : '') + '</td><td class="' + esc(x.result) + '">' + esc(label[x.result] || x.result)
          + '</td><td class="num hide-s">' + x.turns + '</td><td class="num hide-s">' + mins + '</td><td class="num"><a class="dl" href="/api/de/replays/' + x.id
          + '" download>Download</a></td></tr>';
      }).join("") + '</tbody></table>';
  }, () => { out.innerHTML = '<p class="empty">Your replays could not be loaded. Try again later.</p>'; });
</script>
</body>
</html>
`;
