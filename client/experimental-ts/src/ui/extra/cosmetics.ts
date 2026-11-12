import type { BoxId, Cosmetic, CosmeticKind, CosmeticsState, OnlineAction, OnlineState, Rarity } from '../../features/online';

/** The shop's cosmetic departments (Cosmetic Boxes, Wardrobe) and the Main Menu's Appearance editor, after htmlui
 * cosmetic-shop.js: boxes are paid with earned MP only, every reward and catalogue item can be previewed on the
 * player's own avatar, only owned and wearable items can be equipped, and the server confirms each change. */
export type CosmeticsTab = 'boxes' | 'wardrobe';
export const WORLD_NAMES = ['Domino City', 'Duel Academy'] as const;
const KIND_NAMES: Readonly<Record<BoxId | CosmeticKind, string>> = { head: 'Head & Hair', hair: 'Hair', accessory: 'Accessories', dueldisk: 'Duel Disks', outfit: 'Outfits' };
const RARITY_NAMES: Readonly<Record<Rarity, string>> = { common: 'Common', rare: 'Rare', super: 'Super Rare', ultra: 'Ultra Rare' };
export interface CosmeticsDeps {
  dispatch(action: OnlineAction): void;
  /** The player's avatar wearing `parts`, or null without avatar art. */
  avatar: ((parts: number[], world: 0 | 1, key: string) => HTMLElement | null) | null;
  rerender(): void;
}
interface Ui { preview: { id: string; world: 0 | 1 } | null; query: string; kind: 'all' | BoxId; owned: 'all' | 'owned' | 'unowned'; draft: number[] | null; draftWorld: 0 | 1 | null; open: boolean; }
const ui: Ui = { preview: null, query: '', kind: 'all', owned: 'all', draft: null, draftWorld: null, open: false };
type El = HTMLElementTagNameMap;
function el<K extends keyof El>(tag: K, className = '', text = ''): El[K] { const n = document.createElement(tag); if (className) n.className = className; if (text) n.textContent = text; return n; }
function button(label: string, action: () => void, disabled = false, className = ''): HTMLButtonElement { const b = el('button', className, label); b.type = 'button'; b.disabled = disabled; b.onclick = action; return b; }
const fmt = (n: number) => n.toLocaleString('en-US');
const world01 = (n: number): 0 | 1 => n === 0 ? 0 : 1;
/** The item's variant for this body and world, if it can be worn there. */
export function wearable(item: Cosmetic, data: CosmeticsState, world: 0 | 1) { return item.variants.find(v => v.gender === data.appearance.gender && v.worlds.includes(world)); }
/** The current look with one item put on, for a preview; null when it cannot be worn in that body or world. */
export function tryOn(item: Cosmetic, data: CosmeticsState, world: 0 | 1): number[] | null {
  const v = wearable(item, data, world); if (!v) return null;
  const parts = [...data.appearance.looks[String(world) as '0' | '1']]; parts[item.slot] = v.number; return parts;
}
export const equipped = (item: Cosmetic, data: CosmeticsState, world: 0 | 1) => { const v = wearable(item, data, world); return !!v && data.appearance.looks[String(world) as '0' | '1'][item.slot] === v.number; };

