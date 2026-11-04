// Display metadata only: passcodes and native card IDs are separate namespaces.
// The server owns the catalogue; missing entries never silently become Common.
export const CARD_RARITY_LABELS = { N: 'Common', R: 'Rare', SR: 'Super Rare', UR: 'Ultra Rare' };
export const CARD_RARITY_COLORS = { N: '#e3e9ef', R: '#72d8ff', SR: '#d5a0ff', UR: '#ffdc72' };
const valid = code => Object.hasOwn(CARD_RARITY_LABELS, code);
const listeners = new Set();
let byId = new Map(), byPasscode = new Map(), revision = 0, pending = null, ready = false, retryAt = 0;

function table(input) {
  return new Map(Object.entries(input && typeof input === 'object' ? input : {})
    .filter(([key, code]) => /^[1-9]\d*$/.test(key) && Number.isSafeInteger(Number(key)) && valid(code))
    .map(([key, code]) => [Number(key), code]));
}
export function setRarityCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object' || !catalog.byInternalId || !catalog.byPasscode) throw new Error('Invalid card rarity catalogue');
  byId = table(catalog.byInternalId); byPasscode = table(catalog.byPasscode); ready = true; revision++;
  for (const listener of listeners) listener(revision);
  return revision;
}
export const rarityForInternalId = id => byId.get(Number(id)) ?? null;
export const rarityForPasscode = passcode => byPasscode.get(Number(passcode)) ?? null;
export const rarityRevision = () => revision;
export const raritiesReady = () => ready;
export function subscribeRarities(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function loadRarities(fetcher = globalThis.fetch) {
  if (ready) return Promise.resolve(true);
  if (pending) return pending;
  if (typeof fetcher !== 'function' || Date.now() < retryAt) return Promise.resolve(false);
  pending = Promise.resolve().then(() => fetcher('/api/de/card-rarities', { credentials: 'same-origin' }))
    .then(response => { if (!response.ok) throw new Error('Card rarity catalogue unavailable'); return response.json(); })
    .then(catalog => { setRarityCatalog(catalog); return true; })
    .catch(() => { retryAt = Date.now() + 15000; return false; })
    .finally(() => { pending = null; });
  return pending;
}

const CSS = `.de-card-rarity{display:inline-flex;align-items:center;justify-content:center;min-width:23px;height:16px;padding:0 4px;border:1px solid currentColor;border-radius:3px;background:#12293de8;color:#e3e9ef;font:700 10px/1 system-ui;letter-spacing:.3px;text-shadow:0 1px #000;box-shadow:0 1px 3px #0008;white-space:nowrap;pointer-events:none;box-sizing:border-box}.de-card-rarity[data-rarity=R]{color:#72d8ff}.de-card-rarity[data-rarity=SR]{color:#d5a0ff}.de-card-rarity[data-rarity=UR]{color:#ffdc72}.de-card-rarity-layer{position:absolute;inset:0;pointer-events:none;z-index:900}.de-card-rarity-layer>.de-card-rarity{position:absolute}`;
export function installRarityStyles(doc = globalThis.document) {
  if (!doc || doc.getElementById('de-card-rarity-style')) return;
  const style = doc.createElement('style'); style.id = 'de-card-rarity-style'; style.textContent = CSS; doc.head.append(style);
}
export function rarityBadge(code, doc = globalThis.document) {
  if (!valid(code) || !doc) return null;
  installRarityStyles(doc);
  const badge = doc.createElement('span'); badge.className = 'de-card-rarity'; badge.dataset.rarity = code;
  badge.textContent = code; badge.title = CARD_RARITY_LABELS[code]; badge.setAttribute('aria-label', `Card rarity: ${CARD_RARITY_LABELS[code]}`);
  return badge;
}

const CARD_CONTROLS = new Set(['CWindowTaskDeckCard', 'CWindowTaskKabanListBtn', 'CWindowTaskTradeCard', 'CWindowTaskTpCard']);
// Geometry comes from the native reader. A custom Modern editor uses its own Svelte badges instead.
export function rarityOverlayPlan(win, { modernEditor = false, modernInspector = false } = {}) {
  if (!win?.shown || modernEditor && /CWindowModel(Deck|Kaban)/.test(win.cls) || modernInspector && win.cls === 'CCardDetailViewDlg') return [];
  const plan = [];
  if (win.cls === 'CCardDetailViewDlg' && win.card > 0) {
    const code = rarityForInternalId(win.card);
    const picture = win.mode === 0 || win.mode === 3;
    if (code) plan.push({ key: `detail-${win.id}`, code, x: picture ? 12 : 212, y: picture ? 28 : 3 });
  }
  for (const c of win.controls || []) {
    if (!CARD_CONTROLS.has(c.cls) || !c.shown || c.dragging || !(c.card > 0)) continue;
    const code = rarityForInternalId(c.card);
    if (!code) continue;
    const x = (Number.isFinite(c.wx) ? c.wx : (win.x || 0) + (c.x || 0)) - (win.x || 0) + 3;
    const y = (Number.isFinite(c.wy) ? c.wy : (win.y || 0) + (c.y || 0)) - (win.y || 0) + 3;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < -4 || y < -4 || x > (win.w || 1024) || y > (win.h || 768)) continue;
    plan.push({ key: String(c.id), code, x, y });
  }
  return plan;
}
export function updateCardRarityOverlay(snapshot, doc = globalThis.document) {
  if (!doc || !snapshot) return;
  void loadRarities(); installRarityStyles(doc);
  const windows = new Map((snapshot.windows || []).map(win => [String(win.id), win]));
  const modernEditor = !!doc.querySelector('.mu.ed'), modernInspector = !!doc.querySelector('.mu.inspector');
  for (const root of doc.querySelectorAll('.win[data-window-id]')) {
    const plan = rarityOverlayPlan(windows.get(root.dataset.windowId), { modernEditor, modernInspector });
    let layer = root.querySelector(':scope > .de-card-rarity-layer');
    if (!plan.length) { layer?.remove(); delete root.dataset.raritySignature; continue; }
    const signature = JSON.stringify(plan);
    if (layer && root.dataset.raritySignature === signature) continue;
    if (!layer) { layer = doc.createElement('div'); layer.className = 'de-card-rarity-layer'; root.append(layer); }
    layer.replaceChildren(...plan.map(item => {
      const badge = rarityBadge(item.code, doc); badge.dataset.cardControl = item.key;
      badge.style.left = `${item.x}px`; badge.style.top = `${item.y}px`; return badge;
    }));
    root.dataset.raritySignature = signature;
  }
}
