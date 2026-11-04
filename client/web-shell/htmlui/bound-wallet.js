// Shop currency help stays collapsed until requested. The native wallet remains the total MP.
let walletId = 0;
export function boundWallet(canvas, { fetcher = globalThis.fetch.bind(globalThis), now = Date.now } = {}) {
  const root = document.createElement('aside');
  root.className = 'yo2-bound-wallet'; root.hidden = true;
  root.style.cssText = 'position:fixed;z-index:34;pointer-events:none;transform-origin:top left;box-sizing:border-box;width:78px';
  const style = document.createElement('style');
  style.textContent = `
    .yo2-bound-wallet *{box-sizing:border-box}
    .yo2-bound-wallet button{pointer-events:auto;font:700 12px Arial,sans-serif;color:#123f70;border:1px solid #277ab7;border-radius:3px;background:linear-gradient(#f5ffff,#b5eaff 48%,#75c4ed);box-shadow:inset 0 1px #fff}
    .yo2-bound-wallet .wallet-toggle{width:78px;height:22px;padding:0 7px}
    .yo2-bound-wallet button:focus-visible{outline:2px solid #ffd961;outline-offset:2px}
    .yo2-bound-wallet .wallet-help{position:absolute;right:0;top:28px;width:280px;max-height:220px;overflow:auto;pointer-events:auto;padding:12px;border:2px solid #82ddf5;outline:1px solid #216eb0;border-radius:3px;background:linear-gradient(#ecfcff,#bdeafa);color:#123b62;font:13px/1.4 Arial,sans-serif;box-shadow:0 3px 10px #15436c66}
    .yo2-bound-wallet .wallet-help[hidden]{display:none}
    .yo2-bound-wallet header{display:flex;align-items:center;gap:8px;font-weight:700;padding-bottom:7px;border-bottom:1px solid #84b9d2}
    .yo2-bound-wallet header span{flex:1}
    .yo2-bound-wallet .wallet-close{width:22px;height:22px;padding:0;font-size:17px}
    .yo2-bound-wallet .wallet-balance{margin:9px 0;font-weight:700}
    .yo2-bound-wallet p{margin:0}
    html.mu-modern .yo2-bound-wallet .wallet-help{background:var(--plate);color:var(--ink-strong)}
  `;
  document.head?.append(style);
  const trigger = document.createElement('button'), panel = document.createElement('section');
  const header = document.createElement('header'), title = document.createElement('span'), close = document.createElement('button');
  const balance = document.createElement('div'), note = document.createElement('p');
  trigger.type = close.type = 'button'; trigger.className = 'wallet-toggle'; trigger.textContent = 'MP info';
  panel.id = `yo2-wallet-help-${++walletId}`; panel.className = 'wallet-help'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'MP and trading');
  trigger.setAttribute('aria-controls', panel.id); trigger.setAttribute('aria-expanded', 'false');
  title.textContent = 'MP and trading'; close.className = 'wallet-close'; close.textContent = '×'; close.setAttribute('aria-label', 'Close MP help');
  balance.className = 'wallet-balance'; header.append(title, close); panel.append(header, balance, note); root.append(trigger, panel); document.body.append(root);
  // This widget is outside the bridge layer; its DOM interactions must not also
  // reach SDL's window listeners and activate the native control behind it.
  for (const type of ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'mousemove', 'dblclick', 'contextmenu', 'wheel']) {
    root.addEventListener?.(type, e => e.stopPropagation());
  }
  let active = false, value = null, snapshot = null, pending = false, next = 0, nativeMP = null, generation = 0;
  let opened = false;
  const format = n => Number(n).toLocaleString('en-US');
  function setOpen(open, focus = false) {
    opened = open; panel.hidden = !open; trigger.setAttribute('aria-expanded', String(open));
    if (focus) (open ? close : trigger).focus?.();
  }
  trigger.onclick = () => setOpen(!opened, true);
  close.onclick = () => setOpen(false, true);
  const key = e => { if (opened && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false, true); } };
  const outside = e => { if (opened && !root.contains(e.target)) setOpen(false); };
  document.addEventListener?.('keydown', key, true);
  document.addEventListener?.('pointerdown', outside, true);
  function render() {
    const plate = snapshot?.tasks?.find(t => t.cls === 'CShopMileagePlate' && t.shown);
    root.hidden = !active || !plate;
    if (root.hidden) { setOpen(false); return; }
    balance.textContent = value ? `${format(value.total)} MP total · ${format(value.bound)} starter · ${format(value.earned)} earned` : 'Balance details unavailable';
    note.textContent = 'Starter MP is spent first. Any card, pack or deck paid partly with starter MP gives cards that cannot be traded. Cards bought entirely with earned MP can be traded.';
    const r = canvas.getBoundingClientRect(), scale = r.width / 1024 || 1;
    // Modern shop supplies its actual header position; Legacy follows the original wallet without covering it.
    const anchor = globalThis.yo2Html?.shopWalletAnchor;
    const x = Math.max(8, Math.min(938, Number.isFinite(anchor?.x) ? anchor.x : plate.x + (plate.w || 229) - 86));
    const y = Math.max(8, Math.min(738, Number.isFinite(anchor?.y) ? anchor.y : plate.y - 27));
    Object.assign(root.style, { left: `${r.left + x * scale}px`, top: `${r.top + y * scale}px`, transform: `scale(${scale})` });
    panel.style.top = y > 510 ? 'auto' : '28px'; panel.style.bottom = y > 510 ? '28px' : 'auto';
    // Keep expanded help inside the canvas even when its trigger is near the left edge.
    panel.style.right = `${Math.min(0, x + 78 - 288)}px`;
  }
  async function refresh() {
    pending = true;
    const gen = generation;
    next = now() + 10000;
    try {
      const response = await fetcher((globalThis.ENV?.YO2_DE_HTTP || '') + '/api/de/wallet', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json();
      if (gen !== generation) return;
      if (!response.ok || !['total', 'bound', 'earned'].every(k => Number.isSafeInteger(data[k]) && data[k] >= 0) || data.bound + data.earned !== data.total) {
        value = null; next = now() + 3000;
      } else value = data;
    } catch { if (gen === generation) { value = null; next = now() + 3000; } }
    finally { pending = false; render(); }
  }
  return {
    frame(snap) {
      snapshot = snap;
      if (snap.scene !== 14) {
        if (active) { generation++; value = null; nativeMP = null; next = 0; }
        active = false; render(); return;
      }
      active = true;
      const mp = snap.tasks?.find(t => t.cls === 'CShopMileagePlate' && t.shown)?.mp;
      if (mp !== nativeMP) { nativeMP = mp; next = 0; }
      if (!pending && now() >= next) void refresh();
      render();
    },
    destroy() {
      generation++; active = false;
      document.removeEventListener?.('keydown', key, true); document.removeEventListener?.('pointerdown', outside, true);
      root.remove(); style.remove();
    },
  };
}
