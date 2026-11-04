import { cosmeticShopController, matchingItems, BOX_NAMES, RARITY_NAMES } from './cosmetic-shop-model.js';
import { readPackMetadata, readAvatarMetadata } from './read/shop-catalog.js';
import VT from './vtables.js';
import { cosmeticArtPath } from './cosmetic-preview.js';
import { CARD_RARITY_LABELS, rarityBadge } from './card-rarity.js';
import { shopAssetBytes } from './shop-assets.js';
import { art as cardArt } from './card-pictures.js';
import { getNativeAppearanceHeap } from './native-appearance.js';

export const openCosmetics = (tab = 'wardrobe') => globalThis.dispatchEvent(new CustomEvent('yo2-cosmetics-open', { detail: { tab } }));
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
/* Shop furniture follows the original store: silver glass, cyan title/key art,
   a separate MP plate, and the original shopkeeper silhouettes around it. */
.yo2-cosmetics{position:fixed;z-index:70;width:1024px;height:768px;transform-origin:0 0;pointer-events:none;font:14px Arial,sans-serif;color:#172125}
.yo2-cosmetics[hidden]{display:none}.yo2-cosmetics *{box-sizing:border-box}.yo2-cosmetics button,.yo2-cosmetics input,.yo2-cosmetics select{font:inherit}.yo2-cosmetics button{cursor:pointer}.yo2-cosmetics button:disabled{opacity:.45;cursor:default}.yo2-cosmetics :focus-visible{outline:2px solid #fff58c;outline-offset:2px}
.cs-shade{position:absolute;inset:0;background:transparent;pointer-events:auto}
.cs-panel{position:absolute;left:280px;top:84px;width:512px;height:512px;display:flex;flex-direction:column;background:rgba(222,230,228,.86);border:4px solid #fafdf9;box-shadow:inset 3px 3px 2px #9faeb0,inset -3px -3px 2px #c4ceca,1px 1px 1px #7f8b85;overflow:visible}
.cs-head{position:absolute;left:-14px;right:0;top:-46px;height:36px;pointer-events:none;display:flex;align-items:center}
.cs-head h2{width:318px;max-width:100%;margin:0;border:1px solid #184137;box-shadow:inset 0 0 0 1px #63faff,inset 0 -4px #0d939d,inset 0 -7px #91f8fd;background:linear-gradient(#56ddf6 0%,#3fc2e7 35%,#33a7c9 52%,#45d8ee 55%,#3bb6d9 77%,#61ddf7 80%,#47b8cf);color:#fff;font:bold 25px/34px Arial,sans-serif;text-align:center;text-shadow:-2px -2px #101b1f,2px -2px #101b1f,-2px 2px #101b1f,2px 2px #101b1f}
.cs-wallet{position:absolute;left:529px;top:348px;width:229px;min-height:108px;padding:12px 10px;text-align:right;color:#fff;font:17px/1.6 Arial,sans-serif;border:2px solid #d7f7ff;outline:1px solid #244142;border-radius:10px 10px 8px 8px;background:linear-gradient(#63dffa,#41cbea 25%,#3fc4e1 45%,#a8ffff 47%,#30aac3 50%,#3cc3df 58%,#068da8 86%,#157b8c);box-shadow:inset 0 0 0 1px #2e7078,inset 0 2px 5px #fff8}
.cs-wallet strong{display:block;margin-top:12px;font-size:12px;font-weight:400}.cs-head .close{position:absolute;left:471px;top:0;pointer-events:auto;min-width:30px;padding:0;font-size:21px}
.cs-btn{min-height:29px;padding:4px 10px;border:1px solid #0c797e;border-radius:12px;background:linear-gradient(#91f5ff,#36c9e8 26%,#37c5e5 65%,#00a0bb);box-shadow:inset 0 2px 5px #fff8,inset 0 -2px 4px #006d7d,0 1px 1px #021f2b;color:#fff;font-weight:700!important;text-shadow:1px 1px #28636b}
.cs-btn:hover{filter:brightness(1.15)}.cs-btn:active{filter:brightness(.85)}.cs-btn.primary{color:#fff}.cs-body{display:flex;flex-direction:column;flex:1;min-height:0;padding:10px 9px 0;gap:8px}
.cs-nav{display:flex;gap:5px;flex:none;min-height:31px}.cs-nav .cs-btn{flex:1;padding:4px 5px;min-width:0;font-size:12px}.cs-nav .active{outline:2px solid #fff89b;outline-offset:0}.cs-nav hr{display:none}
.cs-main{flex:1;min-height:0;display:flex;flex-direction:column;gap:7px}.cs-tools{display:flex;align-items:center;gap:5px}.cs-tools input,.cs-tools select,.cs-trade input,.cs-trade select,.cs-appearance select{min-height:25px;padding:3px 5px;border:1px solid #7b878a;border-radius:0;background:#f0f5f4;box-shadow:inset 1px 1px #bac3c3;color:#182127;font-size:12px}.cs-tools input{min-width:65px;flex:1}.cs-tools select{max-width:150px}
.cs-content{min-height:0;overflow:auto;flex:1;padding:2px 4px 6px 1px;scrollbar-color:#a0b8bd #e2e9e7;scrollbar-width:thin}.cs-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
.cs-tile{position:relative;display:flex;flex-direction:column;min-width:0;padding:5px 4px;gap:4px;border:1px solid #9ba4a8;background:linear-gradient(#f4f7f27a,#ccd4d4a0);box-shadow:inset 1px 1px #fff,inset -1px -1px #a2abaa}
.cs-tile h3{font-size:12px;line-height:1.25;margin:0;min-height:30px;text-align:center}.cs-picture{height:94px;position:relative;display:grid;place-items:center;overflow:hidden}.cs-picture img{max-width:100%;max-height:100%;object-fit:contain}.cs-picture svg{width:65px;height:65px;stroke:#34717c;stroke-width:1.2;fill:#e8f8f8;filter:drop-shadow(1px 2px 1px #537c85)}
.cs-meta{font-size:10px;line-height:1.35;color:#243b43}.cs-bottom{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-top:auto;flex-wrap:wrap}.cs-bottom input{width:32px;font-size:12px}.cs-price{display:block;font-weight:700;font-size:12px}.cs-bottom .cs-btn{padding:3px 8px;min-height:25px;font-size:12px}
.cs-rarity{font-size:10px;font-weight:bold;color:#45575d;text-transform:uppercase}.cs-rarity[data-rarity=rare]{color:#166d8e}.cs-rarity[data-rarity=super]{color:#734b94}.cs-rarity[data-rarity=ultra]{color:#8d630a}.cs-owned{font-weight:bold;color:#266338}.disabled-reason{font-size:10px;color:#713a24}
.cs-boxes{display:grid;grid-template-columns:1fr;gap:9px}.cs-boxes .cs-tile{display:grid;grid-template-columns:70px 1fr;column-gap:9px;padding:7px;gap:3px 9px}.cs-boxes .cs-picture{grid-column:1;grid-row:1 / span 5;height:104px;align-self:center}.cs-boxes h3{min-height:0;font-size:16px;text-align:left}.cs-boxes p{margin:0;font-size:11px;line-height:1.4}.cs-boxes .cs-pity,.cs-boxes .cs-bottom,.cs-boxes .disabled-reason{grid-column:2}
.cs-pity{font-size:11px;line-height:1.4;margin:4px 0}.cs-pity progress{width:100%;height:6px;accent-color:#369bad}.cs-boxes .cs-pity progress{display:none}.cs-boxes .cs-pity{margin:0}.cs-boxes .cs-picture{height:84px}.cs-pool-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}.cs-pool-head h3{font-size:15px;margin:0}.cs-odds{display:flex;flex-wrap:wrap;gap:4px 10px;padding:6px;margin-bottom:6px;background:#fff8;border:1px solid #a9b6b8;font-size:11px}
.cs-status,.cs-note{font-size:11px;line-height:1.4;margin:0;color:#253e46}.cs-status.error{color:#8d2925;padding:5px;background:#fff4e9;border:1px solid #bc9691}.cs-status.notice{color:#24663b}.cs-empty{padding:18px 7px;text-align:center;font-size:12px;line-height:1.5}
.cs-footer{display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:34px;padding:4px 9px 7px;font-size:10px}.cs-footer>.cs-actions{gap:5px}.cs-footer>.cs-actions>.cs-btn:last-child{position:absolute;left:515px;top:456px;width:210px;height:42px;font-size:17px}.cs-footer>.cs-actions>.cs-btn:first-child{font-size:11px;min-height:24px;padding:3px 8px}
.cs-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px}.cs-confirm{background:#f1f4e9;border:3px solid #f9fffa;box-shadow:inset 1px 1px #9faaaa,1px 1px #697d80;padding:14px;font-size:13px;line-height:1.5}.cs-confirm .cs-actions{margin-top:12px}
.cs-reveal{position:absolute;inset:0;display:grid;place-items:center;pointer-events:auto;background:transparent;z-index:5}.cs-reveal-card{width:330px;padding:20px;background:rgba(232,239,234,.97);border:4px solid #fafff8;box-shadow:inset 2px 2px #a3b5b6,1px 1px #657779;text-align:center}.cs-reveal-card h3{font-size:20px}.cs-reveal-card .cs-picture{height:170px}.cs-reveal-card .cs-actions{justify-content:center}.cs-reveal-card p{font-size:13px;line-height:1.5}
.cs-appearance{font-size:12px;margin-bottom:9px}.cs-appearance .cs-tools{margin:8px 0;flex-wrap:wrap}.cs-appearance-fields{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin:8px 0}.cs-appearance-fields label{font-size:11px}.cs-appearance-fields select{display:block;width:100%;margin-top:3px}.cs-appearance details summary,.cs-panel details summary{cursor:pointer;font-size:12px;font-weight:bold}.cs-trade{font-size:12px;border-bottom:1px solid #99a9ac;padding:0 0 10px;margin-bottom:8px}.cs-trade label{display:block;margin:7px 0 3px}.cs-trade select,.cs-trade input{width:100%}.cs-trade h3,.cs-offer h3{font-size:14px;margin:5px 0}.cs-offer{border-bottom:1px solid #a5b6b8;padding:7px 0}.cs-offer p{font-size:12px}
.yo2-cosmetics[data-shop=false] .cs-panel{left:256px;top:92px;width:512px;height:570px}.yo2-cosmetics[data-shop=false] .cs-wallet{display:none}.yo2-cosmetics[data-shop=false] .cs-footer>.cs-actions>.cs-btn:last-child{position:static;width:auto;height:29px;font-size:13px}.yo2-cosmetics[data-shop=false] .cs-head .close{left:auto;right:4px}.yo2-cosmetics[data-shop=false] .cs-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
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
  const controller = cosmeticShopController({ request, canPurchase: () => modern && snapshot?.scene === 14, changed: () => render() });
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
  const open = async (next = 'wardrobe') => {
    if (!enabled || blocked || (snapshot?.scene === 14 && !modern) || (snapshot?.scene !== 14 && !['wardrobe', 'trades'].includes(next))) return false;
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
    if (snapshot?.scene !== 14 && !['wardrobe', 'trades'].includes(next)) return;
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
      card.append(element('p', '', `One ${box.id === 'outfit' ? 'outfit' : box.id === 'dueldisk' ? 'duel disk' : 'hairstyle'}. Extra copies can be traded.`));
      const eligibility = boxEligibility(box); if (eligibility) card.append(element('p', 'cs-note', box.id === 'outfit' ? 'Primarily Domino City outfits. Check rewards for wear locations.' : 'Wear locations vary. Check the reward list.'));
      const pity = element('div', 'cs-pity');
      const untilSuper = Math.max(1, Number(box.pity?.superAt || 10) - Number(box.pity?.superMisses || 0));
      pity.append(element('div', '', `Super Rare+ within ${untilSuper} ${untilSuper === 1 ? 'opening' : 'openings'}`));
      const progress = element('progress'); progress.max = box.pity?.superAt || 10; progress.value = box.pity?.superMisses || 0; progress.setAttribute('aria-label', 'Super Rare guarantee progress'); pity.append(progress);
      if (box.pity?.ultraAt) { const left = Math.max(1, box.pity.ultraAt - (box.pity.ultraMisses || 0)); pity.append(element('div', '', `Ultra Rare within ${left} ${left === 1 ? 'opening' : 'openings'}`)); }
      card.append(pity);
      const details = button('Rewards & odds', () => { selectedBox = box.id; render(); });
      const line = element('div', 'cs-bottom'); line.append(element('span', 'cs-price', `${fmt(box.price)} MP`));
      const recovering = controller.hasPendingOpen(box.id);
      const buy = button(controller.state.busy ? 'Opening…' : recovering ? 'Recover result' : 'Open box', () => { if (recovering) void controller.open(box.id); else { confirming = { box }; render(); } }, 'primary');
      buy.dataset.focus = 'open-' + box.id; buy.disabled = controller.state.busy || controller.state.loading || state.available === false || box.available === false || (!recovering && (state.wallet?.earned || 0) < box.price); line.append(details, buy); card.append(line);
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
    root.replaceChildren(); root.dataset.shop = String(snapshot?.scene === 14);
    root.hidden = !enabled || blocked || !visible;
    if (root.hidden) return;
    const shade = element('div', 'cs-shade'), panel = element('section', 'cs-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', TITLES[tab]);
    const header = element('header', 'cs-head'); header.append(element('h2', '', selectedBox ? BOX_NAMES[selectedBox] : TITLES[tab]));
    const funds = element('div', 'cs-wallet'), w = wallet(); funds.append(element('div', '', `${fmt(w.total)} MP`), element('strong', '', `Earned ${fmt(w.earned)} · Starter ${fmt(w.bound)}`)); header.append(funds);
    const exit = button('×', close, 'close'); exit.setAttribute('aria-label', 'Close shop'); exit.disabled = controller.state.busy || controller.state.loading; if (snapshot?.scene !== 14) header.append(exit); panel.append(header);
    const body = element('div', 'cs-body'), nav = element('nav', 'cs-nav'); nav.setAttribute('aria-label', 'Shop categories');
    const shopTabs = snapshot?.scene === 14 ? [['packs', 'Packs & Decks'], ['singles', 'Single Cards'], ['boxes', 'Cosmetic Boxes'], ['accessories', 'Accessories']] : [['wardrobe', 'Appearance'], ['trades', 'Cosmetic Trading']];
    for (const [id, title] of shopTabs) { const b = button(title, () => switchTab(id), tab === id ? 'active' : ''); b.setAttribute('aria-pressed', String(tab === id)); b.dataset.focus = 'nav-' + id; nav.append(b); }
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
    const footer = element('footer', 'cs-footer'); footer.append(element('span', '', controller.state.loading ? 'Refreshing…' : tab === 'boxes' ? 'Earned MP only · every box gives one cosmetic' : tab === 'wardrobe' ? 'Choose an owned item to equip.' : 'Select an item. Scroll to browse.'));
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
    else if (!root.contains(document.activeElement)) (root.querySelector('.cs-reveal button') || root.querySelector('.cs-nav button') || exit).focus({ preventScroll: true });
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
      // Legacy shop is entirely native: no replacement skin or layout.
      if (snap.scene === 14 && !modern) {
        if (visible) { visible = false; confirming = null; controller.reset(); clearTimeout(poll); onVisibility(false); }
        document.documentElement.classList.remove('yo2-cosmetics-open');
        root.hidden = true; shopEntryPending = true;
        return;
      }
      const nextEnabled = SAFE_SCENES.has(snap.scene);
      if (enabled && !nextEnabled) { controller.reset(); close(); }
      if (visible && snap.scene !== 14 && !['wardrobe', 'trades'].includes(tab)) { controller.reset(); close(); }
      enabled = nextEnabled;
      // The first shop frame usually arrives under the scene loader. Open only
      // after it clears; otherwise open() refuses once and the shop never appears.
      if (snap.scene !== 14) shopEntryPending = true;
      if (enabled && snap.scene === 14 && !blocked && shopEntryPending) {
        shopEntryPending = false; void open('packs');
      }
      const key = [snap.scene, modern, blocked, enabled, visible].join('|');
      if (key !== renderKey) { renderKey = key; render(); }
    },
    destroy() { disposed = true; clearTimeout(poll); observer.disconnect(); imageObserver?.disconnect(); removeEventListener('resize', place); removeEventListener('yo2-cosmetics-open', launch); document.documentElement.classList.remove('yo2-cosmetics-open'); root.remove(); style.remove(); controller.reset(); },
  };
}
