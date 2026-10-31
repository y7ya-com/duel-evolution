<script module>
  // The chat, modern (CChatWindow : CWindowModelChatWindow, src/System/window/yo2WindowChat.cpp). Its tabs come from the
  // game (All Chat | Duel Log | Proximity Chat | TRADE | Team: ovr/duellog.c adds Duel Log on the duel screen), so
  // nothing here knows tab names. The log is the shown Textlist's items in a native scroller that stays at the bottom
  // while the player is there; the line is a real <input> that commits through the control's setText, Enter being the
  // game's own WM_CHAR 13 (it sends). Taller / Shorter are its IconExpand / IconHide. The panel fills the window's
  // rect, which is the engine's (taller moves it up).
  import { chatLine, chatParts } from './logic.js';
</script>

<script>
  import Icon from './Icon.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const p = $derived(chatParts(win));
  const lines = $derived((p.log?.items || []).map(chatLine));
  const api = $derived(view.api);

  // the log: at the bottom while the player is there (checked before the new lines land)
  let logEl = $state(), atBottom = true;
  $effect.pre(() => { lines; if (logEl) atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 4; });
  $effect(() => { lines; if (logEl && atBottom) logEl.scrollTop = logEl.scrollHeight; });

  // the line: the game's text until the player edits it here; every edit goes to the game (setText)
  let inputEl = $state(), value = $state(''), entered = null;
  $effect(() => {
    const v = p.input?.value ?? '';
    if (document.activeElement !== inputEl || (entered !== null && v !== entered)) { value = v; entered = null; }
  });
  const commit = () => p.input && api.setText(p.input.id, value);
  async function send() {
    if (!p.input || !value.trim()) return;
    if (document.activeElement !== inputEl) inputEl.focus();
    if (!p.input.focused) await api.click(p.input.id);   // Enter goes to the game's focused control
    commit();
    entered = value;
    api.char(13);
  }
  function keys(e) {
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); send(); } else if (e.key === 'Escape') inputEl.blur();
  }
  const label = t => t.label.trim();
</script>

<div class="mu">
  <section class="mu-plate chat" style:width="{win.w}px" style:height="{win.h}px" aria-label="Chat">
    <header>
      <div class="tabs" role="tablist" aria-label="Chat channels">
        {#each p.tabs as t (t.id)}
          <button type="button" role="tab" class="tab" aria-selected={!!t.active} disabled={!t.enabled} onclick={() => api.click(t.id)}>{label(t)}</button>
        {/each}
      </div>
      <div class="size">
        {#if p.taller}<button type="button" class="mu-icon-btn" aria-label="Taller" title="Taller" disabled={!p.taller.enabled} onclick={() => api.click(p.taller.id)}><svg class="mu-ico" viewBox="0 0 20 20"><path d="M5 12.5 10 7.5l5 5" /></svg></button>{/if}
        {#if p.shorter}<button type="button" class="mu-icon-btn" aria-label="Shorter" title="Shorter" disabled={!p.shorter.enabled} onclick={() => api.click(p.shorter.id)}><svg class="mu-ico" viewBox="0 0 20 20"><path d="M5 7.5 10 12.5l5-5" /></svg></button>{/if}
      </div>
    </header>
    <div class="log mu-scroll" role="log" aria-live="polite" bind:this={logEl}>
      {#each lines as l, i (i)}
        <p class:notice={l.notice}>{#if l.name}<b>{l.name}</b>{/if}<span>{l.text}</span></p>
      {:else}
        <p class="empty">No messages yet. Say hello.</p>
      {/each}
    </div>
    {#if p.input}
      <div class="composer">
        <input bind:this={inputEl} bind:value type="text" maxlength={p.input.maxLen || 128} spellcheck="false" autocomplete="off"
          placeholder="Message" aria-label="Message" oninput={e => { entered = null; if (!e.isComposing) commit(); }}
          oncompositionend={commit} onfocus={() => { value = p.input.value; api.click(p.input.id); }} onkeydown={keys} />
        <button type="button" class="mu-btn gold send" aria-label="Send" disabled={!value.trim()} onclick={send}><Icon name="send" size={15} /></button>
      </div>
    {/if}
  </section>
</div>

<style>
  .chat { left: 0; top: 0; display: flex; flex-direction: column; border-radius: 16px 16px 6px 16px; animation: none; }
  header { display: flex; align-items: flex-end; gap: 8px; height: 30px; padding: 4px 6px 0 10px; flex: none; }
  .tabs { display: flex; gap: 2px; flex: 1; min-width: 0; overflow: hidden; }
  .tab { position: relative; height: 24px; padding: 0 12px; border-radius: 8px 8px 0 0; font-size: 12px; font-weight: 600; white-space: nowrap;
    color: var(--ink-2); transition: color .14s, background .14s; }
  .tab:hover { color: var(--ink-strong); background: rgba(255, 255, 255, .5); }
  .tab[aria-selected='true'] { color: var(--ink-strong); background: linear-gradient(180deg, #ffffff, #e2f7ff); box-shadow: inset 0 1px 0 #fff, 0 0 0 1px #3a9de6; }
  .tab[aria-selected='true']::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: 0; height: 2px; border-radius: 2px;
    background: linear-gradient(90deg, var(--gold-300), var(--gold-400)); box-shadow: 0 0 6px rgba(247, 228, 108, .6); }
  .size { display: flex; gap: 2px; align-self: center; }
  .size .mu-icon-btn { width: 28px; height: 24px; }
  .size .mu-icon-btn:disabled { opacity: .35; }
  .log { flex: 1; min-height: 0; margin: 0 6px; padding: 6px 8px 4px; border-radius: 8px; user-select: text;
    background: var(--well); box-shadow: var(--well-shadow); }
  .log p { margin: 0; padding: 1.5px 0; font-size: 12.5px; line-height: 1.4; overflow-wrap: anywhere; white-space: pre-wrap; color: var(--ink); }
  .log b { font-weight: 750; color: #0050c8; margin-right: 6px; }
  .log .notice { color: #b34d00; font-style: italic; }
  .log .empty { color: var(--ink-3); }
  .composer { display: flex; gap: 6px; padding: 5px 6px 6px; flex: none; }
  input { flex: 1; min-width: 0; height: 26px; padding: 0 12px; border: 0; border-radius: 13px; font: inherit; font-size: 12.5px; color: var(--navy-900);
    background: #fff; box-shadow: inset 0 1px 2px rgba(11, 42, 92, .2), 0 0 0 1px #3a9de6;
    user-select: text; }
  input::placeholder { color: #5b6f8c; }
  input:focus { outline: none; box-shadow: inset 0 1px 2px rgba(11, 42, 92, .2), 0 0 0 1px #0985ff, 0 0 0 3px rgba(0, 150, 255, .35); }
  .send { width: 34px; height: 26px; padding: 0; border-radius: 13px; }
</style>
