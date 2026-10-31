<script module>
  // The chat, modern (CChatWindow : CWindowModelChatWindow, src/System/window/yo2WindowChat.cpp). Everything it does is
  // the engine's own: its tabs (named by the game: All Chat | Duel Log | Proximity Chat | TRADE | Team), its line (a real
  // <input> committing through setText, Enter the game's WM_CHAR 13) and its heights (△ / ▽).
  // - Size: open or hidden, one toggle, remembered. Open is the engine's short chat (6 rows), hidden its collapsed bar.
  //   The engine's △ / ▽ cycle short -> tall -> collapsed -> short (▽ from tall skips short), which no one could
  //   predict; the toggle plays the presses that reach the chosen state (logic.js sizeSteps). The tall chat (most of the
  //   screen) is not offered: it covers the game, and the open log scrolls back through everything anyway.
  // - Tabs: a segmented control with unread counts. The Duel Log (ovr/duellog.c, on the duel screen) is only read: it is
  //   shown here without pressing the engine's tab, so the line still goes to the channel chosen before, and it is the
  //   view by default when it appears.
  // - The log: keyed rows (logic.js logRows: a new line adds one row, a dropped one removes one; nothing re-renders or
  //   jumps), a sender's lines grouped under one name in its own ink, the time a line arrived on hover, stuck to the
  //   bottom while the player is there, else a pill that jumps to the latest.
  // - Keys: Enter anywhere (no field focused) opens the chat and goes to the line; Enter sends; Esc leaves the line.
  import { chatParts, sizeSteps, logRows, grouped, senderInk } from './logic.js';
  import { waitFor } from './macro.js';

  const KEY = 'yo2.chatOpen';
  const load = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
  const save = v => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch {} };
  const hhmm = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  // the engine's short height ((6 rows + 2) x 16) and the bar: the engine's collapsed chat is 32 high and 8 lower, over
  // the dock's edge; the bar is its top 24, flush on the dock
  const OPEN_H = 128, BAR_H = 24;
</script>

