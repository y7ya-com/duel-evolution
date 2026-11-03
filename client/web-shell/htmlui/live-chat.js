// Server-wide MMO chat shared by Legacy and Modern UI. HTTP keeps My Room functional even on an older wasm
// whose native CHATNOTICE handler discarded room messages. Wire chat remains available as a fallback.
import { CHAT_CHANNELS, bubbleMessages, visibleMessages } from './chat-policy.js';
let instance;
export function updateLiveChat(snapshot) {
  if (typeof document === 'undefined') return;
  instance ||= makeLiveChat();
  instance.update(snapshot);
}

export function makeLiveChat({ fetcher = (...args) => fetch(...args), clock = Date.now, document: doc = document } = {}) {
  const host = doc.createElement('div'); host.id = 'de-live-chat'; host.hidden = true;
  const style = doc.createElement('style');
  style.textContent = `
  html.de-chat-connected #htmlui .win[data-window-class="CChatWindow"] { visibility:hidden!important;pointer-events:none!important }
  #de-live-chat {position:fixed;left:16px;bottom:12px;width:min(430px,calc(100vw - 32px));z-index:8000;color:#f2f8ff;font:14px/1.4 Arial,sans-serif;pointer-events:none}
  #de-live-chat[hidden]{display:none} #de-live-chat *{box-sizing:border-box}
  #de-live-chat button,#de-live-chat input,#de-live-chat select{font:inherit;color:inherit}
  #de-live-chat button{cursor:pointer} #de-live-chat .chat-handle{pointer-events:auto;border:0;border-radius:3px;background:#123d6166;color:#e8f7ff;padding:4px 9px;text-shadow:0 1px 2px #000}
  #de-live-chat .chat-panel{display:none;pointer-events:auto;border:1px solid #66bce8;border-radius:5px;background:linear-gradient(#092b44d9,#071725e8);box-shadow:0 4px 15px #0005;overflow:hidden}
  #de-live-chat.open .chat-panel{display:block} #de-live-chat.open .chat-handle{display:none}
  #de-live-chat header{display:flex;align-items:center;gap:7px;padding:5px 8px;background:#17659480}
  #de-live-chat select{background:#113c59;border:1px solid #6aa4c4;border-radius:3px;padding:3px;flex:1;min-width:0}
  #de-live-chat .hide-chat{border:0;background:none;font-size:20px;padding:0 4px}
  #de-live-chat .chat-log{height:170px;overflow:auto;padding:6px 9px;user-select:text;overflow-wrap:anywhere}
  #de-live-chat .chat-row{margin:3px 0;white-space:pre-wrap} #de-live-chat .chat-row strong{color:#a5e4ff}
  #de-live-chat .chat-row[data-channel=whisper]{color:#f0b9ff} #de-live-chat .chat-row[data-channel=team]{color:#bce99d}
  #de-live-chat .chat-composer{display:flex;border-top:1px solid #5389a3} #de-live-chat input{min-width:0;flex:1;background:#001c2e99;border:0;padding:8px;outline:none}
  #de-live-chat .send-chat{background:#1a6c97;border:0;padding:6px 12px} #de-live-chat .chat-target{display:none;width:100%;border-bottom:1px solid #5389a3}
  #de-live-chat .chat-target.visible{display:block} #de-live-chat .chat-error{color:#ffd3b0;padding:0 8px;font-size:12px}
  #de-live-chat .chat-preview{max-height:96px;overflow:hidden;padding:4px 0;text-shadow:0 1px 3px #000,0 1px 6px #000;pointer-events:none}
  #de-live-chat.open .chat-preview{display:none} #de-live-chat .chat-preview .chat-row{margin:2px 0}
  #de-chat-bubbles{position:fixed;inset:0;pointer-events:none;z-index:90;overflow:hidden}
  #de-chat-bubbles .speech{position:absolute;max-width:240px;transform:translate(-50%,-100%);padding:7px 10px;border:1px solid #1b5d7a;border-radius:10px;background:#f4fcfff0;color:#173342;box-shadow:0 2px 5px #0004;font:13px/1.3 Arial,sans-serif;overflow-wrap:anywhere;white-space:pre-wrap}
  #de-chat-bubbles .speech::after{content:'';position:absolute;left:50%;bottom:-7px;margin-left:-6px;border:6px solid transparent;border-top-color:#f4fcff;border-bottom:0}
  `;
  doc.head.append(style);
  const panel = doc.createElement('section'); panel.className = 'chat-panel'; panel.setAttribute('aria-label', 'Chat');
  const header = doc.createElement('header'), select = doc.createElement('select'); select.setAttribute('aria-label', 'Chat channel');
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
  const handle = doc.createElement('button'); handle.className = 'chat-handle'; handle.textContent = 'Chat';
  const preview = doc.createElement('div'); preview.className = 'chat-preview'; host.append(preview, handle, panel); doc.body.append(host);
  const bubbleHost = doc.createElement('div'); bubbleHost.id = 'de-chat-bubbles'; doc.body.append(bubbleHost);
  let snapshot, active = false, connected = false, channel = 'global', messages = [], cursor = 0, pending = false, polling = false, nextPoll = 0, nextRender = 0, open = false, hover = false, closeAt = 0, firstPoll = true, lastPid = null, players = [], unread = {}, generation = 0;
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
  function expand(focus = false) { open = true; unread[channel] = 0; updateUnread(); closeAt = 0; host.classList.add('open'); if (focus) input.focus(); }
  function updateUnread() {
    for (const option of select.options) option.textContent = CHAT_CHANNELS.find(c => c.id === option.value).label + (unread[option.value] ? ` (${unread[option.value]})` : '');
    const count = Object.values(unread).reduce((a,b) => a+b,0); handle.textContent = count ? `Chat (${count})` : 'Chat';
  }
  function collapse() { open = false; input.blur(); target.blur(); host.classList.remove('open'); }
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
    if (!active || !connected || e.key !== 'Enter' || e.isComposing || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
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
      messages = [...byId.values()].sort((a,b) => a.id-b.id).slice(-200); cursor = data.cursor; firstPoll = false; connected = true;
      doc.documentElement.classList.add('de-chat-connected'); host.hidden = !active; render();
    } catch { nextPoll = clock() + 4000; }
    finally { polling = false; }
  }
  function disconnect() { connected = false; host.hidden = true; doc.documentElement.classList.remove('de-chat-connected'); bubbleHost.replaceChildren(); bubbleNodes.clear(); }
  return {
    update(snap) {
      snapshot = snap; const wasActive = active; active = snap.chatOnline === true;
      if (!active) { if (wasActive) generation++; disconnect(); cursor = 0; messages = []; firstPoll = true; lastPid = null; return; }
      if (!doc.hidden && !polling && clock() >= nextPoll) void poll();
      host.hidden = !connected;
      if (open && closeAt && clock() >= closeAt && !hover && !panel.contains(doc.activeElement)) collapse();
      if (clock() >= nextRender) { nextRender = clock() + 1000; render(); }
      const canvas = doc.querySelector('canvas'), bounds = canvas?.getBoundingClientRect(), anchors = new Map((snap.chatAvatars || []).map(a => [a.pid, a]));
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
