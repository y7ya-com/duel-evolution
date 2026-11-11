// A player's ranked standing next to the level the game shows ("LV23 · Ra Yellow II (1612)"), for the legacy screens
// that draw a level: the player card (screens/lobby.js), My Profile (screens/social.js), Select Player
// (screens/select.js). GET /api/de/rank (server/src/game/rank-api.ts: ?pid=, ?name= an online player, ?self=1 the
// account's own characters): public fields only, { pid, name, known, placed, school, division, label, rating,
// placement: { played, of } | null }. Answers are kept RANK_TTL here (the server lets the browser keep one 30 s too)
// and a failure briefly, so a window redrawn every frame asks once. The legacy screens load it unbundled
// (ship-client.sh ships htmlui/*.js); the DOM part is rankTag (Arial DOM text, the owner's text rule).
const basic = await import('./controls/basic.js').catch(() => null);   // null under node (its ../../ui.js is the page's)
export const RANK_TTL = 30000, FAIL_TTL = 8000;

// The schools' colours (the Academy dorm blazers): Slifer red, Ra yellow, Obelisk blue; Master the gold of the
// 2008 menu buttons' edge; Beginner / unplaced the game's grey. `edge`: a darker outline of the same hue, so the
// yellow reads on the light card and profile wells as the game's outlined captions do.
export const SCHOOL = {
  slifer: { fill: '#e0231b', edge: '#5a0d08' },
  ra: { fill: '#ffd21a', edge: '#6b4e00' },
  obelisk: { fill: '#2a6cf0', edge: '#0a2266' },
  master: { fill: '#f4a21c', edge: '#5c3200' },
  beginner: { fill: '#e8e8e8', edge: '#404040' },
};
export const rankLook = r => SCHOOL[r?.placed ? r.school : 'beginner'] || SCHOOL.beginner;

// "Ra Yellow II (1612)", "Master (2201)", "Unranked · Placement 2/5"; '' for nothing to show (unknown player, an NPC)
export function rankText(r) {
  if (!r?.known) return '';
  if (!r.placed) return r.placement ? `Unranked · Placement ${r.placement.played}/${r.placement.of}` : 'Unranked';
  return r.rating == null ? r.label : `${r.label} (${r.rating})`;
}

// the tight form, where the full one doesn't fit (Select Player's rows): "Ra II (1612)", "Obelisk I (1893)",
// "Master (2201)", "Placement 2/5"
export function rankShort(r) {
  if (!r?.known) return '';
  if (!r.placed) return r.placement ? `Placement ${r.placement.played}/${r.placement.of}` : 'Unranked';
  const word = { slifer: 'Slifer', ra: 'Ra', obelisk: 'Obelisk', master: 'Master' }[r.school] || r.label;
  const div = r.division ? ' ' + ['', 'I', 'II', 'III'][r.division] : '';
  return r.rating == null ? word + div : `${word}${div} (${r.rating})`;
}
/** The text that fits in w pixels at px: the full form, else the short one, else '' (nothing rather than overlap). */
export function rankFit(r, w, px = 16, width = basic?.textWidth) {
  for (const s of [rankText(r), rankShort(r)]) if (s && width(s, px) + spacingGuess(s) <= w) return s;
  return '';
}
const spacingGuess = s => [...s].length;
/** A game text's width at px as textBox lays it out (Arial plus spacing() per glyph); 0 under node. */
export const labelWidth = (s, px = 16) => basic && s ? basic.textWidth(s, px) + basic.spacing(s, px) * [...s].length : 0;   // the engine's +1 per glyph (controls/basic.js spacing()): at most 1 px each
/** The standing as game text at x, y (align 0 left, 2 right, in w): the school's colour, outlined in its dark shade
 *  as the game's ShadowText captions are (skin.js: 1 px each way). -> the element, or null for nothing to show. */
// plain: set in the surrounding text's own look (a list row's dark Arial), not the outlined name-tag style
export function rankTag(parent, r, { x = 0, y = 0, w, align = 0, px = 16, text, plain = false } = {}) {
  const s = text ?? rankText(r);
  if (!s) return null;
  const { fill, edge } = rankLook(r), d = basic.textBox(parent, s, { x, y, w, align, px, white: !plain, color: plain ? [0, 0, 0, 1] : [1, 1, 1, 1] });
  d.classList.add('yo2-rank');
  d.dataset.school = r.placed ? r.school : 'unranked';
  Object.assign(d.style, plain ? { pointerEvents: 'none' } : { color: fill, textShadow: `1px 0 ${edge}, -1px 0 ${edge}, 0 1px ${edge}, 0 -1px ${edge}`, pointerEvents: 'none' });
  return d;
}

// A player's card (CPlayerListMenu, yo2PlayerListMenu.cpp showInfo): its header "LV01  Name\nTeam" (text 0x2328 +
// %02d, two spaces, %8s) is a CWindowTaskHelp (nameText_, at 8, 8) whose CWindowTaskText child at 0, 0 holds the
// string, centred (align 1) in its 320 px. -> { x, y, w, align, lineGap, first (trailing spaces off), team } in window
// pixels, or null without one.
export const PID_BASE = 1000;   // server hub.ts: a player's pid is PID_BASE + 4 account index + slot; NPCs are below
export function cardHeader(win) {
  const h = win.controls.find(c => c.shown && /^\s*LV\s*\d/i.test(c.text || ''));
  if (!h) return null;
  const up = h.parent ? win.controls.find(c => c.id === h.parent) : null;
  const [first = '', team = ''] = h.text.split('\n');
  return { x: (up?.x ?? 0) + h.x, y: (up?.y ?? 0) + h.y, w: h.w, align: h.align || 0, lineGap: h.lineGap || 0,
    first: first.replace(/\s+$/, ''), team: team.trim() };
}

const cache = new Map();   // key -> { at, ttl, value, promise }
const now = () => Date.now();
async function ask(query) {
  const base = globalThis.ENV?.YO2_DE_HTTP || '';
  const r = await fetch(`${base}/api/de/rank?${query}`, { credentials: 'same-origin' });
  if (!r.ok) throw new Error('rank ' + r.status);
  return (await r.json()).players || [];
}
function cached(key, query, pick) {
  const hit = cache.get(key);
  if (hit && now() - hit.at < hit.ttl) return hit.promise;
  const e = { at: now(), ttl: RANK_TTL, value: undefined, promise: null };
  e.promise = ask(query).then(ps => (e.value = pick(ps) ?? null), () => { e.ttl = FAIL_TTL; return (e.value = null); });
  cache.set(key, e);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return e.promise;
}
/** What is known now, without asking: the value, null (asked: nothing), or undefined (not asked yet / in flight). */
export const peekRank = key => { const e = cache.get(key); return e && now() - e.at < e.ttl ? e.value : undefined; };
export const pidKey = pid => 'pid:' + pid, nameKey = name => 'name:' + name, SELF = 'self';
export const rankByPid = pid => cached(pidKey(pid), 'pid=' + encodeURIComponent(pid), ps => ps.find(p => p.pid === +pid));
export const rankByName = name => cached(nameKey(name), 'name=' + encodeURIComponent(name), ps => ps.find(p => p.name === name));
/** The account's own characters (Select Player, My Profile): [PublicRank], slot order. */
export const rankSelf = () => cached(SELF, 'self=1', ps => ps);
export const clearRanks = () => cache.clear();