<script>
  import { untrack } from 'svelte';
  import Icon from './Icon.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const api = $derived(view.api);
  const p = $derived(chatParts(win));

  // ---- size: the player's choice, played into the engine one press at a time from wherever it is (a choice changed
  // meanwhile is followed); a state it can't reach (a locked chat) is tried once. A chat its scene makes collapsed (the
  // deck editor's) stays so until the player opens it: the choice never covers what they're doing
  let open = $state(untrack(() => p.mode) === 2 ? false : load()), busy = $state(false), failed = '';
  $effect(() => {
    const from = p.mode, to = open ? 1 : 2;
    if (!busy && from !== to && failed !== `${from}>${to}`) drive();
  });
  async function drive() {
    busy = true;
    try {
      for (let i = 0; i < 4; i++) {
        const from = p.mode;
        let k = sizeSteps(from, open ? 1 : 2)[0];
        // a chat without its tab row (the deck scene's) goes short -> collapsed by ▽ alone, its △ off
        if (k && p[k]?.enabled === false) k = k === 'expand' ? 'shrink' : 'expand';
        if (!k || !p[k] || p[k].enabled === false) break;
        // the pointer onto the icon from elsewhere (the bar): pressed where it already was, the engine ignores it
        const bar = win.controls.find(c => c.cls === 'CWindowTaskIconbar');
        if (bar) { api.hover(bar.id); await new Promise(r => setTimeout(r, 200)); }
        await api.click(p[k].id);
        if (!(await waitFor(s => (s.windows.find(w => w.id === win.id)?.mode ?? from) !== from, 2000))) break;
      }
    } finally { busy = false; }
    const to = open ? 1 : 2;
    if (p.mode !== to) { failed = `${p.mode}>${to}`; open = p.mode !== 2; }
  }
  // both states stand on the short chat's foot, wherever the engine's rect is meanwhile (collapsed: 8 px lower)
  const foot = $derived(p.mode === 2 ? 8 : 0);
  // what shows: the choice while it is being played, else the engine's state
  const shown = $derived(busy ? open : p.mode !== 2);
  function toggle(line = false) {
    open = !shown;
    failed = '';
    save(open);
    wantLine = open && line;
  }

  // ---- tabs: the one viewed (picked here, else the engine's), the one the line goes to (the engine's, never the Duel Log)
  let pick = $state(null), hadLog = false;
  const viewed = $derived(p.tabs.find(t => t.id === pick) || p.tabs.find(t => t.active) || p.tabs[0]);
  const target = $derived(p.tabs.find(t => t.active && !t.readOnly));
  $effect(() => {   // the Duel Log, when it appears, is the view
    const dl = p.tabs.find(t => t.readOnly);
    if (dl && !hadLog) pick = dl.id;
    hadLog = !!dl;
  });
  function choose(t) {
    pick = t.id;
    if (!t.readOnly && !t.active) api.click(t.id);
  }
  function tabKeys(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = p.tabs.indexOf(viewed), t = p.tabs[(i + (e.key === 'ArrowRight' ? 1 : p.tabs.length - 1)) % p.tabs.length];
    if (t) { choose(t); e.currentTarget.querySelector(`[data-id="${t.id}"]`)?.focus(); }
  }

  // ---- the logs: each tab's rows (kept between reads), unread lines per tab, new lines below the fold
  const memo = new Map();   // log id -> its last logRows
  const logs = $derived.by(() => {
    const out = new Map();
    for (const t of p.tabs) if (t.log) { const r = logRows(memo.get(t.log.id), t.log.items); memo.set(t.log.id, r); out.set(t.id, r); }
    return out;
  });
  const rows = $derived(grouped(logs.get(viewed?.id)?.rows || []));
  let unread = $state.raw({}), fresh = $state(0), atBottom = $state(true);
  // each read counted once: lines that land in a tab not in view (or while the chat is hidden) are unread
  $effect(() => {
    const ls = logs;
    untrack(() => {
      let u = unread;
      for (const [id, r] of ls) {
        if (!r.added) continue;
        if (id === viewed?.id && shown) { if (!atBottom) fresh += r.added; } else u = { ...u, [id]: (u[id] || 0) + r.added };
      }
      if (u !== unread) unread = u;
    });
  });
  // the tab in view, with the chat open, has nothing unread
  $effect(() => {
    const id = viewed?.id;
    if (shown && id && untrack(() => unread[id])) unread = { ...untrack(() => unread), [id]: 0 };
  });
  const total = $derived(Object.values(unread).reduce((a, b) => a + b, 0));
  const last = $derived(rows[rows.length - 1]);

  // the scroller: at the bottom it follows new lines; a new tab (or the chat reopened) starts at the bottom
  let logEl = $state(), lastView = null;
  $effect(() => {
    rows;
    if (!logEl) return;
    if (viewed?.id !== lastView) { lastView = viewed?.id; atBottom = true; fresh = 0; }
    if (untrack(() => atBottom)) logEl.scrollTop = logEl.scrollHeight;
  });
  function onscroll() {
    atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 6;
    if (atBottom) fresh = 0;
  }
  const latest = () => { logEl.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' }); fresh = 0; };

  // ---- the line: the game's text until the player edits it here; every edit goes to the game (setText)
  let inputEl = $state(), value = $state(''), entered = null, wantLine = false;
  $effect(() => {
    const v = p.input?.value ?? '';
    if (document.activeElement !== inputEl || (entered !== null && v !== entered)) { value = v; entered = null; }
  });
  $effect(() => { if (inputEl && shown && wantLine) { wantLine = false; inputEl.focus(); } });
  const commit = () => p.input && api.setText(p.input.id, value);
  async function send() {
    if (!p.input || !value.trim()) return;
    if (document.activeElement !== inputEl) inputEl.focus();
    if (!p.input.focused) await api.click(p.input.id);   // Enter goes to the game's focused control
    commit();
    entered = value;
    api.char(13);
    atBottom = true;   // your own line: back to the latest
  }
  function lineKeys(e) {
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); send(); } else if (e.key === 'Escape') { e.preventDefault(); inputEl.blur(); }
  }
  // Enter with nothing focused: open the chat if hidden, then the line. Not while a field the game draws has the keys
  $effect(() => {
    const key = e => {
      if (e.key !== 'Enter' || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target?.tagName || '') || e.target?.isContentEditable) return;
      const s = globalThis.yo2Html?.snapshot?.(), f = s?.focus;
      const owner = f && s.windows.find(w => w.controls.some(c => c.id === f));
      if (f && !(owner && globalThis.yo2Html?.modernScreens?.has(owner.cls))) return;
      e.preventDefault();
      e.stopPropagation();
      if (!shown) toggle(true); else inputEl?.focus();
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  });
</script>

