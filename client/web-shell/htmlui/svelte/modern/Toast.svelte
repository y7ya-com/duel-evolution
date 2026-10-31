<script>
  // CWindowModelDialogOk, modern: an OK box that is only news becomes a toast (toasts.svelte.js) and its own OK is
  // pressed at once, so the game goes on; one that isn't (logic.js toastable: null) stays a dialog.
  import { toastable } from './logic.js';
  import { toast } from './toasts.svelte.js';
  import Dialog from './Dialog.svelte';
  let { view } = $props();
  const t = $derived(toastable(view.win));
  let sent = false;
  $effect(() => {
    if (!t || sent) return;
    sent = true;
    toast(t.text);
    view.api.click(t.ok.id);
  });
</script>

{#if !t}<Dialog {view} />{/if}
