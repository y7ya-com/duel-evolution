<script>
  // Game tabs (theme.js .mu-tabs / .mu-tab): raised plates on a rail, the chosen one lit. tabs: [{ key, label }];
  // value the chosen key; onselect(key). Arrow keys move along the rail.
  let { tabs = [], value = null, onselect = () => {}, label = '' } = $props();
  function keys(e) {
    const i = tabs.findIndex(t => t.key === value);
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const t = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    if (t) onselect(t.key);
  }
</script>

<div class="mu-tabs" role="tablist" aria-label={label} tabindex="-1" onkeydown={keys}>
  {#each tabs as t (t.key)}
    <button type="button" class="mu-tab" role="tab" aria-selected={t.key === value} tabindex={t.key === value ? 0 : -1} onclick={() => onselect(t.key)}>{t.label}</button>
  {/each}
</div>
