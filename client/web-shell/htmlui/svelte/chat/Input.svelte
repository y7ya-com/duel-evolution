<script>
  // An input (screens/chat.js ownInput): a real <input> (<textarea> for a multi-line one) where the game draws its
  // text (8 in), over the field draw() drew. It shows the game's text until it has the focus, then its own (the game
  // gets every edit through setText); Enter is the game's own WM_CHAR '\r' (the chat sends).
  let { c, n, api } = $props();
  let el = $state(), entered = null;   // the line Enter sent, until the game's text moves off it
  const commit = () => api.setText(c.id, el.value);
  function onfocus() { el.value = c.value; api.click(c.id); }   // the game's focus too
  function oninput(e) { entered = null; if (!e.isComposing) commit(); }
  function onkeydown(e) {
    if (e.isComposing) return;
    if (e.key === 'Enter' && !c.multiLine) {
      e.preventDefault();
      commit();
      entered = el.value;   // what the game does with it comes back in a snapshot
      api.char(13);
    } else if (e.key === 'Escape') el.blur();
  }
  // the game's text while the DOM isn't editing, or once it has done something with the line Enter sent (the setText
  // and the Enter play a frame apart: the first snapshot after Enter can still hold the line)
  $effect(() => {
    const v = c.value;
    c;
    if (document.activeElement !== el || (entered !== null && v !== entered)) { el.value = v; entered = null; }
  });
</script>

{#if c.multiLine}
  <textarea bind:this={el} class="own chat-in" spellcheck="false" autocomplete="off" maxlength={c.maxLen}
    aria-label={c.name || 'Text'} {onfocus} {oninput} oncompositionend={commit} {onkeydown}
    style:left="{c.x + 8}px" style:top="{c.y + 8}px" style:width="{c.w - 16}px" style:height="{c.h - 16}px"
    style:z-index={n} style:display={c.shown ? '' : 'none'}></textarea>
{:else}
  <input bind:this={el} class="own chat-in" type={c.password ? 'password' : 'text'} spellcheck="false"
    autocomplete={c.password ? 'current-password' : 'off'} maxlength={c.maxLen} aria-label={c.name || 'Text'}
    {onfocus} {oninput} oncompositionend={commit} {onkeydown}
    style:left="{c.x + 8}px" style:top="{c.y + 8}px" style:width="{c.w - 16}px" style:height="{c.h - 16}px"
    style:z-index={n} style:display={c.shown ? '' : 'none'} />
{/if}