<div class="mu">
  {#if shown}
    <section class="mu-plate chat" style:width="{win.w}px" style:height="{OPEN_H}px" style:bottom="{foot}px" aria-label="Chat">
      <div class="log mu-scroll" class:plain={viewed?.readOnly} role="log" aria-live="polite" aria-label="{viewed?.label || 'Chat'} messages"
        bind:this={logEl} {onscroll}>
        {#each rows as r (r.key)}
          <p class:notice={r.notice} class:cont={r.cont}>
            {#if r.name}<b class:sr={r.cont} style:color={senderInk(r.name)}>{r.name}</b>{/if}<span>{r.text}</span>
            {#if r.t}<time datetime={new Date(r.t).toISOString()}>{hhmm(r.t)}</time>{/if}
          </p>
        {:else}
          <p class="empty">{viewed?.readOnly ? 'Each move of the duel shows here.' : 'No messages yet. Press Enter to say hello.'}</p>
        {/each}
      </div>
      {#if !atBottom}
        <button type="button" class="jump" onclick={latest}>
          <svg class="mu-ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" /></svg>{fresh ? `${fresh} new` : 'Latest'}
        </button>
      {/if}
      <!-- the foot: the channels beside the line they send to, the line, Send; Hide where the hidden bar's Show is -->
      <div class="foot composer">
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div class="mu-tabs seg" role="tablist" aria-label="Chat channels" onkeydown={tabKeys}>
          {#each p.tabs as t (t.id)}
            {@const n = unread[t.id] || 0}
            <button type="button" role="tab" class="mu-tab" data-id={t.id} aria-selected={t === viewed} tabindex={t === viewed ? 0 : -1}
              disabled={!t.enabled} title={t.readOnly ? `${t.label} (read only)` : t.label} onclick={() => choose(t)}>
              {#if t.readOnly}<Icon name="log" size={13} />{/if}{t.short}{#if n && t !== viewed}<span class="count" aria-label="{n} unread">{n > 99 ? '99+' : n}</span>{/if}
            </button>
          {/each}
        </div>
        {#if p.input && p.typing}
          <input class="mu-field" bind:this={inputEl} bind:value type="text" maxlength={p.input.maxLen || 128} spellcheck="false" autocomplete="off"
            placeholder={target ? `Message ${target.short}` : 'Message'} aria-label={target ? `Message ${target.label}` : 'Message'}
            oninput={e => { entered = null; if (!e.isComposing) commit(); }} oncompositionend={commit}
            onfocus={() => { value = p.input.value; api.click(p.input.id); }} onkeydown={lineKeys} />
          <button type="button" class="mu-btn gold send" aria-label="Send" title="Send (Enter)" disabled={!value.trim()} onclick={send}><Icon name="send" size={15} /></button>
        {/if}
        <button type="button" class="mu-icon-btn hide" aria-expanded="true" aria-label="Hide chat" title="Hide chat" onclick={() => toggle()}>
          <svg class="mu-ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" /></svg>
        </button>
      </div>
    </section>
  {:else}
    <button type="button" class="bar" style:width="{win.w}px" style:height="{BAR_H}px" style:bottom="{foot}px" aria-expanded="false" aria-label="Show chat{total ? `, ${total} unread` : ''}"
      title="Show chat (Enter)" onclick={() => toggle()}>
      <Icon name="comment" size={16} />
      <span class="what">{viewed?.short || 'Chat'}</span>
      <span class="peek">{#if last}{#if last.name}<b>{last.name}</b>{/if}{last.text}{/if}</span>
      {#if total}<span class="count" aria-hidden="true">{total > 99 ? '99+' : total}</span>{/if}
      <svg class="mu-ico up" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 12l5-5 5 5" /></svg>
    </button>
  {/if}
</div>

<style>
  /* open: a game panel at the window's foot (bottom-anchored, so a size change never slides it) */
  .chat { left: 0; bottom: 0; display: flex; flex-direction: column; gap: 4px; padding: 9px 10px 9px; animation: none; }
  .foot { display: flex; align-items: center; gap: 6px; flex: none; height: 26px; }
  /* the channels: a segmented control on the rail, sized to their names */
  .seg { flex: 0 1 auto; min-width: 0; height: 26px; gap: 2px; padding: 2px; border-radius: 6px; overflow: hidden; }
  .seg .mu-tab { flex: none; display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 10px; border-radius: 4px; font-size: 11.5px; }
  .seg .mu-tab :global(.mu-ico) { stroke-width: 2; margin-left: -2px; }
  .count { min-width: 15px; height: 15px; padding: 0 4px; border-radius: 8px; font-size: 10px; font-weight: 800; line-height: 15px; text-align: center;
    letter-spacing: 0; color: #fff; text-shadow: none; background: var(--bad); box-shadow: 0 1px 1px rgba(90, 0, 10, .35); font-variant-numeric: tabular-nums; }
  .hide { flex: none; width: 26px; height: 26px; min-height: 0; margin-left: 2px; }
  /* the log: a well; a sender's run grouped, a little air between runs */
  .log { position: relative; flex: 1; min-height: 0; padding: 3px 8px; border-radius: 6px; user-select: text;
    background: var(--well); box-shadow: inset 0 2px 3px rgba(10, 35, 80, .18), inset 0 0 0 1px #8ea2bf, 0 1px 0 rgba(255, 255, 255, .8); }
  .log p { position: relative; margin: 2px 0 0; padding: 0 44px 0 0; font-size: 12.5px; line-height: 15px; overflow-wrap: anywhere; white-space: pre-wrap; color: var(--ink); }
  .log p.cont { margin-top: 0; }
  .log b { font-weight: 750; margin-right: 6px; }
  .log b.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .log .notice { color: var(--warm); font-style: italic; }
  .log.plain b { color: inherit !important; font-weight: inherit; margin: 0; }
  .log.plain b::after { content: ':'; margin-right: 4px; }
  .log.plain b.sr { position: static; width: auto; height: auto; clip-path: none; }
  .log .empty { color: var(--ink-3); }
  .log time { position: absolute; right: 0; top: 0; font-size: 10.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; opacity: 0;
    transition: opacity .12s; }
  .log p:hover { background: linear-gradient(90deg, rgba(59, 130, 224, .07), rgba(59, 130, 224, .02)); }
  .log p:hover time { opacity: 1; }
  .jump { position: absolute; left: 50%; bottom: 45px; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 3px; height: 20px;
    padding: 0 10px 0 6px; border-radius: 10px; font-size: 11.5px; font-weight: 700; color: #fff; background: var(--sel);
    box-shadow: inset 0 1px 0 var(--gold-300), 0 0 0 1px var(--p900), 0 3px 8px -2px rgba(10, 35, 80, .45); animation: mu-rise .18s var(--ease) both; }
  .jump .mu-ico { width: 14px; height: 14px; }
  input { flex: 1; min-width: 140px; height: 26px; font-size: 12.5px; }
  .send { flex: none; width: 36px; height: 26px; padding: 0; }

  /* hidden: a HUD strip (the dock's material) with the channel, the latest line and the unread count */
  .bar { position: absolute; left: 0; display: flex; align-items: center; gap: 8px; padding: 0 10px 0 12px; color: #fff; cursor: pointer;
    border-radius: 6px 6px 0 0; font-size: 12.5px; text-shadow: 0 1px 0 rgba(0, 20, 60, .5);
    background: linear-gradient(180deg, rgba(255, 255, 255, .18), rgba(255, 255, 255, 0) 40%), linear-gradient(180deg, #2a66c2 0%, #1b4d9e 60%, #163f85 100%);
    box-shadow: inset 0 2px 0 var(--gold-400), inset 0 3px 0 rgba(255, 255, 255, .25), 0 -4px 12px -6px rgba(4, 18, 50, .5); transition: filter .14s; }
  .bar:hover { filter: brightness(1.08); }
  .bar :global(.mu-ico) { color: var(--gold-300); }
  .bar .what { flex: none; font-family: var(--display); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--gold-200); }
  .bar .peek { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: rgba(255, 255, 255, .85); }
  .bar .peek b { margin-right: 6px; color: #fff; font-weight: 750; }
  .bar .count { flex: none; }
  .bar .up { width: 16px; height: 16px; }
</style>
