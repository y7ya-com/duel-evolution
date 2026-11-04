<script module>
  // what each way in does (the game says only its name)
  const SAYS = { auto: 'The game finds you an opponent', create: 'Open a duel and wait for a challenger' };
  const ICON = { auto: 'search', create: 'duel' };
</script>

<script>
  // The lobby's Duel menu, modern (CWindowModelDuel, the dock's Duel; logic.js duelMenu): how busy the lobby is as three
  // figures (searching through Auto Duel, waiting in a created duel, duelling), then the two ways in as large cards that say what they do, Cancel. Before:
  // green labels with their counts far to the right, and two grey bars named only "Auto Duel" and "Create Duel". The
  // cards are the game's own switches. Keys: focus on Auto Duel; Left / Right between the cards, Enter, Esc Cancel.
  import { duelMenu, nice } from './logic.js';
  import { focusSoon } from './macro.js';
  import Icon from './Icon.svelte';
  import { openTagLobby } from '../../tag-lobby.js';
  import GamePanel from './game/GamePanel.svelte';
  import GameButton from './game/GameButton.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const d = $derived(duelMenu(win));
  const api = $derived(view.api);
  const shown = $derived(win.shown);
  let panel;
  $effect(() => shown ? focusSoon(panel, '.way') : undefined);
  // Esc is the panel's close (Cancel); Left / Right between the cards
  function keys(e) {
    const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!k) return;
    e.preventDefault();
    const ws = [...panel.querySelectorAll('.way')];
    ws[Math.max(0, Math.min(ws.length - 1, ws.indexOf(document.activeElement) + k))]?.focus();
  }
  const keyed = el => { el.addEventListener('keydown', keys); return () => el.removeEventListener('keydown', keys); };
</script>

<div class="mu" {@attach keyed}>
  <div class="scrim" style:left="{-win.x}px" style:top="{-win.y}px"></div>
  <GamePanel title={nice(d.title)} modal width={win.w} bind:panel onclose={d.cancel ? () => api.click(d.cancel.id) : null}>
    {#if d.counts.length}
      <dl class="figs">
        {#each d.counts as r (r.label)}<div title={r.game}><dt>{r.label}</dt><dd>{r.n ?? '—'}</dd></div>{/each}
      </dl>
    {/if}
    <div class="ways">
      {#each d.ways as w (w.c.id)}
        <GameButton class="way" gold={w.kind === 'auto'} ctl={w.c} {api}>
          <Icon name={ICON[w.kind] || 'duel'} size={22} />
          <b>{w.label}</b>
          {#if SAYS[w.kind]}<small>{SAYS[w.kind]}</small>{/if}
        </GameButton>
      {/each}
      <GameButton class="way" onclick={() => openTagLobby()}>
        <Icon name="people" size={22} /><b>Tag Duel</b><small>Invite a teammate and an opposing team</small>
      </GameButton>
    </div>
    {#if d.cancel}<footer><GameButton ctl={d.cancel} {api} label={d.cancel.label} /></footer>{/if}
  </GamePanel>
</div>

<style>
  .scrim { position: absolute; width: 1024px; height: 768px; background: rgba(10, 50, 120, .3); animation: fade .2s var(--ease) both; }
  @keyframes fade { from { opacity: 0; } }
  .figs { margin: 14px 18px 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .figs div { padding: 8px 12px; border-radius: var(--r-ctl); background: var(--well); box-shadow: var(--well-shadow); }
  dt { font-size: 11px; font-weight: 700; color: var(--ink-3); }
  dd { margin: 2px 0 0; font-size: 20px; font-weight: 800; color: var(--ink-strong); }
  .ways { margin: 12px 18px 0; display: grid; grid-template-columns: 1fr; gap: 8px; }
  /* a way in: a large game key, its icon beside its name and what it does */
  .ways :global(.mu-btn.way) { height: auto; display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 10px;
    align-items: center; justify-items: start; padding: 12px 14px; text-align: left; white-space: normal; }
  .ways :global(.way .mu-ico) { grid-row: span 2; }
  .ways :global(.way b) { font-size: 15px; font-weight: 800; }
  .ways :global(.way small) { font-size: 11.5px; font-weight: 600; opacity: .75; }
  footer { display: flex; justify-content: flex-end; padding: 12px 18px 14px; }
  footer :global(.mu-btn) { min-width: 104px; }
</style>
