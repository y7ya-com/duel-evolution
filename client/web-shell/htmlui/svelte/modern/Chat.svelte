<script module>
  // MMO chat: the world stays visible while idle. Only recent speech and a small Chat handle remain.
  // Interaction reveals history, channels and the composer; native chat actions and heights stay authoritative.
  import { chatParts, sizeSteps, logRows, grouped, senderInk } from './logic.js';
  import { waitFor } from './macro.js';

  const hhmm = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
</script>

<script>
  import { untrack } from 'svelte';
  import Icon from './Icon.svelte';
  import { chatPreview } from './chat-idle.js';
  let { view } = $props();
  const win = $derived(view.win);
  const api = $derived(view.api);
  const p = $derived.by(() => {
    const parts = chatParts(win);
    return { ...parts, tabs: parts.tabs.filter(t => !/proximity/i.test(t.label)) };
  });

  // Only engagement expands the engine chat; idle is collapsed so the original hidden controls stay small.
  // A scene that locks chat (the deck editor) is respected rather than repeatedly clicking its disabled controls.
  let open = $state(false), busy = $state(false), failed = '';
  let hovered = false, focused = false, quietTimer = null, disposed = false;
  const enteredAt = Date.now();
  let now = $state(enteredAt);
  $effect(() => { const clock = setInterval(() => { now = Date.now(); }, 1000); return () => { disposed = true; clearInterval(clock); clearTimeout(quietTimer); }; });
  const want = () => p.online && open ? 1 : 2;   // offline: collapsed, the player's choice kept for the online world
  $effect(() => {
    const from = p.mode, to = want();
    if (!busy && p.world && from !== to && failed !== `${from}>${to}`) drive();   // never pressed during the sign-in
  });
  async function drive() {
    busy = true;
    try {
      for (let i = 0; i < 4 && !disposed; i++) {
        const from = p.mode;
        let k = sizeSteps(from, want())[0];
        // a chat without its tab row (the deck scene's) goes short -> collapsed by ▽ alone, its △ off
        if (k && p[k]?.enabled === false) k = k === 'expand' ? 'shrink' : 'expand';
        if (!k || !p[k] || p[k].enabled === false) break;
        // the pointer onto the icon from elsewhere (the bar): pressed where it already was, the engine ignores it
        const bar = win.controls.find(c => c.cls === 'CWindowTaskIconbar');
        if (bar) { api.hover(bar.id); await new Promise(r => requestAnimationFrame(r)); }
        await api.click(p[k].id);
        if (!(await waitFor(s => (s.windows.find(w => w.id === win.id)?.mode ?? from) !== from, 2000))) break;
      }
    } finally { busy = false; }
    if (disposed) return;
    const to = want();
    if (p.mode !== to) failed = `${p.mode}>${to}`;   // native lag must never reopen idle DOM chrome
  }
  // what shows: the choice while it is being played, else the engine's state
  const shown = $derived(open);
  // the collapsed chat opens only by its △: the deck editor's has it off (the engine keeps it shut there)
  const canOpen = $derived(busy || p.mode !== 2 || p.expand?.enabled !== false);
  function cancelQuiet() { clearTimeout(quietTimer); quietTimer = null; }
  function activate(line = false) {
    if (!p.online || !canOpen) return;
    cancelQuiet(); open = true; failed = ''; wantLine = line;
    if (line && inputEl) { wantLine = false; inputEl.focus(); }
  }
  function collapse() {
    cancelQuiet(); hovered = focused = false; wantLine = false;
    inputEl?.blur(); open = false; failed = '';
  }
  function settle() {
    cancelQuiet();
    if (!hovered && !focused) quietTimer = setTimeout(() => { if (!hovered && !focused) collapse(); }, 1200);
  }
  function enter() { hovered = true; cancelQuiet(); }
  function leave() { hovered = false; settle(); }
  function focusIn() { focused = true; cancelQuiet(); }
  function focusOut(e) { if (!e.currentTarget.contains(e.relatedTarget)) { focused = false; settle(); } }
  function hoverHandle(e) { if (e.pointerType === 'mouse') { enter(); activate(); } }

  // ---- tabs: the one viewed (picked here, else the engine's); the line goes to the engine's
  let pick = $state(null);
  const viewed = $derived(p.tabs.find(t => t.id === pick) || p.tabs.find(t => t.active) || p.tabs[0]);
  const target = $derived(p.tabs.find(t => t.active));
  function choose(t) {
    pick = t.id;
    if (!t.active) api.click(t.id);
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
  const preview = $derived(chatPreview(rows, now, enteredAt));

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
  let inputEl = $state(), value = $state(''), entered = null, wantLine = $state(false), sending = $state(false);
  $effect(() => {
    const v = p.input?.value ?? '';
    if (sending) return;   // native focus/height frames must not overwrite the pending message
    if (document.activeElement !== inputEl || (entered !== null && v !== entered)) { value = v; entered = null; }
  });
  $effect(() => { if (inputEl && shown && wantLine) { wantLine = false; inputEl.focus(); } });
  const commit = () => p.input && api.setText(p.input.id, value);
  async function send() {
    const input = p.input, message = value;
    if (sending || !input || !message.trim()) return;
    sending = true;
    try {
      if (!input.focused && await api.click(input.id) === false) return;
      if (disposed || p.input?.id !== input.id) return;
      api.setText(input.id, message);
      entered = message;
      await api.char(13, input.id);
      atBottom = true;   // your own line: back to the latest
      if (!disposed && open) inputEl?.focus();
    } finally { sending = false; }
  }
  function lineKeys(e) {
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) send(); } else if (e.key === 'Escape') { e.preventDefault(); collapse(); }
  }
  // Enter with nothing focused: open the chat if hidden, then the line. Not while a field the game draws has the keys
  $effect(() => {
    const key = e => {
      if (document.documentElement.classList.contains('de-chat-connected')) return;
      if (e.key !== 'Enter' || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target?.tagName || '') || e.target?.isContentEditable) return;
      const s = globalThis.yo2Html?.snapshot?.(), f = s?.focus;
      const owner = f && s.windows.find(w => w.controls.some(c => c.id === f));
      if (f && !(owner && globalThis.yo2Html?.modernScreens?.has(owner.cls))) return;
      e.preventDefault();
      e.stopPropagation();
      if (!p.online || !canOpen) return;
      activate(true);
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  });
</script>