function status(root: HTMLElement, online: OnlineState, deps: CosmeticsDeps): void {
  if (online.pending) root.append(Object.assign(el('p', 'de-note', 'Waiting for server confirmation…'), { role: 'status' }));
  if (online.error) { const e = el('p', 'de-error', online.error); e.setAttribute('role', 'alert'); root.append(e); }
  if (online.retryAction) root.append(el('p', 'de-note', 'Your previous request was not confirmed. Retrying sends the same request, so it is never charged twice.'), button('Retry same request', () => deps.dispatch(online.retryAction!), !!online.pending));
}
function walletLine(data: CosmeticsState): HTMLElement {
  const p = el('p', 'de-cosmetic-wallet'); p.dataset.key = 'cosmetic-wallet';
  p.append(el('strong', '', `${fmt(data.wallet.earned)} earned MP`), document.createTextNode(` · ${fmt(data.wallet.bound)} starter MP (cannot buy boxes) · ${fmt(data.wallet.total)} MP total`));
  return p;
}
function rarityBadge(r: Rarity): HTMLElement { const b = el('span', `de-rarity de-rarity-${r}`, RARITY_NAMES[r]); return b; }
function previewPane(data: CosmeticsState, deps: CosmeticsDeps): HTMLElement {
  const pane = el('aside', 'de-cosmetic-preview'); pane.dataset.key = 'cosmetic-preview'; pane.setAttribute('aria-label', 'Preview');
  const item = ui.preview && data.catalog.find(c => c.id === ui.preview!.id), world = ui.preview?.world ?? world01(data.appearance.world);
  const parts = item ? tryOn(item, data, world) : data.appearance.looks[String(world) as '0' | '1'];
  pane.append(el('h4', '', item ? `Preview: ${item.name}` : 'Your current look'));
  const art = parts && deps.avatar?.(parts, world, 'cosmetic-preview');
  if (art) { const frame = el('div', 'de-cosmetic-avatar'); frame.append(art); pane.append(frame); }
  else pane.append(el('p', 'de-note', item && !parts ? 'Not wearable in this body or world.' : 'Avatar art is unavailable.'));
  if (item) {
    pane.append(el('p', 'de-note', `${item.owned ? `In your wardrobe${item.copies > 1 ? ` · ×${item.copies}` : ''}` : 'Not owned'} · ${WORLD_NAMES[world]}`));
    if (item.owned && parts) pane.append(button(equipped(item, data, world) ? 'Equipped' : 'Equip now', () => deps.dispatch({ type: 'equip', id: item.id, world }), equipped(item, data, world)));
    pane.append(button('Back to current look', () => { ui.preview = null; deps.rerender(); }));
  }
  return pane;
}
function renderBoxes(data: CosmeticsState, online: OnlineState, deps: CosmeticsDeps): HTMLElement {
  const root = el('div', 'de-cosmetic-boxes');
  const reward = online.receipt?.action === 'open-box' ? online.receipt.cosmetics?.reward : undefined;
  if (reward) {
    const r = el('section', 'de-cosmetic-reward'); r.dataset.key = 'cosmetic-reward'; r.setAttribute('role', 'status');
    r.append(el('h3', '', 'Box reward'), el('strong', '', reward.name), rarityBadge(reward.rarity), el('p', 'de-note', reward.duplicate ? 'An extra copy: you can trade it.' : 'New in your wardrobe!'));
    const w = world01(data.appearance.world), owned = data.catalog.find(c => c.id === reward.id) ?? reward;
    r.append(button('Preview', () => { ui.preview = { id: reward.id, world: w }; deps.rerender(); }));
    if (wearable(owned, data, w)) r.append(button(equipped(owned, data, w) ? 'Equipped' : 'Equip now', () => deps.dispatch({ type: 'equip', id: reward.id, world: w }), equipped(owned, data, w) || !!online.pending));
    root.append(r);
  }
  for (const box of data.boxes) {
    const card = el('article', 'de-cosmetic-box'); card.dataset.key = `cosmetic-box:${box.id}`;
    const short = Math.max(0, box.price - data.wallet.earned);
    card.append(el('h3', '', box.name), el('strong', 'de-cosmetic-price', `${fmt(box.price)} earned MP`));
    const odds = el('p', 'de-note', `Odds for your next opening: ${(Object.entries(box.nextOdds) as [Rarity, number][]).filter(([, v]) => v > 0).map(([r, v]) => `${RARITY_NAMES[r]} ${v.toFixed(v % 1 ? 2 : 0)}%`).join(' · ')}`);
    const pity = el('p', 'de-note', `Super Rare guarantee progress: ${box.pity.superMisses}/${box.pity.superAt}${box.pity.ultraAt === null ? '' : ` · Ultra Rare: ${box.pity.ultraMisses}/${box.pity.ultraAt}`}`);
    card.append(odds, pity);
    const reason = !box.available ? 'This box cannot be opened right now.' : short ? `Needs ${fmt(short)} more earned MP. Starter MP cannot buy boxes.` : '';
    const open = button('Open box', () => deps.dispatch({ type: 'open-box', boxId: box.id }), !!reason || !!online.pending || !!online.retryAction, 'gold');
    card.append(open); if (reason) { const why = el('p', 'de-note de-cosmetic-reason', reason); why.dataset.key = `cosmetic-reason:${box.id}`; card.append(why); }
    const pool = el('details', 'de-cosmetic-pool'); pool.append(el('summary', '', `Rewards (${box.pool.length})`));
    const list = el('ul');
    for (const item of box.pool) {
      const li = el('li'); li.append(el('span', '', item.name), rarityBadge(item.rarity), el('span', 'de-note', `${item.nextChance.toFixed(2)}%${item.owned ? ' · Owned' : ''}`));
      li.append(button('Preview', () => { ui.preview = { id: item.id, world: world01(data.appearance.world) }; deps.rerender(); }, false, 'de-small')); list.append(li);
    }
    pool.append(list); card.append(pool); root.append(card);
  }
  return root;
}
function renderWardrobe(data: CosmeticsState, online: OnlineState, deps: CosmeticsDeps): HTMLElement {
  const root = el('div', 'de-cosmetic-wardrobe');
  const filters = el('div', 'de-row');
  const search = el('input'); search.type = 'search'; search.placeholder = 'Search by name'; search.value = ui.query; search.dataset.key = 'cosmetic-search'; search.setAttribute('aria-label', 'Search cosmetics');
  search.oninput = () => { ui.query = search.value.slice(0, 64); deps.rerender(); };
  const kind = el('select'); kind.dataset.key = 'cosmetic-kind'; kind.setAttribute('aria-label', 'Cosmetic type');
  for (const [v, l] of [['all', 'All types'], ...Object.entries(KIND_NAMES)]) { const o = el('option', '', l); o.value = v!; kind.append(o); }
  kind.value = ui.kind; kind.onchange = () => { ui.kind = kind.value as Ui['kind']; deps.rerender(); };
  const owned = el('select'); owned.dataset.key = 'cosmetic-owned'; owned.setAttribute('aria-label', 'Ownership');
  for (const [v, l] of [['all', 'Owned and not owned'], ['owned', 'In your wardrobe'], ['unowned', 'Not owned']]) { const o = el('option', '', l); o.value = v!; owned.append(o); }
  owned.value = ui.owned; owned.onchange = () => { ui.owned = owned.value as Ui['owned']; deps.rerender(); };
  filters.append(search, kind, owned); root.append(filters);
  const w = world01(data.appearance.world), q = ui.query.toLocaleLowerCase();
  const items = data.catalog.filter(c => (ui.kind === 'all' || c.kind === ui.kind) && (ui.owned === 'all' || (ui.owned === 'owned') === c.owned) && c.name.toLocaleLowerCase().includes(q));
  const grid = el('div', 'de-cosmetic-grid');
  for (const item of items) {
    const v = wearable(item, data, w), on = equipped(item, data, w);
    const tile = el('article', 'de-cosmetic-item'); tile.dataset.key = `cosmetic:${item.id}`; tile.dataset.owned = String(item.owned); tile.dataset.equipped = String(on);
    tile.append(el('strong', '', item.name), rarityBadge(item.rarity), el('span', 'de-note', `${KIND_NAMES[item.kind]} · ${item.owned ? `Owned${item.copies > 1 ? ` ×${item.copies}` : ''}` : 'Not owned'}${on ? ' · Equipped' : ''}`));
    const why = !item.owned ? 'You do not own this item.' : !v ? 'Not wearable in this body or world.' : on ? 'Already equipped.' : '';
    const equip = button(on ? 'Equipped' : 'Equip', () => deps.dispatch({ type: 'equip', id: item.id, world: w }), !!why || !!online.pending); equip.title = why;
    const actions = el('div', 'de-row'); actions.append(button('Preview', () => { ui.preview = { id: item.id, world: w }; deps.rerender(); }, false, 'de-small'), equip); tile.append(actions);
    grid.append(tile);
  }
  if (!items.length) grid.append(el('p', 'de-note', 'No cosmetics match.'));
  root.append(grid);
  const trades = el('details', 'de-cosmetic-trades'); trades.append(el('summary', '', `Cosmetic Trading (${data.trades.length})`));
  for (const offer of data.trades) {
    const row = el('div', 'de-row'); row.append(el('span', '', `${offer.fromName} → ${offer.toName}: gives ${offer.give.map(x => `${x.count} × ${data.catalog.find(c => c.id === x.id)?.name ?? x.id}`).join(', ')}; wants ${offer.want.map(x => `${x.count} × ${data.catalog.find(c => c.id === x.id)?.name ?? x.id}`).join(', ')}`));
    if (offer.outbound) row.append(button('Cancel offer', () => deps.dispatch({ type: 'trade-cancel', offerId: offer.id }), !!online.pending));
    else row.append(button('Accept trade', () => deps.dispatch({ type: 'trade-accept', offerId: offer.id }), !!online.pending), button('Decline', () => deps.dispatch({ type: 'trade-decline', offerId: offer.id }), !!online.pending));
    trades.append(row);
  }
  const form = el('form', 'de-row'), pick = (label: string, choices: [string, string][]) => { const s = el('select'); s.setAttribute('aria-label', label); for (const [v, l] of [['', label] as [string, string], ...choices]) { const o = el('option', '', l); o.value = v; s.append(o); } return s; };
  const target = pick('Choose a player', data.players.map(p => [String(p.pid), p.name])), give = pick('Your extra copy', data.catalog.filter(c => c.tradable > 0).map(c => [c.id, c.name])), want = pick('Request in return', data.catalog.map(c => [c.id, c.name]));
  const submit = el('button', '', 'Offer a cosmetic trade'); submit.type = 'submit'; submit.disabled = !!online.pending || !!online.retryAction;
  form.onsubmit = e => { e.preventDefault(); if (target.value && give.value && want.value) deps.dispatch({ type: 'trade', targetPid: Number(target.value), give: [{ id: give.value, count: 1 }], want: [{ id: want.value, count: 1 }], requestId: crypto.randomUUID() }); };
  form.append(target, give, want, submit); trades.append(form); root.append(trades);
  return root;
}
/** A shop department: Cosmetic Boxes or Wardrobe, with the preview beside it. */
export function renderCosmeticsShop(online: OnlineState, tab: CosmeticsTab, deps: CosmeticsDeps): HTMLElement {
  const root = el('section', `de-cosmetics de-cosmetics-${tab}`); root.setAttribute('aria-label', tab === 'boxes' ? 'Cosmetic Boxes' : 'Wardrobe'); root.dataset.key = `cosmetics-${tab}`;
  const data = online.cosmetics;
  if (!data) { root.append(el('p', 'de-note', online.loading ? 'Loading your wardrobe…' : 'Your wardrobe has not loaded.'), button('Refresh', () => deps.dispatch({ type: 'refresh' }), online.loading)); status(root, online, deps); return root; }
  root.append(walletLine(data)); status(root, online, deps);
  if (online.receipt?.action === 'equip' && online.receipt.cosmetics?.equipped) root.append(Object.assign(el('p', 'de-note', 'Equipped. Saved on the server.'), { role: 'status' }));
  const body = el('div', 'de-cosmetics-body');
  body.append(tab === 'boxes' ? renderBoxes(data, online, deps) : renderWardrobe(data, online, deps), previewPane(data, deps));
  root.append(body); return root;
}

