<script>
  // A duelist's card, modern (CNpcListMenu, CPlayerListMenu: who you clicked in the lobby; logic.js duelistCard): the
  // name on the title strip, the record as figures (wins, losses, win rate), the deck, the about text in a well. Before:
  // label rows on a green frame ("Win%" over "Wins0/Losses0"). Pass mode: the game keeps the mouse (a click outside
  // closes it, as before); a player's buttons, when the menu has them, take the pointer and play the game's own.
  import { duelistCard } from './logic.js';
  import { inviteDuel, cardName } from '../../invite.js';
  import { openTagLobby } from '../../tag-lobby.js';
  import { toast } from './toasts.svelte.js';
  import Icon from './Icon.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const d = $derived(duelistCard(win));
  const api = $derived(view.api);
  const rate = r => r.wins + r.losses ? Math.round(100 * r.wins / (r.wins + r.losses)) + '%' : '—';
  const other = $derived(d.rows.filter(r => !d.record || !/^Wins/i.test(r.value)));
  // a challenge is the card's one primary action (gold, first)
  const DUEL = /Duel\s*Request/i;
  const buttons = $derived([...d.buttons].sort((a, b) => DUEL.test(b.label) - DUEL.test(a.label)));
  // a player's card with no duel of theirs open: a Duel of its own (../../invite.js: the server makes the game's request
  // possible, then the card is reopened and its "Send Duel Request" pressed); a refusal's reason as a toast
  const invitable = $derived(win.cls === 'CPlayerListMenu' && !d.buttons.some(b => DUEL.test(b.label)) && d.buttons.length > 0);
  let sending = $state(false);
  async function duel() {
    if (sending) return;
    sending = true;
    try { const r = await inviteDuel(api, cardName(d.name)); if (!r.ok) toast(r.message); }
    finally { sending = false; }
  }
  const shown = v => !v || /^[?\s]+$/.test(v) ? 'Unknown' : v;
</script>

<div class="mu">
  <section class="mu-plate card" style:width="{win.w}px" style:min-height="{Math.max(win.h, 240)}px" aria-label={d.name}>
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
      {#if d.duel}
        <div class="duel"><b>Open duel</b>{#each d.duel as t (t)}<span>{t}</span>{/each}</div>
      {/if}
      {#if d.buttons.length}
        <footer>
          {#if win.cls === 'CPlayerListMenu'}<button type="button" class="mu-btn" onclick={() => openTagLobby(cardName(d.name))}><Icon name="people" size={15} />Tag Duel</button>{/if}
          {#if invitable}
            <button type="button" class="mu-btn gold" disabled={sending} onclick={duel}><Icon name="duel" size={15} />{sending ? 'Sending…' : 'Duel'}</button>
          {/if}
          {#each buttons as b (b.id)}
            <button type="button" class="mu-btn" class:gold={DUEL.test(b.label)} data-state={b.state} disabled={b.state === 'disabled'} onclick={() => api.click(b.id)}>{b.label}</button>
          {/each}
        </footer>
      {/if}
    </div>
  </section>
</div>

<style>
  .card { left: 0; top: 0; display: flex; flex-direction: column; }
  .card :global(.lead) { color: var(--gold-300); }
  .body { overflow: hidden; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; padding: 8px 12px 10px; }
  .figs { margin: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .figs div { padding: 4px 8px; border-radius: var(--r-row); background: var(--well); box-shadow: var(--well-shadow); }
  dt { font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-3); }
  dd { margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-strong); }
  .row { margin: 0; display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--ink-3); align-items: baseline; flex-shrink: 0; }
  .row > span { flex: 0 0 32%; overflow-wrap: anywhere; }
  .row b { min-width: 0; text-align: right; color: var(--ink-strong); white-space: normal; overflow-wrap: anywhere; }
  .row b.unknown { color: var(--ink-3); font-weight: 600; font-style: italic; }
  .about { flex: 1 1 auto; max-height: 160px; overflow-y: auto; min-height: 0; margin: 2px 0 0; padding: 8px 10px; border-radius: var(--r-ctl); font-size: 12px; line-height: 1.45; white-space: pre-wrap;
    color: var(--ink); background: var(--well); box-shadow: var(--well-shadow); pointer-events: auto; }   /* its own wheel */
  .duel { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
  .duel b { margin-right: 4px; font-size: 11px; font-weight: 800; color: var(--ok); }
  .duel span { height: 20px; padding: 0 8px; border-radius: 10px; font-size: 11px; font-weight: 700; line-height: 20px; color: var(--ink-2);
    background: var(--well); box-shadow: var(--well-shadow); }
  footer { display: flex; flex-wrap: wrap; gap: 6px; pointer-events: auto; flex-shrink: 0; }
  footer .mu-btn { height: 28px; padding: 0 12px; }

  .body { gap:8px; padding:10px 12px 12px; }
  .figs { gap:0; border:1px solid #6ca0bf; background:#e8faff; box-shadow:inset 0 1px #fff; }
  .figs div { border-radius:0; padding:5px 8px; background:none; box-shadow:none; border-right:1px solid #a5cce1; }
  .figs div:last-child { border:0; }
  dt { font-size:11px; text-transform:none; letter-spacing:0; }
  dd { font-size:19px; }
  .row { font-size:13px; padding:2px 0; }
  .about { border-radius:2px; font-size:13px; }
  .duel span { border-radius:2px; }

</style>
