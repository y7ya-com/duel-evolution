<script>
  // A game window: the original cyan bevel and blue title band, with a readable inset body.
  // An optional close also handles Esc; opening is immediate, without moving native hit targets.
  import Icon from '../Icon.svelte';
  let { title = '', onclose = null, width = null, role = 'dialog', modal = false, class: cls = '', style = '', children, panel = $bindable() } = $props();
  const keys = e => { if (e.key === 'Escape' && onclose) { e.preventDefault(); onclose(); } };
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="mu-plate {cls}" {role} aria-modal={modal || undefined} aria-label={title || undefined} style:width={width == null ? null : `${width}px`} {style}
  bind:this={panel} onkeydown={keys}>
  {#if title}
    <header class="mu-head">
      <h2>{title}</h2>
      {#if onclose}<button type="button" class="mu-icon-btn" aria-label="Close" onclick={onclose}><Icon name="close" size={16} /></button>{/if}
    </header>
  {/if}
  {@render children?.()}
</section>
