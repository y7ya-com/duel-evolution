<script>
  // A Yes / No dialog or a prompt, modern (CWindowModelDialogYesNo, CWindowModelInput1, CWindowModelDialogError: a frame,
  // its message TextField, the game's switches; logic.js dialog), as a GameDialog: the message, the field if there is
  // one, the game's own buttons, Yes / OK the primary; Enter is the primary, Esc the way out.
  import { dialog, leaveButton, primary } from './logic.js';
  import Field from './Field.svelte';
  import GameDialog from './game/GameDialog.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const d = $derived(dialog(win));
  const api = $derived(view.api);
  const press = b => b && b.state !== 'disabled' && api.click(b.id);
  const ok = () => press(d.buttons.find(primary));
  const leave = () => press(leaveButton(d.buttons));
  const buttons = $derived(d.buttons.map(b => ({ label: b.label, gold: primary(b), disabled: b.state === 'disabled', onclick: () => press(b) })));
</script>

<div class="mu">
  <GameDialog {win} text={d.text} {buttons} onleave={leave} onprimary={ok}>
    {#if d.input}<div class="prompt-field"><Field c={d.input} {api} label={d.text} onenter={ok} /></div>{/if}
  </GameDialog>
</div>

<style>
  .prompt-field { margin-top: 12px; }
</style>
