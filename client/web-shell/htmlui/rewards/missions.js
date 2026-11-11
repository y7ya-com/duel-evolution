// The Missions window, opened over the overworld from its menu bar (rewards/launcher.js): the daily, weekly, first-steps
// and lifetime missions with their progress and MP rewards, Claim and Claim all, and the 30-day login calendar. Every
// reward is earned MP; a claim flies its amount into the wallet readout and says so in a toast.
// openMissions({ tab }) -> close(). Esc closes, Left / Right switch tabs from the tab strip; input stays in the modal.
import * as api from './api.js';
import * as cosmetics from '../cosmetics/api.js';
import { injectTheme, mpDigits } from '../cosmetics/theme.js';
import { injectShopSkin, digits } from '../cosmetics/shopart.js';
import { REWARDS_CSS } from './css.js';
import { mpInfo } from '../shop/mpinfo.js';
import { TABS, tabsOf, rowsOf, stripOf, calendarOf, claimableIds, openEvent, fmt } from './model.js';

// 24px stroke icons (Lucide-style shapes, drawn here)
const ICON = {
  check: '<svg width="14" height="14" viewBox="0 0 24 24" style="stroke-width:3.2"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  tiny: '<svg width="10" height="10" viewBox="0 0 24 24" style="stroke-width:4"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  star: '<svg width="14" height="14" viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z"/></svg>',
  trophy: '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5v1.5A3 3 0 0 0 7.6 10.5M17 6h2.5v1.5a3 3 0 0 1-3.1 3"/><path d="M12 14v3.5M8.5 20.5h7M9.5 20.5l.6-3h3.8l.6 3"/></svg>',
  target: '<svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/></svg>',
  gift: '<svg width="22" height="22" viewBox="0 0 24 24"><rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v8h14v-8M12 8.5v12"/><path d="M12 8.5C10 4 6 4.5 7 7.3c.4 1 2.3 1.2 5 1.2zM12 8.5c2-4.5 6-4 5-1.2-.4 1-2.3 1.2-5 1.2z"/></svg>',
  done: '<svg width="22" height="22" viewBox="0 0 24 24" style="stroke-width:3"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  alert: '<svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>',
  coin: '<svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5c0-1.4 1.1-2 2.5-2s2.5.7 2.5 1.8-1 1.6-2.5 2-2.5.9-2.5 2 1.1 2 2.5 2 2.5-.6 2.5-2"/></svg>',
};
const icon = (name, cls) => { const e = document.createElement('span'); e.innerHTML = ICON[name]; if (cls) e.className = cls; return e; };
const h = (tag, cls, props = {}, kids = []) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'on') for (const [t, f] of Object.entries(v)) e.addEventListener(t, f);
    else if (k === 'style') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(kids)) if (c) e.append(c);
  return e;
};
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const EMPTY = {
  daily: ['No daily missions right now', 'Three new missions arrive every day at 00:00 UTC. You can hold up to nine.'],
  weekly: ['No weekly missions right now', 'A new set arrives every Monday at 00:00 UTC.'],
  first: ['First steps complete', 'You finished the new-player track. Daily and weekly missions keep paying MP.'],
  lifetime: ['No achievements yet', 'Lifetime goals appear here as you play.'],
  event: ['No event right now', 'Limited-time events appear here.'],
};
/** A reward's toast text: MP, shards or both. */
const paid = (mp, shards) => [mp ? `+${fmt(mp)} MP` : '', shards ? `+${fmt(shards)} shards` : ''].filter(Boolean).join(', ');

let open = null;   // the one open window: { close, show(tab) }

