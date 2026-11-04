// Server-wide MMO chat shared by Legacy and Modern UI. HTTP keeps My Room functional even on an older wasm
// whose native CHATNOTICE handler discarded room messages. Wire chat remains available as a fallback.
import { CHAT_CHANNELS, bubbleMessages, visibleMessages } from './chat-policy.js';
let instance;
export function updateLiveChat(snapshot, modern = false) {
  if (typeof document === 'undefined') return;
  instance ||= makeLiveChat();
  instance.update(snapshot, modern);
}

export function makeLiveChat({ fetcher = (...args) => fetch(...args), clock = Date.now, document: doc = document } = {}) {
  const host = doc.createElement('div'); host.id = 'de-live-chat'; host.hidden = true;
  const style = doc.createElement('style');
  style.textContent = `
  html.de-chat-connected #htmlui .win[data-window-class="CChatWindow"] { visibility:hidden!important;pointer-events:none!important }
  #de-live-chat {position:fixed;left:12px;bottom:40px;width:414px;z-index:8000;color:#173b60;font:13px/1.4 Arial,sans-serif;pointer-events:none;transform-origin:bottom left}
  #de-live-chat[hidden]{display:none} #de-live-chat *{box-sizing:border-box}
  #de-live-chat button,#de-live-chat input,#de-live-chat select{font:inherit;color:inherit}
  #de-live-chat button{cursor:pointer} #de-live-chat :focus-visible{outline:2px solid #ffe882;outline-offset:1px}
  #de-live-chat .chat-handle{pointer-events:auto;display:flex;align-items:center;gap:20px;width:170px;max-width:100%;min-width:0;height:27px;border:1px solid #185995;border-radius:2px;background:linear-gradient(#c6faff,#55c8ef 20%,#219acf 55%,#176caf);box-shadow:inset 0 1px #fff,inset 0 -1px #84d8f2;color:#fff;padding:2px 9px;text-shadow:0 1px #14548c;font-weight:bold;text-align:left}
  #de-live-chat .chat-handle::after{content:'Enter  ▴';margin-left:auto;font-size:10px;color:#efffff}
  #de-live-chat .chat-panel{display:none;pointer-events:auto;border:2px solid #d7faff;outline:1px solid #2875a7;border-radius:2px;background:linear-gradient(#ebffffed,#cbeaf2eb);box-shadow:inset 0 0 0 1px #85aec3,0 2px 4px #17456c55;overflow:hidden}
  #de-live-chat.open .chat-panel{display:block} #de-live-chat.open .chat-handle{display:none}
  #de-live-chat header{display:flex;align-items:center;gap:8px;height:30px;padding:3px 6px;background:linear-gradient(#d2ffff,#63d7f0 20%,#21a3d3 60%,#167db9);border-bottom:1px solid #1a6297;color:#fff;text-shadow:0 1px #1e5e8e}
  #de-live-chat .chat-title{font-size:14px}
  #de-live-chat select{background:#edffff;border:1px solid #3a88b4;border-radius:1px;color:#153c65;padding:2px 4px;flex:1;min-width:0;font-size:12px;text-shadow:none}
  #de-live-chat .hide-chat{width:23px;height:22px;border:1px solid #215d97;border-radius:2px;background:linear-gradient(#d2fcff,#6bc9eb);box-shadow:inset 0 1px #fff;color:#174b78;font-size:18px;line-height:18px;padding:0}
  #de-live-chat .chat-log{height:162px;overflow:auto;padding:5px 8px;user-select:text;overflow-wrap:anywhere;scrollbar-color:#5ca6c9 #daf4f8}
  #de-live-chat .chat-row{margin:3px 0;white-space:pre-wrap} #de-live-chat .chat-row strong{color:#125a91}
  #de-live-chat .chat-row[data-channel=whisper]{color:#79418b} #de-live-chat .chat-row[data-channel=team]{color:#28733e}
  #de-live-chat .chat-composer{display:flex;gap:4px;padding:4px;border-top:1px solid #8dbbd1;background:#b8dfed} #de-live-chat input{min-width:0;flex:1;background:#f2ffff;border:1px solid #6b9dbb;border-radius:1px;padding:5px 6px;outline:none;color:#173b60}
  #de-live-chat .send-chat{min-width:54px;border:1px solid #9b7b25;border-radius:2px;box-shadow:inset 0 1px #fffde2;background:linear-gradient(#fffbd3,#ffe891 48%,#ecc255 51%,#d8a244);color:#594213;padding:3px 8px;font-weight:bold} #de-live-chat .chat-target{display:none;width:100%;border-bottom:1px solid #5389a3}
  #de-live-chat .chat-target.visible{display:block} #de-live-chat .chat-error{color:#8b3c25;padding:0 8px;font-size:12px}
  #de-live-chat .chat-preview{max-height:96px;overflow:hidden;padding:4px 3px;text-shadow:0 1px 2px #000,1px 0 2px #000,-1px 0 2px #000;pointer-events:none;color:#f5fcff}
  #de-live-chat .chat-preview strong{color:#c5efff} #de-live-chat .chat-preview .chat-row[data-channel=whisper]{color:#edcaff} #de-live-chat .chat-preview .chat-row[data-channel=team]{color:#d5f4c5}
  #de-live-chat.open .chat-preview{display:none} #de-live-chat .chat-preview .chat-row{margin:2px 0}
  #de-chat-bubbles{position:fixed;inset:0;pointer-events:none;z-index:90;overflow:hidden}
  #de-chat-bubbles .speech{position:absolute;max-width:240px;transform:translate(-50%,-100%);padding:7px 10px;border:1px solid #1b5d7a;border-radius:10px;background:#f4fcfff0;color:#173342;box-shadow:0 2px 5px #0004;font:13px/1.3 Arial,sans-serif;overflow-wrap:anywhere;white-space:pre-wrap}
  #de-chat-bubbles .speech::after{content:'';position:absolute;left:50%;bottom:-7px;margin-left:-6px;border:6px solid transparent;border-top-color:#f4fcff;border-bottom:0}
  `;
  doc.head.append(style);
  const panel = doc.createElement('section'); panel.className = 'chat-panel'; panel.setAttribute('aria-label', 'Chat');
  const header = doc.createElement('header'), title = doc.createElement('strong'), select = doc.createElement('select'); select.setAttribute('aria-label', 'Chat channel');
  title.className = 'chat-title'; title.textContent = 'Chat'; header.append(title);
  for (const c of CHAT_CHANNELS) { const option = doc.createElement('option'); option.value = c.id; option.textContent = c.label; select.append(option); }
  const hide = doc.createElement('button'); hide.className = 'hide-chat'; hide.textContent = '×'; hide.setAttribute('aria-label', 'Hide chat'); header.append(select, hide);
  const target = doc.createElement('input'); target.className = 'chat-target'; target.placeholder = 'Whisper to player'; target.setAttribute('aria-label', 'Whisper recipient'); target.setAttribute('list', 'de-chat-players');
  const playersList = doc.createElement('datalist'); playersList.id = 'de-chat-players';
  const log = doc.createElement('div'); log.className = 'chat-log'; log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite');
  const error = doc.createElement('div'); error.className = 'chat-error'; error.setAttribute('role', 'status');
  const form = doc.createElement('form'); form.className = 'chat-composer';
  const input = doc.createElement('input'); input.placeholder = 'Message Global'; input.maxLength = 128; input.autocomplete = 'off'; input.setAttribute('aria-label', 'Chat message');
  const send = doc.createElement('button'); send.type = 'submit'; send.className = 'send-chat'; send.textContent = 'Send'; form.append(input, send);
  panel.append(header, target, playersList, log, error, form);
  const handle = doc.createElement('button'); handle.className = 'chat-handle'; handle.textContent = 'Chat'; handle.setAttribute('aria-label', 'Open chat'); handle.setAttribute('aria-expanded', 'false');
  const preview = doc.createElement('div'); preview.className = 'chat-preview'; host.append(preview, handle, panel); doc.body.append(host);
  const bubbleHost = doc.createElement('div'); bubbleHost.id = 'de-chat-bubbles'; doc.body.append(bubbleHost);
  let snapshot, modern = false, active = false, connected = false, channel = 'global', messages = [], cursor = 0, pending = false, polling = false, nextPoll = 0, nextRender = 0, open = false, hover = false, closeAt = 0, firstPoll = true, lastPid = null, players = [], unread = {}, generation = 0;
  const bubbleNodes = new Map();
  const row = m => { const r = doc.createElement('div'); r.className = 'chat-row'; r.dataset.channel = m.channel;
    const who = doc.createElement('strong'); who.textContent = (m.channel !== 'global' ? `[${m.channel}] ` : '') + m.name + ': ';
    r.append(who, doc.createTextNode(m.text)); return r; };
  function render() {
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 12;
    log.replaceChildren(...visibleMessages(messages, channel).slice(-100).map(row));
    if (nearBottom) log.scrollTop = log.scrollHeight;
    preview.replaceChildren(...visibleMessages(messages, channel).filter(m => clock() - m.at < 8000).slice(-3).map(row));
  }
  function expand(focus = false) { open = true; unread[channel] = 0; updateUnread(); closeAt = 0; host.classList.add('open'); handle.setAttribute('aria-expanded', 'true'); if (!connected) error.textContent = 'Connecting to chat…'; nextPoll = 0; if (focus) input.focus(); }
  function updateUnread() {
    for (const option of select.options) option.textContent = CHAT_CHANNELS.find(c => c.id === option.value).label + (unread[option.value] ? ` (${unread[option.value]})` : '');
    const count = Object.values(unread).reduce((a,b) => a+b,0); handle.textContent = count ? `Chat (${count})` : 'Chat';
  }
  function collapse() { open = false; input.blur(); target.blur(); host.classList.remove('open'); handle.setAttribute('aria-expanded', 'false'); }
  handle.onclick = () => expand(true); handle.onpointerenter = e => { if (e.pointerType === 'mouse') expand(); };
  hide.onclick = collapse;
  panel.onpointerenter = () => { hover = true; closeAt = 0; };
  panel.onpointerleave = () => { hover = false; closeAt = clock() + 1500; };
  panel.onfocusout = () => { closeAt = clock() + 1500; };
  select.onchange = () => { channel = select.value; unread[channel] = 0; updateUnread(); target.classList.toggle('visible', channel === 'whisper'); input.placeholder = `Message ${CHAT_CHANNELS.find(c => c.id === channel).label}`; error.textContent = ''; render(); };
  for (const type of ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'mousemove', 'dblclick', 'wheel']) host.addEventListener(type, event => event.stopPropagation());
  input.onkeydown = e => { if (e.key === 'Enter' && (e.isComposing || e.repeat)) e.preventDefault(); if (e.key === 'Escape') { e.preventDefault(); collapse(); } };
  form.onsubmit = async e => {
    e.preventDefault(); if (pending || !connected || !input.value.trim()) return;
    const text = input.value; pending = true; send.disabled = true; error.textContent = '';
    try {
      const response = await fetcher('/api/de/chat', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel, text, requestId: globalThis.crypto?.randomUUID?.() ?? `message-${clock()}-${Math.random().toString(36).slice(2)}`, ...(channel === 'whisper' && { targetPid: players.find(p => p.name.toLowerCase() === target.value.trim().toLowerCase())?.pid ?? Number(target.value) }) }) });
      const data = await response.json(); if (!response.ok || data.error) throw new Error(data.error || 'Message was not sent.');
      if (input.value === text) input.value = '';
      nextPoll = 0;
    } catch (e) { error.textContent = e.message || 'Chat unavailable. Try again.'; }
    finally { pending = false; send.disabled = false; input.focus(); }
  };
  const key = e => {
    if (!modern || !active || e.key !== 'Enter' || e.isComposing || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    if (doc.documentElement.classList.contains('yo2-cosmetics-open')) return;
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target?.tagName || '') || e.target?.isContentEditable) return;
    // Do not steal Enter from a native modal/input such as the deck editor's filename dialog.
    if (snapshot?.focus && !snapshot.windows?.some(w => w.cls === 'CChatWindow' && w.controls?.some(c => c.id === snapshot.focus))) return;
    e.preventDefault(); e.stopImmediatePropagation(); expand(true);
  };
  doc.defaultView?.addEventListener('keydown', key, true);
  async function poll() {
    const epoch = generation;
    polling = true; nextPoll = clock() + (open ? 1000 : 2000);
    try {
      const response = await fetcher(`/api/de/chat?after=${cursor}`, { credentials: 'same-origin', cache: 'no-store' });
      if (epoch !== generation || !active) return;
      if (!response.ok) { if (response.status === 401 || response.status === 403) disconnect(); return; }
      const data = await response.json();
      if (epoch !== generation || !active) return;
      if (data.error || !Array.isArray(data.messages)) { disconnect(); return; }
      if (lastPid !== null && lastPid !== data.pid || data.reset) { messages = []; firstPoll = true; }
      lastPid = data.pid; players = Array.isArray(data.players) ? data.players : [];
      playersList.replaceChildren(...players.filter(p => p.pid !== lastPid).map(p => { const o = doc.createElement('option'); o.value = p.name; return o; }));
      if (data.reset) cursor = 0;
      const byId = new Map(messages.map(m => [m.id, m]));
      for (const m of data.messages) if (m && typeof m.text === 'string' && typeof m.name === 'string') {
        if (!firstPoll && !byId.has(m.id) && !(open && channel === m.channel)) unread[m.channel] = (unread[m.channel] || 0) + 1;
        byId.set(m.id, { ...m, at: firstPoll ? Math.min(m.at, clock() - 9000) : m.at });
      }
      updateUnread();
      messages = [...byId.values()].sort((a,b) => a.id-b.id).slice(-200); cursor = data.cursor; firstPoll = false; connected = true; error.textContent = '';
      doc.documentElement.classList.toggle('de-chat-connected', modern); host.hidden = !active || !modern; render();
    } catch { nextPoll = clock() + 4000; }
    finally { polling = false; }
  }
  function disconnect() { connected = false; host.hidden = !active || !modern; doc.documentElement.classList.remove('de-chat-connected'); bubbleHost.replaceChildren(); bubbleNodes.clear(); }
  return {
    update(snap, useModern = false) {
      const changedMode = modern !== (useModern === true); modern = useModern === true;
      if (changedMode && !modern) collapse();
      doc.documentElement.classList.toggle('de-chat-connected', modern && connected);
      snapshot = snap; const wasActive = active; active = snap.chatOnline === true;
      if (!active) { if (wasActive) generation++; disconnect(); cursor = 0; messages = []; firstPoll = true; lastPid = null; return; }
      if (!doc.hidden && !polling && clock() >= nextPoll) void poll();
      host.hidden = !active || !modern;
      if (open && closeAt && clock() >= closeAt && !hover && !panel.contains(doc.activeElement)) collapse();
      if (clock() >= nextRender) { nextRender = clock() + 1000; render(); }
      const canvas = doc.querySelector('canvas'), bounds = canvas?.getBoundingClientRect(), anchors = new Map((snap.chatAvatars || []).map(a => [a.pid, a]));
      if (modern && bounds?.width && bounds?.height) {
        const scale = bounds.width / 1024;
        const visibleRect = node => { const r = node?.getBoundingClientRect(); return r?.width && r.height && r.right > bounds.left && r.left < bounds.right ? r : null; };
        const controls = [...doc.querySelectorAll('.mu .controls')].map(visibleRect).filter(r => r && r.bottom > bounds.bottom - 80 * scale);
        // Use actual rendered controls first; the snapshot covers the first frame
        // before Svelte has mounted them. Chat belongs beside Menu/Duel/Move.
        if (!controls.length) for (const win of snap.windows || []) if (win.shown && win.cls === 'CWindowModelMenu') {
          for (const c of win.controls || []) if (c.shown && c.name?.includes('MENU')) {
            const x = c.wx ?? (win.x || 0) + (c.x || 0), y = c.wy ?? (win.y || 0) + (c.y || 0);
            controls.push({ right: bounds.left + (x + (c.w || 32)) * scale, bottom: bounds.top + (y + (c.h || 28)) * scale });
          }
        }
        const menus = [...doc.querySelectorAll('.mu .groups')].map(n => visibleRect(n.closest('section'))).filter(Boolean);
        const rightEdge = Math.max(bounds.left + 4 * scale, ...controls.map(r => r.right), ...menus.map(r => r.right));
        const left = Math.min(rightEdge + 8 * scale, bounds.right - 90 * scale);
        const bottom = controls.length ? Math.max(...controls.map(r => r.bottom)) : bounds.bottom - 12 * scale;
        const width = Math.min(414, (bounds.right - 12 * scale - left) / scale);
        Object.assign(host.style, { left: left + 'px', bottom: ((doc.defaultView?.innerHeight || 768) - bottom) + 'px', width: Math.max(78, width) + 'px', transform: `scale(${scale})` });
      }
      const visible = new Set();
      if (connected && bounds?.width && bounds?.height) for (const m of bubbleMessages(messages, clock())) {
        const a = anchors.get(m.pid); if (!a || a.x < 0 || a.x > 1024 || a.y < 0 || a.y > 768) continue;
        let node = bubbleNodes.get(m.pid); if (!node) { node = doc.createElement('div'); node.className = 'speech'; bubbleNodes.set(m.pid, node); bubbleHost.append(node); }
        node.textContent = m.text.slice(0, 180); node.style.left = (bounds.left + a.x * bounds.width / 1024) + 'px'; node.style.top = (bounds.top + a.y * bounds.height / 768) + 'px'; visible.add(m.pid);
      }
      for (const [pid, node] of bubbleNodes) if (!visible.has(pid)) { node.remove(); bubbleNodes.delete(pid); }
    },
    destroy() { disconnect(); host.remove(); bubbleHost.remove(); style.remove(); doc.defaultView?.removeEventListener('keydown', key, true); },
  };
}
