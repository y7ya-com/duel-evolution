<script>
  // A window drawn by the generic controls (controls/basic.js syncWindow: one element per control, redrawn when its
  // snapshot changes), re-synced whenever the window's snapshot does
  let { view } = $props();
  const st = new Map();
</script>

<div style="display: contents" {@attach el => { view.api.syncWindow(el, view.win, st); }}></div>