/** Open the Missions window over the current scene. -> close(). Opened again while open: switches to `tab`. */
export function openMissions({ tab } = {}) {
  if (open) { open.show(tab); return open.close; }
  injectTheme();
  injectShopSkin();
  if (!document.getElementById('de-rewards-css')) document.head.append(h('style', null, { id: 'de-rewards-css', text: REWARDS_CSS }));
  const st = { view: api.peekView?.() || null, tab: tab || null, picked: !!tab, busy: null, loadError: null, shown: null, fresh: new Set() };
  const root = h('div', 'de-c de-rw', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Missions', tabindex: '-1' });
  const win = h('div', 'rw-win');
  root.append(h('div', 'rw-dim', { on: { click: () => close() } }), win);
  const meta = h('div', 'sa-t sa-w rw-meta');
  const walletTot = h('div', 'v'), walletInfo = mpInfo(st.view?.wallet);
  const wallet = h('div', 'rw-wallet', { role: 'group', 'aria-label': 'Your MP' }, [h('div', 'lb', { text: 'MP' }), walletTot, walletInfo]);
  const closeBtn = h('button', 'sa-pill rw-close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', on: { click: () => close() } }, h('span', null, { text: 'Back' }));
  const header = h('div', 'rw-header', {}, [h('div', 'sa-title', { text: 'Missions', role: 'heading', 'aria-level': '2' }), meta, wallet, closeBtn]);
  const tabs = h('div', 'rw-tabs', { role: 'tablist', 'aria-label': 'Mission types' });
  const stripTx = h('div', 'tx');
  const allBtn = h('button', 'sa-pill rw-all', { type: 'button', 'data-tone': 'go', on: { click: () => claimAll() } }, h('span', null, { text: 'Claim all' }));
  const strip = h('div', 'rw-strip', {}, [stripTx, allBtn]);
  const rows = h('div', 'rw-rows', { role: 'list' });
  const list = h('div', 'yo2-scroll-list rw-list', { role: 'tabpanel' }, rows);
  const cal = h('div', 'rw-cal', { role: 'region', 'aria-label': 'Login bonus' });
  const toast = h('div', 'rw-toast', { role: 'status', 'aria-live': 'polite', hidden: true });
  win.append(h('div', 'sa-glass'), h('div', 'sa-band'), header, tabs, strip, list, cal, toast);
  document.body.append(root);

  // the stage over the canvas: its rect and the scale the bridge gives its layers (bridge.js place())
  const canvas = document.getElementById('canvas');
  let scale = 1;
  const place = () => {
    const r = canvas?.getBoundingClientRect();
    scale = r?.width ? r.width / 1024 : Math.min(innerWidth / 1024, innerHeight / 768);
    Object.assign(root.style, { left: (r?.width ? r.left : (innerWidth - 1024 * scale) / 2) + 'px',
      top: (r?.width ? r.top : (innerHeight - 768 * scale) / 2) + 'px', transform: `scale(${scale})` });
  };
  place();
  const ro = canvas && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
  ro?.observe(canvas);
  addEventListener('resize', place);

  // no key reaches the game while it is up (SDL listens on window, bubbling): handled here, stopped at the root, and a
  // key aimed elsewhere (the chat line had focus) is taken in the capture phase
  const keys = e => {
    e.stopPropagation();
    if (e.type !== 'keydown') return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (step && e.target.closest?.('.rw-tabs')) {
      e.preventDefault();
      const tl = tabsOf(st.view), i = tl.findIndex(t => t.key === st.tab), n = tl[(i + step + tl.length) % tl.length].key;
      show(n);
      tabs.querySelector(`[data-tab="${n}"]`)?.focus();
    }
  };
  for (const t of ['keydown', 'keyup', 'keypress']) root.addEventListener(t, keys);
  const outside = e => { if (!root.contains(e.target)) { e.stopPropagation(); if (e.type === 'keydown' && e.key === 'Escape') close(); } };
  for (const t of ['keydown', 'keyup', 'keypress']) addEventListener(t, outside, true);
  root.addEventListener('wheel', e => e.stopPropagation());
  root.focus({ preventScroll: true });

  let closed = false, toastTimer = 0, tick = 0, shownWallet = null, hold = false, countId = 0;
  const unsub = api.onChange(v => { st.view = v; render(); });
  // the reset countdowns move on their own
  tick = setInterval(() => { if (st.view && (st.tab === 'daily' || st.tab === 'weekly' || st.tab === 'event')) renderStrip(); }, 30000);

  function load(force) {
    st.loadError = null;
    api.getView({ force }).then(v => { if (!closed) { st.view = v; render(); } },
      e => { if (!closed) { st.loadError = e; render(); } });
  }
  function show(t) {
    if (t && TABS.some(x => x.key === t)) { st.tab = t; st.picked = true; }
    render();
    list.scrollTop = 0;
  }
  // the tab to start on: the first with something to claim, else Daily (First Steps while it isn't half done)
  function pickTab(v) {
    const ready = TABS.find(t => claimableIds(v, t.key).length);
    if (!ready && openEvent(v)) return 'event';
    if (ready) return ready.key;
    const first = (v.missions || []).filter(m => m.kind === 'first');
    return first.length && first.filter(m => m.claimed).length < first.length / 2 ? 'first' : 'daily';
  }

  function render() {
    if (closed) return;
    const v = st.view;
    // the starting tab once the view is here (opened before it loaded: Daily meanwhile), unless the player chose one
    if (v && !st.picked) { st.tab = pickTab(v); st.picked = true; }
    st.tab ||= 'daily';
    renderHeader(); renderTabs(); renderStrip(); renderRows(); renderCalendar();
  }
  function renderHeader() {
    const v = st.view, n = claimableIds(v).length;
    meta.textContent = !v ? (st.loadError ? '' : 'Loading your missions…')
      : n ? `${n} reward${n === 1 ? '' : 's'} ready to claim` : 'Complete missions to earn MP';
    if (v && !hold) setWallet(v.wallet);   // held while a claim's amount is on its way
  }
  function setWallet(w) {
    shownWallet = w || { total: 0, earned: 0 };
    walletTot.replaceChildren(digits(mpDigits(shownWallet.total)));
    walletInfo.set(shownWallet);
  }
  function renderTabs() {
    const tl = tabsOf(st.view);
    tabs.dataset.n = String(tl.length);
    if (tabs.childElementCount !== tl.length) {
      tabs.replaceChildren(...tl.map(t => h('button', 'sa-plate sa-t rw-tab', { type: 'button', role: 'tab', 'data-tab': t.key,
        on: { click: () => show(t.key) } }, [h('span', 'lb', { text: t.label }), h('span', 'rw-dot', { hidden: true })])));
    }
    tl.forEach((t, i) => {
      const b = tabs.children[i], on = t.key === st.tab, dot = b.querySelector('.rw-dot');
      b.toggleAttribute('data-on', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      b.setAttribute('aria-label', t.count ? `${t.label}, ${t.count} to claim` : t.label);
      dot.hidden = !t.count;
      dot.textContent = String(t.count);
    });
    list.setAttribute('aria-label', TABS.find(t => t.key === st.tab)?.label + ' missions');
  }
  function renderStrip() {
    const v = st.view;
    if (!v) { stripTx.replaceChildren(); allBtn.hidden = true; return; }
    const s = stripOf(v, st.tab), ids = claimableIds(v, st.tab);
    const a = h('div', 'a', { text: s.text });
    let b;
    if (s.bar) {
      b = h('div', 'b rw-total', {}, [bar(s.bar.pct, 'First steps MP earned'), h('span', null, { text: s.sub })]);
    } else {
      b = h('div', 'b', {}, [st.tab === 'daily' || st.tab === 'weekly' || s.clock ? icon('clock') : null, h('span', null, { text: s.note || s.sub })]);
    }
    stripTx.replaceChildren(a, b);
    allBtn.hidden = false;
    allBtn.disabled = !ids.length || !!st.busy;
    allBtn.firstChild.textContent = ids.length > 1 ? `Claim all (${ids.length})` : 'Claim all';
  }
  function bar(pct, label) {
    const b = h('div', 'rw-bar', { role: 'progressbar', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct * 100)) },
      h('i', null, { style: { width: `${Math.round(pct * 1000) / 10}%` } }));
    if (pct >= 1) b.setAttribute('data-full', '');
    return b;
  }
  function renderRows() {
    const v = st.view;
    if (!v) {
      if (st.loadError) {
        const retry = h('button', 'sa-pill', { type: 'button', on: { click: () => { load(true); render(); } } }, h('span', null, { text: 'Try again' }));
        rows.replaceChildren(h('div', 'rw-empty', {}, [h('div', 'ic', {}, icon('alert')), h('div', 't', { text: "Couldn't load your missions" }),
          h('div', 's', { text: st.loadError.message || 'Something went wrong. Please try again.' }), st.loadError.error === 'rewards-disabled' ? null : retry]));
      } else rows.replaceChildren(...[0, 1, 2, 3, 4].map(() => h('div', 'rw-skel de-skel')));
      return;
    }
    const rs = rowsOf(v, st.tab);
    if (!rs.length) {
      const [t, s] = EMPTY[st.tab];
      rows.replaceChildren(h('div', 'rw-empty', {}, [h('div', 'ic', {}, icon(st.tab === 'first' ? 'done' : 'target')), h('div', 't', { text: t }), h('div', 's', { text: s })]));
      return;
    }
    rows.replaceChildren(...rs.map(r => row(r)));
    // an event's NPCs still to beat, under its row
    const left = rs.find(r => r.left && r.state === 'open')?.left;
    if (left?.length) rows.append(h('div', 'rw-left', {}, [h('div', 't', { text: `Still to beat (${left.length})` }), h('div', 's', { text: left.join('\u00a0· ') })]));
    st.fresh.clear();
  }
  function row(r) {
    const el = h('div', 'sa-row rw-row', { role: 'listitem', 'data-id': r.id, 'data-state': r.state,
      'data-hi': r.state === 'claimable', 'data-new': st.fresh.has(r.id) });
    const em = h('div', 'em', { 'aria-hidden': 'true' }, icon(r.state === 'done' ? 'done' : r.state === 'claimable' ? 'gift' : st.tab === 'lifetime' || st.tab === 'event' ? 'trophy' : 'target'));
    const act = h('div', 'act');
    if (r.state === 'claimable') {
      const busy = st.busy === r.id || st.busy === '*';
      act.append(h('button', 'sa-pill rw-claim', { type: 'button', 'data-tone': 'go', disabled: !!st.busy, 'aria-label': `Claim ${r.shards ? `${fmt(r.shards)} shards` : `${fmt(r.mp)} MP`}: ${r.label}`,
        on: { click: e => claimOne(r.id, e.currentTarget) } }, h('span', null, { text: busy ? 'Claiming…' : 'Claim' })));
    } else if (r.state === 'done') act.append(icon('check'), h('span', null, { text: 'Claimed' }));
    else act.append(h('span', null, { text: `${fmt(r.target - r.progress)} to go` }));
    el.append(em, h('div', 'nm', { text: r.label, title: r.label }), bar(r.pct, r.label),
      h('div', 'ct', { text: `${fmt(r.progress)}/${fmt(r.target)}` }),
      r.shards ? h('div', 'mp', {}, [h('span', 'lb', { text: 'Shards' }), digits(String(Math.round(r.shards)))])
        : h('div', 'mp', {}, [h('span', 'lb', { text: 'Reward' }), digits(mpDigits(r.mp))]), act);
    return el;
  }
  function renderCalendar() {
    const v = st.view;
    if (!v) { cal.replaceChildren(h('div', 'hd', {}, h('div', 't', { text: 'Login Bonus' }))); return; }
    const c = calendarOf(v);
    const grid = h('div', 'rw-days', { role: 'list', 'aria-label': '30-day login calendar' }, c.days.map(d => h('div', 'rw-day', {
      role: 'listitem', 'data-milestone': d.milestone, 'data-got': d.received, 'data-today': d.today,
      'aria-label': `Day ${d.day}: ${d.mp} MP${d.milestone ? ', bonus day' : ''}${d.received ? ', received' : ''}${d.today ? ', today' : ''}` }, [
      h('span', 'd', { text: String(d.day), 'aria-hidden': 'true' }), h('span', 'm', { text: String(d.mp), 'aria-hidden': 'true' }),
      d.milestone ? icon('star', 'st') : null, d.received && !d.milestone ? icon('tiny', 'ck') : null])));
    const today = c.today
      ? [h('div', 'lb', { text: "Today's bonus" }), h('div', 'v', {}, digits(mpDigits(c.today.mp), { scale: 2 })),
        h('div', 'st', { 'data-got': true }, [icon('check'), h('span', null, { text: 'Received' })])]
      : [h('div', 'lb', { text: 'Next login' }), h('div', 'v', {}, digits(mpDigits(c.tomorrow?.mp || 0), { scale: 2 })),
        h('div', 'st', {}, h('span', null, { text: `Day ${c.tomorrow?.day || 1}` }))];
    const next = [
      c.tomorrow && c.today ? h('div', null, {}, [h('span', 'k', { text: 'Tomorrow' }), h('span', null, { text: `Day ${c.tomorrow.day} · ${fmt(c.tomorrow.mp)} MP` })]) : null,
      c.nextMilestone ? h('div', null, {}, [h('span', 'k', { text: `Day ${c.nextMilestone.day} bonus` }),
        h('span', null, { text: `${fmt(c.nextMilestone.mp)} MP in ${c.nextMilestone.in} login${c.nextMilestone.in === 1 ? '' : 's'}` })]) : null,
      h('div', null, {}, [h('span', 'k', { text: 'Streak' }), h('span', null, { text: `${c.streak} day${c.streak === 1 ? '' : 's'}` })]),
    ];
    cal.replaceChildren(
      h('div', 'hd', {}, [h('div', 't', { text: 'Login Bonus', role: 'heading', 'aria-level': '3' }), h('div', 'n', { text: `Day ${c.cycleDay} of ${c.days.length}` })]),
      h('div', 'sub', { text: 'One bonus a day, paid when you sign in' }),
      grid, h('div', 'rw-today', {}, today), h('div', 'rw-next', {}, next));
  }

  // ---- claiming
  function say(text, tone = 'ok') {
    clearTimeout(toastTimer);
    toast.replaceChildren(icon(tone === 'error' ? 'alert' : 'coin'), h('span', null, { text }));
    toast.dataset.tone = tone;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, tone === 'error' ? 7000 : 3500);
  }
  // the amount rises from where it was claimed into the wallet, which counts up to the new balance
  function fly(mp, fr, before, after) {
    const wr = rect(wallet);
    const el = h('div', 'rw-fly', { 'aria-hidden': 'true' }, [h('b', null, { text: '+' }), digits(mpDigits(mp), { scale: 2 })]);
    win.append(el);
    const x0 = fr.x + fr.w / 2 - 50, y0 = fr.y - 8, x1 = wr.x + wr.w / 2 - 50, y1 = wr.y + 8;
    Object.assign(el.style, { left: x0 + 'px', top: y0 + 'px' });
    const done = () => { el.remove(); countUp(before, after); };
    if (reduced() || !el.animate) { done(); return; }
    el.animate([
      { transform: 'translate(0,12px) scale(.6)', opacity: 0 },
      { transform: 'translate(0,-16px) scale(1.1)', opacity: 1, offset: .25 },
      { transform: 'translate(0,-16px) scale(1)', opacity: 1, offset: .45 },
      { transform: `translate(${x1 - x0}px,${y1 - y0}px) scale(.55)`, opacity: .2 },
    ], { duration: 1100, easing: 'cubic-bezier(.45,0,.3,1)' }).finished.then(done, done);
  }
  const rect = el => {   // an element's box in the window's game px
    const a = el.getBoundingClientRect(), b = win.getBoundingClientRect();
    return { x: (a.left - b.left) / scale, y: (a.top - b.top) / scale, w: a.width / scale, h: a.height / scale };
  };
  function countUp(before, after) {
    wallet.removeAttribute('data-pulse'); void wallet.offsetWidth; wallet.setAttribute('data-pulse', '');
    const id = ++countId, end = () => { hold = false; setWallet(st.view?.wallet || after); };
    if (!before || !after || reduced()) { end(); return; }
    const t0 = performance.now(), D = 600;
    const step = t => {
      if (closed || id !== countId) return;
      const k = Math.min(1, (t - t0) / D), e = 1 - (1 - k) ** 3;
      setWallet({ total: before.total + (after.total - before.total) * e, earned: before.earned + (after.earned - before.earned) * e });
      if (k < 1) requestAnimationFrame(step); else end();
    };
    requestAnimationFrame(step);
  }
  // the box shop and the Wardrobe cache the wallet too: refresh it there if they've read it
  const refreshElsewhere = () => { try { if (cosmetics.peekInfo()) cosmetics.getInfo({ force: true }).catch(() => {}); } catch {} };

  async function claimOne(id, btn) {
    if (st.busy) return;
    const before = shownWallet, m = st.view?.missions?.find(x => x.id === id), from = rect(btn);
    st.busy = id; hold = true; render();
    try {
      const r = await api.claim(id);
      if (closed) return;
      st.busy = null; st.view = r.view;
      if (!r.grant.mp) hold = false;   // shards: the MP wallet doesn't move
      render();
      if (r.grant.mp) fly(r.grant.mp, from, before, r.view.wallet);
      say(`${r.replayed ? 'Already claimed' : 'Claimed'}: ${m?.label || 'reward'}. ${paid(r.grant.mp, r.grant.shards)}`);
      refreshElsewhere();
    } catch (e) {
      if (closed) return;
      st.busy = null; hold = false; st.view = api.peekView() || st.view; render();
      say(e?.message || 'Something went wrong. Please try again.', 'error');
    }
  }
  async function claimAll() {
    const ids = claimableIds(st.view, st.tab);
    if (st.busy || !ids.length) return;
    const before = shownWallet, from = rect(allBtn);
    st.busy = '*'; hold = true; render();
    const r = await api.claimAll(ids);
    if (closed) return;
    st.busy = null; st.view = api.peekView() || st.view;
    if (!r.mp) hold = false;
    render();
    if (r.mp) fly(r.mp, from, before, st.view.wallet);
    if (r.grants.length) refreshElsewhere();
    const got = r.grants.length ? `Claimed ${r.grants.length} reward${r.grants.length === 1 ? '' : 's'}. ${paid(r.mp, r.shards)}` : '';
    if (r.error) say(got ? `${got}. ${r.error.message}` : r.error.message, 'error');
    else say(got);
  }

  function close() {
    if (closed) return;
    closed = true; open = null;
    unsub();
    clearInterval(tick); clearTimeout(toastTimer);
    ro?.disconnect();
    removeEventListener('resize', place);
    for (const t of ['keydown', 'keyup', 'keypress']) removeEventListener(t, outside, true);
    root.remove();
    onClose.forEach(f => { try { f(); } catch {} });
  }
  open = { close, show(t) { if (t) show(t); load(true); root.focus({ preventScroll: true }); } };
  render();
  load(true);
  return close;
}
/** Whether the Missions window is open (its menu-bar button stays pressed meanwhile). */
export const isMissionsOpen = () => !!open;
const onClose = new Set();
/** cb() whenever the Missions window closes; -> unsubscribe. */
export const onMissionsClose = cb => { onClose.add(cb); return () => onClose.delete(cb); };
