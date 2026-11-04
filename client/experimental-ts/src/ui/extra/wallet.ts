import type { ShopItem, ShopView } from '../contracts';
import type { CosmeticsState } from '../../features/online';

/** The shop's departments, named as the original shop's categories. */
export const SHOP_DEPARTMENTS: Readonly<Record<string, string>> = { packs: 'Booster Packs', decks: 'Structure Decks', singles: 'Single Cards', accessories: 'Accessories', 'cosmetic-boxes': 'Cosmetic Boxes', wardrobe: 'Wardrobe' };
/** The wallet plate: total MP with its starter (soul-bound) and earned parts, and what each can buy (htmlui bound-wallet.js). */
export function renderWallet(shop: Pick<ShopView, 'mp' | 'earnedMp'>): HTMLElement {
  const root = document.createElement('details'); root.className = 'de-wallet'; root.dataset.key = 'shop-wallet';
  const summary = document.createElement('summary'), fmt = (n: number) => n.toLocaleString('en-US');
  const earned = shop.earnedMp, bound = earned === undefined ? undefined : Math.max(0, shop.mp - earned);
  summary.textContent = `${fmt(shop.mp)} MP${bound !== undefined ? ` · ${fmt(bound)} starter · ${fmt(earned!)} earned` : ''}`;
  summary.setAttribute('aria-label', `Wallet: ${summary.textContent}. MP info`);
  const help = document.createElement('p'); help.className = 'de-note';
  help.textContent = 'Starter MP is spent first. Any card, pack or deck paid partly with starter MP gives soul-bound cards that cannot be traded. Cards bought entirely with earned MP can be traded. Cosmetic boxes take earned MP only.';
  root.append(summary, help); return root;
}
export const WALLET_CSS = `
.de-wallet { font-weight:bold; color:#123f70; max-width:60%; text-align:right; }
.de-wallet summary { cursor:pointer; list-style:none; padding:3px 10px; border:1px solid #277ab7; border-radius:10px; background:linear-gradient(#f5ffff,#b5eaff 48%,#75c4ed); }
.de-wallet summary::-webkit-details-marker { display:none; }
.de-wallet[open] p { position:absolute; right:24px; z-index:5; width:300px; margin:4px 0 0; padding:10px; text-align:left; font-weight:normal; background:#ecfcff; border:2px solid #82ddf5; outline:1px solid #216eb0; }
`;
/** An accessory is an avatar part: named after the wardrobe design it belongs to, with its body type. */
export function accessoryName(item: ShopItem, cosmetics: CosmeticsState | null): string {
  if (item.avatarBit === undefined) return item.name;
  for (const c of cosmetics?.catalog ?? []) { const v = c.variants.find(v => v.bit === item.avatarBit); if (v) return `${v.name ?? c.name} (${v.gender === 'male' ? 'male' : 'female'})`; }
  return item.name;
}
