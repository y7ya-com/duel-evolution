<script>
  // A Yes / No dialog or a prompt, modern (CWindowModelDialogYesNo, CWindowModelInput1, CWindowModelDialogError: a frame,
  // its message TextField, the game's switches; logic.js dialog), as a GameDialog: the message, the field if there is
  // one, the game's own buttons, Yes / OK the primary; Enter is the primary, Esc the way out.
  import { dialog, leaveButton, primary, duelRequest, requesting } from './logic.js';
  import Field from './Field.svelte';
  import GameDialog from './game/GameDialog.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const d = $derived(dialog(win));
  const api = $derived(view.api);
  const press = b => b && b.state !== 'disabled' && api.click(b.id);
  const ok = () => press(d.buttons.find(primary));
  const leave = () => press(leaveButton(d.buttons));
  // a duel request (the duel's owner asked to accept a challenger): the challenger up top, Yes / No read Accept /
  // Decline; the challenger's own wait ("Requesting Duel" and its Cancel): who is waiting for what, and a pulse
  const req = $derived(duelRequest(d.text));
  const wait = $derived(requesting(d.text));
  const ASK = { Yes: 'Accept', No: 'Decline' };
  const buttons = $derived(d.buttons.map(b => ({ label: req ? ASK[b.label?.trim()] || b.label : b.label, gold: primary(b), disabled: b.state === 'disabled', onclick: () => press(b) })));
</script>

<div class="mu">
  {#if req}
    <GameDialog {win} title="Duel Request" {buttons} onleave={leave} onprimary={ok}>
      <div class="who">
        {#if req.level}<span class="mu-chip">Lv <b>{req.level}</b></span>{/if}
        <strong>{req.name || 'A duelist'}</strong>
        {#if req.title}<small>{req.title}</small>{/if}
      </div>
      <p class="ask">wants to duel you. Accept?</p>
    </GameDialog>
  {:else if wait}
    <GameDialog {win} title="Duel Request" {buttons} onleave={leave} onprimary={ok}>
      <p class="ask"><i class="pulse" aria-hidden="true"></i>Request sent: waiting for an answer…</p>
    </GameDialog>
  {:else}
    <GameDialog {win} text={d.text} {buttons} onleave={leave} onprimary={ok}>
      {#if d.input}<div class="prompt-field"><Field c={d.input} {api} label={d.text} onenter={ok} /></div>{/if}
    </GameDialog>
  {/if}
</div>

<style>
  .prompt-field { margin-top: 12px; }
  .who { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .who strong { font-size: 20px; font-weight: 800; color: var(--ink-strong); }
  .who small { font-size: 12px; font-weight: 650; color: var(--link); }
  .ask { margin: 8px 0 0; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 14px; font-weight: 650; color: var(--ink); }
  .pulse { width: 9px; height: 9px; border-radius: 50%; background: var(--ok); animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .25; transform: scale(.7); } }
  @media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
</style>
