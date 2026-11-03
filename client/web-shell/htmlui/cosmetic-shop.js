import { cosmeticShopController, matchingItems, BOX_NAMES, RARITY_NAMES } from './cosmetic-shop-model.js';
import { readPackMetadata, readAvatarMetadata } from './read/shop-catalog.js';
import VT from './vtables.js';
import { cosmeticArtPath } from './cosmetic-preview.js';
import { CARD_RARITY_LABELS, rarityBadge } from './card-rarity.js';
import { shopAssetBytes } from './shop-assets.js';
import { art as cardArt } from './svelte/modern/deck/pictures.js';
import { getNativeAppearanceHeap } from './native-appearance.js';

export const openCosmetics = (tab = 'boxes') => globalThis.dispatchEvent(new CustomEvent('yo2-cosmetics-open', { detail: { tab } }));
const SAFE_SCENES = new Set([10, 11, 12, 14]);
const fmt = n => Number(n || 0).toLocaleString();
const WORLD_NAMES = ['Domino City', 'Duel Academy'];
const itemWorlds = (item, gender) => [...new Set((item.variants || []).filter(v => v.gender === gender).flatMap(v => v.worlds || []))].sort();
const TITLES = { boxes: 'Cosmetic Boxes', wardrobe: 'Wardrobe', trades: 'Cosmetic Trading', packs: 'Packs & Decks', singles: 'Single Cards', accessories: 'Accessories' };
const ICONS = {
  outfit: '<path d="M7 5 3 8l3 5 2-1v11h12V12l2 1 3-5-4-3-4 2h-6Z"/><path d="m11 7 3 6 3-6M14 13v10"/>',
  dueldisk: '<path d="m3 18 4-4 15-3 3 5-5 5-13 2Z"/><path d="m8 15 2 5m3-6 2 5m3-6 2 5M4 19l3 4"/>',
  hair: '<path d="M6 20C0 9 8 2 14 4c7-3 13 5 8 15l-3-8-4 3-3-5-5 9Z"/><path d="M8 20c2 7 10 7 12-1"/>',
  pack: '<path d="M7 3h15v22H7Zm-3 3v22h15M8 7h13M8 21h13"/><path d="m14 10 4 5-4 5-4-5Z"/>',
};
const CSS = `
.yo2-cosmetics{position:fixed;z-index:70;width:1024px;height:768px;transform-origin:0 0;pointer-events:none;font:14px Arial,sans-serif;color:#14365b}.yo2-cosmetics[hidden]{display:none}.yo2-cosmetics *{box-sizing:border-box}.yo2-cosmetics button,.yo2-cosmetics input,.yo2-cosmetics select{font:inherit}.yo2-cosmetics button{cursor:pointer}.yo2-cosmetics button:disabled{opacity:.5;cursor:default}.yo2-cosmetics :focus-visible{outline:3px solid #ffda54;outline-offset:2px}.cs-shade{position:absolute;inset:0;background:#06305e66;display:grid;place-items:center;pointer-events:auto}.cs-panel{width:904px;height:664px;background:linear-gradient(#ecfffff5,#bee9f4f5);border:4px solid #e9ffff;outline:1px solid #226c9d;box-shadow:inset 2px 2px #fff,inset -2px -2px #7fabbf,0 7px 26px #08385c80;display:flex;flex-direction:column;border-radius:3px;overflow:hidden}.cs-head{min-height:50px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:7px 12px;border-bottom:2px solid #1661a2;background:linear-gradient(#c9ffff,#51c4ef 22%,#168bcf 60%,#0868af);color:#fff;text-shadow:0 1px #14528c}.cs-head h2{margin:0;font-size:22px;letter-spacing:.02em}.cs-head .cs-wallet{font-size:13px;text-align:right;line-height:1.45}.cs-wallet strong{color:#fff7ba;font-size:15px}.cs-btn{min-height:30px;border:1px solid #327bb1;border-radius:3px;background:linear-gradient(#fff,#bdeeff 48%,#7ec8ed 51%,#64b5e0);box-shadow:inset 0 1px #fff,0 1px #286b97;padding:5px 12px;color:#123a64;font-weight:700!important}.cs-btn:hover{filter:brightness(1.08)}.cs-btn.primary{background:linear-gradient(#fffed8,#ffed83 47%,#efc352 51%,#e8a73a);border-color:#aa7821;color:#4d360b}.cs-btn.close{font-size:22px;min-width:30px;padding:0;line-height:24px}.cs-body{display:flex;flex:1;min-height:0}.cs-nav{width:151px;flex:none;border-right:2px solid #72a8c6;background:linear-gradient(90deg,#d4f5ff,#a6d9ed);padding:12px 8px;display:flex;flex-direction:column;gap:9px}.cs-nav .cs-btn{text-align:left;min-height:37px;padding-left:10px}.cs-nav .active{background:linear-gradient(#55beed,#0a6cbd);color:#fff;border-color:#18599a;text-shadow:0 1px #114f8e}.cs-nav hr{width:100%;border:0;border-top:1px solid #80b5cc;margin:3px 0}.cs-main{flex:1;min-width:0;display:flex;flex-direction:column;padding:12px;gap:10px}.cs-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.cs-tools input,.cs-tools select,.cs-trade input,.cs-trade select{min-height:31px;border:1px solid #659bbd;border-radius:2px;background:#f4ffff;color:#14365b;padding:5px 8px}.cs-tools input{min-width:120px;flex:1}.cs-content{min-height:0;overflow:auto;flex:1;padding:2px 4px 8px 2px;scrollbar-color:#458ec0 #d5f3ff;scrollbar-width:thin}.cs-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.cs-tile{position:relative;display:flex;flex-direction:column;min-width:0;border:1px solid #6e9fbd;background:linear-gradient(#f4ffff,#c9eaf6);box-shadow:inset 0 1px #fff,0 1px #8db8cd;padding:9px;gap:6px;overflow:hidden;border-radius:2px}.cs-tile h3{margin:0;font-size:14px;line-height:1.25;min-height:35px}.cs-tile .cs-meta{font-size:11px;color:#355c79;line-height:1.4}.cs-picture{height:90px;display:grid;place-items:center;background:radial-gradient(ellipse,#99e7fa80,#b5dcea00);position:relative;overflow:hidden}.cs-picture svg{width:72px;height:72px;stroke:#17649c;stroke-width:1.5;fill:#dcf8ff;filter:drop-shadow(2px 3px 1px #457f9955)}.cs-picture img{max-width:100%;max-height:100%;object-fit:contain}.cs-tile .cs-bottom{margin-top:auto;display:flex;align-items:center;gap:6px;justify-content:space-between}.cs-bottom input{width:45px;height:28px}.cs-price{font-weight:700;white-space:nowrap}.cs-rarity{align-self:flex-start;font-size:11px;font-weight:700;letter-spacing:.025em;text-transform:uppercase;color:#4b6575}.cs-rarity[data-rarity=rare]{color:#087590}.cs-rarity[data-rarity=super]{color:#8246ae}.cs-rarity[data-rarity=ultra]{color:#9f6600}.cs-tile[data-rarity=rare]{border-top:3px solid #169ab4}.cs-tile[data-rarity=super]{border-top:3px solid #a15cc4}.cs-tile[data-rarity=ultra]{border-top:3px solid #daaa39}.cs-status{font-size:12px;line-height:1.4;margin:0;min-height:18px}.cs-status.error{color:#a72726;background:#fff0eb;border:1px solid #c68d7c;padding:6px}.cs-status.notice{color:#176143;background:#effff6;border:1px solid #83b79e;padding:6px}.cs-note{font-size:12px;line-height:1.4;margin:0;color:#345c78}.cs-empty{padding:26px 14px;text-align:center;line-height:1.6;color:#3b6682}.cs-boxes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.cs-boxes .cs-picture{height:134px}.cs-boxes .cs-picture svg{width:92px;height:92px}.cs-boxes .cs-tile{padding:12px}.cs-boxes h3{min-height:0;font-size:17px}.cs-boxes p{margin:0;font-size:12px;line-height:1.5}.cs-pity{font-size:12px;padding:7px;border:1px solid #a3c7dc;background:#eafaff}.cs-pity progress{width:100%;height:8px;accent-color:#a46bca}.cs-pool-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.cs-pool-head h3{margin:0;font-size:18px}.cs-odds{display:flex;flex-wrap:wrap;gap:7px 14px;padding:9px;background:#d5eefb;border:1px solid #8fbcd5;font-size:12px;margin-bottom:10px}.cs-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;border-top:1px solid #76aaca;background:#b5deed;font-size:12px}.cs-reveal{position:absolute;inset:0;display:grid;place-items:center;background:#052c53d9;pointer-events:auto;z-index:5}.cs-reveal-card{width:340px;border:3px solid #f8e6a1;outline:1px solid #9c7023;border-radius:3px;background:linear-gradient(#eaffff,#a7dcf0);padding:23px;text-align:center;box-shadow:0 0 50px #8ad8ff55;animation:cs-reveal-in .22s ease-out}.cs-reveal-card .cs-rarity{display:block}.cs-reveal-card h3{font-size:21px;line-height:1.3}.cs-reveal-card .cs-picture{height:150px}.cs-reveal-card .cs-picture svg{height:120px;width:120px}.cs-reveal-card p{line-height:1.5}.cs-actions{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.cs-reveal-card .cs-actions{justify-content:center}.cs-trade{border:1px solid #87b4ce;background:#e8f8ff;padding:12px;margin-bottom:12px}.cs-trade label{display:block;margin:8px 0 4px;font-size:12px}.cs-trade .cs-actions{margin-top:12px}.cs-offer{padding:10px 0;border-bottom:1px solid #9fc9dc}.cs-offer h3{font-size:14px;margin:0 0 6px}.cs-offer p{font-size:12px}.cs-menu-link{position:absolute;pointer-events:auto;display:flex;flex-direction:column;gap:7px;width:150px}.cs-menu-link[hidden]{display:none}.cs-menu-link .cs-btn{min-height:32px;text-align:left}.cs-detail{display:flex;align-items:center;gap:12px;padding:10px;border-bottom:1px solid #a4c9db}.cs-detail h3{margin:0}.cs-owned{color:#167447;font-weight:700;font-size:11px}.cs-pool-item{cursor:pointer}.cs-panel details summary{cursor:pointer;font-size:12px;font-weight:700}.cs-panel details p{font-size:12px;line-height:1.5}.cs-shade[hidden],.cs-reveal[hidden]{display:none}.cs-kind{font-size:12px;color:#355b75}.cs-small{font-size:11px}.cs-panel .disabled-reason{color:#754a15;font-size:11px}.cs-confirm{border:1px solid #d0a344;background:#fff9d9;padding:13px;line-height:1.5}.cs-confirm .cs-actions{margin-top:10px}
@keyframes cs-reveal-in{from{transform:scale(.96);opacity:.4}to{transform:scale(1);opacity:1}}@media(prefers-reduced-motion:reduce){.cs-reveal-card{animation:none}}
.cs-appearance{border:1px solid #8ab7cf;padding:10px;margin-bottom:12px;background:#e8f8ff}.cs-appearance .cs-note{margin-bottom:8px}.cs-appearance details{margin-top:10px}.cs-appearance-fields{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.cs-appearance-fields label{font-size:12px}.cs-appearance-fields select{display:block;width:100%;margin-top:3px;padding:5px;color:#14365b;background:#f5ffff;border:1px solid #76a6c4;border-radius:2px}html.mu-modern .cs-panel{background:var(--plate);border-color:var(--plate-hi)}html.mu-modern .cs-head{background:var(--band)}html.mu-modern .cs-btn{background:var(--btn);color:var(--ink-strong)}html.mu-modern .cs-btn.primary{background:var(--gold);color:var(--gold-ink)}
`;