<div class="mu chat-root" style:left="{-win.x}px" style:top="{-win.y}px">
  {#if p.online}
    {#if shown}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <section class="chat" aria-label="Chat" onpointerenter={enter} onpointerleave={leave} onfocusin={focusIn} onfocusout={focusOut} onkeydown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); collapse(); } }}>
        <div class="chat-heading">
          <Icon name="comment" size={13} />
          <select aria-label="Chat channel" value={viewed?.id || ''} onchange={e => { const t = p.tabs.find(t => String(t.id) === e.currentTarget.value); if (t) choose(t); }}>
            {#each p.tabs as t (t.id)}<option value={t.id} disabled={!t.enabled}>{t.short}{unread[t.id] ? ` (${unread[t.id]})` : ''}</option>{/each}
          </select>
          <button type="button" class="hide" aria-label="Hide chat" title="Hide chat (Esc)" onclick={collapse}>×</button>
        </div>
        <div class="log mu-scroll" role="log" aria-live="polite" aria-label="{viewed?.label || 'Chat'} messages" bind:this={logEl} {onscroll}>
          {#each rows as r (r.key)}
            <p class:notice={r.notice} class:cont={r.cont}>
              {#if r.name}<b class:sr={r.cont} style:--sender={senderInk(r.name)}>{r.name}</b>{/if}<span>{r.text}</span>
              {#if r.t}<time datetime={new Date(r.t).toISOString()}>{hhmm(r.t)}</time>{/if}
            </p>
          {:else}<p class="empty">No messages yet. Say hello.</p>{/each}
        </div>
        {#if !atBottom}<button type="button" class="jump" onclick={latest}>↓ {fresh ? `${fresh} new` : 'Latest'}</button>{/if}
        <div class="composer">
          {#if p.input && p.typing}
            <input bind:this={inputEl} bind:value type="text" maxlength={p.input.maxLen || 128} spellcheck="false" autocomplete="off"
              placeholder={target ? `Message ${target.short}` : 'Message'} aria-label={target ? `Message ${target.label}` : 'Message'}
              oninput={e => { entered = null; if (!e.isComposing) commit(); }} oncompositionend={commit}
              onfocus={() => { if (!sending) { value = p.input.value; api.click(p.input.id); } }} onkeydown={lineKeys} />
            <button type="button" class="send" aria-label="Send" title="Send (Enter)" disabled={sending || !value.trim()} onclick={send}><Icon name="send" size={15} /></button>
          {/if}
        </div>
      </section>
    {:else}
      <div class="idle-log" aria-hidden="true">
        {#each preview as r (r.key)}
          <p class:notice={r.notice} style:opacity={r.opacity}>{#if r.name}<b>{r.name}:</b>{/if}<span>{r.text}</span></p>
        {/each}
      </div>
      {#if canOpen}
        <button type="button" class="chat-handle" aria-expanded="false" aria-label="Open chat{total ? `, ${total} unread` : ''}"
          title="Chat (Enter)" onpointerenter={hoverHandle} onpointerleave={leave} onclick={() => activate(true)}>
          <Icon name="comment" size={14} /><span>Chat</span>{#if total}<span class="unread">{total > 99 ? '99+' : total}</span>{/if}<kbd>Enter</kbd>
        </button>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .chat-root { width:1024px; height:768px; pointer-events:none; }
  .chat { position:absolute; left:12px; bottom:40px; width:414px; height:186px; display:flex; flex-direction:column; gap:5px; padding:7px; pointer-events:auto; border:2px solid #d7faff; outline:1px solid #2875a7; border-radius:2px; background:linear-gradient(#ebffffed,#cbeaf2eb); box-shadow:inset 0 0 0 1px #85aec3,0 2px 4px #17456c55; color:#173b60; }
  .chat-heading { display:flex; align-items:center; gap:7px; height:27px; flex:none; color:#fff; padding:2px 4px; background:linear-gradient(#d2ffff,#63d7f0 20%,#21a3d3 60%,#167db9); border:1px solid #4383a9; }
  .chat-heading select { min-width:0; flex:1; border:1px solid #6b9dbb; background:#edffff; color:#153c65; font:700 12px Arial,sans-serif; }
  .chat-heading option { color:#153c65; background:#edffff; }
  .hide { width:22px; height:22px; color:#b2d1e1; font-size:20px; line-height:20px; text-align:center; border-radius:2px; }
  .hide:hover,.hide:focus-visible { color:#fff; background:#7eafce2e; }
  .log { position:relative; flex:1; min-height:0; overflow-y:auto; padding:1px 4px; user-select:text; scrollbar-color:#6d9cb378 transparent; }
  .log p { position:relative; margin:3px 0 0; padding-right:35px; font-size:13px; line-height:17px; overflow-wrap:anywhere; white-space:pre-wrap; color:#173b60; }
  .log p.cont { margin-top:0; }
  .log b { font-weight:700; margin-right:6px; color:#125a91; }
  .log b.sr { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
  .log .notice { color:#f1d59a; }
  .log .empty { color:#456b84; }
  .log time { position:absolute; right:0; top:0; font-size:10px; color:#9db8ca; opacity:0; }
  .log p:hover { background:#bbddf00c; }
  .log p:hover time { opacity:1; }
  .jump { position:absolute; right:15px; bottom:38px; height:21px; padding:0 7px; border:1px solid #92bdd56b; border-radius:2px; color:#d4eeff; background:#194966; font:700 11px Arial,sans-serif; }
  .composer { display:flex; align-items:center; gap:5px; flex:none; height:27px; }
  .composer input { flex:1; min-width:0; height:27px; padding:0 7px; border:1px solid #6b9dbb; border-radius:1px; background:#f2ffff; color:#173b60; font:13px Arial,sans-serif; }
  .composer input::placeholder { color:#4c708a; }
  .send { width:30px; height:27px; display:grid; place-items:center; border:1px solid #9b7b25; border-radius:2px; color:#594213; background:linear-gradient(#fffbd3,#ffe891 48%,#ecc255 51%,#d8a244); }
  .send:hover { color:#fff; background:#356d8d; }
  .send:disabled { opacity:.4; }
  .idle-log { position:absolute; left:18px; bottom:69px; width:400px; max-height:118px; overflow:hidden; display:flex; flex-direction:column; justify-content:flex-end; pointer-events:none; user-select:none; }
  .idle-log p { margin:0 0 3px; padding:0; color:#f1f7fb; font:13px/17px Arial,sans-serif; overflow-wrap:anywhere; text-shadow:0 1px 2px #000,1px 0 2px #000,-1px 0 2px #000; transition:opacity 1s linear; }
  .idle-log b { color:#b8e2ff; margin-right:5px; font-weight:700; }
  .idle-log .notice { color:#f5dfa8; }
  .chat-handle { position:absolute; left:12px; bottom:40px; height:23px; display:flex; align-items:center; gap:5px; padding:0 6px; pointer-events:auto; color:#fff; font:700 12px Arial,sans-serif; text-shadow:0 1px 2px #00111f,1px 0 2px #00111f; border:1px solid #185995; border-radius:2px; background:linear-gradient(#c6faff,#55c8ef 20%,#219acf 55%,#176caf); box-shadow:inset 0 1px #fff; }
  .chat-handle:hover,.chat-handle:focus-visible { color:#fff; filter:brightness(1.08); border-color:#d4faff; }
  .unread { font-size:10px; color:#f4d889; }
  kbd { margin-left:4px; padding:1px 3px; border:1px solid #b8d2e14d; border-radius:2px; color:#b4c9d8; font:9px Arial,sans-serif; }
  @media(prefers-reduced-motion:reduce) { .idle-log p { transition:none; } }
</style>
