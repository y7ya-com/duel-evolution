// The four-person relay roster stays visible throughout the duel; a team's pilot steps forward each turn.
export function tagRelayHud(canvas) {
  const root = document.createElement('aside');
  root.className = 'yo2-relay'; root.hidden = true; root.setAttribute('aria-label', 'Tag relay teams');
  const style = document.createElement('style');
  style.textContent = `.yo2-relay{position:fixed;z-index:32;pointer-events:none;width:1024px;height:768px;transform-origin:top left;color:#fff;font:600 12px system-ui}.yo2-relay[hidden]{display:none}.yo2-relay-team{position:absolute;top:76px;width:185px;display:flex;flex-direction:column;gap:5px}.yo2-relay-team:first-child{left:12px}.yo2-relay-team:last-child{right:12px;text-align:right}.yo2-relay-member{border-radius:9px;padding:7px 10px;background:#15273bd9;opacity:.58;transform:translateY(-3px) scale(.91);transition:transform .25s,opacity .25s;box-shadow:0 2px 9px #0005}.yo2-relay-member[data-active=true]{opacity:1;transform:translateY(3px) scale(1);background:#214f6ce8;outline:1px solid #e2c77b;z-index:1}.yo2-relay-member small{display:block;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#e6d29c}.yo2-relay-member strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`;
  style.textContent += `html.mu-modern .yo2-relay{font:700 13px Arial,sans-serif}html.mu-modern .yo2-relay-member{border:1px solid #2676b4;border-radius:3px;background:linear-gradient(#a6ddf5e8,#73b8e0e8);opacity:.78;color:#194673;box-shadow:inset 0 1px #dfffff,0 2px 4px #123d6255}html.mu-modern .yo2-relay-member[data-active=true]{background:linear-gradient(#59b6f1,#1a72c3);color:#fff;outline:1px solid #fff2a7;box-shadow:inset 0 1px #b5edff,0 2px 4px #13447766}html.mu-modern .yo2-relay-member small{font-size:10px;letter-spacing:0;color:inherit}html.mu-modern .yo2-relay-member[data-active=true] small{color:#fff4b0}`;
  document.head.append(style); document.body.append(root);
  let state = null, scene = 0;
  function place() { const r = canvas.getBoundingClientRect(); Object.assign(root.style, { left: `${r.left}px`, top: `${r.top}px`, transform: `scale(${r.width / 1024})` }); }
  function render() {
    root.hidden = !state || scene !== 28;
    if (root.hidden) return;
    root.replaceChildren();
    for (let team = 0; team < 2; team++) {
      const group = document.createElement('div'); group.className = 'yo2-relay-team';
      for (let i = 0; i < 2; i++) {
        const member = document.createElement('div'), name = document.createElement('strong'), role = document.createElement('small');
        member.className = 'yo2-relay-member'; member.dataset.active = String(state.active[team] === i);
        name.textContent = state.names[2 * team + i];
        role.textContent = state.active[team] === i ? (state.self === 255 ? 'Team pilot' : team ? 'Opponent playing' : state.self === i ? 'You are playing' : 'Partner playing') : 'Tag partner';
        member.append(name, role); group.append(member);
      }
      root.append(group);
    }
    place();
  }
  addEventListener('yo2-tag-relay', e => { state = e.detail; render(); });
  addEventListener('resize', place); new ResizeObserver(place).observe(canvas);
  return { scene(to) { scene = to; if ([4, 6, 7, 10, 12].includes(to)) { state = null; globalThis.__yo2TagRelay = null; } render(); } };
}
