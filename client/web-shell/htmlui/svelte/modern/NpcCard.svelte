<script>
  // A duelist's card, modern (CNpcListMenu, CPlayerListMenu: who you clicked in the lobby; logic.js duelistCard): the
  // name on the title strip, the record as figures (wins, losses, win rate), the deck, the about text in a well. Before:
  // label rows on a green frame ("Win%" over "Wins0/Losses0"). Pass mode: the game keeps the mouse (a click outside
  // closes it, as before); a player's buttons, when the menu has them, take the pointer and play the game's own.
  import { duelistCard } from './logic.js';
  import Icon from './Icon.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const d = $derived(duelistCard(win));
  const api = $derived(view.api);
  const rate = r => r.wins + r.losses ? Math.round(100 * r.wins / (r.wins + r.losses)) + '%' : '—';
  const other = $derived(d.rows.filter(r => !d.record || !/^Wins/i.test(r.value)));
  const shown = v => !v || /^[?\s]+$/.test(v) ? 'Unknown' : v;
</script>

<div class="mu">
  <section class="mu-plate card" style:width="{win.w}px" style:height="{win.h}px" aria-label={d.name}>
    <header class="mu-head"><Icon name="profile" class="lead" /><h2>{d.name}</h2></header>
    <div class="body">
      {#if d.record}
        <dl class="figs">
          <div><dt>Wins</dt><dd>{d.record.wins}</dd></div>
          <div><dt>Losses</dt><dd>{d.record.losses}</dd></div>
          <div><dt>Win rate</dt><dd>{rate(d.record)}</dd></div>
        </dl>
      {/if}
      {#each other as r (r.label)}
        <p class="row"><span>{r.label}</span><b class:unknown={shown(r.value) === 'Unknown'}>{shown(r.value)}</b></p>
      {/each}
      {#if d.about}<p class="about mu-scroll">{d.about}</p>{/if}
      {#if d.buttons.length}
        <footer>
          {#each d.buttons as b (b.id)}
            <button type="button" class="mu-btn" data-state={b.state} disabled={b.state === 'disabled'} onclick={() => api.click(b.id)}>{b.label}</button>
          {/each}
        </footer>
      {/if}
    </div>
  </section>
</div>

<style>
  .card { left: 0; top: 0; display: flex; flex-direction: column; }
  .card :global(.lead) { color: var(--gold-300); }
  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; padding: 8px 12px 10px; }
  .figs { margin: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .figs div { padding: 4px 8px; border-radius: var(--r-row); background: var(--well); box-shadow: var(--well-shadow); }
  dt { font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-3); }
  dd { margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-strong); }
  .row { margin: 0; display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--ink-3); }
  .row b { color: var(--ink-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row b.unknown { color: var(--ink-3); font-weight: 600; font-style: italic; }
  .about { flex: 1; min-height: 0; margin: 2px 0 0; padding: 8px 10px; border-radius: var(--r-ctl); font-size: 12px; line-height: 1.45; white-space: pre-wrap;
    color: var(--ink); background: var(--well); box-shadow: var(--well-shadow); pointer-events: auto; }   /* its own wheel */
  footer { display: flex; flex-wrap: wrap; gap: 6px; pointer-events: auto; }
  footer .mu-btn { height: 28px; padding: 0 12px; }
</style>
