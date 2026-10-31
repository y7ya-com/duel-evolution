<script>
  // A game list (theme.js .mu-list / .mu-row): rows in a well, a native scroller (the owner's rule), hover lights a row,
  // the chosen one a blue bar with a gold notch. items: [{ key, ... }]; selected: the chosen key; onpick(item);
  // row: a snippet for a row's inside (defaults to item.label). Up / Down move, Enter picks.
  let { items = [], selected = null, onpick = () => {}, row = null, label = '', height = null } = $props();
  function keys(e) {
    const i = items.findIndex(t => t.key === selected);
    if (e.key === 'Enter' && i >= 0) { e.preventDefault(); onpick(items[i]); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const t = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (t) onpick(t);
  }
</script>

<div class="mu-list mu-scroll" role="listbox" aria-label={label} tabindex="0" style:height={height == null ? null : `${height}px`} onkeydown={keys}>
  {#each items as it (it.key)}
    <div class="mu-row" role="option" aria-selected={it.key === selected} tabindex="-1" onclick={() => onpick(it)} onkeydown={() => {}}>
      {#if row}{@render row(it)}{:else}{it.label}{/if}
    </div>
  {/each}
</div>
