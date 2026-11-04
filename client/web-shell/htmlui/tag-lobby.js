// A shared in-game tag lobby for Modern and Legacy UI. Stable player ids go to the
// server; names are display text only. The final acceptance starts the native duel.
const ROLES = ['teammatePid', 'opponentPid', 'opponentTeammatePid'];
export const openTagLobby = opponentName => globalThis.dispatchEvent(new CustomEvent('yo2-tag-lobby-open', { detail: { opponentName } }));

export async function tagRequest(action = '', body) {
  const response = await fetch((globalThis.ENV?.YO2_DE_HTTP || '') + '/api/de/tag' + (action ? '/' + action : ''), {
    method: action ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    ...(action ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || data.message || 'Tag duels could not be loaded. Try again.');
    error.state = data.state || (data.self && data.players ? data : null);
    throw error;
  }
  return data;
}

export function tagLobbyController({ request = tagRequest, changed = () => {}, now = () => Date.now() / 1000 } = {}) {
  let revision = 0, readError = false;
  const model = { state: null, selected: { teammatePid: 0, opponentPid: 0, opponentTeammatePid: 0 }, busy: false, error: '', notice: '' };
  const emit = () => changed(model);
  const invitations = () => (model.state?.invitations || []).filter(i => i.expires > now());
  const notifyResult = previous => {
    const event = model.state?.event;
    if (model.state?.started || model.state?.active) model.notice = 'Everyone is ready. Starting your tag duel…';
    else if (event && now() - event.at < 120) model.notice = ({ declined: `${event.name || 'A player'} declined the invitation.`, cancelled: 'The captain cancelled the invitation.', expired: 'The tag invitation expired. Invite your group again.', unavailable: 'A player became unavailable. Invite your group again.', started: 'Everyone is ready. Starting your tag duel…' })[event.kind] || '';
    else if (previous && !invitations().some(i => i.id === previous.id)) model.notice = previous.expires <= now() ? 'The tag invitation expired. Invite your group again.' : 'The tag invitation ended or a player declined. You can invite a new group.';
  };
  return {
    model, invitations,
    reset() {
      revision++; model.state = null; model.busy = false; model.error = ''; model.notice = '';
      model.selected = { teammatePid: 0, opponentPid: 0, opponentTeammatePid: 0 }; emit();
    },
    async refresh() {
      if (model.busy) return;
      const token = ++revision, previous = invitations()[0] || model.state?.invitations?.[0];
      try {
        const state = await request();
        if (token !== revision) return;
        model.state = state;
        if (readError) { model.error = ''; readError = false; }
        for (const role of ROLES) if (!state.players.some(p => p.pid === model.selected[role])) model.selected[role] = 0;
        notifyResult(previous);
      } catch (e) { if (token === revision) { readError = true; model.error = e.message || 'Could not connect. Try again.'; } }
      if (token === revision) emit();
    },
    select(role, value) {
      if (!ROLES.includes(role) || model.busy) return;
      const pid = Number(value);
      if (pid && (!model.state?.players.some(p => p.pid === pid) || ROLES.some(r => r !== role && model.selected[r] === pid))) return;
      model.selected[role] = pid; model.error = ''; model.notice = ''; emit();
    },
    async act(action, id) {
      if (model.busy || !['invite', 'accept', 'decline', 'cancel'].includes(action)) return false;
      if (action === 'invite') {
        const picks = ROLES.map(r => model.selected[r]);
        if (!model.state?.available || picks.some(p => !p || !model.state.players.some(q => q.pid === p)) || new Set(picks).size !== 3) {
          model.error = model.state?.reason || 'Choose a teammate and two different opponents from this location.'; emit(); return false;
        }
      } else if (!invitations().some(i => i.id === id)) { model.error = 'This invitation has expired. Refresh to invite your group again.'; emit(); return false; }
      const token = ++revision; model.busy = true; model.error = ''; model.notice = ''; emit();
      try {
        const state = await request(action, action === 'invite' ? { ...model.selected } : { id });
        if (token !== revision) return false;
        model.state = state;
        if (model.state.started || model.state.active) model.notice = 'Everyone is ready. Starting your tag duel…';
        else if (action === 'cancel') model.notice = 'Your tag invitation was cancelled.';
        else if (action === 'decline') model.notice = 'Tag invitation declined.';
        return true;
      } catch (e) { if (token === revision) { if (e.state) model.state = e.state; model.error = e.message || 'The request failed. Try again.'; } return false; }
      finally { if (token === revision) { model.busy = false; emit(); } }
    },
  };
}

export function tagLobby(canvas) {
  const root = document.createElement('div'), style = document.createElement('style');
  root.className = 'yo2-tag-lobby'; root.hidden = true; root.dataset.modernOwned = '';
  style.textContent = `
.yo2-tag-lobby{position:fixed;z-index:60;pointer-events:none;width:1024px;height:768px;transform-origin:top left;color:#20304c;font:14px system-ui,sans-serif}.yo2-tag-lobby[hidden]{display:none}.yo2-tag-lobby *{box-sizing:border-box}.yo2-tag-lobby button,.yo2-tag-lobby select{font:inherit;cursor:pointer}.yo2-tag-lobby button:disabled,.yo2-tag-lobby select:disabled{opacity:.5;cursor:default}.yo2-tag-lobby button:focus-visible,.yo2-tag-lobby select:focus-visible{outline:3px solid #3889cd;outline-offset:2px}.yo2-tag-shade{position:absolute;inset:0;display:grid;place-items:center;background:#07182b80;pointer-events:auto}.yo2-tag-dialog{width:580px;max-height:660px;overflow-y:auto;border:1px solid #91a9c1;border-radius:12px;background:#f2f6fc;box-shadow:0 12px 60px #06142588;padding:24px}.yo2-tag-dialog header{display:flex;justify-content:space-between;align-items:center;gap:16px}.yo2-tag-dialog h2{margin:0;font-size:23px}.yo2-tag-close{border:0;background:transparent;font-size:25px!important;line-height:1;padding:4px 8px}.yo2-tag-intro{line-height:1.5;color:#53657f;margin:12px 0 20px}.yo2-tag-teams{display:grid;grid-template-columns:1fr 1fr;gap:14px}.yo2-tag-team{min-width:0;border-radius:8px;padding:15px;background:#e1ebf6;border-top:3px solid #3d789d}.yo2-tag-team:last-child{border-color:#ad7650;background:#f1e7dd}.yo2-tag-team h3{margin:0 0 12px;font-size:14px}.yo2-tag-seat{margin:12px 0;display:block}.yo2-tag-seat span{display:block;font-size:12px;margin-bottom:5px;color:#566479}.yo2-tag-seat strong{display:block;overflow-wrap:anywhere}.yo2-tag-seat select{width:100%;border:1px solid #9aadbf;border-radius:5px;padding:9px 6px;background:#fff;color:#213650}.yo2-tag-ready{display:block;font-size:12px;margin-top:4px;color:#276748}.yo2-tag-wait{display:block;font-size:12px;margin-top:4px;color:#775c23}.yo2-tag-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}.yo2-tag-actions button{border:1px solid #849db9;border-radius:6px;padding:10px 17px;background:#fff;color:#25425f;font-weight:700}.yo2-tag-actions .primary{color:#fff;background:#205b8a;border-color:#1b4d77}.yo2-tag-error{color:#9c2929;background:#fce9e7;border-radius:6px;padding:10px;line-height:1.4}.yo2-tag-notice{color:#315a43;line-height:1.5}.yo2-tag-expiry{font-size:12px;color:#62738b;margin:15px 0 0}
`;
  style.textContent += `
html.mu-modern .yo2-tag-lobby{font:14px Arial,sans-serif;color:var(--ink)}
html.mu-modern .yo2-tag-shade{background:#07396877}
html.mu-modern .yo2-tag-dialog{width:600px;padding:18px;border:3px solid #96eaff;outline:1px solid #1a6ab2;border-radius:4px;background:var(--plate);box-shadow:0 6px 20px #10385870}
html.mu-modern .yo2-tag-dialog header{min-height:34px;margin:-15px -15px 14px;padding:0 8px 0 12px;background:var(--band);border-bottom:1px solid #1253ac;color:#fff;text-shadow:0 1px #12518c}
html.mu-modern .yo2-tag-dialog h2{font:bold 18px Arial,sans-serif}
html.mu-modern .yo2-tag-close{padding:0;width:24px;height:23px;font-size:23px!important;line-height:20px;border:1px solid #ad8b38;border-radius:2px;background:var(--gold);color:#145397;text-shadow:none}
html.mu-modern .yo2-tag-intro{font-size:13px;line-height:1.45;color:var(--ink-2);margin:0 0 15px}
html.mu-modern .yo2-tag-team{border:1px solid #6c9fc1;border-radius:2px;padding:12px;background:#ddf6ff;box-shadow:inset 0 1px #fff}
html.mu-modern .yo2-tag-team h3{margin:-12px -12px 12px;padding:6px 10px;font-size:14px;border-bottom:1px solid #438dc3;background:linear-gradient(#a8e9fc,#63b9e5);color:#123f70}
html.mu-modern .yo2-tag-team label{font-size:12px;color:#2b5a7d}
html.mu-modern .yo2-tag-team select{height:33px;border:1px solid #699cbd;border-radius:2px;background:#f0fcff;color:#123b65;font-size:14px}
html.mu-modern .yo2-tag-self{font-weight:700;color:#123c68}
html.mu-modern .yo2-tag-actions button{height:31px;padding:0 13px;border:1px solid #317db4;border-radius:3px;background:var(--btn);color:var(--ink-strong);font-size:13px;font-weight:700;box-shadow:inset 0 1px #fff,0 1px #1e649c}
html.mu-modern .yo2-tag-actions .primary{background:var(--gold);border-color:var(--gold-edge);color:var(--gold-ink)}
html.mu-modern .yo2-tag-actions button:hover{filter:brightness(1.08)}
html.mu-modern .yo2-tag-seat{border-radius:2px;padding:8px;background:#edfcff;border:1px solid #a0c9de;color:#173d65}
html.mu-modern .yo2-tag-seat strong{font-size:15px}
html.mu-modern .yo2-tag-ready{color:#1a774b}
html.mu-modern .yo2-tag-wait{color:#6a6440}
html.mu-modern .yo2-tag-expiry{font-size:12px;color:#2e6285}
html.mu-modern .yo2-tag-error{border-radius:2px;border:1px solid #b97979;background:#fff0e8;color:#94302c}
html.mu-modern .yo2-tag-notice{border-radius:2px;border:1px solid #bba25d;background:#fff7cf;color:#68501d}
`;
  style.textContent += `
.yo2-tag-shade{background:transparent}.yo2-tag-close{height:23px;width:24px;padding:0;border:1px solid #ad8b38;border-radius:2px;background:linear-gradient(#fffed8,#efc352);color:#145397}.yo2-tag-error{border-radius:1px;border:1px solid #bd8e8e}.yo2-tag-dialog{border:3px solid #9ceaff;border-radius:2px;background:linear-gradient(#eaffff,#a9d9f1);box-shadow:inset 1px 1px #fff,0 3px 8px #002b5c88;padding:16px;color:#173d65;font:14px Arial,sans-serif}
.yo2-tag-dialog header{margin:-13px -13px 12px;padding:6px 10px;background:linear-gradient(#a9f5ff,#28a9e5 48%,#0876c4);border-bottom:1px solid #1b579a;color:#fff;text-shadow:0 1px #154b84}
.yo2-tag-dialog h2{font-size:18px}.yo2-tag-team{border:1px solid #6f9eb9;border-radius:1px;background:#d9f2ff;padding:12px}.yo2-tag-team:last-child{background:#e3f2fb;border-color:#6f9eb9}
.yo2-tag-seat select{border-radius:1px;border-color:#6b9db9;background:#f4ffff}.yo2-tag-actions button{border-radius:2px;border:1px solid #327bb1;background:linear-gradient(#fff,#bdeeff 48%,#7ec8ed 51%,#64b5e0);color:#173d65;padding:7px 14px}.yo2-tag-actions .primary{background:linear-gradient(#fffed8,#ffed83 47%,#efc352 51%,#e8a73a);border-color:#aa7821;color:#4d360b}
`;
  document.head.append(style); document.body.append(root);
  let enabled = false, modern = false, visible = false, loading = false, timer = null, generation = 0, oldFocus = null, lastRender = '', preselect = '', seen = new Set();
  const controller = tagLobbyController({ changed: () => {
    const incoming = controller.invitations().find(i => !i.outbound && !seen.has(i.id));
    if (incoming && enabled) { seen.add(incoming.id); open(); }
    if (preselect && controller.model.state) {
      const player = controller.model.state.players.find(p => p.name === preselect);
      preselect = '';
      if (player) controller.select('opponentPid', player.pid);
      else controller.model.error = 'That player is unavailable for a tag duel here. Choose another opponent.';
    }
    render();
  } });
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function button(text, action, cls = '') { const b = el('button', cls, text); b.type = 'button'; b.disabled = controller.model.busy; b.addEventListener('click', action); return b; }
  function place() { const r = canvas.getBoundingClientRect(); Object.assign(root.style, { left: r.left + 'px', top: r.top + 'px', transform: `scale(${r.width / 1024})` }); }
  function open(name) {
    if (!enabled) return;
    if (!visible) oldFocus = document.activeElement;
    visible = true; preselect = name || preselect; lastRender = ''; render();
  }
  function close() { visible = false; preselect = ''; render(); oldFocus?.focus?.(); }
  function render() {
    root.hidden = !enabled || loading || !visible;
    if (root.hidden) return;
    const m = controller.model, invitations = controller.invitations(), invite = invitations.find(i => i.outbound) || invitations[0];
    const signature = JSON.stringify([visible, modern, m.selected, m.busy, m.error, m.notice, m.state?.self, m.state?.available, m.state?.reason, m.state?.players, m.state?.active, invite]);
    if (signature === lastRender) return;
    lastRender = signature;
    const focusKey = root.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    root.replaceChildren();
    if (!visible) { root.replaceChildren(); return; }
    const shade = el('div', 'yo2-tag-shade'), dialog = el('section', 'yo2-tag-dialog');
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'yo2-tag-title');
    const header = el('header'), title = el('h2', '', invite ? (invite.outbound ? 'Your tag duel' : 'Tag duel invitation') : 'Tag Duel'); title.id = 'yo2-tag-title';
    const dismiss = button('×', close, 'yo2-tag-close'); dismiss.setAttribute('aria-label', 'Close tag lobby'); dismiss.dataset.key = 'close';
    header.append(title, dismiss); dialog.append(header);
    dialog.append(el('p', 'yo2-tag-intro', 'Team up for a 2 vs 2 relay duel. Each team shares its captain’s deck and field; partners take turns playing. All four players must accept.'));
    if (!m.state) dialog.append(el('p', '', 'Loading players in this location…'));
    else {
      const teams = el('div', 'yo2-tag-teams');
      function selectSeat(label, role) {
        const wrap = el('label', 'yo2-tag-seat'), caption = el('span', '', label), select = el('select');
        select.dataset.key = role; select.disabled = m.busy || !m.state.available || !!invite || m.state.active;
        const empty = el('option', '', 'Choose a player'); empty.value = ''; select.append(empty);
        for (const player of m.state.players) {
          const option = el('option', '', player.name); option.value = player.pid;
          option.disabled = ROLES.some(r => r !== role && m.selected[r] === player.pid); select.append(option);
        }
        select.value = m.selected[role] || ''; select.addEventListener('change', () => controller.select(role, select.value));
        wrap.append(caption, select); return wrap;
      }
      for (let team = 0; team < 2; team++) {
        const ownRole = invite?.seats.find(s => s.pid === m.state.self.pid)?.role;
        const ownTeam = !ownRole || ['captain', 'teammate'].includes(ownRole) ? 0 : 1;
        const box = el('div', 'yo2-tag-team'); box.append(el('h3', '', team === ownTeam ? 'Your team' : 'Opponents'));
        if (invite) for (const seat of invite.seats.filter(s => team === 0 ? ['captain', 'teammate'].includes(s.role) : ['opponent', 'opponent-teammate'].includes(s.role))) {
          const row = el('div', 'yo2-tag-seat'); row.append(el('span', '', seat.role === 'captain' || seat.role === 'opponent' ? 'Captain’s deck' : 'Partner'), el('strong', '', seat.name + (seat.pid === m.state.self.pid ? ' (you)' : '')), el('small', seat.accepted ? 'yo2-tag-ready' : 'yo2-tag-wait', seat.accepted ? '✓ Ready' : 'Awaiting acceptance')); box.append(row);
        } else if (team === 0) {
          const self = el('div', 'yo2-tag-seat'); self.append(el('span', '', 'You · captain’s deck'), el('strong', '', m.state.self.name)); box.append(self, selectSeat('Your teammate', 'teammatePid'));
        } else box.append(selectSeat('Opposing captain', 'opponentPid'), selectSeat('Their teammate', 'opponentTeammatePid'));
        teams.append(box);
      }
      dialog.append(teams);
      if (invite) {
        const expiry = el('p', 'yo2-tag-expiry'); expiry.dataset.expires = invite.expires; dialog.append(expiry);
      } else if (!m.state.available && !m.state.active) dialog.append(el('p', 'yo2-tag-expiry', m.state.reason || 'Return to the lobby and finish your current activity to invite players.'));
      else if (m.state.players.length < 3) dialog.append(el('p', 'yo2-tag-expiry', 'You need three other available players here. Ask your friends to join this location.'));
    }
    if (m.error) { const error = el('p', 'yo2-tag-error', m.error); error.setAttribute('role', 'alert'); dialog.append(error); }
    if (m.notice) { const notice = el('p', 'yo2-tag-notice', m.notice); notice.setAttribute('role', 'status'); dialog.append(notice); }
    const actions = el('footer', 'yo2-tag-actions');
    if (invite) {
      const own = invite.seats.find(s => s.pid === m.state.self.pid);
      if (invite.outbound) actions.append(button(m.busy ? 'Cancelling…' : 'Cancel invitation', () => controller.act('cancel', invite.id)));
      else {
        actions.append(button('Decline', () => controller.act('decline', invite.id)));
        const accept = button(own?.accepted ? 'Accepted · waiting for others' : m.busy ? 'Accepting…' : 'Accept & ready', () => controller.act('accept', invite.id), 'primary'); accept.disabled ||= !!own?.accepted; actions.append(accept);
      }
    } else if (!m.state?.active) {
      actions.append(button('Refresh players', refresh));
      const inviteButton = button(m.busy ? 'Sending…' : 'Invite players', () => controller.act('invite'), 'primary');
      inviteButton.disabled ||= !m.state?.available || ROLES.some(r => !m.selected[r]); actions.append(inviteButton);
    }
    dialog.append(actions); shade.append(dialog); root.append(shade); place(); countdown();
    const target = focusKey && [...root.querySelectorAll('[data-key]')].find(e => e.dataset.key === focusKey);
    (target || dismiss).focus({ preventScroll: true });
  }
  function countdown() {
    for (const e of root.querySelectorAll('[data-expires]')) e.textContent = `Invitation expires in ${Math.max(0, Math.ceil(Number(e.dataset.expires) - Date.now() / 1000))} seconds.`;
  }
  async function refresh() { await controller.refresh(); render(); }
  async function poll(token) {
    if (!enabled || token !== generation) return;
    await refresh();
    if (enabled && token === generation) timer = setTimeout(() => poll(token), visible || controller.invitations().length ? 2000 : 5000);
  }
  const launch = e => { open(e.detail?.opponentName); refresh(); };
  addEventListener('yo2-tag-lobby-open', launch); addEventListener('resize', place);
  const observer = new ResizeObserver(place); observer.observe(canvas);
  const countdownTimer = setInterval(countdown, 1000);
  root.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab' && visible) {
      const items = [...root.querySelectorAll('.yo2-tag-dialog button:not(:disabled),.yo2-tag-dialog select:not(:disabled)')];
      const i = items.indexOf(document.activeElement);
      if ((e.shiftKey && i <= 0) || (!e.shiftKey && i === items.length - 1)) { e.preventDefault(); items[e.shiftKey ? items.length - 1 : 0]?.focus(); }
    }
  });
  for (const event of ['keyup', 'keypress', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'wheel']) root.addEventListener(event, e => e.stopPropagation());
  return {
    frame(snap, isModern, wait) {
      const on = [10, 11].includes(snap.scene);
      modern = isModern; loading = wait;
      if (on !== enabled) {
        enabled = on; generation++; clearTimeout(timer);
        if (enabled) poll(generation); else { visible = false; preselect = ''; seen.clear(); controller.reset(); }
      }
      render();
    },
    destroy() { generation++; enabled = false; controller.reset(); clearTimeout(timer); clearInterval(countdownTimer); observer.disconnect(); removeEventListener('yo2-tag-lobby-open', launch); removeEventListener('resize', place); root.remove(); style.remove(); },
  };
}
