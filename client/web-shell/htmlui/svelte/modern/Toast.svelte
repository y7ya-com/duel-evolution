<script>
  // CWindowModelDialogOk, modern: an OK box that is only news becomes a toast (toasts.svelte.js) and its own OK is
  // pressed at once, so the game goes on; one that isn't (logic.js toastable: null) stays a dialog.
  import { toastable } from './logic.js';
  import { toast } from './toasts.svelte.js';
  import Dialog from './Dialog.svelte';
  let { view } = $props();
  const t = $derived(toastable(view.win));
  // its OK pressed once the game shows the window (a press while it opens hidden lands nowhere, and the box then stayed
  // open behind the toast, blocking the screen: seen with "Duel Request was refused."), again every 600 ms until it is gone
  const okId = $derived(t?.ok.id), shown = $derived(!!view.win.shown);
  let sent = false;
  $effect(() => {
    if (!okId || !shown) return;
    if (!sent) { sent = true; toast(t.text); }
    view.api.click(okId);
    const again = setInterval(() => view.api.click(okId), 600);
    return () => clearInterval(again);
  });
</script>

{#if !t}<Dialog {view} />{/if}