const element = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const button = (label, action, cls = '') => { const e = element('button', 'cs-btn ' + cls, label); e.type = 'button'; e.addEventListener('click', action); return e; };
const badge = rarity => { if (Object.hasOwn(CARD_RARITY_LABELS, rarity)) return rarityBadge(rarity); const e = element('span', 'cs-rarity', RARITY_NAMES[rarity] || rarity || ''); e.dataset.rarity = rarity || ''; return e; };
function icon(kind) {
  const picture = element('div', 'cs-picture');
  picture.innerHTML = `<svg viewBox="0 0 28 28" aria-hidden="true">${ICONS[kind] || ICONS.pack}</svg>`;
  return picture;
}
function metadata(item) {
  try {
    if (item.internalId) {
      const name = globalThis.yo2Deck?.card?.(item.internalId)?.name;
      if (name) return { ...item, name };
      if (item.name) return item;
    }
    const buffer = getNativeAppearanceHeap()?.buffer || globalThis.Module?.HEAPU8?.buffer; if (!buffer) return item;
    const d = new DataView(buffer), h = { u8: p => d.getUint8(p), u32: p => d.getUint32(p, true), ptr: p => d.getUint32(p + 4, true), cls: p => VT[d.getUint32(p, true)]?.[0] };
    const native = item.kind === 1 ? readPackMetadata(h, item.param ?? item.prm) : item.kind === 2 ? readAvatarMetadata(h, item.param ?? item.prm) : null;
    return native ? { ...native, ...item, name: item.name || native.name } : item;
  } catch { return item; }
}
const assetURLs = new Map();
async function itemPicture(node, item, appearance) {
  const cosmeticPath = cosmeticArtPath(item, appearance?.gender);
  if (cosmeticPath && !item.image) item = { ...item, image: cosmeticPath, cosmeticPreview: true };
  if (!item.image && !item.internalId) return;
  try {
    let url = item.internalId ? await cardArt(item.internalId) : assetURLs.get(item.image);
    if (!url && item.image) {
      const path = String(item.image).replaceAll('\\', '/');
      const data = await shopAssetBytes(path.startsWith('data/') ? path : 'data/cardpack/' + path);
      if (data?.length) { url = URL.createObjectURL(new Blob([data])); assetURLs.set(item.image, url); }
    }
    if (url && node.isConnected) { const img = element('img'); img.alt = item.name || ''; img.src = url; node.replaceChildren(img); }
  } catch { /* The icon and item name remain if the picture is not available. */ }
}

