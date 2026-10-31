<script module>
  // The chat, modern (CChatWindow : CWindowModelChatWindow, src/System/window/yo2WindowChat.cpp). Its tabs come from the
  // game (All Chat | Duel Log | Proximity Chat | TRADE | Team: ovr/duellog.c adds Duel Log on the duel screen), so
  // nothing here knows tab names. The log is the shown Textlist's items in a native scroller that stays at the bottom
  // while the player is there; the line is a real <input> that commits through the control's setText, Enter being the
  // game's own WM_CHAR 13 (it sends). Taller / Shorter are its IconExpand / IconHide. The panel fills the window's
  // rect, which is the engine's (taller moves it up).
  import { chatLine, chatParts, chatLogs, newLines } from './logic.js';
</script>

<script>
  import Icon from './Icon.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const p = $derived(chatParts(win));
  const lines = $derived((p.log?.items || []).map(chatLine));
  const api = $derived(view.api);

  // the log: at the bottom while the player is there (checked before the new lines land); scrolled up, new lines show
  // a pill that jumps to them
  let logEl = $state(), atBottom = true, fresh = $state(0);
  $effect.pre(() => { lines; if (logEl) atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 4; });
  $effect(() => { lines; if (logEl && atBottom) logEl.scrollTop = logEl.scrollHeight; });
  const latest = () => { logEl.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' }); fresh = 0; };
  const onscroll = () => { if (logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 4) fresh = 0; };

  // unread lines per tab (its log is the tab's by order): counted while the tab is not the one shown
  const seen = new Map();   // log id -> its items last snapshot
  let unread = $state({}), primed = false;   // the first snapshot's lines are history, not news
  $effect(() => {
    const logs = chatLogs(win), next = { ...unread };
    logs.forEach((l, i) => {
      const t = p.tabs[i], n = newLines(seen.get(l.id), l.items || []);
      seen.set(l.id, l.items || []);
      if (!t) return;
      if (t.active) next[t.id] = 0;
      else if (n && primed) next[t.id] = (next[t.id] || 0) + n;
      if (t.active && l === p.log && n && primed && !atBottom) fresh += n;
    });
    primed = true;
    if (JSON.stringify(next) !== JSON.stringify(unread)) unread = next;
  });

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
          <button type="button" role="tab" class="tab" aria-selected={!!t.active} disabled={!t.enabled} onclick={() => api.click(t.id)}>{label(t)}{#if unread[t.id]}<span class="badge" aria-label="{unread[t.id]} new">{unread[t.id] > 99 ? '99+' : unread[t.id]}</span>{/if}</button>
        {/each}
      </div>
      <div class="size">
        {#if p.taller}<button type="button" class="mu-icon-btn" aria-label="Taller" title="Taller" disabled={!p.taller.enabled} onclick={() => api.click(p.taller.id)}><svg class="mu-ico" viewBox="0 0 20 20"><path d="M5 12.5 10 7.5l5 5" /></svg></button>{/if}
        {#if p.shorter}<button type="button" class="mu-icon-btn" aria-label="Shorter" title="Shorter" disabled={!p.shorter.enabled} onclick={() => api.click(p.shorter.id)}><svg class="mu-ico" viewBox="0 0 20 20"><path d="M5 7.5 10 12.5l5-5" /></svg></button>{/if}
      </div>
    </header>
    <div class="log mu-scroll" role="log" aria-live="polite" bind:this={logEl} {onscroll}>
      {#each lines as l, i (i)}
        <p class:notice={l.notice}>{#if l.name}<b>{l.name}</b>{/if}<span>{l.text}</span></p>
      {:else}
        <p class="empty">No messages yet. Say hello.</p>
      {/each}
    </div>
    {#if fresh}<button type="button" class="jump" onclick={latest}>{fresh} new {fresh === 1 ? 'message' : 'messages'} <svg class="mu-ico" viewBox="0 0 20 20"><path d="M5 8l5 5 5-5" /></svg></button>{/if}
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
  .tab[aria-selected='true'] { color: var(--ink-strong); background: #fff; box-shadow: 0 0 0 1px var(--btn-edge); }
  .tab[aria-selected='true']::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: 0; height: 2px; border-radius: 2px;
    background: linear-gradient(90deg, var(--gold-300), var(--gold-400)); box-shadow: 0 0 6px rgba(247, 228, 108, .6); }
  .badge { display: inline-block; min-width: 16px; height: 16px; margin-left: 6px; padding: 0 4px; border-radius: 8px; font-size: 10px; font-weight: 800;
    line-height: 16px; text-align: center; color: #fff; background: var(--bad); box-shadow: 0 1px 2px rgba(120, 0, 10, .3); vertical-align: 1px; }
  .jump { position: absolute; left: 50%; bottom: 44px; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 4px; height: 24px;
    padding: 0 8px 0 12px; border-radius: 12px; font-size: 12px; font-weight: 700; color: #fff; background: var(--sel);
    box-shadow: 0 0 0 1px var(--p900), 0 4px 10px -2px rgba(10, 35, 80, .45); animation: mu-rise .2s var(--ease) both; }
  .jump .mu-ico { width: 14px; height: 14px; }
  .size { display: flex; gap: 2px; align-self: center; }
  .size .mu-icon-btn { width: 28px; height: 24px; }
  .size .mu-icon-btn:disabled { opacity: .35; }
  .log { flex: 1; min-height: 0; margin: 0 6px; padding: 6px 8px 4px; border-radius: 8px; user-select: text;
    background: var(--well); box-shadow: var(--well-shadow); }
  .log p { margin: 0; padding: 1.5px 0; font-size: 12.5px; line-height: 1.4; overflow-wrap: anywhere; white-space: pre-wrap; color: var(--ink); }
  .log b { font-weight: 750; color: var(--link); margin-right: 6px; }
  .log .notice { color: var(--warm); font-style: italic; }
  .log .empty { color: var(--ink-3); }
  .composer { display: flex; gap: 6px; padding: 5px 6px 6px; flex: none; }
  input { flex: 1; min-width: 0; height: 26px; padding: 0 12px; border: 0; border-radius: 13px; font: inherit; font-size: 12.5px; color: var(--navy-900);
    background: #fff; box-shadow: inset 0 1px 2px rgba(11, 42, 92, .12), 0 0 0 1px var(--btn-edge);
    user-select: text; }
  input::placeholder { color: #5b6f8c; }
  input:focus { outline: none; box-shadow: inset 0 1px 2px rgba(11, 42, 92, .2), 0 0 0 1px var(--p500), 0 0 0 3px var(--p200); }
  .send { width: 34px; height: 26px; padding: 0; border-radius: 13px; }
</style>
