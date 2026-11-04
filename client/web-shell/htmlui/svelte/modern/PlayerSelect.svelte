<script module>
  // Select Player, modern (CWindowPlayerSelect, src/Game: the four player slots). Owned: each slot is a real button that
  // clicks the slot's own TextSwitch; hovering one hovers it in the game too, so the engine draws that character's
  // waist-up bust beside the panel, as it always has. Delete and Back are the window's own switches (logic.js slots).
  import { slots, backButton, heading } from './logic.js';
</script>

<script>
  import Icon from './Icon.svelte';
  let { view } = $props();
  let panel;
  $effect(() => { panel?.querySelector('.slot-main')?.focus({ preventScroll: true }); });
  const win = $derived(view.win);
  const list = $derived(slots(win));
  const backBtn = $derived(backButton(win));
  const title = $derived(heading(win));
  const click = c => c && c.state !== 'disabled' && view.api.click(c.id);
  const hover = c => view.api.hover?.(c.id);
  function keys(ev) {
    const bs = [...ev.currentTarget.querySelectorAll('.slot-main')], i = bs.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      bs[i < 0 ? 0 : (i + (ev.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]?.focus();
    } else if (ev.key === 'Escape') click(backBtn);
  }
</script>

<div class="mu">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="mu-plate panel" aria-label={title} onkeydown={keys} bind:this={panel}>
    <header class="mu-head">
      <svg class="mu-emblem" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" /><circle cx="12" cy="12" r="3.2" fill="currentColor" /></svg>
      <h2>{title}</h2>
    </header>
    <ol class="slots">
      {#each list as s, i (s.row.id)}
        <li class="slot" class:empty={s.empty} data-state={s.row.state}>
          <button type="button" class="slot-main" onclick={() => click(s.row)} onpointerenter={() => hover(s.row)} onfocus={() => hover(s.row)}
            disabled={s.row.state === 'disabled'}>
            <span class="badge" aria-hidden="true">
              {#if s.empty}<Icon name="plus" size={18} />{:else}{String(i + 1).padStart(2, '0')}{/if}
            </span>
            <span class="who">
              <span class="name">{s.name}</span>
              <span class="sub">{s.empty ? `Slot ${i + 1} is free` : `Slot ${i + 1}`}</span>
            </span>
            {#if s.level}<span class="mu-chip" aria-label="Level {+s.level}">Lv <b>{+s.level}</b></span>{/if}
            {#if !s.empty}<Icon name="chevron" class="go" />{/if}
          </button>
          {#if !s.del}<span class="spacer" aria-hidden="true"></span>{/if}
          {#if s.del}
            <button type="button" class="mu-icon-btn danger del" aria-label="Delete {s.name}" title="Delete {s.name}"
              onclick={() => click(s.del)} disabled={s.del.state === 'disabled'}><Icon name="trash" /></button>
          {/if}
        </li>
      {/each}
    </ol>
    {#if backBtn}
      <footer>
        <button type="button" class="mu-btn" data-state={backBtn.state} onclick={() => click(backBtn)}><Icon name="back" size={16} />{backBtn.label}</button>
      </footer>
    {/if}
  </section>
</div>

<style>

  .panel { left:0; top:-44px; width:464px; padding-bottom:12px; }
  .slots { list-style:none; margin:0; padding:12px 12px 4px; display:flex; flex-direction:column; gap:8px; }
  .slot { position:relative; display:flex; align-items:center; gap:8px; }
  .spacer { width:28px; flex:none; }
  .slot-main { flex:1; display:flex; align-items:center; gap:12px; height:58px; padding:0 10px 0 0; border:1px solid #438bc1; border-radius:3px; background:var(--card); box-shadow:inset 0 1px #fff,0 1px #4ca5d3; }
  .slot-main:hover,.slot[data-state='hover'] .slot-main { background:linear-gradient(#fff9ce,#ffe894); border-color:#cf912a; }
  .slot-main:focus-visible { outline:2px solid var(--gold-400); outline-offset:2px; }
  .slot-main:active { background:var(--gold); }
  .badge { display:grid; place-items:center; align-self:stretch; width:48px; flex:none; color:#fff; background:var(--sel); border-right:1px solid #1761ad; font:italic 800 23px Arial,sans-serif; text-shadow:0 2px #19558d; box-shadow:inset 2px 0 #a8f5ff; }
  .who { flex:1; min-width:0; display:flex; flex-direction:column; gap:3px; text-align:left; }
  .name { font-size:16px; font-weight:700; color:var(--ink-strong); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .sub { font-size:12px; color:var(--ink-3); }
  .slot-main :global(.go) { color:var(--p700); }
  .empty .slot-main { background:#c6e9f4b3; border-color:#77b5d2; }
  .empty .badge { color:#e3faff; background:linear-gradient(#6ca9d1,#367bb0); }
  .empty .name { color:var(--ink-2); font-weight:600; }
  .del { flex:none; width:28px; height:28px; border:1px solid #5c9dbf; background:var(--btn); }
  footer { display:flex; justify-content:flex-end; padding:8px 12px 0; }
  footer .mu-btn { min-width:96px; }

</style>
