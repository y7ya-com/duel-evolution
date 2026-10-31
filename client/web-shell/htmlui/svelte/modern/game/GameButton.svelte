<script>
  // A game button (theme.js .mu-btn): a physical key with a lip the press pushes in, a shine on hover, gold for the one
  // primary action. ctl + api: it stands for one of the game's controls, so the pointer over it is the game's too
  // (api.hover: the engine's own hover, its sound and help text where it has them) and a press is the game's click.
  let { label = '', gold = false, ctl = null, api = null, onclick = null, disabled = false, icon = null, type = 'button', class: cls = '', children, ...rest } = $props();
  const off = $derived(disabled || ctl?.state === 'disabled' || ctl?.enabled === false);
  const press = e => { if (onclick) onclick(e); else if (ctl && api) api.click(ctl.id); };
  const enter = () => { if (ctl && api?.hover && !off) api.hover(ctl.id); };
</script>

<button {type} class="mu-btn {cls}" class:gold data-state={ctl?.state === 'hover' || ctl?.state === 'pressed' ? ctl.state : undefined} disabled={off}
  onclick={press} onpointerenter={enter} {...rest}>
  {@render icon?.()}{#if children}{@render children()}{:else}{label}{/if}
</button>
