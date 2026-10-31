<script>
  // A text field over one of the game's inputs (Input, or a MultiInput's: textarea): the game's text until the player
  // edits it here, every edit through the control's setText, its focus the game's too (a click on the control), Enter
  // in a one-line field the game's own (WM_CHAR 13) unless onenter takes it. Esc leaves the field.
  let { c, api, label = '', placeholder = '', onenter = null, rows = 6, area = false } = $props();
  let el = $state(), value = $state(''), entered = null;
  $effect(() => {
    const v = c?.value ?? '';
    if (document.activeElement !== el || (entered !== null && v !== entered)) { value = v; entered = null; }
  });
  const commit = () => c && api.setText(c.id, value);
  function keys(e) {
    if (e.isComposing) return;
    if (e.key === 'Escape') { el.blur(); return; }
    if (e.key === 'Enter' && !area) {
      e.preventDefault();
      commit();
      entered = value;
      onenter ? onenter() : api.char(13);
    }
  }
  const focus = () => { value = c.value ?? ''; api.click(c.id); };
  const input = e => { entered = null; if (!e.isComposing) commit(); };
</script>

{#if area}
  <textarea bind:this={el} bind:value {rows} maxlength={c.maxLen || undefined} spellcheck="false" aria-label={label} {placeholder}
    oninput={input} oncompositionend={commit} onfocus={focus} onkeydown={keys}></textarea>
{:else}
  <input bind:this={el} bind:value type={c.password ? 'password' : 'text'} maxlength={c.maxLen || undefined} spellcheck="false"
    autocomplete="off" aria-label={label} {placeholder} oninput={input} oncompositionend={commit} onfocus={focus} onkeydown={keys} />
{/if}

<style>
  input, textarea { display: block; width: 100%; border: 0; border-radius: 10px; font: inherit; font-size: 13px; color: var(--navy-900);
    background: #fff; box-shadow: inset 0 1px 2px rgba(11, 42, 92, .12), 0 0 0 1px var(--btn-edge);
    user-select: text; }
  input { height: 30px; padding: 0 12px; }
  textarea { padding: 8px 12px; resize: none; line-height: 1.45; }
  input::placeholder, textarea::placeholder { color: #5b6f8c; }
  input:focus, textarea:focus { outline: none; box-shadow: inset 0 1px 2px rgba(11, 42, 92, .2), 0 0 0 1px var(--p500), 0 0 0 3px var(--p200); }
</style>
