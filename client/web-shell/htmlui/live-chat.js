// Speech bubbles over the players' avatars (Legacy and Modern UI alike): a line said in public chat (Global or Trade,
// chat-policy.js) shows over its speaker for a few seconds, the newest per player. The lines come from the server's
// chat stream (GET /api/de/chat, server/src/game/chat.ts), which every native chat line goes through too; the avatars'
// places from the reader (read/chat.js chatAvatars, game px). The chat window itself stays the game's (screens/chat.js,
// svelte/modern/Chat.svelte). Whispers and team lines never bubble; text is only ever textContent.
import { bubbleMessages } from './chat-policy.js';
let instance;
export function updateLiveChat(snapshot) {
  if (typeof document === 'undefined') return;
  instance ||= makeLiveChat();
  instance.update(snapshot);
}

export function makeLiveChat({ fetcher = (...args) => fetch(...args), clock = Date.now, document: doc = document } = {}) {
  const style = doc.createElement('style');
  style.textContent = `
  #de-chat-bubbles{position:fixed;inset:0;pointer-events:none;z-index:4;overflow:hidden}   /* over the map, under the HTML windows (#htmlui-host 5) */
  #de-chat-bubbles .speech{position:absolute;max-width:240px;transform:translate(-50%,-100%);padding:7px 10px;border:1px solid #1b5d7a;border-radius:10px;background:#f4fcfff0;color:#173342;box-shadow:0 2px 5px #0004;font:13px/1.3 Arial,sans-serif;overflow-wrap:anywhere;white-space:pre-wrap}
  #de-chat-bubbles .speech::after{content:'';position:absolute;left:50%;bottom:-7px;margin-left:-6px;border:6px solid transparent;border-top-color:#f4fcff;border-bottom:0}
  `;
  doc.head.append(style);
  const bubbleHost = doc.createElement('div'); bubbleHost.id = 'de-chat-bubbles'; doc.body.append(bubbleHost);
  let active = false, connected = false, messages = [], cursor = 0, polling = false, nextPoll = 0, firstPoll = true, lastPid = null, generation = 0;
  const bubbleNodes = new Map();
  async function poll() {
    const epoch = generation;
    polling = true; nextPoll = clock() + 2000;
    try {
      const response = await fetcher(`/api/de/chat?after=${cursor}`, { credentials: 'same-origin', cache: 'no-store' });
      if (epoch !== generation || !active) return;
      if (!response.ok) { if (response.status === 401 || response.status === 403) disconnect(); nextPoll = clock() + 4000; return; }
      const data = await response.json();
      if (epoch !== generation || !active) return;
      if (data.error || !Array.isArray(data.messages)) { disconnect(); nextPoll = clock() + 4000; return; }
      if (lastPid !== null && lastPid !== data.pid || data.reset) { messages = []; firstPoll = true; }
      lastPid = data.pid;
      if (data.reset) cursor = 0;
      const byId = new Map(messages.map(m => [m.id, m]));
      // each line dated on this page's clock (the server's now: a page whose clock is off still bubbles); the first
      // poll's lines are history: no bubble for what was said before this page was here
      const skew = Number.isFinite(data.now) ? data.now - clock() : 0;
      for (const m of data.messages) if (m && typeof m.text === 'string' && typeof m.name === 'string')
        byId.set(m.id, { ...m, at: firstPoll ? Math.min(m.at - skew, clock() - 9000) : m.at - skew });
      messages = [...byId.values()].sort((a, b) => a.id - b.id).slice(-200); cursor = data.cursor; firstPoll = false; connected = true;
    } catch { nextPoll = clock() + 4000; }
    finally { polling = false; }
  }
  function disconnect() { connected = false; bubbleHost.replaceChildren(); bubbleNodes.clear(); }
  return {
    update(snap) {
      const wasActive = active; active = snap.chatOnline === true;
      if (!active) { if (wasActive) generation++; disconnect(); cursor = 0; messages = []; firstPoll = true; lastPid = null; return; }
      if (!doc.hidden && !polling && clock() >= nextPoll) void poll();
      const canvas = doc.getElementById('canvas') || doc.querySelector('canvas'), bounds = canvas?.getBoundingClientRect(), anchors = new Map((snap.chatAvatars || []).map(a => [a.pid, a]));
      const visible = new Set();
      if (connected && bounds?.width && bounds?.height) for (const m of bubbleMessages(messages, clock())) {
        const a = anchors.get(m.pid); if (!a || a.x < 0 || a.x > 1024 || a.y < 0 || a.y > 768) continue;
        let node = bubbleNodes.get(m.pid); if (!node) { node = doc.createElement('div'); node.className = 'speech'; bubbleNodes.set(m.pid, node); bubbleHost.append(node); }
        node.textContent = m.text.slice(0, 180); node.style.left = (bounds.left + a.x * bounds.width / 1024) + 'px'; node.style.top = (bounds.top + a.y * bounds.height / 768) + 'px'; visible.add(m.pid);
      }
      for (const [pid, node] of bubbleNodes) if (!visible.has(pid)) { node.remove(); bubbleNodes.delete(pid); }
    },
    destroy() { disconnect(); bubbleHost.remove(); style.remove(); },
  };
}
