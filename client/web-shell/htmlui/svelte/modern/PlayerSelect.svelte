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
              {#if s.empty}<Icon name="plus" size={18} />{:else}{s.name.trim().charAt(0).toUpperCase()}{/if}
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
  .panel { left: 0; top: -44px; width: 480px; padding-bottom: 14px; }
  .slots { list-style: none; margin: 0; padding: 12px 14px 4px; display: flex; flex-direction: column; gap: 8px; }
  .slot { position: relative; display: flex; align-items: center; gap: 10px; }
  .spacer { width: 30px; flex: none; }
  /* a slot: a white card in the window, the 2008 row's blue edge */
  .slot-main { flex: 1; display: flex; align-items: center; gap: 12px; height: 54px; padding: 0 12px 0 10px; border-radius: 12px 12px 12px 4px;
    background: linear-gradient(180deg, #ffffff, #eefaff); box-shadow: 0 0 0 1px #3a9de6, inset 0 -2px 0 rgba(65, 171, 239, .25), 0 2px 4px rgba(10, 60, 130, .18);
    transition: transform .16s var(--ease), background .16s, box-shadow .16s; }
  .slot-main:hover, .slot[data-state='hover'] .slot-main { transform: translateX(3px); background: linear-gradient(180deg, #ffffff, #d9f5ff);
    box-shadow: 0 0 0 1px #0985ff, 0 0 0 3px rgba(0, 180, 255, .3), 0 8px 18px -8px rgba(0, 120, 230, .55); }
  .slot-main:focus-visible { outline: 2px solid var(--azure-500); outline-offset: 2px; }
  .slot-main:active { transform: translateX(1px) scale(.995); }
  .badge { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border-radius: 50%; font-weight: 800; font-size: 16px;
    color: var(--gold-ink); background: radial-gradient(circle at 35% 30%, #ffffc8, #f9e45f 55%, #eca430);
    box-shadow: 0 0 0 1.5px var(--gold-edge), 0 2px 4px rgba(160, 80, 0, .3); }
  .who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; text-align: left; }
  .name { font-size: 15px; font-weight: 750; color: var(--ink-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { font-size: 11.5px; color: var(--ink-3); }
  .slot-main :global(.go) { color: var(--azure-500); transition: transform .16s var(--ease); }
  .slot-main:hover :global(.go) { transform: translateX(2px); }
  .empty .slot-main { background: rgba(255, 255, 255, .45); box-shadow: none; outline: 1.5px dashed #3a9de6; outline-offset: -1.5px; }
  .empty .slot-main:hover { outline-color: transparent; }
  .empty .badge { color: var(--azure-500); background: #fff; box-shadow: inset 0 0 0 1.5px #3a9de6; }
  .empty .name { font-weight: 650; color: var(--ink-2); }
  .del { flex: none; }
  footer { display: flex; justify-content: flex-end; padding: 8px 14px 0; }
</style>
