import type { ShopItem } from '../contracts';
import type { CosmeticsState } from '../../features/online';

/** An accessory is an avatar part: named after the wardrobe design it belongs to, with its body type. */
export function accessoryName(item: ShopItem, cosmetics: CosmeticsState | null): string {
  if (item.avatarBit === undefined) return item.name;
  for (const c of cosmetics?.catalog ?? []) { const v = c.variants.find(v => v.bit === item.avatarBit); if (v) return `${v.name ?? c.name} (${v.gender === 'male' ? 'male' : 'female'})`; }
  return item.name;
}