/** The Main Menu's Appearance window: body type, each part the character owns, a live preview, Apply and Revert. */
// the Main Menu's Appearance editor is retired: Change Avatar is main's screens/avatar.js (htmlui/avatar.ts)

export const COSMETICS_CSS = `
.de-cosmetics { display:flex; flex-direction:column; gap:8px; min-height:0; flex:1; }
.de-cosmetic-wallet { margin:0; color:#123f70; }
.de-cosmetics-body { display:grid; grid-template-columns:1fr 220px; gap:10px; min-height:0; flex:1; }
.de-cosmetic-boxes, .de-cosmetic-wardrobe { overflow:auto; min-height:0; display:flex; flex-direction:column; gap:8px; }
.de-cosmetic-boxes { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); align-content:start; }
.de-cosmetic-box, .de-cosmetic-item, .de-cosmetic-reward, .de-cosmetic-preview { background:#effcff; border:1px solid #75a8c5; padding:8px; display:flex; flex-direction:column; gap:5px; min-width:0; }
.de-cosmetic-reward { grid-column:1/-1; border:2px solid #f3c64a; background:linear-gradient(#fffbe5,#fff1b8); }
.de-cosmetic-price { color:#123f70; }
.de-cosmetic-reason { color:#a33; }
.de-cosmetic-pool ul { list-style:none; margin:4px 0 0; padding:0; max-height:160px; overflow:auto; }
.de-cosmetic-pool li { display:flex; gap:6px; align-items:center; font-size:12px; padding:2px 0; }
.de-cosmetic-pool li>span:first-child { flex:1; }
.de-cosmetic-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:8px; }
.de-cosmetic-item[data-equipped=true] { border-color:#2f9a53; box-shadow:inset 0 0 0 1px #2f9a53; }
.de-cosmetic-item[data-owned=false] { opacity:.86; }
.de-rarity { align-self:flex-start; font-size:11px; font-weight:bold; padding:1px 6px; border-radius:8px; color:#fff; background:#7a8a99; }
.de-rarity-rare { background:#2f7fd0; } .de-rarity-super { background:#b043c9; } .de-rarity-ultra { background:linear-gradient(90deg,#d18b00,#f5d142,#d18b00); color:#3a2500; }
.de-client button.de-small { padding:2px 8px; font-size:12px; }
.de-cosmetic-avatar { display:flex; justify-content:center; align-items:flex-end; min-height:180px; background:radial-gradient(ellipse at 50% 85%,#bfefff,#e8fbff 70%); border:1px solid #9cc8dc; }
.de-cosmetic-avatar { position:relative; height:200px; }
.de-cosmetic-avatar .de-avatar-view { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
.de-appearance { position:absolute; inset:0; z-index:30; display:flex; align-items:center; justify-content:center; background:rgba(4,20,50,.45); }
.de-appearance>.de-panel { width:min(720px,94%); max-height:94%; overflow:auto; }
.de-appearance-columns { display:grid; grid-template-columns:220px 1fr; gap:12px; }
.de-appearance-form { display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; align-content:start; }
.de-appearance-form label { display:flex; flex-direction:column; font-size:12px; gap:2px; }
.de-appearance-form>.de-row, .de-appearance-form>p { grid-column:1/-1; }
@media (max-width:700px) { .de-cosmetics-body, .de-appearance-columns { grid-template-columns:1fr; } }
`;
