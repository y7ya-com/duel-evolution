import assert from 'node:assert/strict';
import { boundWallet } from './bound-wallet.js';
const elements = [], listeners = new Map();
const el = tag => ({ tag, style: {}, hidden: true, children: [], attributes: {},
  setAttribute(k, v) { this.attributes[k] = v; }, append(...nodes) { this.children.push(...nodes); },
  contains(n) { return n === this || this.children.some(c => c.contains(n)); }, focus() { this.focused = true; }, remove() {},
});
globalThis.document = {
  createElement: el, body: { append(n) { elements.push(n); } },
  addEventListener(type, f) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(f); },
  removeEventListener(type, f) { listeners.get(type)?.delete(f); },
};
const emit = (type, event) => { for (const f of listeners.get(type) || []) f(event); };
const canvas = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 1024 }) };
let time = 1, requests = 0, result = { total: 5200, bound: 5000, earned: 200 }, resolve;
const hud = boundWallet(canvas, { now: () => time, fetcher: async () => { requests++; return { ok: true, json: async () => result }; } });
const snap = mp => ({ scene: 14, tasks: [{ cls: 'CShopMileagePlate', shown: true, x: 795, y: 390, w: 229, h: 128, mp }] });
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
hud.frame({ scene: 11 }); assert.equal(requests, 0);
hud.frame(snap(5200)); await settle();
const root = elements[0], [trigger, panel] = root.children, [header, balance, note] = panel.children, close = header.children[1];
assert.equal(root.hidden, false);
assert.equal(panel.hidden, true, 'starter MP explanation never opens by itself');
assert.equal(trigger.textContent, 'MP info');
assert.equal(root.style.top, '383px', 'small trigger sits above the native wallet');
assert.match(balance.textContent, /5,000 starter/);
assert.match(note.textContent, /cannot be traded/);
trigger.onclick(); assert.equal(panel.hidden, false); assert.equal(trigger.attributes['aria-expanded'], 'true');
assert.equal(close.focused, true);
hud.frame(snap(5200)); assert.equal(requests, 1, 'no requests each frame'); assert.equal(panel.hidden, false);
let prevented = false;
emit('keydown', { key: 'Escape', preventDefault() { prevented = true; }, stopPropagation() {} });
assert(prevented); assert.equal(panel.hidden, true); assert.equal(trigger.focused, true);
trigger.onclick(); emit('pointerdown', { target: close }); assert.equal(panel.hidden, false, 'inside interaction keeps help open');
emit('pointerdown', { target: el('canvas') }); assert.equal(panel.hidden, true, 'outside click dismisses help');
trigger.onclick(); close.onclick(); assert.equal(panel.hidden, true);
result = { total: 200, bound: 0, earned: 200 };
hud.frame(snap(200)); await settle();
assert.equal(requests, 2, 'refresh after shop balance changes');
assert.match(balance.textContent, /0 starter · 200 earned/);
assert.match(note.textContent, /can be traded/);
// Modern shop chooses a compact position in its own balance header.
globalThis.yo2Html = { shopWalletAnchor: { x: 896, y: 135 } };
hud.frame(snap(200)); assert.equal(root.style.left, '906px'); assert.equal(root.style.top, '155px');
delete globalThis.yo2Html;
trigger.onclick(); hud.frame({ scene: 11 }); assert.equal(root.hidden, true); assert.equal(panel.hidden, true);
hud.frame({ scene: 14, tasks: [] }); assert.equal(root.hidden, true, 'no floating help when native wallet is not visible');
// A delayed response from the previous character/shop cannot populate a new scene.
const late = boundWallet(canvas, { now: () => time, fetcher: () => new Promise(r => { resolve = r; }) });
late.frame(snap(200)); late.frame({ scene: 4 });
resolve({ ok: true, json: async () => result }); await settle();
assert.equal(elements[1].hidden, true);
// Invalid balances fail quietly, without a permanent warning or invented amounts.
result = { total: 100, bound: 80, earned: 80 };
time += 20000; hud.frame(snap(100)); await settle();
assert.equal(root.hidden, false); assert.equal(panel.hidden, true);
assert.equal(balance.textContent, 'Balance details unavailable');
hud.destroy(); late.destroy();
assert.equal(listeners.get('keydown').size, 0); assert.equal(listeners.get('pointerdown').size, 0);
console.log('bound-wallet_test: ok');