export function cosmeticShop(canvas, { request, onVisibility = () => {} } = {}) {
  const root = element('div', 'yo2-cosmetics'); root.hidden = true; root.dataset.modernOwned = '';
  const style = element('style'); style.textContent = CSS + '\nhtml.yo2-cosmetics-open .yo2-bound-wallet{display:none}';
  document.head.append(style); document.body.append(root);
  let enabled = false, visible = false, modern = false, blocked = false, snapshot = null, api = null, shopEntryPending = true;
  let tab = 'boxes', kind = 'all', query = '', rarity = 'all', selectedBox = null, confirming = null, wardrobeWorld = null, draftGender = null, draftParts = null;
  let oldFocus = null, renderKey = '', poll = null, disposed = false, contentKey = '';
  const tradesForm = { targetPid: 0, giveId: '', giveCount: 1, wantId: '', wantCount: 1 };
  const controller = cosmeticShopController({ request, changed: () => render() });
  const imageJobs = new WeakMap();
  const imageObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { imageObserver.unobserve(entry.target); const job = imageJobs.get(entry.target); if (job) void itemPicture(entry.target, ...job); }
  }, { rootMargin: '160px' }) : null;
  const queuePicture = (node, item, appearance) => { if (!imageObserver) void itemPicture(node, item, appearance); else { imageJobs.set(node, [item, appearance]); imageObserver.observe(node); } };
  const place = () => {
    const r = canvas.getBoundingClientRect();
    Object.assign(root.style, { left: r.left + 'px', top: r.top + 'px', transform: `scale(${r.width / 1024 || 1})` });
  };
  const observer = new ResizeObserver(place); observer.observe(canvas); addEventListener('resize', place); place();
  const status = (text, type = '') => { const p = element('p', 'cs-status ' + type, text); p.setAttribute(type === 'error' ? 'role' : 'aria-live', type === 'error' ? 'alert' : 'polite'); return p; };
  const close = () => {
    if (controller.state.busy) return;
    visible = false; confirming = null; controller.dismissReveal();
    document.documentElement.classList.remove('yo2-cosmetics-open'); onVisibility(false); clearTimeout(poll); render();
    if (oldFocus?.isConnected) oldFocus.focus({ preventScroll: true });
    if (snapshot?.scene === 14 && typeof api?.click === 'function') void api.click(0, [850, 565]);
  };
  const open = async (next = 'boxes') => {
    if (!enabled || blocked) return false;
    oldFocus = document.activeElement; visible = true; selectedBox = null; confirming = null;
    tab = Object.hasOwn(TITLES, next) ? next : 'wardrobe'; query = ''; rarity = kind = 'all'; wardrobeWorld = draftGender = draftParts = null;
    document.documentElement.classList.add('yo2-cosmetics-open'); onVisibility(true); render();
    await controller.refresh({ shop: tab === 'packs' || tab === 'singles' || tab === 'accessories' || snapshot?.scene === 14 });
    schedulePoll(); return true;
  };
  const schedulePoll = () => {
    clearTimeout(poll);
    if (!visible || disposed) return;
    poll = setTimeout(async () => { if (visible && !controller.state.busy) await controller.refresh({ shop: tab === 'packs' || tab === 'singles' || tab === 'accessories' }); schedulePoll(); }, tab === 'trades' ? 4000 : 15000);
  };
  const switchTab = async next => {
    tab = next; selectedBox = null; confirming = null; query = ''; rarity = kind = 'all'; render();
    if ((next === 'packs' || next === 'singles' || next === 'accessories') && !controller.state.shop) await controller.refresh({ shop: true });
    else if (next === 'wardrobe' || next === 'trades' || next === 'boxes') await controller.refresh();
    schedulePoll();
  };
  const labelledSelect = (options, value, change, focusKey) => {
    const select = element('select'); select.dataset.focus = focusKey;
    for (const [v, text] of options) { const option = element('option', '', text); option.value = v; select.append(option); }
    select.value = String(value); select.addEventListener('change', () => change(select.value)); return select;
  };
  const wallet = () => controller.state.cosmetics?.wallet || controller.state.shop?.wallet || {};
  const shownAppearance = (world = tab === 'wardrobe' ? wardrobeWorld ?? controller.state.cosmetics?.appearance?.world : controller.state.cosmetics?.appearance?.world) => {
    const appearance = controller.state.cosmetics?.appearance;
    const parts = appearance?.looks?.[String(world)] || appearance?.parts;
    return { ...appearance, world, parts, gender: (tab === 'wardrobe' && draftGender) || (parts?.[0] === 1 ? 'female' : parts?.[0] === 0 ? 'male' : appearance?.gender) };
  };
  const allCosmetics = () => [...new Map([...(controller.state.cosmetics?.catalog || []), ...(controller.state.cosmetics?.boxes || []).flatMap(b => b.pool || []), ...(controller.state.cosmetics?.inventory || [])].map(i => [i.id, i])).values()];
  const itemName = id => allCosmetics().find(i => i.id === id)?.name || id;
  const compatible = (item, world = shownAppearance().world) => (!item.variants?.length || item.variants.some(v =>
    v.gender === shownAppearance(world).gender && (v.worlds || [0, 1]).includes(world)));
  function tools(container, { categories = false } = {}) {
    const row = element('div', 'cs-tools'), search = element('input'); search.type = 'search'; search.placeholder = 'Search by name'; search.setAttribute('aria-label', 'Search items'); search.value = query; search.dataset.focus = 'search';
    search.addEventListener('input', () => { query = search.value; render(); }); row.append(search);
    if (categories) row.append(labelledSelect([['all', 'All appearances'], ['outfit', 'Outfits'], ['hair', 'Hair'], ['dueldisk', 'Duel disks']], kind, v => { kind = v; render(); }, 'kind'));
    if (tab === 'packs') row.append(labelledSelect([['all', 'Packs & decks'], ['packs', 'Booster packs'], ['decks', 'Structure decks']], kind, v => { kind = v; render(); }, 'pack-kind'));
    const rarities = tab === 'singles' ? [['N', 'N · Common'], ['R', 'R · Rare'], ['SR', 'SR · Super Rare'], ['UR', 'UR · Ultra Rare']] : Object.entries(RARITY_NAMES);
    if (tab === 'accessories') row.append(labelledSelect([['all', 'Current body'], ['male', 'Male styles'], ['female', 'Female styles']], kind, v => { kind = v; render(); }, 'accessory-body'));
    if (tab !== 'packs' && tab !== 'accessories') row.append(labelledSelect([['all', 'All rarities'], ...rarities], rarity, v => { rarity = v; render(); }, 'rarity'));
    container.append(row);
  }
  function cosmeticTile(item, { pool = false } = {}) {
    const card = element('article', 'cs-tile'); card.dataset.rarity = item.rarity || 'common';
    card.append(badge(item.rarity), icon(item.kind), element('h3', '', item.name || item.id));
    const appearance = shownAppearance();
    const picture = card.querySelector('.cs-picture'); queuePicture(picture, item, appearance);
    const meta = element('div', 'cs-meta');
    const worlds = itemWorlds(item, appearance.gender);
    if (worlds.length) meta.append(element('div', '', `Wear in: ${worlds.map(w => WORLD_NAMES[w]).join(' / ')}`));
    const nativeStyle = item.variants?.find(v => v.gender === appearance.gender)?.name;
    if (nativeStyle && nativeStyle !== item.name) meta.append(element('div', '', nativeStyle));
    if (pool && Number.isFinite(item.nextChance)) meta.append(element('div', '', `Next opening: ${Number(item.nextChance).toLocaleString(undefined, { maximumFractionDigits: 3 })}% · base ${Number(item.baseChance || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}%`));
    if (item.owned) meta.append(element('span', 'cs-owned', 'In your wardrobe'));
    if (item.copies) meta.append(element('div', '', `${fmt(item.copies)} tradable ${item.copies === 1 ? 'copy' : 'copies'}`));
    if (item.variants?.some(v => v.gender !== appearance.gender)) meta.append(element('div', '', 'Includes equivalent body styles'));
    card.append(meta);
    const actions = element('div', 'cs-bottom');
    if (item.owned) {
      const savedGender = appearance.parts?.[0] === 1 ? 'female' : 'male';
      const equip = button('Equip', async () => { draftParts = null; await controller.equip(item.id, tab === 'wardrobe' ? wardrobeWorld ?? undefined : undefined); }, 'primary'); equip.disabled = controller.state.busy || controller.state.loading || !compatible(item) || !!(tab === 'wardrobe' && draftGender && draftGender !== savedGender) || controller.state.cosmetics?.available === false; actions.append(equip);
      if (!compatible(item)) card.append(element('span', 'disabled-reason', 'Not wearable in this body or world'));
    } else if (pool) actions.append(element('span', 'cs-small', 'Box reward'));
    if (item.copies > 0) actions.append(button('Trade', () => { tradesForm.giveId = item.id; void switchTab('trades'); }));
    card.append(actions); return card;
  }
  function boxes(content) {
    const state = controller.state.cosmetics;
    if (!state) { content.append(element('p', 'cs-empty', controller.state.loading ? 'Loading cosmetic boxes…' : 'The cosmetic shop is unavailable. Use Refresh to try again.')); return; }
    if (selectedBox) {
      const box = state.boxes?.find(b => b.id === selectedBox); if (!box) { selectedBox = null; boxes(content); return; }
      const head = element('div', 'cs-pool-head'); head.append(element('h3', '', box.name || BOX_NAMES[box.id]), button('Back to boxes', () => { selectedBox = null; query = ''; render(); })); content.append(head);
      const odds = element('div', 'cs-odds');
      for (const [key, value] of Object.entries(box.nextOdds || {})) if (value > 0) odds.append(element('span', '', `${RARITY_NAMES[key] || key}: ${Number(value).toFixed(Number.isInteger(value) ? 0 : 1)}%`));
      odds.setAttribute('aria-label', 'Odds for your next opening'); content.append(odds);
      const note = element('p', 'cs-note', 'Odds shown are for your next opening, including any guarantee. Every opening grants one item; duplicate copies can be traded.'); content.append(note);
      const eligibility = boxEligibility(box); if (eligibility) content.append(element('p', 'cs-pity', eligibility));
      const grid = element('div', 'cs-grid');
      for (const item of matchingItems(box.pool, { query, rarity })) grid.append(cosmeticTile(item, { pool: true }));
      if (!grid.childElementCount) grid.append(element('p', 'cs-empty', 'No matching items. Try another name or rarity.'));
      content.append(grid); return;
    }
    const grid = element('div', 'cs-boxes');
    for (const box of state.boxes || []) {
      const card = element('article', 'cs-tile'); card.append(icon(box.id), element('h3', '', box.name || BOX_NAMES[box.id]));
      card.append(element('p', '', `One ${box.id === 'outfit' ? 'complete outfit' : box.id === 'dueldisk' ? 'duel disk' : 'hairstyle'} from this box. Keep it, equip it, or trade extra copies.`));
      const eligibility = boxEligibility(box); if (eligibility) card.append(element('p', 'cs-note', eligibility));
      const pity = element('div', 'cs-pity');
      const untilSuper = Math.max(1, Number(box.pity?.superAt || 10) - Number(box.pity?.superMisses || 0));
      pity.append(element('div', '', `Super Rare+ within ${untilSuper} ${untilSuper === 1 ? 'opening' : 'openings'}`));
      const progress = element('progress'); progress.max = box.pity?.superAt || 10; progress.value = box.pity?.superMisses || 0; progress.setAttribute('aria-label', 'Super Rare guarantee progress'); pity.append(progress);
      if (box.pity?.ultraAt) { const left = Math.max(1, box.pity.ultraAt - (box.pity.ultraMisses || 0)); pity.append(element('div', '', `Ultra Rare within ${left} ${left === 1 ? 'opening' : 'openings'}`)); }
      card.append(pity, button('View all rewards & odds', () => { selectedBox = box.id; render(); }));
      const line = element('div', 'cs-bottom'); line.append(element('span', 'cs-price', `${fmt(box.price)} MP`));
      const recovering = controller.hasPendingOpen(box.id);
      const buy = button(controller.state.busy ? 'Opening…' : recovering ? 'Recover result' : 'Open box', () => { if (recovering) void controller.open(box.id); else { confirming = { box }; render(); } }, 'primary');
      buy.dataset.focus = 'open-' + box.id; buy.disabled = controller.state.busy || controller.state.loading || state.available === false || box.available === false || (!recovering && (state.wallet?.earned || 0) < box.price); line.append(buy); card.append(line);
      if (!recovering && (state.wallet?.earned || 0) < box.price) card.append(element('span', 'disabled-reason', `Need ${fmt(box.price - (state.wallet?.earned || 0))} more earned MP`));
      grid.append(card);
    }
    content.append(grid);
  }
  function boxEligibility(box) {
    const appearance = controller.state.cosmetics?.appearance;
    const pool = box.pool || [];
    if (!appearance || !pool.length) return '';
    const restricted = pool.some(item => itemWorlds(item, appearance.gender).length === 1);
    if (!restricted) return '';
    const labels = [...new Set(pool.flatMap(item => itemWorlds(item, appearance.gender)))].sort().map(w => WORLD_NAMES[w]);
    let text = box.id === 'outfit' ? 'Primarily Domino City outfits. Save your Domino City look in Wardrobe and visit Domino City to wear it.' : `Contains styles for ${labels.join(' and ')}. Each reward lists where it can be worn.`;
    if (pool.every(item => Number.isFinite(item.nextChance))) {
      const chance = pool.filter(item => itemWorlds(item, appearance.gender).includes(appearance.world)).reduce((sum, item) => sum + item.nextChance, 0);
      text += ` Your next opening has a ${Number(chance.toFixed(3))}% chance of a style wearable in ${WORLD_NAMES[appearance.world]}.`;
    }
    return text;
  }
  function wardrobe(content) {
    const state = controller.state.cosmetics, appearance = state?.appearance;
    if (appearance) {
      const world = wardrobeWorld ?? appearance.world, look = appearance.looks?.[String(world)] || appearance.parts;
      const gender = draftGender || (look?.[0] === 1 ? 'female' : look?.[0] === 0 ? 'male' : appearance.gender);
      const editor = element('div', 'cs-appearance');
      editor.append(element('p', 'cs-note', 'Each outfit unlock includes its matching body styles. Change your look here without returning to Your Room.'));
      const controls = element('div', 'cs-tools');
      controls.append(labelledSelect([['0', 'Domino City look'], ['1', 'Duel Academy look']], world, value => { wardrobeWorld = Number(value); draftParts = draftGender = null; render(); }, 'appearance-world'));
      const bodies = labelledSelect([['male', 'Male body'], ['female', 'Female body']], gender, value => { draftGender = value; draftParts = null; render(); }, 'appearance-body'); bodies.setAttribute('aria-label', 'Body type'); controls.append(bodies);
      const change = button('Apply body', async () => { const value = draftGender || gender; draftParts = draftGender = null; await controller.appearance({ world, gender: value }); }, 'primary'); change.disabled = controller.state.busy || controller.state.loading || state.available === false; controls.append(change); editor.append(controls);
      const sections = state.appearanceOptionsByWorld?.[String(world)] || appearance.options || state.appearanceOptions || [];
      if (sections.length) {
        const details = element('details'), summary = element('summary', '', 'Face, hair and colours'); details.append(summary);
        const fields = element('div', 'cs-appearance-fields');
        for (const section of sections) {
          const options = section.choices || section.options || []; if (!options.length) continue;
          const index = section.index ?? section.slot;
          const label = element('label', '', section.label || section.name || 'Feature');
          const select = labelledSelect(options.map(o => {
            const nativeName = index <= 9 ? metadata({ kind: 2, param: (gender === 'female' ? 256 : 0) + Number(o.value) }).name : '';
            return [o.value, nativeName || o.label || o.name || String(o.value)];
          }), (draftParts || look)?.[index], value => { draftParts ||= [...look]; draftParts[index] = Number(value); }, 'appearance-' + index);
          select.setAttribute('aria-label', section.label || section.name || 'Appearance feature'); select.disabled = controller.state.busy || controller.state.loading || !!(draftGender && draftGender !== (look?.[0] === 1 ? 'female' : 'male')); label.append(select); fields.append(label);
        }
        details.append(fields);
        const save = button('Save appearance', async () => { if (!draftParts) return; const parts = [...draftParts]; draftParts = null; await controller.appearance({ world, parts }); }, 'primary'); save.disabled = controller.state.busy || controller.state.loading || state.available === false;
        details.append(save); editor.append(details);
      }
      content.append(editor);
    }
    const grid = element('div', 'cs-grid');
    for (const item of matchingItems(state?.inventory, { query, rarity, kind, owned: true })) grid.append(cosmeticTile(item));
    if (!grid.childElementCount) grid.append(element('p', 'cs-empty', query || kind !== 'all' || rarity !== 'all' ? 'No matching owned appearances.' : 'Your unlocked appearances will appear here. Open a cosmetic box or keep using your free starter look.'));
    content.append(grid);
  }
  function cardShop(content) {
    const source = controller.state.shop;
    if (!source) { content.append(element('p', 'cs-empty', controller.state.loading ? 'Loading the card shop…' : 'Card shop unavailable. Use Refresh to try again.')); return; }
    const accessoryGender = kind === 'all' ? controller.state.cosmetics?.appearance?.gender : kind;
    const items = (source.items || []).filter(i => i.kind === (tab === 'packs' ? 1 : tab === 'accessories' ? 2 : 0) && (tab !== 'packs' || kind === 'all' || i.category === kind)
      && (tab !== 'accessories' || !accessoryGender || Math.floor(Number(i.param ?? i.prm) / 256) === (accessoryGender === 'female' ? 1 : 0))).map(metadata);
    const missingNames = items.filter(item => item.kind !== 0 && !item.name);
    if (missingNames.length) content.append(element('p', 'cs-note', 'Visit the Card Shop in town to load the full pack and accessory catalogue, then browse here. Products without loaded names are hidden so you can see what you are buying.'));
    const grid = element('div', 'cs-grid');
    for (const item of matchingItems(items.filter(item => item.kind === 0 || item.name), { query, rarity })) {
      const card = element('article', 'cs-tile'), name = item.name || (item.kind === 1 ? `Pack ${item.param ?? item.prm}` : tab === 'accessories' ? `Accessory ${item.param ?? item.prm}` : `Card ${item.param ?? item.prm}`);
      card.dataset.rarity = item.rarity || ''; const picture = icon('pack'); card.append(picture, element('h3', '', name)); queuePicture(picture, item);
      if (item.rarity) card.append(badge(item.rarity));
      const line = element('div', 'cs-bottom'), count = element('input'); count.type = 'number'; count.min = '1'; count.max = '50'; count.value = '1'; count.setAttribute('aria-label', 'Quantity of ' + name);
      line.append(element('span', 'cs-price', `${fmt(item.price ?? item.cost)} MP`)); if (tab !== 'accessories') line.append(count);
      if (item.kind === 2 && item.owned) card.append(element('span', 'cs-owned', 'Already owned'));
      const buy = button('Buy', () => { const n = Number(count.value); if (Number.isSafeInteger(n) && n > 0 && n <= 50) { confirming = { item, count: n, name }; render(); } else { controller.state.error = 'Choose a quantity from 1 to 50.'; render(); } }, 'primary');
      buy.disabled = controller.state.busy || controller.state.loading || source.available === false || (item.kind === 2 && item.owned) || (Number(item.price ?? item.cost) > Number(source.wallet?.total ?? wallet().total ?? 0)); line.append(buy); card.append(line); grid.append(card);
    }
    if (!grid.childElementCount) grid.append(element('p', 'cs-empty', missingNames.length ? 'Enter the Card Shop to browse these products. Cosmetic Boxes and Wardrobe are available from any town or your room.' : 'No matching cards or packs.'));
    content.append(element('p', 'cs-note', tab === 'accessories' ? `${items.length} accessories · unlock once for the selected body. Find equipped options in Appearance.` : `${items.length} products · scroll to browse, or search by name. Starter MP can buy cards; items funded by it stay personal.`), grid);
  }
  function tradeView(content) {
    const s = controller.state.cosmetics;
    if (!s) { content.append(element('p', 'cs-empty', 'Loading cosmetic trades…')); return; }
    const form = element('div', 'cs-trade'); form.append(element('h3', '', 'Offer a cosmetic trade'));
    const players = (s.players || []).filter(p => p.pid !== s.selfPid);
    const extra = (s.inventory || []).filter(i => i.copies > 0);
    const fields = [
      ['Player', [['0', 'Choose a player'], ...players.map(p => [p.pid, p.name])], 'targetPid', Number],
      ['Your extra copy', [['', 'Choose a duplicate'], ...extra.map(i => [i.id, `${i.name} · ${i.copies} available`])], 'giveId', String],
      ['Request in return', [['', 'Nothing in return (gift)'], ...allCosmetics().filter(i => !i.owned || i.id !== tradesForm.giveId).map(i => [i.id, i.name])], 'wantId', String],
    ];
    for (const [title, choices, key, convert] of fields) { form.append(element('label', '', title), labelledSelect(choices, tradesForm[key], value => { tradesForm[key] = convert(value); render(); }, 'trade-' + key)); }
    const giveCount = element('input'); giveCount.type = 'number'; giveCount.min = '1'; giveCount.max = String(extra.find(i => i.id === tradesForm.giveId)?.copies || 1); giveCount.value = String(tradesForm.giveCount); giveCount.setAttribute('aria-label', 'Copies to offer'); giveCount.dataset.focus = 'trade-count'; giveCount.addEventListener('input', () => { tradesForm.giveCount = Math.max(1, Math.floor(Number(giveCount.value) || 1)); }); form.append(element('label', '', 'Copies to offer'), giveCount);
    const actions = element('div', 'cs-actions');
    const offer = button('Review offer', () => { confirming = { trade: { ...tradesForm }, name: players.find(p => p.pid === tradesForm.targetPid)?.name || 'this player' }; render(); }, 'primary');
    offer.disabled = controller.state.busy || controller.state.loading || !tradesForm.targetPid || !extra.some(i => i.id === tradesForm.giveId && i.copies >= tradesForm.giveCount); actions.append(offer); form.append(actions);
    if (!extra.length) form.append(element('p', 'cs-note', 'Only extra cosmetic copies can be offered. Your wardrobe unlocks are kept.'));
    if (!players.length) form.append(element('p', 'cs-note', 'No other players are available for a cosmetic trade right now.'));
    content.append(form);
    for (const trade of s.trades || []) {
      const outbound = trade.outbound ?? trade.fromPid === s.selfPid, offer = element('section', 'cs-offer');
      offer.append(element('h3', '', outbound ? `Your offer to ${trade.toName || 'a player'}` : `Offer from ${trade.fromName || 'a player'}`));
      const names = rows => (rows || []).map(i => `${itemName(i.id)} ×${i.count}`).join(', ') || 'Nothing';
      offer.append(element('p', '', `Offered: ${names(trade.give)}. Requested: ${names(trade.want)}.`));
      if (!trade.status || trade.status === 'pending') {
        const actions = element('div', 'cs-actions');
        if (!outbound) actions.append(button('Accept trade', () => { confirming = { accept: trade }; render(); }, 'primary'));
        actions.append(button(outbound ? 'Cancel offer' : 'Decline', () => controller.tradeAction('cancel', trade.id)));
        offer.append(actions);
      } else offer.append(element('p', 'cs-note', trade.status));
      content.append(offer);
    }
  }
  function confirmation(content) {
    const panel = element('div', 'cs-confirm'); panel.setAttribute('role', 'alertdialog'); panel.setAttribute('aria-label', 'Confirm transaction');
    if (confirming.box) {
      panel.append(element('strong', '', `Open ${confirming.box.name || BOX_NAMES[confirming.box.id]} for ${fmt(confirming.box.price)} earned MP?`), element('p', '', 'You receive one random item. Duplicates become tradable copies. Starter MP will not be spent.'));
      const eligibility = boxEligibility(confirming.box); if (eligibility) panel.append(element('p', 'cs-pity', eligibility));
    }
    else if (confirming.item) panel.append(element('strong', '', `Buy ${confirming.name} ×${confirming.count} for ${fmt((confirming.item.price ?? confirming.item.cost) * confirming.count)} MP?`));
    else if (confirming.trade) panel.append(element('strong', '', `Offer ${itemName(confirming.trade.giveId)} ×${confirming.trade.giveCount} to ${confirming.name}?`), element('p', '', confirming.trade.wantId ? `Request: ${itemName(confirming.trade.wantId)} ×1. The other player must accept.` : 'This is a gift: you are requesting nothing in return.'));
    else if (confirming.accept) panel.append(element('strong', '', `Accept the cosmetic trade from ${confirming.accept.fromName || 'this player'}?`), element('p', '', 'The listed extra copies are exchanged together. Your permanent wardrobe unlocks are retained.'));
    const actions = element('div', 'cs-actions'); actions.append(button('Cancel', () => { confirming = null; render(); }));
    const yes = button(controller.state.busy ? 'Working…' : 'Confirm', async () => {
      const c = confirming; confirming = null;
      if (c.box) await controller.open(c.box.id);
      else if (c.item) await controller.buy(c.item.id ?? c.item.iid, c.count);
      else if (c.trade) await controller.offerTrade(c.trade.targetPid, [{ id: c.trade.giveId, count: c.trade.giveCount }], c.trade.wantId ? [{ id: c.trade.wantId, count: 1 }] : []);
      else if (c.accept) await controller.tradeAction('accept', c.accept.id);
    }, 'primary'); yes.disabled = controller.state.busy || controller.state.loading; actions.append(yes); panel.append(actions); content.append(panel);
  }
  function render() {
    if (disposed) return;
    imageObserver?.disconnect();
    const key = document.activeElement?.dataset?.focus, selection = key === 'search' ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    const nextContentKey = `${tab}:${selectedBox || ''}:${!!confirming}`;
    const oldScroll = contentKey === nextContentKey ? root.querySelector('.cs-content')?.scrollTop || 0 : 0;
    contentKey = nextContentKey;
    const appearanceExpanded = !!root.querySelector('.cs-appearance details')?.open;
    root.replaceChildren(); root.hidden = !enabled || blocked || (!visible && (modern || !snapshot?.windows?.some(w => w.cls === 'CMainMenu' && w.shown)));
    if (root.hidden) return;
    if (!visible) {
      const menu = snapshot.windows.find(w => w.cls === 'CMainMenu' && w.shown);
      const links = element('nav', 'cs-menu-link'); links.setAttribute('aria-label', 'Appearance shortcuts');
      const commands = (menu.controls || []).filter(c => c.shown && c.cls === 'CWindowTaskButtonMain');
      const right = commands.length ? Math.max(...commands.map(c => (c.wx ?? (menu.x || 0) + c.x) + c.w)) : (menu.x || 6) + (menu.w || 282);
      const top = commands.length ? Math.min(...commands.map(c => c.wy ?? (menu.y || 0) + c.y)) : menu.y || 420;
      Object.assign(links.style, { left: Math.min(850, right + 8) + 'px', top: Math.max(40, Math.min(620, top)) + 'px' });
      links.append(button('Appearance', () => open('wardrobe')), button('Cosmetic Boxes', () => open('boxes'))); root.append(links); return;
    }
    const shade = element('div', 'cs-shade'), panel = element('section', 'cs-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', TITLES[tab]);
    const header = element('header', 'cs-head'); header.append(element('h2', '', selectedBox ? BOX_NAMES[selectedBox] : TITLES[tab]));
    const funds = element('div', 'cs-wallet'), w = wallet(); funds.append(element('div', '', `Total MP ${fmt(w.total)} · Starter ${fmt(w.bound)}`), element('strong', '', `Earned MP ${fmt(w.earned)}`)); header.append(funds);
    const exit = button('×', close, 'close'); exit.setAttribute('aria-label', 'Close shop'); exit.disabled = controller.state.busy || controller.state.loading; header.append(exit); panel.append(header);
    const body = element('div', 'cs-body'), nav = element('nav', 'cs-nav'); nav.setAttribute('aria-label', 'Shop categories');
    for (const [id, title] of Object.entries(TITLES)) { if (id === 'packs') nav.append(element('hr')); const b = button(title, () => switchTab(id), tab === id ? 'active' : ''); b.setAttribute('aria-pressed', String(tab === id)); b.dataset.focus = 'nav-' + id; nav.append(b); }
    body.append(nav);
    const main = element('div', 'cs-main');
    if (tab === 'wardrobe' || selectedBox || tab === 'packs' || tab === 'singles' || tab === 'accessories') tools(main, { categories: tab === 'wardrobe' });
    if (controller.state.error) main.append(status(controller.state.error, 'error'));
    if (controller.state.notice) main.append(status(controller.state.notice, 'notice'));
    if (controller.state.cosmetics?.available === false) main.append(status(controller.state.cosmetics.reason || 'Finish your current activity before changing appearance or opening boxes.'));
    const content = element('div', 'cs-content'); content.dataset.focus = 'content';
    if (confirming) confirmation(content);
    else if (tab === 'boxes') boxes(content);
    else if (tab === 'wardrobe') wardrobe(content);
    else if (tab === 'trades') tradeView(content);
    else cardShop(content);
    main.append(content); body.append(main); panel.append(body);
    const footer = element('footer', 'cs-footer'); footer.append(element('span', '', controller.state.loading ? 'Refreshing…' : tab === 'boxes' ? 'Earned MP only · every box gives one cosmetic' : 'Scroll or search to find an item—no page hunting.'));
    const footerActions = element('div', 'cs-actions'); footerActions.append(button('Refresh', () => controller.refresh({ shop: tab === 'packs' || tab === 'singles' || tab === 'accessories' })), button('Back to game', close)); footer.append(footerActions); panel.append(footer); shade.append(panel); root.append(shade);
    content.scrollTop = oldScroll;
    const appearanceDetails = root.querySelector('.cs-appearance details'); if (appearanceDetails) appearanceDetails.open = appearanceExpanded;
    const reward = controller.state.reveal;
    if (reward) {
      const cover = element('div', 'cs-reveal'), card = element('section', 'cs-reveal-card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Box reward'); card.dataset.rarity = reward.rarity || '';
      card.append(badge(reward.rarity), icon(reward.kind || 'outfit'), element('h3', '', reward.name || reward.id), element('p', '', reward.duplicate ? 'Duplicate! Your extra copy is ready to trade.' : 'New appearance unlocked for your wardrobe.'));
      queuePicture(card.querySelector('.cs-picture'), reward, controller.state.cosmetics?.appearance);
      const actions = element('div', 'cs-actions');
      if (!reward.duplicate && compatible(reward)) actions.append(button('Equip now', async () => { controller.dismissReveal(); await controller.equip(reward.id); }, 'primary'));
      actions.append(button('Done', () => controller.dismissReveal())); card.append(actions); cover.append(card); root.append(cover);
    }
    const focus = key && [...root.querySelectorAll('[data-focus]')].find(e => e.dataset.focus === key);
    if (focus) { focus.focus({ preventScroll: true }); if (selection) focus.setSelectionRange?.(...selection); }
    else if (!root.contains(document.activeElement)) (root.querySelector('.cs-reveal button') || exit).focus({ preventScroll: true });
  }
  const launch = e => { void open(e.detail?.tab || 'wardrobe'); };
  addEventListener('yo2-cosmetics-open', launch);
  root.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); if (controller.state.reveal) controller.dismissReveal(); else if (confirming) { confirming = null; render(); } else close(); }
    if (e.key === 'Tab' && visible) {
      const box = root.querySelector('.cs-reveal') || root.querySelector('.cs-panel'), nodes = [...box.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')];
      const i = nodes.indexOf(document.activeElement);
      if (nodes.length && (e.shiftKey && i <= 0 || !e.shiftKey && i === nodes.length - 1)) { e.preventDefault(); nodes[e.shiftKey ? nodes.length - 1 : 0].focus(); }
    }
  });
  for (const event of ['keyup', 'keypress', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'contextmenu']) root.addEventListener(event, e => e.stopPropagation());
  return {
    controller, root, open, close, isOpen: () => visible,
    frame(snap, isModern, wait, gameApi) {
      snapshot = snap; api = gameApi; modern = isModern; blocked = !!wait;
      const nextEnabled = SAFE_SCENES.has(snap.scene);
      if (enabled && !nextEnabled) { controller.reset(); close(); }
      enabled = nextEnabled;
      // The first shop frame usually arrives under the scene loader. Open only
      // after it clears; otherwise open() refuses once and the shop never appears.
      if (snap.scene !== 14) shopEntryPending = true;
      if (enabled && snap.scene === 14 && !blocked && shopEntryPending) {
        shopEntryPending = false; void open('packs');
      }
      const key = [snap.scene, modern, blocked, enabled, visible, ...snap.windows?.filter(w => w.cls === 'CMainMenu').map(w => `${w.id}:${w.shown}:${w.x}:${w.y}`) || []].join('|');
      if (key !== renderKey) { renderKey = key; render(); }
    },
    destroy() { disposed = true; clearTimeout(poll); observer.disconnect(); imageObserver?.disconnect(); removeEventListener('resize', place); removeEventListener('yo2-cosmetics-open', launch); document.documentElement.classList.remove('yo2-cosmetics-open'); root.remove(); style.remove(); controller.reset(); },
  };
}
