// All Chat lines as speech bubbles over the speaker's avatar (owner: proximity chat goes, "instead we'll show speech
// bubbles above characters when they type in the all chat"). Each frame (bridge.js) the All Chat tab's log (the chat
// window's first tab, read/chat.js pairs[0]) is diffed against the last one; a new line "<name>:<text>" whose name is
// a shown avatar's (read/chat.js chatAvatars) puts a bubble over that avatar's name tag, one per speaker (a newer line
// replaces it), for a few seconds. Lines already there when the window is first seen (a scene's backlog) never show.
// The bubbles sit over the map and under every HTML window (#htmlui-host is z-index 4), and are gone through a scene
// load (wait) or out of the online world.

const CSS = `
.de-bubbles { position: fixed; left: 0; top: 0; width: 1024px; height: 768px; transform-origin: 0 0; z-index: 3;
  pointer-events: none; overflow: hidden; }
.de-bubbles > div { position: absolute; max-width: 220px; transform: translate(-50%, -100%); padding: 4px 8px;
  border: 1px solid #3f83b5; border-radius: 8px; background: #fffffff0; color: #000; box-shadow: 0 1px 3px #0005;
  font: 13px/16px Arial, sans-serif; text-align: left; white-space: pre-wrap; overflow-wrap: anywhere; }
.de-bubbles > div::before, .de-bubbles > div::after { content: ''; position: absolute; left: 50%; border: solid transparent; }
.de-bubbles > div::before { bottom: -8px; margin-left: -7px; border-width: 8px 7px 0; border-top-color: #3f83b5; }
.de-bubbles > div::after { bottom: -6px; margin-left: -6px; border-width: 7px 6px 0; border-top-color: #fffffff0; }
`;
const GAP = 4;                                   // px between the name tag's top and the tail
const ttl = text => Math.min(9000, 4000 + 60 * [...text].length);
const untag = s => s.replace(/[@＠]\d/g, '');
// [rows dropped at the top, lines appended], or null (screens/chat.js's, not imported: the screens load later)
function itemsDelta(old, now) {
  for (let d = 0; d <= old.length; d++) {
    const keep = old.length - d;
    if (keep <= now.length && old.slice(d).every((s, i) => s === now[i])) return [d, now.slice(keep)];
  }
  return null;
}

let el = null, logId = 0, seen = null;
const live = new Map();                          // pid -> { node, until }

/** The speaker of a log line among the avatars: the longest name with "<name>:" at the line's start. */
export function speaker(line, avatars) {
  let best = null;
  for (const a of avatars) {
    const name = untag(a.name || '').trim();
    if (name && line.startsWith(name + ':') && (!best || name.length > best.name.length)) best = { ...a, name };
  }
  return best && { pid: best.pid, text: line.slice(best.name.length + 1).trim() };
}

function mount() {
  if (!document.getElementById('de-bubbles-css')) {
    const s = document.createElement('style'); s.id = 'de-bubbles-css'; s.textContent = CSS; document.head.append(s);
  }
  el = document.createElement('div'); el.className = 'de-bubbles'; el.setAttribute('aria-hidden', 'true');
  document.body.append(el);
}
function clear() { for (const b of live.values()) b.node.remove(); live.clear(); }
function unmount() { clear(); el?.remove(); el = null; }

/** bridge.js, every frame. */
export function chatBubblesFrame(snap, wait = false) {
  const chat = snap.windows.find(w => w.cls === 'CChatWindow');
  const log = chat?.pairs?.[0] && chat.controls.find(c => c.id === chat.pairs[0].log);
  if (!log || chat.online === false || !chat.world) { logId = 0; seen = null; return unmount(); }
  const items = (log.items || []).map(untag);
  const d = log.id === logId && seen ? itemsDelta(seen, items) : null;
  logId = log.id; seen = items;
  const avatars = snap.chatAvatars || [];
  if (wait) return clear();
  if (!el) mount();
  const now = performance.now();
  for (const line of d ? d[1] : []) {
    const who = speaker(line, avatars);
    if (!who?.text) continue;
    let b = live.get(who.pid);
    if (!b) { b = { node: document.createElement('div') }; live.set(who.pid, b); el.append(b.node); }
    b.node.textContent = who.text; b.until = now + ttl(who.text);
  }
  const at = new Map(avatars.map(a => [a.pid, a]));
  for (const [pid, b] of live) {
    const a = at.get(pid);
    if (now > b.until) { b.node.remove(); live.delete(pid); continue; }
    b.node.hidden = !a;
    if (a) Object.assign(b.node.style, { left: a.x + 'px', top: a.y - GAP + 'px' });
  }
  const r = document.getElementById('canvas')?.getBoundingClientRect(), s = r?.width ? r.width / 1024 : 1;
  Object.assign(el.style, { left: (r?.left || 0) + 'px', top: (r?.top || 0) + 'px', transform: `scale(${s})` });
}
